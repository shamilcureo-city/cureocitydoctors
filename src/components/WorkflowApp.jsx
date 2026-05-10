import { useEffect, useState } from 'react';
import Header from './Header';
import Sidebar from './Sidebar';
import NotesModal from './NotesModal';
import LivePanel from './LivePanel';
import IntakePanel from './IntakePanel';
import LiveConsultPanel from './LiveConsultPanel';
import PatientStartCard from './PatientStartCard';
import SymptomBuilder from './SymptomBuilder';
import ExamPanel from './ExamPanel';
import MedicationsPanel from './MedicationsPanel';
import LabsPanel from './LabsPanel';
import AssessmentPanel from './AssessmentPanel';
import PrescriptionPanel from './PrescriptionPanel';
import Step8Panel from './Step8Panel';
import DisclaimerBanner from './DisclaimerBanner';
import SeasonalAlert from './SeasonalAlert';
import KBModal from './KBModal';
import CriticalValueOverlay from './CriticalValueOverlay';
import PaediatricBanner from './PaediatricBanner';
import { useEngine } from '../hooks/useEngine';
import { useConsultation } from '../hooks/useConsultation';
import { logEvent } from '../utils/auditLog';
import { signOut } from '../lib/auth';
import { clearActiveCase } from '../lib/casePersistence';
import { getActiveOrg, getMyOrgs, savePrescription, saveReferral } from '../lib/db';
import { supabase, supabaseConfigured } from '../lib/supabaseClient';
import { EngineCore } from '../engine/index.js';

