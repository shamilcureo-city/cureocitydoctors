const sysEmoji = (systems) => {
  const map = { cv: '❤️', rs: '🫁', en: '⚗️', nr: '🧠', gi: '🫄', hm: '🩸', ms: '🦴', ps: '🧠' };
  return (systems || []).map(s => map[s] || '💊').join('');
};

const lineClassFor = (lineKey) => {
  const k = lineKey.toLowerCase();
  if (k.includes('step1') || k.includes('mild') || k.includes('lifestyle') || k.includes('acute_mild')) return 'tx-line1';
  if (k.includes('step2') || k.includes('moderate')) return 'tx-line2';
  if (k.includes('step3') || k.includes('severe') || k.includes('icu') || k.includes('acute_severe')) return 'tx-alt';
  return 'tx-non';
};

const lineBadgeFor = (lineKey) => {
  const k = lineKey.toLowerCase();
  if (k.includes('step1') || k.includes('lifestyle') || k.includes('acute_mild')) return '1st LINE';
  if (k.includes('step2')) return '2nd LINE';
  if (k.includes('resistant') || k.includes('step3') || k.includes('severe')) return '3rd LINE';
  return 'SPECIALIST';
};

const riskClass = (risk) => risk === 'high' ? 'drug-risk-high' : risk === 'moderate' ? 'drug-risk-mod' : 'drug-risk-low';

const TreatmentTab = ({ getTopKBProtocols }) => {
  const protocols = getTopKBProtocols();

  if (!protocols.length) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">💊</div>
        No KB entries available for the top differential conditions. Run intake analysis first.
      </div>
    );
  }

  return (
    <div>
      {protocols.map(({ kb, condId }) => (
        <div className="card" key={condId} style={{ marginBottom: '14px' }}>
          <div className="card-head" style={{ flexWrap: 'wrap', gap: '8px' }}>
            <div className="card-title">
              <span style={{ fontSize: '14px', marginRight: '6px' }}>{sysEmoji(kb.systems)}</span>
              {kb.name} — Treatment Protocols
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
              {(kb.gl_sources || []).map(s => (
                <span key={`${s.name}-${s.level}`} className={`gl-source gl-${s.level}`} style={{ fontSize: '8.5px' }}>
                  L{s.level} {s.name}
                </span>
              ))}
            </div>
          </div>
          <div className="card-body p0">
            {Object.entries(kb.treatment || {}).map(([lineKey, line]) => (
              <div key={lineKey} className={`tx-section ${lineClassFor(lineKey)}`} style={{ margin: '14px 14px 0' }}>
                <div className="tx-section-title">
                  <span className="tx-badge">{lineBadgeFor(lineKey)}</span>
                  {line.label}
                </div>
                <table className="drug-table" style={{ marginBottom: '14px' }}>
                  <thead>
                    <tr>
                      <th>Drug (Generic)</th>
                      <th>Dose</th>
                      <th>Route/Freq</th>
                      <th>Duration</th>
                      <th>Risk</th>
                      <th>Key Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(line.drugs || []).map((d, i) => (
                      <tr key={`${lineKey}-${d.generic}-${i}`}>
                        <td>
                          <div className="drug-name-cell">{d.generic}</div>
                          {d.brand_india && (
                            <div style={{ fontSize: '10px', color: 'var(--info)' }}>
                              🇮🇳 {String(d.brand_india).split(',')[0]}
                            </div>
                          )}
                        </td>
                        <td className="drug-dose-cell">{d.dose || '—'}</td>
                        <td style={{ fontSize: '11.5px' }}>{d.route || '—'} / {d.freq || '—'}</td>
                        <td style={{ fontSize: '11.5px' }}>{d.duration || '—'}</td>
                        <td>
                          <span className={`drug-risk-tag ${riskClass(d.risk)}`}>
                            {(d.risk || 'low').toUpperCase()}
                          </span>
                        </td>
                        <td className="drug-notes-cell">
                          {(d.notes || '').length > 90 ? (d.notes || '').slice(0, 90) + '…' : (d.notes || '')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}

            {kb.monitoring?.length > 0 && (
              <div style={{ margin: '14px' }}>
                <div style={{ fontSize: '9.5px', fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.8px', marginBottom: '8px' }}>
                  Monitoring Parameters
                </div>
                <table className="monitor-table">
                  <thead>
                    <tr>
                      <th>Parameter</th>
                      <th>Frequency</th>
                      <th>Target</th>
                      <th>If Abnormal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kb.monitoring.map((m, i) => (
                      <tr key={`${m.parameter}-${i}`}>
                        <td><strong>{m.parameter}</strong></td>
                        <td>{m.frequency}</td>
                        <td style={{ color: 'var(--ok)' }}>{m.target}</td>
                        <td style={{ color: 'var(--warn)' }}>{m.action}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {kb.referral?.length > 0 && (
              <div style={{ margin: '14px' }}>
                <div style={{ fontSize: '9.5px', fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.8px', marginBottom: '8px' }}>
                  Referral / Escalation
                </div>
                {kb.referral.map((r, i) => (
                  <div className="refer-item" key={`ref-${i}`}>{r}</div>
                ))}
              </div>
            )}

            {kb.india_context && (
              <div className="india-box" style={{ margin: '14px' }}>
                <div className="india-box-title">🇮🇳 India / Kerala Context</div>
                {Object.entries(kb.india_context).map(([k, v]) => (
                  <div key={k} style={{ fontSize: '11.5px', color: 'var(--ink2)', padding: '4px 0', borderBottom: '1px solid rgba(10,122,110,.1)' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '8.5px', color: 'var(--accent)', textTransform: 'uppercase', marginRight: '6px' }}>
                      {k.replace(/_/g, ' ')}
                    </span>
                    {v}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default TreatmentTab;
