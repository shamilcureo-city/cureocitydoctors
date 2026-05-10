/**
 * KB versioning.
 *
 * Every consultation must reference the exact KB content used to score it,
 * so that 6 months from now we can answer "what guideline was applied to
 * this patient on May 10 2026" — required for medico-legal audit and CDSCO
 * conformity reporting.
 *
 * Implementation: at module load, we deterministically hash the serialized
 * CLINICAL_KB. The hash is short (8 hex chars from a 32-bit folded checksum),
 * combined with the year-month-day for human-readable form:
 *   kb-2026-05-10-a1b2c3d4
 *
 * The hash is deterministic across runs/builds, so the same KB content
 * always yields the same version string. This means we can lazily insert
 * into kb_snapshots only the first time we encounter a new version.
 */
import { CLINICAL_KB } from './cureocityEngine.js';

// Deterministic JSON serializer with sorted keys (so two semantically
// identical KBs produce the same hash regardless of object insertion order).
function stableStringify(obj) {
  if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(stableStringify).join(',') + ']';
  const keys = Object.keys(obj).sort();
  const parts = keys.map(k => JSON.stringify(k) + ':' + stableStringify(obj[k]));
  return '{' + parts.join(',') + '}';
}

// FNV-1a 32-bit. Cheap, deterministic, suitable for content hashing.
// We're not protecting against adversaries — just need a stable fingerprint.
function fnv1a(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  // Force unsigned 32-bit, return as 8-char hex
  return (hash >>> 0).toString(16).padStart(8, '0');
}

// We pin to the current YYYY-MM-DD at module-load time. Two builds of the
// same KB on the same day → same version. A KB content change will change
// the hash even on the same day. A new day with no KB change still bumps
// the date prefix — which is fine; kb_snapshots is keyed by full version
// string so it just creates one extra harmless row.
function todayUtc() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const _serialized = stableStringify(CLINICAL_KB);

/**
 * The full content hash of the live KB. 8 hex chars.
 * This is what gets stored in kb_snapshots.content_hash.
 */
export const KB_CONTENT_HASH = fnv1a(_serialized);

/**
 * Human-readable version string: kb-YYYY-MM-DD-<hash>
 * This is what every consultation row stores in kb_version.
 */
export const KB_VERSION = `kb-${todayUtc()}-${KB_CONTENT_HASH}`;

/**
 * Number of conditions in the live KB. Cheap metric for dashboards/audit.
 */
export const KB_CONDITION_COUNT = Object.keys(CLINICAL_KB).length;
