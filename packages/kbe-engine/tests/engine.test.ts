import { describe, it, expect } from 'vitest';
import {
  createInitialState,
  updateState,
  rebuildCorpusAndRescore,
  getGapQuestions,
  normalizeInput,
  allConditions,
} from '../src/index.js';

describe('KBE Engine', () => {
  describe('createInitialState', () => {
    it('should return a valid empty state', () => {
      const state = createInitialState();
      expect(state.rawInput).toBe('');
      expect(state.corpus).toEqual([]);
      expect(state.structuredSymptoms).toEqual([]);
      expect(state.drugs).toEqual([]);
      expect(state.allergies).toEqual([]);
      expect(state.negatedTerms).toEqual([]);
    });

    it('should return default patient context with empty comorbidities', () => {
      const state = createInitialState();
      expect(state.patient).toBeDefined();
      expect(state.patient.comorbidities).toEqual([]);
    });

    it('should return empty vitals and exam findings', () => {
      const state = createInitialState();
      expect(state.vitals).toEqual({});
      expect(state.examFindings).toEqual({});
      expect(state.activeExamFindings).toEqual([]);
    });
  });

  describe('updateState', () => {
    it('should return a new state without mutating the original', () => {
      const original = createInitialState();
      const updated = updateState(original, { rawInput: 'fever headache' });
      expect(updated.rawInput).toBe('fever headache');
      expect(original.rawInput).toBe('');
      expect(updated).not.toBe(original);
    });

    it('should preserve fields not included in the update', () => {
      const original = updateState(createInitialState(), {
        rawInput: 'fever',
        allergies: ['Penicillin'],
      });
      const updated = updateState(original, { rawInput: 'fever headache' });
      expect(updated.rawInput).toBe('fever headache');
      expect(updated.allergies).toEqual(['Penicillin']);
    });
  });

  describe('rebuildCorpusAndRescore', () => {
    it('should return empty results for empty input', () => {
      const state = createInitialState();
      const result = rebuildCorpusAndRescore(state, allConditions);
      expect(result.scoredConditions).toEqual([]);
      expect(result.certaintyScore).toBe(0);
    });

    it('should score dengue highly for classic dengue symptoms', () => {
      const state = updateState(createInitialState(), {
        rawInput: 'fever headache myalgia retro-orbital pain rash thrombocytopenia',
      });
      const result = rebuildCorpusAndRescore(state, allConditions);
      expect(result.scoredConditions.length).toBeGreaterThan(0);
      const dengue = result.scoredConditions.find(
        (sc) => sc.condition.name.toLowerCase().includes('dengue'),
      );
      expect(dengue).toBeDefined();
      expect(dengue!.tier).toBe('t1');
    });

    it('should score leptospirosis for flood/rat exposure symptoms', () => {
      const state = updateState(createInitialState(), {
        rawInput:
          'fever myalgia jaundice conjunctival suffusion renal failure rat exposure flood water',
      });
      const result = rebuildCorpusAndRescore(state, allConditions);
      const lepto = result.scoredConditions.find(
        (sc) => sc.condition.name.toLowerCase().includes('leptospirosis'),
      );
      expect(lepto).toBeDefined();
      expect(lepto!.tier).toBe('t1');
    });

    it('should score acute gastroenteritis for GI symptoms', () => {
      const state = updateState(createInitialState(), {
        rawInput: 'diarrhea vomiting abdominal pain dehydration watery stool',
      });
      const result = rebuildCorpusAndRescore(state, allConditions);
      const age = result.scoredConditions.find(
        (sc) => sc.condition.name.toLowerCase().includes('gastroenteritis'),
      );
      expect(age).toBeDefined();
      expect(['t1', 't2']).toContain(age!.tier);
    });

    it('should identify red flags', () => {
      const state = updateState(createInitialState(), {
        rawInput: 'fever severe bleeding hemorrhagic shock hypotension',
      });
      const result = rebuildCorpusAndRescore(state, allConditions);
      expect(result.redFlags.length).toBeGreaterThan(0);
    });

    it('should identify active clinical systems', () => {
      const state = updateState(createInitialState(), {
        rawInput: 'fever headache myalgia',
      });
      const result = rebuildCorpusAndRescore(state, allConditions);
      if (result.scoredConditions.length > 0) {
        expect(result.activeSystems.length).toBeGreaterThan(0);
        expect(result.activeSystems).toContain('infectious');
      }
    });

    it('should return scored conditions sorted by adjustedScore descending', () => {
      const state = updateState(createInitialState(), {
        rawInput: 'fever headache myalgia jaundice diarrhea',
      });
      const result = rebuildCorpusAndRescore(state, allConditions);
      for (let i = 1; i < result.scoredConditions.length; i++) {
        expect(result.scoredConditions[i - 1].adjustedScore).toBeGreaterThanOrEqual(
          result.scoredConditions[i].adjustedScore,
        );
      }
    });

    it('should include matched evidence details on scored conditions', () => {
      const state = updateState(createInitialState(), {
        rawInput: 'fever headache myalgia rash',
      });
      const result = rebuildCorpusAndRescore(state, allConditions);
      const top = result.scoredConditions[0];
      expect(top.matchedEvidence.length).toBeGreaterThan(0);
      expect(top.matchedEvidence[0]).toHaveProperty('term');
      expect(top.matchedEvidence[0]).toHaveProperty('weight');
    });
  });

  describe('getGapQuestions', () => {
    it('should return at most N questions', () => {
      const state = updateState(createInitialState(), {
        rawInput: 'fever myalgia headache abdominal pain',
      });
      const result = rebuildCorpusAndRescore(state, allConditions);
      const gaps = getGapQuestions(result, 3);
      expect(gaps.length).toBeLessThanOrEqual(3);
    });

    it('should return empty array for empty results', () => {
      const state = createInitialState();
      const result = rebuildCorpusAndRescore(state, allConditions);
      const gaps = getGapQuestions(result, 5);
      expect(gaps).toEqual([]);
    });

    it('should return questions with expected structure', () => {
      const state = updateState(createInitialState(), {
        rawInput: 'fever myalgia headache rash jaundice',
      });
      const result = rebuildCorpusAndRescore(state, allConditions);
      const gaps = getGapQuestions(result, 5);
      for (const q of gaps) {
        expect(q).toHaveProperty('question');
        expect(q).toHaveProperty('ifYes');
        expect(q).toHaveProperty('ifNo');
        expect(typeof q.question).toBe('string');
        expect(Array.isArray(q.ifYes)).toBe(true);
        expect(Array.isArray(q.ifNo)).toBe(true);
      }
    });
  });

  describe('normalizeInput', () => {
    it('should normalize Manglish terms', () => {
      const terms = normalizeInput('pani');
      expect(terms.some((t) => t.includes('fever'))).toBe(true);
    });

    it('should normalize shorthand terms', () => {
      const terms = normalizeInput('CBC LFT RFT');
      expect(terms.length).toBeGreaterThan(0);
    });

    it('should correct common misspellings', () => {
      const terms = normalizeInput('brething difficulty');
      expect(terms.some((t) => t.includes('breathing'))).toBe(true);
    });

    it('should handle empty input', () => {
      const terms = normalizeInput('');
      expect(terms).toEqual([]);
    });

    it('should deduplicate repeated terms', () => {
      const terms = normalizeInput('fever fever fever');
      const feverCount = terms.filter((t) => t === 'fever').length;
      expect(feverCount).toBe(1);
    });

    it('should normalize multi-word phrases', () => {
      const terms = normalizeInput('loose motion');
      expect(terms.some((t) => t === 'diarrhea')).toBe(true);
    });
  });

  describe('allConditions', () => {
    it('should contain 5 conditions', () => {
      expect(allConditions.length).toBe(5);
    });

    it('should have valid condition profiles', () => {
      for (const condition of allConditions) {
        expect(condition.id).toBeDefined();
        expect(condition.name).toBeDefined();
        expect(condition.system).toBe('infectious');
        expect(condition.positiveEvidence.length).toBeGreaterThan(0);
        expect(condition.treatmentProtocol).toBeDefined();
        expect(condition.treatmentProtocol.firstLine.length).toBeGreaterThan(0);
      }
    });

    it('should have ICD-10 codes on every condition', () => {
      for (const condition of allConditions) {
        expect(condition.icd10).toBeDefined();
        expect(condition.icd10.length).toBeGreaterThan(0);
      }
    });

    it('should have discriminating questions on every condition', () => {
      for (const condition of allConditions) {
        expect(condition.discriminatingQuestions).toBeDefined();
        expect(Array.isArray(condition.discriminatingQuestions)).toBe(true);
        expect(condition.discriminatingQuestions.length).toBeGreaterThan(0);
      }
    });
  });
});
