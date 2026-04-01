// ──────────────────────────────────────────────────────────────────────────────
// KBE Engine – Public API
// ──────────────────────────────────────────────────────────────────────────────

// Types
export type {
  KBEState,
  StructuredSymptom,
  PatientContext,
  VitalsData,
  DrugEntry,
  ClinicalSystem,
  DiagnosisTier,
  ConditionProfile,
  EvidenceTerm,
  ComorbidityModifier,
  TreatmentProtocol,
  PrescriptionTemplate,
  DiscriminatingQuestion,
  ScoredCondition,
  KBEResult,
} from './types/index.js';

// Engine
export {
  createInitialState,
  updateState,
  rebuildCorpusAndRescore,
  getGapQuestions,
} from './engine.js';

// Normalizer
export { normalizeInput } from './utils/normalizer.js';
export {
  MANGLISH_MAP,
  SHORTHAND_MAP,
  SPELL_MAP,
  PHRASES_MAP,
} from './utils/normalizer.js';

// Conditions
export { allConditions, infectiousConditions } from './conditions/index.js';
export {
  dengueFever,
  leptospirosis,
  scrubTyphus,
  typhoidFever,
  acuteGastroenteritis,
} from './conditions/index.js';
