// useLiveStream — continuous mic capture + WebSocket transport.
//
// Replaces the 8-second-chunk loop in src/hooks/useLiveAudio.js with a
// streaming pipeline that pushes audio to the realtime backend (which
// in turn proxies to Gemini Live or AssemblyAI) and surfaces transcript
// deltas as they arrive.
//
// Sprint 1 deliverable. The old useLiveAudio.js stays during shadow
// mode for fallback; deletion happens in Sprint 7.
//
// Returns:
//   {
//     state,                  // 'idle' | 'connecting' | 'recording' | 'closed' | 'error'
//     error,
//     transcript,             // [{ id, text, speaker, t_start, t_end, committed }]
//     redFlags,               // [{ phrase, severity, category }]
//     start({consultationId, doctorId, orgId, language}),
//     stop(),
//   }

import { useCallback, useEffect, useReducer, useRef } from 'react';

const DEFAULT_REALTIME_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_REALTIME_URL) ||
  '';

const PCM_SAMPLE_RATE = 16000;
const PCM_FRAME_MS = 100;  // 100ms frames, 1600 samples/frame

const initialState = {
  state: 'idle',
  error: null,
  transcript: [],
  redFlags: [],
  meta: null,
};

function reducer(s, a) {
  switch (a.type) {
    case 'connecting': return { ...s, state: 'connecting', error: null };
    case 'recording':  return { ...s, state: 'recording', error: null };
    case 'closed':     return { ...s, state: 'closed', meta: a.meta || null };
    case 'error':      return { ...s, state: 'error', error: a.error };
    case 'transcript.delta': {
      // Replace the current "in-progress" line for this speaker; appends if new
      const existing = s.transcript.find(t => t.id === a.id);
      if (existing) {
        return {
          ...s,
          transcript: s.transcript.map(t =>
            t.id === a.id ? { ...t, text: a.text, t_end: a.t_end } : t
          ),
        };
      }
      return {
        ...s,
        transcript: [
          ...s.transcript,
          { id: a.id, text: a.text, speaker: a.speaker, t_start: a.t_start, t_end: a.t_end, committed: false },
        ],
      };
    }
    case 'transcript.committed': {
      return {
        ...s,
        transcript: s.transcript.map(t =>
          t.id === a.id ? { ...t, text: a.text, t_end: a.t_end, committed: true } : t
        ),
      };
    }
    case 'red_flag.detected':
      return {
        ...s,
        redFlags: [...s.redFlags, { phrase: a.phrase, severity: a.severity, category: a.category, ts: Date.now() }],
      };
    case 'reset': return { ...initialState };
    default: return s;
  }
}

