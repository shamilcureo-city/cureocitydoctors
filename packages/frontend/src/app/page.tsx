'use client';

import { useState } from 'react';

export default function LoginPage() {
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Failed to send OTP');
      setStep('otp');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code: otp }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Invalid OTP');
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);
      window.location.href = '/dashboard';
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="brand-shell px-4 py-8 md:px-8 md:py-12">
      <div className="mx-auto grid w-full max-w-6xl gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="brand-card p-7 md:p-10">
          <p className="mb-3 inline-flex rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-700">
            Cureocity Clinical Intelligence
          </p>
          <h1 className="text-3xl font-bold leading-tight md:text-5xl">
            Your Practice Is a System.
            <span className="block text-cureocity-primary">We Help You Upgrade It.</span>
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-cureocity-muted md:text-base">
            Ambient-ready consultations, rapid clinical documentation, and safety nets that help
            you move faster without losing quality.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {[
              { label: 'Faster OPD', value: 'Quick / Standard / Comprehensive' },
              { label: 'Safety Layers', value: 'Alerts, gap questions, audit trail' },
              { label: 'Care Continuity', value: 'Patients, history, follow-up workflow' },
            ].map((item) => (
              <div key={item.label} className="rounded-xl border border-teal-100 bg-teal-50/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">{item.label}</p>
                <p className="mt-1 text-sm font-medium text-slate-700">{item.value}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="brand-card w-full max-w-xl justify-self-center p-8">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-cureocity-primary">Cureocity</h2>
            <p className="text-cureocity-muted mt-2 text-sm">Doctor Sign In</p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}

          {step === 'phone' ? (
            <form onSubmit={handleSendOtp} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-cureocity-text">
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 9876543210"
                  className="brand-input"
                  required
                />
              </div>
              <button type="submit" disabled={loading} className="brand-button w-full py-3">
                {loading ? 'Sending...' : 'Send OTP'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-cureocity-text">
                  Enter OTP sent to {phone}
                </label>
                <input
                  type="text"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  placeholder="Enter 6-digit OTP"
                  maxLength={6}
                  className="brand-input text-center text-2xl tracking-widest"
                  required
                />
              </div>
              <button type="submit" disabled={loading} className="brand-button w-full py-3">
                {loading ? 'Verifying...' : 'Verify & Login'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setStep('phone');
                  setOtp('');
                }}
                className="w-full py-2 text-cureocity-muted hover:text-cureocity-text text-sm"
              >
                Change phone number
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
