import { useRef, useState } from 'react';
import { streamReasoning } from '../lib/aiClient';

// Build a Markdown case summary the model can chew on. Pulls from engineState
// (already mirrored from the engine) and the top KB protocols (referral notes,
// monitoring tables stripped to the essentials).
function buildCaseSummary(engineState, topKBs) {
  const pt = engineState?.patient || {};
  const lines = [];

  lines.push('### Patient');
  lines.push(`- Demographics: ${pt.age || '?'}y ${pt.gender === 'F' ? 'Female' : pt.gender === 'M' ? 'Male' : (pt.gender || 'unknown')}`);
  if (pt.comorbid) lines.push(`- Comorbidities: ${pt.comorbid}`);
  if (engineState.rawInput) lines.push(`- Chief complaint (verbatim): ${engineState.rawInput.slice(0, 600)}`);

  const filledGaps = (engineState.missingData || []).filter(g => g.value);
  if (filledGaps.length) {
    lines.push('\n### History');
    filledGaps.forEach(g => lines.push(`- ${g.label}: ${g.value}`));
  }

  const examEntries = Object.entries(engineState.examFindings || {}).flatMap(([sysId, f]) =>
    Object.entries(f || {}).filter(([, v]) => v).map(([k, v]) => `${sysId.toUpperCase()} ${String(k).replace(/_/g, ' ')}: ${v}`)
  );
  if (examEntries.length) {
    lines.push('\n### Examination');
    examEntries.forEach(e => lines.push(`- ${e}`));
  }

  const labs = Object.entries(engineState.labs || {}).filter(([, v]) => v);
  if (labs.length) {
    lines.push('\n### Investigations (already done)');
    labs.forEach(([k, v]) => lines.push(`- ${k}: ${v}`));
  }

  const t3 = engineState.differentials?.t3 || [];
  const t1 = engineState.differentials?.t1 || [];
  const t2 = engineState.differentials?.t2 || [];
  if (t3.length || t1.length || t2.length) {
    lines.push('\n### Engine Differential (KBE)');
    if (t3.length) lines.push(`- Must not miss (T3): ${t3.map(c => c.name || c.id).join(', ')}`);
    if (t1.length) lines.push(`- Most likely (T1): ${t1.map(c => `${c.name || c.id}${c.likelihood_pct ? ' (' + c.likelihood_pct + '%)' : ''}`).join(', ')}`);
    if (t2.length) lines.push(`- Less likely (T2): ${t2.map(c => c.name || c.id).join(', ')}`);
  }

  const rfs = engineState.redFlags || [];
  if (rfs.length) {
    lines.push('\n### Red Flags Detected');
    rfs.forEach(rf => lines.push(`- ${rf.msg}`));
  }

  if (engineState.certainty) {
    lines.push(`\n### Diagnostic Certainty\n- ${engineState.certainty}%${engineState.certaintyNote ? ' — ' + engineState.certaintyNote : ''}`);
  }

  // KB excerpts to ground the reasoning. Per condition: name + 1st-line treatment + India context.
  const citations = (topKBs || []).map(({ kb, condName }) => {
    const kbBits = [];
    kbBits.push(`Name: ${kb.name}${kb.icd10 ? ' (' + kb.icd10 + ')' : ''}`);
    if (kb.gl_sources?.length) kbBits.push(`Sources: ${kb.gl_sources.map(s => `${s.name} L${s.level}`).join(', ')}`);
    if (kb.red_flags?.length) kbBits.push(`Red flags: ${kb.red_flags.slice(0, 4).join('; ')}`);
    if (kb.dx_criteria) kbBits.push(`Diagnostic criteria (${kb.dx_criteria.name}): ${(kb.dx_criteria.criteria || []).slice(0, 4).join('; ')}`);
    if (kb.treatment) {
      const firstLine = Object.values(kb.treatment)[0];
      if (firstLine) {
        const drugs = (firstLine.drugs || []).slice(0, 3).map(d => `${d.generic} ${d.dose || ''} ${d.freq || ''}`.trim()).join('; ');
        kbBits.push(`First-line: ${firstLine.label} — ${drugs}`);
      }
    }
    if (kb.india_context) {
      const ctxKeys = Object.keys(kb.india_context).slice(0, 2);
      kbBits.push(`India context: ${ctxKeys.map(k => `${k}: ${kb.india_context[k]}`).join(' | ')}`);
    }
    return { condName: condName || kb.name, excerpt: kbBits.join('\n') };
  });

  return { caseSummary: lines.join('\n'), citations };
}

// Bare-bones Markdown headings + paragraphs renderer. We only ask Claude for
// `### Headers`, `**bold**`, plain bullets — full markdown isn't needed.
function renderMarkdown(text) {
  if (!text) return null;
  const blocks = text.split(/\n{2,}/);
  return blocks.map((block, bi) => {
    if (block.startsWith('### ')) {
      return (
        <h4 key={bi} style={{ fontSize: '13px', fontWeight: 700, color: 'var(--accent)', marginTop: bi === 0 ? 0 : '14px', marginBottom: '6px' }}>
          {block.slice(4)}
        </h4>
      );
    }
    if (block.startsWith('## ')) {
      return (
        <h3 key={bi} style={{ fontSize: '14px', fontWeight: 700, color: 'var(--ink)', marginTop: '16px', marginBottom: '8px' }}>
          {block.slice(3)}
        </h3>
      );
    }
    const lines = block.split('\n');
    if (lines.every(l => l.trim().startsWith('- ') || l.trim().startsWith('* '))) {
      return (
        <ul key={bi} style={{ margin: '6px 0 10px', paddingLeft: '20px', fontSize: '12.5px', lineHeight: 1.7, color: 'var(--ink2)' }}>
          {lines.map((l, i) => <li key={i}>{renderInline(l.trim().replace(/^[-*]\s+/, ''))}</li>)}
        </ul>
      );
    }
    return (
      <p key={bi} style={{ margin: '6px 0 10px', fontSize: '12.5px', lineHeight: 1.7, color: 'var(--ink2)', whiteSpace: 'pre-wrap' }}>
        {renderInline(block)}
      </p>
    );
  });
}

