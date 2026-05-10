// Vercel Node.js function — Realtime live-consult session bridge.
//
// Sprint 0/1 scaffold for the Gemini Live WebSocket bridge.
//
// IMPORTANT — DEPLOYMENT NOTE:
// Vercel's Node serverless runtime does NOT support long-lived
// WebSocket upgrades (functions have a hard 60s ceiling and no
// `socket.upgrade` API). Two production options:
//
//   A) Deploy this handler to Cloudflare Workers + Durable Objects
//      (rewrite using Cloudflare's WebSocket API). Recommended.
//   B) Run a separate Node.js process on Fly.io / Render / Railway
//      using `ws` and have the SPA point to it via an env var.
//
// This file documents the contract and provides a Node `ws`-style
// reference implementation that runs verbatim in option B and serves
// as the spec for option A.
//
// PROTOCOL (client ↔ server):
//
//   Client → Server:
//     { type: 'session.start',  consultationId, doctorId, orgId,
//       audio: { sampleRate, encoding, language } }
//     { type: 'audio.chunk',    sequence, b64 }       // PCM16 or Opus
//     { type: 'session.commit' }                       // signal end of consult
//
//   Server → Client:
//     { type: 'session.ready' }
//     { type: 'transcript.delta', sequence, text, speaker, t_start, t_end }
//     { type: 'transcript.committed', text, speaker, t_start, t_end }
//     { type: 'red_flag.detected', phrase, severity, category }
//     { type: 'budget.warning', spend_inr, cap_inr }
//     { type: 'error', message, code? }
//     { type: 'session.closed', _meta }
//
// The transcript is also persisted to consultation_events (event_type:
// 'transcript.chunk') by the server in real time. The agent endpoint
// /api/agent/turn reads from that log to stay in sync.

// import { GoogleGenerativeAI } from '@google/generative-ai';
// ↑ wired in Sprint 1 when openGeminiLive() is implemented
import { createClient } from '@supabase/supabase-js';

// ─── Sprint 0 marker: this code path is not yet exercised on Vercel.
// The real WebSocket implementation lives in a sibling Node.js process
// (see deployment note above). This file exports the pure protocol
// helpers so unit tests can run and the agent can be developed against
// the same contract.

export const PROTOCOL_VERSION = '0.1.0';

export const CLIENT_EVENT_TYPES = [
  'session.start',
  'audio.chunk',
  'session.commit',
  'session.cancel',
];

export const SERVER_EVENT_TYPES = [
  'session.ready',
  'transcript.delta',
  'transcript.committed',
  'red_flag.detected',
  'budget.warning',
  'error',
  'session.closed',
];

// Validate an incoming client event shape. Pure function for testability.
export function validateClientEvent(evt) {
  if (!evt || typeof evt !== 'object') return { ok: false, reason: 'not_object' };
  if (!CLIENT_EVENT_TYPES.includes(evt.type)) return { ok: false, reason: `unknown_type:${evt.type}` };
  switch (evt.type) {
    case 'session.start':
      if (!evt.consultationId) return { ok: false, reason: 'consultationId_required' };
      if (!evt.audio?.sampleRate) return { ok: false, reason: 'audio.sampleRate_required' };
      return { ok: true };
    case 'audio.chunk':
      if (typeof evt.sequence !== 'number') return { ok: false, reason: 'sequence_required' };
      if (typeof evt.b64 !== 'string' || !evt.b64) return { ok: false, reason: 'b64_required' };
      if (evt.b64.length > 2 * 1024 * 1024) return { ok: false, reason: 'chunk_too_large' };
      return { ok: true };
    case 'session.commit':
    case 'session.cancel':
      return { ok: true };
    default:
      return { ok: false, reason: 'unhandled' };
  }
}

// ─── Reference Node implementation (run on Fly.io / Render). ─────────
//
// Pseudocode-level (real implementation lives in a separate package
// during Sprint 1 spike). Documented here so the contract is in one place.
//
// Usage:
//   import { WebSocketServer } from 'ws';
//   const wss = new WebSocketServer({ port: 8787 });
//   wss.on('connection', ws => attachSession(ws));
//
// The attachSession helper:
//   1. Authenticates Supabase JWT from the connection upgrade headers
//   2. On session.start, opens a Gemini Live API streaming connection
//   3. Pipes incoming audio.chunk → Gemini
//   4. Pipes Gemini transcript.delta → client + persists to consultation_events
//   5. Detects red flags via regex against red_flag_phrases table
//   6. Logs cost to ai_calls (per-minute STT pricing)
//   7. Closes Gemini stream on session.commit/cancel/socket close

