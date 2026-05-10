import { useEffect } from 'react';

const sysEmoji = (systems) => {
  const map = { cv: '❤️', rs: '🫁', en: '⚗️', nr: '🧠', gi: '🫄', hm: '🩸', ms: '🦴', ps: '🧠' };
  return (systems || []).map(s => map[s] || '💊').join('');
};

const riskBadge = (r) => r === 'high' ? 'badge-danger' : r === 'moderate' ? 'badge-warn' : 'badge-ok';

const KBModal = ({ kb, onClose }) => {
  useEffect(() => {
    if (!kb) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [kb, onClose]);

  if (!kb) return null;

  const sources = (kb.gl_sources || []).map(s => ({
    ...s, cls: ['', 'gl-1', 'gl-2', 'gl-3', 'gl-4'][s.level] || 'gl-4',
  }));

  return (
    <div className="kb-modal-overlay open" onClick={onClose}>
      <div className="kb-modal" onClick={e => e.stopPropagation()}>
        <div className="kb-modal-head">
          <div>
            <div className="kb-modal-title">
              <span style={{ marginRight: '6px' }}>{sysEmoji(kb.systems)}</span>
              {kb.name}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--ink4)', marginTop: '2px' }}>
              ICD-10: {kb.icd10 || '—'} · {sources.map(s => s.name).join(' · ')}
            </div>
          </div>
          <button className="kb-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="kb-modal-body">

          {sources.length > 0 && (
            <div className="kb-section">
              <div className="kb-section-head">Evidence Sources</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                {sources.map(s => (
                  <span key={`${s.name}-${s.level}`} className={`gl-source ${s.cls}`}>
                    L{s.level} {s.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {kb.key_symptoms?.length > 0 && (
            <div className="kb-section">
              <div className="kb-section-head">Key Symptoms</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                {kb.key_symptoms.map(s => (
                  <span key={s} className="tag tag-ok" style={{ fontSize: '11px' }}>{s}</span>
                ))}
              </div>
            </div>
          )}

          {kb.red_flags?.length > 0 && (
            <div className="kb-section">
              <div className="kb-section-head">🚨 Red Flags</div>
              {kb.red_flags.map((r, i) => (
                <div key={`rf-${i}`} style={{ display: 'flex', gap: '7px', fontSize: '12px', padding: '5px 0', borderBottom: '1px solid var(--border)', color: 'var(--ink2)' }}>
                  <span style={{ color: 'var(--danger)', flexShrink: 0 }}>⚑</span>{r}
                </div>
              ))}
            </div>
          )}

          {kb.dx_criteria && (
            <div className="kb-section">
              <div className="kb-section-head">Diagnostic Criteria</div>
              <div className="criteria-block">
                <div className="criteria-title">{kb.dx_criteria.name}</div>
                {(kb.dx_criteria.criteria || []).map((c, i) => (
                  <div key={`dx-${i}`} className="criteria-item">{c}</div>
                ))}
              </div>
            </div>
          )}

          {kb.treatment && (
            <div className="kb-section">
              <div className="kb-section-head">Treatment Protocols</div>
              {Object.entries(kb.treatment).map(([lineKey, line]) => (
                <div key={lineKey} style={{ marginBottom: '16px' }}>
                  <div style={{
                    fontSize: '10px', fontWeight: 700, color: 'var(--ink3)',
                    textTransform: 'uppercase', letterSpacing: '.8px',
                    marginBottom: '8px', padding: '5px 8px',
                    background: 'var(--surface2)', borderRadius: '3px',
                  }}>
                    {line.label}
                  </div>
                  {(line.drugs || []).map((d, i) => (
                    <div key={`${lineKey}-d-${i}`} className="drug-card" style={{ marginBottom: '8px' }}>
                      <div className="drug-card-head">
                        <div>
                          <div className="drug-name-generic">{d.generic}</div>
                          {d.brand_india && (
                            <div className="drug-brand-india">
                              <span className="india-tag">🇮🇳 India</span> {d.brand_india}
                            </div>
                          )}
                        </div>
                        <span className={`badge ${riskBadge(d.risk)}`} style={{ fontSize: '8px', alignSelf: 'flex-start' }}>
                          {(d.risk || 'low').toUpperCase()}
                        </span>
                      </div>
                      <div className="drug-card-body" style={{ fontSize: '12px', color: 'var(--ink2)' }}>
                        <div style={{ marginBottom: '4px' }}>
                          <strong>{d.dose}</strong> · {d.route} · {d.freq} · <em>{d.duration}</em>
                        </div>
                        {d.notes && <div style={{ fontSize: '11.5px', color: 'var(--ink3)', marginBottom: '4px' }}>{d.notes}</div>}
                        {d.monitoring && <div style={{ fontSize: '11px', color: 'var(--warn)' }}>Monitor: {d.monitoring}</div>}
                        {d.contra && <div style={{ fontSize: '11px', color: 'var(--danger)', marginTop: '3px' }}>⛔ {d.contra}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}

          {kb.contraindications_class && (
            <div className="kb-section">
              <div className="kb-section-head">Class Contraindications</div>
              {Object.entries(kb.contraindications_class).map(([k, v]) => (
                <div key={k} className="contra-item">
                  <strong style={{ color: 'var(--danger)', minWidth: '140px', display: 'inline-block' }}>
                    {k.replace(/_/g, ' ')}
                  </strong>
                  {v}
                </div>
              ))}
            </div>
          )}

          {kb.monitoring?.length > 0 && (
            <div className="kb-section">
              <div className="kb-section-head">Monitoring Parameters</div>
              <table className="monitor-table">
                <thead>
                  <tr><th>Parameter</th><th>Frequency</th><th>Target</th><th>Action if abnormal</th></tr>
                </thead>
                <tbody>
                  {kb.monitoring.map((m, i) => (
                    <tr key={`mon-${i}`}>
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
            <div className="kb-section">
              <div className="kb-section-head">Referral / Escalation Criteria</div>
              {kb.referral.map((r, i) => (
                <div key={`ref-${i}`} className="refer-item">{r}</div>
              ))}
            </div>
          )}

          {kb.india_context && (
            <div className="kb-section">
              <div className="india-box">
                <div className="india-box-title">🇮🇳 India Context</div>
                {Object.entries(kb.india_context).map(([k, v]) => (
                  <div key={k} style={{ fontSize: '12px', color: 'var(--ink2)', padding: '4px 0', borderBottom: '1px solid rgba(10,122,110,.1)' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9px', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '.5px', marginRight: '6px' }}>
                      {k.replace(/_/g, ' ')}
                    </span>
                    {v}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default KBModal;
