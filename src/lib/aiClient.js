// Thin frontend wrapper around the serverless AI endpoints.
// Memory: hybrid stack — Gemini for intake/extraction, Claude Opus for hard
// reasoning later. Routing/swap should be a config change, not a refactor —
// hence this single boundary.
import { supabase, supabaseConfigured } from './supabaseClient';
import { reportError } from './errorReporting';

export const USE_GEMINI = import.meta.env.VITE_USE_GEMINI === 'true';

const EXTRACT_TIMEOUT_MS = 20000;

// extractIntake accepts either text or audio (or both — text becomes
// supplementary context for audio transcription). audio is { data, mimeType }.
export async function extractIntake({ text, audio } = {}) {
  if (!text && !audio) throw new Error('text or audio is required');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EXTRACT_TIMEOUT_MS);

  try {
    const res = await fetch('/api/intake/extract', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: text || '', audio }),
      signal: controller.signal,
    });

    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = json?.error || `Extraction failed (${res.status})`;
      const err = new Error(msg);
      // Don't double-report budget blocks — they're expected, not bugs.
      if (res.status !== 429) {
        reportError(err, { httpStatus: res.status }, {
          tags: { area: 'ai.intake.extract', provider: 'gemini' },
          level: 'error',
        });
      }
      throw err;
    }
    return json;
  } catch (err) {
    if (err.name === 'AbortError') {
      reportError(new Error('Intake extraction timed out'), { timeoutMs: EXTRACT_TIMEOUT_MS }, {
        tags: { area: 'ai.intake.extract', failureMode: 'timeout' },
        level: 'warning',
      });
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// Stream Claude clinical reasoning. Calls /api/ai/reason and parses the
// SSE stream into per-delta callbacks. Returns the final meta on resolve.
//
// Args:
//   caseSummary  — Markdown blob describing the case
//   citations    — array of { condName, excerpt } from the engine
//   onDelta      — (text) => void, invoked for each token chunk
//
// Throws on HTTP errors. Stream errors are surfaced as { type:'error' } events
// inside the body — consumer should also check err callbacks if exposed.
export async function streamReasoning({ caseSummary, citations = [], onDelta, signal }) {
  const res = await fetch('/api/ai/reason', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ caseSummary, citations }),
    signal,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => `HTTP ${res.status}`);
    const err = new Error(errText || `Reasoning failed (${res.status})`);
    if (res.status !== 429) {
      reportError(err, { httpStatus: res.status }, {
        tags: { area: 'ai.reasoning', provider: 'anthropic' },
        level: 'error',
      });
    }
    throw err;
  }
  if (!res.body) throw new Error('Streaming not supported by this browser');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let finalMeta = null;
  let errorMsg = null;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE events are separated by blank lines.
    let idx;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const event = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const dataLines = event.split('\n').filter(l => l.startsWith('data: ')).map(l => l.slice(6));
      if (!dataLines.length) continue;
      try {
        const obj = JSON.parse(dataLines.join('\n'));
        if (obj.type === 'delta' && typeof obj.text === 'string') {
          onDelta?.(obj.text);
        } else if (obj.type === 'done') {
          finalMeta = obj.meta || null;
        } else if (obj.type === 'error') {
          errorMsg = obj.error || 'unknown stream error';
        }
      } catch {
        // ignore malformed events
      }
    }
  }

  if (errorMsg) throw new Error(errorMsg);
  return finalMeta;
}

// Best-effort write to public.ai_calls. Never blocks UX. Honours RLS via the
// signed-in user's JWT — anonymous calls (cloud disabled) silently no-op.
export async function logAiCall({ caseId, doctorId, task, meta, error }) {
  if (!supabaseConfigured || !doctorId) return;
  try {
    await supabase.from('ai_calls').insert({
      case_id: caseId || null,
      doctor_id: doctorId,
      provider: meta?.provider || 'gemini',
      model: meta?.model || 'unknown',
      task,
      tokens_in: meta?.tokensIn ?? null,
      tokens_out: meta?.tokensOut ?? null,
      cost_inr: meta?.costInr ?? null,
      latency_ms: meta?.latencyMs ?? null,
      error: error || null,
    });
  } catch (err) {
    // Telemetry failure is never fatal.
    console.warn('[aiClient] failed to log ai_call', err);
  }
}