export async function attachSession(ws, { authHeader }) {
  const auth = await authenticateJwt(authHeader);
  if (!auth.ok) {
    ws.send(JSON.stringify({ type: 'error', message: 'unauthorized', code: 'auth' }));
    ws.close(1008, 'unauthorized');
    return;
  }

  const state = {
    doctorId: auth.userId,
    consultationId: null,
    orgId: null,
    geminiStream: null,
    sequenceCommitted: -1,
    startedAt: 0,
    audioMs: 0,
    sttCostInr: 0,
  };

  ws.on('message', async (raw) => {
    let evt;
    try { evt = JSON.parse(raw.toString()); }
    catch { return ws.send(JSON.stringify({ type: 'error', message: 'invalid_json' })); }

    const v = validateClientEvent(evt);
    if (!v.ok) return ws.send(JSON.stringify({ type: 'error', message: v.reason }));

    if (evt.type === 'session.start') {
      state.consultationId = evt.consultationId;
      state.orgId = evt.orgId;
      state.startedAt = Date.now();
      try {
        state.geminiStream = await openGeminiLive({
          language: evt.audio.language || 'en-IN',
          sampleRate: evt.audio.sampleRate,
          onTranscript: ({ text, speaker, t_start, t_end, sequence }) => {
            ws.send(JSON.stringify({
              type: 'transcript.delta',
              sequence, text, speaker, t_start, t_end,
            }));
            persistTranscript(state.consultationId, { text, speaker, t_start, t_end });
            checkRedFlags(text, ws);
          },
          onError: (err) => {
            ws.send(JSON.stringify({ type: 'error', message: err.message, code: 'stt' }));
          },
        });
        ws.send(JSON.stringify({ type: 'session.ready', protocol: PROTOCOL_VERSION }));
      } catch (err) {
        ws.send(JSON.stringify({ type: 'error', message: err.message, code: 'stt_open' }));
      }
      return;
    }

    if (evt.type === 'audio.chunk') {
      if (!state.geminiStream) return;
      try {
        await state.geminiStream.send(Buffer.from(evt.b64, 'base64'));
        state.audioMs += estimateChunkMs(evt.b64);
      } catch (err) {
        ws.send(JSON.stringify({ type: 'error', message: err.message, code: 'stt_send' }));
      }
      return;
    }

    if (evt.type === 'session.commit' || evt.type === 'session.cancel') {
      await closeSession(state, ws);
      return;
    }
  });

  ws.on('close', () => closeSession(state, ws));
}

// ─── Stubs (fleshed out in Sprint 1) ────────────────────────────────
async function authenticateJwt(authHeader) {
  // Verify Supabase JWT using SUPABASE_JWT_SECRET; return { ok, userId }.
  // Sprint 1 deliverable.
  const url = process.env.SUPABASE_URL;
  const anon = process.env.SUPABASE_ANON_KEY;
  if (!url || !anon || !authHeader?.startsWith('Bearer ')) return { ok: false };
  const token = authHeader.slice(7);
  try {
    const sb = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data } = await sb.auth.getUser();
    if (data?.user) return { ok: true, userId: data.user.id };
  } catch { /* fall through */ }
  return { ok: false };
}

async function openGeminiLive(_opts) {
  // Sprint 1 task: open `gemini-live-2.5-flash` bidi stream and return
  // an object with .send(audioBytes) and .close().
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY missing');
  // Placeholder — the actual Gemini Live SDK call goes here in Sprint 1.
  return {
    send: async () => {},
    close: async () => {},
  };
}

async function persistTranscript(_consultationId, _payload) {
  // Sprint 1 task: insert into consultation_events with event_type
  // 'transcript.chunk' via Supabase service role.
}

async function checkRedFlags(_text, _ws) {
  // Sprint 1 task: deterministic regex match against red_flag_phrases.
  // Emit { type: 'red_flag.detected' } when matched.
}

function estimateChunkMs(_b64) {
  // ~750KB base64 / ~93KB raw = ~8s at 16kHz mono PCM16.
  // We will compute from sampleRate when available.
  return 50;  // placeholder
}

async function closeSession(state, ws) {
  if (state.geminiStream) {
    try { await state.geminiStream.close(); } catch { /* ignore */ }
    state.geminiStream = null;
  }
  ws.send(JSON.stringify({
    type: 'session.closed',
    _meta: {
      protocol: PROTOCOL_VERSION,
      audio_ms: state.audioMs,
      session_ms: Date.now() - state.startedAt,
      stt_cost_inr: Number(state.sttCostInr.toFixed(4)),
    },
  }));
  try { ws.close(1000, 'session.closed'); } catch { /* ignore */ }
}

// ─── Vercel handler stub ────────────────────────────────────────────
// On Vercel (Node serverless) this returns 501. The realtime path lives
// at the alternate WS host. Sprint 1 will set up an environment variable
// VITE_REALTIME_URL pointing the SPA at the WS host.
export default async function handler(_req) {
  return new Response(
    JSON.stringify({
      error: 'Realtime WebSocket bridge runs on a separate host.',
      protocol: PROTOCOL_VERSION,
      see: 'docs/architecture/ai-first-pivot.md#component-by-component-changes',
    }),
    { status: 501, headers: { 'content-type': 'application/json' } }
  );
}
