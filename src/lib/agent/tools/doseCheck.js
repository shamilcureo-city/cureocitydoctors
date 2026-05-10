// dose_check tool handler — deterministic dosing.
//
// Class A in the tool boundary. The agent NEVER produces a dose number.
// This tool selects the best-matching row from drug_doses based on
// patient context and computes the validated dose.
//
// Selection algorithm (most-specific match wins, ranked by specificity):
//   1. indication match
//   2. route match
//   3. age band contains patient.age_years
//   4. weight band contains patient.weight_kg (if dose is mg/kg, weight required)
//   5. CrCl band contains patient.crcl_ml_min (if specified)
//   6. Child-Pugh class match (if specified)
//   7. pregnancy / lactation match (if specified)
//
// If no row matches, returns { error: 'no_safe_dose' } — the agent must
// surface this to the doctor; never invent a dose.

import { createClient } from '@supabase/supabase-js';

let _supabase = null;
function getSupabase() {
  if (_supabase) return _supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE creds required');
  _supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _supabase;
}

async function resolveDrug(supabase, drugName) {
  const lower = drugName.trim().toLowerCase();
  const { data: byGeneric } = await supabase
    .from('drug_master')
    .select('id, generic_name, india_brands, drug_class')
    .ilike('generic_name', lower)
    .limit(1)
    .maybeSingle();
  if (byGeneric) return byGeneric;

  // Fall back to brand lookup
  const { data: all } = await supabase
    .from('drug_master')
    .select('id, generic_name, india_brands, drug_class');
  const hit = (all || []).find(d =>
    (d.india_brands || []).some(b => b.toLowerCase() === lower)
  );
  return hit || null;
}

function rowMatches(row, indication, route, patient) {
  if (row.indication.toLowerCase() !== indication.toLowerCase()) return false;
  if (row.route !== route) return false;

  const age = patient.age_years;
  if (row.age_min_years != null && age < row.age_min_years) return false;
  if (row.age_max_years != null && age > row.age_max_years) return false;

  if (row.dose_type === 'mg_per_kg' && patient.weight_kg == null) return false;
  if (row.weight_min_kg != null && (patient.weight_kg ?? 0) < row.weight_min_kg) return false;
  if (row.weight_max_kg != null && (patient.weight_kg ?? Infinity) > row.weight_max_kg) return false;

  if (patient.crcl_ml_min != null) {
    if (row.crcl_min_ml_min != null && patient.crcl_ml_min < row.crcl_min_ml_min) return false;
    if (row.crcl_max_ml_min != null && patient.crcl_ml_min > row.crcl_max_ml_min) return false;
  }
  if (row.child_pugh_class && row.child_pugh_class !== patient.child_pugh) return false;
  if (row.is_pregnancy != null && row.is_pregnancy !== !!patient.is_pregnant) return false;
  if (row.is_lactation != null && row.is_lactation !== !!patient.is_lactating) return false;

  return true;
}

function rowSpecificity(row) {
  let s = 0;
  if (row.age_min_years != null) s++;
  if (row.age_max_years != null) s++;
  if (row.weight_min_kg != null) s++;
  if (row.weight_max_kg != null) s++;
  if (row.crcl_min_ml_min != null) s++;
  if (row.crcl_max_ml_min != null) s++;
  if (row.child_pugh_class) s++;
  if (row.is_pregnancy != null) s++;
  if (row.is_lactation != null) s++;
  return s;
}

