import { useState } from 'react';

// Reminds prescribers that adult dosing in the KB is unsafe for under-18s
// and surfaces a small dose calculator for the most common drugs.
const PaediatricBanner = ({ patient }) => {
  const [weight, setWeight] = useState('');
  const age = patient?.age != null ? Number(patient.age) : null;
  if (age == null || isNaN(age) || age >= 18) return null;

  const w = parseFloat(weight);
  const validW = !isNaN(w) && w > 0 && w < 150;

  return (
    <div style={{
      background: 'rgba(184,106,0,.12)', border: '2px solid var(--warn)',
      borderRadius: 'var(--r)', padding: '12px 16px', marginBottom: '14px',
    }}>
      <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--warn)', marginBottom: '6px' }}>
        ⚠ PAEDIATRIC PATIENT — {age}y
      </div>
      <div style={{ fontSize: '12px', color: 'var(--ink2)', marginBottom: '8px' }}>
        Adult drug doses are shown in the KB. <strong>ALL doses must be recalculated by child weight (mg/kg).</strong> Weight-based dosing is mandatory for patients under 18.
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '12px', color: 'var(--ink2)' }}>Child weight:</span>
        <input
          type="number"
          min={1}
          max={120}
          placeholder="kg"
          value={weight}
          onChange={e => setWeight(e.target.value)}
          style={{
            width: '80px', padding: '4px 8px', border: '1.5px solid var(--warn)',
            borderRadius: '4px', fontFamily: 'var(--font-sans)', fontSize: '12.5px',
            outline: 'none', background: 'var(--surface)',
          }}
        />
        <span style={{ fontSize: '12px', color: 'var(--ink3)' }}>kg</span>
      </div>

      {validW && (
        <div style={{ fontSize: '11.5px', color: 'var(--warn)', marginTop: '8px', lineHeight: 1.7 }}>
          ✓ Weight: <strong>{w} kg</strong>. Common doses:{' '}
          <span style={{ fontFamily: 'var(--font-mono)' }}>Paracetamol {(w * 15).toFixed(0)} mg/dose</span>{' · '}
          <span style={{ fontFamily: 'var(--font-mono)' }}>Amoxicillin {(w * 40 / 3).toFixed(0)} mg TDS</span>{' · '}
          <span style={{ fontFamily: 'var(--font-mono)' }}>ORS 75 mL/kg over 4h = {(w * 75).toFixed(0)} mL</span>
        </div>
      )}

      <div style={{ fontSize: '11px', color: 'var(--ink3)', marginTop: '6px' }}>
        Refer to IAP drug formulary for paediatric dosing. <strong>Doxycycline contraindicated &lt;8y.</strong>{' '}
        <strong>Fluoroquinolones contraindicated &lt;18y.</strong>{' '}
        <strong>Codeine contraindicated &lt;12y.</strong>
      </div>
    </div>
  );
};

export default PaediatricBanner;
