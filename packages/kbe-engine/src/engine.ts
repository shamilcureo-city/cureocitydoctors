// ──────────────────────────────────────────────────────────────────────────────
// KBE Engine – Deterministic Diagnostic Scoring
// ──────────────────────────────────────────────────────────────────────────────

import { normalizeInput } from './utils/normalizer.js';
import type {
  ClinicalSystem,
  ConditionProfile,
  DiagnosisTier,
  DiscriminatingQuestion,
  KBEResult,
  KBEState,
  ScoredCondition,
} from './types/index.js';

// ── State Management ─────────────────────────────────────────────────────────

/** Create a blank diagnostic session state. */
export function createInitialState(): KBEState {
  return {
    rawInput: '',
    corpus: [],
    structuredSymptoms: [],
    patient: { comorbidities: [] },
    vitals: {},
    examFindings: {},
    activeExamFindings: [],
    drugs: [],
    allergies: [],
    negatedTerms: [],
    activeSystemFilters: [],
  };
}

/** Immutable state update – returns a new object. */
export function updateState(
  state: KBEState,
  update: Partial<KBEState>,
): KBEState {
  return { ...state, ...update };
}

// ── Scoring Engine ───────────────────────────────────────────────────────────

/**
 * The core scoring pipeline.
 *
 * 1. Normalizes all input through the normaliser pipeline.
 * 2. For each condition, computes raw score by matching corpus against positive
 *    evidence (sum of matched weights).
 * 3. Applies negative-evidence penalties for negated terms.
 * 4. Adjusts score by Kerala prior, age/gender, and comorbidity modifiers.
 * 5. Tiers results: t1 (>60 % of max possible), t2 (30-60 %), t3 (15-30 %).
 * 6. Identifies active clinical systems.
 * 7. Collects red flags.
 * 8. Generates gap questions ranked by information gain.
 * 9. Computes overall certainty.
 */
export function rebuildCorpusAndRescore(
  state: KBEState,
  conditions: ConditionProfile[],
): KBEResult {
  // ── Step 1: Build normalised corpus ──────────────────────────────────────
  const corpus = buildCorpus(state);
  const negatedSet = new Set(
    state.negatedTerms.map((t) => t.toLowerCase()),
  );

  // ── Step 2-4: Score every condition ──────────────────────────────────────
  const scored: ScoredCondition[] = [];

  for (const condition of conditions) {
    // Skip conditions filtered out by active system filters
    if (
      state.activeSystemFilters.length > 0 &&
      !state.activeSystemFilters.includes(condition.system)
    ) {
      continue;
    }

    const result = scoreCondition(condition, corpus, negatedSet, state);
    if (result.rawScore > 0 || result.adjustedScore > 0) {
      scored.push(result);
    }
  }

  // Sort descending by adjusted score
  scored.sort((a, b) => b.adjustedScore - a.adjustedScore);

  // ── Step 5: Assign tiers ─────────────────────────────────────────────────
  const maxScore = scored.length > 0 ? scored[0].adjustedScore : 0;
  for (const s of scored) {
    s.tier = assignTier(s.adjustedScore, maxScore);
    s.certaintyScore = computeConditionCertainty(s);
  }

  // ── Step 6: Active systems ───────────────────────────────────────────────
  const activeSystems = deduplicateSystems(
    scored
      .filter((s) => s.tier === 't1' || s.tier === 't2')
      .map((s) => s.condition.system),
  );

  // ── Step 7: Red flags ────────────────────────────────────────────────────
  const redFlags = collectRedFlags(scored, corpus);

  // ── Step 8: Gap questions ────────────────────────────────────────────────
  const gapQuestions = rankGapQuestions(scored);

  // ── Step 9: Overall certainty ────────────────────────────────────────────
  const certaintyScore = computeOverallCertainty(scored);

  return {
    scoredConditions: scored,
    activeSystems,
    redFlags,
    gapQuestions,
    certaintyScore,
  };
}

/**
 * Return the top N gap questions ranked by diagnostic impact.
 */
export function getGapQuestions(
  result: KBEResult,
  topN: number,
): DiscriminatingQuestion[] {
  return result.gapQuestions.slice(0, topN);
}

// ── Internal Helpers ─────────────────────────────────────────────────────────

/**
 * Build the full corpus from all state sources.
 */
