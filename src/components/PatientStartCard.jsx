import { useEffect, useState } from 'react';
import { findPatientByPhone, getOrCreatePatient, getPatientTimeline, normalisePhone } from '../lib/db';

/**
 * PatientStartCard — phone-first patient lookup at consult start.
 *
 * The clinic owner / receptionist / doctor types the patient's phone.
 * We look it up against `patients` (org-scoped), and either:
 *   - if found: surface their last 5 visits as a timeline preview,
 *     pre-populate name/age/gender/comorbidities/allergies, ready to
 *     start a new consult.
 *   - if new:  show a minimal create form (name + age + gender),
 *     create the row, ready to start.
 *
 * Phone format is auto-normalised to E.164 with Indian default country
 * code. Empty input is rejected.
 *
 * Props:
 *   - orgId           current org (from getActiveOrg())
 *   - onPatientReady  ({ patient, isReturning }) → called once the
 *                     patient row is loaded/created. Parent uses this
 *                     to seed the engine and start the consult.
 *   - onCancel        back to the previous view
 */
const PatientStartCard = ({ orgId, onPatientReady, onCancel }) => {
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [stage, setStage] = useState('phone'); // 'phone' | 'creating' | 'found'
  const [foundPatient, setFoundPatient] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const normalised = normalisePhone(phone);
  const phoneValid = !!normalised;

  // After we find a patient, fetch their last 5 visits.
  // (No need to setTimeline([]) when foundPatient is null — we already
  // reset it explicitly when the user starts a new lookup or creates.)
  useEffect(() => {
    if (!foundPatient) return undefined;
    let cancelled = false;
    getPatientTimeline(foundPatient.id, 5).then(rows => {
      if (!cancelled) setTimeline(rows);
    });
    return () => { cancelled = true; };
  }, [foundPatient]);

  const handleLookup = async () => {
    if (!phoneValid) {
      setError('Enter a valid 10-digit Indian mobile or +91 number.');
      return;
    }
    if (!orgId) {
      setError('Org context not loaded yet — please retry in a moment.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const found = await findPatientByPhone(orgId, normalised);
      if (found) {
        setTimeline([]); // reset before the fetch effect refills
        setFoundPatient(found);
        setStage('found');
      } else {
        setStage('creating');
      }
    } catch (e) {
      setError(e.message || 'Lookup failed');
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = async () => {
    if (!phoneValid || !age) {
      setError('Phone and age are required.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const patient = await getOrCreatePatient(orgId, {
        phone: normalised,
        name: name.trim() || null,
        age: parseInt(age) || null,
        gender: gender || null,
      });
      onPatientReady?.({ patient, isReturning: false });
    } catch (e) {
      setError(e.message || 'Create failed');
    } finally {
      setBusy(false);
    }
  };

  const handleStartFromExisting = () => {
    if (!foundPatient) return;
    onPatientReady?.({ patient: foundPatient, isReturning: true });
  };

  return (
    <div className="card" style={{ marginBottom: '16px', borderColor: 'var(--accent)' }}>
      <div className="card-head" style={{ background: 'linear-gradient(135deg, var(--en-t), var(--surface2))' }}>
        <div className="card-title">👤 New Consultation — Identify Patient</div>
        <div className="card-sub">
          Phone-first. {stage === 'found' ? 'Returning patient · last visits below.' : stage === 'creating' ? 'New patient — minimum details only.' : 'Enter phone to lookup or create.'}
        </div>
      </div>

      <div className="card-body">
        {/* Phone input — always visible */}
        <div className="row2" style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '10px', marginBottom: '12px' }}>
          <div className="field" style={{ margin: 0 }}>
            <div className="field-label"><label>Patient Phone (10-digit Indian or +91)</label></div>
            <input
              type="tel"
              placeholder="9876543210 or +91 98765 43210"
              value={phone}
              onChange={e => { setPhone(e.target.value); setStage('phone'); setFoundPatient(null); setError(null); }}
              onKeyDown={e => { if (e.key === 'Enter' && phoneValid && stage === 'phone') handleLookup(); }}
              disabled={busy}
              autoFocus
              style={{ fontFamily: 'var(--font-mono)' }}
            />
          </div>
          {stage === 'phone' && (
            <button
              className="btn btn-primary"
              onClick={handleLookup}
              disabled={!phoneValid || busy || !orgId}
              style={{ alignSelf: 'flex-end', height: '36px' }}
            >
              {busy ? 'Looking up…' : 'Lookup'}
            </button>
          )}
        </div>

        {/* New patient — show minimal creation form */}
        {stage === 'creating' && (
          <div style={{
            padding: '12px 14px', background: 'var(--surface2)',
            border: '1.5px solid var(--accent)', borderRadius: 'var(--r)',
            marginBottom: '12px',
          }}>
            <div style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '8px' }}>
              ✨ New Patient — never seen here before
            </div>
            <div className="row3" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '10px', marginBottom: '10px' }}>
              <div className="field" style={{ margin: 0 }}>
                <div className="field-label"><label>Name (optional)</label></div>
                <input type="text" placeholder="Mr/Mrs …" value={name} onChange={e => setName(e.target.value)} />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <div className="field-label"><label>Age *</label></div>
                <input type="number" min="0" max="120" placeholder="42" value={age} onChange={e => setAge(e.target.value)} />
              </div>
              <div className="field" style={{ margin: 0 }}>
                <div className="field-label"><label>Sex *</label></div>
                <select value={gender} onChange={e => setGender(e.target.value)}>
                  <option value="">—</option>
                  <option value="M">Male</option>
                  <option value="F">Female</option>
                  <option value="O">Other</option>
                </select>
              </div>
            </div>
            <button
              className="btn btn-primary btn-sm"
              onClick={handleCreate}
              disabled={busy || !age || !gender}
            >
              {busy ? 'Creating…' : '✓ Create patient & start consult'}
            </button>
          </div>
        )}

        {/* Returning patient — surface timeline + "start consult" */}
        {stage === 'found' && foundPatient && (
          <div>
            <div style={{
              padding: '10px 14px', background: 'var(--ok-t)',
              border: '1.5px solid rgba(26,112,64,.3)', borderRadius: 'var(--r)',
              marginBottom: '12px',
            }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ok)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: '5px' }}>
                ✓ Returning patient
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', fontSize: '13px' }}>
                <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{foundPatient.name || '(no name)'}</span>
                <span style={{ color: 'var(--ink2)' }}>{foundPatient.age || '?'}y · {foundPatient.gender === 'F' ? 'Female' : foundPatient.gender === 'M' ? 'Male' : '—'}</span>
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink4)', fontSize: '11.5px' }}>{normalised}</span>
              </div>
              {(foundPatient.comorbidities || []).length > 0 && (
                <div style={{ marginTop: '6px', fontSize: '11.5px', color: 'var(--ink3)' }}>
                  <strong>Comorbidities:</strong> {foundPatient.comorbidities.join(', ')}
                </div>
              )}
            </div>

            {timeline.length > 0 && (
              <div className="card" style={{ marginBottom: '12px' }}>
                <div className="card-head"><div className="card-title">📋 Last {timeline.length} visit{timeline.length === 1 ? '' : 's'}</div></div>
                <div className="card-body p0">
                  {timeline.map(c => (
                    <div key={c.id} style={{
                      padding: '8px 14px', borderBottom: '1px solid var(--border)',
                      display: 'grid', gridTemplateColumns: '110px 1fr auto', gap: '10px',
                      fontSize: '12px', alignItems: 'center',
                    }}>
                      <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink4)' }}>
                        {new Date(c.started_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </span>
                      <span style={{ color: 'var(--ink2)' }}>
                        {c.primary_diagnosis_name || c.chief_complaint || <em style={{ color: 'var(--ink4)' }}>not finalized</em>}
                      </span>
                      {c.certainty_pct != null && (
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10.5px', color: 'var(--ink4)' }}>
                          {c.certainty_pct}%
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button className="btn btn-primary" onClick={handleStartFromExisting}>
              ⚡ Start Consult with {foundPatient.name || 'this patient'}
            </button>
          </div>
        )}

        {error && (
          <div className="rx-safety-banner danger" style={{ marginTop: '10px' }}>
            ⛔ {error}
          </div>
        )}

        {!orgId && (
          <div style={{ marginTop: '10px', fontSize: '11.5px', color: 'var(--warn)' }}>
            ⏳ Waiting for organization context to load. If this persists, sign out and back in.
          </div>
        )}
      </div>

      {onCancel && (
        <div className="btn-row" style={{ padding: '10px 14px', borderTop: '1px solid var(--border)' }}>
          <button className="btn btn-secondary btn-sm" onClick={onCancel}>← Cancel</button>
        </div>
      )}
    </div>
  );
};

export default PatientStartCard;
