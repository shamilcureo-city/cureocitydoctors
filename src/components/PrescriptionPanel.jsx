import { useMemo, useState } from 'react';
import {
  mapToIndianTiming, getFormPrefix, getCostEstimate,
} from '../engine/index.js';

const sysEmoji = (systems) => {
  const map = { cv: '❤️', rs: '🫁', en: '⚗️', nr: '🧠', gi: '🫄', hm: '🩸', ms: '🦴', ps: '🧠' };
  return (systems || []).map(s => map[s] || '💊').join('');
};

const SafetyAlerts = ({ alerts }) => {
  const { interactions = [], contraAlerts = [] } = alerts || {};
  if (!interactions.length && !contraAlerts.length) {
    return (
      <div className="rx-safety-banner ok" style={{ marginBottom: '10px' }}>
        ✓ No drug interactions or contraindications detected for selected prescription.
      </div>
    );
  }
  return (
    <div style={{ marginBottom: '10px' }}>
      {contraAlerts.map((a, i) => (
        <div key={`c-${i}`} className="rx-safety-banner danger">
          ⛔ <div><strong>{a.drug}</strong> — {a.msg}</div>
        </div>
      ))}
      {interactions.map((i, idx) => (
        <div key={`i-${idx}`} className={`rx-safety-banner ${i.sev === 'high' ? 'danger' : 'warn'}`}>
          {i.sev === 'high' ? '⛔' : '⚠️'} <div>
            <strong>{(i.matchedDrugs || []).map(d => d.charAt(0).toUpperCase() + d.slice(1)).join(' + ')}</strong>
            {' — '}{i.desc}
            {i.resolution && <div style={{ fontSize: '11px', marginTop: '3px', opacity: .85 }}>{i.resolution}</div>}
          </div>
        </div>
      ))}
    </div>
  );
};

