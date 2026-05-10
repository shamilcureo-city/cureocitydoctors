import {
  FOLLOW_UP_QUESTIONS_DB,
  KB_ID_MAP,
  LAB_DEFS,
  getLabStatus,
} from '../engine/cureocityEngine';

const SYS_NAME = {
  cv: 'Cardiovascular', rs: 'Respiratory', en: 'Endocrine', nr: 'Neurological',
  gi: 'Gastrointestinal', hm: 'Haematological', ms: 'Musculoskeletal',
  ps: 'Psychiatric', rn: 'Renal/Urinary',
};
const SYS_COLOR = {
  cv: 'var(--cv)', rs: 'var(--rs)', en: 'var(--en)', nr: 'var(--nr)',
  gi: 'var(--gi)', hm: 'var(--hm)', ms: 'var(--ms)', ps: 'var(--ps)',
  rn: 'var(--info)',
};

function getFollowUps(condId) {
  if (!condId) return [];
  const k = KB_ID_MAP[condId] || condId;
  return FOLLOW_UP_QUESTIONS_DB[k] || FOLLOW_UP_QUESTIONS_DB[condId] || [];
}

function deriveLabFlags(labs) {
  const allDefs = Object.values(LAB_DEFS).flat();
  const flags = [];
  for (const def of allDefs) {
    const v = labs[def.key];
    if (!v) continue;
    const status = getLabStatus(v, def);
    if (status !== 'normal') flags.push({ name: def.name, value: v, unit: def.unit, status });
  }
  return flags;
}

