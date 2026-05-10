import { useCallback, useState } from 'react';
import LivePanel from './LivePanel';
import { useLiveSession } from '../hooks/useLiveSession';

/**
 * LiveConsultPanel — the ambient consult experience.
 *
 * Big mic button → captures the consult in 8-second chunks → Gemini
 * extracts deltas → engine state updates → LivePanel sidebar shows the
 * differential / red flags / next questions update live.
 *
 * Caller passes:
 *   - engineState        — the live engine snapshot (re-rendered as state mutates)
 *   - allergies, drugs   — passed through to LivePanel
 *   - onSync             — invoked after each chunk has been merged so the
 *                          parent (WorkflowApp) can re-snapshot the engine
 *                          into its React state
 *   - onConsultComplete  — invoked when the doctor stops the consult.
 *                          Receives the transcript + chunk count for the
 *                          handoff into the existing 7-step review flow.
 *   - onCancel           — back to the previous view without saving
 *   - orgId              — for the server-side cost guardrail
 */

const ConsentBanner = ({ onAccept, onReject }) => (
  <div style={{
    background: 'var(--warn-t)', border: '2px solid var(--warn)',
    borderRadius: 'var(--r-lg)', padding: '14px 18px', marginBottom: '14px',
  }}>
    <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--warn)', marginBottom: '6px' }}>
      ⚠ Patient Consent Required Before Recording
    </div>
    <div style={{ fontSize: '12.5px', color: 'var(--ink2)', lineHeight: 1.6, marginBottom: '10px' }}>
      Confirm with the patient (verbally) that you may record this consultation
      to assist with structured note-taking. Audio is processed in India,
      transcribed, and <strong>discarded after the session</strong> (unless
      you separately enable retention). Patient may withdraw consent at any
      time. Per <strong>DPDP Act 2023</strong> and the
      <strong> Telemedicine Practice Guidelines 2020</strong>, this consent
      must be on record before the AI tool is used.
    </div>
    <div className="btn-row" style={{ marginTop: '4px' }}>
      <button className="btn btn-primary btn-sm" onClick={onAccept}>
        ✓ Patient consents — start recording
      </button>
      <button className="btn btn-secondary btn-sm" onClick={onReject}>
        Cancel
      </button>
    </div>
  </div>
);

