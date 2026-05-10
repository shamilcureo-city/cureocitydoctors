import { useState } from 'react';
import CalculatorsPanel from './CalculatorsPanel';
import SOAPNotePanel from './SOAPNotePanel';
import ICDPanel from './ICDPanel';

const Step8Panel = ({
  patient,
  getActiveConditionIds,
  computeCalcScore,
  getCalcAutofill,
  buildSOAPText,
  getSuggestedICD,
  onPrev,
}) => {
  const [tab, setTab] = useState('scores');

  return (
    <div className="step-panel active">
      <div className="mod-header">
        <div className="mod-title">Clinical Tools</div>
        <div className="mod-desc">Risk score calculators, auto-generated SOAP note, and ICD-10 coding assistant — all driven from the current case.</div>
      </div>

      <div className="assess-tabs">
        <button className={`assess-tab ${tab === 'scores' ? 'active' : ''}`} onClick={() => setTab('scores')}>
          🧮 Risk Scores
        </button>
        <button className={`assess-tab ${tab === 'soap' ? 'active' : ''}`} onClick={() => setTab('soap')}>
          📋 SOAP Note
        </button>
        <button className={`assess-tab ${tab === 'icd' ? 'active' : ''}`} onClick={() => setTab('icd')}>
          🏷️ ICD-10
        </button>
      </div>

      {tab === 'scores' && (
        <div className="assess-tab-pane active">
          <CalculatorsPanel
            patient={patient}
            getActiveConditionIds={getActiveConditionIds}
            computeCalcScore={computeCalcScore}
            getCalcAutofill={getCalcAutofill}
          />
        </div>
      )}

      {tab === 'soap' && (
        <div className="assess-tab-pane active">
          <SOAPNotePanel buildSOAPText={buildSOAPText} />
        </div>
      )}

      {tab === 'icd' && (
        <div className="assess-tab-pane active">
          <ICDPanel getSuggestedICD={getSuggestedICD} />
        </div>
      )}

      <div className="btn-row" style={{ marginTop: '8px' }}>
        <button className="btn btn-secondary" onClick={onPrev}>← Back to Finalize</button>
      </div>
    </div>
  );
};

export default Step8Panel;
