import { useState } from 'react';
import { EngineCore } from '../engine/cureocityEngine';

const SECTION_LABELS = {
  cbc: 'Complete Blood Count',
  metabolic: 'Metabolic / Renal',
  cardiac: 'Cardiac Markers',
  thyroid: 'Thyroid Function',
  lft: 'Liver Function',
  inflam: 'Inflammatory Markers',
};

const LAB_DEFS = EngineCore.getLabDefs();

function LabInput({ initialValue, onCommit }) {
  const [v, setV] = useState(initialValue ?? '');
  const [lastSeen, setLastSeen] = useState(initialValue);
  if (initialValue !== lastSeen) {
    setLastSeen(initialValue);
    setV(initialValue ?? '');
  }
  return (
    <input
      type="text"
      className="lab-input"
      placeholder="—"
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => onCommit(v)}
      onKeyDown={(e) => { if (e.key === 'Enter') onCommit(v); }}
    />
  );
}

const LabsPanel = ({ engineState, onUpdateLab, onNext, onPrev }) => {
  const labs = engineState.labs || {};

  return (
    <div className="step-panel active">
      <div className="mod-header">
        <div className="mod-title">Lab Results Integration</div>
        <div className="mod-desc">Enter lab values manually. The engine highlights abnormalities, maps to systems, and integrates into the differential reasoning.</div>
      </div>

      <div className="card">
        <div className="card-head">
          <div className="card-title">📊 Enter Lab Values</div>
          <div className="card-sub">Leave blank if not done</div>
        </div>
        <div className="card-body">
          {Object.entries(LAB_DEFS).map(([section, defs], idx) => (
            <div key={section}>
              {idx > 0 && <div className="divider"></div>}
              <div className="lab-section">
                <div className="lab-section-title">{SECTION_LABELS[section] || section}</div>
                <div className="lab-grid">
                  {defs.map(def => {
                    const val = labs[def.key] || '';
                    const status = val ? EngineCore.getLabStatus(val, def) : '';
                    return (
                      <div key={def.key} className={`lab-item ${status}`} id={`labitem-${def.key}`}>
                        <div className="lab-name">{def.name}</div>
                        <LabInput
                          initialValue={val}
                          onCommit={(next) => onUpdateLab(def.key, next)}
                        />
                        <div className="lab-unit">{def.unit}</div>
                        <div className="lab-ref">{def.ref[0]}–{def.ref[1]}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="btn-row" style={{ marginTop: '8px' }}>
        <button className="btn btn-secondary" onClick={onPrev}>← Back</button>
        <button className="btn btn-primary" onClick={onNext}>Generate Full Assessment →</button>
      </div>
    </div>
  );
};

export default LabsPanel;
