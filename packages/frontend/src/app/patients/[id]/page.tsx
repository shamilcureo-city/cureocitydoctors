'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { use } from 'react';

interface Patient {
  id: string;
  name: string;
  age: number;
  gender: string;
  phone: string;
  blood_group: string;
  allergies: string[];
  comorbidities: string[];
  abha_id: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  doctor_id: string;
  consultation_count: number;
  created_at: string;
}

interface Diagnosis {
  id: string;
  name: string;
  is_primary: boolean;
  icd_code?: string;
}

interface Prescription {
  id: string;
  drug_name: string;
  dosage: string;
  frequency: string;
  duration: string;
}

interface LabOrder {
  id: string;
  test_name: string;
  status: string;
}

interface Vitals {
  blood_pressure_systolic?: number;
  blood_pressure_diastolic?: number;
  pulse?: number;
  temperature?: number;
  spo2?: number;
  weight?: number;
  bmi?: number;
}

interface Consultation {
  id: string;
  started_at: string;
  mode: string;
  status: string;
  diagnoses: Diagnosis[];
  prescriptions: Prescription[];
  lab_orders: LabOrder[];
  vitals: Vitals[];
}

interface LabResult {
  id: string;
  test_name: string;
  value: string;
  unit: string;
  status: string;
}

