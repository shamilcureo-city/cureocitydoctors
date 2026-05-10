import { useCallback, useRef, useState } from 'react';
import { EngineCore, S, processIntake } from '../engine/index.js';
import { useLiveAudio, blobToBase64 } from './useLiveAudio';
import { logEvent } from '../utils/auditLog';
import { reportError } from '../lib/errorReporting';

/**
 * useLiveSession — orchestrates an ambient consult.
 *
 * Wires:
 *   useLiveAudio (mic → 8s blob chunks)
 *     ↓
 *   POST /api/live/transcribe (Gemini → transcript_delta + entity deltas)
 *     ↓
 *   EngineCore mutators (vitals, labs, drugs, allergies, corpus append)
 *     ↓
 *   processIntake() (re-score differential)
 *     ↓
 *   syncCb() (caller updates React state from S)
 *
 * Caller passes:
 *   - syncCb()   — invoked after each chunk has been merged into the engine
 *                  so the parent can sync its own React state from S.
 *   - orgId      — for the server-side cost guardrail
 *
 * Returns:
 *   {
 *     state,           // 'idle' | 'recording' | 'stopped' | 'error'
 *     error,
 *     transcript,      // accumulated full transcript
 *     chunkCount,      // how many chunks have been processed
 *     totalSpendInr,   // running cost across this session
 *     latencyMsP50,    // p50 of per-chunk latency (rolling)
 *     start, stop,
 *     redFlagsHeard,   // verbatim phrases the model called out
 *   }
 */

const MAX_PRIOR_TAIL_CHARS = 1500;
const ROLLING_LATENCY_WINDOW = 10;

function median(nums) {
  if (!nums.length) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const m = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
}

// Per-chunk fetch budget. The Vercel function caps at 60s
// (maxDuration). We wait up to 55s — long enough that the server
// either responds or hits its own ceiling, never client-aborts a
// healthy in-flight call.
const CHUNK_FETCH_TIMEOUT_MS = 55_000;

