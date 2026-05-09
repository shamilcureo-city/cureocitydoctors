import { useState } from 'react';

const DRUG_SUGGESTIONS = [
  'Metformin','Warfarin','Aspirin','Ramipril','Amlodipine','Atorvastatin',
  'Levothyroxine','Furosemide','Bisoprolol','Omeprazole','Clopidogrel','Insulin',
  'Prednisolone','Methotrexate','Rifampicin','Ibuprofen','Digoxin','Amiodarone',
  'Lithium','SSRIs (Sertraline)','Tramadol'
];

const MedicationsPanel = ({ engineState, onAddDrug, onRemoveDrug, onNext, onPrev }) => {
  const [drugName, setDrugName] = useState('');
  const [drugDose, setDrugDose] = useState('');
  const [drugDur, setDrugDur] = useState('');

  const handleAdd = () => {
    if (!drugName.trim()) return;
    onAddDrug(drugName.trim(), drugDose.trim(), drugDur.trim());
    setDrugName('');
    setDrugDose('');
    setDrugDur('');
  };

  const drugs = engineState.drugs || [];
  const interactions = engineState.interactions || [];

  return (
    <div className="step-panel active">
      <div className="mod-header">
        <div className="mod-title">Medication Safety Check</div>
        <div className="mod-desc">Enter current medications to check for interactions, contraindications, and duplicate therapy.</div>
      </div>

      <div className="card">
        <div className="card-head"><div className="card-title">💊 Add Medication</div></div>
        <div className="card-body">
          <div className="add-drug-row">
            <div className="field" style={{ margin: 0 }}>
              <div className="field-label"><label>Drug Name</label></div>
              <input
                type="text"
                placeholder="e.g. Metformin, Warfarin…"
                list="drug-suggestions"
                value={drugName}
                onChange={e => setDrugName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
              />
              <datalist id="drug-suggestions">
                {DRUG_SUGGESTIONS.map(d => <option key={d} value={d} />)}
              </datalist>
            </div>
            <div className="field" style={{ margin: 0 }}>
              <div className="field-label"><label>Dose</label></div>
              <input type="text" placeholder="500mg BD" value={drugDose} onChange={e => setDrugDose(e.target.value)} />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <div className="field-label"><label>Duration</label></div>
              <input type="text" placeholder="3 months" value={drugDur} onChange={e => setDrugDur(e.target.value)} />
            </div>
            <button className="btn btn-primary btn-sm" onClick={handleAdd} style={{ marginBottom: '1px' }}>+ Add</button>
          </div>
        </div>
      </div>

      {drugs.length > 0 && (
        <div className="card">
          <div className="card-head"><div className="card-title">📋 Current Medications</div></div>
          <div className="card-body p0">
            {drugs.map((d, i) => (
              <div key={d.id || `${d.name}-${i}`} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '10px 16px', borderBottom: '1px solid var(--border)'
              }}>
                <div>
                  <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{d.name}</span>
                  {d.dose && <span style={{ color: 'var(--ink3)', marginLeft: '8px', fontSize: '12px' }}>{d.dose}</span>}
                  {d.duration && <span style={{ color: 'var(--ink4)', marginLeft: '8px', fontSize: '11px' }}>({d.duration})</span>}
                </div>
                <button
                  className="btn btn-xs btn-secondary"
                  onClick={() => onRemoveDrug(i)}
                  style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
                >✕ Remove</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {interactions.length > 0 ? (
        <div className="card" style={{ borderColor: 'var(--danger)' }}>
          <div className="card-head" style={{ background: 'var(--danger-t)' }}>
            <div className="card-title">⚠️ Drug Interactions ({interactions.length})</div>
          </div>
          <div className="card-body p0">
            {interactions.map((int, i) => (
              <div key={`${int.pair?.join('-') || 'pair'}-${int.sev || 'sev'}-${i}`} style={{
                padding: '10px 16px', borderBottom: '1px solid var(--border)',
                background: int.sev === 'high' ? 'rgba(255,0,0,0.03)' : 'transparent'
              }}>
                <div style={{ fontWeight: 700, color: int.sev === 'high' ? 'var(--danger)' : 'var(--warn)', fontSize: '12px' }}>
                  {int.sev === 'high' ? '🔴' : '🟡'} {int.pair?.join(' ↔ ')}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--ink2)', marginTop: '3px' }}>{int.msg}</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div>
          <div className="empty-state">
            <div className="empty-state-icon">✅</div>
            <div>{drugs.length > 0 ? 'No interactions detected.' : 'No medications added. Add medications to check for interactions.'}</div>
          </div>
        </div>
      )}

      <div className="btn-row" style={{ marginTop: '8px' }}>
        <button className="btn btn-secondary" onClick={onPrev}>← Back</button>
        <button className="btn btn-primary" onClick={onNext}>Continue to Finalize →</button>
      </div>
    </div>
  );
};

export default MedicationsPanel;
