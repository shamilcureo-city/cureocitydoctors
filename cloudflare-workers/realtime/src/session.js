// SessionDO — Durable Object for one live consultation.
//
// Holds the WebSocket pair (client ↔ Worker) and the upstream Gemini
// Live connection (Worker ↔ Google). Buffers the last 30 seconds of
// audio so a brief client reconnect does not lose context.
//
// Lifecycle:
//   1. Client opens WS to Worker; Worker forwards upgrade to this DO.
//   2. DO accepts the WebSocket, awaits a `session.start` message.
//   3. On start: opens Gemini Live upstream, begins forwarding.
//   4. On audio.chunk: forwards bytes upstream; logs to Supabase
//      occasionally for cost telemetry.
//   5. On Gemini transcript: forwards delta to client; persists
//      committed transcript to consultation_events; runs deterministic
//      red-flag matcher; emits `red_flag.detected` if matched.
//   6. On session.commit / disconnect: closes upstream, finalizes,
//      reports session metadata.

import { validateClientEvent } from './protocol.js';
import { openGeminiLive } from './stt.js';
import { persistTranscriptEvent, persistAiCall } from './persist.js';
import { loadRedFlagPhrases, matchRedFlags } from './redFlags.js';

const PROTOCOL_VERSION = '0.1.0';

// 30s buffer @ 16kHz mono PCM16 = 30 * 16000 * 2 = 960KB
const AUDIO_BUFFER_MAX_BYTES = 960_000;

