// Patient details card. Pre-populates from Gemini extraction; doctor can edit
// before or after analyze. Mutates engine state directly so re-score uses it.
const PatientDetailsCard = ({ patient, onChange }) => {
  return (
    <div className="card">
      <div className="card-head">
        <div className="card-title">👤 Patient Details</div>
        <div className="card-sub">Auto-fills from Gemini extraction · editable</div>
      </div>
      <div className="card-body">
        <div className="row3">
          <div className="field" style={{ marginBottom: 0 }}>
            <div className="field-label"><label>Age</label></div>
            <input
              type="number"
              min={1}
              max={120}
              placeholder="e.g. 45"
              value={patient.age ?? ''}
              onChange={(e) => onChange('age', e.target.value)}
            />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <div className="field-label"><label>Sex</label></div>
            <select
              value={patient.gender || ''}
              onChange={(e) => onChange('gender', e.target.value)}
            >
              <option value="">Select…</option>
              <option value="F">Female</option>
              <option value="M">Male</option>
              <option value="O">Other</option>
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <div className="field-label"><label>Comorbidities</label></div>
            <input
              type="text"
              placeholder="DM, HTN, CAD…"
              value={patient.comorbid || ''}
              onChange={(e) => onChange('comorbid', e.target.value)}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default PatientDetailsCard;
