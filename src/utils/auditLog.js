import { supabase, supabaseConfigured } from '../lib/supabaseClient';
import { addBreadcrumb } from '../lib/errorReporting';

const STORAGE_KEY = 'cx_audit_log_v1';
const PENDING_KEY = 'cx_audit_pending_v1';
const SESSION_KEY = 'cx_session_id_v1';
const MAX_EVENTS = 5000;
const FLUSH_DEBOUNCE_MS = 1500;

let flushTimer = null;
let isFlushing = false;
let currentDoctorId = null;

function getSessionId() {
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = (crypto.randomUUID && crypto.randomUUID()) || `s_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

function readArray(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeArray(key, events, cap = MAX_EVENTS) {
  try {
    const trimmed = events.length > cap ? events.slice(events.length - cap) : events;
    localStorage.setItem(key, JSON.stringify(trimmed));
  } catch (err) {
    if (err && err.name === 'QuotaExceededError') {
      try { localStorage.setItem(key, JSON.stringify(events.slice(-Math.floor(cap / 2)))); } catch { /* give up */ }
    }
  }
}

export function setAuditDoctorId(doctorId) {
  currentDoctorId = doctorId ?? null;
  scheduleFlush();
}

export function logEvent(type, payload = {}) {
  const event = {
    ts: new Date().toISOString(),
    session_id: getSessionId(),
    doctor_id: currentDoctorId,
    type,
    payload,
  };
  const archive = readArray(STORAGE_KEY);
  archive.push(event);
  writeArray(STORAGE_KEY, archive);

  if (supabaseConfigured) {
    const pending = readArray(PENDING_KEY);
    pending.push(event);
    writeArray(PENDING_KEY, pending);
    scheduleFlush();
  }

  // Sentry breadcrumb: gives us the trail leading up to any crash. PII
  // fields in payload are auto-redacted by errorReporting.beforeBreadcrumb.
  addBreadcrumb({
    category: type,
    message: type,
    data: payload,
    level: type.startsWith('alert.') ? 'warning' : 'info',
  });

  return event;
}

function scheduleFlush() {
  if (!supabaseConfigured) return;
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(flushPending, FLUSH_DEBOUNCE_MS);
}

async function flushPending() {
  if (isFlushing) return;
  if (!supabaseConfigured) return;
  if (!navigator.onLine) return;

  isFlushing = true;
  try {
    const pending = readArray(PENDING_KEY);
    if (pending.length === 0) return;

    const rows = pending.map((e) => ({
      doctor_id: e.doctor_id,
      session_id: e.session_id,
      ts: e.ts,
      type: e.type,
      payload: e.payload || {},
      user_agent: navigator.userAgent,
    }));

    const { error } = await supabase.from('audit_log').insert(rows);
    if (error) return; // leave queue intact

    localStorage.removeItem(PENDING_KEY);
  } finally {
    isFlushing = false;
  }
}

export function getAuditLog() {
  return readArray(STORAGE_KEY);
}

export function clearAuditLog() {
  localStorage.removeItem(STORAGE_KEY);
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', scheduleFlush);
}
