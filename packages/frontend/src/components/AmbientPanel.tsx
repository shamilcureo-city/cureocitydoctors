'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { api } from '@/lib/api';

interface ExtractedEntity {
  symptoms?: Array<{ term: string; duration?: string }>;
  signs?: string[];
  drugs?: Array<{ name: string }>;
  negatedTerms?: string[];
}

interface AmbientPanelProps {
  consultationId: string;
  readonly: boolean;
  onEntitiesUpdate?: (entities: ExtractedEntity) => void;
  onTranscriptComplete?: (transcript: string) => void;
}

export default function AmbientPanel({
  consultationId,
  readonly,
  onEntitiesUpdate,
  onTranscriptComplete,
}: AmbientPanelProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [liveText, setLiveText] = useState('');
  const [entities, setEntities] = useState<ExtractedEntity[]>([]);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');

  const recognitionRef = useRef<any>(null);
  const transcriptRef = useRef('');

  // Use Web Speech API for browser-native speech recognition
  const startRecording = useCallback(() => {
    setError('');

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setError('Speech recognition is not supported in this browser. Use Chrome or Edge.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-IN'; // Indian English for Manglish support

    recognition.onresult = (event: any) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript + ' ';
        } else {
          interimTranscript += result[0].transcript;
        }
      }

      if (finalTranscript) {
        transcriptRef.current += finalTranscript;
        setTranscript(transcriptRef.current);
      }
      setLiveText(interimTranscript);
    };

    recognition.onerror = (event: any) => {
      if (event.error !== 'no-speech') {
        console.error('[ambient] Speech recognition error:', event.error);
        setError(`Speech recognition error: ${event.error}`);
      }
    };

    recognition.onend = () => {
      // Auto-restart if still recording
      if (recognitionRef.current) {
        try {
          recognition.start();
        } catch {
          // Already started
        }
      }
    };

    recognition.start();
    recognitionRef.current = recognition;
    setIsRecording(true);
  }, []);

  const stopRecording = useCallback(async () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsRecording(false);
    setLiveText('');

    const fullTranscript = transcriptRef.current.trim();
    if (!fullTranscript) return;

    // Run entity extraction on full transcript
    setProcessing(true);
    try {
      const result = await api.post<any>(`/consultations/${consultationId}/extract-entities`, {
        transcript: fullTranscript,
      });
      setEntities([result]);
      onEntitiesUpdate?.(result);
      onTranscriptComplete?.(fullTranscript);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to extract entities');
    } finally {
      setProcessing(false);
    }
  }, [consultationId, onEntitiesUpdate, onTranscriptComplete]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
    };
  }, []);

  const generateSOAP = async () => {
    setProcessing(true);
    setError('');
    try {
      const soap = await api.post<any>(`/consultations/${consultationId}/soap-note`, {});
      onTranscriptComplete?.(transcript);
      return soap;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate SOAP note');
    } finally {
      setProcessing(false);
    }
  };

  if (readonly) return null;

  const allSymptoms = entities.flatMap((e) => e.symptoms || []);
  const allSigns = entities.flatMap((e) => e.signs || []);
  const allDrugs = entities.flatMap((e) => e.drugs || []);
  const allNegated = entities.flatMap((e) => e.negatedTerms || []);

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-cureocity-text flex items-center gap-2">
          Ambient Listening
          {isRecording && (
            <span className="inline-flex h-3 w-3 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
            </span>
          )}
        </h3>
        <div className="flex gap-2">
          {!isRecording ? (
            <button
              onClick={startRecording}
              disabled={processing}
              className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition text-sm font-medium disabled:opacity-50"
            >
              Start Recording
            </button>
          ) : (
            <button
              onClick={stopRecording}
              className="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-800 transition text-sm font-medium"
            >
              Stop & Process
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-3 p-2 bg-red-50 border border-red-200 text-red-700 rounded text-sm">
          {error}
        </div>
      )}

      {/* Live transcript */}
      {(transcript || liveText) && (
        <div className="mb-4">
          <p className="text-xs text-cureocity-muted mb-1 font-medium">Transcript</p>
          <div className="bg-slate-50 rounded-lg p-3 text-sm text-cureocity-text max-h-40 overflow-y-auto">
            {transcript}
            {liveText && <span className="text-slate-400 italic">{liveText}</span>}
          </div>
        </div>
      )}

      {/* Extracted entities */}
      {entities.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs text-cureocity-muted font-medium">Extracted Entities</p>

          {allSymptoms.length > 0 && (
            <div className="flex flex-wrap gap-1">
              <span className="text-xs text-cureocity-muted mr-1">Symptoms:</span>
              {allSymptoms.map((s, i) => (
                <span key={i} className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-xs">
                  {s.term}
                  {s.duration && ` (${s.duration})`}
                </span>
              ))}
            </div>
          )}

          {allSigns.length > 0 && (
            <div className="flex flex-wrap gap-1">
              <span className="text-xs text-cureocity-muted mr-1">Signs:</span>
              {allSigns.map((s, i) => (
                <span key={i} className="px-2 py-0.5 bg-green-100 text-green-800 rounded text-xs">
                  {s}
                </span>
              ))}
            </div>
          )}

          {allDrugs.length > 0 && (
            <div className="flex flex-wrap gap-1">
              <span className="text-xs text-cureocity-muted mr-1">Drugs mentioned:</span>
              {allDrugs.map((d, i) => (
                <span key={i} className="px-2 py-0.5 bg-purple-100 text-purple-800 rounded text-xs">
                  {d.name}
                </span>
              ))}
            </div>
          )}

          {allNegated.length > 0 && (
            <div className="flex flex-wrap gap-1">
              <span className="text-xs text-cureocity-muted mr-1">Negated:</span>
              {allNegated.map((n, i) => (
                <span key={i} className="px-2 py-0.5 bg-slate-200 text-slate-600 rounded text-xs line-through">
                  {n}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SOAP note generation button */}
      {transcript && !isRecording && (
        <div className="mt-4 pt-4 border-t border-slate-100">
          <button
            onClick={generateSOAP}
            disabled={processing}
            className="px-4 py-2 bg-cureocity-primary text-white rounded-lg hover:bg-teal-800 transition text-sm font-medium disabled:opacity-50"
          >
            {processing ? 'Generating...' : 'Generate SOAP Note'}
          </button>
        </div>
      )}

      {processing && (
        <div className="mt-3 flex items-center gap-2 text-sm text-cureocity-muted">
          <div className="animate-spin h-4 w-4 border-2 border-cureocity-primary border-t-transparent rounded-full" />
          Processing with AI...
        </div>
      )}
    </div>
  );
}
