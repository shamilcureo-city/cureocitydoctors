import { supabase, supabaseConfigured } from './supabaseClient';

const QUEUE_KEY = 'cx_pending_events_v1';
const CASE_ID_KEY = 'cx_active_case_id_v1';
const FLUSH_DEBOUNCE_MS = 800;

let flushTimer = null;
let isFlushing = false;

function readQueue() {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(events) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(events));
  } catch {
    /* quota exceeded — drop oldest half */
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(events.slice(-Math.floor(events.length / 2))));
    } catch { /* give up */ }
  }
}

export function getActiveCaseId() {
  return localStorage.getItem(CASE_ID_KEY);
}

export function setActiveCaseId(id) {
  if (id) localStorage.setItem(CASE_ID_KEY, id);
  else localStorage.removeItem(CASE_ID_KEY);
}

export function clearActiveCase() {
  localStorage.removeItem(CASE_ID_KEY);
  // Drain anything still pending so we don't replay it onto a new case
  scheduleFlush();
}

/**
 * Ensure a case row exists for the current doctor. Returns the case id.
 * In local-only mode returns a synthetic id so events can still be queued.
 */
export async function ensureActiveCase(doctorId) {
  let caseId = getActiveCaseId();
  if (caseId) return caseId;

  if (!supabaseConfigured || !doctorId) {
    caseId = `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setActiveCaseId(caseId);
    return caseId;
  }

  const { data, error } = await supabase
    .from('cases')
    .insert({ doctor_id: doctorId, status: 'in_progress' })
    .select('id')
    .single();

  if (error || !data) {
    // Cloud insert failed; fall back to a local case id and let events queue
    caseId = `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setActiveCaseId(caseId);
    return caseId;
  }
  setActiveCaseId(data.id);
  return data.id;
}

/**
 * Append a case event. Always queued locally first, then async-flushed to Supabase.
 * Survives reload, network drop, and offline use.
 */
export function appendCaseEvent({ caseId, doctorId, type, payload }) {
  if (!caseId) return;
  const events = readQueue();
  events.push({
    case_id: caseId,
    doctor_id: doctorId ?? null,
    type,
    payload: payload ?? {},
    ts: new Date().toISOString(),
  });
  writeQueue(events);
  scheduleFlush();
}

function scheduleFlush() {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(flushQueue, FLUSH_DEBOUNCE_MS);
}

async function flushQueue() {
  if (isFlushing) return;
  if (!supabaseConfigured) return;
  if (!navigator.onLine) return;

  isFlushing = true;
  try {
    let events = readQueue();
    // Drop synthetic local-only case events — they have no remote case row
    const remoteOnly = events.filter((e) => !String(e.case_id).startsWith('local_') && e.doctor_id);
    if (remoteOnly.length === 0) return;

    const { error } = await supabase.from('case_events').insert(remoteOnly);
    if (error) return; // Leave queue intact for next attempt

    // Remove the events we just flushed; keep any local-only ones for now
    const localOnly = events.filter((e) => String(e.case_id).startsWith('local_') || !e.doctor_id);
    writeQueue(localOnly);
  } finally {
    isFlushing = false;
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', scheduleFlush);
}

export const _internal = { flushQueue };
