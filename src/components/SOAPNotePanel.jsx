import { useState } from 'react';

// Mount/unmount pattern: SOAPNotePanel (outer) computes the source SOAP from
// engine state on mount. SOAPNotePanelInner owns the editable textarea state
// — remounting via `key` resets if the user wants a fresh regenerate.
const SOAPNotePanelInner = ({ source }) => {
  const [s, setS] = useState(source.subjective);
  const [o, setO] = useState(source.objective);
  const [a, setA] = useState(source.assessment);
  const [p, setP] = useState(source.plan);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const out = `=== S: Subjective ===\n${s}\n\n=== O: Objective ===\n${o}\n\n=== A: Assessment ===\n${a}\n\n=== P: Plan ===\n${p}`;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(out).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      });
    }
  };

  return (
    <div>
      <div className="soap-section soap-s">
        <div className="soap-section-head">
          <div className="soap-letter">S</div>
          <div className="soap-section-title">Subjective — Chief Complaint &amp; History</div>
        </div>
        <textarea className="soap-editable" rows={6} value={s} onChange={e => setS(e.target.value)} />
      </div>
      <div className="soap-section soap-o" style={{ marginTop: '14px' }}>
        <div className="soap-section-head">
          <div className="soap-letter">O</div>
          <div className="soap-section-title">Objective — Examination &amp; Investigations</div>
        </div>
        <textarea className="soap-editable" rows={6} value={o} onChange={e => setO(e.target.value)} />
      </div>
      <div className="soap-section soap-a" style={{ marginTop: '14px' }}>
        <div className="soap-section-head">
          <div className="soap-letter">A</div>
          <div className="soap-section-title">Assessment — Diagnosis &amp; Reasoning</div>
        </div>
        <textarea className="soap-editable" rows={6} value={a} onChange={e => setA(e.target.value)} />
      </div>
      <div className="soap-section soap-p" style={{ marginTop: '14px' }}>
        <div className="soap-section-head">
          <div className="soap-letter">P</div>
          <div className="soap-section-title">Plan — Investigations, Treatment &amp; Follow-up</div>
        </div>
        <textarea className="soap-editable" rows={7} value={p} onChange={e => setP(e.target.value)} />
      </div>
      <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--border)', fontSize: '11px', color: 'var(--ink4)' }}>
        {source.meta}
      </div>
      <div className="btn-row" style={{ marginTop: '12px' }}>
        <button className="btn btn-primary btn-sm" onClick={handleCopy}>
          {copied ? '✓ Copied' : '📋 Copy SOAP Note'}
        </button>
        <button className="btn btn-secondary btn-sm" onClick={() => window.print()}>🖨️ Print</button>
      </div>
    </div>
  );
};

const SOAPNotePanel = ({ buildSOAPText }) => {
  const [version, setVersion] = useState(0);
  // Re-derive on every render (cheap — pure string concatenation).
  // `version` bump remounts the inner component, which discards edits.
  const source = buildSOAPText();

  if (source.empty) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">📋</div>
        Run intake analysis first to auto-generate SOAP note.
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => setVersion(v => v + 1)}
          title="Discard edits and regenerate from current case data"
        >
          ↻ Regenerate
        </button>
      </div>
      <SOAPNotePanelInner key={version} source={source} />
    </div>
  );
};

export default SOAPNotePanel;
