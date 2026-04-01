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
    <div className="min-h-screen bg-cureocity-bg">
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <a href="/dashboard" className="text-cureocity-primary hover:text-teal-800">
              &larr; Back
            </a>
            <h1 className="text-xl font-bold text-cureocity-text">Patient Records</h1>
          </div>
          <a
            href="/patients/new"
            className="px-4 py-2 bg-cureocity-primary text-white rounded-lg text-sm hover:bg-teal-800"
          >
            + New Patient
          </a>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, phone, or patient ID..."
          className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-cureocity-primary focus:border-transparent outline-none mb-6"
        />

        {loading && <p className="text-cureocity-muted text-sm">Searching...</p>}

        <div className="space-y-3">
          {patients.map((patient) => (
            <a
              key={patient.id}
              href={`/patients/${patient.id}`}
              className="block p-4 bg-white rounded-lg border border-slate-200 hover:border-cureocity-primary transition"
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
