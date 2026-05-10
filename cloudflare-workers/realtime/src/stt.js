// STT provider — Gemini Live API streaming client.
//
// Gemini Live is a bidirectional WebSocket. The client (this Worker)
// opens a WS to:
//   wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=<API_KEY>
//
// Then sends a setup message, followed by realtime input audio bytes.
// Server emits server_content events with input_transcription parts
// for live transcription.
//
// We expose openGeminiLive() which returns:
//   { sendAudio(Uint8Array): Promise<void>, close(): Promise<void> }
//
// onTranscriptDelta / onTranscriptCommitted callbacks are invoked as
// transcript events arrive. We treat each input_transcription chunk as
// a delta until we see a turn_complete signal, at which point we mark
// it committed.

const GEMINI_LIVE_URL =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

export async function openGeminiLive({
  env,
  sampleRate = 16000,
  language = 'en-IN',
  onTranscriptDelta,
  onTranscriptCommitted,
  onError,
}) {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');
  const model  = env.GEMINI_LIVE_MODEL || 'gemini-live-2.5-flash';

  // Cloudflare Workers can open outgoing WebSocket connections via
  // `new WebSocket()` since Q4 2024. Older guidance suggested the
  // `fetch` upgrade route; the constructor is now the official path.
  const upstream = new WebSocket(`${GEMINI_LIVE_URL}?key=${encodeURIComponent(apiKey)}`);

  let resolveOpen, rejectOpen;
  const opened = new Promise((res, rej) => { resolveOpen = res; rejectOpen = rej; });

  let currentTurnId = null;
  let currentTurnText = '';
  let transcriptCounter = 0;

  upstream.addEventListener('open', () => {
    // Setup message — minimal config focused on input transcription
    const setup = {
      setup: {
        model: `models/${model}`,
        generation_config: {
          // Audio output not used; we only want transcripts back.
          response_modalities: ['TEXT'],
          temperature: 0.1,
        },
        // Critical: enable inline transcription of the user's audio
        input_audio_transcription: {},
        // Speaker diarization (when supported by the model)
        // speaker_diarization: { enabled: true },
        system_instruction: {
          parts: [{
            text: `You are a passive transcription service. Transcribe the audio verbatim, preserving original language (English, Manglish, Malayalam, Hindi). Do not respond, comment, or summarize. Output only what was said.`
          }],
        },
        realtime_input_config: {
          // Default activity detection works for clinical conversation
          automatic_activity_detection: { disabled: false },
        },
      },
    };
    try {
      upstream.send(JSON.stringify(setup));
    } catch (err) {
      rejectOpen(err);
    }
  });

  upstream.addEventListener('message', (evt) => {
    let data;
    try {
      const raw = typeof evt.data === 'string' ? evt.data : new TextDecoder().decode(evt.data);
      data = JSON.parse(raw);
    } catch { return; }

    // Setup acknowledgement
    if (data.setupComplete !== undefined || data.setup_complete !== undefined) {
      resolveOpen();
      return;
    }

    // Transcription deltas arrive in serverContent.inputTranscription.text
    const sc = data.serverContent || data.server_content;
    if (sc) {
      const inputTranscription = sc.inputTranscription || sc.input_transcription;
      if (inputTranscription?.text) {
        if (!currentTurnId) {
          currentTurnId = `t-${++transcriptCounter}`;
          currentTurnText = '';
        }
        currentTurnText += inputTranscription.text;
        try {
          onTranscriptDelta?.({
            id: currentTurnId,
            text: currentTurnText,
            speaker: 'unknown',  // Gemini Live doesn't yet expose diarization in IT
            t_start: null, t_end: Date.now(),
          });
        } catch (err) {
          console.error('[stt] onTranscriptDelta threw', err);
        }
      }

      // Turn complete → commit and reset
      if (sc.turnComplete || sc.turn_complete) {
        if (currentTurnId && currentTurnText) {
          try {
            onTranscriptCommitted?.({
              id: currentTurnId,
              text: currentTurnText,
              speaker: 'unknown',
              t_start: null, t_end: Date.now(),
            });
          } catch (err) {
            console.error('[stt] onTranscriptCommitted threw', err);
          }
        }
        currentTurnId = null;
        currentTurnText = '';
      }
    }

    // Error envelope — Gemini Live sometimes returns errors as { error: {...} }
    if (data.error) {
      const e = new Error(data.error.message || 'gemini_live_error');
      e.code = data.error.code;
      onError?.(e);
    }
  });

  upstream.addEventListener('error', (err) => {
    rejectOpen(err);
    onError?.(err?.error || new Error('gemini_live_socket_error'));
  });

  upstream.addEventListener('close', () => {
    if (currentTurnId && currentTurnText) {
      try {
        onTranscriptCommitted?.({
          id: currentTurnId,
          text: currentTurnText,
          speaker: 'unknown',
          t_start: null, t_end: Date.now(),
        });
      } catch { /* ignore */ }
    }
  });

  // Wait for setup_complete before letting the caller send audio
  await opened;

  return {
    async sendAudio(bytes) {
      if (upstream.readyState !== WebSocket.OPEN) {
        throw new Error('upstream_not_open');
      }
      const b64 = bytesToBase64(bytes);
      const msg = {
        realtime_input: {
          media_chunks: [
            {
              mime_type: `audio/pcm;rate=${sampleRate}`,
              data: b64,
            },
          ],
        },
      };
      upstream.send(JSON.stringify(msg));
    },
    async close() {
      try { upstream.close(1000, 'session.closed'); } catch { /* ignore */ }
    },
  };
}

function bytesToBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
