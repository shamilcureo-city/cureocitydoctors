'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';

interface Patient {
  id: string;
  name: string;
  age: number;
  gender: string;
  phone: string;
  allergies?: string[];
  comorbidities?: string[];
}

type Step = 'patient' | 'mode' | 'creating';
type Mode = 'quick' | 'standard' | 'comprehensive';

const MODE_OPTIONS: {
  value: Mode;
  label: string;
  description: string;
  borderColor: string;
  selectedBg: string;
}[] = [
  {
    value: 'quick',
    label: 'Quick Follow-Up',
    description: 'Stable chronic disease, medication refills. Under 60 seconds.',
    borderColor: 'border-green-500',
    selectedBg: 'bg-green-50',
  },
  {
    value: 'standard',
    label: 'Standard',
    description: 'New complaints, moderate complexity. 2-3 minutes.',
    borderColor: 'border-blue-500',
    selectedBg: 'bg-blue-50',
  },
  {
    value: 'comprehensive',
    label: 'Comprehensive Workup',
    description: 'Complex multi-system, diagnostic uncertainty. 5-8 minutes.',
    borderColor: 'border-purple-500',
    selectedBg: 'bg-purple-50',
  },
];

export default function NewConsultationPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [step, setStep] = useState<Step>('patient');
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [selectedMode, setSelectedMode] = useState<Mode>('standard');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Auto-select patient from URL param
  useEffect(() => {
    const patientId = searchParams.get('patient');
    if (patientId) {
      setLoading(true);
      api
        .get<Patient>(`/patients/${patientId}`)
        .then((patient) => {
          setSelectedPatient(patient);
          setStep('mode');
        })
        .catch(() => setError('Failed to load patient.'))
        .finally(() => setLoading(false));
    }
  }, [searchParams]);

  // Debounced patient search
  const searchPatients = useCallback(async (q: string) => {
    if (!q || q.length < 2) {
      setSearchResults([]);
      return;
    }
    setLoading(true);
    try {
      const res = await api.get<{ data: Patient[] }>(`/patients?q=${encodeURIComponent(q)}`);
      setSearchResults(res.data || []);
    } catch {
      setSearchResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (step !== 'patient' || selectedPatient) return;
    const timer = setTimeout(() => searchPatients(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery, searchPatients, step, selectedPatient]);

  const handleSelectPatient = (patient: Patient) => {
    setSelectedPatient(patient);
    setStep('mode');
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleChangePatient = () => {
    setSelectedPatient(null);
    setStep('patient');
    setError('');
  };

  const handleStartConsultation = async () => {
    if (!selectedPatient) return;
    setStep('creating');
    setError('');
    try {
      const result = await api.post<{ id: string }>('/consultations', {
        patient_id: selectedPatient.id,
        mode: selectedMode,
      });
      router.push(`/consultation/${result.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create consultation.');
      setStep('mode');
    }
  };

  return (
    <div className="brand-shell">
      <header className="bg-white/80 border-b border-teal-100 px-6 py-4 backdrop-blur">
        <div className="max-w-7xl mx-auto flex items-center gap-4">
          <a href="/dashboard" className="text-cureocity-primary hover:text-teal-800">
            &larr; Back
          </a>
          <h1 className="text-xl font-bold text-cureocity-text">New Consultation</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8">
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-8 text-sm">
          <span className={step === 'patient' ? 'font-bold text-cureocity-primary' : 'text-cureocity-muted'}>
            1. Select Patient
          </span>
          <span className="text-cureocity-muted">&rarr;</span>
          <span className={step === 'mode' ? 'font-bold text-cureocity-primary' : 'text-cureocity-muted'}>
            2. Choose Mode
          </span>
          <span className="text-cureocity-muted">&rarr;</span>
          <span className={step === 'creating' ? 'font-bold text-cureocity-primary' : 'text-cureocity-muted'}>
            3. Start
          </span>
        </div>

        {/* Step 1: Patient Selection */}
        {step === 'patient' && !selectedPatient && (
          <div>
            <h2 className="text-lg font-semibold text-cureocity-text mb-4">Select Patient</h2>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, phone, or patient ID..."
              className="brand-input mb-4"
            />
            {loading && <p className="text-cureocity-muted text-sm">Searching...</p>}
            <div className="space-y-3">
              {searchResults.map((patient) => (
                <button
                  key={patient.id}
                  onClick={() => handleSelectPatient(patient)}
                  className="brand-card w-full text-left p-4 hover:border-cureocity-primary transition"
                >
                  <h3 className="font-medium text-cureocity-text">{patient.name}</h3>
                  <p className="text-sm text-cureocity-muted">
                    {patient.age}y / {patient.gender} &middot; {patient.phone}
                  </p>
                </button>
              ))}
              {!loading && searchQuery.length >= 2 && searchResults.length === 0 && (
                <p className="text-cureocity-muted text-sm text-center py-8">No patients found.</p>
              )}
            </div>
          </div>
        )}

        {/* Selected patient card (visible in mode step) */}
        {selectedPatient && (step === 'mode' || step === 'patient') && (
          <div className="brand-card p-6 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-cureocity-text">{selectedPatient.name}</h3>
                <p className="text-sm text-cureocity-muted">
                  {selectedPatient.age}y / {selectedPatient.gender} &middot; {selectedPatient.phone}
                </p>
              </div>
              <button
                onClick={handleChangePatient}
                className="text-sm text-cureocity-primary hover:text-teal-800 underline"
              >
                Change
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Mode Selection */}
        {step === 'mode' && (
          <div>
            <h2 className="text-lg font-semibold text-cureocity-text mb-4">Choose Consultation Mode</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              {MODE_OPTIONS.map((mode) => (
                <button
                  key={mode.value}
                  onClick={() => setSelectedMode(mode.value)}
                  className={`text-left p-4 rounded-xl border-2 transition ${
                    selectedMode === mode.value
                      ? `${mode.borderColor} ${mode.selectedBg}`
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <h3 className="font-semibold text-cureocity-text mb-1">{mode.label}</h3>
                  <p className="text-sm text-cureocity-muted">{mode.description}</p>
                </button>
              ))}
            </div>
            <button
              onClick={handleStartConsultation}
              className="brand-button w-full px-4 py-3"
            >
              Start Consultation
            </button>
          </div>
        )}

        {/* Step 3: Creating */}
        {step === 'creating' && (
          <div className="text-center py-16">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cureocity-primary mx-auto mb-4" />
            <p className="text-cureocity-muted">Starting consultation...</p>
          </div>
        )}
      </main>
    </div>
  );
}
