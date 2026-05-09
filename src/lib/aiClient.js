// Thin frontend wrapper around the serverless AI endpoints.
// Memory: hybrid stack — Gemini for intake/extraction, Claude Opus for hard
// reasoning later. Routing/swap should be a config change, not a refactor —
// hence this single boundary.
import { supabase, supabaseConfigured } from './supabaseClient';

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
      throw new Error(msg);
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
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
