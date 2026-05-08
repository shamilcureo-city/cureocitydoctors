import { useState } from 'react';

const AssessmentPanel = ({ engineState, onNext, onPrev }) => {
  const [activeTab, setActiveTab] = useState('summary');

  const diffs = engineState.differentials || { t1: [], t2: [], t3: [] };
  const redFlags = engineState.redFlags || [];
  const nextSteps = engineState.nextSteps || [];

  const allDiffs = [...diffs.t3, ...diffs.t1, ...diffs.t2];

  return (
    <div className="step-panel active">
      <div className="mod-header">
        <div className="mod-title">Clinical Assessment</div>
        <div className="mod-desc">Complete integrated analysis — Clinical Summary, Treatment Protocols, and Full Report.</div>
      </div>

      <div className="assess-tabs">
        <button className={`assess-tab ${activeTab === 'summary' ? 'active' : ''}`} onClick={() => setActiveTab('summary')}>📋 Clinical Summary</button>
        <button className={`assess-tab ${activeTab === 'treatment' ? 'active' : ''}`} onClick={() => setActiveTab('treatment')}>💊 Treatment Protocols</button>
        <button className={`assess-tab ${activeTab === 'report' ? 'active' : ''}`} onClick={() => setActiveTab('report')}>📄 Full Report</button>
        <button className={`assess-tab ${activeTab === 'ai' ? 'active' : ''}`} onClick={() => setActiveTab('ai')} style={{color:'var(--accent)', fontWeight:700}}>🤖 AI Reasoning</button>
      </div>

      {/* ── Clinical Summary Tab ── */}
      {activeTab === 'summary' && (
        <div className="assess-tab-pane active">
          {allDiffs.length > 0 ? (
            <>
              {/* Red Flags */}
              {redFlags.length > 0 && (
                <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: '14px' }}>
                  <div className="card-head" style={{ background: 'var(--danger-t)' }}>
                    <div className="card-title">⚑ Red Flags ({redFlags.length})</div>
                  </div>
                  <div className="card-body p0">
                    {redFlags.map((rf, i) => (
                      <div key={rf.msg || rf.cond || `rf-${i}`} style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', fontSize: '12px' }}>
                        <span style={{ color: 'var(--danger)', fontWeight: 700 }}>⚑</span> {rf.msg}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Differential Diagnosis */}
              <div className="card" style={{ marginBottom: '14px' }}>
                <div className="card-head">
                  <div className="card-title">🔬 Differential Diagnosis</div>
                </div>
                <div className="card-body p0">
                  {/* T3 - Must Not Miss */}
                  {diffs.t3.length > 0 && (
                    <>
                      <div style={{ padding: '8px 16px', fontSize: '9.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.8px', color: 'var(--danger)', background: 'var(--danger-t)' }}>
                        Must Not Miss (T3)
                      </div>
                      {diffs.t3.map((c, i) => (
                        <div key={c.id || `t3-${i}`} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontWeight: 700, color: 'var(--danger)' }}>{c.name || c.kb?.name}</span>
                            <span className="badge badge-danger" style={{ fontSize: '8px' }}>T3</span>
                            {c.kb?.icd10 && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--ink4)' }}>{c.kb.icd10}</span>}
                          </div>
                          {c.reason && <div style={{ fontSize: '11px', color: 'var(--ink2)', marginTop: '4px' }}>{c.reason}</div>}
                        </div>
                      ))}
                    </>
                  )}

                  {/* T1 - Most Likely */}
                  {diffs.t1.length > 0 && (
                    <>
                      <div style={{ padding: '8px 16px', fontSize: '9.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.8px', color: 'var(--ok)', background: 'var(--ok-t)' }}>
                        Most Likely (T1)
                      </div>
                      {diffs.t1.map((c, i) => (
                        <div key={c.id || `t1-${i}`} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{c.name || c.kb?.name}</span>
                            <span className="badge badge-ok" style={{ fontSize: '8px' }}>T1</span>
                            {c.likelihood_pct && <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--ink4)' }}>{c.likelihood_pct}%</span>}
                          </div>
                          {c.reason && <div style={{ fontSize: '11px', color: 'var(--ink2)', marginTop: '4px' }}>{c.reason}</div>}
                        </div>
                      ))}
                    </>
                  )}

                  {/* T2 - Less Likely */}
                  {diffs.t2.length > 0 && (
                    <>
                      <div style={{ padding: '8px 16px', fontSize: '9.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.8px', color: 'var(--info)', background: 'var(--info-t)' }}>
                        Less Likely (T2)
                      </div>
                      {diffs.t2.map((c, i) => (
                        <div key={c.id || `t2-${i}`} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontWeight: 600, color: 'var(--ink2)' }}>{c.name || c.kb?.name}</span>
                            <span className="badge badge-info" style={{ fontSize: '8px' }}>T2</span>
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </div>

              {/* Next Steps */}
              {nextSteps.length > 0 && (
                <div className="card">
                  <div className="card-head"><div className="card-title">📋 Recommended Next Steps</div></div>
                  <div className="card-body p0">
                    {nextSteps.map((step, i) => (
                      <div key={`${step.type || 'step'}-${step.action || ''}-${i}`} style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', fontSize: '12px' }}>
                        <span style={{ marginRight: '6px' }}>{step.icon || '→'}</span>
                        <span style={{ fontWeight: step.urgency === 'urgent' ? 700 : 400, color: step.urgency === 'urgent' ? 'var(--danger)' : 'var(--ink)' }}>
                          {step.action}
                        </span>
                        {step.why && <div style={{ fontSize: '10px', color: 'var(--ink4)', marginTop: '2px', marginLeft: '20px' }}>{step.why}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="empty-state"><div className="empty-state-icon">📋</div>Complete previous steps to generate assessment.</div>
          )}
        </div>
      )}

      {/* ── Treatment Tab ── */}
      {activeTab === 'treatment' && (
        <div className="assess-tab-pane active">
          <div className="empty-state"><div className="empty-state-icon">💊</div>Generate assessment first to load treatment protocols.</div>
        </div>
      )}

      {/* ── Full Report Tab ── */}
      {activeTab === 'report' && (
        <div className="assess-tab-pane active">
          <div className="empty-state"><div className="empty-state-icon">📄</div>Generate assessment first to view full report.</div>
        </div>
      )}

      {/* ── AI Reasoning Tab ── */}
      {activeTab === 'ai' && (
        <div className="assess-tab-pane active">
          <div className="card" style={{ borderColor: 'var(--accent)', marginBottom: '14px' }}>
            <div className="card-head" style={{ background: 'linear-gradient(135deg, var(--en-t), var(--surface2))' }}>
              <div className="card-title">
                🤖 AI Clinical Reasoning Engine
                <span className="badge badge-ok" style={{ marginLeft: '8px' }}>Claude Sonnet</span>
                <span className="badge badge-info" style={{ marginLeft: '4px' }}>KB-Guided</span>
              </div>
              <div className="card-sub">Strict KB-only reasoning · All guidelines cited · Full symptom coverage check</div>
            </div>
            <div className="card-body">
              <div style={{ fontSize: '12px', color: 'var(--ink2)', lineHeight: 1.6, marginBottom: '12px' }}>
                Runs a structured clinical reasoning protocol using <strong>WHO, NICE, ESC, ADA, GINA, GOLD, AAN, ICMR/MoHFW</strong> and standard references (Davidson's, BMJ Best Practice).
                Patient data is taken directly from the current case.
              </div>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                <button className="btn btn-primary" disabled>⚡ Run AI Reasoning Engine</button>
                <span style={{ fontSize: '11px', color: 'var(--ink4)' }}>API integration coming soon</span>
              </div>
            </div>
          </div>
          <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--ink4)' }}>
            <div style={{ fontSize: '36px', marginBottom: '10px', opacity: .3 }}>🧠</div>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink2)', marginBottom: '6px' }}>AI Reasoning Engine Ready</div>
            <div style={{ fontSize: '12px' }}>Complete at least Steps 1–2 (intake + symptoms), then click<br /><strong>Run AI Reasoning Engine</strong> above.</div>
          </div>
        </div>
      )}

      <div className="btn-row" style={{ marginTop: '8px' }}>
        <button className="btn btn-secondary" onClick={onPrev}>← Back</button>
        <button className="btn btn-primary" onClick={onNext}>Build Prescription →</button>
        <button className="btn btn-secondary" onClick={() => window.print()}>🖨️ Print</button>
      </div>
    </div>
  );
};

export default AssessmentPanel;
