const PrescriptionPanel = ({ engineState, onPrev }) => {
  const diffs = engineState.differentials || { t1: [], t2: [], t3: [] };
  const topDx = [...diffs.t3, ...diffs.t1][0];
  const drugs = engineState.drugs || [];
  const today = new Date().toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });

  return (
    <div className="step-panel active">
      <div className="mod-header">
        <div className="mod-title">Prescription Builder</div>
        <div className="mod-desc">Build a structured prescription from KB treatment protocols. All selections are checked against the drug safety engine before output.</div>
      </div>

      {drugs.length > 0 || topDx ? (
        <>
          <div className="card" style={{ borderColor: 'var(--accent)' }}>
            <div className="card-head" style={{ background: 'linear-gradient(135deg, var(--en-t), var(--surface2))' }}>
              <div className="card-title" style={{ fontSize: '13px' }}>
                💊 Prescription Pad
                <span className="badge badge-ok" style={{ marginLeft: '6px' }}>{drugs.length} items</span>
              </div>
            </div>
            <div className="card-body p0">
              <div className="rx-patient-strip">
                <div className="rx-patient-field">
                  <span className="rx-field-label">Patient</span>
                  <span className="rx-field-val">—</span>
                </div>
                <div className="rx-patient-field">
                  <span className="rx-field-label">Age/Sex</span>
                  <span className="rx-field-val">—</span>
                </div>
                <div className="rx-patient-field">
                  <span className="rx-field-label">Date</span>
                  <span className="rx-field-val">{today}</span>
                </div>
                <div className="rx-patient-field">
                  <span className="rx-field-label">Diagnosis</span>
                  <span className="rx-field-val">{topDx?.name || topDx?.kb?.name || '—'}</span>
                </div>
              </div>
              <div style={{ padding: '0 16px 8px' }}>
                {drugs.length > 0 ? drugs.map((d, i) => (
                  <div key={d.id || `${d.name}-${i}`} style={{
                    padding: '10px 0', borderBottom: '1px dashed var(--border)', display: 'flex',
                    justifyContent: 'space-between', alignItems: 'center'
                  }}>
                    <div>
                      <span style={{ fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{i + 1}.</span>{' '}
                      <span style={{ fontWeight: 600 }}>{d.name}</span>
                      {d.dose && <span style={{ color: 'var(--ink3)', marginLeft: '8px' }}>{d.dose}</span>}
                      {d.duration && <span style={{ color: 'var(--ink4)', marginLeft: '8px', fontSize: '11px' }}>× {d.duration}</span>}
                    </div>
                  </div>
                )) : (
                  <div style={{ padding: '16px 0', textAlign: 'center', color: 'var(--ink4)', fontSize: '12px' }}>
                    No medications added. Go back to Step 4 to add medications.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="btn-row">
            <button className="btn btn-primary" onClick={() => window.print()}>📋 Generate Final Prescription</button>
            <button className="btn btn-secondary" onClick={() => window.print()}>🖨️ Print</button>
          </div>
        </>
      ) : (
        <div className="empty-state">
          <div className="empty-state-icon">💊</div>
          Complete Assessment (Step 6) to load prescription builder.
        </div>
      )}

      <div className="btn-row" style={{ marginTop: '8px' }}>
        <button className="btn btn-secondary" onClick={onPrev}>← Back to Treatment</button>
        <button className="btn btn-primary" disabled>📧 Generate Referral Letter</button>
      </div>
    </div>
  );
};

export default PrescriptionPanel;
