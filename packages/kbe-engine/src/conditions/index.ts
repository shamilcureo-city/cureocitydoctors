// ──────────────────────────────────────────────────────────────────────────────
// KBE Engine – Condition Registry
//
// Single-source array of all condition profiles. Import new system modules here
// and spread them into the allConditions export.
// ──────────────────────────────────────────────────────────────────────────────

import type { ConditionProfile } from '../types/index.js';
import { infectiousConditions } from './infectious.js';

/** Every condition profile available to the scoring engine. */
export const allConditions: ConditionProfile[] = [
  ...infectiousConditions,
];

// Re-export individual modules for selective imports
export { infectiousConditions } from './infectious.js';
export {
  dengueFever,
  leptospirosis,
  scrubTyphus,
  typhoidFever,
  acuteGastroenteritis,
} from './infectious.js';
