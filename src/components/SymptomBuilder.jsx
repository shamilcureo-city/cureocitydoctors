import { SYMPTOM_BUILDER_GROUPS } from '../engine/cureocityEngine';

// Clickable structured-symptom grid. The 10 system groups expand on click.
// Each chip toggles a canonical KBE term in/out of the corpus, triggering
// a re-score. Lets clinicians supplement free-text intake with explicit
// confirmations the engine might otherwise miss ("k/c/o HTN" doesn't
// imply current symptoms).
const SymptomBuilder = ({ active, onToggle }) => {
  const total = active.length;

  return (
    <div className="card" style={{ marginBottom: '14px' }}>
      <div className="card-head">
        <div className="card-title">
          🔘 Structured Symptom Builder
          <span className="badge badge-ok" style={{ marginLeft: '8px' }}>v5</span>
        </div>
        <div className="card-sub">Click symptoms to add to diagnosis engine</div>
      </div>
      <div className="card-body" style={{ padding: '12px' }}>
        {total > 0 ? (
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: '5px',
            marginBottom: '10px', padding: '9px 12px',
            background: 'var(--en-t)', borderRadius: 'var(--r)',
            border: '1.5px solid rgba(10,122,110,.2)',
          }}>
            <span style={{
              fontSize: '10px', fontWeight: 700, color: 'var(--accent)',
              textTransform: 'uppercase', letterSpacing: '.5px',
              width: '100%', marginBottom: '4px',
            }}>Active Symptoms ({total})</span>
            {active.map((s) => (
              <span
                key={s}
                onClick={() => onToggle(s)}
                style={{
                  background: 'var(--accent)', color: '#fff',
                  borderRadius: '12px', padding: '2px 9px',
                  fontSize: '11px', cursor: 'pointer',
                }}
              >✓ {s} ×</span>
            ))}
          </div>
        ) : (
          <div style={{
            fontSize: '12px', color: 'var(--ink4)',
            marginBottom: '10px', padding: '6px 0',
          }}>
            Click a system below to expand, then click symptoms the patient has. This directly improves diagnostic accuracy.
          </div>
        )}

        {SYMPTOM_BUILDER_GROUPS.map((g) => {
          const groupActive = g.symptoms.filter((s) => active.includes(s)).length;
          return (
            <details
              key={g.label}
              style={{
                border: '1.5px solid var(--border)',
                borderRadius: 'var(--r)',
                overflow: 'hidden',
                marginBottom: '6px',
              }}
            >
              <summary style={{
                padding: '9px 14px',
                background: g.bg,
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: 600,
                color: g.color,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                listStyle: 'none',
              }}>
                <span>{g.icon}</span>
                <span>{g.label}</span>
                <span style={{
                  marginLeft: 'auto',
                  fontSize: '10px',
                  color: g.color,
                  opacity: 0.7,
                }}>
                  {groupActive > 0 ? `(${groupActive} selected) ` : ''}▶
                </span>
              </summary>
              <div style={{
                padding: '10px 14px',
                display: 'flex',
                flexWrap: 'wrap',
                gap: '6px',
              }}>
                {g.symptoms.map((sym) => {
                  const isOn = active.includes(sym);
                  return (
                    <button
                      key={sym}
                      onClick={() => onToggle(sym)}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '20px',
                        fontSize: '11px',
                        fontWeight: isOn ? 700 : 500,
                        border: `1.5px solid ${isOn ? g.color : 'var(--border2)'}`,
                        background: isOn ? g.bg : 'var(--surface)',
                        color: isOn ? g.color : 'var(--ink3)',
                        cursor: 'pointer',
                        transition: 'all .1s',
                        whiteSpace: 'nowrap',
                      }}
                    >{isOn ? '✓ ' : ''}{sym}</button>
                  );
                })}
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
};

export default SymptomBuilder;
