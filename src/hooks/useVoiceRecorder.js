import { useCallback, useEffect, useRef, useState } from 'react';

// Picks the first MIME type the browser AND Gemini both accept. Order matters —
// Opus in OGG plays everywhere we test, MP4/AAC for iOS Safari, then fallbacks.
const PREFERRED_MIME_TYPES = [
  'audio/ogg;codecs=opus',
  'audio/webm;codecs=opus',
  'audio/mp4',
  'audio/webm',
];

function pickMimeType() {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const mt of PREFERRED_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(mt)) return mt;
  }
  return null;
}

// Strip the codec suffix when handing the blob's MIME to Gemini —
// "audio/ogg;codecs=opus" → "audio/ogg" since the API expects bare types.
function bareMime(mime) {
  if (!mime) return mime;
  const semi = mime.indexOf(';');
  return semi === -1 ? mime : mime.slice(0, semi);
}

export function useVoiceRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [durationMs, setDurationMs] = useState(0);
  const [error, setError] = useState(null);

  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const startedAtRef = useRef(0);
  const tickRef = useRef(null);
  const streamRef = useRef(null);

  const cleanupStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  };

  useEffect(() => () => {
    cleanupStream();
    if (audioUrl) URL.revokeObjectURL(audioUrl);
  }, [audioUrl]);

  const startRecording = useCallback(async () => {
    setError(null);
    if (typeof navigator?.mediaDevices?.getUserMedia !== 'function') {
      setError('Microphone API not available in this browser');
      return false;
    }
    const mime = pickMimeType();
    if (!mime) {
      setError('Browser does not support a Gemini-compatible audio codec');
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mime });
        setAudioBlob(blob);
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        setAudioUrl(URL.createObjectURL(blob));
        setDurationMs(Date.now() - startedAtRef.current);
        cleanupStream();
        setIsRecording(false);
      };

      recorder.start(250);
      startedAtRef.current = Date.now();
      setIsRecording(true);
      tickRef.current = setInterval(() => {
        setDurationMs(Date.now() - startedAtRef.current);
      }, 200);
      return true;
    } catch (err) {
      const msg = err?.name === 'NotAllowedError'
        ? 'Microphone permission denied'
        : err?.message || 'Could not start recording';
      setError(msg);
      cleanupStream();
      return false;
    }
  }, [audioUrl]);

  const stopRecording = useCallback(() => {
    const r = recorderRef.current;
    if (r && r.state !== 'inactive') r.stop();
  }, []);

  const clearRecording = useCallback(() => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(null);
    setAudioUrl(null);
    setDurationMs(0);
    setError(null);
    chunksRef.current = [];
  }, [audioUrl]);

  // Convert the blob to base64 (no `data:...` prefix) — the API accepts raw
  // base64 + a separate mimeType field.
  const getBase64 = useCallback(async () => {
    if (!audioBlob) return null;
    const buffer = await audioBlob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return {
      data: btoa(binary),
      mimeType: bareMime(audioBlob.type),
    };
  }, [audioBlob]);

  const supported = typeof MediaRecorder !== 'undefined' && pickMimeType() !== null;

  return {
    isRecording,
    audioBlob,
    audioUrl,
    durationMs,
    error,
    supported,
    startRecording,
    stopRecording,
    clearRecording,
    getBase64,
  };
}
