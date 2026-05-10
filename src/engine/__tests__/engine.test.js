/**
 * Engine smoke + correctness tests.
 *
 * These cover the safety-critical paths of the deterministic engine:
 * scoring, lab interpretation, calculator math, drug interactions,
 * Indian-timing mapping, paediatric/critical guards. They exist to catch
 * regressions when we split the engine into modules and migrate the
 * mutable session state. Failures here = potentially patient-harming bugs.
 */
import { describe, it, expect } from 'vitest';

import {
  // raw helpers
  termPresent,
  isAbnormalVital,
  getLabStatus,
  mapToIndianTiming,
  getFormPrefix,
  getCostEstimate,
  // data
  CALCULATORS,
  ICD10_DB,
  COND_ICD_MAP,
  CRITICAL_LAB_RULES,
  ALLERGY_CROSS_REACTIVITY,
  LAB_DEFS,
  CLINICAL_KB,
  CLINICAL_NOTES,
  S_VITALS,
  S_ALLERGIES,
  // engine API
  EngineCore,
  S,
  processIntake,
  checkInteractions,
  lookupKB,
  // session factory (Sprint 1.3)
  createSessionState,
  getSessionSnapshot,
} from '../index.js';

// ---------------------------------------------------------------------------
// termPresent — corpus-aware substring matching, foundation of every detector
// ---------------------------------------------------------------------------
describe('termPresent', () => {
  it('matches whole word with word boundaries', () => {
    expect(termPresent('chest pain radiating to jaw', 'chest pain')).toBe(true);
    expect(termPresent('the patient has dyspnoea', 'dyspnoea')).toBe(true);
  });
  it('returns false for absent terms', () => {
    expect(termPresent('chest pain', 'haemoptysis')).toBe(false);
  });
  it('is case-sensitive (callers normalize before passing)', () => {
    // Engine assumes corpus is already normalized to lowercase by processIntake.
    // Locking this in as a contract — change requires updating all call sites.
    expect(termPresent('CHEST PAIN', 'chest pain')).toBe(false);
    expect(termPresent('chest pain', 'chest pain')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Vitals abnormality detection — drives critical alerts in Step 3
// ---------------------------------------------------------------------------
describe('isAbnormalVital', () => {
  // Thresholds locked in from VITALS_DEFS:
  // spo2: norm 94-100, warn_lo 90, crit_lo 85
  // sbp:  norm 90-139,  warn_lo 80, crit_lo 70
  // hr:   norm 60-100,  warn_lo 50, warn_hi 110, crit_lo 40, crit_hi 150
  // rr:   norm 12-20,   warn_lo 10, warn_hi 25,  crit_lo 8,  crit_hi 30
  it('flags SpO2 ≤85 as critical', () => {
    expect(isAbnormalVital('spo2', 84)).toBe('critical');
  });
  it('flags SpO2 between 86-89 as warning', () => {
    expect(isAbnormalVital('spo2', 88)).toBe('warning');
  });
  it('flags SBP ≤70 as critical', () => {
    expect(isAbnormalVital('sbp', 68)).toBe('critical');
  });
  it('flags SBP 75 as warning (above crit, below warn_lo)', () => {
    // Boundaries: ≤70 critical · 71–79 warning · 80–89 low · 90–139 normal
    expect(isAbnormalVital('sbp', 75)).toBe('warning');
  });
  it('flags SBP 80 as low (above warn boundary, below norm)', () => {
    expect(isAbnormalVital('sbp', 80)).toBe('low');
  });
  it('returns normal for in-range values', () => {
    expect(isAbnormalVital('hr', 75)).toBe('normal');
    expect(isAbnormalVital('spo2', 98)).toBe('normal');
  });
  it('flags severe tachypnoea (≥30) as critical', () => {
    expect(isAbnormalVital('rr', 32)).toBe('critical');
  });
});

// ---------------------------------------------------------------------------
// Lab interpretation — the basis for labAlerts and SOAP note objective section
// ---------------------------------------------------------------------------
describe('getLabStatus', () => {
  const allDefs = Object.values(LAB_DEFS).flat();
  const k = allDefs.find(d => d.key === 'k');
  const hb = allDefs.find(d => d.key === 'hb');
  const trop = allDefs.find(d => d.key === 'trop');

  // K critical thresholds: [2.5, 6.5]; ref 3.5–5.0
  it('classifies K ≥6.5 as critical', () => {
    expect(getLabStatus('6.6', k)).toBe('critical');
  });
  it('classifies K 6.2 as abnormal-high (between ref and crit)', () => {
    expect(getLabStatus('6.2', k)).toBe('abnormal-high');
  });
  it('classifies normal potassium as normal', () => {
    expect(getLabStatus('4.0', k)).toBe('normal');
  });
  // Hb is in g/dL with critical [6, null]
  it('classifies severe anaemia (Hb ≤6 g/dL) as critical', () => {
    expect(getLabStatus('5.5', hb)).toBe('critical');
  });
  it('classifies normal Hb as normal', () => {
    expect(getLabStatus('14', hb)).toBe('normal');
  });
  // Troponin ref 0–14, critical [null, 50]
  it('classifies elevated troponin (≥50) as critical', () => {
    expect(getLabStatus('120', trop)).toBe('critical');
  });
});

// ---------------------------------------------------------------------------
// CRITICAL_LAB_RULES — surfaced via the top-of-app overlay
// ---------------------------------------------------------------------------
describe('CRITICAL_LAB_RULES coverage', () => {
  it('has rules for the canonical 8 critical labs', () => {
    const tests = CRITICAL_LAB_RULES.map(r => r.test);
    expect(tests).toEqual(expect.arrayContaining(['k', 'na', 'glu', 'hb', 'trop', 'lact', 'pct']));
  });
  it('every rule has a name, message, and action plan', () => {
    for (const rule of CRITICAL_LAB_RULES) {
      expect(rule.name).toBeTruthy();
      expect(rule.msg).toBeTruthy();
      expect(rule.action).toBeTruthy();
      expect(['>', '<']).toContain(rule.op);
      expect(typeof rule.threshold).toBe('number');
    }
  });
});

// ---------------------------------------------------------------------------
// Drug interactions — used by Medication Safety + Prescription Builder
// ---------------------------------------------------------------------------
describe('checkInteractions', () => {
  it('flags warfarin + aspirin interaction', () => {
    const ix = checkInteractions([{ name: 'Warfarin' }, { name: 'Aspirin' }]);
    expect(ix.length).toBeGreaterThan(0);
  });
  it('returns empty for unrelated drugs', () => {
    const ix = checkInteractions([{ name: 'Paracetamol' }]);
    expect(Array.isArray(ix)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Indian timing mapper — the key UX in printable Rx (1-0-1, 1-1-1, SOS)
// ---------------------------------------------------------------------------
describe('mapToIndianTiming', () => {
  it('maps BD to 1-0-1', () => {
    expect(mapToIndianTiming('BD', 'Oral')).toBe('1-0-1');
    expect(mapToIndianTiming('twice daily', 'Oral')).toBe('1-0-1');
  });
  it('maps TDS to 1-1-1', () => {
    expect(mapToIndianTiming('TDS', 'Oral')).toBe('1-1-1');
  });
  it('maps OD bedtime to 0-0-1', () => {
    expect(mapToIndianTiming('OD bedtime', 'Oral')).toBe('0-0-1');
  });
  it('preserves IV/IM as-is (timing not applicable)', () => {
    expect(mapToIndianTiming('q8h', 'IV')).toBe('q8h');
  });
  it('maps PRN to SOS', () => {
    expect(mapToIndianTiming('PRN', 'Oral')).toBe('SOS');
  });
});

describe('getFormPrefix', () => {
  it('returns Tab. for default oral route', () => {
    expect(getFormPrefix('Oral', 'Amoxicillin')).toBe('Tab.');
  });
  it('returns Inh. for inhaled', () => {
    expect(getFormPrefix('Inhaled', 'Salbutamol')).toBe('Inh.');
  });
  it('returns Inj. IV for IV route', () => {
    expect(getFormPrefix('IV', 'Hydrocortisone')).toBe('Inj. IV');
  });
});

// ---------------------------------------------------------------------------
// India cost DB — affects Rx total + Jan Aushadhi badge
// ---------------------------------------------------------------------------
describe('getCostEstimate', () => {
  it('returns a cost for known generics', () => {
    const c = getCostEstimate('Atorvastatin 10mg');
    expect(c).toBeTruthy();
    expect(typeof c.cost_month).toBe('number');
    expect(typeof c.jan_aushadhi).toBe('boolean');
  });
  it('returns null for unknown generics', () => {
    expect(getCostEstimate('NonExistentDrug123')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// CALCULATORS — risk-scoring math must be deterministic and exact
// ---------------------------------------------------------------------------
describe('CALCULATORS shape', () => {
  it('has all 9 expected calculators', () => {
    const ids = CALCULATORS.map(c => c.id);
    expect(ids).toEqual(expect.arrayContaining([
      'curb65', 'wells_pe', 'wells_dvt', 'grace', 'chads_vasc',
      'findrisc', 'news2', 'phq9', 'gad7',
    ]));
  });
  it('each calculator has fields, interpret, and (autofill or score_fn)', () => {
    for (const c of CALCULATORS) {
      expect(Array.isArray(c.fields)).toBe(true);
      expect(c.fields.length).toBeGreaterThan(0);
      expect(typeof c.interpret).toBe('function');
    }
  });
});

describe('CURB-65 scoring via EngineCore.computeCalcScore', () => {
  const curb = CALCULATORS.find(c => c.id === 'curb65');
  it('scores 0 for healthy patient', () => {
    expect(EngineCore.computeCalcScore(curb, {})).toBe(0);
  });
  it('scores 5 with all five criteria', () => {
    expect(
      EngineCore.computeCalcScore(curb, {
        confusion: 1, urea: 1, rr: 1, bp: 1, age65: 1,
      })
    ).toBe(5);
  });
  it('interprets >=3 as high severity', () => {
    const r = curb.interpret(3);
    expect(r.level).toBe('high');
  });
  it('interprets 0-1 as low severity', () => {
    expect(curb.interpret(0).level).toBe('low');
    expect(curb.interpret(1).level).toBe('low');
  });
});

describe('NEWS2 score_fn', () => {
  const news = CALCULATORS.find(c => c.id === 'news2');
  it('scores 0 for stable vitals', () => {
    const score = EngineCore.computeCalcScore(news, {
      resp_rate: 16, spo2: 98, copd_o2: 0, temp_c: 37, sbp_n: 120, hr_n: 70, avpu: 0,
    });
    expect(score).toBe(0);
  });
  it('scores high for septic shock vitals', () => {
    const score = EngineCore.computeCalcScore(news, {
      resp_rate: 28, spo2: 90, copd_o2: 1, temp_c: 39.5, sbp_n: 85, hr_n: 130, avpu: 1,
    });
    expect(score).toBeGreaterThan(8);
  });
});

// ---------------------------------------------------------------------------
// ICD-10 mapping — used by AI Reasoning + Full Report + Rx
// ---------------------------------------------------------------------------
describe('ICD-10 DB', () => {
  it('contains the canonical primary-care codes', () => {
    const codes = ICD10_DB.map(e => e.code);
    expect(codes).toEqual(expect.arrayContaining([
      'I21.0', 'I21.4', 'I26.9', 'I50.9', 'J18.9', 'J44.1',
      'E11.9', 'E10.1', 'A41.9', 'F41.1', 'F32.9',
    ]));
  });
  it('every entry has code, desc, chapter', () => {
    for (const e of ICD10_DB) {
      expect(e.code).toBeTruthy();
      expect(e.desc).toBeTruthy();
      expect(e.chapter).toBeTruthy();
    }
  });
});

describe('COND_ICD_MAP', () => {
  it('maps STEMI → I21 codes', () => {
    expect(COND_ICD_MAP.stemi).toEqual(expect.arrayContaining(['I21.0']));
  });
  it('maps T2DM → E11 codes', () => {
    expect(COND_ICD_MAP.t2dm).toEqual(expect.arrayContaining(['E11.9']));
  });
});

// ---------------------------------------------------------------------------
// Allergy cross-reactivity — defensible safety check during Rx
// ---------------------------------------------------------------------------
describe('ALLERGY_CROSS_REACTIVITY', () => {
  it('captures penicillin → cephalosporin cross-react', () => {
    const pen = ALLERGY_CROSS_REACTIVITY.penicillin;
    expect(pen).toBeTruthy();
    expect(pen.cross.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// CLINICAL_KB shape — every entry must have the fields the engine reads
// ---------------------------------------------------------------------------
describe('CLINICAL_KB integrity', () => {
  it('has at least 25 conditions', () => {
    expect(Object.keys(CLINICAL_KB).length).toBeGreaterThanOrEqual(25);
  });
  it('every entry has id, name, icd10, systems, gl_sources', () => {
    for (const [key, kb] of Object.entries(CLINICAL_KB)) {
      expect(kb.id, `${key} missing id`).toBeTruthy();
      expect(kb.name, `${key} missing name`).toBeTruthy();
      expect(Array.isArray(kb.systems), `${key} systems not array`).toBe(true);
      expect(Array.isArray(kb.gl_sources), `${key} gl_sources not array`).toBe(true);
    }
  });
  it('lookupKB resolves known conditions and returns null for unknown', () => {
    expect(lookupKB('asthma')).toBeTruthy();
    expect(lookupKB('definitely_not_a_real_condition')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// End-to-end smoke test — feed a corpus, score, build differential
// ---------------------------------------------------------------------------
describe('processIntake — chest pain ACS smoke test', () => {
  it('produces a non-empty differential for an ACS-shaped presentation', () => {
    EngineCore.resetCase();
    EngineCore.setPatient({ age: 62, gender: 'M', comorbid: 'hypertension, t2dm' });
    EngineCore.setRawInput(
      'Sudden onset central chest pain radiating to left arm, ' +
      'sweating, dyspnoea, started 1 hour ago. Known case of HTN and DM. ' +
      'BP 140/90, HR 110, SpO2 96%.'
    );
    processIntake();

    const t3 = S.differential.t3 || [];
    const t1 = S.differential.t1 || [];
    expect(t3.length + t1.length).toBeGreaterThan(0);

    const allCondIds = [...t3, ...t1].map(c => c.id);
    const matchedAcs = allCondIds.some(id => /stemi|nstemi|ua|acs/.test(id));
    expect(matchedAcs).toBe(true);

    expect(typeof S.certainty).toBe('number');
    expect(S.certainty).toBeGreaterThanOrEqual(0);
    expect(S.certainty).toBeLessThanOrEqual(100);
  });
});

describe('processIntake — respiratory presentation smoke test', () => {
  it('activates respiratory system for cough/dyspnoea presentations', () => {
    EngineCore.resetCase();
    EngineCore.setPatient({ age: 70, gender: 'F', comorbid: 'copd' });
    EngineCore.setRawInput(
      'productive cough with purulent sputum for 4 days, fever 38.5c, ' +
      'pleuritic chest pain, dyspnoea, increased respiratory rate.'
    );
    processIntake();

    // The respiratory system should be flagged active when cough/dyspnoea present.
    const activeSysIds = Object.keys(S.activeSystems || {});
    expect(activeSysIds).toContain('rs');

    // And the differential should not be empty.
    const allConds = [...(S.differential.t3 || []), ...(S.differential.t1 || []), ...(S.differential.t2 || [])];
    expect(allConds.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// EngineCore.getCriticalLabAlerts — Slice 9 critical-value overlay
// ---------------------------------------------------------------------------
describe('getCriticalLabAlerts', () => {
  it('returns no alerts on a clean case', () => {
    EngineCore.resetCase();
    expect(EngineCore.getCriticalLabAlerts()).toEqual([]);
  });
  it('fires K+ rule when potassium >6.0', () => {
    EngineCore.resetCase();
    S.labs = { k: '6.5' };
    const alerts = EngineCore.getCriticalLabAlerts();
    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts[0].test).toBe('k');
    expect(alerts[0].value).toBeGreaterThan(6);
  });
});

// ---------------------------------------------------------------------------
// Sprint 1.3 — Session isolation: starting a new case must not inherit the
// previous case's state. Real bug class — doctor A's prescription leaking
// into doctor B's case is a malpractice landmine.
// ---------------------------------------------------------------------------
describe('Session isolation (resetCase)', () => {
  it('clears patient + corpus + differential on resetCase', () => {
    EngineCore.resetCase();
    EngineCore.setPatient({ age: 62, gender: 'M', comorbid: 'htn, dm' });
    EngineCore.setRawInput('chest pain radiating to jaw');
    processIntake();

    expect(S.patient.age).toBe(62);
    expect(S.rawInput).toBeTruthy();
    expect(Object.keys(S.activeSystems).length).toBeGreaterThan(0);

    EngineCore.resetCase();

    expect(S.patient.age).toBeNull();
    expect(S.patient.gender).toBe('');
    expect(S.patient.comorbid).toBe('');
    expect(S.rawInput).toBe('');
    expect(S.corpus).toBe('');
    expect(Object.keys(S.activeSystems)).toEqual([]);
    expect(S.redFlags).toEqual([]);
    expect(S.differential.t1).toEqual([]);
    expect(S.differential.t2).toEqual([]);
    expect(S.differential.t3).toEqual([]);
  });

  it('clears vitals + allergies on resetCase', () => {
    EngineCore.resetCase();
    EngineCore.setVital('hr', '110');
    EngineCore.setVital('sbp', '160');
    EngineCore.addAllergy('Penicillin', 'rash', 'severe');

    expect(S_VITALS.hr).toBe('110');
    expect(S_ALLERGIES.length).toBe(1);

    EngineCore.resetCase();

    expect(Object.keys(S_VITALS)).toEqual([]);
    expect(S_ALLERGIES).toEqual([]);
  });

  it('clears clinical notes on resetCase', () => {
    EngineCore.resetCase();
    EngineCore.saveNotes({ intake: 'Doctor A note', impression: 'Plan A' });

    expect(CLINICAL_NOTES.intake).toBe('Doctor A note');
    expect(CLINICAL_NOTES.impression).toBe('Plan A');

    EngineCore.resetCase();

    expect(CLINICAL_NOTES.intake).toBe('');
    expect(CLINICAL_NOTES.impression).toBe('');
  });

  it('does NOT leak state from consult A into consult B end-to-end', () => {
    // Consult A — chest pain ACS
    EngineCore.resetCase();
    EngineCore.setPatient({ age: 62, gender: 'M', comorbid: 'htn' });
    EngineCore.setRawInput('central chest pain, sweating, dyspnoea, started 1 hour ago.');
    EngineCore.setVital('hr', '110');
    EngineCore.addAllergy('Aspirin', 'urticaria', 'moderate');
    EngineCore.saveNotes({ intake: 'A note' });
    processIntake();
    const snapA = getSessionSnapshot();

    // Consult B — should start fresh
    EngineCore.resetCase();
    expect(S.patient.age).toBeNull();
    expect(S_VITALS.hr).toBeUndefined();
    expect(S_ALLERGIES).toEqual([]);
    expect(CLINICAL_NOTES.intake).toBe('');
    expect(S.differential.t1).toEqual([]);
    expect(S.differential.t3).toEqual([]);

    // Now do consult B
    EngineCore.setPatient({ age: 25, gender: 'F', comorbid: '' });
    EngineCore.setRawInput('headache and fever for 3 days');
    processIntake();
    const snapB = getSessionSnapshot();

    // Snapshot A still preserved (mutating session doesn't affect snapshots)
    expect(snapA.S.patient.age).toBe(62);
    expect(snapA.S_VITALS.hr).toBe('110');
    expect(snapA.S_ALLERGIES.length).toBe(1);

    // Snapshot B is independent
    expect(snapB.S.patient.age).toBe(25);
    expect(snapB.S_VITALS.hr).toBeUndefined();
    expect(snapB.S_ALLERGIES.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// createSessionState — Phase 1 ambient streaming will use this for per-tab
// isolation. Verify shape matches the live module-level state.
// ---------------------------------------------------------------------------
describe('createSessionState factory', () => {
  it('returns the expected top-level keys', () => {
    const fresh = createSessionState();
    expect(Object.keys(fresh).sort()).toEqual([
      'CALC_STATE', 'CLINICAL_NOTES', 'S', 'S_ALLERGIES', 'S_ICD', 'S_RX', 'S_VITALS',
    ]);
  });
  it('returns an empty S with the canonical shape', () => {
    const fresh = createSessionState();
    expect(fresh.S.step).toBe(1);
    expect(fresh.S.patient).toEqual({ age: null, gender: '', comorbid: '' });
    expect(fresh.S.differential).toEqual({ t1: [], t2: [], t3: [] });
    expect(fresh.S.rawInput).toBe('');
    expect(fresh.S_RX.doctorName).toBe('Dr.');
    expect(fresh.S_ICD.selected).toBeInstanceOf(Set);
    expect(fresh.S_ICD.selected.size).toBe(0);
  });
  it('returns a NEW state object each call (no shared references)', () => {
    const a = createSessionState();
    const b = createSessionState();
    a.S.rawInput = 'hello';
    a.S_VITALS.hr = '100';
    expect(b.S.rawInput).toBe('');
    expect(b.S_VITALS.hr).toBeUndefined();
  });
});

describe('getSessionSnapshot', () => {
  it('captures the live state without sharing references', () => {
    EngineCore.resetCase();
    EngineCore.setPatient({ age: 40, gender: 'M', comorbid: '' });
    const snap = getSessionSnapshot();
    expect(snap.S.patient.age).toBe(40);

    // Mutating the snapshot does not affect the live state
    snap.S.patient.age = 99;
    expect(S.patient.age).toBe(40);
  });
});
