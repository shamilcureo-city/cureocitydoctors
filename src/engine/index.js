/**
 * Cureocity Engine — public API barrel.
 *
 * This file is the curated public surface that the rest of the app
 * (components, hooks, API functions) consumes. The implementation lives
 * across these modules:
 *
 *   src/engine/
 *     index.js              ← this file (re-exports only)
 *     cureocityEngine.js    Implementation: KBE scoring, CLINICAL_KB, calculators,
 *                           ICD-10, lab interpretation, drug interactions,
 *                           prescription builder, symptom builder, EngineCore
 *     timing.js             Pure: mapToIndianTiming, getFormPrefix
 *     __tests__/            Vitest test suite
 *
 * Future extracts (post Sprint 1.3 session container) will move:
 *     labs.js, calculators.js, kb.js, scoring.js, prescriber.js, symptoms.js
 *
 * Consumers MUST import from this file, not from cureocityEngine.js directly.
 * This is enforced by convention (review) for now; an ESLint rule will catch
 * regressions in Sprint 1.3.
 *
 * The public API is grouped below by what callers need.
 */

// ── Engine core API (the workflow uses these) ─────────────────────
export { EngineCore, S, processIntake, updateLab } from './cureocityEngine.js';

// ── Knowledge base (read-only) ────────────────────────────────────
export {
  CLINICAL_KB,
  CLINICAL_NOTES,
  KB_ID_MAP,
  SYMPTOM_BUILDER_GROUPS,
  FOLLOW_UP_QUESTIONS_DB,
  DEMOS,
  // KB lookup
  lookupKB,
} from './cureocityEngine.js';

// ── Vitals + allergies ────────────────────────────────────────────
export {
  VITALS_DEFS,
  S_VITALS,
  isAbnormalVital,
  getVitalsSummary,
  S_ALLERGIES,
  ALLERGY_CROSS_REACTIVITY,
} from './cureocityEngine.js';

// ── Labs ──────────────────────────────────────────────────────────
export { LAB_DEFS, getLabStatus } from './cureocityEngine.js';

// ── Calculators + ICD-10 ──────────────────────────────────────────
export { CALCULATORS, ICD10_DB, COND_ICD_MAP } from './cureocityEngine.js';

// ── Critical-value rules (Slice 9 overlay) ────────────────────────
export { CRITICAL_LAB_RULES } from './cureocityEngine.js';

// ── Prescription / referral ───────────────────────────────────────
export {
  INDIA_COST_DB,
  getCostEstimate,
  SPECIALIST_MAP,
  checkInteractions,
} from './cureocityEngine.js';

// ── Indian timing + drug-form helpers (extracted to timing.js) ────
export { mapToIndianTiming, getFormPrefix } from './timing.js';

// ── Internal helpers occasionally used by callers ─────────────────
export { termPresent } from './cureocityEngine.js';

// ── Lower-level scoring (used by engine internals + tests only) ───
export { kbeScoreAll, kbeScoreCondition } from './cureocityEngine.js';

// ── Session factory + snapshot (Sprint 1.3) ──────────────────────
// Forward-facing API for multi-session callers in Phase 1+.
// createSessionState() returns a fresh state shape; getSessionSnapshot()
// captures the current live state for audit/persistence.
export { createSessionState, getSessionSnapshot } from './cureocityEngine.js';