export class SessionDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;

    // Set in initFromUpgrade().
    this.consultationId = null;
    this.doctorId = null;
    this.orgId = null;

    // Set on session.start.
    this.clientSocket = null;
    this.upstream = null;          // Gemini Live wrapper
    this.startedAt = 0;
    this.audioBytesIn = 0;
    this.transcriptCommittedChars = 0;
    this.redFlagPhrases = [];      // loaded once per session
    this.audioBuffer = [];         // last 30s, dropped on commit
    this.audioBufferBytes = 0;
    this.priorTranscriptTail = ''; // for context; last ~30s
  }

  async fetch(req) {
    if (req.headers.get('upgrade') !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }

    this.consultationId = req.headers.get('x-cureocity-consultation-id');
    this.doctorId       = req.headers.get('x-cureocity-user-id');
    this.orgId          = req.headers.get('x-cureocity-org-id');

    const pair = new WebSocketPair();
    const [clientSide, serverSide] = Object.values(pair);
    serverSide.accept();
    this.clientSocket = serverSide;

    serverSide.addEventListener('message', (evt) => this.onClientMessage(evt));
    serverSide.addEventListener('close',   ()    => this.onClientClose());
    serverSide.addEventListener('error',   (err) => this.onClientError(err));

    return new Response(null, { status: 101, webSocket: clientSide });
  }

  send(obj) {
    try {
      if (this.clientSocket && this.clientSocket.readyState === 1 /* OPEN */) {
        this.clientSocket.send(JSON.stringify(obj));
      }
    } catch (err) {
      console.error('[session] failed to send to client', err);
    }
  }

  async onClientMessage(evt) {
    let msg;
    try { msg = JSON.parse(typeof evt.data === 'string' ? evt.data : new TextDecoder().decode(evt.data)); }
    catch { return this.send({ type: 'error', message: 'invalid_json' }); }

    const v = validateClientEvent(msg);
    if (!v.ok) return this.send({ type: 'error', message: v.reason });

    switch (msg.type) {
      case 'session.start':  return this.handleStart(msg);
      case 'audio.chunk':    return this.handleAudioChunk(msg);
      case 'session.commit': return this.handleCommit('client_commit');
      case 'session.cancel': return this.handleCommit('client_cancel');
    }
  }

  async handleStart(msg) {
    if (this.upstream) {
      return this.send({ type: 'error', message: 'already_started' });
    }
    this.startedAt = Date.now();

    try {
      this.redFlagPhrases = await loadRedFlagPhrases(this.env);
    } catch (err) {
      // Non-fatal; session continues without deterministic red-flag matching
      console.error('[session] red-flag load failed', err);
      this.redFlagPhrases = [];
    }

    try {
      this.upstream = await openGeminiLive({
        env: this.env,
        sampleRate: msg.audio.sampleRate,
        encoding: msg.audio.encoding || 'pcm16le',
        language: msg.audio.language || 'en-IN',
        onTranscriptDelta: (d) => this.onUpstreamDelta(d),
        onTranscriptCommitted: (d) => this.onUpstreamCommitted(d),
        onError: (err) => this.send({ type: 'error', message: err?.message || 'stt_error', code: 'stt' }),
      });
    } catch (err) {
      return this.send({ type: 'error', message: err?.message || 'stt_open_failed', code: 'stt_open' });
    }

    this.send({ type: 'session.ready', protocol: PROTOCOL_VERSION });
  }

  async handleAudioChunk(msg) {
    if (!this.upstream) {
      return this.send({ type: 'error', message: 'session_not_started' });
    }

    let bytes;
    try {
      bytes = decodeBase64(msg.b64);
    } catch {
      return this.send({ type: 'error', message: 'invalid_audio_b64' });
    }

    this.audioBytesIn += bytes.byteLength;
    this.bufferAudio(bytes);

    try {
      await this.upstream.sendAudio(bytes);
    } catch (err) {
      this.send({ type: 'error', message: err?.message || 'stt_send_failed', code: 'stt_send' });
    }
  }

  bufferAudio(bytes) {
    this.audioBuffer.push(bytes);
    this.audioBufferBytes += bytes.byteLength;
    while (this.audioBufferBytes > AUDIO_BUFFER_MAX_BYTES && this.audioBuffer.length > 1) {
      const dropped = this.audioBuffer.shift();
      this.audioBufferBytes -= dropped.byteLength;
    }
  }

  onUpstreamDelta({ id, text, speaker, t_start, t_end }) {
    this.send({
      type: 'transcript.delta',
      id, text, speaker, t_start, t_end,
    });
    this.checkRedFlags(text);
  }

  async onUpstreamCommitted({ id, text, speaker, t_start, t_end }) {
    this.transcriptCommittedChars += (text || '').length;
    this.priorTranscriptTail = (this.priorTranscriptTail + ' ' + text).slice(-4000);

    this.send({
      type: 'transcript.committed',
      id, text, speaker, t_start, t_end,
    });

    this.checkRedFlags(text);

    // Persist asynchronously; do not block the live stream
    this.state.waitUntil(
      persistTranscriptEvent(this.env, {
        consultationId: this.consultationId,
        speaker, text, t_start, t_end,
      }).catch(err => console.error('[session] persist failed', err))
    );
  }

  checkRedFlags(text) {
    if (!text || this.redFlagPhrases.length === 0) return;
    const matches = matchRedFlags(text, this.redFlagPhrases);
    for (const m of matches) {
      this.send({
        type: 'red_flag.detected',
        phrase: m.phrase,
        severity: m.severity,
        category: m.category,
        recommended_action: m.recommended_action,
      });
      // Persist red-flag event
      this.state.waitUntil(
        persistTranscriptEvent(this.env, {
          consultationId: this.consultationId,
          eventType: 'agent.red_flag',
          payload: m,
        }).catch(err => console.error('[session] redflag persist failed', err))
      );
    }
  }

  async handleCommit(reason) {
    const sessionMs = Date.now() - this.startedAt;
    const audioSeconds = Math.round(sessionMs / 1000);
    if (this.upstream) {
      try { await this.upstream.close(); } catch { /* ignore */ }
      this.upstream = null;
    }

    // Estimate STT cost (Gemini Live: $0.10 per M audio input tokens;
    // ~32 audio tokens/s → 192 tokens / 6s ≈ ₹0.0027 / 6s).
    // This is a coarse estimate; reconcile against billing periodically.
    const audioTokensApprox = audioSeconds * 32;
    const costInr = (audioTokensApprox / 1e6) * 8.40;  // ₹/M audio input

    this.state.waitUntil(
      persistAiCall(this.env, {
        consultationId: this.consultationId,
        doctorId: this.doctorId,
        orgId: this.orgId,
        provider: 'gemini',
        model: this.env.GEMINI_LIVE_MODEL,
        tokensIn: audioTokensApprox,
        tokensOut: 0,
        costInr,
        latencyMs: sessionMs,
      }).catch(err => console.error('[session] aicall persist failed', err))
    );

    this.send({
      type: 'session.closed',
      _meta: {
        protocol: PROTOCOL_VERSION,
        reason,
        session_ms: sessionMs,
        audio_bytes_in: this.audioBytesIn,
        transcript_chars: this.transcriptCommittedChars,
        cost_inr: Number(costInr.toFixed(4)),
      },
    });

    // Clean up client socket
    try { this.clientSocket?.close(1000, 'session.closed'); } catch { /* ignore */ }
  }

  onClientClose() {
    if (this.upstream) {
      this.handleCommit('client_disconnect').catch(() => {});
    }
  }

  onClientError(err) {
    console.error('[session] client socket error', err);
    if (this.upstream) {
      this.handleCommit('client_error').catch(() => {});
    }
  }
}

// ─── helpers ────────────────────────────────────────────────────────
function decodeBase64(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
