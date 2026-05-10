import { useState } from 'react';

const SEVERITY_OPTS = [
  { value: 'severe',   label: 'Severe / Anaphylaxis', icon: '🚨', tagCls: 'badge-danger' },
  { value: 'moderate', label: 'Moderate',             icon: '⚠️', tagCls: 'badge-warn' },
  { value: 'mild',     label: 'Mild',                 icon: 'ℹ️', tagCls: 'badge-gray' },
  { value: 'unknown',  label: 'Unknown',              icon: 'ℹ️', tagCls: 'badge-gray' },
];

const COMMON_ALLERGENS = [
  'Penicillin', 'Aspirin', 'NSAIDs', 'Sulfonamide',
  'Cephalosporin', 'Quinolone', 'Macrolide', 'Contrast dye', 'Latex',
];

const AllergiesCard = ({ allergies, conflicts, onAdd, onRemove }) => {
  const [allergen, setAllergen] = useState('');
  const [reaction, setReaction] = useState('');
  const [severity, setSeverity] = useState('unknown');

  const handleAdd = () => {
    if (!allergen.trim()) return;
    onAdd(allergen.trim(), reaction.trim(), severity);
    setAllergen('');
    setReaction('');
    setSeverity('unknown');
  };

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">⛔ Drug Allergies</div>
        <div className="card-sub">Cross-reactivity checked automatically</div>
      </div>
      <div className="card-body">
        <div className="row3" style={{ marginBottom: '8px' }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <div className="field-label"><label>Allergen</label></div>
            <input
              type="text"
              placeholder="e.g. Penicillin"
              value={allergen}
              onChange={(e) => setAllergen(e.target.value)}
              list="allergy-suggestions-list"
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
            />
            <datalist id="allergy-suggestions-list">
              {COMMON_ALLERGENS.map((a) => <option key={a} value={a} />)}
            </datalist>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <div className="field-label"><label>Reaction</label></div>
            <input
              type="text"
              placeholder="Anaphylaxis, rash…"
              value={reaction}
              onChange={(e) => setReaction(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
            />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <div className="field-label"><label>Severity</label></div>
            <select value={severity} onChange={(e) => setSeverity(e.target.value)}>
              {SEVERITY_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>
        <button className="btn btn-sm btn-danger" onClick={handleAdd} disabled={!allergen.trim()}>
          + Add Allergy
        </button>

        {allergies.length > 0 && (
          <div style={{ marginTop: '12px' }}>
            {allergies.map((a, i) => {
              const sev = SEVERITY_OPTS.find((o) => o.value === a.severity) || SEVERITY_OPTS[3];
              return (
                <div
                  key={`${a.allergen}-${i}`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '6px 0', borderBottom: '1px solid var(--border)',
                  }}
                >
                  <span style={{ fontSize: '14px' }}>{sev.icon}</span>
                  <div style={{ flex: 1 }}>
                    <strong style={{
                      fontSize: '12.5px',
                      color: a.severity === 'severe' ? 'var(--danger)' : a.severity === 'moderate' ? 'var(--warn)' : 'var(--ink2)',
                    }}>{a.allergen}</strong>
                    <span style={{ fontSize: '11px', color: 'var(--ink3)', marginLeft: '6px' }}>{a.reaction}</span>
                    <span className={`badge ${sev.tagCls}`} style={{ marginLeft: '6px', fontSize: '8px' }}>{a.severity}</span>
                  </div>
                  <button className="btn btn-xs btn-secondary" onClick={() => onRemove(i)}>✕</button>
                </div>
              );
            })}
          </div>
        )}

        {conflicts.length > 0 && (
          <div style={{
            marginTop: '12px',
            padding: '10px 12px',
            background: 'var(--cv-t)',
            border: '1.5px solid var(--danger)',
            borderRadius: 'var(--r)',
          }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--danger)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '6px' }}>
              ⛔ Allergy Conflict Detected
            </div>
            {conflicts.map((c, i) => (
              <div key={i} style={{ display: 'flex', gap: '8px', padding: '4px 0', fontSize: '12px' }}>
                <span>{c.severity === 'critical' ? '🚨' : '⚠️'}</span>
                <span style={{ color: c.severity === 'critical' ? 'var(--danger)' : 'var(--warn)' }}>{c.msg}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AllergiesCard;
