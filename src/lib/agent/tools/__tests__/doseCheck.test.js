import { describe, it, expect } from 'vitest';
import { freqToDosesPerDay, computeDose, rowMatches, rowSpecificity } from '../doseCheck.js';

describe('freqToDosesPerDay', () => {
  it.each([
    ['OD',  1], ['QD',  1], ['STAT', 1],
    ['BD',  2], ['BID', 2], ['Q12H', 2],
    ['TDS', 3], ['TID', 3], ['Q8H',  3],
    ['QID', 4], ['Q6H', 4],
    ['Q4H', 6], ['Q3H', 8], ['Q2H', 12], ['Q1H', 24],
  ])('parses %s -> %d', (f, n) => {
    expect(freqToDosesPerDay(f)).toBe(n);
  });

  it('returns null for PRN', () => {
    expect(freqToDosesPerDay('PRN')).toBeNull();
  });

  it('returns null for unknown frequency', () => {
    expect(freqToDosesPerDay('weekly')).toBeNull();
  });
});

describe('computeDose — fixed', () => {
  it('returns dose unchanged within max', () => {
    const r = computeDose({
      dose_type: 'fixed', dose_value: 500, frequency: 'BD',
      max_single_dose_mg: null, max_daily_dose_mg: null,
    }, { age_years: 30, weight_kg: 60 });
    expect(r.single_dose_mg).toBe(500);
    expect(r.daily_dose_mg).toBe(1000);
  });

  it('caps at max single dose', () => {
    const r = computeDose({
      dose_type: 'fixed', dose_value: 1000, frequency: 'OD',
      max_single_dose_mg: 500, max_daily_dose_mg: null,
    }, { age_years: 30 });
    expect(r.single_dose_mg).toBe(500);
    expect(r.capped_by_max_single).toBe(true);
  });

  it('caps at max daily dose by reducing single', () => {
    const r = computeDose({
      dose_type: 'fixed', dose_value: 500, frequency: 'QID',
      max_single_dose_mg: null, max_daily_dose_mg: 1500,
    }, { age_years: 30 });
    // 4 doses of 500 = 2000 > 1500, so each dose drops to 375
    expect(r.single_dose_mg).toBe(375);
    expect(r.capped_by_max_daily).toBe(true);
  });
});

describe('computeDose — mg/kg', () => {
  it('multiplies by weight', () => {
    // Paracetamol 15 mg/kg in 24 kg child = 360 mg
    const r = computeDose({
      dose_type: 'mg_per_kg', dose_value: 15, frequency: 'Q6H',
      max_single_dose_mg: 1000, max_daily_dose_mg: 4000,
    }, { age_years: 8, weight_kg: 24 });
    expect(r.single_dose_mg).toBe(360);
  });

  it('caps mg/kg by max single', () => {
    // 70kg patient × 15 mg/kg = 1050; max 1000
    const r = computeDose({
      dose_type: 'mg_per_kg', dose_value: 15, frequency: 'Q6H',
      max_single_dose_mg: 1000, max_daily_dose_mg: 4000,
    }, { age_years: 30, weight_kg: 70 });
    expect(r.single_dose_mg).toBe(1000);
    expect(r.capped_by_max_single).toBe(true);
  });

  it('errors if weight missing', () => {
    const r = computeDose({
      dose_type: 'mg_per_kg', dose_value: 15, frequency: 'Q6H',
      max_single_dose_mg: 1000, max_daily_dose_mg: 4000,
    }, { age_years: 8 });
    expect(r.error).toMatch(/weight_required/);
  });
});

describe('rowMatches', () => {
  const row = {
    indication: 'community-acquired pneumonia',
    route: 'PO',
    age_min_years: 18,
    age_max_years: null,
    weight_min_kg: null,
    weight_max_kg: null,
    crcl_min_ml_min: 30,
    crcl_max_ml_min: null,
    child_pugh_class: null,
    is_pregnancy: false,
    is_lactation: null,
    dose_type: 'fixed',
  };

  it('matches adult outpatient', () => {
    expect(rowMatches(row, 'community-acquired pneumonia', 'PO',
      { age_years: 35, crcl_ml_min: 90, is_pregnant: false }
    )).toBe(true);
  });

  it('rejects child', () => {
    expect(rowMatches(row, 'community-acquired pneumonia', 'PO',
      { age_years: 10, crcl_ml_min: 90 }
    )).toBe(false);
  });

  it('rejects severe renal impairment', () => {
    expect(rowMatches(row, 'community-acquired pneumonia', 'PO',
      { age_years: 35, crcl_ml_min: 20 }
    )).toBe(false);
  });

  it('rejects wrong indication', () => {
    expect(rowMatches(row, 'cellulitis', 'PO',
      { age_years: 35, crcl_ml_min: 90 }
    )).toBe(false);
  });

  it('rejects pregnancy when row is is_pregnancy=false', () => {
    expect(rowMatches(row, 'community-acquired pneumonia', 'PO',
      { age_years: 35, crcl_ml_min: 90, is_pregnant: true }
    )).toBe(false);
  });
});

describe('rowSpecificity', () => {
  it('returns higher for more constraints', () => {
    const generic = {
      age_min_years: 18, age_max_years: null,
      weight_min_kg: null, weight_max_kg: null,
      crcl_min_ml_min: null, crcl_max_ml_min: null,
      child_pugh_class: null, is_pregnancy: null, is_lactation: null,
    };
    const specific = {
      age_min_years: 18, age_max_years: 65,
      weight_min_kg: null, weight_max_kg: null,
      crcl_min_ml_min: 30, crcl_max_ml_min: null,
      child_pugh_class: 'A', is_pregnancy: false, is_lactation: null,
    };
    expect(rowSpecificity(specific)).toBeGreaterThan(rowSpecificity(generic));
  });
});
