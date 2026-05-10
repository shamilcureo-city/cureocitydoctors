import { useEffect, useState } from 'react';

const FIELDS = [
  { key: 'intake',     label: 'Presenting Complaint Summary',
    placeholder: "Chief complaint narrative in the doctor's own words…", rows: 3 },
  { key: 'history',    label: 'History & Examination Summary',
    placeholder: 'Relevant positive and negative findings…', rows: 4 },
  { key: 'impression', label: 'Clinical Impression & Plan',
    placeholder: 'Working diagnosis, investigations ordered, treatment plan, follow-up instructions…', rows: 4 },
];

// Mount/unmount pattern — parent passes `open`, we render the inner modal
// (which has its own draft state) only while open. Each open starts fresh
// from the saved notes; avoids the sync-state-in-effect antipattern.
const NotesModal = ({ open, notes, onSave, onClose }) => {
  if (!open) return null;
  return <NotesModalInner notes={notes} onSave={onSave} onClose={onClose} />;
};

const NotesModalInner = ({ notes, onSave, onClose }) => {
  const [draft, setDraft] = useState(notes || {});

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const setField = (key, val) => setDraft((d) => ({ ...d, [key]: val }));

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 500,
        background: 'rgba(17,24,39,.55)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '40px 20px', overflowY: 'auto',
      }}
    >
      <div style={{
        background: 'var(--surface)', borderRadius: 'var(--r-lg)',
        maxWidth: '600px', width: '100%',
        boxShadow: 'var(--shadow-lg)',
        border: '1px solid var(--border)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px', borderBottom: '1px solid var(--border)',
          background: 'var(--surface2)',
          borderRadius: 'var(--r-lg) var(--r-lg) 0 0',
        }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--ink)' }}>📝 Clinical Notes</div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: 'var(--ink3)', padding: '0 6px' }}
            aria-label="Close"
          >×</button>
        </div>
        <div style={{ padding: '20px', maxHeight: '70vh', overflowY: 'auto' }}>
          {FIELDS.map((f) => (
            <div className="field" key={f.key}>
              <div className="field-label"><label>{f.label}</label></div>
              <textarea
                rows={f.rows}
                placeholder={f.placeholder}
                value={draft[f.key] || ''}
                onChange={(e) => setField(f.key, e.target.value)}
              />
            </div>
          ))}
          <div className="btn-row">
            <button className="btn btn-primary" onClick={() => { onSave(draft); onClose(); }}>
              💾 Save Notes
            </button>
            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotesModal;
