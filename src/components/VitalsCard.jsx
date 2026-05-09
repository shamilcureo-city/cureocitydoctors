import { VITALS_DEFS, isAbnormalVital } from '../engine/cureocityEngine';

// Vitals quick-entry. 9-cell grid. Auto-flags abnormal/critical values.
// Critical values can fire a separate full-screen overlay (Slice 9).
const VitalsCard = ({ vitals, onChange }) => {
  const cells = VITALS_DEFS.map((def) => {
    const val = vitals[def.key] ?? '';
    const status = val ? isAbnormalVital(def.key, val) : 'empty';

    const tone = (() => {
      if (status === 'critical') return { color: 'var(--danger)', bg: 'var(--cv-t)',  border: 'rgba(192,57,43,.3)' };
      if (status === 'warning' || status === 'high') return { color: 'var(--warn)', bg: 'var(--warn-t)', border: 'rgba(184,106,0,.3)' };
      if (status === 'low')      return { color: 'var(--info)',   bg: 'var(--rs-t)',  border: 'rgba(26,92,158,.25)' };
      return { color: 'var(--ink)', bg: 'var(--surface2)', border: 'var(--border)' };
    })();

    const refText = def.norm[0] != null && def.norm[1] != null
      ? `${def.norm[0]}–${def.norm[1]}`
      : def.norm[0] != null ? `≥${def.norm[0]}` : '—';

    return (
      <div
        key={def.key}
        style={{
          background: tone.bg,
          border: `1.5px solid ${tone.border}`,
          borderRadius: 'var(--r)',
          padding: '8px 10px',
        }}
      >
        <div style={{
          fontSize: '9.5px', fontWeight: 600, color: 'var(--ink3)',
          textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: '3px',
        }}>{def.label}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <input
            type="text"
            inputMode="decimal"
            placeholder="—"
            value={val}
            onChange={(e) => onChange(def.key, e.target.value)}
            style={{
              width: 60,
              border: 'none',
              background: 'transparent',
              fontFamily: 'var(--font-mono)',
              fontSize: '15px',
              fontWeight: 600,
              color: tone.color,
              outline: 'none',
              padding: 0,
            }}
          />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9.5px', color: 'var(--ink4)' }}>{def.unit}</span>
        </div>
        <div style={{ fontSize: '9px', color: 'var(--ink4)', marginTop: '1px' }}>ref: {refText}</div>
        {status !== 'normal' && status !== 'empty' && (
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: '8px',
            textTransform: 'uppercase', color: tone.color, marginTop: '2px', fontWeight: 600,
          }}>{status}</div>
        )}
      </div>
    );
  });

  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">🩺 Vital Signs</div>
        <div className="card-sub">Auto-flagged if abnormal · syncs to examination</div>
      </div>
      <div className="card-body">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
          {cells}
        </div>
      </div>
    </div>
  );
};

export default VitalsCard;
