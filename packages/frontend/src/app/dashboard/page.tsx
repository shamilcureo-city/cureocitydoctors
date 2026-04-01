'use client';

import { useEffect, useState } from 'react';

interface Doctor {
  id: string;
  name: string;
  phone: string;
  specialization: string;
}

export default function DashboardPage() {
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      window.location.href = '/';
      return;
    }
    fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error('Unauthorized');
        return res.json();
      })
      .then((data) => setDoctor(data.doctor))
      .catch(() => {
        localStorage.removeItem('accessToken');
        window.location.href = '/';
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-cureocity-muted">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cureocity-bg">
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className="text-xl font-bold text-cureocity-primary">Cureocity</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-cureocity-muted">
              Dr. {doctor?.name || 'Doctor'}
            </span>
            <button
              onClick={() => {
                localStorage.removeItem('accessToken');
                localStorage.removeItem('refreshToken');
                window.location.href = '/';
              }}
              className="text-sm text-red-500 hover:text-red-700"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <a
            href="/consultation/new"
            className="p-6 bg-cureocity-primary text-white rounded-xl hover:bg-teal-800 transition"
          >
            <h3 className="text-lg font-semibold">New Consultation</h3>
            <p className="text-teal-100 text-sm mt-1">Start ambient capture</p>
          </a>
          <a
            href="/patients"
            className="p-6 bg-white border border-slate-200 rounded-xl hover:border-cureocity-primary transition"
          >
            <h3 className="text-lg font-semibold text-cureocity-text">Patient Records</h3>
            <p className="text-cureocity-muted text-sm mt-1">Search and manage patients</p>
          </a>
          <a
            href="/patients/new"
            className="p-6 bg-white border border-slate-200 rounded-xl hover:border-cureocity-primary transition"
          >
            <h3 className="text-lg font-semibold text-cureocity-text">Register Patient</h3>
            <p className="text-cureocity-muted text-sm mt-1">Add a new patient</p>
          </a>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="text-lg font-semibold mb-4">Today&apos;s Queue</h2>
          <p className="text-cureocity-muted text-sm">
            No consultations yet. Start a new consultation to begin.
          </p>
        </div>
      </main>
    </div>
  );
}
