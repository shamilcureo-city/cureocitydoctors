const tierBadge = (tier) => {
  if (tier === 't3') return <span className="badge badge-danger">MUST NOT MISS</span>;
  if (tier === 't2') return <span className="badge badge-info">POSSIBLE</span>;
  return <span className="badge badge-ok">MOST LIKELY</span>;
};

const labStatusColor = (status) => {
  if (status === 'critical') return 'var(--danger)';
  if (status === 'abnormal-high') return 'var(--warn)';
  if (status === 'abnormal-low') return 'var(--info)';
  return 'var(--ink)';
};

const FullReportTab = ({ getFullReport }) => {
  const r = getFullReport();
  const genderLabel = r.pt.gender === 'F' ? 'Female' : r.pt.gender === 'M' ? 'Male' : (r.pt.gender || '—');

  if (!r.rawInput) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">📄</div>
        Run intake analysis (Step 1) to generate the full clinical report.
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">📄 Complete Clinical Report</div>
        <div className="card-sub">{r.generatedAt}</div>
      </div>
      <div className="card-body">

        {/* 1. Patient & Chief Complaint */}
        <div className="report-section">
          <div className="report-section-title">1. Patient &amp; Chief Complaint</div>
          <table style={{ width: '100%', fontSize: '12.5px', borderCollapse: 'collapse' }}>
            <tbody>
              <tr><td style={{ color: 'var(--ink3)', width: '150px' }}>Patient</td>
                  <td><strong>{r.pt.age || '?'}y {genderLabel}</strong></td></tr>
              <tr><td style={{ color: 'var(--ink3)' }}>Comorbidities</td>
                  <td>{r.pt.comorbid || 'None documented'}</td></tr>
              <tr><td style={{ color: 'var(--ink3)' }}>Chief Complaint</td>
                  <td style={{ fontStyle: 'italic' }}>{r.rawInput || '—'}</td></tr>
              <tr><td style={{ color: 'var(--ink3)' }}>Systems Active</td>
                  <td>{r.activeSystemNames.join(', ') || '—'}</td></tr>
              <tr><td style={{ color: 'var(--ink3)' }}>Confidence</td>
                  <td>{r.certainty}%</td></tr>
            </tbody>
          </table>
        </div>

        {/* 2. Red Flags */}
        {r.redFlags.length > 0 && (
          <div className="report-section">
            <div className="report-section-title" style={{ color: 'var(--danger)' }}>⚑ 2. Red Flags Detected</div>
            {r.redFlags.map((f, i) => (
              <div key={f.msg || `rf-${i}`} style={{ padding: '6px 0', fontSize: '12.5px', color: 'var(--danger)', display: 'flex', gap: '7px', borderBottom: '1px solid var(--border)' }}>
                <span>⚑</span>{f.msg}
              </div>
            ))}
          </div>
        )}

        {/* 3. Clinical History */}
        {r.filledGaps.length > 0 && (
          <div className="report-section">
            <div className="report-section-title">3. Clinical History</div>
            <table style={{ width: '100%', fontSize: '12.5px', borderCollapse: 'collapse' }}>
              <tbody>
                {r.filledGaps.map(g => (
                  <tr key={g.key} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ color: 'var(--ink3)', padding: '5px 0', width: '160px' }}>{g.label}</td>
                    <td style={{ padding: '5px 0' }}>{g.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 4. Examination Findings */}
        {r.examEntries.length > 0 && (
          <div className="report-section">
            <div className="report-section-title">4. Examination Findings</div>
            <table style={{ width: '100%', fontSize: '12.5px', borderCollapse: 'collapse' }}>
              <tbody>
                {r.examEntries.map((e, i) => (
                  <tr key={`${e.sysId}-${e.key}-${i}`}>
                    <td style={{ color: 'var(--ink3)' }}>{e.sysId.toUpperCase()} · {e.key}</td>
                    <td>{e.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 4b. Vital Signs */}
        {r.vitalsSummary.length > 0 && (
          <div className="report-section">
            <div className="report-section-title">4b. Vital Signs</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
              {r.vitalsSummary.map(v => (
                <div key={v.label} style={{
                  padding: '7px 10px', borderRadius: 'var(--r)',
                  background: v.status === 'critical' ? 'var(--cv-t)' : (v.status === 'warning' || v.status === 'high') ? 'var(--warn-t)' : 'var(--surface2)',
                  border: `1px solid ${v.status === 'critical' ? 'rgba(192,57,43,.3)' : v.status !== 'normal' ? 'rgba(184,106,0,.25)' : 'var(--border)'}`,
                }}>
                  <div style={{ fontSize: '9px', fontWeight: 600, color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: '2px' }}>{v.label}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '14px', fontWeight: 600, color: v.status === 'critical' ? 'var(--danger)' : v.status !== 'normal' ? 'var(--warn)' : 'var(--ink)' }}>{v.value}</div>
                  <div style={{ fontSize: '9px', color: 'var(--ink4)' }}>{v.unit}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 5. Differential */}
        <div className="report-section">
          <div className="report-section-title">5. Differential Diagnosis</div>
          {r.differentialAll.length === 0 ? (
            <div style={{ fontSize: '12px', color: 'var(--ink4)' }}>No differentials yet — complete intake.</div>
          ) : (
            r.differentialAll.map((c, i) => (
              <div key={c.id || `d-${i}`} style={{ display: 'flex', gap: '10px', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: '12.5px', alignItems: 'center' }}>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink4)', fontSize: '11px', minWidth: '20px' }}>{i + 1}.</span>
                <strong>{c.name}</strong>
                {tierBadge(c.tier)}
                {c.score && c.score < 900 && (
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--ink4)', marginLeft: 'auto' }}>
                    score {Number(c.score).toFixed(1)}
                  </span>
                )}
              </div>
            ))
          )}
        </div>

        {/* 6. Medications */}
        {r.drugs.length > 0 && (
          <div className="report-section">
            <div className="report-section-title">6. Medications ({r.drugs.length})</div>
            {r.drugs.map((d, i) => (
              <div key={d.id || `${d.name}-${i}`} style={{ fontSize: '12.5px', padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                {d.name} <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--ink3)' }}>{d.dose || ''} · {d.duration || ''}</span>
              </div>
            ))}
            {r.interactions.length > 0 && (
              <div style={{ marginTop: '8px', padding: '8px 12px', background: 'var(--warn-t)', borderRadius: 'var(--r)', fontSize: '12px', color: 'var(--warn)' }}>
                {r.interactions.length} interaction(s) detected — see Step 6 for details.
              </div>
            )}
          </div>
        )}

        {/* 7. Lab Results */}
        {r.labRows.length > 0 && (
          <div className="report-section">
            <div className="report-section-title">7. Lab Results</div>
            <table style={{ width: '100%', fontSize: '12.5px', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', color: 'var(--ink3)', fontSize: '9.5px', textTransform: 'uppercase', padding: '5px 0', borderBottom: '1.5px solid var(--border)' }}>Test</th>
                  <th style={{ textAlign: 'left', color: 'var(--ink3)', fontSize: '9.5px', textTransform: 'uppercase', padding: '5px 0', borderBottom: '1.5px solid var(--border)' }}>Result</th>
                  <th style={{ textAlign: 'left', color: 'var(--ink3)', fontSize: '9.5px', textTransform: 'uppercase', padding: '5px 0', borderBottom: '1.5px solid var(--border)' }}>Reference</th>
                </tr>
              </thead>
              <tbody>
                {r.labRows.map(lab => (
                  <tr key={lab.key}>
                    <td style={{ color: 'var(--ink3)' }}>{lab.name}</td>
                    <td style={{ color: labStatusColor(lab.status), fontWeight: lab.status !== 'normal' ? 600 : 400 }}>{lab.value} {lab.unit}</td>
                    <td>{lab.ref}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 8. Next Steps */}
        {r.nextSteps.length > 0 && (
          <div className="report-section">
            <div className="report-section-title">8. Next Steps</div>
            {r.nextSteps.map((s, i) => (
              <div key={`${s.action || 'step'}-${i}`} style={{ display: 'flex', gap: '10px', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: '12.5px' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--ink4)', minWidth: '20px' }}>{i + 1}.</span>
                <span style={{ color: s.urgency === 'urgent' ? 'var(--danger)' : s.urgency === 'important' ? 'var(--warn)' : 'var(--ink2)' }}>
                  {s.icon || '→'} {s.action}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* 9. Doctor's Notes */}
        {(r.notes.intake || r.notes.history || r.notes.impression) && (
          <div className="report-section">
            <div className="report-section-title">9. Doctor's Clinical Notes</div>
            {r.notes.intake && (
              <div style={{ marginBottom: '10px' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '4px' }}>Presenting Complaint Summary</div>
                <div style={{ fontSize: '12.5px', color: 'var(--ink2)', lineHeight: 1.6, padding: '8px 12px', background: 'var(--surface2)', borderRadius: 'var(--r)', borderLeft: '3px solid var(--accent)' }}>{r.notes.intake}</div>
              </div>
            )}
            {r.notes.history && (
              <div style={{ marginBottom: '10px' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '4px' }}>History &amp; Examination</div>
                <div style={{ fontSize: '12.5px', color: 'var(--ink2)', lineHeight: 1.6, padding: '8px 12px', background: 'var(--surface2)', borderRadius: 'var(--r)', borderLeft: '3px solid var(--en)' }}>{r.notes.history}</div>
              </div>
            )}
            {r.notes.impression && (
              <div>
                <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '4px' }}>Clinical Impression &amp; Plan</div>
                <div style={{ fontSize: '12.5px', color: 'var(--ink2)', lineHeight: 1.6, padding: '8px 12px', background: 'var(--surface2)', borderRadius: 'var(--r)', borderLeft: '3px solid var(--ok)' }}>{r.notes.impression}</div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
};

export default FullReportTab;
