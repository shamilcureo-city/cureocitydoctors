import { useMemo, useState } from 'react';
import { ICD10_DB } from '../engine/cureocityEngine';

const ICDRow = ({ entry, isSelected, onToggle }) => (
  <div className={`icd-result${isSelected ? ' selected' : ''}`} onClick={() => onToggle(entry.code)}>
    <div className="icd-code">{entry.code}</div>
    <div className="icd-desc">{entry.desc}</div>
    <div className="icd-chapter">{entry.chapter}</div>
    <span style={{ fontSize: '16px', color: isSelected ? 'var(--ok)' : 'var(--border2)' }}>
      {isSelected ? '✓' : '+'}
    </span>
  </div>
);

const ICDPanel = ({ getSuggestedICD }) => {
  const [selected, setSelected] = useState(() => new Set());
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState(false);

  const suggested = useMemo(() => getSuggestedICD(), [getSuggestedICD]);

  const searchResults = useMemo(() => {
    if (!query || query.length < 2) return [];
    const q = query.toLowerCase();
    return ICD10_DB.filter(e =>
      e.code.toLowerCase().includes(q) ||
      e.desc.toLowerCase().includes(q) ||
      e.chapter.toLowerCase().includes(q)
    ).slice(0, 12);
  }, [query]);

  const toggle = (code) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const handleCopy = () => {
    const lines = [...selected].map(code => {
      const entry = ICD10_DB.find(e => e.code === code);
      return entry ? `${entry.code} — ${entry.desc}` : code;
    }).join('\n');
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(lines).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      });
    }
  };

  const selectedEntries = [...selected]
    .map(code => ICD10_DB.find(e => e.code === code))
    .filter(Boolean);

  return (
    <div>
      <div className="card" style={{ marginBottom: '14px' }}>
        <div className="card-head"><div className="card-title">🔎 ICD-10 Search</div></div>
        <div className="card-body">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Type a code (e.g. I21) or description (e.g. pneumonia)…"
            style={{
              width: '100%', padding: '10px 12px', border: '1.5px solid var(--border)',
              borderRadius: 'var(--r)', fontSize: '13px', outline: 'none',
              background: 'var(--surface2)',
            }}
          />
          {query.length >= 2 && (
            <div style={{ marginTop: '12px' }}>
              {searchResults.length > 0 ? (
                <>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--ink4)', textTransform: 'uppercase', letterSpacing: '.8px', marginBottom: '8px' }}>
                    Search Results ({searchResults.length})
                  </div>
                  {searchResults.map(e => (
                    <ICDRow key={e.code} entry={e} isSelected={selected.has(e.code)} onToggle={toggle} />
                  ))}
                </>
              ) : (
                <div style={{ color: 'var(--ink4)', fontSize: '12px', padding: '8px' }}>
                  No ICD-10 codes found matching your search.
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginBottom: '14px' }}>
        <div className="card-head"><div className="card-title">🎯 Suggested from Differential</div></div>
        <div className="card-body">
          {suggested.length > 0 ? (
            suggested.map(e => (
              <ICDRow key={e.code} entry={e} isSelected={selected.has(e.code)} onToggle={toggle} />
            ))
          ) : (
            <div style={{ color: 'var(--ink4)', fontSize: '12px' }}>
              Run analysis (Step 1) to get ICD-10 suggestions from the differential.
            </div>
          )}
        </div>
      </div>

      {selectedEntries.length > 0 && (
        <div className="card">
          <div className="card-head">
            <div className="card-title">📋 Selected Codes ({selectedEntries.length})</div>
          </div>
          <div className="card-body p0">
            {selectedEntries.map((entry, i) => (
              <div key={entry.code} className="icd-selected-item">
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--ink4)' }}>{i + 1}</span>
                <span className="icd-code">{entry.code}</span>
                <span style={{ fontSize: '12.5px', flex: 1, color: 'var(--ink2)' }}>{entry.desc}</span>
                <span style={{ fontSize: '10.5px', color: 'var(--ink4)', fontFamily: 'var(--font-mono)' }}>{entry.chapter}</span>
                <button className="btn btn-xs btn-secondary" onClick={() => toggle(entry.code)} style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}>✕</button>
              </div>
            ))}
          </div>
          <div className="btn-row" style={{ padding: '10px 14px' }}>
            <button className="btn btn-primary btn-sm" onClick={handleCopy}>
              {copied ? '✓ Copied' : '📋 Copy Codes'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ICDPanel;
