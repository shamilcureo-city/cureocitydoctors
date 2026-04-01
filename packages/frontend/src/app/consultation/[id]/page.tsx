'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { api } from '@/lib/api';

// --- Types ---

interface Patient {
  id: string;
  name: string;
  age: number;
  gender: string;
  phone: string;
  allergies?: string[];
  comorbidities?: string[];
}

interface Diagnosis {
  id: string;
  condition_name: string;
  icd10_code?: string;
  tier: 't1' | 't2' | 't3';
  kbe_score?: number;
  is_primary: boolean;
  doctor_confirmed?: boolean;
}

interface Drug {
  name: string;
  dose: string;
  frequency: string;
  route: string;
  duration: string;
  instructions: string;
}

interface Prescription {
  id: string;
  status: string;
  drugs: Drug[];
  signed_at?: string;
}

interface LabOrder {
  id: string;
  test_name: string;
  urgency: 'routine' | 'urgent' | 'stat';
  status: string;
}

interface Vitals {
  id: string;
  bp_systolic?: number;
  bp_diastolic?: number;
  pulse?: number;
  temperature?: number;
  spo2?: number;
  weight?: number;
  height?: number;
  bmi?: number;
}

interface GapQuestion {
  id: string;
  question_text: string;
  target_conditions?: string[];
  information_gain_score: number;
  status: string;
}

interface SafetyNetAlert {
  id: string;
  signal: 'green' | 'yellow' | 'red';
  category?: string;
  message: string;
  evidence?: string;
  doctor_action?: string;
}

interface Consultation {
  id: string;
  patient_id: string;
  doctor_id: string;
  mode: string;
  status: string;
  started_at: string;
  ended_at?: string;
  transcript?: string;
  consultation_data?: unknown;
  soap_note?: unknown;
  patient: Patient;
  diagnoses: Diagnosis[];
  prescriptions: Prescription[];
  lab_orders: LabOrder[];
  vitals: Vitals[];
  safety_net_alerts: SafetyNetAlert[];
  gap_questions: GapQuestion[];
}

// --- Helpers ---

function tierColor(tier: string) {
  switch (tier) {
    case 't1': return 'bg-green-100 text-green-800';
    case 't2': return 'bg-amber-100 text-amber-800';
    case 't3': return 'bg-slate-100 text-slate-700';
    default: return 'bg-slate-100 text-slate-700';
  }
}

function urgencyColor(urgency: string) {
  switch (urgency) {
    case 'stat': return 'bg-red-100 text-red-800';
    case 'urgent': return 'bg-amber-100 text-amber-800';
    default: return 'bg-slate-100 text-slate-700';
  }
}

function modeBadge(mode: string) {
  switch (mode) {
    case 'quick': return 'bg-green-100 text-green-800';
    case 'comprehensive': return 'bg-purple-100 text-purple-800';
    default: return 'bg-blue-100 text-blue-800';
  }
}

// --- Component ---

