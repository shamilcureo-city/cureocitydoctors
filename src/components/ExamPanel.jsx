import { useState } from 'react';

function CommitInput({ value, onCommit, ...rest }) {
  const [local, setLocal] = useState(value ?? '');
  const [lastSeen, setLastSeen] = useState(value);
  if (value !== lastSeen) {
    setLastSeen(value);
    setLocal(value ?? '');
  }
  return (
    <input
      {...rest}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => onCommit(local)}
      onKeyDown={(e) => { if (e.key === 'Enter') onCommit(local); }}
    />
  );
}

function CommitTextarea({ value, onCommit, ...rest }) {
  const [local, setLocal] = useState(value ?? '');
  const [lastSeen, setLastSeen] = useState(value);
  if (value !== lastSeen) {
    setLastSeen(value);
    setLocal(value ?? '');
  }
  return (
    <textarea
      {...rest}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => onCommit(local)}
    />
  );
}

const ExamPanel = ({
  engineState, 
  onToggleExamFinding, 
  onFillExamVital, 
  onNext, 
  onPrev 
}) => {
  const [expandedSystems, setExpandedSystems] = useState({});

  const toggleSys = (sysId) => {
    setExpandedSystems(prev => ({
      ...prev,
      [sysId]: prev[sysId] !== undefined ? !prev[sysId] : false
    }));
  };

  const activeSysList = Object.keys(engineState.activeSystems || {});
  
  if (!activeSysList.length) {
    return (
      <div className="step-panel active">
        <div className="mod-header">
          <div className="mod-title">System-Based Examination</div>
          <div className="mod-desc">Enter examination findings for each active body system. Missing key findings are highlighted.</div>
        </div>
        <div id="exam-content">
          <div className="empty-state"><div className="empty-state-icon">🩺</div>Complete intake first to generate examination builder.</div>
        </div>
        <div className="btn-row" style={{ marginTop: '8px' }}>
          <button className="btn btn-secondary" onClick={onPrev}>← Back</button>
          <button className="btn btn-primary" onClick={onNext}>Continue to Medications →</button>
        </div>
      </div>
    );
  }

  const sectionOrder = [
    'inspection','palpation','percussion','auscultation','cranial_nerves',
    'motor','sensory','general','cognition','appearance','local_exam'
  ];
  const sectionLabels = {
    inspection:'👁 Inspection', palpation:'🤚 Palpation',
    percussion:'🎵 Percussion', auscultation:'🔊 Auscultation',
    cranial_nerves:'🧠 Cranial Nerves', motor:'💪 Motor System',
    sensory:'✋ Sensory', general:'📋 General',
    cognition:'🧩 Cognition', appearance:'👤 Appearance',
    local_exam:'📍 Local Examination',
  };

  return (
    <div className="step-panel active">
      <div className="mod-header">
        <div className="mod-title">System-Based Examination</div>
        <div className="mod-desc">Enter examination findings for each active body system. Missing key findings are highlighted.</div>
      </div>
      <div id="exam-content">
        {activeSysList.map(sysId => {
          const sys = engineState.systemsConfig?.[sysId];
          if (!sys) return null;
          
          const findings = sys.exam_findings || {};
          const activeFindingsForSys = engineState.activeExamFindings?.[sysId] || [];
          const vitalsFields = sys.vitals_fields || [];
          const sysVitals = engineState.examFindings?.[sysId] || {};
          
          const totalActive = activeFindingsForSys.length;
          const isExpanded = expandedSystems[sysId] !== false; // Default true

          return (
            <div key={sysId} className="exam-system" id={`exam-sys-${sysId}`}>
              <div className="exam-sys-head" onClick={() => toggleSys(sysId)}>
                <div className="exam-sys-title">
                  <span style={{ color: sys.color, fontSize: '13px' }}>●</span>
                  {sys.name} — Examination
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className={`badge ${totalActive > 0 ? 'badge-ok' : 'badge-gray'}`}>
                    {totalActive} finding{totalActive !== 1 ? 's' : ''}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--ink4)', transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s' }}>▼</span>
                </div>
              </div>
              
              {isExpanded && (
                <div className="exam-sys-body">
                  {totalActive > 0 && (
                    <div style={{
                      display:'flex', flexWrap:'wrap', gap:'4px', marginBottom:'10px', padding:'8px 10px',
                      background:sys.bg, borderRadius:'var(--r)', border:`1.5px solid ${sys.color}33`
                    }}>
                      <span style={{
                        fontSize:'9px', fontWeight:700, color:sys.color, textTransform:'uppercase',
                        letterSpacing:'.5px', width:'100%', marginBottom:'3px'
                      }}>Active Findings ({totalActive})</span>
                      {activeFindingsForSys.map(t => {
                        const f = Object.values(findings).flat().find(x => x.term === t);
                        return (
                          <span 
                            key={t}
                            style={{
                              background:sys.color, color:'#fff', borderRadius:'12px', padding:'2px 8px',
                              fontSize:'11px', cursor:'pointer'
                            }} 
                            onClick={() => onToggleExamFinding(sysId, t)}
                          >
                            ✓ {f?.label || t} ×
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {vitalsFields.length > 0 && (
                    <div style={{ marginBottom: '12px' }}>
                      <div style={{ fontSize: '9.5px', fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.8px', marginBottom: '6px' }}>🩺 Vitals</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '6px' }}>
                        {vitalsFields.map(f => {
                          const key = sysId + '_vital_' + f.replace(/[^a-z0-9]/gi,'_').toLowerCase();
                          const val = sysVitals[key] || '';
                          return (
                            <div key={key} style={{ background: 'var(--surface2)', border: '1.5px solid var(--border)', borderRadius: 'var(--r)', padding: '6px 9px' }}>
                              <div style={{ fontSize: '9px', fontWeight: 600, color: 'var(--ink3)', textTransform: 'uppercase', marginBottom: '3px' }}>{f}</div>
                              <CommitInput
                                type="text"
                                value={val}
                                placeholder="—"
                                style={{ width: '100%', border: 'none', background: 'transparent', fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--ink)', outline: 'none' }}
                                onCommit={(next) => onFillExamVital(sysId, key, next)}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {sectionOrder.map(sec => {
                    const items = findings[sec];
                    if (!items || !items.length) return null;
                    const isLocalExam = sec === 'local_exam';
                    const label = sectionLabels[sec] || sec;
                    
                    return (
                      <div key={sec} style={{ marginBottom: '12px' }}>
                        <div style={{
                          fontSize: '9.5px', fontWeight: 700, color: isLocalExam ? sys.color : 'var(--ink3)',
                          textTransform: 'uppercase', letterSpacing: '.8px', marginBottom: '6px',
                          ...(isLocalExam ? { background: sys.bg, padding: '4px 10px', borderRadius: '4px', display: 'inline-block' } : {})
                        }}>
                          {label}{isLocalExam ? ' — click to record specific tests' : ''}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                          {items.map(f => {
                            const isOn = activeFindingsForSys.includes(f.term);
                            const btnStyle = isOn
                              ? { borderColor: sys.color, background: sys.bg, color: sys.color, fontWeight: 700 }
                              : { borderColor: 'var(--border2)', background: 'var(--surface)', color: 'var(--ink3)' };
                            
                            return (
                              <button
                                key={f.term}
                                onClick={() => onToggleExamFinding(sysId, f.term)}
                                style={{
                                  padding: '5px 11px', borderRadius: '20px', fontSize: '11px', border: '1.5px solid',
                                  cursor: 'pointer', transition: 'all .12s', whiteSpace: 'nowrap',
                                  ...btnStyle
                                }}
                                title={f.kbe}
                              >
                                {isOn ? '✓ ' : ''}{f.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}

                  <div style={{ marginTop: '10px' }}>
                    <div style={{ fontSize: '9.5px', fontWeight: 700, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '.8px', marginBottom: '5px' }}>📝 Additional Notes</div>
                    <CommitTextarea
                      style={{
                        width: '100%', minHeight: '50px', padding: '8px 10px', border: '1.5px solid var(--border)',
                        borderRadius: 'var(--r)', fontFamily: 'var(--font-sans)', fontSize: '12px', resize: 'vertical', outline: 'none'
                      }}
                      placeholder="Any other findings not listed above…"
                      value={sysVitals[sysId + '_free_notes'] || ''}
                      onCommit={(next) => onFillExamVital(sysId, sysId + '_free_notes', next)}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className="btn-row" style={{ marginTop: '8px' }}>
        <button className="btn btn-secondary" onClick={onPrev}>← Back</button>
        <button className="btn btn-primary" onClick={onNext}>Continue to Medications →</button>
      </div>
    </div>
  );
};

export default ExamPanel;
