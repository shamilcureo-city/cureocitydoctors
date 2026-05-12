"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn, formatDuration } from "@/lib/utils";

type Props = {
  disabled?: boolean;
  onRecorded: (blob: Blob, durationSeconds: number) => void;
};

const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

function pickMime(): string | undefined {
  if (typeof window === "undefined" || !window.MediaRecorder) return undefined;
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m));
}

export function Recorder({ disabled, onRecorded }: Props) {
  const [status, setStatus] = useState<"idle" | "recording" | "stopped" | "denied">("idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const chunksRef = useRef<Blob[]>([]);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef<number>(0);
  const timerRef = useRef<number | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      });
      const mimeType = pickMime();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const duration = Math.max(0, Math.round((Date.now() - startedAtRef.current) / 1000));
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        cleanup();
        setElapsed(duration);
        setStatus("stopped");
        onRecorded(blob, duration);
      };

      streamRef.current = stream;
      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      recorder.start(1000);
      setStatus("recording");
      setElapsed(0);
      timerRef.current = window.setInterval(() => {
        setElapsed(Math.round((Date.now() - startedAtRef.current) / 1000));
      }, 500);
    } catch (err) {
      const msg = (err as Error).message;
      setStatus("denied");
      setError(
        msg.toLowerCase().includes("permission") || msg.toLowerCase().includes("denied")
          ? "Microphone access is blocked. Allow it in your browser settings and reload."
          : msg,
      );
    }
  }, [cleanup, onRecorded]);

  const stop = useCallback(() => {
    recorderRef.current?.stop();
  }, []);

  return (
    <div className="rounded-md border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "block h-3 w-3 rounded-full",
              status === "recording" ? "bg-red-500 pulse-dot" : "bg-slate-300",
            )}
          />
          <div>
            <p className="text-sm font-medium text-slate-900">
              {status === "recording"
                ? "Recording"
                : status === "stopped"
                  ? "Recording captured"
                  : status === "denied"
                    ? "Microphone unavailable"
                    : "Ready to record"}
            </p>
            <p className="font-mono text-xs text-slate-500">{formatDuration(elapsed)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {status !== "recording" ? (
            <Button type="button" onClick={start} disabled={disabled || status === "denied"}>
              {status === "stopped" ? "Re-record" : "Start"}
            </Button>
          ) : (
            <Button type="button" variant="danger" onClick={stop}>
              Stop
            </Button>
          )}
        </div>
      </div>
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
