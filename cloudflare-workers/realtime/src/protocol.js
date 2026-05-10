// Realtime WebSocket protocol — shared with src/hooks/useLiveStream.js.
// Keep these definitions in sync with the protocol spec in
// /api/realtime/session.js.

export const PROTOCOL_VERSION = '0.1.0';

const CLIENT_EVENT_TYPES = new Set([
  'session.start',
  'audio.chunk',
  'session.commit',
  'session.cancel',
]);

export function validateClientEvent(evt) {
  if (!evt || typeof evt !== 'object') return { ok: false, reason: 'not_object' };
  if (!CLIENT_EVENT_TYPES.has(evt.type)) return { ok: false, reason: `unknown_type:${evt.type}` };

  switch (evt.type) {
    case 'session.start':
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
