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
type ConsultationMode = 'quick' | 'standard' | 'comprehensive';

const MODES: { key: ConsultationMode; title: string; description: string; borderColor: string; selectedBg: string }[] = [
  {
    key: 'quick',
    title: 'Quick Follow-Up',
    description: 'Stable chronic disease, medication refills. Under 60 seconds.',
    borderColor: 'border-green-500',
    selectedBg: 'bg-green-50',
  },
  {
    key: 'standard',
    title: 'Standard',
    description: 'New complaints, moderate complexity. 2-3 minutes.',
    borderColor: 'border-blue-500',
    selectedBg: 'bg-blue-50',
  },
  {
    key: 'comprehensive',
    title: 'Comprehensive Workup',
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
  const [selectedMode, setSelectedMode] = useState<ConsultationMode>('standard');
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
        .catch(() => setError('Failed to load patient'))
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
      setError(err instanceof Error ? err.message : 'Failed to create consultation');
      setStep('mode');
    }
  };

  return (
    <div className="min-h-screen bg-cureocity-bg">
      <header className="bg-white border-b border-slate-200 px-6 py-4">
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

        {/* Step indicators */}
        <div className="flex items-center gap-3 mb-8">
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${step === 'patient' ? 'bg-cureocity-primary text-white' : selectedPatient ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-cureocity-muted'}`}>
            1. Patient
          </span>
          <span className="text-cureocity-muted">&rarr;</span>
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${step === 'mode' ? 'bg-cureocity-primary text-white' : 'bg-slate-100 text-cureocity-muted'}`}>
            2. Mode
          </span>
          <span className="text-cureocity-muted">&rarr;</span>
          <span className={`px-3 py-1 rounded-full text-sm font-medium ${step === 'creating' ? 'bg-cureocity-primary text-white' : 'bg-slate-100 text-cureocity-muted'}`}>
            3. Start
          </span>
        </div>

        {/* Selected patient card (shown on mode/creating steps) */}
        {selectedPatient && step !== 'patient' && (
          <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6 flex items-center justify-between">
            <div>
              <h3 className="font-medium text-cureocity-text">{selectedPatient.name}</h3>
              <p className="text-sm text-cureocity-muted">
                {selectedPatient.age}y / {selectedPatient.gender} &middot; {selectedPatient.phone}
              </p>
            </div>
            {step === 'mode' && (
              <button
                onClick={handleChangePatient}
                className="text-sm text-cureocity-primary hover:text-teal-800 font-medium"
              >
                Change
              </button>
            )}
          </div>
        )}

        {/* Step 1: Select Patient */}
        {step === 'patient' && !selectedPatient && (
          <div>
            <h2 className="text-lg font-semibold text-cureocity-text mb-4">Select Patient</h2>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, phone, or patient ID..."
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-cureocity-primary focus:border-transparent outline-none mb-4"
            />

            {loading && <p className="text-cureocity-muted text-sm">Searching...</p>}

            <div className="space-y-2">
              {searchResults.map((patient) => (
                <button
                  key={patient.id}
                  onClick={() => handleSelectPatient(patient)}
                  className="w-full text-left p-4 bg-white rounded-xl border border-slate-200 hover:border-cureocity-primary transition"
                >
                  <h3 className="font-medium text-cureocity-text">{patient.name}</h3>
                  <p className="text-sm text-cureocity-muted">
                    {patient.age}y / {patient.gender} &middot; {patient.phone}
                  </p>
                </button>
              ))}
              {!loading && searchQuery.length >= 2 && searchResults.length === 0 && (
                <p className="text-cureocity-muted text-sm text-center py-8">
                  No patients found.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Step 2: Select Mode */}
        {step === 'mode' && (
          <div>
            <h2 className="text-lg font-semibold text-cureocity-text mb-4">Select Consultation Mode</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              {MODES.map((mode) => (
                <button
                  key={mode.key}
                  onClick={() => setSelectedMode(mode.key)}
                  className={`p-6 rounded-xl border-2 text-left transition ${
                    selectedMode === mode.key
                      ? `${mode.borderColor} ${mode.selectedBg}`
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <h3 className="font-semibold text-cureocity-text mb-2">{mode.title}</h3>
                  <p className="text-sm text-cureocity-muted">{mode.description}</p>
                </button>
              ))}
            </div>
            <button
              onClick={handleStartConsultation}
              className="w-full px-4 py-3 bg-cureocity-primary text-white font-semibold rounded-lg hover:bg-teal-800 transition disabled:opacity-50"
            >
              Start Consultation
            </button>
          </div>
        )}

        {/* Step 3: Creating */}
        {step === 'creating' && (
          <div className="text-center py-16">
            <div className="animate-spin h-8 w-8 border-4 border-cureocity-primary border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-cureocity-muted">Setting up your consultation...</p>
          </div>
        )}
      </main>
    </div>
  );
}