export function useLiveStream({ realtimeUrl = DEFAULT_REALTIME_URL, onEvent } = {}) {
  const [s, dispatch] = useReducer(reducer, initialState);
  const wsRef = useRef(null);
  const audioCtxRef = useRef(null);
  const processorRef = useRef(null);
  const sourceRef = useRef(null);
  const sequenceRef = useRef(0);
  const onEventRef = useRef(onEvent);
  useEffect(() => { onEventRef.current = onEvent; }, [onEvent]);

  const sendJson = useCallback((obj) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(obj));
    }
  }, []);

  const stop = useCallback(() => {
    sendJson({ type: 'session.commit' });
    try { processorRef.current?.disconnect(); } catch { /* ignore */ }
    try { sourceRef.current?.disconnect(); } catch { /* ignore */ }
    try { audioCtxRef.current?.close(); } catch { /* ignore */ }
    processorRef.current = null;
    sourceRef.current = null;
    audioCtxRef.current = null;
    try { wsRef.current?.close(1000, 'client_stop'); } catch { /* ignore */ }
    wsRef.current = null;
    dispatch({ type: 'closed' });
  }, [sendJson]);

  const start = useCallback(async ({ consultationId, doctorId, orgId, language = 'en-IN', authToken }) => {
    if (!realtimeUrl) {
      dispatch({ type: 'error', error: new Error('VITE_REALTIME_URL not configured') });
      return;
    }
    dispatch({ type: 'reset' });
    dispatch({ type: 'connecting' });

    // 1. Open WebSocket
    //    The Worker requires consultationId in the URL to route to the
    //    right Durable Object; orgId is forwarded as an internal header.
    let ws;
    try {
      const url = new URL(realtimeUrl);
      if (authToken) url.searchParams.set('token', authToken);
      if (consultationId) url.searchParams.set('consultationId', consultationId);
      if (orgId) url.searchParams.set('orgId', orgId);
      ws = new WebSocket(url.toString());
    } catch (err) {
      dispatch({ type: 'error', error: err });
      return;
    }
    wsRef.current = ws;

    ws.addEventListener('open', async () => {
      // 2. Get mic
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: PCM_SAMPLE_RATE,
            channelCount: 1,
          },
        });
      } catch (err) {
        dispatch({ type: 'error', error: err });
        try { ws.close(); } catch { /* ignore */ }
        return;
      }

      // 3. Audio graph: source → ScriptProcessor → WS
      const ctx = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: PCM_SAMPLE_RATE,
      });
      audioCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      sourceRef.current = src;
      const frameSamples = (PCM_SAMPLE_RATE * PCM_FRAME_MS) / 1000;
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      let buffer = new Float32Array(0);
      processor.onaudioprocess = (e) => {
        const input = e.inputBuffer.getChannelData(0);
        const merged = new Float32Array(buffer.length + input.length);
        merged.set(buffer);
        merged.set(input, buffer.length);
        buffer = merged;

        while (buffer.length >= frameSamples) {
          const slice = buffer.slice(0, frameSamples);
          buffer = buffer.slice(frameSamples);
          const pcm16 = float32ToPcm16(slice);
          const b64 = arrayBufferToBase64(pcm16.buffer);
          sendJson({ type: 'audio.chunk', sequence: sequenceRef.current++, b64 });
        }
      };

      src.connect(processor);
      processor.connect(ctx.destination);

      // 4. Tell server we're ready
      sendJson({
        type: 'session.start',
        consultationId, doctorId, orgId,
        audio: { sampleRate: PCM_SAMPLE_RATE, encoding: 'pcm16le', language },
      });
    });

    ws.addEventListener('message', (msgEvt) => {
      let evt;
      try { evt = JSON.parse(msgEvt.data); } catch { return; }
      onEventRef.current?.(evt);

      switch (evt.type) {
        case 'session.ready':
          dispatch({ type: 'recording' });
          break;
        case 'transcript.delta':
          dispatch({
            type: 'transcript.delta',
            id: evt.id || `t-${evt.sequence}`,
            text: evt.text,
            speaker: evt.speaker || 'unknown',
            t_start: evt.t_start,
            t_end: evt.t_end,
          });
          break;
        case 'transcript.committed':
          dispatch({
            type: 'transcript.committed',
            id: evt.id,
            text: evt.text,
            t_end: evt.t_end,
          });
          break;
        case 'red_flag.detected':
          dispatch({
            type: 'red_flag.detected',
            phrase: evt.phrase, severity: evt.severity, category: evt.category,
          });
          break;
        case 'error':
          dispatch({ type: 'error', error: new Error(evt.message || 'realtime error') });
          break;
        case 'session.closed':
          dispatch({ type: 'closed', meta: evt._meta });
          break;
      }
    });

    ws.addEventListener('error', (err) => {
      dispatch({ type: 'error', error: err });
    });

    ws.addEventListener('close', () => {
      if (s.state !== 'closed') dispatch({ type: 'closed' });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [realtimeUrl, sendJson]);

  // Cleanup on unmount
  useEffect(() => () => {
    try { processorRef.current?.disconnect(); } catch { /* ignore */ }
    try { sourceRef.current?.disconnect(); } catch { /* ignore */ }
    try { audioCtxRef.current?.close(); } catch { /* ignore */ }
    try { wsRef.current?.close(); } catch { /* ignore */ }
  }, []);

  return {
    state: s.state,
    error: s.error,
    transcript: s.transcript,
    redFlags: s.redFlags,
    meta: s.meta,
    start,
    stop,
  };
}

// ─── helpers ────────────────────────────────────────────────────────
function float32ToPcm16(input) {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return out;
}

function arrayBufferToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
