import { useState } from 'react';
import { useVoiceRecorder } from '../hooks/useVoiceRecorder';

function formatDuration(ms) {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const IntakePanel = ({ onProcess, isProcessing, extraction, extractionError }) => {
  const [text, setText] = useState('');
  const {
    isRecording,
    audioBlob,
    audioUrl,
    durationMs,
    error: voiceError,
    supported: voiceSupported,
    startRecording,
    stopRecording,
    clearRecording,
    getBase64,
  } = useVoiceRecorder();

  const handleAnalyze = async () => {
    if (audioBlob) {
      const audio = await getBase64();
      onProcess({ text, audio });
    } else {
      onProcess(text);
    }
  };

  const handleClear = () => {
    setText('');
    clearRecording();
  };

  const canAnalyze = !isProcessing && !isRecording && (text.trim() || audioBlob);

  return (
    <div className="step-panel active" id="step-1">
      <div className="mod-header">
        <h2 className="mod-title">Intake & Chief Complaint</h2>
        <div className="mod-desc">Record the patient's primary concern and current history. The Clinical AI will process this in real-time.</div>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-title">📝 Clinical Narrative</div>
          <div className="card-sub">AI-Assisted Processing</div>
        </div>
        <div className="card-body">
          <div className="field">
            <div className="field-label">
              <label>Chief Complaint & HPI</label>
              <span className="field-hint">Type, dictate, or speak. English, Indian English, or Manglish — Gemini handles abbreviations like k/c/o, h/o, HTN, DM.</span>
            </div>
            <textarea
              id="hpi-input"
              placeholder="e.g. 62yo M, k/c/o HTN+DM, c/o severe chest pain radiating to left arm × 2hrs, sweating. BP 90/60, PR 110."
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={isRecording}
            ></textarea>
          </div>

          {voiceSupported && (
            <div style={{
              marginBottom: '12px', padding: '10px 12px', borderRadius: 'var(--r)',
              background: isRecording ? 'rgba(220, 38, 38, 0.06)' : 'var(--surface2)',
              border: `1.5px solid ${isRecording ? 'var(--danger)' : 'var(--border)'}`,
              display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap',
            }}>
              {!isRecording && !audioBlob && (
                <button className="btn btn-secondary" onClick={startRecording} disabled={isProcessing}>
                  🎤 Record voice
                </button>
              )}

              {isRecording && (
                <>
                  <span style={{
                    width: '10px', height: '10px', borderRadius: '50%',
                    background: 'var(--danger)', display: 'inline-block',
                    animation: 'pulse 1.2s ease-in-out infinite',
                  }} />
                  <strong style={{ fontSize: '13px' }}>Recording…</strong>
                  <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '13px', color: 'var(--muted)' }}>
                    {formatDuration(durationMs)}
                  </span>
                  <button className="btn btn-secondary" onClick={stopRecording} style={{ marginLeft: 'auto' }}>
                    ⏹ Stop
                  </button>
                </>
              )}

              {!isRecording && audioBlob && audioUrl && (
                <>
                  <audio src={audioUrl} controls style={{ flex: 1, minWidth: '200px', height: '32px' }} />
                  <span style={{ fontSize: '11.5px', color: 'var(--muted)' }}>
                    {formatDuration(durationMs)}
                  </span>
                  <button className="btn btn-secondary" onClick={clearRecording} disabled={isProcessing}>
                    🗑 Re-record
                  </button>
                </>
              )}
            </div>
          )}

          {voiceError && (
            <div style={{
              marginBottom: '10px', padding: '8px 12px', borderRadius: 'var(--r)',
              fontSize: '12px', color: 'var(--warn)', background: 'var(--surface2)',
              border: '1px solid var(--warn)',
            }}>
              ⚠ {voiceError}
            </div>
          )}

          <div className="btn-row">
            <button
              className="btn btn-primary"
              onClick={handleAnalyze}
              disabled={!canAnalyze}
            >
              {isProcessing
                ? '⏳ Analyzing with Gemini…'
                : audioBlob
                ? '⚡ Analyze recording'
                : '⚡ Analyze Narrative'}
            </button>
            <button className="btn btn-secondary" onClick={handleClear} disabled={isRecording}>
              Clear
            </button>
          </div>

          {extractionError && (
            <div style={{
              marginTop: '12px', padding: '10px 12px', borderRadius: 'var(--r)',
              background: 'var(--surface2)', border: '1.5px solid var(--warn)',
              fontSize: '12px', color: 'var(--warn)',
            }}>
              ⚠ Gemini extraction failed: {extractionError}. Falling back to local pipeline — your case is still being analyzed.
            </div>
          )}

          {extraction && !extractionError && (
            <div style={{
              marginTop: '14px', padding: '12px 14px', borderRadius: 'var(--r)',
              background: 'var(--surface2)', border: '1px solid var(--border)',
              fontSize: '12.5px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <strong style={{ fontSize: '11.5px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)' }}>
                  ✦ Gemini extraction {extraction._meta?.inputModality === 'audio' ? '(voice)' : ''}
                </strong>
                <span style={{ fontSize: '10.5px', color: 'var(--muted)' }}>
                  {(extraction.confidence * 100).toFixed(0)}% confident · {extraction._meta?.latencyMs}ms · ₹{extraction._meta?.costInr?.toFixed(4)}
                </span>
              </div>

              {extraction.transcript && (
                <div style={{ marginBottom: '8px', padding: '8px 10px', background: 'var(--surface)', borderRadius: '6px', borderLeft: '3px solid var(--info)' }}>
                  <div style={{ fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)', marginBottom: '4px' }}>
                    Transcript
                  </div>
                  <div style={{ lineHeight: 1.45 }}>{extraction.transcript}</div>
                </div>
              )}

              {extraction.chief_complaint && (
                <div style={{ marginBottom: '6px' }}>
                  <span style={{ color: 'var(--muted)' }}>Chief complaint: </span>
                  <strong>{extraction.chief_complaint}</strong>
                </div>
              )}

              <div style={{ marginBottom: '6px', lineHeight: 1.45 }}>
                <span style={{ color: 'var(--muted)' }}>Normalized: </span>
                {extraction.normalized_hpi}
              </div>

              <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', fontSize: '11.5px', color: 'var(--muted)' }}>
                {extraction.demographics?.age != null && (
                  <span>{extraction.demographics.age}yo · {extraction.demographics.sex}</span>
                )}
                {extraction.symptom_duration && <span>Duration: {extraction.symptom_duration}</span>}
                {extraction.comorbidities?.length > 0 && (
                  <span>Comorbidities: {extraction.comorbidities.join(', ')}</span>
                )}
                {extraction.medications?.length > 0 && (
                  <span>Meds: {extraction.medications.join(', ')}</span>
                )}
                {extraction.vitals_mentioned?.length > 0 && (
                  <span>Vitals: {extraction.vitals_mentioned.map(v => `${v.type} ${v.value}`).join(' · ')}</span>
                )}
              </div>

              {extraction.red_flag_phrases?.length > 0 && (
                <div style={{ marginTop: '8px', fontSize: '11.5px', color: 'var(--danger)' }}>
                  ⚑ Red-flag cues: {extraction.red_flag_phrases.join('; ')}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default IntakePanel;