function computeDose(row, patient) {
  let single;
  if (row.dose_type === 'fixed') {
    single = Number(row.dose_value);
  } else if (row.dose_type === 'mg_per_kg') {
    if (patient.weight_kg == null) {
      return { error: 'weight_required_for_mg_per_kg' };
    }
    single = Number(row.dose_value) * Number(patient.weight_kg);
  } else if (row.dose_type === 'bsa') {
    if (patient.weight_kg == null) {
      return { error: 'weight_required_for_bsa' };
    }
    // Mosteller's formula: BSA = sqrt((height_cm * weight_kg) / 3600)
    const h = patient.height_cm;
    if (h == null) return { error: 'height_required_for_bsa' };
    const bsa = Math.sqrt((h * patient.weight_kg) / 3600);
    single = Number(row.dose_value) * bsa;
  } else {
    return { error: `unknown_dose_type:${row.dose_type}` };
  }

  // Cap by max single dose
  if (row.max_single_dose_mg != null && single > row.max_single_dose_mg) {
    single = row.max_single_dose_mg;
  }

  // Compute daily total per frequency
  const dosesPerDay = freqToDosesPerDay(row.frequency);
  const daily = dosesPerDay ? single * dosesPerDay : null;
  let cappedByDaily = false;
  let finalSingle = single;
  if (row.max_daily_dose_mg != null && daily != null && daily > row.max_daily_dose_mg) {
    cappedByDaily = true;
    finalSingle = dosesPerDay ? row.max_daily_dose_mg / dosesPerDay : row.max_daily_dose_mg;
  }

  return {
    single_dose_mg: round1(finalSingle),
    daily_dose_mg: dosesPerDay ? round1(finalSingle * dosesPerDay) : null,
    capped_by_max_single: row.max_single_dose_mg != null && single >= row.max_single_dose_mg,
    capped_by_max_daily: cappedByDaily,
    frequency: row.frequency,
    duration_days: pickDuration(row),
  };
}

function freqToDosesPerDay(f) {
  const m = (f || '').toUpperCase();
  if (m === 'OD' || m === 'QD' || m === 'STAT') return 1;
  if (m === 'BD' || m === 'BID' || m === 'Q12H') return 2;
  if (m === 'TDS' || m === 'TID' || m === 'Q8H') return 3;
  if (m === 'QID' || m === 'Q6H') return 4;
  if (m === 'Q4H') return 6;
  if (m === 'Q3H') return 8;
  if (m === 'Q2H') return 12;
  if (m === 'Q1H') return 24;
  if (m === 'PRN') return null;
  return null;
}

function pickDuration(row) {
  if (row.duration_days_min == null && row.duration_days_max == null) return null;
  if (row.duration_days_min != null && row.duration_days_max != null) {
    return { min: row.duration_days_min, max: row.duration_days_max };
  }
  return row.duration_days_min ?? row.duration_days_max;
}

function round1(x) {
  return Math.round(x * 10) / 10;
}

export async function handleDoseCheck({ drug, indication, route, patient }, _ctx = {}) {
  if (!drug || !indication || !route || !patient) {
    return { error: 'drug, indication, route, patient all required' };
  }
  if (typeof patient.age_years !== 'number') {
    return { error: 'patient.age_years required' };
  }

  const startedAt = Date.now();
  try {
    const supabase = getSupabase();
    const drugRow = await resolveDrug(supabase, drug);
    if (!drugRow) {
      return { error: `unknown_drug:${drug}`, _meta: { latency_ms: Date.now() - startedAt } };
    }

    const { data: rows, error } = await supabase
      .from('drug_doses')
      .select('*')
      .eq('drug_id', drugRow.id)
      .eq('is_active', true);
    if (error) throw error;

    const candidates = (rows || []).filter(r => rowMatches(r, indication, route, patient));

    if (candidates.length === 0) {
      return {
        error: 'no_safe_dose',
        message: 'No matching dose row for this drug + indication + route + patient context. Doctor must verify manually.',
        drug: drugRow.generic_name,
        indication,
        route,
        _meta: { latency_ms: Date.now() - startedAt },
      };
    }

    candidates.sort((a, b) => rowSpecificity(b) - rowSpecificity(a));
    const chosen = candidates[0];
    const computed = computeDose(chosen, patient);
    if (computed.error) {
      return { error: computed.error, _meta: { latency_ms: Date.now() - startedAt } };
    }

    return {
      drug: drugRow.generic_name,
      india_brands: drugRow.india_brands,
      indication: chosen.indication,
      route: chosen.route,
      ...computed,
      kb_cite: chosen.kb_chunk_id,
      source: chosen.source,
      _meta: {
        latency_ms: Date.now() - startedAt,
        rule_id: chosen.id,
        candidate_count: candidates.length,
      },
    };
  } catch (err) {
    return {
      error: err?.message || String(err),
      _meta: { latency_ms: Date.now() - startedAt },
    };
  }
}

// Pure helpers exported for unit testing
export { freqToDosesPerDay, computeDose, rowMatches, rowSpecificity };
