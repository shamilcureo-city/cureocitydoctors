// LiveTranscriptSpike — throwaway component for Sprint 0/1 spike.
//
// Renders the streaming transcript and any agent events to validate the
// end-to-end pipeline before building the full ConsultSurface (Sprint 5).
//
// Mount via a hidden route or a feature flag; not user-visible by
// default. Delete in Sprint 5 once ConsultSurface lands.

import { useState } from 'react';
import { useLiveStream } from '../../hooks/useLiveStream.js';

const SPEAKER_COLOR = {
  doctor: '#1d4ed8',
  patient: '#15803d',
  unknown: '#6b7280',
};

export function LiveTranscriptSpike({ consultationId, doctorId, orgId, authToken }) {
  const [agentEvents, setAgentEvents] = useState([]);
  const live = useLiveStream({ onEvent: () => {} });

  const startSpike = () => {
    if (!consultationId) {
      alert('consultationId required for spike');
      return;
    }
    live.start({ consultationId, doctorId, orgId, language: 'en-IN', authToken });
  };

  return (
    <div style={styles.root}>
      <header style={styles.header}>
        <strong>Cureocity Live Spike (Sprint 0)</strong>
        <span style={styles.state}>state: {live.state}</span>
        {live.error && <span style={styles.error}>error: {String(live.error?.message || live.error)}</span>}
      </header>

      <div style={styles.controls}>
        {live.state === 'idle' || live.state === 'closed' || live.state === 'error' ? (
          <button onClick={startSpike} style={styles.btnGo}>▶ start</button>
        ) : (
          <button onClick={live.stop} style={styles.btnStop}>■ stop</button>
        )}
        <span style={styles.hint}>
          Validates: WS connect → mic capture → streaming transcript &lt;1s → red-flag detection.
          Agent loop on /api/agent/turn (separate test).
        </span>
      </div>

      <main style={styles.main}>
        <section style={styles.col}>
          <h3 style={styles.colHeader}>Live Transcript</h3>
          <div style={styles.transcript}>
            {live.transcript.length === 0 && <div style={styles.empty}>(awaiting first chunk…)</div>}
            {live.transcript.map(t => (
              <div key={t.id} style={styles.line}>
                <span style={{ ...styles.speaker, color: SPEAKER_COLOR[t.speaker] || '#000' }}>
                  {t.speaker}
                </span>
                <span style={styles.text}>{t.text}</span>
                {!t.committed && <span style={styles.partial}>· partial</span>}
              </div>
            ))}
          </div>
        </section>

        <section style={styles.col}>
          <h3 style={styles.colHeader}>Red Flags</h3>
          <div style={styles.flags}>
            {live.redFlags.length === 0 && <div style={styles.empty}>(none)</div>}
            {live.redFlags.map((f, idx) => (
              <div key={idx} style={{ ...styles.flag, background: severityBg(f.severity) }}>
                <strong style={styles.flagSev}>{f.severity}</strong>
                <span style={styles.flagPhrase}>"{f.phrase}"</span>
                <span style={styles.flagCat}>{f.category}</span>
              </div>
            ))}
          </div>
        </section>

        <section style={styles.col}>
          <h3 style={styles.colHeader}>Agent Events (turn endpoint)</h3>
          <div style={styles.events}>
            {agentEvents.length === 0 && <div style={styles.empty}>(none — agent loop tested separately)</div>}
            {agentEvents.map((e, idx) => (
              <div key={idx} style={styles.event}>
                <code style={styles.evtType}>{e.type}</code>
                <code style={styles.evtBody}>{JSON.stringify(e).slice(0, 120)}</code>
              </div>
            ))}
          </div>
          <button
            style={styles.btnTestAgent}
            onClick={async () => {
              const res = await testAgentTurn({ consultationId, doctorId, orgId });
              setAgentEvents(res);
            }}
          >
            test /api/agent/turn
          </button>
        </section>
      </main>

      {live.meta && (
        <footer style={styles.footer}>
          <code>session meta: {JSON.stringify(live.meta)}</code>
        </footer>
      )}
    </div>
  );
}

async function testAgentTurn({ consultationId, doctorId, orgId }) {
  const res = await fetch('/api/agent/turn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      consultationId, doctorId, orgId,
      messages: [
        {
          role: 'user',
          content: 'Patient: 62 year old male, chest pain radiating to left arm, sweating, started 30 minutes ago. BP 150/90, HR 110.',
        },
      ],
    }),
  });
  if (!res.ok) return [{ type: 'error', status: res.status }];
  const events = [];
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const block = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const lines = block.split('\n');
      const ev = {};
      for (const line of lines) {
        if (line.startsWith('event: ')) ev.type = line.slice(7);
        else if (line.startsWith('data: ')) {
          try { Object.assign(ev, JSON.parse(line.slice(6))); }
          catch { /* ignore */ }
        }
      }
      if (ev.type) events.push(ev);
    }
  }
  return events;
}

function severityBg(s) {
  if (s === 'p0_immediate') return '#fee2e2';
  if (s === 'p1_urgent') return '#fef3c7';
  return '#e0e7ff';
}

const styles = {
  root: { fontFamily: 'IBM Plex Sans, system-ui, sans-serif', padding: 16, color: '#111827' },
  header: { display: 'flex', gap: 16, alignItems: 'baseline', borderBottom: '1px solid #e5e7eb', paddingBottom: 8 },
  state: { fontSize: 12, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 },
  error: { fontSize: 12, color: '#b91c1c' },
  controls: { display: 'flex', gap: 12, alignItems: 'center', margin: '12px 0' },
  btnGo: { padding: '8px 14px', background: '#15803d', color: 'white', border: 0, borderRadius: 6, cursor: 'pointer' },
  btnStop: { padding: '8px 14px', background: '#b91c1c', color: 'white', border: 0, borderRadius: 6, cursor: 'pointer' },
  btnTestAgent: { marginTop: 8, padding: '6px 10px', background: '#1d4ed8', color: 'white', border: 0, borderRadius: 6, cursor: 'pointer', fontSize: 12 },
  hint: { fontSize: 12, color: '#6b7280' },
  main: { display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 16, marginTop: 8 },
  col: { border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, minHeight: 240 },
  colHeader: { fontSize: 13, marginTop: 0, marginBottom: 8, color: '#374151' },
  transcript: { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14, maxHeight: '60vh', overflowY: 'auto' },
  line: { display: 'flex', gap: 8, alignItems: 'baseline' },
  speaker: { fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, minWidth: 60 },
  text: { flex: 1 },
  partial: { fontSize: 10, color: '#9ca3af' },
  flags: { display: 'flex', flexDirection: 'column', gap: 6 },
  flag: { padding: 8, borderRadius: 6, display: 'flex', flexDirection: 'column', gap: 2, fontSize: 12 },
  flagSev: { fontSize: 11, textTransform: 'uppercase' },
  flagPhrase: { fontStyle: 'italic' },
  flagCat: { fontSize: 11, color: '#6b7280' },
  events: { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, fontFamily: 'IBM Plex Mono, monospace', maxHeight: '50vh', overflowY: 'auto' },
  event: { padding: 6, background: '#f9fafb', borderRadius: 4, display: 'flex', gap: 8, alignItems: 'baseline' },
  evtType: { color: '#1d4ed8', minWidth: 100 },
  evtBody: { color: '#374151', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  empty: { color: '#9ca3af', fontStyle: 'italic', fontSize: 12 },
  footer: { marginTop: 12, padding: 8, background: '#f9fafb', borderRadius: 4, fontSize: 11 },
};