const DrugSelectorCard = ({ option, selected, onToggle }) => {
  const [open, setOpen] = useState(true);
  return (
    <div className="rx-selector-card">
      <div className="rx-selector-head" onClick={() => setOpen(o => !o)}>
        <div className="rx-selector-title">
          <span style={{ fontSize: '14px' }}>{sysEmoji(option.kbSystems)}</span>
          {option.condName}
          {option.sources?.[0] && (
            <span className="badge badge-ok" style={{ fontSize: '8px' }}>{option.sources[0].name}</span>
          )}
        </div>
        <span style={{ fontSize: '10px', color: 'var(--ink4)' }}>{open ? '▲' : '▼'}</span>
      </div>
      {open && option.lines.map(line => (
        <div key={line.lineKey} style={{ padding: '10px 14px', borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: '9.5px', fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.8px', marginBottom: '8px' }}>
            {line.lineLabel}
          </div>
          {line.drugs.map(entry => {
            const isSelected = selected.has(entry.drugId);
            const drug = entry.drug;
            return (
              <div
                key={entry.drugId}
                className={`rx-drug-option${isSelected ? ' selected' : ''}`}
                onClick={() => onToggle(entry)}
              >
                <div>
                  <div className="rx-opt-name">{drug.generic}</div>
                  <div className="rx-opt-dose">{drug.dose} · {drug.freq} · {drug.duration}</div>
                  {drug.brand_india && (
                    <div className="rx-opt-india">🇮🇳 {String(drug.brand_india).split(',')[0].trim()}</div>
                  )}
                </div>
                <span className={`badge ${drug.risk === 'high' ? 'badge-danger' : drug.risk === 'moderate' ? 'badge-warn' : 'badge-ok'}`} style={{ fontSize: '8px' }}>
                  {(drug.risk || 'low').toUpperCase()}
                </span>
                <span style={{ fontSize: '18px', color: isSelected ? 'var(--ok)' : 'var(--border2)' }}>
                  {isSelected ? '✓' : '+'}
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
};

const RxPad = ({ selected, onRemove, today, patientDemo, diagnosis }) => {
  const totalCost = useMemo(() => {
    let total = 0; let allCosted = true;
    for (const sel of selected) {
      const c = getCostEstimate(sel.drug?.generic || '');
      if (c) total += c.cost_month; else allCosted = false;
    }
    return { total, allCosted };
  }, [selected]);

  return (
    <div className="card" style={{ borderColor: 'var(--accent)', marginBottom: '14px' }}>
      <div className="card-head" style={{ background: 'linear-gradient(135deg, var(--en-t), var(--surface2))' }}>
        <div className="card-title" style={{ fontSize: '13px' }}>
          💊 Prescription Pad
          <span className="badge badge-ok" style={{ marginLeft: '6px' }}>{selected.length} item{selected.length === 1 ? '' : 's'}</span>
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
            <span className="rx-field-val">{patientDemo}</span>
          </div>
          <div className="rx-patient-field">
            <span className="rx-field-label">Date</span>
            <span className="rx-field-val">{today}</span>
          </div>
          <div className="rx-patient-field">
            <span className="rx-field-label">Diagnosis</span>
            <span className="rx-field-val">{diagnosis}</span>
          </div>
        </div>

        {selected.length === 0 ? (
          <div style={{ padding: '20px 16px', textAlign: 'center', color: 'var(--ink4)', fontSize: '12px' }}>
            Select drugs above to add to prescription pad.
          </div>
        ) : (
          <>
            {selected.map((sel, i) => {
              const cost = getCostEstimate(sel.drug?.generic || '');
              const drug = sel.drug || {};
              return (
                <div key={sel.drugId} className="rx-item">
                  <div className="rx-item-num">{i + 1}</div>
                  <div>
                    <div className="rx-item-name">{drug.generic}</div>
                    <div className="rx-item-detail">
                      {drug.route} · {String(drug.notes || sel.condName).slice(0, 70)}
                      {String(drug.notes || sel.condName).length > 70 ? '…' : ''}
                    </div>
                    {drug.brand_india && (
                      <div style={{ fontSize: '10.5px', color: 'var(--info)', marginTop: '2px' }}>
                        🇮🇳 {String(drug.brand_india).split(',')[0]}
                      </div>
                    )}
                    {cost && (
                      <div style={{ fontSize: '10px', color: 'var(--accent)', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                        ₹{cost.cost_month}/month{cost.jan_aushadhi && <span style={{ color: 'var(--ok)' }}> · Jan Aushadhi ✓</span>}
                      </div>
                    )}
                  </div>
                  <div className="rx-item-dose">{drug.dose}</div>
                  <div className="rx-item-duration">{drug.duration}</div>
                  <button className="rx-item-remove" onClick={() => onRemove(sel.drugId)}>✕</button>
                </div>
              );
            })}
            <div style={{ padding: '10px 16px', background: 'var(--surface2)', borderTop: '1.5px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '11px', color: 'var(--ink3)' }}>
                Estimated monthly cost{totalCost.allCosted ? '' : ' (partial)'}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 600, color: 'var(--accent)' }}>
                ₹{totalCost.total.toLocaleString('en-IN')}/month
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const FinalPrescription = ({ selected, patientName, doctorName, clinicName, patientDemo, diagnosis, advice, today }) => (
  <div className="rx-final">
    <div className="rx-final-header">
      <div>
        <div className="rx-final-title">Prescription</div>
        <div style={{ fontSize: '16px', fontWeight: 700, letterSpacing: '-.3px' }}>{clinicName}</div>
        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,.65)', marginTop: '2px' }}>{doctorName}</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,.5)' }}>Date</div>
        <div style={{ fontSize: '13px', fontWeight: 600 }}>{today}</div>
      </div>
    </div>
    <div className="rx-final-body">
      <div className="rx-final-patient">
        <div><div className="rx-field-label">Patient</div><div style={{ fontSize: '13px', fontWeight: 600 }}>{patientName || 'Patient'}</div></div>
        <div><div className="rx-field-label">Age / Sex</div><div style={{ fontSize: '13px', fontWeight: 600 }}>{patientDemo}</div></div>
        <div><div className="rx-field-label">Diagnosis</div><div style={{ fontSize: '13px', fontWeight: 600 }}>{diagnosis}</div></div>
      </div>

      <div style={{ fontSize: '28px', color: 'var(--ink)', fontWeight: 700, marginBottom: '12px', opacity: .15, letterSpacing: '-1px' }}>℞</div>

      {selected.map((sel, i) => {
        const drug = sel.drug || {};
        const prefix = getFormPrefix(drug.route, drug.generic);
        const timing = mapToIndianTiming(drug.freq, drug.route);
        const brand = drug.brand_india ? String(drug.brand_india).split(',')[0].trim() : '';
        return (
          <div key={sel.drugId} className="rx-final-drug">
            <div className="rx-final-rnum">{i + 1}.</div>
            <div style={{ flex: 1 }}>
              <div className="rx-final-dname">
                {prefix} {drug.generic} <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--ink2)' }}>{drug.dose}</span>
              </div>
              {brand && <div style={{ fontSize: '11.5px', color: 'var(--info)', marginBottom: '4px' }}>Brand: {brand}</div>}
              <div className="rx-final-sig" style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '15px', fontWeight: 800, background: 'rgba(0,0,0,.07)', padding: '2px 10px', borderRadius: '4px' }}>{timing}</span>
                <span style={{ color: 'var(--ink2)' }}>{drug.route}</span>
                <em style={{ color: 'var(--ink2)' }}>{drug.duration}</em>
              </div>
              {drug.notes && (
                <div style={{ fontSize: '11px', color: 'var(--ink4)', marginTop: '3px', fontStyle: 'italic' }}>
                  {String(drug.notes).slice(0, 100)}{String(drug.notes).length > 100 ? '…' : ''}
                </div>
              )}
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <span className={`badge ${drug.risk === 'high' ? 'badge-danger' : drug.risk === 'moderate' ? 'badge-warn' : 'badge-ok'}`} style={{ fontSize: '8px' }}>
                {(drug.risk || 'low').toUpperCase()}
              </span>
            </div>
          </div>
        );
      })}

      {advice.items.length > 0 && (
        <div className="rx-advice-block">
          <div className="rx-advice-title">Patient Advice &amp; Instructions</div>
          {advice.items.map((a, i) => (
            <div className="rx-advice-item" key={`adv-${i}`}>{a}</div>
          ))}
          <div className="rx-advice-item">
            Return in {advice.followupDays} days for review{advice.urgent ? ' — or sooner if symptoms worsen' : ''}.
          </div>
        </div>
      )}
    </div>
    <div className="rx-final-footer">
      <div>Generated by Cureocity Clinical Assistant · For physician use only</div>
      <div>Signature: _______________</div>
    </div>
  </div>
);

const ReferralLetterCard = ({ letter, doctorName, clinicName }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(letter.text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      });
    }
  };
  return (
    <div className="card" style={{ border: '2px solid var(--accent)', marginTop: '14px' }}>
      <div className="card-head" style={{ background: 'linear-gradient(135deg, var(--en-t), var(--surface2))' }}>
        <div className="card-title">
          {letter.isUrgent ? '⚡ URGENT' : '📧'} Referral Letter — {letter.specialistName}
        </div>
        <div style={{ display: 'flex', gap: '8px' }} className="rx-print-hide">
          <button className="btn btn-sm btn-secondary" onClick={handleCopy}>{copied ? '✓ Copied' : '📋 Copy'}</button>
          <button className="btn btn-sm btn-primary" onClick={() => window.print()}>🖨️ Print</button>
        </div>
      </div>
      <div className="card-body">
        <pre style={{ fontFamily: 'var(--font-sans)', fontSize: '12.5px', color: 'var(--ink2)', lineHeight: 1.75, whiteSpace: 'pre-wrap', wordWrap: 'break-word', margin: 0 }}>
          {letter.text}
        </pre>
        <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--border)', fontSize: '10.5px', color: 'var(--ink4)' }}>
          {doctorName} · {clinicName}
        </div>
      </div>
    </div>
  );
};

const PrescriptionPanel = ({
  engineState,
  patient,
  getRxDrugOptions,
  getRxSafetyAlerts,
  buildRxAdvice,
  buildReferralLetter,
  onNext,
  onPrev,
}) => {
  const [selected, setSelected] = useState([]); // [{drugId, drug, condId, condName, lineLabel}]
  const [patientName, setPatientName] = useState('');
  const [doctorName, setDoctorName] = useState('Dr.');
  const [clinicName] = useState('Cureocity Clinical');
  const [showFinal, setShowFinal] = useState(false);
  const [referral, setReferral] = useState(null);

  const options = useMemo(() => getRxDrugOptions(), [getRxDrugOptions]);
  const selectedIds = useMemo(() => new Set(selected.map(s => s.drugId)), [selected]);

  const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const longToday = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
  const pt = patient || engineState?.patient || {};
  const patientDemo = `${pt.age || '?'}y ${pt.gender === 'F' ? 'F' : pt.gender === 'M' ? 'M' : '—'}`;
  const longPatientDemo = `${pt.age || '?'}y ${pt.gender === 'F' ? 'Female' : pt.gender === 'M' ? 'Male' : ''}`;

  const topDx = useMemo(() => {
    const all = [...(engineState.differentials?.t3 || []), ...(engineState.differentials?.t1 || []), ...(engineState.differentials?.t2 || [])];
    return all[0]?.name || '—';
  }, [engineState.differentials]);

  const toggleDrug = (entry) => {
    setSelected(prev => {
      const idx = prev.findIndex(s => s.drugId === entry.drugId);
      if (idx >= 0) return prev.filter(s => s.drugId !== entry.drugId);
      return [...prev, entry];
    });
  };

  const removeDrug = (drugId) => {
    setSelected(prev => prev.filter(s => s.drugId !== drugId));
  };

  const clearAll = () => {
    if (selected.length && !window.confirm('Clear all selected drugs?')) return;
    setSelected([]);
    setShowFinal(false);
  };

  const safety = useMemo(() => getRxSafetyAlerts(selected), [selected, getRxSafetyAlerts]);
  const advice = useMemo(() => buildRxAdvice(selected), [selected, buildRxAdvice]);

  const handleGenerateRx = () => {
    if (!selected.length) {
      window.alert('Add at least one drug to the prescription pad first.');
      return;
    }
    setShowFinal(true);
    setReferral(null);
  };

  const handleGenerateReferral = () => {
    const letter = buildReferralLetter({
      selectedDrugs: selected,
      patientName,
      doctorName,
      clinicName,
    });
    setReferral(letter);
    setShowFinal(false);
  };

  if (!engineState.rawInput) {
    return (
      <div className="step-panel active">
        <div className="mod-header">
          <div className="mod-title">Prescription Builder</div>
          <div className="mod-desc">Build a structured prescription from KB treatment protocols.</div>
        </div>
        <div className="empty-state">
          <div className="empty-state-icon">💊</div>
          Complete intake (Step 1) and assessment to generate prescription options.
        </div>
        <div className="btn-row" style={{ marginTop: '8px' }}>
          <button className="btn btn-secondary" onClick={onPrev}>← Back to Treatment</button>
        </div>
      </div>
    );
  }

  return (
    <div className="step-panel active">
      <div className="mod-header">
        <div className="mod-title">Prescription Builder</div>
        <div className="mod-desc">
          Build a structured prescription from KB treatment protocols. All selections are checked
          against the drug safety engine before output. Indian timing (1-0-1) and Jan Aushadhi
          availability shown where known.
        </div>
      </div>

      {/* Patient + Doctor inputs */}
      <div className="card" style={{ marginBottom: '14px' }} >
        <div className="card-head"><div className="card-title">👤 Prescription Details</div></div>
        <div className="card-body">
          <div className="row2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div className="field">
              <div className="field-label"><label>Patient Name</label></div>
              <input
                type="text"
                placeholder="Mr./Mrs. …"
                value={patientName}
                onChange={e => setPatientName(e.target.value)}
              />
            </div>
            <div className="field">
              <div className="field-label"><label>Doctor Name</label></div>
              <input
                type="text"
                placeholder="Dr. …"
                value={doctorName}
                onChange={e => setDoctorName(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Drug selector */}
      {options.length > 0 ? (
        <div className="card" style={{ marginBottom: '14px' }}>
          <div className="card-head">
            <div className="card-title">📋 Select Drugs from Protocols</div>
            <div className="card-sub">Click to add to prescription pad</div>
          </div>
          <div className="card-body p0" style={{ padding: '12px' }}>
            {options.map(opt => (
              <DrugSelectorCard
                key={opt.condId}
                option={opt}
                selected={selectedIds}
                onToggle={toggleDrug}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-state-icon">💊</div>
          No KB treatment protocols available for the top differential conditions.
        </div>
      )}

      {/* Prescription pad */}
      <RxPad
        selected={selected}
        onRemove={removeDrug}
        today={today}
        patientDemo={patientDemo}
        diagnosis={topDx}
      />

      {/* Safety alerts */}
      {selected.length > 0 && <SafetyAlerts alerts={safety} />}

      {/* Tools */}
      {!showFinal && !referral && (
        <div className="btn-row rx-builder-tools" style={{ marginTop: '8px' }}>
          <button className="btn btn-primary" onClick={handleGenerateRx} disabled={!selected.length}>
            📋 Generate Final Prescription
          </button>
          <button className="btn btn-secondary" onClick={handleGenerateReferral}>
            📧 Generate Referral Letter
          </button>
          {selected.length > 0 && (
            <button className="btn btn-secondary" onClick={clearAll} style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}>
              ✕ Clear
            </button>
          )}
        </div>
      )}

      {/* Final Rx */}
      {showFinal && (
        <div style={{ marginTop: '16px' }}>
          <FinalPrescription
            selected={selected}
            patientName={patientName}
            doctorName={doctorName || 'Dr. [Name]'}
            clinicName={clinicName}
            patientDemo={longPatientDemo}
            diagnosis={topDx}
            advice={advice}
            today={longToday}
          />
          <div className="btn-row rx-print-hide" style={{ marginTop: '14px' }}>
            <button className="btn btn-primary" onClick={() => window.print()}>🖨️ Print Prescription</button>
            <button className="btn btn-secondary" onClick={() => setShowFinal(false)}>← Edit</button>
          </div>
        </div>
      )}

      {/* Referral letter */}
      {referral && (
        <>
          <ReferralLetterCard letter={referral} doctorName={doctorName || 'Dr. [Name]'} clinicName={clinicName} />
          <div className="btn-row rx-print-hide" style={{ marginTop: '8px' }}>
            <button className="btn btn-secondary" onClick={() => setReferral(null)}>← Back to Builder</button>
          </div>
        </>
      )}

      <div className="btn-row rx-print-hide" style={{ marginTop: '12px' }}>
        <button className="btn btn-secondary" onClick={onPrev}>← Back to Treatment</button>
        {onNext && (
          <button className="btn btn-secondary" onClick={onNext}>Open Clinical Tools →</button>
        )}
      </div>
    </div>
  );
};

export default PrescriptionPanel;
