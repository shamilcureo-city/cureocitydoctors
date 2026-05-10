import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * useLiveAudio — chunked microphone capture for ambient consults.
 *
 * Captures the doctor's mic and emits a self-contained audio Blob every
 * `chunkMs` (default 8000ms). The implementation stops and restarts
 * MediaRecorder for each chunk so each emitted Blob is a complete,
 * playable WebM/Opus file — important because we send each chunk
 * independently to /api/live/transcribe and Gemini needs valid audio.
 *
 * Briefly missing audio between chunks (~50ms) is acceptable for
 * extraction quality.
 *
 * Returns:
 *   { state, error, start, stop, mimeType }
 *   - state: 'idle' | 'requesting-permission' | 'recording' | 'stopped' | 'error'
 *
 * Caller passes onChunk({ blob, mimeType, sequence }) to receive each
 * chunk as it's emitted.
 *
 * Permissions are requested on start(); if denied, state -> 'error'
 * and onError is invoked.
 */

// Order matters — first supported wins. Opus is by far the best for speech.
const PREFERRED_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/mp4',
];

function pickMimeType() {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const t of PREFERRED_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
}

// Strip the codecs suffix when sending to the server; the audio container
// is what Gemini's mime_type whitelist expects.
function normalizeServerMime(t) {
  if (!t) return 'audio/webm';
  const semi = t.indexOf(';');
  return semi >= 0 ? t.slice(0, semi) : t;
}

export function useLiveAudio({ chunkMs = 8000, onChunk, onError } = {}) {
  const [state, setState] = useState('idle');
  const [error, setError] = useState(null);
  const [mimeType, setMimeType] = useState('');

  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const cycleTimerRef = useRef(null);
  const sequenceRef = useRef(0);
  const stoppingRef = useRef(false);
  const mimeTypeRef = useRef('');
  // Self-reference holder so onstop can call the next cycle without
  // TDZ-accessing the useCallback before it's declared.
  const startNewRecorderCycleRef = useRef(() => {});

  // Make the latest onChunk/onError visible inside the async callbacks
  // without re-initializing the recorder when the parent re-renders.
  const onChunkRef = useRef(onChunk);
  const onErrorRef = useRef(onError);
  useEffect(() => { onChunkRef.current = onChunk; }, [onChunk]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  const cleanup = useCallback(() => {
    if (cycleTimerRef.current) {
      clearTimeout(cycleTimerRef.current);
      cycleTimerRef.current = null;
    }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try { recorderRef.current.stop(); } catch { /* ignore */ }
    }
    recorderRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, []);

  const startNewRecorderCycle = useCallback(() => {
    if (stoppingRef.current || !streamRef.current) return;

    const mt = mimeTypeRef.current;
    let recorder;
    try {
      recorder = mt ? new MediaRecorder(streamRef.current, { mimeType: mt }) : new MediaRecorder(streamRef.current);
    } catch (err) {
      setError(err);
      setState('error');
      onErrorRef.current?.(err);
      return;
    }

    const chunks = [];
    const seq = sequenceRef.current++;
    const startedAt = Date.now();

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => {
      if (chunks.length === 0) {
        // No data — likely the stream is closing. Don't loop again.
        return;
      }
      const blob = new Blob(chunks, { type: recorder.mimeType || mt || 'audio/webm' });
      const serverMime = normalizeServerMime(recorder.mimeType || mt);
      try {
        onChunkRef.current?.({
          blob,
          mimeType: serverMime,
          sequence: seq,
          durationMs: Date.now() - startedAt,
        });
      } catch (err) {
        // Caller's onChunk threw; report but continue cycling.
        onErrorRef.current?.(err);
      }
      if (!stoppingRef.current) {
        // Schedule the next cycle. Tiny gap between chunks (one tick).
        startNewRecorderCycleRef.current();
      }
    };
    recorder.onerror = (e) => {
      const err = e.error || new Error('MediaRecorder error');
      setError(err);
      setState('error');
      onErrorRef.current?.(err);
    };

    recorderRef.current = recorder;
    recorder.start();

    // After chunkMs, stop this recorder; onstop will deliver the blob and
    // start the next cycle.
    cycleTimerRef.current = setTimeout(() => {
      if (recorder.state === 'recording') {
        try { recorder.stop(); } catch { /* ignore */ }
      }
    }, chunkMs);
  }, [chunkMs]);

  // Keep the ref pointed at the latest closure so onstop can call it
  // without TDZ-accessing the useCallback before declaration.
  useEffect(() => {
    startNewRecorderCycleRef.current = startNewRecorderCycle;
  }, [startNewRecorderCycle]);

  const start = useCallback(async () => {
    if (state === 'recording' || state === 'requesting-permission') return;
    setError(null);
    sequenceRef.current = 0;
    stoppingRef.current = false;
    setState('requesting-permission');

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      const err = new Error('Microphone access not supported in this browser');
      setError(err);
      setState('error');
      onErrorRef.current?.(err);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,
          channelCount: 1,
        },
      });
      streamRef.current = stream;
      const mt = pickMimeType() || '';
      mimeTypeRef.current = mt;
      setMimeType(mt);
      setState('recording');
      startNewRecorderCycle();
    } catch (err) {
      setError(err);
      setState('error');
      onErrorRef.current?.(err);
    }
  }, [state, startNewRecorderCycle]);

  const stop = useCallback(() => {
    stoppingRef.current = true;
    cleanup();
    setState('stopped');
  }, [cleanup]);

  // Make sure we release the mic if the component unmounts.
  useEffect(() => {
    return () => {
      stoppingRef.current = true;
      cleanup();
    };
  }, [cleanup]);

  return {
    state,
    error,
    start,
    stop,
    mimeType,
  };
}

// Helper: read a Blob as base64 (without the data: prefix).
export async function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(blob);
  });
}
