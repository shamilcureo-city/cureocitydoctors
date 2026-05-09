import { useState } from 'react';

// Kerala monsoon / post-monsoon season is roughly June–November (months 5–10).
// Banner reminds doctors of common tropical-fever differentials and the NSAID
// ban in suspected dengue. Dismissible per session.
const SeasonalAlert = () => {
  const [dismissed, setDismissed] = useState(false);
  const month = new Date().getMonth();
  const inSeason = month >= 5 && month <= 10;
  if (!inSeason || dismissed) return null;

  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '8px 16px', background: 'var(--warn-t)',
        borderBottom: '1px solid rgba(184,106,0,.25)',
        fontSize: '11.5px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, flexWrap: 'wrap' }}>
        <span style={{ fontSize: '16px' }}>🦟</span>
        <div>
          <div style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--warn)' }}>
            KERALA SEASONAL ALERT — Monsoon / Post-Monsoon
          </div>
          <div style={{ fontSize: '11px', color: 'var(--ink2)' }}>
            Fever &gt;5 days: screen for <strong>Dengue</strong> (NS1 + Platelet) ·{' '}
            <strong>Leptospirosis</strong> (exposure + calf pain) ·{' '}
            <strong>Scrub Typhus</strong> (eschar search) ·{' '}
            <strong>Typhoid</strong> (step-ladder fever).{' '}
            <strong>NSAID ban in suspected dengue.</strong>
          </div>
        </div>
      </div>
      <button
        onClick={() => setDismissed(true)}
        style={{
          background: 'none', border: 'none', color: 'var(--ink3)',
          fontSize: '16px', cursor: 'pointer', padding: '4px',
        }}
        aria-label="Dismiss seasonal alert"
      >
        ✕
      </button>
    </div>
  );
};

export default SeasonalAlert;
