import { useCallback, useState } from 'react';
import LivePanel from './LivePanel';
import { useLiveSession } from '../hooks/useLiveSession';

/**
 * LiveConsultPanel — the ambient consult experience.
 *
 * Architecture (post-fix):
 *   - Every chunk's lifecycle is rendered visibly: encoding → sending
 *     → success | failed. Doctors are NEVER blind to what's happening.
 *   - Errors surface in a red banner at the top of the panel — not in
 *     11px subtext that gets missed.
 *   - "Test pipeline" button records 3s and shows the full response
 *     so the doctor can verify mic + AI before a real consult.
 *   - "End Consult & Review" no longer auto-jumps to Step 2. It shows
 *     a review card; the doctor explicitly clicks Continue once they've
 *     confirmed what was captured. Until then they can keep recording.
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

const STATUS_COLOR = {
  encoding: { fg: 'var(--ink3)', bg: 'var(--surface2)', icon: '⋯' },
  sending:  { fg: 'var(--accent)', bg: 'var(--en-t)', icon: '↗' },
  success:  { fg: 'var(--ok)', bg: 'var(--ok-t)', icon: '✓' },
  failed:   { fg: 'var(--danger)', bg: 'var(--danger-t)', icon: '✗' },
};

const ChunkRow = ({ chunk }) => {
  const status = STATUS_COLOR[chunk.status] || STATUS_COLOR.encoding;
  const transcriptPreview = chunk.transcriptDelta?.slice(0, 80) || '';
  const entityCount = (chunk.vitalsCount || 0) + (chunk.labsCount || 0) +
                      (chunk.drugsCount || 0) + (chunk.allergiesCount || 0);
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '40px 70px 1fr auto',
      gap: '10px', alignItems: 'center',
      padding: '8px 12px',
      borderBottom: '1px solid var(--border)',
      background: chunk.status === 'failed' ? 'rgba(192,57,43,0.05)' : 'transparent',
    }}>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: '11px',
        color: status.fg, fontWeight: 700,
      }}>
        #{chunk.sequence}
      </span>
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        padding: '3px 8px', borderRadius: '999px',
        background: status.bg, color: status.fg,
        fontSize: '10.5px', fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '.4px',
      }}>
        {status.icon} {chunk.status}
      </span>
      <div style={{ minWidth: 0 }}>
        {chunk.status === 'failed' ? (
          <div style={{ fontSize: '11.5px', color: 'var(--danger)', fontFamily: 'var(--font-mono)' }}>
            {chunk.error}
          </div>
        ) : chunk.status === 'success' ? (
          <div style={{ fontSize: '11.5px', color: 'var(--ink2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {transcriptPreview ? `"${transcriptPreview}${chunk.transcriptDelta.length > 80 ? '…' : ''}"` : <em style={{ color: 'var(--ink4)' }}>(no speech detected)</em>}
            {entityCount > 0 && (
              <span style={{ marginLeft: '6px', fontSize: '10.5px', color: 'var(--accent)' }}>
                +{chunk.vitalsCount > 0 ? `${chunk.vitalsCount} vitals ` : ''}
                {chunk.labsCount > 0 ? `${chunk.labsCount} labs ` : ''}
                {chunk.drugsCount > 0 ? `${chunk.drugsCount} drugs ` : ''}
                {chunk.allergiesCount > 0 ? `${chunk.allergiesCount} allergies` : ''}
              </span>
            )}
          </div>
        ) : (
          <div style={{ fontSize: '11.5px', color: 'var(--ink4)', fontStyle: 'italic' }}>
            {chunk.status === 'encoding' ? `encoding ${chunk.sizeKb || '?'} KB blob…` : `sending ${chunk.encodedKb || '?'} KB to Gemini…`}
          </div>
        )}
      </div>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: '10px',
        color: 'var(--ink4)',
      }}>
        {chunk.latencyMs ? `${chunk.latencyMs}ms` : ''}
        {chunk.costInr > 0 && ` · ₹${chunk.costInr.toFixed(3)}`}
      </span>
    </div>
  );
};

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
  const [reviewing, setReviewing] = useState(false);

  const handleSync = useCallback(() => { onSync?.(); }, [onSync]);

  const session = useLiveSession({ orgId, onSync: handleSync });

  const isRecording = session.state === 'recording';
  const isRequesting = session.state === 'requesting-permission';

  const successCount = session.chunks.filter(c => c.status === 'success').length;
  const failedCount  = session.chunks.filter(c => c.status === 'failed').length;
  const totalChunks  = session.chunks.length;

  const handleStart = async () => {
    if (!consented) return;
    setReviewing(false);
    await session.start();
  };

  const handleEnd = () => {
    session.stop();
    setReviewing(true);
  };

  const handleTestPipeline = async () => {
    setReviewing(false);
    await session.runPipelineTest();
  };

  const handleContinue = () => {
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
          Speak naturally with the patient. The AI listens in 8-second chunks
          and surfaces the transcript, differential, and red flags in real
          time. Every chunk's status is shown below — if anything fails, you
          see exactly why.
        </div>
      </div>

      {/* Prominent error banner — never hide failures in tiny text */}
      {(session.lastError || session.error) && (
        <div style={{
          background: 'var(--danger-t)',
          border: '2px solid var(--danger)',
          borderRadius: 'var(--r-lg)',
          padding: '12px 16px',
          marginBottom: '14px',
          display: 'flex',
          gap: '10px',
          alignItems: 'flex-start',
        }}>
          <span style={{ fontSize: '18px' }}>⚠</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--danger)', marginBottom: '4px' }}>
              Pipeline error
            </div>
            <div style={{ fontSize: '12.5px', color: 'var(--ink2)', fontFamily: 'var(--font-mono)' }}>
              {session.lastError || String(session.error?.message || session.error)}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--ink3)', marginTop: '6px' }}>
              Try the <strong>Test Pipeline</strong> button below to isolate the issue.
              Common causes: mic blocked, GEMINI_API_KEY missing on server, network blocked.
            </div>
          </div>
        </div>
      )}

      {!consented && !isRecording && !reviewing && (
        <ConsentBanner onAccept={() => setConsented(true)} onReject={onCancel} />
      )}

      {/* Cost / latency strip */}
      {(totalChunks > 0 || session.budget) && (
        <div style={{
          display: 'flex', gap: '14px', flexWrap: 'wrap',
          padding: '8px 14px', background: 'var(--surface2)',
          border: '1px solid var(--border)', borderRadius: 'var(--r)',
          marginBottom: '12px', fontSize: '11.5px', fontFamily: 'var(--font-mono)',
          color: 'var(--ink3)',
        }}>
          <span>Sent: <strong style={{ color: 'var(--ink)' }}>{totalChunks}</strong></span>
          <span>OK: <strong style={{ color: 'var(--ok)' }}>{successCount}</strong></span>
          <span>Failed: <strong style={{ color: failedCount > 0 ? 'var(--danger)' : 'var(--ink3)' }}>{failedCount}</strong></span>
          <span>Spend: <strong style={{ color: 'var(--accent)' }}>₹{session.totalSpendInr.toFixed(3)}</strong></span>
          <span>p50 latency: <strong>{session.latencyMsP50}ms</strong></span>
          {session.budget?.near_cap && (
            <span style={{ color: 'var(--warn)', fontWeight: 700 }}>
              ⚠ {Math.round((session.budget.today_spend_inr / session.budget.cap_inr) * 100)}% of today's org budget
            </span>
          )}
        </div>
      )}

      <div className="row2" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '14px' }}>
        {/* LEFT: control + transcript + chunk feed */}
        <div>
          <div className="card" style={{ marginBottom: '14px' }}>
            <div className="card-head">
              <div className="card-title">
                {isRecording ? '🔴 Recording' : isRequesting ? '⏳ Requesting microphone' : reviewing ? '✓ Recording stopped — review captured data' : '🎙 Ready'}
              </div>
            </div>
            <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              {!isRecording && !reviewing && (
                <>
                  <button
                    className="btn btn-primary"
                    onClick={handleStart}
                    disabled={!consented || isRequesting}
                    style={{ fontSize: '14px', padding: '10px 18px' }}
                  >
                    {isRequesting ? 'Requesting…' : '⚡ Start Live Consult'}
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={handleTestPipeline}
                    disabled={isRequesting}
                    title="Records 3 seconds and shows the full pipeline response so you can verify mic + AI before a real consult."
                  >
                    🧪 Test Pipeline (3s)
                  </button>
                </>
              )}
              {isRecording && (
                <button
                  className="btn btn-secondary"
                  onClick={handleEnd}
                  style={{ fontSize: '14px', padding: '10px 18px', borderColor: 'var(--danger)', color: 'var(--danger)' }}
                >
                  ⏸ End Consult
                </button>
              )}
              {reviewing && (
                <>
                  <button
                    className="btn btn-primary"
                    onClick={handleContinue}
                    style={{ fontSize: '14px', padding: '10px 18px' }}
                  >
                    ✓ Continue to Review →
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={handleStart} disabled={!consented}>
                    ↻ Resume Recording
                  </button>
                  <button className="btn btn-secondary btn-sm" onClick={() => { session.resetSession(); setReviewing(false); }}>
                    Discard & Start Over
                  </button>
                </>
              )}
              <span style={{ fontSize: '11px', color: 'var(--ink4)' }}>
                {isRecording
                  ? '8s chunks · India (Mumbai) · Audio discarded after extraction'
                  : reviewing
                    ? `${successCount} chunk${successCount === 1 ? '' : 's'} captured · ${failedCount} failed`
                    : 'Test the pipeline first if this is your first consult here.'}
              </span>
            </div>
          </div>

          {/* Pipeline event feed — visible at all times so failures
              are NEVER silent. */}
          {totalChunks > 0 && (
            <div className="card" style={{ marginBottom: '14px' }}>
              <div className="card-head">
                <div className="card-title">📡 Pipeline events ({totalChunks})</div>
                <div className="card-sub">Live chunk-by-chunk status. Click a row to see the full transcript delta.</div>
              </div>
              <div className="card-body p0" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                {[...session.chunks].reverse().map(c => (
                  <ChunkRow key={c.sequence} chunk={c} />
                ))}
              </div>
            </div>
          )}

          {/* Diarized transcript — doctor / patient turns interleaved.
              Falls back to the verbatim string when speakers haven't
              been resolved yet (e.g., test pipeline silence). */}
          {(session.turns?.length > 0 || session.transcript || isRecording) && (
            <div className="card">
              <div className="card-head">
                <div className="card-title">📝 Live Conversation</div>
                <div className="card-sub">
                  {session.turns?.length > 0
                    ? `${session.turns.length} turn${session.turns.length === 1 ? '' : 's'} · doctor + patient diarized`
                    : `${session.transcript.length} chars · verbatim`}
                </div>
              </div>
              <div className="card-body" style={{
                fontFamily: 'var(--font-sans)', fontSize: '13px', lineHeight: 1.7,
                color: 'var(--ink2)', maxHeight: '360px', overflowY: 'auto',
              }}>
                {session.turns?.length > 0 ? (
                  session.turns.map((t, i) => {
                    const isDoctor = t.speaker === 'doctor';
                    const isPatient = t.speaker === 'patient';
                    const color = isDoctor ? 'var(--ok)' : isPatient ? 'var(--info)' : 'var(--ink4)';
                    const bg = isDoctor ? 'var(--ok-t)' : isPatient ? 'var(--info-t)' : 'var(--surface2)';
                    const label = isDoctor ? 'D' : isPatient ? 'P' : '?';
                    return (
                      <div
                        key={`${t.chunk}-${i}`}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '28px 1fr',
                          gap: '8px',
                          marginBottom: '6px',
                        }}
                      >
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '24px',
                            height: '20px',
                            borderRadius: '4px',
                            background: bg,
                            color,
                            fontSize: '10.5px',
                            fontWeight: 800,
                            marginTop: '2px',
                          }}
                          title={t.speaker}
                        >
                          {label}
                        </span>
                        <span style={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap', color: isDoctor ? 'var(--ink)' : 'var(--ink2)' }}>
                          {t.text}
                        </span>
                      </div>
                    );
                  })
                ) : (
                  <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {session.transcript || (
                      <span style={{ color: 'var(--ink4)', fontStyle: 'italic' }}>
                        Listening… first chunk arrives in ~10 seconds.
                      </span>
                    )}
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

        {/* RIGHT: live co-pilot — "Ask next" + differential panel */}
        <div>
          {session.nextQuestion && (
            <div style={{
              background: 'linear-gradient(135deg, var(--en-t), var(--surface))',
              border: '2px solid var(--accent)',
              borderRadius: 'var(--r-lg)',
              padding: '12px 14px',
              marginBottom: '12px',
              boxShadow: '0 4px 12px rgba(10,122,110,0.12)',
              animation: 'fadeInUp .25s ease',
            }}>
              <div style={{
                fontSize: '9.5px', fontWeight: 800,
                color: 'var(--accent)', textTransform: 'uppercase',
                letterSpacing: '.8px', marginBottom: '6px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <span>💡 Ask next</span>
                <button
                  onClick={session.dismissNextQuestion}
                  title="Dismiss"
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--ink4)', fontSize: '12px', padding: 0,
                  }}
                >
                  ✕
                </button>
              </div>
              <div style={{
                fontSize: '14px', fontWeight: 700,
                color: 'var(--ink)', lineHeight: 1.4, marginBottom: '4px',
              }}>
                "{session.nextQuestion.text}"
              </div>
              {session.nextQuestion.reason && (
                <div style={{
                  fontSize: '11px', color: 'var(--ink3)',
                  fontStyle: 'italic', lineHeight: 1.5,
                }}>
                  {session.nextQuestion.reason}
                </div>
              )}
            </div>
          )}
          <LivePanel
            isProcessing={isRecording && session.chunkCount === 0}
            engineState={engineState}
            drugs={drugs}
            allergies={allergies}
          />
        </div>
      </div>

      {!isRecording && !reviewing && (
        <div className="btn-row" style={{ marginTop: '14px' }}>
          <button className="btn btn-secondary" onClick={onCancel}>
            ← Switch to typing mode
          </button>
        </div>
      )}
    </div>
  );
};

export default LiveConsultPanel;