function buildCorpus(state: KBEState): Set<string> {
  const terms: string[] = [];

  // Raw input normalisation
  if (state.rawInput) {
    terms.push(...normalizeInput(state.rawInput));
  }

  // Existing corpus terms
  for (const c of state.corpus) {
    terms.push(...normalizeInput(c));
  }

  // Structured symptom terms
  for (const s of state.structuredSymptoms) {
    terms.push(...normalizeInput(s.term));
    if (s.associatedSymptoms) {
      for (const a of s.associatedSymptoms) {
        terms.push(...normalizeInput(a));
      }
    }
  }

  // Exam findings
  for (const findings of Object.values(state.examFindings)) {
    for (const f of findings) {
      terms.push(...normalizeInput(f));
    }
  }
  for (const f of state.activeExamFindings) {
    terms.push(...normalizeInput(f));
  }

  // Vitals-derived terms
  addVitalsDerivedTerms(state, terms);

  return new Set(terms);
}

/**
 * Derive clinical terms from vital signs.
 */
function addVitalsDerivedTerms(state: KBEState, terms: string[]): void {
  const v = state.vitals;

  if (v.temperature !== undefined) {
    if (v.temperature >= 38.0) terms.push('fever', 'pyrexia');
    if (v.temperature >= 39.5) terms.push('high-grade fever');
    if (v.temperature >= 40.0) terms.push('hyperpyrexia');
  }

  if (v.bpSystolic !== undefined) {
    if (v.bpSystolic >= 140) terms.push('hypertension');
    if (v.bpSystolic < 90) terms.push('hypotension');
  }

  if (v.pulse !== undefined) {
    if (v.pulse > 100) terms.push('tachycardia');
    if (v.pulse < 60) terms.push('bradycardia');
  }

  if (v.spo2 !== undefined) {
    if (v.spo2 < 95) terms.push('hypoxia');
    if (v.spo2 < 90) terms.push('severe-hypoxia');
  }

  if (v.bmi !== undefined) {
    if (v.bmi >= 30) terms.push('obesity');
    if (v.bmi >= 25 && v.bmi < 30) terms.push('overweight');
    if (v.bmi < 18.5) terms.push('underweight');
  }
}

/**
 * Score a single condition against the corpus.
 */
function scoreCondition(
  condition: ConditionProfile,
  corpus: Set<string>,
  negatedSet: Set<string>,
  state: KBEState,
): ScoredCondition {
  // Positive evidence matching
  const matchedEvidence: { term: string; weight: number }[] = [];
  let rawScore = 0;

  for (const ev of condition.positiveEvidence) {
    const evTerms = ev.term.toLowerCase().split(/\s+/);
    const matched = evTerms.some((t) => corpus.has(t));
    if (matched) {
      matchedEvidence.push({ term: ev.term, weight: ev.weight });
      rawScore += ev.weight;
    }
  }

  // Negative evidence (penalties for negated terms)
  const negatedEvidence: { term: string; penalty: number }[] = [];
  for (const ev of condition.negativeEvidence) {
    const evTerms = ev.term.toLowerCase().split(/\s+/);
    const isNegated = evTerms.some((t) => negatedSet.has(t));
    const isPresent = evTerms.some((t) => corpus.has(t));
    if (isNegated || isPresent) {
      negatedEvidence.push({ term: ev.term, penalty: ev.weight });
      rawScore -= ev.weight;
    }
  }

  // Ensure raw score is not negative
  rawScore = Math.max(0, rawScore);

  // ── Adjustments ────────────────────────────────────────────────────────
  let adjustedScore = rawScore;

  // Kerala prior boost
  adjustedScore *= 1 + condition.keralaPrior;

  // Age range check
  if (condition.ageRange && state.patient.age !== undefined) {
    const age = state.patient.age;
    const { min, max } = condition.ageRange;
    if ((min !== undefined && age < min) || (max !== undefined && age > max)) {
      adjustedScore *= 0.5; // halve score if outside typical age range
    }
  }

  // Gender specificity
  if (
    condition.genderSpecific &&
    state.patient.gender &&
    condition.genderSpecific !== state.patient.gender
  ) {
    adjustedScore *= 0.1; // near-zero for wrong gender
  }

  // Comorbidity modifiers
  for (const mod of condition.comorbidityModifiers) {
    const hasComorbidity = state.patient.comorbidities.some(
      (c) => c.toLowerCase() === mod.condition.toLowerCase(),
    );
    if (hasComorbidity) {
      adjustedScore += mod.scoreAdjustment;
    }
  }

  return {
    condition,
    rawScore,
    adjustedScore,
    tier: 't3', // will be reassigned after sorting
    matchedEvidence,
    negatedEvidence,
    certaintyScore: 0, // will be computed after tiering
  };
}

