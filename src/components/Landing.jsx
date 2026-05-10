import { useState } from 'react';
import { supabase, supabaseConfigured } from '../lib/supabaseClient';
import { logEvent } from '../utils/auditLog';

const Landing = ({ onContinue }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [state, setState] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() && !phone.trim()) return;
    setSubmitting(true);
    setError(null);
    logEvent('landing.signup.attempt', { hasEmail: !!email, hasPhone: !!phone });

    if (!supabaseConfigured) {
      setError('Cloud sync not configured. Your interest cannot be recorded yet.');
      setSubmitting(false);
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const { error: err } = await supabase.from('landing_signups').insert({
      name: name.trim() || null,
      email: email.trim().toLowerCase() || null,
      phone: phone.trim() || null,
      state: state.trim() || null,
      utm_source: params.get('utm_source'),
      utm_medium: params.get('utm_medium'),
      utm_campaign: params.get('utm_campaign'),
    });

    setSubmitting(false);
    if (err) {
      setError(err.message);
      logEvent('landing.signup.error', { message: err.message });
      return;
    }
    setSubmitted(true);
    logEvent('landing.signup.submitted', {});
  };

  return (
    <div className="landing">
      <header className="landing-header">
        <div className="logo">
          <div className="logo-mark">Cx</div>
          <div className="logo-name">Cureocity</div>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={onContinue}>
          Sign in →
        </button>
      </header>

      <main className="landing-hero">
        <div className="landing-eyebrow">For Indian primary-care doctors · Kerala first</div>
        <h1 className="landing-h1">
          Faster intake. Sharper differentials.<br />
          Built around how you actually work.
        </h1>
        <p className="landing-sub">
          A clinical-decision-support assistant that reads English, Indian English and Manglish,
          surfaces critical history gaps, checks drug interactions and risk scores, and helps you
          finalize the prescription — all without changing how you consult.
        </p>

        <div className="landing-cta">
          {submitted ? (
            <div className="landing-thanks">
              ✓ Thanks — we'll reach out to onboard you for the Kerala pilot.
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="landing-form">
              <div className="landing-form-row">
                <input
                  type="text"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="landing-form-row">
                <input
                  type="tel"
                  placeholder="Phone (optional)"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
                <input
                  type="text"
                  placeholder="State (e.g. Kerala)"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                />
              </div>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={submitting || (!email.trim() && !phone.trim())}
              >
                {submitting ? 'Sending…' : 'Request pilot access'}
              </button>
            </form>
          )}
          {error && <div className="auth-error">{error}</div>}
        </div>

        <div className="landing-features">
          <div className="landing-feature">
            <div className="landing-feature-icon">🗣️</div>
            <div className="landing-feature-title">Manglish-aware intake</div>
            <div className="landing-feature-desc">
              Type or dictate in any mix of English, Manglish or Indian English. The engine
              normalizes shorthand (HTN, h/o, k/c/o), Kerala medical phrases, and common
              misspellings before reasoning.
            </div>
          </div>
          <div className="landing-feature">
            <div className="landing-feature-icon">🩺</div>
            <div className="landing-feature-title">Differential reasoning</div>
            <div className="landing-feature-desc">
              T1 / T2 / T3 (must-not-miss) tiers with red flags, missing-data prompts, and
              calibrated certainty — grounded in WHO, NICE, ESC, ICMR/MoHFW guidelines.
            </div>
          </div>
          <div className="landing-feature">
            <div className="landing-feature-icon">💊</div>
            <div className="landing-feature-title">Drugs + labs + risk</div>
            <div className="landing-feature-desc">
              Drug-interaction checks, India-context generics, lab abnormality alerts, plus
              built-in CURB-65, Wells, GRACE, NEWS2 calculators.
            </div>
          </div>
        </div>

        <p className="landing-disclaimer">
          Decision support — not a substitute for medical judgement. Per the Telemedicine
          Practice Guidelines (2020).
        </p>
      </main>

      <footer className="landing-footer">
        <span>© Cureocity</span>
        <button className="btn btn-link" onClick={onContinue}>I already have access →</button>
      </footer>
    </div>
  );
};

export default Landing;