function renderInline(text) {
  // Just bold for now — the prompt asks for `### headers` and bullets, no other markup.
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**')
      ? <strong key={i}>{p.slice(2, -2)}</strong>
      : <span key={i}>{p}</span>
  );
}

const STATUS = { IDLE: 'idle', RUNNING: 'running', DONE: 'done', ERROR: 'error' };

const AIReasoningTab = ({ engineState, getTopKBProtocols }) => {
  const [text, setText] = useState('');
  const [status, setStatus] = useState(STATUS.IDLE);
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState('');
  const abortRef = useRef(null);

  const canRun = !!engineState?.rawInput && (engineState.scored?.length > 0 || (engineState.differentials?.t1?.length || 0) > 0);

  const run = async () => {
    setError('');
    setText('');
    setMeta(null);
    setStatus(STATUS.RUNNING);
    const topKBs = getTopKBProtocols ? getTopKBProtocols() : [];
    const { caseSummary, citations } = buildCaseSummary(engineState, topKBs);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const finalMeta = await streamReasoning({
        caseSummary,
        citations,
        signal: ac.signal,
        onDelta: (chunk) => setText(prev => prev + chunk),
      });
      setMeta(finalMeta);
      setStatus(STATUS.DONE);
    } catch (e) {
      if (e?.name === 'AbortError') {
        setStatus(STATUS.IDLE);
        return;
      }
      setError(e?.message || 'Reasoning failed');
      setStatus(STATUS.ERROR);
    } finally {
      abortRef.current = null;
    }
  };

  const cancel = () => {
    abortRef.current?.abort();
  };

  return (
    <div>
      <div className="card" style={{ borderColor: 'var(--accent)', marginBottom: '14px' }}>
        <div className="card-head" style={{ background: 'linear-gradient(135deg, var(--en-t), var(--surface2))' }}>
          <div className="card-title">
            🤖 AI Clinical Reasoning Engine
            <span className="badge badge-ok" style={{ marginLeft: '8px' }}>Claude Opus 4.7</span>
            <span className="badge badge-info" style={{ marginLeft: '4px' }}>KB-Guided</span>
          </div>
          <div className="card-sub">Second-opinion narrative reasoning grounded in the engine's KB excerpts.</div>
        </div>
        <div className="card-body">
          <div style={{ fontSize: '12px', color: 'var(--ink2)', lineHeight: 1.6, marginBottom: '12px' }}>
            Sends a structured case summary + KB excerpts to Claude for clinical reasoning. The model is instructed to <strong>cite only from the supplied KB</strong> and not invent diagnoses outside the engine's differential.
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
            {status !== STATUS.RUNNING ? (
              <button className="btn btn-primary" onClick={run} disabled={!canRun}>
                ⚡ Run AI Reasoning Engine
              </button>
            ) : (
              <button className="btn btn-secondary" onClick={cancel}>
                ⏸ Cancel
              </button>
            )}
            {!canRun && (
              <span style={{ fontSize: '11px', color: 'var(--ink4)' }}>
                Complete at least Steps 1–2 (intake + symptoms) first.
              </span>
            )}
            {status === STATUS.RUNNING && (
              <span style={{ fontSize: '11px', color: 'var(--accent)' }}>
                Streaming{text ? ` · ${text.length} chars` : '…'}
              </span>
            )}
            {status === STATUS.DONE && meta && (
              <span style={{ fontSize: '10.5px', color: 'var(--ink4)', fontFamily: 'var(--font-mono)' }}>
                {meta.model} · {meta.tokensIn}↓ {meta.tokensOut}↑ tok · ₹{meta.costInr?.toFixed(2) || '?'} · {(meta.latencyMs / 1000).toFixed(1)}s
              </span>
            )}
          </div>

          {error && (
            <div className="process-banner danger" style={{ marginTop: '10px' }}>
              {error}
            </div>
          )}
        </div>
      </div>

      {status === STATUS.IDLE && !text && (
        <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--ink4)' }}>
          <div style={{ fontSize: '36px', marginBottom: '10px', opacity: .3 }}>🧠</div>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink2)', marginBottom: '6px' }}>AI Reasoning Engine Ready</div>
          <div style={{ fontSize: '12px' }}>Click <strong>Run AI Reasoning Engine</strong> above to stream a second-opinion reasoning pass.</div>
        </div>
      )}

      {(text || status === STATUS.RUNNING) && (
        <div className="card">
          <div className="card-head"><div className="card-title">🧠 Reasoning Output</div></div>
          <div className="card-body" style={{ minHeight: '120px' }}>
            {renderMarkdown(text)}
            {status === STATUS.RUNNING && (
              <span style={{ display: 'inline-block', width: '8px', height: '14px', background: 'var(--accent)', verticalAlign: 'middle', marginLeft: '2px', animation: 'blink 1s steps(2) infinite' }} />
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AIReasoningTab;