const LivePanel = ({ isProcessing, engineState, drugs, allergies }) => {
  const allDiffs = [
    ...(engineState?.differentials?.t3 || []).map((d) => ({ ...d, tier: 't3', color: 'var(--danger)' })),
    ...(engineState?.differentials?.t1 || []).map((d) => ({ ...d, tier: 't1', color: 'var(--ok)' })),
    ...(engineState?.differentials?.t2 || []).map((d) => ({ ...d, tier: 't2', color: 'var(--info)' })),
  ];
  const maxScore = Math.max(...allDiffs.map((d) => d.score || 0), 1);

  const activeSystems = engineState?.activeSystems || {};
  const sysList = Object.entries(activeSystems);

  const redFlags = engineState?.redFlags || [];
  const certainty = engineState?.certainty || 0;
  const certaintyNote = engineState?.certaintyNote || '';

  const nextSteps = engineState?.nextSteps || [];
  const urgent = nextSteps.find((s) => s.urgency === 'urgent');
  const firstNonUrgent = nextSteps.find((s) => s.urgency !== 'urgent');

  const interactions = engineState?.interactions || [];
  const highInteractions = interactions.filter((i) => i.sev === 'high');
  const modInteractions  = interactions.filter((i) => i.sev === 'moderate');

  const labFlags = deriveLabFlags(engineState?.labs || {});

  // Follow-up questions from top differential
  const topCond = allDiffs[0];
  const followUps = topCond ? getFollowUps(topCond.id).slice(0, 3) : [];

  // Data completeness
  const filledGaps = (engineState?.missingData || []).filter((g) => g.value).length;
  const totalGaps  = (engineState?.missingData || []).length;
  const examFilled = Object.values(engineState?.examFindings || {})
    .reduce((a, sys) => a + Object.values(sys || {}).filter((v) => v).length, 0);
  const drugCount  = (drugs || engineState?.drugs || []).length;
  const labCount   = Object.values(engineState?.labs || {}).filter((v) => v).length;
  const allergyCount = (allergies || []).length;

  return (
    <aside className="live-panel">
      {isProcessing && (
        <div className="process-banner info">
          <span>🧠 Analyzing clinical data…</span>
        </div>
      )}

      {redFlags.length > 0 && (
        <div className="process-banner danger" style={{ marginTop: isProcessing ? '10px' : '0' }}>
          <span>⚑ {redFlags.length} Red Flag(s) Detected</span>
        </div>
      )}

      {/* ── Confidence ─────────────────────────────────── */}
      <div className="live-section">
        <div className="live-section-title">Confidence</div>
        <div className="certainty-display">
          <div className="certainty-bar">
            <div
              className="certainty-fill"
              style={{
                width: isProcessing ? '10%' : `${certainty}%`,
                transition: 'width 1.5s ease',
                background: certainty > 60 ? 'var(--ok)' : certainty > 35 ? 'var(--warn)' : 'var(--danger)',
              }}
            />
          </div>
          <div className="certainty-pct">{isProcessing ? '…' : `${certainty}%`}</div>
        </div>
        {certaintyNote && (
          <div style={{ fontSize: '10.5px', color: 'var(--ink4)', marginTop: '4px', lineHeight: 1.4 }}>
            {certaintyNote}
          </div>
        )}
      </div>

      {/* ── Active Systems ─────────────────────────────── */}
      <div className="live-section">
        <div className="live-section-title">Active Systems</div>
        {sysList.length > 0 ? (
          sysList.map(([id, d]) => (
            <div key={id} style={{
              display: 'flex', alignItems: 'center', gap: '7px',
              padding: '4px 0', borderBottom: '1px solid var(--border)',
            }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%',
                background: SYS_COLOR[id] || 'var(--ink3)', flexShrink: 0,
              }} />
              <span style={{ fontSize: '12px', color: 'var(--ink2)' }}>{SYS_NAME[id] || id}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '9.5px', color: 'var(--ink4)', marginLeft: 'auto' }}>{d.score}</span>
            </div>
          ))
        ) : (
          <div style={{ color: 'var(--ink4)', fontSize: '11.5px' }}>None activated</div>
        )}
      </div>

      {/* ── Red Flags ──────────────────────────────────── */}
      <div className="live-section">
        <div className="live-section-title">⚑ Red Flags</div>
        {redFlags.length > 0 ? (
          redFlags.map((rf, i) => (
            <div key={rf.msg || rf.cond || `rf-${i}`} className="live-rf">
              <span className="live-rf-icon">⚑</span>
              <span>{rf.msg}</span>
            </div>
          ))
        ) : (
          <div style={{ color: 'var(--ok)', fontSize: '11.5px' }}>✓ No flags detected</div>
        )}
      </div>

      {/* ── Differential ───────────────────────────────── */}
      <div className="live-section">
        <div className="live-section-title">Top Differentials</div>
        {allDiffs.length > 0 ? (
          allDiffs.slice(0, 5).map((cond, i) => {
            const pct = Math.round(((cond.score || 0) / maxScore) * 100);
            return (
              <div key={cond.id || `${cond.tier}-${i}`} className="live-diff-row">
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                  <div className="live-diff-name">{cond.name}</div>
                  <span
                    className={`badge badge-${cond.tier === 't3' ? 'danger' : cond.tier === 't2' ? 'info' : 'ok'}`}
                    style={{ fontSize: '7.5px' }}
                  >{cond.tier.toUpperCase()}</span>
                  {cond.likelihood_pct != null && (
                    <span style={{ fontSize: '10px', color: 'var(--ink4)', marginLeft: 'auto' }}>
                      {cond.likelihood_pct}%
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px' }}>
                  <div className="live-diff-bar" style={{ flex: 1, height: 6 }}>
                    <div className="live-diff-fill" style={{ width: `${pct}%`, background: cond.color }} />
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div style={{ color: 'var(--ink4)', fontSize: '11.5px', padding: '6px 0' }}>Awaiting analysis</div>
        )}
      </div>

      {/* ── Immediate Action ───────────────────────────── */}
      {(urgent || firstNonUrgent) && (
        <div className="live-section">
          <div className="live-section-title">Immediate Action</div>
          {urgent ? (
            <div style={{
              background: 'var(--danger-t)',
              border: '1px solid rgba(192,57,43,.25)',
              borderRadius: 'var(--r)',
              padding: '9px 12px', fontSize: '12px', color: 'var(--danger)',
            }}>
              <span style={{ marginRight: 6 }}>{urgent.icon}</span>{urgent.action}
            </div>
          ) : (
            <div style={{ fontSize: '12px', color: 'var(--ink2)', padding: '6px 0' }}>
              <span style={{ marginRight: 6 }}>{firstNonUrgent.icon}</span>{firstNonUrgent.action}
            </div>
          )}
        </div>
      )}

      {/* ── Drug Alerts ────────────────────────────────── */}
      {(highInteractions.length + modInteractions.length) > 0 && (
        <div className="live-section">
          <div className="live-section-title">⚠ Drug Alerts</div>
          {highInteractions.slice(0, 3).map((i, idx) => (
            <div key={`hi-${idx}`} style={{
              fontSize: '11px', padding: '5px 0',
              borderBottom: '1px solid var(--border)',
              color: 'var(--danger)', display: 'flex', gap: 6,
            }}>
              <span>⛔</span>
              <span>{(i.matchedDrugs || i.drugs || []).join(' + ')}</span>
            </div>
          ))}
          {modInteractions.slice(0, 2).map((i, idx) => (
            <div key={`mi-${idx}`} style={{
              fontSize: '11px', padding: '5px 0',
              borderBottom: '1px solid var(--border)',
              color: 'var(--warn)', display: 'flex', gap: 6,
            }}>
              <span>⚠️</span>
              <span>{(i.matchedDrugs || i.drugs || []).join(' + ')}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Lab Flags ──────────────────────────────────── */}
      {labFlags.length > 0 && (
        <div className="live-section">
          <div className="live-section-title">Lab Flags</div>
          {labFlags.slice(0, 5).map((a, idx) => (
            <div
              key={`${a.name}-${idx}`}
              style={{
                display: 'flex', gap: 6, fontSize: '11px',
                padding: '4px 0', borderBottom: '1px solid var(--border)',
                color: a.status === 'critical' ? 'var(--danger)'
                  : a.status === 'abnormal-high' ? 'var(--warn)' : 'var(--info)',
              }}
            >
              <span>{a.status === 'critical' ? '🔴' : a.status === 'abnormal-high' ? '🟡' : '🔵'}</span>
              <span>{a.name}: <strong>{a.value} {a.unit}</strong></span>
            </div>
          ))}
        </div>
      )}

      {/* ── Follow-up Questions (KB-driven) ────────────── */}
      {followUps.length > 0 && (
        <div className="live-section">
          <div className="live-section-title">💬 Follow-up Questions</div>
          {followUps.map((q, i) => (
            <div key={i} style={{
              display: 'flex', gap: '6px', padding: '5px 0',
              borderBottom: '1px solid var(--border)',
              fontSize: '11.5px', color: 'var(--ink2)', lineHeight: 1.4,
            }}>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: '9px',
                color: 'var(--accent)', flexShrink: 0, paddingTop: 1,
              }}>Q{i + 1}</span>
              <span>{q}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Data Completeness ──────────────────────────── */}
      <div style={{
        marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid var(--border)',
      }}>
        <div style={{
          fontSize: '10px', color: 'var(--ink4)', marginBottom: '6px',
          textTransform: 'uppercase', letterSpacing: '.5px', fontWeight: 600,
        }}>
          Data Completeness
        </div>
        <div className="live-stat">
          <span className="live-stat-label">History</span>
          <span className="live-stat-val">{totalGaps ? `${filledGaps}/${totalGaps}` : '—'}</span>
        </div>
        <div className="live-stat">
          <span className="live-stat-label">Examination</span>
          <span className="live-stat-val">{examFilled || '—'}</span>
        </div>
        <div className="live-stat">
          <span className="live-stat-label">Medications</span>
          <span className="live-stat-val">{drugCount}</span>
        </div>
        <div className="live-stat">
          <span className="live-stat-label">Labs</span>
          <span className="live-stat-val">{labCount}</span>
        </div>
        <div className="live-stat">
          <span className="live-stat-label">Allergies</span>
          <span className="live-stat-val">{allergyCount}</span>
        </div>
      </div>
    </aside>
  );
};

export default LivePanel;