export function useLiveSession({ orgId = null, onSync } = {}) {
  const [transcript, setTranscript] = useState('');
  const [chunkCount, setChunkCount] = useState(0);
  const [totalSpendInr, setTotalSpendInr] = useState(0);
  const [latencyMsP50, setLatencyMsP50] = useState(0);
  const [redFlagsHeard, setRedFlagsHeard] = useState([]);
  const [budget, setBudget] = useState(null);
  // Visible per-chunk timeline. Without this, when a chunk fails the
  // doctor sees nothing — that's the #1 product-killing bug. Every
  // chunk goes through state transitions: 'sending' → 'success' | 'failed'.
  const [chunks, setChunks] = useState([]);
  const [lastError, setLastError] = useState(null);
  // Diarized turns (speaker + text) accumulated across chunks. The
  // panel renders this as a doctor/patient interleaved transcript.
  const [turns, setTurns] = useState([]);
  // Latest doctor-actionable next question suggested by the model.
  // Replaced on every chunk that returns a non-null next_question.
  const [nextQuestion, setNextQuestion] = useState(null);

  const transcriptRef = useRef('');
  const latenciesRef = useRef([]);

  const upsertChunk = useCallback((sequence, patch) => {
    setChunks(prev => {
      const idx = prev.findIndex(c => c.sequence === sequence);
      if (idx === -1) return [...prev, { sequence, ...patch }];
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  }, []);

  // Apply a chunk's structured deltas into the engine + corpus, then
  // re-score. The caller's onSync() snapshots the new engine state into
  // React for rendering.
  const applyDelta = useCallback((delta) => {
    let mutated = false;

    // 1) Append the medical-English delta to the engine corpus and
    //    re-process. This drives the differential, gaps, and red flags.
    if (delta.hpi_delta && delta.hpi_delta.trim()) {
      const next = (S.corpus || '') + ' ' + delta.hpi_delta.trim().toLowerCase();
      EngineCore.setRawInput(next);
      processIntake();
      mutated = true;
    }

    // 2) Vitals — keys match S_VITALS / examFindings.cv format
    if (Array.isArray(delta.new_vitals)) {
      for (const v of delta.new_vitals) {
        if (!v?.key || !v?.value) continue;
        try { EngineCore.setVital(v.key, String(v.value)); mutated = true; } catch { /* ignore */ }
      }
    }

    // 3) Labs — engineUpdateLab is a top-level export but we go via S directly
    //    here to avoid the debounce; the chunk cadence is already 8s.
    if (Array.isArray(delta.new_labs)) {
      for (const l of delta.new_labs) {
        if (!l?.key || !l?.value) continue;
        S.labs[l.key] = String(l.value);
        mutated = true;
      }
    }

    // 4) Drugs (current meds the patient mentions)
    if (Array.isArray(delta.new_drugs)) {
      for (const d of delta.new_drugs) {
        if (!d?.name) continue;
        // Avoid duplicates if model re-mentions a drug in a later chunk
        const exists = (S.drugs || []).some(x => (x.name || '').toLowerCase() === d.name.toLowerCase());
        if (!exists) {
          try { EngineCore.addDrugDirect(d.name, d.dose || '', ''); mutated = true; } catch { /* ignore */ }
        }
      }
    }

    // 5) Allergies
    if (Array.isArray(delta.new_allergies)) {
      for (const a of delta.new_allergies) {
        if (!a?.allergen) continue;
        try { EngineCore.addAllergy(a.allergen, a.reaction || '', a.severity || 'unknown'); mutated = true; } catch { /* ignore */ }
      }
    }

    // 6) Red-flag phrases — surface them but don't auto-promote conditions;
    //    the engine derives red flags from the corpus itself.
    if (Array.isArray(delta.red_flag_phrases) && delta.red_flag_phrases.length) {
      setRedFlagsHeard(prev => Array.from(new Set([...prev, ...delta.red_flag_phrases])));
    }

    // After labs/drugs/allergies were added, re-process so labAlerts and
    // interactions reflect the latest state.
    if (mutated) processIntake();
    return mutated;
  }, []);

  const handleChunk = useCallback(async ({ blob, mimeType, sequence, durationMs }) => {
    const startedAt = Date.now();
    const sizeKb = Math.round((blob?.size || 0) / 1024);

    upsertChunk(sequence, {
      status: 'encoding',
      sizeKb,
      durationMs,
      startedAt,
    });

    let audio_chunk_b64;
    try {
      audio_chunk_b64 = await blobToBase64(blob);
    } catch (err) {
      const msg = `Failed to encode audio chunk: ${err?.message || err}`;
      console.error('[live] blob.encode failed', err);
      setLastError(msg);
      upsertChunk(sequence, { status: 'failed', error: msg });
      reportError(err, { sequence, sizeKb }, { tags: { area: 'live.chunk', op: 'blob.encode' } });
      return;
    }

    upsertChunk(sequence, { status: 'sending', encodedKb: Math.round(audio_chunk_b64.length / 1024) });

    const tail = transcriptRef.current.slice(-MAX_PRIOR_TAIL_CHARS);

    // Explicit timeout — without this a hung Vercel function locks the
    // doctor with no error visible. AbortController fires at 30s.
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), CHUNK_FETCH_TIMEOUT_MS);

    let res, json, fetchErr;
    try {
      res = await fetch('/api/live/transcribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          audio_chunk_b64,
          mime_type: mimeType,
          prior_transcript_tail: tail,
          sequence,
          orgId,
        }),
        signal: ac.signal,
      });
      json = await res.json().catch(() => null);
    } catch (err) {
      fetchErr = err;
    } finally {
      clearTimeout(timer);
    }

    if (fetchErr) {
      const msg = fetchErr?.name === 'AbortError'
        ? `Chunk ${sequence} timed out after ${CHUNK_FETCH_TIMEOUT_MS / 1000}s`
        : `Network error: ${fetchErr?.message || fetchErr}`;
      console.error('[live] fetch failed', fetchErr);
      setLastError(msg);
      upsertChunk(sequence, { status: 'failed', error: msg, latencyMs: Date.now() - startedAt });
      reportError(fetchErr, { sequence, sizeKb }, { tags: { area: 'live.chunk', op: 'fetch' } });
      return;
    }

    if (!res.ok || !json) {
      const msg = json?.error || `HTTP ${res.status} from /api/live/transcribe`;
      console.error('[live] non-2xx response', res.status, json);
      setLastError(msg);
      upsertChunk(sequence, {
        status: 'failed',
        error: msg,
        httpStatus: res.status,
        latencyMs: Date.now() - startedAt,
      });
      logEvent('ai.live.transcribe.error', { sequence, status: res.status, message: msg });
      if (res.status !== 429) {
        reportError(new Error(msg), { sequence, status: res.status }, {
          tags: { area: 'live.chunk', provider: 'gemini', op: 'http' },
        });
      }
      return;
    }

    // Success path
    setLastError(null);
    const meta = json._meta || {};
    if (typeof meta.costInr === 'number') setTotalSpendInr(prev => prev + meta.costInr);
    if (meta.budget) setBudget(meta.budget);
    if (typeof meta.latencyMs === 'number') {
      latenciesRef.current.push(meta.latencyMs);
      if (latenciesRef.current.length > ROLLING_LATENCY_WINDOW) latenciesRef.current.shift();
      setLatencyMsP50(Math.round(median(latenciesRef.current)));
    }

    if (json.transcript_delta && json.transcript_delta.trim()) {
      const next = transcriptRef.current
        ? `${transcriptRef.current} ${json.transcript_delta.trim()}`
        : json.transcript_delta.trim();
      transcriptRef.current = next;
      setTranscript(next);
    }

    // Speaker-diarized turns — append per-chunk so the doctor sees
    // the conversation interleaved (D: ... / P: ...) live.
    if (Array.isArray(json.speakers) && json.speakers.length > 0) {
      const tagged = json.speakers
        .filter(t => t?.text && t.text.trim())
        .map(t => ({
          speaker: t.speaker === 'doctor' || t.speaker === 'patient' ? t.speaker : 'unknown',
          text: t.text.trim(),
          chunk: sequence,
        }));
      if (tagged.length) setTurns(prev => [...prev, ...tagged]);
    }

    // "Ask next" suggestion — replace whatever was on screen with the
    // latest one. Null clears it (model felt the conversation was
    // well-covered).
    if (json.next_question && json.next_question.text) {
      setNextQuestion({
        text: json.next_question.text,
        reason: json.next_question.reason || '',
        chunk: sequence,
        ts: Date.now(),
      });
    }

    upsertChunk(sequence, {
      status: 'success',
      transcriptDelta: json.transcript_delta || '',
      hpiDelta: json.hpi_delta || '',
      speakerTurns: (json.speakers || []).length,
      nextQuestion: json.next_question?.text || null,
      vitalsCount: json.new_vitals?.length ?? 0,
      labsCount: json.new_labs?.length ?? 0,
      drugsCount: json.new_drugs?.length ?? 0,
      allergiesCount: json.new_allergies?.length ?? 0,
      redFlagsCount: json.red_flag_phrases?.length ?? 0,
      latencyMs: meta.latencyMs ?? Date.now() - startedAt,
      costInr: meta.costInr ?? 0,
      tokensIn: meta.tokensIn ?? 0,
      tokensOut: meta.tokensOut ?? 0,
    });

    logEvent('ai.live.transcribe', {
      sequence,
      tokens_in: meta.tokensIn,
      tokens_out: meta.tokensOut,
      cost_inr: meta.costInr,
      latency_ms: meta.latencyMs,
      total_latency_ms: Date.now() - startedAt,
      hpi_chars: json.hpi_delta?.length ?? 0,
      vitals: json.new_vitals?.length ?? 0,
      labs: json.new_labs?.length ?? 0,
      drugs: json.new_drugs?.length ?? 0,
      allergies: json.new_allergies?.length ?? 0,
      red_flags: json.red_flag_phrases?.length ?? 0,
    });

    const mutated = applyDelta(json);
    if (mutated && onSync) onSync();
    setChunkCount(c => c + 1);

    if (Array.isArray(json.red_flag_phrases) && json.red_flag_phrases.length) {
      setRedFlagsHeard(prev => Array.from(new Set([...prev, ...json.red_flag_phrases])));
    }
  }, [applyDelta, onSync, orgId, upsertChunk]);

  const handleAudioError = useCallback((err) => {
    const msg = `Microphone capture failed: ${err?.message || err}`;
    setLastError(msg);
    reportError(err, {}, { tags: { area: 'live.audio', op: 'capture' } });
  }, []);

  const audio = useLiveAudio({
    chunkMs: 8000,
    onChunk: handleChunk,
    onError: handleAudioError,
  });

  // Short-cycle audio for the "Test pipeline" button — same pipeline,
  // 3-second clip, surfaced in the same chunks state. Lets the doctor
  // verify mic + Gemini before committing to a real consult.
  const testAudio = useLiveAudio({
    chunkMs: 3000,
    onChunk: handleChunk,
    onError: handleAudioError,
  });

  const resetSession = useCallback(() => {
    setTranscript('');
    transcriptRef.current = '';
    setChunkCount(0);
    setTotalSpendInr(0);
    setLatencyMsP50(0);
    setRedFlagsHeard([]);
    setChunks([]);
    setLastError(null);
    setTurns([]);
    setNextQuestion(null);
    latenciesRef.current = [];
  }, []);

  const dismissNextQuestion = useCallback(() => setNextQuestion(null), []);

  const start = useCallback(async () => {
    resetSession();
    logEvent('consult.live.start', { orgId });
    await audio.start();
  }, [audio, orgId, resetSession]);

  const stop = useCallback(() => {
    audio.stop();
    logEvent('consult.live.stop', {
      chunks: chunkCount,
      spend_inr: totalSpendInr,
      transcript_chars: transcriptRef.current.length,
    });
  }, [audio, chunkCount, totalSpendInr]);

  // Run a single 3-second test cycle through the entire pipeline.
  // Auto-stops after one chunk so the doctor can see exactly what
  // came back. Caller can read `chunks[0]` for the verdict.
  const runPipelineTest = useCallback(async () => {
    resetSession();
    logEvent('consult.live.test', { orgId });
    await testAudio.start();
    // Stop after exactly one chunk-cycle (chunkMs + a small grace)
    setTimeout(() => {
      try { testAudio.stop(); } catch { /* ignore */ }
    }, 3500);
  }, [testAudio, orgId, resetSession]);

  return {
    state: audio.state === 'idle' ? testAudio.state : audio.state,
    error: audio.error || testAudio.error,
    transcript,
    turns,
    nextQuestion,
    chunkCount,
    totalSpendInr,
    latencyMsP50,
    redFlagsHeard,
    budget,
    chunks,
    lastError,
    start,
    stop,
    runPipelineTest,
    resetSession,
    dismissNextQuestion,
  };
}
