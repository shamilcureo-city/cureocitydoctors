import { useState } from 'react';
import Header from './Header';
import Sidebar from './Sidebar';
import LivePanel from './LivePanel';
import IntakePanel from './IntakePanel';
import ExamPanel from './ExamPanel';
import MedicationsPanel from './MedicationsPanel';
import LabsPanel from './LabsPanel';
import AssessmentPanel from './AssessmentPanel';
import PrescriptionPanel from './PrescriptionPanel';
import DisclaimerBanner from './DisclaimerBanner';
import { useEngine } from '../hooks/useEngine';
import { logEvent } from '../utils/auditLog';
import { signOut } from '../lib/auth';
import { clearActiveCase } from '../lib/casePersistence';

const WorkflowApp = ({ user }) => {
  const [activeStep, setActiveStep] = useState(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const {
    engineState,
    analyzeNarrative,
    handleFillGap,
    handleToggleExamFinding,
    handleFillExamVital,
    handleUpdateLab,
    handleAddDrug,
    handleRemoveDrug,
  } = useEngine(user?.id ?? null);

  const [steps, setSteps] = useState([
    { id: 1, label: 'Intake', sublabel: 'Complaint + History', active: true, locked: false },
    { id: 2, label: 'Missing Data', sublabel: 'History Gaps', active: false, locked: true },
    { id: 3, label: 'Exam', sublabel: 'Vitals & Physical', active: false, locked: true },
    { id: 4, label: 'Diagnostics', sublabel: 'Labs & Imaging', active: false, locked: true },
    { id: 5, label: 'Assessment', sublabel: 'Diff Dx & ICD-10', active: false, locked: true },
    { id: 6, label: 'Treatment', sublabel: 'Rx & Protocol', active: false, locked: true },
    { id: 7, label: 'Finalize', sublabel: 'Review & Print', active: false, locked: true },
  ]);

  const handleProcessIntake = (text) => {
    setIsProcessing(true);
    setTimeout(() => {
      const success = analyzeNarrative(text);
      setIsProcessing(false);
      if (success) {
        setSteps(prev => prev.map(s => {
          if (s.id === 1) return { ...s, active: false, locked: false };
          if (s.id === 2) return { ...s, active: true, locked: false };
          if (s.id > 2) return { ...s, locked: false };
          return s;
        }));
        logEvent('workflow.stepChange', { from: 1, to: 2, reason: 'intakeProcessed' });
        setActiveStep(2);
      }
    }, 500);
  };

  const handleStepClick = (id) => {
    const step = steps.find(s => s.id === id);
    if (step && !step.locked) {
      setSteps(prev => prev.map(s => ({ ...s, active: s.id === id })));
      logEvent('workflow.stepChange', { from: activeStep, to: id, reason: 'userClick' });
      setActiveStep(id);
    }
  };

  const handleNextStep = () => handleStepClick(activeStep + 1);
  const handlePrevStep = () => handleStepClick(activeStep - 1);

  const handleSignOut = async () => {
    logEvent('auth.signout', {});
    clearActiveCase();
    await signOut();
    window.location.reload();
  };

  const sysColor = { cv:'var(--cv)',rs:'var(--rs)',en:'var(--en)',nr:'var(--nr)',gi:'var(--gi)',hm:'var(--hm)',ms:'var(--ms)',ps:'var(--ps)',universal:'var(--ink3)' };

  return (
    <div className="app">
      <DisclaimerBanner />
      <Header user={user} onSignOut={handleSignOut} />
      <div className="app-body">
        <Sidebar steps={steps} onStepClick={handleStepClick} />
        <main>
          {activeStep === 1 && (
            <IntakePanel
              onProcess={handleProcessIntake}
              isProcessing={isProcessing}
            />
          )}

          {activeStep === 2 && (
            <div className="step-panel active">
              <div className="mod-header">
                <div className="mod-title">Missing Clinical Data</div>
                <div className="mod-desc">Fill in missing history items. Each item updates the differential diagnosis in real time. Critical items are highlighted.</div>
              </div>
              <div id="missing-data-content">
                {engineState.missingData.length > 0 ? (
                  engineState.missingData.map((gap) => {
                    const filled = gap.value ? 'filled' : '';
                    const critical = gap.critical && !gap.value ? 'critical' : '';
                    const color = sysColor[gap.sys] || 'var(--ink3)';
                    const sysName = gap.sys ? gap.sys.charAt(0).toUpperCase() + gap.sys.slice(1) : 'Uni';

                    return (
                      <div key={gap.key} className={`gap-item ${filled} ${critical}`}>
                        <div className="gap-checkbox">{gap.value ? '✓' : ''}</div>
                        <div style={{flex: 1}}>
                          <div className="gap-label">{gap.label}</div>
                          {gap.value && <div style={{fontSize:'11px', color:'var(--ok)', marginTop:'2px'}}>{gap.value}</div>}
                        </div>
                        <div style={{display:'flex', alignItems:'center', gap:'6px'}}>
                          {!gap.value ? (
                            <input
                              className="gap-input"
                              type="text"
                              placeholder="Enter…"
                              onBlur={(e) => {
                                if(e.target.value) handleFillGap(gap.key, e.target.value);
                              }}
                              onKeyDown={(e) => {
                                if(e.key === 'Enter' && e.target.value) handleFillGap(gap.key, e.target.value);
                              }}
                            />
                          ) : (
                            <button className="btn btn-xs btn-secondary" onClick={() => handleFillGap(gap.key, '')}>Edit</button>
                          )}
                          <span className="gap-sys-tag" style={{background:color, color:'#fff', opacity:.85}}>
                            {sysName.slice(0,3).toUpperCase()}
                          </span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="empty-state">
                    <div className="empty-state-icon">✅</div>No gaps detected.
                  </div>
                )}
              </div>
              <div className="btn-row" style={{ marginTop: '8px' }}>
                <button className="btn btn-secondary" onClick={handlePrevStep}>← Back</button>
                <button className="btn btn-primary" onClick={handleNextStep}>Continue to Examination →</button>
              </div>
            </div>
          )}

          {activeStep === 3 && (
            <ExamPanel
              engineState={engineState}
              onToggleExamFinding={handleToggleExamFinding}
              onFillExamVital={handleFillExamVital}
              onNext={handleNextStep}
              onPrev={handlePrevStep}
            />
          )}

          {activeStep === 4 && (
            <MedicationsPanel
              engineState={engineState}
              onAddDrug={handleAddDrug}
              onRemoveDrug={handleRemoveDrug}
              onNext={handleNextStep}
              onPrev={handlePrevStep}
            />
          )}

          {activeStep === 5 && (
            <LabsPanel
              engineState={engineState}
              onUpdateLab={handleUpdateLab}
              onNext={handleNextStep}
              onPrev={handlePrevStep}
            />
          )}

          {activeStep === 6 && (
            <AssessmentPanel
              engineState={engineState}
              onNext={handleNextStep}
              onPrev={handlePrevStep}
            />
          )}

          {activeStep === 7 && (
            <PrescriptionPanel
              engineState={engineState}
              onPrev={handlePrevStep}
            />
          )}
        </main>
        <LivePanel
          isProcessing={isProcessing}
          engineState={engineState}
        />
      </div>
    </div>
  );
};

export default WorkflowApp;
