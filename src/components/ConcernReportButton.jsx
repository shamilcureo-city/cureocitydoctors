import { useState } from 'react';
import {
  reportClinicalConcern,
  CONCERN_CATEGORIES,
  CONCERN_SEVERITIES,
} from '../lib/db';
import { KB_VERSION } from '../engine/index.js';

/**
 * ConcernReportButton — pilot post-market surveillance.
 *
 * Doctor clicks the "🚩 Report a clinical concern" button (typically
 * fixed in the bottom-right of the workflow). A modal opens with a
 * structured form. On submit, a row is written to clinical_concerns
 * with kb_version, model, and any consultation-context the parent
 * provides — then the clinical advisor triages weekly.
 *
 * Required for CDSCO post-market surveillance documentation. Without
 * this we have no documented process for catching clinical issues
 * once the product is in real doctors' hands.
 *
 * Props:
 *   - orgId          current org id
 *   - consultationId current consult (optional — concern can be
 *                    ungrounded, e.g. a UX issue)
 *   - context        any extra metadata to capture (engine snapshot
 *                    excerpt, top differentials, last AI call meta, etc.)
 */

const ConcernModal = ({ open, orgId, consultationId, context, onClose }) => {
  const [category, setCategory] = useState('');
  const [severity, setSeverity] = useState('medium');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submittedId, setSubmittedId] = useState(null);
  const [error, setError] = useState(null);

  if (!open) return null;

  const valid = category && description.trim().length >= 10;

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const row = await reportClinicalConcern({
        orgId,
        consultationId,
        category,
        severity,
        description,
        context: {
          ...context,
          kb_version: KB_VERSION,
          reported_at: new Date().toISOString(),
        },
      });
      setSubmittedId(row.id);
    } catch (e) {
      setError(e.message || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    setCategory('');
    setSeverity('medium');
    setDescription('');
    setSubmittedId(null);
    setError(null);
    onClose();
  };

  return (
    <div className="kb-modal-overlay open" onClick={handleClose}>
      <div className="kb-modal" style={{ maxWidth: '600px' }} onClick={e => e.stopPropagation()}>
        <div className="kb-modal-head">
          <div>
            <div className="kb-modal-title">🚩 Report a Clinical Concern</div>
            <div style={{ fontSize: '11px', color: 'var(--ink4)', marginTop: '2px' }}>
              Reviewed weekly by our clinical advisor. Used to fix KB / engine bugs.
            </div>
          </div>
          <button className="kb-modal-close" onClick={handleClose} aria-label="Close">✕</button>
        </div>
        <div className="kb-modal-body">
          {submittedId ? (
            <div style={{ padding: '20px 0', textAlign: 'center' }}>
              <div style={{ fontSize: '36px', marginBottom: '8px' }}>🙏</div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ok)', marginBottom: '6px' }}>
                Thank you — concern logged.
              </div>
              <div style={{ fontSize: '12px', color: 'var(--ink3)', marginBottom: '14px' }}>
                Reference ID: <span style={{ fontFamily: 'var(--font-mono)' }}>{submittedId.slice(0, 8)}</span>
              </div>
              <button className="btn btn-primary btn-sm" onClick={handleClose}>Close</button>
            </div>
          ) : (
            <>
              <div className="field">
                <div className="field-label"><label>What kind of concern?</label></div>
                <div style={{ display: 'grid', gap: '6px' }}>
                  {CONCERN_CATEGORIES.map(c => (
                    <label
                      key={c.id}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: '10px',
                        padding: '8px 10px',
                        background: category === c.id ? 'var(--en-t)' : 'var(--surface2)',
                        border: `1.5px solid ${category === c.id ? 'var(--accent)' : 'var(--border)'}`,
                        borderRadius: 'var(--r)', cursor: 'pointer',
                      }}
                    >
                      <input
                        type="radio"
                        name="concern-category"
                        value={c.id}
                        checked={category === c.id}
                        onChange={() => setCategory(c.id)}
                        style={{ marginTop: '2px' }}
                      />
                      <div>
                        <div style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--ink)' }}>{c.label}</div>
                        <div style={{ fontSize: '11px', color: 'var(--ink3)' }}>{c.hint}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="field" style={{ marginTop: '14px' }}>
                <div className="field-label"><label>Severity</label></div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {CONCERN_SEVERITIES.map(s => (
                    <button
                      key={s.id}
                      onClick={() => setSeverity(s.id)}
                      style={{
                        padding: '6px 12px', fontSize: '12px', fontWeight: 600,
                        border: '1.5px solid', borderRadius: 'var(--r)', cursor: 'pointer',
                        background: severity === s.id ? 'var(--ink)' : 'var(--surface2)',
                        color: severity === s.id ? '#fff' : 'var(--ink2)',
                        borderColor: severity === s.id ? 'var(--ink)' : 'var(--border)',
                      }}
                      title={s.hint}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="field" style={{ marginTop: '14px' }}>
                <div className="field-label">
                  <label>Describe what happened</label>
                  <span style={{ fontSize: '11px', color: 'var(--ink4)', marginLeft: '8px' }}>
                    ({description.length} / 4000)
                  </span>
                </div>
                <textarea
                  rows={5}
                  value={description}
                  onChange={e => setDescription(e.target.value.slice(0, 4000))}
                  placeholder="What did the AI do or miss? What did you expect instead? Any clinical reasoning that would help us fix it?"
                  style={{
                    width: '100%', padding: '10px 12px',
                    border: '1.5px solid var(--border)', borderRadius: 'var(--r)',
                    fontFamily: 'var(--font-sans)', fontSize: '12.5px',
                    lineHeight: 1.6, resize: 'vertical', outline: 'none',
                  }}
                />
              </div>

              <div style={{ fontSize: '10.5px', color: 'var(--ink4)', marginTop: '10px', padding: '8px 10px', background: 'var(--surface2)', borderRadius: 'var(--r)' }}>
                <strong>What we capture:</strong> the chosen category, severity, your description,
                {consultationId ? ' the consultation ID,' : ''} the KB version
                ({KB_VERSION.slice(-9)}), and any context the app already has (top differentials, model used).
                We do <strong>not</strong> auto-attach the patient transcript — only what you paste above.
              </div>

              {error && (
                <div className="rx-safety-banner danger" style={{ marginTop: '10px' }}>
                  ⛔ {error}
                </div>
              )}

              <div className="btn-row" style={{ marginTop: '14px' }}>
                <button
                  className="btn btn-primary"
                  onClick={handleSubmit}
                  disabled={!valid || submitting}
                >
                  {submitting ? 'Submitting…' : 'Submit Concern'}
                </button>
                <button className="btn btn-secondary" onClick={handleClose} disabled={submitting}>
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const ConcernReportButton = ({ orgId, consultationId, context }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Report something the AI got wrong"
        style={{
          position: 'fixed', bottom: '20px', right: '20px',
          padding: '10px 16px', fontSize: '12.5px', fontWeight: 600,
          background: 'var(--surface)', color: 'var(--ink)',
          border: '1.5px solid var(--warn)', borderRadius: '999px',
          boxShadow: '0 4px 14px rgba(0,0,0,.12)',
          cursor: 'pointer', zIndex: 50,
        }}
      >
        🚩 Report concern
      </button>
      <ConcernModal
        open={open}
        orgId={orgId}
        consultationId={consultationId}
        context={context}
        onClose={() => setOpen(false)}
      />
    </>
  );
};

export default ConcernReportButton;
