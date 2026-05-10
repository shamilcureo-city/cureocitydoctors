import { useMemo, useState } from 'react';
import { CALCULATORS } from '../engine/index.js';

const CalcCard = ({ calc, isRelevant, autofill, computeScore, expandedDefault, patient }) => {
  const [vals, setVals] = useState(() => ({ ...autofill }));
  const [open, setOpen] = useState(expandedDefault);

  const score = computeScore(calc, vals);
  const result = score !== null && score !== undefined ? calc.interpret(score, patient || {}) : null;
  const special = (calc.special_check && result) ? calc.special_check(vals) : null;

  const setField = (id, v) => setVals(prev => ({ ...prev, [id]: v }));
  const toggleField = (id) => setVals(prev => ({ ...prev, [id]: prev[id] ? 0 : 1 }));

  const checkFields = calc.fields.filter(f => f.type === 'check');
  const inputFields = calc.fields.filter(f => f.type !== 'check');
  const inputCols   = Math.min(Math.max(inputFields.length, 1), 3);

  const sevToBadge = (lvl) => lvl === 'low' ? 'badge-ok' : lvl === 'moderate' ? 'badge-warn' : 'badge-danger';

  return (
    <div className="calc-card">
      <div className="calc-head" onClick={() => setOpen(o => !o)}>
        <div className="calc-title">
          <span style={{ color: isRelevant ? 'var(--accent)' : 'var(--border2)' }}>{isRelevant ? '●' : '○'}</span>
          {calc.name}
          {isRelevant && <span className="badge badge-ok" style={{ fontSize: '8px' }}>Relevant</span>}
          {result && <span className={`badge ${sevToBadge(result.level)}`} style={{ marginLeft: '4px' }}>{score}</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="calc-source">{calc.source}</span>
          <span style={{ fontSize: '11px', color: 'var(--ink4)' }}>{open ? '▲' : '▼'}</span>
        </div>
      </div>

      {open && (
        <div className="calc-body">
          {inputFields.length > 0 && (
            <div className="calc-grid" style={{ gridTemplateColumns: `repeat(${inputCols}, 1fr)` }}>
              {inputFields.map(f => {
                const val = vals[f.id] ?? '';
                if (f.type === 'number') {
                  return (
                    <div key={f.id} className="calc-field">
                      <label>{f.label}</label>
                      <input
                        className="calc-input"
                        type="number"
                        min={f.min ?? 0}
                        max={f.max ?? 999}
                        placeholder={f.placeholder || ''}
                        value={val}
                        onChange={e => setField(f.id, e.target.value)}
                      />
                    </div>
                  );
                }
                if (f.type === 'select') {
                  return (
                    <div key={f.id} className="calc-field">
                      <label>{f.label}</label>
                      <select
                        className="calc-select"
                        value={parseInt(val) || 0}
                        onChange={e => setField(f.id, parseInt(e.target.value))}
                      >
                        {(f.options || []).map((opt, oi) => (
                          <option key={`${f.id}-${oi}`} value={oi}>{opt}</option>
                        ))}
                      </select>
                    </div>
                  );
                }
                return null;
              })}
            </div>
          )}

          {checkFields.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '12px' }}>
              {checkFields.map(f => {
                const checked = vals[f.id] == 1 || vals[f.id] === true;
                return (
                  <div
                    key={f.id}
                    className={`calc-checkbox-row${checked ? ' checked' : ''}`}
                    onClick={() => toggleField(f.id)}
                  >
                    <div className="calc-checkbox">{checked ? '✓' : ''}</div>
                    <span>{f.label}</span>
                    <span className="calc-points">+{f.points || 1}</span>
                  </div>
                );
              })}
            </div>
          )}

          {result && (
            <div className={`calc-result ${result.level}`}>
              <div className="calc-score-num">{score}</div>
              <div className="calc-result-label">{result.label}</div>
              <div className="calc-result-detail">{result.detail}</div>
              <div className="calc-action">{result.action}</div>
            </div>
          )}

          {special && (
            <div className={`process-banner ${special.type}`} style={{ marginTop: '10px' }}>
              {special.msg}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const CalculatorsPanel = ({ patient, getActiveConditionIds, computeCalcScore, getCalcAutofill }) => {
  const activeIds = useMemo(() => getActiveConditionIds(), [getActiveConditionIds]);

  const ordered = useMemo(() => {
    const relevant = CALCULATORS.filter(c => c.relevant_conds?.some(rc => activeIds.has(rc)));
    const others   = CALCULATORS.filter(c => !c.relevant_conds?.some(rc => activeIds.has(rc)));
    return { relevant, ordered: [...relevant, ...others] };
  }, [activeIds]);

  return (
    <div>
      {ordered.relevant.length === 0 && (
        <div style={{ fontSize: '11.5px', color: 'var(--ink4)', marginBottom: '10px' }}>
          No calculators flagged as relevant for the current differential. All {CALCULATORS.length} are listed below.
        </div>
      )}
      {ordered.ordered.map(calc => {
        const isRelevant = ordered.relevant.includes(calc);
        return (
          <CalcCard
            key={calc.id}
            calc={calc}
            isRelevant={isRelevant}
            autofill={getCalcAutofill(calc)}
            computeScore={computeCalcScore}
            expandedDefault={isRelevant}
            patient={patient}
          />
        );
      })}
    </div>
  );
};

export default CalculatorsPanel;