interface PatientHistory {
  patient: Patient;
  consultations: Consultation[];
  lab_results: LabResult[];
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function modeBadge(mode: string) {
  const styles: Record<string, string> = {
    quick: 'bg-green-50 text-green-700',
    standard: 'bg-blue-50 text-blue-700',
    comprehensive: 'bg-purple-50 text-purple-700',
  };
  return styles[mode] || 'bg-slate-50 text-slate-700';
}

function statusBadge(status: string) {
  const styles: Record<string, string> = {
    active: 'bg-yellow-50 text-yellow-700',
    completed: 'bg-blue-50 text-blue-700',
    signed: 'bg-green-50 text-green-700',
  };
  return styles[status] || 'bg-slate-50 text-slate-700';
}

function labStatusStyle(status: string) {
  switch (status) {
    case 'normal':
      return 'text-green-700 font-medium';
    case 'high':
      return 'text-red-700 font-medium';
    case 'low':
      return 'text-amber-700 font-medium';
    case 'critical':
      return 'text-red-700 font-bold';
    default:
      return 'text-cureocity-text';
  }
}

export default function PatientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [history, setHistory] = useState<PatientHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      window.location.href = '/';
      return;
    }

    async function fetchData() {
      try {
        const [patientData, historyData] = await Promise.all([
          api.get<Patient>(`/patients/${id}`),
          api.get<PatientHistory>(`/patients/${id}/history`),
        ]);
        setPatient(patientData);
        setHistory(historyData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load patient data.');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-cureocity-bg">
        <header className="bg-white border-b border-slate-200 px-6 py-4">
          <div className="max-w-7xl mx-auto flex items-center gap-4">
            <a href="/patients" className="text-cureocity-primary hover:text-teal-800">
              &larr; Back
            </a>
            <h1 className="text-xl font-bold text-cureocity-text">Patient Details</h1>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-6 py-8">
          <p className="text-cureocity-muted text-sm">Loading patient data...</p>
        </main>
      </div>
    );
  }

  if (error || !patient) {
    return (
      <div className="min-h-screen bg-cureocity-bg">
        <header className="bg-white border-b border-slate-200 px-6 py-4">
          <div className="max-w-7xl mx-auto flex items-center gap-4">
            <a href="/patients" className="text-cureocity-primary hover:text-teal-800">
              &larr; Back
            </a>
            <h1 className="text-xl font-bold text-cureocity-text">Patient Details</h1>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-6 py-8">
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
            {error || 'Patient not found.'}
          </div>
        </main>
      </div>
    );
  }

  const consultations = history?.consultations || [];
  const labResults = history?.lab_results || [];
  const latestConsultation = consultations.length > 0 ? consultations[0] : null;
  const latestVitals =
    latestConsultation && latestConsultation.vitals && latestConsultation.vitals.length > 0
      ? latestConsultation.vitals[0]
      : null;

  return (
    <div className="min-h-screen bg-cureocity-bg">
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <a href="/patients" className="text-cureocity-primary hover:text-teal-800">
              &larr; Back
            </a>
            <h1 className="text-xl font-bold text-cureocity-text">{patient.name}</h1>
          </div>
          <a
            href={`/consultation/new?patient=${id}`}
            className="px-4 py-3 bg-cureocity-primary text-white font-semibold rounded-lg hover:bg-teal-800 transition"
          >
            New Consultation
          </a>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {/* Patient Info Card */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <p className="text-sm text-cureocity-muted">Name</p>
              <p className="font-medium text-cureocity-text">{patient.name}</p>
            </div>
            <div>
              <p className="text-sm text-cureocity-muted">Age / Gender</p>
              <p className="font-medium text-cureocity-text">
                {patient.age ? `${patient.age}y` : '—'} / {patient.gender || '—'}
              </p>
            </div>
            <div>
              <p className="text-sm text-cureocity-muted">Phone</p>
              <p className="font-medium text-cureocity-text">{patient.phone}</p>
            </div>
            <div>
              <p className="text-sm text-cureocity-muted">Blood Group</p>
              <p className="font-medium text-cureocity-text">{patient.blood_group || '—'}</p>
            </div>
            <div>
              <p className="text-sm text-cureocity-muted">ABHA ID</p>
              <p className="font-medium text-cureocity-text">{patient.abha_id || '—'}</p>
            </div>
            <div>
              <p className="text-sm text-cureocity-muted">Consultations</p>
              <p className="font-medium text-cureocity-text">{patient.consultation_count}</p>
            </div>
          </div>

          {patient.allergies && patient.allergies.length > 0 && (
            <div className="mb-3">
              <p className="text-sm text-cureocity-muted mb-1">Allergies</p>
              <div className="flex flex-wrap gap-2">
                {patient.allergies.map((allergy, i) => (
                  <span
                    key={i}
                    className="px-2 py-1 text-xs font-medium bg-red-50 text-red-700 rounded-full"
                  >
                    {allergy}
                  </span>
                ))}
              </div>
            </div>
          )}

          {patient.comorbidities && patient.comorbidities.length > 0 && (
            <div className="mb-3">
              <p className="text-sm text-cureocity-muted mb-1">Comorbidities</p>
              <div className="flex flex-wrap gap-2">
                {patient.comorbidities.map((condition, i) => (
                  <span
                    key={i}
                    className="px-2 py-1 text-xs font-medium bg-amber-50 text-amber-700 rounded-full"
                  >
                    {condition}
                  </span>
                ))}
              </div>
            </div>
          )}

          {(patient.emergency_contact_name || patient.emergency_contact_phone) && (
            <div className="border-t border-slate-200 pt-3 mt-3">
              <p className="text-sm text-cureocity-muted mb-1">Emergency Contact</p>
              <p className="font-medium text-cureocity-text">
                {patient.emergency_contact_name || '—'}
                {patient.emergency_contact_phone && (
                  <span className="text-cureocity-muted ml-2">{patient.emergency_contact_phone}</span>
                )}
              </p>
            </div>
          )}
        </div>

        {/* Recent Vitals */}
        {latestVitals && (
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-cureocity-text mb-4">Recent Vitals</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {(latestVitals.blood_pressure_systolic || latestVitals.blood_pressure_diastolic) && (
                <div>
                  <p className="text-sm text-cureocity-muted">Blood Pressure</p>
                  <p className="font-medium text-cureocity-text">
                    {latestVitals.blood_pressure_systolic}/{latestVitals.blood_pressure_diastolic} mmHg
                  </p>
                </div>
              )}
              {latestVitals.pulse != null && (
                <div>
                  <p className="text-sm text-cureocity-muted">Pulse</p>
                  <p className="font-medium text-cureocity-text">{latestVitals.pulse} bpm</p>
                </div>
              )}
              {latestVitals.temperature != null && (
                <div>
                  <p className="text-sm text-cureocity-muted">Temperature</p>
                  <p className="font-medium text-cureocity-text">{latestVitals.temperature} &deg;F</p>
                </div>
              )}
              {latestVitals.spo2 != null && (
                <div>
                  <p className="text-sm text-cureocity-muted">SpO2</p>
                  <p className="font-medium text-cureocity-text">{latestVitals.spo2}%</p>
                </div>
              )}
              {latestVitals.weight != null && (
                <div>
                  <p className="text-sm text-cureocity-muted">Weight</p>
                  <p className="font-medium text-cureocity-text">{latestVitals.weight} kg</p>
                </div>
              )}
              {latestVitals.bmi != null && (
                <div>
                  <p className="text-sm text-cureocity-muted">BMI</p>
                  <p className="font-medium text-cureocity-text">{latestVitals.bmi}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Consultations List */}
        <div>
          <h2 className="text-lg font-semibold text-cureocity-text mb-4">Consultations</h2>
          {consultations.length === 0 ? (
            <p className="text-cureocity-muted text-sm">No consultations recorded yet.</p>
          ) : (
            <div className="space-y-3">
              {consultations.map((c) => {
                const primaryDiagnosis = c.diagnoses?.find((d) => d.is_primary);
                return (
                  <a
                    key={c.id}
                    href={`/consultation/${c.id}`}
                    className="block bg-white rounded-xl border border-slate-200 p-6 hover:border-cureocity-primary transition"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-cureocity-muted">
                        {formatDate(c.started_at)}
                      </span>
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-1 text-xs font-medium rounded-full ${modeBadge(c.mode)}`}
                        >
                          {c.mode}
                        </span>
                        <span
                          className={`px-2 py-1 text-xs font-medium rounded-full ${statusBadge(c.status)}`}
                        >
                          {c.status}
                        </span>
                      </div>
                    </div>
                    {primaryDiagnosis && (
                      <p className="text-cureocity-text font-medium">
                        {primaryDiagnosis.name}
                        {primaryDiagnosis.icd_code && (
                          <span className="text-cureocity-muted text-sm ml-2">
                            ({primaryDiagnosis.icd_code})
                          </span>
                        )}
                      </p>
                    )}
                  </a>
                );
              })}
            </div>
          )}
        </div>

        {/* Lab Results */}
        {labResults.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-cureocity-text mb-4">Lab Results</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-2 pr-4 text-cureocity-muted font-medium">Test</th>
                    <th className="text-left py-2 pr-4 text-cureocity-muted font-medium">Value</th>
                    <th className="text-left py-2 text-cureocity-muted font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {labResults.map((result) => (
                    <tr key={result.id} className="border-b border-slate-100">
                      <td className="py-2 pr-4 text-cureocity-text">{result.test_name}</td>
                      <td className="py-2 pr-4 text-cureocity-text">
                        {result.value} {result.unit}
                      </td>
                      <td className={`py-2 capitalize ${labStatusStyle(result.status)}`}>
                        {result.status}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
