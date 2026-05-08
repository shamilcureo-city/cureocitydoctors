import { useState } from 'react';
import { signInWithEmail } from '../lib/auth';
import { supabaseConfigured } from '../lib/supabaseClient';
import { logEvent } from '../utils/auditLog';

const Auth = () => {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    setError(null);
    logEvent('auth.signin.attempt', { method: 'email' });
    const { error: err } = await signInWithEmail(email.trim().toLowerCase());
    setSubmitting(false);
    if (err) {
      setError(err.message);
      logEvent('auth.signin.error', { method: 'email', message: err.message });
      return;
    }
    setSent(true);
    logEvent('auth.signin.linkSent', { method: 'email' });
  };

  if (!supabaseConfigured) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="auth-logo">
            <div className="logo-mark">Cx</div>
            <div className="logo-name">Cureocity</div>
          </div>
          <h1 className="auth-title">Local-only mode</h1>
          <p className="auth-sub">
            Cloud sync is not configured. The app will work locally — cases save to your browser
            but won't sync to the cloud or persist across devices.
          </p>
          <p className="auth-hint">
            To enable cloud sync, copy <code>.env.example</code> to <code>.env</code> and fill in
            your Supabase credentials, then restart the dev server.
          </p>
          <button
            className="btn btn-primary"
            onClick={() => {
              logEvent('auth.continueLocalOnly', {});
              window.location.reload();
            }}
            style={{ marginTop: '12px' }}
          >
            Continue in local-only mode
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="logo-mark">Cx</div>
          <div className="logo-name">Cureocity</div>
        </div>

        {sent ? (
          <>
            <h1 className="auth-title">Check your email</h1>
            <p className="auth-sub">
              We sent a sign-in link to <strong>{email}</strong>. Click it to continue.
            </p>
            <button
              className="btn btn-secondary"
              onClick={() => { setSent(false); setEmail(''); }}
              style={{ marginTop: '12px' }}
            >
              Use a different email
            </button>
          </>
        ) : (
          <>
            <h1 className="auth-title">Sign in</h1>
            <p className="auth-sub">Enter your email — we'll send a one-tap sign-in link.</p>
            <form onSubmit={handleSubmit} className="auth-form">
              <input
                type="email"
                placeholder="doctor@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                disabled={submitting}
              />
              <button
                className="btn btn-primary"
                type="submit"
                disabled={submitting || !email.trim()}
              >
                {submitting ? 'Sending…' : 'Send sign-in link'}
              </button>
            </form>
            {error && <div className="auth-error">{error}</div>}
            <p className="auth-disclaimer">
              By signing in you acknowledge this is decision support, not a substitute for
              medical judgement (Telemedicine Practice Guidelines 2020).
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default Auth;