export default function ConsultationPage() {
  const params = useParams();
  const id = params.id as string;

  const [consultation, setConsultation] = useState<Consultation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Vitals form
  const [showVitalsForm, setShowVitalsForm] = useState(false);
  const [vitalsForm, setVitalsForm] = useState({
    bp_systolic: '', bp_diastolic: '', pulse: '', temperature: '', spo2: '', weight: '', height: '',
  });
  const [vitalsSubmitting, setVitalsSubmitting] = useState(false);

  // Diagnosis form
  const [showDiagnosisForm, setShowDiagnosisForm] = useState(false);
  const [diagnosisForm, setDiagnosisForm] = useState({
    condition_name: '', icd10_code: '', tier: 't1' as 't1' | 't2' | 't3', is_primary: false,
  });
  const [diagnosisSubmitting, setDiagnosisSubmitting] = useState(false);

  // Prescription
  const [localDrugs, setLocalDrugs] = useState<Drug[]>([]);
  const [drugForm, setDrugForm] = useState<Drug>({
    name: '', dose: '', frequency: '', route: 'Tab.', duration: '', instructions: '',
  });
  const [prescriptionSubmitting, setPrescriptionSubmitting] = useState(false);

  // Lab orders
  const [showLabForm, setShowLabForm] = useState(false);
  const [labForm, setLabForm] = useState({ test_name: '', urgency: 'routine' as 'routine' | 'urgent' | 'stat' });
  const [labSubmitting, setLabSubmitting] = useState(false);

  // Sign
  const [signing, setSigning] = useState(false);

  const readonly = consultation?.status === 'signed';

  const fetchConsultation = useCallback(async () => {
    try {
      const data = await api.get<Consultation>(`/consultations/${id}`);
      setConsultation(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load consultation.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchConsultation();
  }, [fetchConsultation]);

  // --- Handlers ---

  const submitVitals = async () => {
    setVitalsSubmitting(true);
    setError('');
    try {
      const data: Record<string, number> = {};
      for (const [k, v] of Object.entries(vitalsForm)) {
        if (v !== '') data[k] = parseFloat(v as string);
      }
      await api.post(`/consultations/${id}/vitals`, data);
      setShowVitalsForm(false);
      setVitalsForm({ bp_systolic: '', bp_diastolic: '', pulse: '', temperature: '', spo2: '', weight: '', height: '' });
      await fetchConsultation();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save vitals.');
    } finally {
      setVitalsSubmitting(false);
    }
  };

  const submitDiagnosis = async () => {
    if (!diagnosisForm.condition_name.trim()) return;
    setDiagnosisSubmitting(true);
    setError('');
    try {
      await api.post(`/consultations/${id}/diagnoses`, diagnosisForm);
      setShowDiagnosisForm(false);
      setDiagnosisForm({ condition_name: '', icd10_code: '', tier: 't1', is_primary: false });
      await fetchConsultation();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save diagnosis.');
    } finally {
      setDiagnosisSubmitting(false);
    }
  };

  const addDrug = () => {
    if (!drugForm.name.trim()) return;
    setLocalDrugs((prev: Drug[]) => [...prev, { ...drugForm }]);
    setDrugForm({ name: '', dose: '', frequency: '', route: 'Tab.', duration: '', instructions: '' });
  };

  const removeDrug = (index: number) => {
    setLocalDrugs((prev: Drug[]) => prev.filter((_: Drug, i: number) => i !== index));
  };

  const submitPrescription = async () => {
    if (localDrugs.length === 0) return;
    setPrescriptionSubmitting(true);
    setError('');
    try {
      await api.post(`/consultations/${id}/prescription`, { drugs: localDrugs });
      setLocalDrugs([]);
      await fetchConsultation();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save prescription.');
    } finally {
      setPrescriptionSubmitting(false);
    }
  };

  const submitLabOrder = async () => {
    if (!labForm.test_name.trim()) return;
    setLabSubmitting(true);
    setError('');
    try {
      await api.post(`/consultations/${id}/lab-orders`, { orders: [{ test_name: labForm.test_name, urgency: labForm.urgency }] });
      setShowLabForm(false);
      setLabForm({ test_name: '', urgency: 'routine' });
      await fetchConsultation();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save lab order.');
    } finally {
      setLabSubmitting(false);
    }
  };

  const signConsultation = async () => {
    setSigning(true);
    setError('');
    try {
      await api.post(`/consultations/${id}/sign`, {});
      await fetchConsultation();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign consultation.');
    } finally {
      setSigning(false);
    }
  };

  // --- Render ---

  if (loading) {
    return (
      <div className="min-h-screen bg-cureocity-bg flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cureocity-primary" />
      </div>
    );
  }

  if (!consultation) {
    return (
      <div className="min-h-screen bg-cureocity-bg flex items-center justify-center">
        <p className="text-red-600">{error || 'Consultation not found.'}</p>
      </div>
    );
  }

  const patient = consultation.patient;
  const vitals = consultation.vitals?.[0];
  const allDrugs = consultation.prescriptions?.flatMap((p: Prescription) => p.drugs) || [];

  const inputClass = 'w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-cureocity-primary focus:border-transparent outline-none';
  const inputSmClass = 'px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-cureocity-primary focus:border-transparent outline-none text-sm';
  const btnPrimary = 'px-4 py-3 bg-cureocity-primary text-white font-semibold rounded-lg hover:bg-teal-800 transition disabled:opacity-50';
  const btnSecondary = 'px-4 py-2 border border-slate-300 text-cureocity-text rounded-lg hover:bg-slate-50 transition text-sm';

  return (
    <div className="min-h-screen bg-cureocity-bg">
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center gap-4">
          <a href="/dashboard" className="text-cureocity-primary hover:text-teal-800">
            &larr; Dashboard
          </a>
          <h1 className="text-xl font-bold text-cureocity-text">Consultation</h1>
          {readonly && (
            <span className="ml-auto px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
              Signed {consultation.ended_at ? new Date(consultation.ended_at).toLocaleString() : ''}
            </span>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* --- LEFT / MAIN COLUMN --- */}
          <div className="lg:col-span-2 space-y-6">

            {/* Patient Summary */}
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h2 className="text-lg font-semibold text-cureocity-text">{patient.name}</h2>
                  <p className="text-sm text-cureocity-muted">
                    {patient.age}y / {patient.gender} &middot; {patient.phone}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${modeBadge(consultation.mode)}`}>
                    {consultation.mode}
                  </span>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    consultation.status === 'active' ? 'bg-blue-100 text-blue-800' :
                    consultation.status === 'signed' ? 'bg-green-100 text-green-800' :
                    'bg-slate-100 text-slate-700'
                  }`}>
                    {consultation.status}
                  </span>
                </div>
              </div>
              {patient.allergies && patient.allergies.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {patient.allergies.map((a, i) => (
                    <span key={i} className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs font-medium">
                      {a}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Vitals */}
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h3 className="font-semibold text-cureocity-text mb-4">Vitals</h3>
              {vitals ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                  {vitals.bp_systolic != null && (
                    <div>
                      <p className="text-cureocity-muted">BP</p>
                      <p className="font-medium text-cureocity-text">{vitals.bp_systolic}/{vitals.bp_diastolic} mmHg</p>
                    </div>
                  )}
                  {vitals.pulse != null && (
                    <div>
                      <p className="text-cureocity-muted">Pulse</p>
                      <p className="font-medium text-cureocity-text">{vitals.pulse} bpm</p>
                    </div>
                  )}
                  {vitals.temperature != null && (
                    <div>
                      <p className="text-cureocity-muted">Temp</p>
                      <p className="font-medium text-cureocity-text">{vitals.temperature} &deg;F</p>
                    </div>
                  )}
                  {vitals.spo2 != null && (
                    <div>
                      <p className="text-cureocity-muted">SpO2</p>
                      <p className="font-medium text-cureocity-text">{vitals.spo2}%</p>
                    </div>
                  )}
                  {vitals.weight != null && (
                    <div>
                      <p className="text-cureocity-muted">Weight</p>
                      <p className="font-medium text-cureocity-text">{vitals.weight} kg</p>
                    </div>
                  )}
                  {vitals.height != null && (
                    <div>
                      <p className="text-cureocity-muted">Height</p>
                      <p className="font-medium text-cureocity-text">{vitals.height} cm</p>
                    </div>
                  )}
                  {vitals.bmi != null && (
                    <div>
                      <p className="text-cureocity-muted">BMI</p>
                      <p className="font-medium text-cureocity-text">{vitals.bmi}</p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-cureocity-muted">No vitals recorded.</p>
              )}

              {!readonly && (
                <div className="mt-4">
                  {!showVitalsForm ? (
                    <button onClick={() => setShowVitalsForm(true)} className={btnSecondary}>
                      Record Vitals
                    </button>
                  ) : (
                    <div className="space-y-3 border-t border-slate-100 pt-4">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <input type="number" placeholder="BP Sys" value={vitalsForm.bp_systolic} onChange={(e) => setVitalsForm((f) => ({ ...f, bp_systolic: e.target.value }))} className={inputSmClass} />
                        <input type="number" placeholder="BP Dia" value={vitalsForm.bp_diastolic} onChange={(e) => setVitalsForm((f) => ({ ...f, bp_diastolic: e.target.value }))} className={inputSmClass} />
                        <input type="number" placeholder="Pulse" value={vitalsForm.pulse} onChange={(e) => setVitalsForm((f) => ({ ...f, pulse: e.target.value }))} className={inputSmClass} />
                        <input type="number" placeholder="Temp (°F)" value={vitalsForm.temperature} onChange={(e) => setVitalsForm((f) => ({ ...f, temperature: e.target.value }))} className={inputSmClass} />
                        <input type="number" placeholder="SpO2 (%)" value={vitalsForm.spo2} onChange={(e) => setVitalsForm((f) => ({ ...f, spo2: e.target.value }))} className={inputSmClass} />
                        <input type="number" placeholder="Weight (kg)" value={vitalsForm.weight} onChange={(e) => setVitalsForm((f) => ({ ...f, weight: e.target.value }))} className={inputSmClass} />
                        <input type="number" placeholder="Height (cm)" value={vitalsForm.height} onChange={(e) => setVitalsForm((f) => ({ ...f, height: e.target.value }))} className={inputSmClass} />
                      </div>
                      <div className="flex gap-2">
                        <button onClick={submitVitals} disabled={vitalsSubmitting} className={btnPrimary}>
                          {vitalsSubmitting ? 'Saving...' : 'Save Vitals'}
                        </button>
                        <button onClick={() => setShowVitalsForm(false)} className={btnSecondary}>Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Diagnoses */}
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h3 className="font-semibold text-cureocity-text mb-4">Diagnoses</h3>
              {consultation.diagnoses.length > 0 ? (
                <div className="space-y-3">
                  {consultation.diagnoses.map((dx) => (
                    <div key={dx.id} className="flex items-center justify-between p-3 rounded-lg border border-slate-100 bg-slate-50">
                      <div className="flex items-center gap-2">
                        {dx.is_primary && <span className="text-amber-500" title="Primary">&#9733;</span>}
                        <span className="font-medium text-cureocity-text">{dx.condition_name}</span>
                        {dx.icd10_code && <span className="text-xs text-cureocity-muted">({dx.icd10_code})</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${tierColor(dx.tier)}`}>
                          {dx.tier.toUpperCase()}
                        </span>
                        {dx.kbe_score != null && (
                          <span className="text-xs text-cureocity-muted">KBE: {dx.kbe_score}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-cureocity-muted">No diagnoses yet.</p>
              )}

              {!readonly && (
                <div className="mt-4">
                  {!showDiagnosisForm ? (
                    <button onClick={() => setShowDiagnosisForm(true)} className={btnSecondary}>
                      Add Diagnosis
                    </button>
                  ) : (
                    <div className="space-y-3 border-t border-slate-100 pt-4">
                      <input type="text" placeholder="Condition name *" value={diagnosisForm.condition_name} onChange={(e) => setDiagnosisForm((f) => ({ ...f, condition_name: e.target.value }))} className={inputClass} />
                      <div className="grid grid-cols-3 gap-3">
                        <input type="text" placeholder="ICD-10 Code" value={diagnosisForm.icd10_code} onChange={(e) => setDiagnosisForm((f) => ({ ...f, icd10_code: e.target.value }))} className={inputSmClass} />
                        <select value={diagnosisForm.tier} onChange={(e) => setDiagnosisForm((f) => ({ ...f, tier: e.target.value as 't1' | 't2' | 't3' }))} className={inputSmClass}>
                          <option value="t1">T1 - Confirmed</option>
                          <option value="t2">T2 - Probable</option>
                          <option value="t3">T3 - Possible</option>
                        </select>
                        <label className="flex items-center gap-2 text-sm text-cureocity-text">
                          <input type="checkbox" checked={diagnosisForm.is_primary} onChange={(e) => setDiagnosisForm((f) => ({ ...f, is_primary: e.target.checked }))} className="rounded" />
                          Primary
                        </label>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={submitDiagnosis} disabled={diagnosisSubmitting} className={btnPrimary}>
                          {diagnosisSubmitting ? 'Saving...' : 'Save Diagnosis'}
                        </button>
                        <button onClick={() => setShowDiagnosisForm(false)} className={btnSecondary}>Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Prescription */}
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h3 className="font-semibold text-cureocity-text mb-4">Prescription</h3>
              {allDrugs.length > 0 && (
                <div className="overflow-x-auto mb-4">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-cureocity-muted border-b border-slate-200">
                        <th className="pb-2 pr-4">Drug Name</th>
                        <th className="pb-2 pr-4">Dose</th>
                        <th className="pb-2 pr-4">Frequency</th>
                        <th className="pb-2 pr-4">Route</th>
                        <th className="pb-2 pr-4">Duration</th>
                        <th className="pb-2">Instructions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allDrugs.map((drug, i) => (
                        <tr key={i} className="border-b border-slate-50">
                          <td className="py-2 pr-4 text-cureocity-text">{drug.name}</td>
                          <td className="py-2 pr-4 text-cureocity-text">{drug.dose}</td>
                          <td className="py-2 pr-4 text-cureocity-text">{drug.frequency}</td>
                          <td className="py-2 pr-4 text-cureocity-text">{drug.route}</td>
                          <td className="py-2 pr-4 text-cureocity-text">{drug.duration}</td>
                          <td className="py-2 text-cureocity-text">{drug.instructions}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {allDrugs.length === 0 && localDrugs.length === 0 && (
                <p className="text-sm text-cureocity-muted mb-4">No drugs prescribed yet.</p>
              )}

              {!readonly && (
                <>
                  {/* Local drugs pending save */}
                  {localDrugs.length > 0 && (
                    <div className="mb-4 border border-blue-200 rounded-lg p-3 bg-blue-50">
                      <p className="text-xs text-blue-700 font-medium mb-2">Pending drugs (not yet saved):</p>
                      {localDrugs.map((drug, i) => (
                        <div key={i} className="flex items-center justify-between text-sm py-1">
                          <span className="text-cureocity-text">
                            {drug.route} {drug.name} {drug.dose} - {drug.frequency} x {drug.duration} ({drug.instructions})
                          </span>
                          <button onClick={() => removeDrug(i)} className="text-red-500 hover:text-red-700 text-xs ml-2">Remove</button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add drug form */}
                  <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 mb-3">
                    <input type="text" placeholder="Drug name" value={drugForm.name} onChange={(e) => setDrugForm((f) => ({ ...f, name: e.target.value }))} className={inputSmClass} />
                    <input type="text" placeholder="Dose (500mg)" value={drugForm.dose} onChange={(e) => setDrugForm((f) => ({ ...f, dose: e.target.value }))} className={inputSmClass} />
                    <input type="text" placeholder="Freq (1-0-1)" value={drugForm.frequency} onChange={(e) => setDrugForm((f) => ({ ...f, frequency: e.target.value }))} className={inputSmClass} />
                    <select value={drugForm.route} onChange={(e) => setDrugForm((f) => ({ ...f, route: e.target.value }))} className={inputSmClass}>
                      <option value="Tab.">Tab.</option>
                      <option value="Cap.">Cap.</option>
                      <option value="Syr.">Syr.</option>
                      <option value="Inj.">Inj.</option>
                    </select>
                    <input type="text" placeholder="Duration (5 days)" value={drugForm.duration} onChange={(e) => setDrugForm((f) => ({ ...f, duration: e.target.value }))} className={inputSmClass} />
                    <input type="text" placeholder="Instructions" value={drugForm.instructions} onChange={(e) => setDrugForm((f) => ({ ...f, instructions: e.target.value }))} className={inputSmClass} />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={addDrug} className={btnSecondary}>
                      + Add Drug
                    </button>
                    {localDrugs.length > 0 && (
                      <button onClick={submitPrescription} disabled={prescriptionSubmitting} className={btnPrimary}>
                        {prescriptionSubmitting ? 'Saving...' : 'Save Prescription'}
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Lab Orders */}
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h3 className="font-semibold text-cureocity-text mb-4">Lab Orders</h3>
              {consultation.lab_orders.length > 0 ? (
                <div className="space-y-2 mb-4">
                  {consultation.lab_orders.map((order) => (
                    <div key={order.id} className="flex items-center justify-between p-3 rounded-lg border border-slate-100 bg-slate-50">
                      <span className="font-medium text-cureocity-text text-sm">{order.test_name}</span>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${urgencyColor(order.urgency)}`}>
                          {order.urgency}
                        </span>
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600">
                          {order.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-cureocity-muted mb-4">No lab orders.</p>
              )}

              {!readonly && (
                <div>
                  {!showLabForm ? (
                    <button onClick={() => setShowLabForm(true)} className={btnSecondary}>
                      Add Lab Order
                    </button>
                  ) : (
                    <div className="space-y-3 border-t border-slate-100 pt-4">
                      <div className="grid grid-cols-2 gap-3">
                        <input type="text" placeholder="Test name" value={labForm.test_name} onChange={(e) => setLabForm((f) => ({ ...f, test_name: e.target.value }))} className={inputSmClass} />
                        <select value={labForm.urgency} onChange={(e) => setLabForm((f) => ({ ...f, urgency: e.target.value as 'routine' | 'urgent' | 'stat' }))} className={inputSmClass}>
                          <option value="routine">Routine</option>
                          <option value="urgent">Urgent</option>
                          <option value="stat">Stat</option>
                        </select>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={submitLabOrder} disabled={labSubmitting} className={btnPrimary}>
                          {labSubmitting ? 'Saving...' : 'Save Lab Order'}
                        </button>
                        <button onClick={() => setShowLabForm(false)} className={btnSecondary}>Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* --- RIGHT SIDEBAR --- */}
          <div className="lg:col-span-1 space-y-6">

            {/* Gap Questions */}
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h3 className="font-semibold text-cureocity-text mb-4">Gap Questions</h3>
              {consultation.gap_questions.length > 0 ? (
                <div className="space-y-3">
                  {[...consultation.gap_questions]
                    .sort((a, b) => b.information_gain_score - a.information_gain_score)
                    .map((gq) => (
                      <div key={gq.id} className="p-3 rounded-lg border border-slate-100 bg-slate-50">
                        <p className="text-sm text-cureocity-text mb-1">{gq.question_text}</p>
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                          Score: {gq.information_gain_score}
                        </span>
                      </div>
                    ))}
                </div>
              ) : (
                <p className="text-sm text-cureocity-muted">No gap questions.</p>
              )}
            </div>

            {/* Safety Net Alerts */}
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <h3 className="font-semibold text-cureocity-text mb-4">Safety Net Alerts</h3>
              {consultation.safety_net_alerts.length > 0 ? (
                <div className="space-y-3">
                  {consultation.safety_net_alerts.map((alert) => {
                    let borderClass = 'border-green-400';
                    let bgClass = '';
                    let label = 'AI Agrees';
                    if (alert.signal === 'yellow') {
                      borderClass = 'border-amber-400';
                      bgClass = '';
                      label = '';
                    } else if (alert.signal === 'red') {
                      borderClass = 'border-red-400';
                      bgClass = 'bg-red-50';
                      label = '';
                    }

                    return (
                      <div key={alert.id} className={`p-3 rounded-lg border-2 ${borderClass} ${bgClass}`}>
                        {alert.signal === 'green' && (
                          <span className="text-xs font-medium text-green-700 mb-1 block">{label}</span>
                        )}
                        {alert.signal === 'yellow' && (
                          <span className="text-xs font-medium text-amber-700 mb-1 block">&#9888; Warning</span>
                        )}
                        {alert.signal === 'red' && (
                          <span className="text-xs font-bold text-red-700 mb-1 block">Action Required</span>
                        )}
                        <p className="text-sm text-cureocity-text">{alert.message}</p>
                        {alert.evidence && (
                          <p className="text-xs text-cureocity-muted mt-1">{alert.evidence}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-cureocity-muted">No safety alerts.</p>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 pb-8">
          {consultation.status === 'active' && (
            <button
              onClick={signConsultation}
              disabled={signing}
              className="w-full px-4 py-4 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 transition disabled:opacity-50 text-lg"
            >
              {signing ? 'Signing...' : 'Sign Consultation'}
            </button>
          )}
          {consultation.status === 'signed' && (
            <div className="text-center py-4">
              <span className="px-4 py-2 bg-green-100 text-green-800 rounded-full font-medium">
                Consultation Signed {consultation.ended_at ? `on ${new Date(consultation.ended_at).toLocaleString()}` : ''}
              </span>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
