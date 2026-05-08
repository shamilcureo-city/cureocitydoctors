const LivePanel = ({ isProcessing, engineState }) => {
  const allDiffs = [
    ...(engineState?.differentials?.t3 || []).map(d => ({ ...d, tier: 't3', color: 'var(--danger)' })),
    ...(engineState?.differentials?.t1 || []).map(d => ({ ...d, tier: 't1', color: 'var(--ok)' })),
    ...(engineState?.differentials?.t2 || []).map(d => ({ ...d, tier: 't2', color: 'var(--info)' }))
  ];

  const maxScore = Math.max(...allDiffs.map(d => d.score || 0), 1);

  return (
    <aside className="live-panel">
      {isProcessing && (
        <div className="process-banner info">
          <span>🧠 Analyzing clinical data...</span>
        </div>
      )}

      {engineState?.redFlags?.length > 0 && (
        <div className="process-banner danger" style={{ marginTop: isProcessing ? '10px' : '0' }}>
          <span>⚑ {engineState.redFlags.length} Red Flag(s) Detected</span>
        </div>
      )}

      <div className="live-section">
        <div className="live-section-title">Live Risk Factors</div>
        <div>
          {engineState?.redFlags?.length > 0 ? (
            engineState.redFlags.map((rf, i) => (
              <div key={rf.msg || rf.cond || `rf-${i}`} className="live-rf">
                <span className="live-rf-icon">⚑</span>
                <span>{rf.msg}</span>
              </div>
            ))
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">🛡️</div>
              <div>Awaiting clinical data...</div>
            </div>
          )}
        </div>
      </div>

      <div className="live-section">
        <div className="live-section-title">Differential Dx</div>
        <div>
          {allDiffs.length > 0 ? (
            allDiffs.slice(0, 5).map((cond, i) => {
              const pct = Math.round(((cond.score || 0) / maxScore) * 100);
              return (
                <div key={cond.id || `${cond.tier}-${i}`} className="live-diff-row">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                    <div className="live-diff-name">{cond.name}</div>
                    <span className={`badge badge-${cond.tier === 't3' ? 'danger' : cond.tier === 't2' ? 'info' : 'ok'}`} style={{ fontSize: '7.5px' }}>
                      {cond.tier.toUpperCase()}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px' }}>
                    <div className="live-diff-bar" style={{ flex: 1 }}>
                      <div className="live-diff-fill" style={{ width: `${pct}%`, background: cond.color }}></div>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="empty-state" style={{ padding: '10px' }}>
              <div>No conditions flagged yet.</div>
            </div>
          )}
        </div>
      </div>

      <div className="live-section">
        <div className="live-section-title">Dx Certainty</div>
        <div className="certainty-display">
          <div className="certainty-bar">
            <div className="certainty-fill" style={{ 
              width: isProcessing ? '10%' : `${engineState?.certainty || 0}%`, 
              transition: 'width 1.5s ease',
              background: engineState?.certainty > 60 ? 'var(--ok)' : 'var(--warn)'
            }}></div>
          </div>
          <div className="certainty-pct">
            {isProcessing ? 'Processing...' : `${engineState?.certainty || 0}%`}
          </div>
        </div>
      </div>
      
    </aside>
  );
};

export default LivePanel;
