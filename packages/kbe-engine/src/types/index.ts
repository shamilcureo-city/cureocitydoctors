// ──────────────────────────────────────────────────────────────────────────────
// KBE Engine – Core Type Definitions
// ──────────────────────────────────────────────────────────────────────────────

/** Full mutable state of a single diagnostic session. */
export interface KBEState {
  rawInput: string;
  corpus: string[];
  structuredSymptoms: StructuredSymptom[];
  patient: PatientContext;
  vitals: VitalsData;
  examFindings: Record<string, string[]>;
  activeExamFindings: string[];
  drugs: DrugEntry[];
  allergies: string[];
  negatedTerms: string[];
  activeSystemFilters: ClinicalSystem[];
}

export interface StructuredSymptom {
  term: string;
  duration?: string;
  severity?: 'mild' | 'moderate' | 'severe';
  onset?: 'sudden' | 'gradual';
  character?: string;
  associatedSymptoms?: string[];
}

export interface PatientContext {
  age?: number;
  gender?: 'male' | 'female' | 'other';
  comorbidities: string[];
  occupation?: string;
  travelHistory?: string[];
  location?: string;
}

export interface VitalsData {
  bpSystolic?: number;
  bpDiastolic?: number;
  pulse?: number;
  temperature?: number;
  spo2?: number;
  weight?: number;
  height?: number;
  bmi?: number;
}

export interface DrugEntry {
  name: string;
  dose: string;
  frequency: string;
  route?: string;
  duration?: string;
}

export type ClinicalSystem =
  | 'cardiovascular'
  | 'respiratory'
  | 'endocrine'
  | 'gastrointestinal'
  | 'neurological'
  | 'infectious'
  | 'musculoskeletal'
  | 'psychiatric'
  | 'renal'
  | 'hematological'
  | 'dermatological'
  | 'obstetric_gynecological';

export type DiagnosisTier = 't1' | 't2' | 't3';

// ── Condition Knowledge-Base ─────────────────────────────────────────────────

export interface ConditionProfile {
  id: string;
  name: string;
  icd10: string;
  system: ClinicalSystem;
  positiveEvidence: EvidenceTerm[];
  negativeEvidence: EvidenceTerm[];
  redFlags: string[];
  /** 0-1, seasonal / endemic adjustment for Kerala. */
  keralaPrior: number;
  ageRange?: { min?: number; max?: number };
  genderSpecific?: 'male' | 'female';
  comorbidityModifiers: ComorbidityModifier[];
  treatmentProtocol: TreatmentProtocol;
  discriminatingQuestions: DiscriminatingQuestion[];
}

export interface EvidenceTerm {
  term: string;
  /** 1-10 */
  weight: number;
  category: 'symptom' | 'sign' | 'lab' | 'history' | 'risk_factor';
}

export interface ComorbidityModifier {
  condition: string;
  /** Positive = increases likelihood. */
  scoreAdjustment: number;
}

export interface TreatmentProtocol {
  firstLine: PrescriptionTemplate[];
  investigations: string[];
  monitoring: string[];
  referralCriteria?: string[];
  followUpDays?: number;
}

export interface PrescriptionTemplate {
  drug: string;
  brandName?: string;
  dose: string;
  /** Indian format: "1-0-1", "1-1-1", etc. */
  frequency: string;
  /** "Tab.", "Cap.", "Syr.", "Inj." */
  route: string;
  duration: string;
  instructions?: string;
}

export interface DiscriminatingQuestion {
  question: string;
  ifYes: { condition: string; scoreBoost: number }[];
  ifNo: { condition: string; scoreBoost: number }[];
}

// ── Scoring Output ───────────────────────────────────────────────────────────

export interface ScoredCondition {
  condition: ConditionProfile;
  rawScore: number;
  adjustedScore: number;
  tier: DiagnosisTier;
  matchedEvidence: { term: string; weight: number }[];
  negatedEvidence: { term: string; penalty: number }[];
  /** 0-100 */
  certaintyScore: number;
}

export interface KBEResult {
  scoredConditions: ScoredCondition[];
  activeSystems: ClinicalSystem[];
  redFlags: string[];
  gapQuestions: DiscriminatingQuestion[];
  certaintyScore: number;
}
