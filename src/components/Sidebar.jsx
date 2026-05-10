import { useMemo, useState } from 'react';

const sysEmoji = (systems) => {
  const map = { cv: '❤️', rs: '🫁', en: '⚗️', nr: '🧠', gi: '🫄', hm: '🩸', ms: '🦴', ps: '🧠' };
  return (systems || []).map(s => map[s] || '💊').join('');
};

const Sidebar = ({ steps, onStepClick, searchKB, getAllKB, onOpenKB }) => {
  const [query, setQuery] = useState('');
  const [browseQuery, setBrowseQuery] = useState('');
  const [showBrowser, setShowBrowser] = useState(false);

  const results = useMemo(() => {
    if (!searchKB) return [];
    return query.length >= 2 ? searchKB(query) : [];
  }, [query, searchKB]);

  const allKB = useMemo(() => (getAllKB ? getAllKB() : []), [getAllKB]);
  const filteredAll = useMemo(() => {
    const q = browseQuery.trim().toLowerCase();
    if (!q) return allKB;
    return allKB.filter(kb =>
      (kb.name || '').toLowerCase().includes(q) ||
      (kb.key_symptoms || []).some(s => String(s).toLowerCase().includes(q)) ||
      (kb.icd10 || '').toLowerCase().includes(q)
    );
  }, [allKB, browseQuery]);

  const handlePick = (kb) => {
    setQuery('');
    setShowBrowser(false);
    onOpenKB?.(kb);
  };

  return (
    <nav className="step-nav">
      <div className="step-nav-title">Workflow</div>

      {steps.map((step) => (
        <div
          key={step.id}
          className={`step-item ${step.active ? 'active' : ''} ${step.locked ? 'locked' : ''}`}
          onClick={() => onStepClick(step.id)}
          style={{ cursor: step.locked ? 'not-allowed' : 'pointer' }}
        >
          <div className="step-num">{step.id}</div>
          <div>
            <div className="step-label">{step.label}</div>
            <div className="step-sublabel">{step.sublabel}</div>
          </div>
        </div>
      ))}

      {searchKB && (
        <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: '9.5px', fontWeight: 700, color: 'var(--ink4)', textTransform: 'uppercase', letterSpacing: '.8px', marginBottom: '6px' }}>
            Knowledge Base
          </div>
          <input
            type="text"
            className="kb-search-input"
            placeholder="Search conditions, ICD…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          {results.length > 0 && (
            <div style={{ marginTop: '6px', maxHeight: '240px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--r)', background: 'var(--surface)' }}>
              {results.map(kb => (
                <div key={kb.id} className="kb-search-result" onClick={() => handlePick(kb)}>
                  <span style={{ fontSize: '13px' }}>{sysEmoji(kb.systems)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{kb.name}</div>
                    <div style={{ fontSize: '10px', color: 'var(--ink4)' }}>
                      {kb.icd10 || '—'} · {(kb.gl_sources || []).slice(0, 1).map(s => s.name).join('')}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <button
            className="btn btn-xs btn-secondary"
            style={{ width: '100%', marginTop: '8px', justifyContent: 'center' }}
            onClick={() => setShowBrowser(b => !b)}
          >
            {showBrowser ? '↑ Hide All' : `📚 Browse all (${allKB.length})`}
          </button>

          {showBrowser && (
            <div style={{ marginTop: '8px' }}>
              <input
                type="text"
                className="kb-search-input"
                placeholder="Filter…"
                value={browseQuery}
                onChange={e => setBrowseQuery(e.target.value)}
                style={{ marginBottom: '6px' }}
              />
              <div style={{ maxHeight: '320px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--r)', background: 'var(--surface)' }}>
                {filteredAll.length === 0 ? (
                  <div style={{ padding: '12px', fontSize: '11px', color: 'var(--ink4)', textAlign: 'center' }}>
                    No conditions match.
                  </div>
                ) : (
                  filteredAll.map(kb => (
                    <div key={kb.id} className="kb-search-result" onClick={() => handlePick(kb)}>
                      <span style={{ fontSize: '13px' }}>{sysEmoji(kb.systems)}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{kb.name}</div>
                        <div style={{ fontSize: '10px', color: 'var(--ink4)' }}>{kb.icd10 || '—'}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </nav>
  );
};

export default Sidebar;