/**
 * Assign a tier based on score relative to the top-scorer.
 */
function assignTier(score: number, maxScore: number): DiagnosisTier {
  if (maxScore === 0) return 't3';
  const ratio = score / maxScore;
  if (ratio > 0.6) return 't1';
  if (ratio > 0.3) return 't2';
  return 't3';
}

/**
 * Compute certainty for a single scored condition (0-100).
 *
 * Based on the ratio of matched evidence weight to total possible weight.
 */
function computeConditionCertainty(scored: ScoredCondition): number {
  const totalPossible = scored.condition.positiveEvidence.reduce(
    (sum, e) => sum + e.weight,
    0,
  );
  if (totalPossible === 0) return 0;

  const matchedWeight = scored.matchedEvidence.reduce(
    (sum, e) => sum + e.weight,
    0,
  );
  const penalty = scored.negatedEvidence.reduce(
    (sum, e) => sum + e.penalty,
    0,
  );

  const certainty = Math.max(
    0,
    Math.min(100, ((matchedWeight - penalty) / totalPossible) * 100),
  );
  return Math.round(certainty);
}

/**
 * Compute overall certainty score across all scored conditions.
 *
 * High certainty = big gap between #1 and #2, with strong absolute score.
 */
function computeOverallCertainty(scored: ScoredCondition[]): number {
  if (scored.length === 0) return 0;

  const top = scored[0];
  if (top.certaintyScore === 0) return 0;

  // Separation factor: how much the top condition separates from the second
  let separationBonus = 0;
  if (scored.length >= 2) {
    const second = scored[1];
    if (top.adjustedScore > 0) {
      separationBonus =
        ((top.adjustedScore - second.adjustedScore) / top.adjustedScore) * 20;
    }
  } else {
    separationBonus = 15; // only one candidate
  }

  return Math.min(100, Math.round(top.certaintyScore + separationBonus));
}

/**
 * Collect red flags from conditions whose positive evidence matches the corpus.
 */
function collectRedFlags(
  scored: ScoredCondition[],
  corpus: Set<string>,
): string[] {
  const flags = new Set<string>();

  for (const s of scored) {
    if (s.tier !== 't1' && s.tier !== 't2') continue;
    for (const flag of s.condition.redFlags) {
      const flagTerms = flag.toLowerCase().split(/\s+/);
      const flagMatches = flagTerms.some((t) => corpus.has(t));
      if (flagMatches) {
        flags.add(flag);
      }
    }
  }

  return Array.from(flags);
}

/**
 * Rank discriminating questions by potential information gain.
 *
 * Questions that distinguish between top-tier conditions score highest.
 */
function rankGapQuestions(
  scored: ScoredCondition[],
): DiscriminatingQuestion[] {
  const topConditions = scored.filter(
    (s) => s.tier === 't1' || s.tier === 't2',
  );
  if (topConditions.length === 0) return [];

  const topConditionIds = new Set(topConditions.map((s) => s.condition.id));

  // Collect all questions with their information-gain score
  const questionScores: { question: DiscriminatingQuestion; gain: number }[] =
    [];

  for (const s of topConditions) {
    for (const q of s.condition.discriminatingQuestions) {
      // Information gain = sum of absolute score boosts for top conditions
      let gain = 0;
      for (const effect of [...q.ifYes, ...q.ifNo]) {
        if (topConditionIds.has(effect.condition)) {
          gain += Math.abs(effect.scoreBoost);
        }
      }
      questionScores.push({ question: q, gain });
    }
  }

  // Sort by gain descending, deduplicate by question text
  questionScores.sort((a, b) => b.gain - a.gain);

  const seen = new Set<string>();
  const result: DiscriminatingQuestion[] = [];
  for (const qs of questionScores) {
    if (!seen.has(qs.question.question)) {
      seen.add(qs.question.question);
      result.push(qs.question);
    }
  }

  return result;
}

/**
 * Deduplicate an array of ClinicalSystem values.
 */
function deduplicateSystems(systems: ClinicalSystem[]): ClinicalSystem[] {
  return Array.from(new Set(systems));
}
