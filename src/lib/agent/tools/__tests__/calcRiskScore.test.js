import { describe, it, expect } from 'vitest';
import { calcRiskScore, SUPPORTED_SCORES } from '../calcRiskScore.js';

describe('calcRiskScore — CURB-65', () => {
  it('returns 0 for healthy young patient', () => {
    const r = calcRiskScore({
      score_type: 'curb65',
      params: { confusion: false, bun_mmol_l: 4, rr: 16, sbp: 120, dbp: 80, age_years: 30 },
    });
    expect(r.score).toBe(0);
    expect(r.recommendation).toMatch(/outpatient/i);
  });

  it('flags severe CAP at score 5', () => {
    const r = calcRiskScore({
      score_type: 'curb65',
      params: { confusion: true, bun_mmol_l: 9, rr: 32, sbp: 80, dbp: 50, age_years: 70 },
    });
    expect(r.score).toBe(5);
    expect(r.recommendation).toMatch(/icu/i);
  });

  it('boundary: BUN exactly 7 should not trigger', () => {
    const r = calcRiskScore({
      score_type: 'curb65',
      params: { confusion: false, bun_mmol_l: 7, rr: 16, sbp: 120, dbp: 80, age_years: 30 },
    });
    expect(r.components.urea).toBe(0);
  });

  it('boundary: age 65 triggers age criterion', () => {
    const r = calcRiskScore({
      score_type: 'curb65',
      params: { confusion: false, bun_mmol_l: 4, rr: 16, sbp: 120, dbp: 80, age_years: 65 },
    });
    expect(r.components.age).toBe(1);
  });

  it('returns error on missing params', () => {
    const r = calcRiskScore({
      score_type: 'curb65',
      params: { confusion: false },
    });
    expect(r.error).toBe('missing_params');
    expect(r.missing).toContain('bun_mmol_l');
  });
});

describe('calcRiskScore — Wells PE', () => {
  it('high pretest probability', () => {
    const r = calcRiskScore({
      score_type: 'wells_pe',
      params: {
        clinical_dvt: true, pe_most_likely: true, hr_over_100: true,
        immobilisation: false, previous_pe_dvt: false,
        haemoptysis: false, active_malignancy: false,
      },
    });
    expect(r.score).toBe(7.5);
    expect(r.category).toBe('high');
  });

  it('moderate pretest probability', () => {
    const r = calcRiskScore({
      score_type: 'wells_pe',
      params: {
        clinical_dvt: false, pe_most_likely: false, hr_over_100: true,
        immobilisation: false, previous_pe_dvt: false,
        haemoptysis: true, active_malignancy: false,
      },
    });
    expect(r.score).toBe(2.5);
    expect(r.category).toBe('moderate');
  });

  it('low pretest probability', () => {
    const r = calcRiskScore({
      score_type: 'wells_pe',
      params: {
        clinical_dvt: false, pe_most_likely: false, hr_over_100: false,
        immobilisation: false, previous_pe_dvt: false,
        haemoptysis: false, active_malignancy: false,
      },
    });
    expect(r.score).toBe(0);
    expect(r.category).toBe('low');
  });
});

describe('calcRiskScore — NEWS2', () => {
  it('healthy adult scores 0', () => {
    const r = calcRiskScore({
      score_type: 'news2',
      params: {
        rr: 16, spo2: 98, on_oxygen: false,
        sbp: 120, hr: 72, consciousness: 'A', temp_c: 36.8,
        scale_2: false,
      },
    });
    expect(r.score).toBe(0);
  });

  it('septic patient triggers high score', () => {
    const r = calcRiskScore({
      score_type: 'news2',
      params: {
        rr: 28, spo2: 91, on_oxygen: true,
        sbp: 88, hr: 130, consciousness: 'V', temp_c: 39.2,
        scale_2: false,
      },
    });
    expect(r.score).toBeGreaterThanOrEqual(7);
    expect(r.recommendation).toMatch(/escalate/i);
  });
});

describe('calcRiskScore — Centor', () => {
  it('high score in adolescent', () => {
    const r = calcRiskScore({
      score_type: 'centor',
      params: {
        age_years: 12, tonsillar_exudate: true,
        tender_anterior_nodes: true, fever: true, no_cough: true,
      },
    });
    expect(r.score).toBe(5);
  });

  it('age >= 45 subtracts 1', () => {
    const r = calcRiskScore({
      score_type: 'centor',
      params: {
        age_years: 50, tonsillar_exudate: true,
        tender_anterior_nodes: true, fever: true, no_cough: true,
      },
    });
    expect(r.score).toBe(3);
  });
});

describe('calcRiskScore — Ottawa Ankle', () => {
  it('inability to bear weight triggers both', () => {
    const r = calcRiskScore({
      score_type: 'ottawa_ankle',
      params: {
        malleolar_pain: true, midfoot_pain: true,
        bone_tenderness_lateral: false, bone_tenderness_medial: false,
        bone_tenderness_navicular: false, bone_tenderness_5th_mt: false,
        unable_to_bear_weight: true,
      },
    });
    expect(r.ankle_xray_indicated).toBe(true);
    expect(r.foot_xray_indicated).toBe(true);
  });

  it('no symptoms — no X-ray', () => {
    const r = calcRiskScore({
      score_type: 'ottawa_ankle',
      params: {
        malleolar_pain: false, midfoot_pain: false,
        bone_tenderness_lateral: false, bone_tenderness_medial: false,
        bone_tenderness_navicular: false, bone_tenderness_5th_mt: false,
        unable_to_bear_weight: false,
      },
    });
    expect(r.ankle_xray_indicated).toBe(false);
    expect(r.foot_xray_indicated).toBe(false);
  });
});

describe('calcRiskScore — error handling', () => {
  it('rejects unknown score_type', () => {
    const r = calcRiskScore({ score_type: 'made_up', params: {} });
    expect(r.error).toMatch(/unknown_score_type/);
    expect(r.available).toEqual(SUPPORTED_SCORES);
  });
});
