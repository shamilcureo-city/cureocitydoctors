import { useState } from 'react';

const IntakePanel = ({ onProcess, isProcessing }) => {
  const [text, setText] = useState('');

  return (
    <div className="step-panel active" id="step-1">
      <div className="mod-header">
        <h2 className="mod-title">Intake & Chief Complaint</h2>
        <div className="mod-desc">Record the patient's primary concern and current history. The Clinical AI will process this in real-time.</div>
      </div>
      
      <div className="card">
        <div className="card-head">
          <div className="card-title">📝 Clinical Narrative</div>
          <div className="card-sub">AI-Assisted Processing</div>
        </div>
        <div className="card-body">
          <div className="field">
            <div className="field-label">
              <label>Chief Complaint & HPI</label>
              <span className="field-hint">Transcribe or type patient narrative</span>
            </div>
            <textarea 
              id="hpi-input" 
              placeholder="e.g. 45yo male presents with severe chest pain radiating to left arm for 2 hours..."
              value={text}
              onChange={(e) => setText(e.target.value)}
            ></textarea>
          </div>
          <div className="btn-row">
            <button 
              className="btn btn-primary" 
              onClick={() => onProcess(text)}
              disabled={isProcessing || !text.trim()}
            >
              {isProcessing ? '⏳ Analyzing...' : '⚡ Analyze Narrative'}
            </button>
            <button className="btn btn-secondary" onClick={() => setText('')}>Clear</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default IntakePanel;
