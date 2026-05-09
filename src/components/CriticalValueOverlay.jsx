import { useState } from 'react';

// Surfaces critical lab values as a top-of-page action card. The doctor
// must explicitly acknowledge each alert (per session) — we don't auto-
// dismiss because the action steps need to be read.
//
// Props:
//   alerts — array from EngineCore.getCriticalLabAlerts()
//
// Acknowledged alerts are tracked locally; they re-fire if the underlying
// value changes (because the rule object has fresh identity per render).
const CriticalValueOverlay = ({ alerts = [] }) => {
  const [acked, setAcked] = useState(() => new Set());

  const visible = alerts.filter(a => !acked.has(`${a.test}-${a.value}`));
  if (!visible.length) return null;

  return (
    <div style={{ marginBottom: '14px' }}>
      {visible.map(rule => {
        const key = `${rule.test}-${rule.value}`;
        return (
          <div
            key={key}
            style={{
              border: '2px solid var(--danger)',
              borderRadius: 'var(--r-lg)',
              background: 'var(--danger-t)',
              padding: '14px 16px',
              marginBottom: '10px',
              boxShadow: '0 4px 14px rgba(192,57,43,.15)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <span style={{ fontSize: '20px' }}>🔴</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--danger)', textTransform: 'uppercase', letterSpacing: '.8px' }}>
                  Critical Lab Value
                </div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)', marginTop: '2px' }}>
                  {rule.name} <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--danger)' }}>(Value: {rule.value})</span>
                </div>
              </div>
              <button
                onClick={() => setAcked(prev => new Set(prev).add(key))}
                className="btn btn-xs btn-secondary"
                style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}
              >
                Acknowledge
              </button>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--ink2)', lineHeight: 1.6, marginBottom: '8px' }}>
              {rule.msg}
            </div>
            <div style={{
              fontSize: '12px', fontFamily: 'var(--font-sans)', whiteSpace: 'pre-wrap',
              padding: '10px 12px', background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 'var(--r)', color: 'var(--ink2)', lineHeight: 1.7,
            }}>
              <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '4px' }}>
                Immediate Action
              </div>
              {rule.action}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default CriticalValueOverlay;