const WorkflowApp = ({ user }) => {
  const [activeStep, setActiveStep] = useState(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const {
    engineState,
    extraction,
    extractionError,
    analyzeNarrative,
    handleFillGap,
    handleToggleExamFinding,
    handleFillExamVital,
    handleUpdateLab,
    handleAddDrug,
    handleRemoveDrug,
    patient, setPatientField,
    vitals, setVital,
    allergies, addAllergy, removeAllergy, allergyConflicts,
    structuredSymptoms, toggleStructuredSymptom,
    notes, saveNotes, resetCase,
    getActiveConditionIds, computeCalcScore, getCalcAutofill,
    buildSOAPText, getSuggestedICD,
    getTopKBProtocols, getFullReport,
    getRxDrugOptions, getRxSafetyAlerts, buildRxAdvice, buildReferralLetter,
    searchKB, getAllKB,
    getCriticalLabAlerts,
    syncFromEngine,
  } = useEngine(user?.id ?? null);

  const [activeKB, setActiveKB] = useState(null);
  const [intakeMode, setIntakeMode] = useState('live'); // 'live' | 'type'

  // Phase 2 — patient continuity context
  const [activeOrg, setActiveOrg] = useState(null);
  const [myOrgs, setMyOrgs] = useState([]);
  const [activePatient, setActivePatient] = useState(null);
  const consult = useConsultation();

  const [notesOpen, setNotesOpen] = useState(false);

  // Load the doctor's active org + all memberships on sign-in.
  // myOrgs feeds the org-switcher; activeOrg is the current scope for
  // all DB writes and /api/* budget cap.
  useEffect(() => {
    let cancelled = false;
    Promise.all([getActiveOrg(), getMyOrgs()]).then(([org, memberships]) => {
      if (cancelled) return;
      setActiveOrg(org);
      setMyOrgs(memberships);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Switching orgs clears any patient/consult state in flight — those are
  // org-scoped and must not leak across.
  const handleSwitchOrg = (orgId) => {
    const target = myOrgs.find(m => m.org_id === orgId)?.organizations;
    if (!target) return;
    if (activePatient && !window.confirm('Switching organizations will end the current consult. Continue?')) return;
    setActiveOrg(target);
    setActivePatient(null);
    consult.reset();
    resetCase();
    setActiveStep(1);
    logEvent('org.switch', { to: orgId, type: target.type });
  };

  // Owner-only: export the last 30 days of consultations + prescriptions
  // as CSV. Used by clinic owners to reconcile billing or hand off to
  // their accountant. Tally/Vyapar/etc can import a CSV directly.
  const handleExportBilling = async () => {
    if (!supabaseConfigured || !activeOrg?.id) return;
    const sinceIso = new Date(Date.now() - 30 * 86400 * 1000).toISOString();
    try {
      const { data: consults, error: cErr } = await supabase
        .from('consultations')
        .select('id, started_at, ended_at, modality, chief_complaint, primary_diagnosis_icd10, primary_diagnosis_name, certainty_pct, doctor_id, patient_id, kb_version')
        .eq('org_id', activeOrg.id)
        .gte('started_at', sinceIso)
        .order('started_at', { ascending: false });
      if (cErr) throw cErr;
      const { data: prescriptions, error: rErr } = await supabase
        .from('prescriptions')
        .select('rx_number, consultation_id, created_at, drugs, follow_up_days, delivered_via')
        .eq('org_id', activeOrg.id)
        .gte('created_at', sinceIso);
      if (rErr) throw rErr;
      const rxByConsult = new Map();
      (prescriptions || []).forEach(r => {
        const list = rxByConsult.get(r.consultation_id) || [];
        list.push(r);
        rxByConsult.set(r.consultation_id, list);
      });
      const escape = (v) => {
        if (v == null) return '';
        const s = String(v).replace(/"/g, '""');
        return /[",\n]/.test(s) ? `"${s}"` : s;
      };
      const headers = [
        'started_at', 'ended_at', 'modality', 'chief_complaint',
        'primary_diagnosis_icd10', 'primary_diagnosis_name', 'certainty_pct',
        'doctor_id', 'patient_id', 'kb_version',
        'rx_count', 'rx_numbers', 'drug_summary', 'follow_up_days',
      ];
      const rows = (consults || []).map(c => {
        const rxs = rxByConsult.get(c.id) || [];
        const drugSummary = rxs.flatMap(r => (r.drugs || []).map(d => d.generic)).join('; ');
        return [
          c.started_at, c.ended_at, c.modality, c.chief_complaint,
          c.primary_diagnosis_icd10, c.primary_diagnosis_name, c.certainty_pct,
          c.doctor_id, c.patient_id, c.kb_version,
          rxs.length,
          rxs.map(r => r.rx_number).join('; '),
          drugSummary,
          rxs[0]?.follow_up_days ?? '',
        ];
      });
      const csv = [
        headers.join(','),
        ...rows.map(r => r.map(escape).join(',')),
      ].join('\n');

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `cureocity-billing-${activeOrg.name.replace(/[^a-z0-9]+/gi, '_')}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      logEvent('billing.export', { org_id: activeOrg.id, rows: rows.length });
    } catch (err) {
      console.warn('[billing.export] failed', err);
    }
  };

  const [steps, setSteps] = useState([
    { id: 1, label: 'Intake', sublabel: 'Complaint + History', active: true, locked: false },
    { id: 2, label: 'Missing Data', sublabel: 'History Gaps', active: false, locked: true },
    { id: 3, label: 'Exam', sublabel: 'Vitals & Physical', active: false, locked: true },
    { id: 4, label: 'Diagnostics', sublabel: 'Labs & Imaging', active: false, locked: true },
    { id: 5, label: 'Assessment', sublabel: 'Diff Dx & ICD-10', active: false, locked: true },
    { id: 6, label: 'Treatment', sublabel: 'Rx & Protocol', active: false, locked: true },
    { id: 7, label: 'Finalize', sublabel: 'Review & Print', active: false, locked: true },
    { id: 8, label: 'Tools', sublabel: 'Scores · SOAP · ICD', active: false, locked: true },
  ]);

  const handleProcessIntake = async (text) => {
    setIsProcessing(true);
    try {
      const success = await analyzeNarrative(text);
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
    } finally {
      setIsProcessing(false);
    }
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

  // Finalize the current consultation (if any) and persist its engine
  // snapshot for audit/replay. Called before resetting case state on
  // "New Case" or "Change patient" so we never lose what was captured.
  const finalizeIfOpen = async (reason) => {
    if (!consult.consultation || consult.status === 'finalized') return;
    const t3 = engineState.differentials?.t3 || [];
    const t1 = engineState.differentials?.t1 || [];
    const top = t3[0] || t1[0];
    try {
      await consult.finalize({
        primaryDiagnosisName: top?.name || null,
        primaryDiagnosisIcd10: top?.kb?.icd10 || null,
        certaintyPct: engineState.certainty || null,
      });
      logEvent('consult.finalized', { reason });
    } catch {
      // already reported to Sentry by useConsultation
    }
  };

  const handleNewCase = async () => {
    if (engineState.rawInput && !window.confirm('Start a new case? Current data will be cleared.')) return;
    await finalizeIfOpen('newCase');
    consult.reset();
    setActivePatient(null);
    resetCase();
    clearActiveCase();
    setSteps((prev) => prev.map((s) => ({
      ...s,
      active: s.id === 1,
      locked: s.id !== 1,
    })));
    setActiveStep(1);
    logEvent('workflow.newCase', {});
  };

  // Cmd/Ctrl+N opens the Notes modal (matches v4 shortcut)
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        setNotesOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const sysColor = { cv:'var(--cv)',rs:'var(--rs)',en:'var(--en)',nr:'var(--nr)',gi:'var(--gi)',hm:'var(--hm)',ms:'var(--ms)',ps:'var(--ps)',universal:'var(--ink3)' };

  return (
    <div className="app">
      <DisclaimerBanner />
      <SeasonalAlert />
      <Header
        user={user}
        onSignOut={handleSignOut}
        patient={patient}
        steps={steps}
        activeStep={activeStep}
        onOpenNotes={() => setNotesOpen(true)}
        onNewCase={handleNewCase}
        activeOrg={activeOrg}
        myOrgs={myOrgs}
        onSwitchOrg={handleSwitchOrg}
        onExportBilling={handleExportBilling}
      />
      <NotesModal
        open={notesOpen}
        notes={notes}
        onSave={saveNotes}
        onClose={() => setNotesOpen(false)}
      />
      <KBModal kb={activeKB} onClose={() => setActiveKB(null)} />
      <div className="app-body">
        <Sidebar
          steps={steps}
          onStepClick={handleStepClick}
          searchKB={searchKB}
          getAllKB={getAllKB}
          onOpenKB={setActiveKB}
        />
        <main>
          <PaediatricBanner patient={patient} />
          <CriticalValueOverlay alerts={getCriticalLabAlerts ? getCriticalLabAlerts() : []} />
          {activeStep === 1 && !activePatient && (
            <PatientStartCard
              orgId={activeOrg?.id}
              onPatientReady={async ({ patient, isReturning }) => {
                EngineCore.loadPatient(patient);
                setActivePatient(patient);
                syncFromEngine();
                logEvent('consult.patient.loaded', {
                  patient_id: patient.id,
                  org_id: activeOrg?.id,
                  is_returning: isReturning,
                });
                // Open the consultation row eagerly with default consent
                // shape (consult + AI assist = true; audio retention +
                // WhatsApp delivery = false). The live consult banner
                // re-affirms patient consent verbally before any audio
                // is captured. Phase 2.4 will pass explicit consents.
                if (activeOrg?.id && user?.id) {
                  try {
                    await consult.start({
                      orgId: activeOrg.id,
                      patientId: patient.id,
                      doctorId: user.id,
                      modality: 'in_person',
                      consents: {
                        consult: true,
                        aiAssist: true,
                        audioRetention: false,
                        whatsappDelivery: false,
                      },
                    });
                  } catch (err) {
                    // useConsultation already reported via Sentry; UI will
                    // surface the error via consult.error in next render.
                    console.warn('[consult.start] failed', err);
                  }
                }
              }}
            />
          )}

          {activeStep === 1 && activePatient && (
            <>
              {/* Patient identity strip — visible above the intake mode toggle */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap',
                padding: '8px 14px', background: 'var(--surface2)',
                border: '1px solid var(--border)', borderRadius: 'var(--r)',
                marginBottom: '12px', fontSize: '12px',
              }}>
                <span style={{ fontWeight: 700, color: 'var(--ink)' }}>
                  👤 {activePatient.name || 'Patient'}
                </span>
                <span style={{ color: 'var(--ink2)' }}>
                  {activePatient.age || '?'}y · {activePatient.gender === 'F' ? 'Female' : activePatient.gender === 'M' ? 'Male' : '—'}
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink4)', fontSize: '11px' }}>
                  {activePatient.phone_e164}
                </span>
                <button
                  onClick={async () => {
                    await finalizeIfOpen('changePatient');
                    consult.reset();
                    setActivePatient(null);
                    resetCase();
                  }}
                  className="btn btn-xs btn-secondary"
                  style={{ marginLeft: 'auto', color: 'var(--ink3)' }}
                >
                  ↶ Change patient
                </button>
              </div>

              <div style={{
                display: 'flex', gap: '6px', marginBottom: '12px',
                padding: '4px', background: 'var(--surface2)',
                border: '1px solid var(--border)', borderRadius: 'var(--r)',
                width: 'fit-content',
              }}>
                <button
                  onClick={() => setIntakeMode('live')}
                  style={{
                    padding: '6px 14px', fontSize: '12px', fontWeight: 600,
                    border: 'none', borderRadius: 'calc(var(--r) - 2px)',
                    cursor: 'pointer',
                    background: intakeMode === 'live' ? 'var(--accent)' : 'transparent',
                    color: intakeMode === 'live' ? '#fff' : 'var(--ink2)',
                  }}
                >
                  🎙 Live Ambient Mode
                </button>
                <button
                  onClick={() => setIntakeMode('type')}
                  style={{
                    padding: '6px 14px', fontSize: '12px', fontWeight: 600,
                    border: 'none', borderRadius: 'calc(var(--r) - 2px)',
                    cursor: 'pointer',
                    background: intakeMode === 'type' ? 'var(--accent)' : 'transparent',
                    color: intakeMode === 'type' ? '#fff' : 'var(--ink2)',
                  }}
                >
                  ⌨️ Type Narrative
                </button>
              </div>

              {intakeMode === 'live' ? (
                <LiveConsultPanel
                  engineState={engineState}
                  drugs={engineState.drugs}
                  allergies={allergies}
                  orgId={activeOrg?.id}
                  onSync={syncFromEngine}
                  onConsultComplete={() => {
                    // Hand off to the existing review flow at Step 2
                    setSteps(prev => prev.map(s => {
                      if (s.id === 1) return { ...s, active: false, locked: false };
                      if (s.id === 2) return { ...s, active: true, locked: false };
                      if (s.id > 2) return { ...s, locked: false };
                      return s;
                    }));
                    logEvent('workflow.stepChange', { from: 1, to: 2, reason: 'liveConsultComplete' });
                    setActiveStep(2);
                  }}
                  onCancel={() => setIntakeMode('type')}
                />
              ) : (
                <IntakePanel
                  onProcess={handleProcessIntake}
                  isProcessing={isProcessing}
                  extraction={extraction}
                  extractionError={extractionError}
                  patient={patient}
                  onPatientChange={setPatientField}
                  vitals={vitals}
                  onVitalChange={setVital}
                  allergies={allergies}
                  allergyConflicts={allergyConflicts}
                  onAddAllergy={addAllergy}
                  onRemoveAllergy={removeAllergy}
                />
              )}
            </>
          )}

          {activeStep === 2 && (
            <div className="step-panel active">
              <div className="mod-header">
                <div className="mod-title">Missing Clinical Data</div>
                <div className="mod-desc">Click symptoms the patient has, then fill in missing history. Each change updates the differential in real time. Critical items are highlighted.</div>
              </div>
              <SymptomBuilder
                active={structuredSymptoms}
                onToggle={toggleStructuredSymptom}
              />
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

          {/* Step 4 — Diagnostics (Labs). Sidebar order is the clinical
              one: investigate, then assess, then treat. */}
          {activeStep === 4 && (
            <LabsPanel
              engineState={engineState}
              onUpdateLab={handleUpdateLab}
              onNext={handleNextStep}
              onPrev={handlePrevStep}
            />
          )}

          {/* Step 5 — Assessment / differential */}
          {activeStep === 5 && (
            <AssessmentPanel
              engineState={engineState}
              patient={patient}
              getTopKBProtocols={getTopKBProtocols}
              getFullReport={getFullReport}
              onNext={handleNextStep}
              onPrev={handlePrevStep}
            />
          )}

          {/* Step 6 — Treatment / medications */}
          {activeStep === 6 && (
            <MedicationsPanel
              engineState={engineState}
              onAddDrug={handleAddDrug}
              onRemoveDrug={handleRemoveDrug}
              onNext={handleNextStep}
              onPrev={handlePrevStep}
            />
          )}

          {activeStep === 7 && (
            <PrescriptionPanel
              engineState={engineState}
              patient={patient}
              getRxDrugOptions={getRxDrugOptions}
              getRxSafetyAlerts={getRxSafetyAlerts}
              buildRxAdvice={buildRxAdvice}
              buildReferralLetter={buildReferralLetter}
              onNext={handleNextStep}
              onPrev={handlePrevStep}
              onRxFinalized={async ({ drugs, advice, followUpDays }) => {
                if (!consult.consultation || !activeOrg?.id || !activePatient?.id || !user?.id) return;
                try {
                  const rx = await savePrescription({
                    consultationId: consult.consultation.id,
                    orgId: activeOrg.id,
                    patientId: activePatient.id,
                    doctorId: user.id,
                    drugs, advice, followUpDays,
                  });
                  logEvent('rx.finalize', {
                    rx_id: rx.id, rx_number: rx.rx_number,
                    drug_count: drugs.length,
                    consultation_id: consult.consultation.id,
                  });
                  // Auto-finalize the consultation now that we have a primary Rx
                  await finalizeIfOpen('rxFinalized');
                } catch (err) {
                  console.warn('[rx.persist] failed', err);
                }
              }}
              onReferralGenerated={async ({ letter }) => {
                if (!consult.consultation || !activeOrg?.id || !activePatient?.id) return;
                try {
                  const ref = await saveReferral({
                    consultationId: consult.consultation.id,
                    orgId: activeOrg.id,
                    patientId: activePatient.id,
                    specialistType: letter.specialistName,
                    isUrgent: letter.isUrgent,
                    letterText: letter.text,
                  });
                  logEvent('referral.draft', {
                    referral_id: ref.id,
                    specialist: letter.specialistName,
                    is_urgent: letter.isUrgent,
                    consultation_id: consult.consultation.id,
                  });
                } catch (err) {
                  console.warn('[referral.persist] failed', err);
                }
              }}
            />
          )}

          {/* Step 8 — Clinical Tools (Risk Scores + SOAP Note + ICD-10) */}
          {activeStep === 8 && (
            <Step8Panel
              patient={patient}
              getActiveConditionIds={getActiveConditionIds}
              computeCalcScore={computeCalcScore}
              getCalcAutofill={getCalcAutofill}
              buildSOAPText={buildSOAPText}
              getSuggestedICD={getSuggestedICD}
              onPrev={handlePrevStep}
            />
          )}
        </main>
        <LivePanel
          isProcessing={isProcessing}
          engineState={engineState}
          drugs={engineState.drugs}
          allergies={allergies}
        />
      </div>
    </div>
  );
};

export default WorkflowApp;
