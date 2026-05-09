import { useState } from 'react';

const IntakePanel = ({ onProcess, isProcessing, extraction, extractionError }) => {
  const [text, setText] = useState('');

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
              <span className="field-hint">Type or dictate. English, Indian English, or Manglish — Gemini handles abbreviations like k/c/o, h/o, HTN, DM.</span>
            </div>
            <textarea
              id="hpi-input"
              placeholder="e.g. 62yo M, k/c/o HTN+DM, c/o severe chest pain radiating to left arm × 2hrs, sweating. BP 90/60, PR 110."
              value={text}
              onChange={(e) => setText(e.target.value)}
            ></textarea>
          </div>
          <div className="btn-row">
            <button
              className="btn btn-primary"
              onClick={() => onProcess(text)}
              disabled={isProcessing || !text.trim()}
            >
              {isProcessing ? '⏳ Analyzing with Gemini…' : '⚡ Analyze Narrative'}
            </button>
            <button className="btn btn-secondary" onClick={() => setText('')}>Clear</button>
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
                  ✦ Gemini extraction
                </strong>
                <span style={{ fontSize: '10.5px', color: 'var(--muted)' }}>
                  {(extraction.confidence * 100).toFixed(0)}% confident · {extraction._meta?.latencyMs}ms · ₹{extraction._meta?.costInr?.toFixed(4)}
                </span>
              </div>

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
