'use client';

import { useState, useEffect, useCallback } from 'react';

interface Patient {
  id: string;
  name: string;
  age: number;
  gender: string;
  phone: string;
}

export default function PatientsPage() {
  const [query, setQuery] = useState('');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(false);

  const searchPatients = useCallback(async (q: string) => {
    if (!q || q.length < 2) {
      setPatients([]);
      return;
    }
    setLoading(true);
    const token = localStorage.getItem('accessToken');
    try {
      const res = await fetch(`/api/patients?q=${encodeURIComponent(q)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setPatients(data.data || []);
    } catch {
      setPatients([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => searchPatients(query), 300);
    return () => clearTimeout(timer);
  }, [query, searchPatients]);

  return (
    <div className="brand-shell">
      <header className="bg-white/80 border-b border-teal-100 px-6 py-4 backdrop-blur">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <a href="/dashboard" className="text-cureocity-primary hover:text-teal-800">
              &larr; Back
            </a>
            <h1 className="text-xl font-bold text-cureocity-text">Patient Records</h1>
          </div>
          <a
            href="/patients/new"
            className="brand-button px-4 py-2 text-sm"
          >
            + New Patient
          </a>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="brand-card p-4 mb-6">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, phone, or patient ID..."
            className="brand-input"
          />
        </div>

        {loading && <p className="text-cureocity-muted text-sm">Searching...</p>}

        <div className="space-y-3">
          {patients.map((patient) => (
            <a
              key={patient.id}
              href={`/patients/${patient.id}`}
              className="brand-card block p-4 hover:border-cureocity-primary transition"
            >
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="font-medium text-cureocity-text">{patient.name}</h3>
                  <p className="text-sm text-cureocity-muted">
                    {patient.age}y / {patient.gender} &middot; {patient.phone}
                  </p>
                </div>
                <span className="text-cureocity-muted">&rarr;</span>
              </div>
            </a>
          ))}
          {!loading && query.length >= 2 && patients.length === 0 && (
            <p className="text-cureocity-muted text-sm text-center py-8">
              No patients found.{' '}
              <a href="/patients/new" className="text-cureocity-primary underline">
                Register new patient
              </a>
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