const LiveConsultPanel = ({
  engineState,
  allergies = [],
  drugs = [],
  onSync,
  onConsultComplete,
  onCancel,
  orgId = null,
}) => {
  const [consented, setConsented] = useState(false);

  const handleSync = useCallback(() => { onSync?.(); }, [onSync]);

  const session = useLiveSession({ orgId, onSync: handleSync });

  const isRecording = session.state === 'recording';
  const isRequesting = session.state === 'requesting-permission';

  const handleStart = async () => {
    if (!consented) return;
    await session.start();
  };

  const handleEnd = () => {
    session.stop();
    onConsultComplete?.({
      transcript: session.transcript,
      chunkCount: session.chunkCount,
      totalSpendInr: session.totalSpendInr,
      redFlagsHeard: session.redFlagsHeard,
    });
  };

  return (
    <div className="step-panel active">
      <div className="mod-header">
        <div className="mod-title">🎙 Live Ambient Consult</div>
        <div className="mod-desc">
          Speak naturally with the patient. The AI listens in 8-second chunks,
          transcribes the conversation, and updates the differential, red
          flags, and recommended next questions in real time. The 7-step
          review flow auto-fills from the captured data when you end the
          consult.
        </div>
      </div>

      {!consented && !isRecording && (
        <ConsentBanner onAccept={() => setConsented(true)} onReject={onCancel} />
      )}

      {/* Cost / latency strip — only shown when we have data */}
      {(session.chunkCount > 0 || session.budget) && (
        <div style={{
          display: 'flex', gap: '14px', flexWrap: 'wrap',
          padding: '8px 14px', background: 'var(--surface2)',
          border: '1px solid var(--border)', borderRadius: 'var(--r)',
          marginBottom: '12px', fontSize: '11.5px', fontFamily: 'var(--font-mono)',
          color: 'var(--ink3)',
        }}>
          <span>Chunks: <strong style={{ color: 'var(--ink)' }}>{session.chunkCount}</strong></span>
          <span>Spend: <strong style={{ color: 'var(--accent)' }}>₹{session.totalSpendInr.toFixed(2)}</strong></span>
          <span>p50 latency: <strong>{session.latencyMsP50}ms</strong></span>
          {session.budget?.near_cap && (
            <span style={{ color: 'var(--warn)', fontWeight: 700 }}>
              ⚠ {Math.round((session.budget.today_spend_inr / session.budget.cap_inr) * 100)}% of today's org budget
            </span>
          )}
        </div>
      )}

      <div className="row2" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '14px' }}>
        {/* LEFT: control + transcript */}
        <div>
          <div className="card" style={{ marginBottom: '14px' }}>
            <div className="card-head">
              <div className="card-title">
                {isRecording ? '🔴 Recording' : isRequesting ? '⏳ Requesting microphone' : '🎙 Ready'}
              </div>
              {session.error && (
                <div style={{ fontSize: '11px', color: 'var(--danger)' }}>
                  {String(session.error.message || session.error)}
                </div>
              )}
            </div>
            <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              {!isRecording ? (
                <button
                  className="btn btn-primary"
                  onClick={handleStart}
                  disabled={!consented || isRequesting}
                  style={{ fontSize: '14px', padding: '10px 18px' }}
                >
                  {isRequesting ? 'Requesting…' : '⚡ Start Live Consult'}
                </button>
              ) : (
                <button
                  className="btn btn-secondary"
                  onClick={handleEnd}
                  style={{ fontSize: '14px', padding: '10px 18px', borderColor: 'var(--danger)', color: 'var(--danger)' }}
                >
                  ⏸ End Consult & Review
                </button>
              )}
              <span style={{ fontSize: '11.5px', color: 'var(--ink4)' }}>
                {isRecording
                  ? '8-second chunks streaming to Gemini · India residency · Audio discarded after extraction'
                  : 'Click start when ready. The patient must have consented above.'}
              </span>
            </div>
          </div>

          {/* Transcript */}
          {(session.transcript || isRecording) && (
            <div className="card">
              <div className="card-head">
                <div className="card-title">📝 Live Transcript</div>
                <div className="card-sub">{session.transcript.length} chars · verbatim · code-mixing preserved</div>
              </div>
              <div className="card-body" style={{
                fontFamily: 'var(--font-sans)', fontSize: '13px', lineHeight: 1.7,
                color: 'var(--ink2)', maxHeight: '420px', overflowY: 'auto',
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}>
                {session.transcript || (
                  <span style={{ color: 'var(--ink4)', fontStyle: 'italic' }}>
                    Listening… first chunk will appear in ~10 seconds.
                  </span>
                )}
                {isRecording && (
                  <span style={{
                    display: 'inline-block', width: '7px', height: '14px',
                    background: 'var(--accent)', verticalAlign: 'middle',
                    marginLeft: '3px', animation: 'blink 1s steps(2) infinite',
                  }} />
                )}
              </div>
            </div>
          )}

          {/* Red flag phrases the model has surfaced */}
          {session.redFlagsHeard.length > 0 && (
            <div className="card" style={{ marginTop: '14px', borderColor: 'var(--danger)' }}>
              <div className="card-head" style={{ background: 'var(--danger-t)' }}>
                <div className="card-title">⚑ Red Flag Phrases Heard ({session.redFlagsHeard.length})</div>
              </div>
              <div className="card-body p0">
                {session.redFlagsHeard.map((phrase, i) => (
                  <div key={`rf-${i}`} style={{
                    padding: '8px 14px', borderBottom: '1px solid var(--border)',
                    fontSize: '12px', color: 'var(--danger)',
                  }}>
                    ⚑ "{phrase}"
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT: live differential panel — reused from Slice 4 */}
        <div>
          <LivePanel
            isProcessing={isRecording && session.chunkCount === 0}
            engineState={engineState}
            drugs={drugs}
            allergies={allergies}
          />
        </div>
      </div>

      {!isRecording && (
        <div className="btn-row" style={{ marginTop: '14px' }}>
          <button className="btn btn-secondary" onClick={onCancel}>
            ← Switch back to typing mode
          </button>
        </div>
      )}
    </div>
  );
};

export default LiveConsultPanel;
