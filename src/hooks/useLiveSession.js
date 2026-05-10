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

export function useLiveSession({ orgId = null, onSync } = {}) {
  const [transcript, setTranscript] = useState('');
  const [chunkCount, setChunkCount] = useState(0);
  const [totalSpendInr, setTotalSpendInr] = useState(0);
  const [latencyMsP50, setLatencyMsP50] = useState(0);
  const [redFlagsHeard, setRedFlagsHeard] = useState([]);
  const [budget, setBudget] = useState(null);

  const transcriptRef = useRef('');
  const latenciesRef = useRef([]);

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

  const handleChunk = useCallback(async ({ blob, mimeType, sequence }) => {
    const startedAt = Date.now();
    let audio_chunk_b64;
    try {
      audio_chunk_b64 = await blobToBase64(blob);
    } catch (err) {
      reportError(err, { sequence }, { tags: { area: 'live.chunk', op: 'blob.encode' } });
      return;
    }

    const tail = transcriptRef.current.slice(-MAX_PRIOR_TAIL_CHARS);
    let res, json;
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
      });
      json = await res.json().catch(() => null);
    } catch (err) {
      reportError(err, { sequence }, { tags: { area: 'live.chunk', op: 'fetch' } });
      return;
    }

    if (!res.ok || !json) {
      const msg = json?.error || `Live transcribe failed (${res.status})`;
      logEvent('ai.live.transcribe.error', { sequence, status: res.status, message: msg });
      if (res.status !== 429) {
        reportError(new Error(msg), { sequence, status: res.status }, {
          tags: { area: 'live.chunk', provider: 'gemini', op: 'http' },
        });
      }
      return;
    }

    // Cost & latency telemetry
    const meta = json._meta || {};
    if (typeof meta.costInr === 'number') setTotalSpendInr(prev => prev + meta.costInr);
    if (meta.budget) setBudget(meta.budget);
    if (typeof meta.latencyMs === 'number') {
      latenciesRef.current.push(meta.latencyMs);
      if (latenciesRef.current.length > ROLLING_LATENCY_WINDOW) latenciesRef.current.shift();
      setLatencyMsP50(Math.round(median(latenciesRef.current)));
    }

    // Append transcript
    if (json.transcript_delta && json.transcript_delta.trim()) {
      const next = transcriptRef.current
        ? `${transcriptRef.current} ${json.transcript_delta.trim()}`
        : json.transcript_delta.trim();
      transcriptRef.current = next;
      setTranscript(next);
    }

    // Audit (lightweight — full content_hash etc. logged separately)
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
  }, [applyDelta, onSync, orgId]);

  const handleAudioError = useCallback((err) => {
    reportError(err, {}, { tags: { area: 'live.audio', op: 'capture' } });
  }, []);

  const audio = useLiveAudio({
    chunkMs: 8000,
    onChunk: handleChunk,
    onError: handleAudioError,
  });

  const start = useCallback(async () => {
    setTranscript('');
    transcriptRef.current = '';
    setChunkCount(0);
    setTotalSpendInr(0);
    setLatencyMsP50(0);
    setRedFlagsHeard([]);
    latenciesRef.current = [];
    logEvent('consult.live.start', { orgId });
    await audio.start();
  }, [audio, orgId]);

  const stop = useCallback(() => {
    audio.stop();
    logEvent('consult.live.stop', {
      chunks: chunkCount,
      spend_inr: totalSpendInr,
      transcript_chars: transcriptRef.current.length,
    });
  }, [audio, chunkCount, totalSpendInr]);

  return {
    state: audio.state,
    error: audio.error,
    transcript,
    chunkCount,
    totalSpendInr,
    latencyMsP50,
    redFlagsHeard,
    budget,
    start,
    stop,
  };
}
