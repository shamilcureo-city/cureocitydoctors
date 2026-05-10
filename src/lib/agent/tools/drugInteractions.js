// drug_interactions tool handler — deterministic safety lookup.
//
// Class A in the tool boundary. Mandatory before any drug suggestion and
// at Rx finalization.
//
// Inputs: list of generic drug names + optional patient context.
// Outputs: list of interaction findings (drug-drug, drug-disease,
//          drug-allergy, drug-age, drug-pregnancy, drug-lactation).
//
// Each finding has severity (contraindicated/major/moderate/minor),
// mechanism, advice, and a kb_chunk_id for the agent to cite.

import { createClient } from '@supabase/supabase-js';

let _supabase = null;
function getSupabase() {
  if (_supabase) return _supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  }
  _supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _supabase;
}

// Resolve user-facing names (generic OR brand) to canonical drug_master rows.
// Brands are matched case-insensitively against drug_master.india_brands.
async function resolveDrugs(supabase, names) {
  const lowered = names.map(n => n.trim().toLowerCase()).filter(Boolean);
  if (!lowered.length) return [];

  // First pass: direct generic match
  const { data: generics, error: gErr } = await supabase
    .from('drug_master')
    .select('id, generic_name, india_brands, drug_class')
    .filter('generic_name', 'in', `(${lowered.map(n => `"${n}"`).join(',')})`);
  if (gErr) throw gErr;

  const byLower = new Map();
  (generics || []).forEach(d => byLower.set(d.generic_name.toLowerCase(), d));

  // Second pass: brand match for unresolved names
  const unresolved = lowered.filter(n => !byLower.has(n));
  if (unresolved.length) {
    const { data: brandHits } = await supabase
      .from('drug_master')
      .select('id, generic_name, india_brands, drug_class');

    (brandHits || []).forEach(d => {
      const brandSet = new Set((d.india_brands || []).map(b => b.toLowerCase()));
      for (const u of unresolved) {
        if (brandSet.has(u)) byLower.set(u, d);
      }
    });
  }

  return lowered
    .map(n => ({ input: n, resolved: byLower.get(n) || null }))
    .filter(x => x.resolved);
}

export async function handleDrugInteractions({ drugs, patient_context }, _ctx = {}) {
  if (!Array.isArray(drugs) || drugs.length === 0) {
    return { error: 'drugs[] is required', findings: [] };
  }

  const startedAt = Date.now();
  try {
    const supabase = getSupabase();
    const resolved = await resolveDrugs(supabase, drugs);
    if (resolved.length === 0) {
      return {
        findings: [],
        unresolved_names: drugs,
        _meta: { latency_ms: Date.now() - startedAt },
      };
    }
    const drugIds = resolved.map(r => r.resolved.id);

    const findings = [];

    // ─── 1. drug-drug pairs ───
    if (drugIds.length >= 2) {
      const { data: ddPairs, error: ddErr } = await supabase
        .from('v_drug_interactions_by_name')
        .select('*')
        .in('drug_a', resolved.map(r => r.resolved.generic_name))
        .in('drug_b', resolved.map(r => r.resolved.generic_name));
      if (ddErr) throw ddErr;
      (ddPairs || []).forEach(row => {
        findings.push({
          kind: 'drug_drug',
          drug_a: row.drug_a,
          drug_b: row.drug_b,
          severity: row.severity,
          mechanism: row.mechanism,
          advice: row.advice,
          evidence_level: row.evidence_level,
          source: row.source,
          kb_chunk_id: row.kb_chunk_id,
        });
      });
    }

    // ─── 2. drug-disease (comorbidities from patient_context) ───
    const comorbidities = patient_context?.comorbidities || [];
    if (comorbidities.length) {
      const { data, error } = await supabase
        .from('drug_interactions')
        .select('*, drug_master!drug_interactions_drug_a_id_fkey(generic_name)')
        .eq('kind', 'drug_disease')
        .in('drug_a_id', drugIds)
        .filter('partner_condition', 'in', `(${comorbidities.map(c => `"${c.toLowerCase()}"`).join(',')})`)
        .eq('is_active', true);
      if (error) throw error;
      (data || []).forEach(row => {
        findings.push({
          kind: 'drug_disease',
          drug: row.drug_master?.generic_name,
          condition: row.partner_condition,
          severity: row.severity,
          mechanism: row.mechanism,
          advice: row.advice,
          kb_chunk_id: row.kb_chunk_id,
        });
      });
    }

    // ─── 3. drug-age ───
    if (typeof patient_context?.age_years === 'number') {
      // Match age bands; left as a Sprint 2 enrichment — we list all age-band
      // interactions for the drug list and let the SQL filter do the work.
      const { data, error } = await supabase
        .from('drug_interactions')
        .select('*, drug_master!drug_interactions_drug_a_id_fkey(generic_name)')
        .eq('kind', 'drug_age_band')
        .in('drug_a_id', drugIds)
        .eq('is_active', true);
      if (error) throw error;
      const age = patient_context.age_years;
      (data || []).forEach(row => {
        if (matchesAgeBand(row.partner_age_band, age)) {
          findings.push({
            kind: 'drug_age_band',
            drug: row.drug_master?.generic_name,
            age_band: row.partner_age_band,
            severity: row.severity,
            mechanism: row.mechanism,
            advice: row.advice,
            kb_chunk_id: row.kb_chunk_id,
          });
        }
      });
    }

    // ─── 4. drug-pregnancy ───
    if (patient_context?.is_pregnant && patient_context?.pregnancy_trimester) {
      const { data, error } = await supabase
        .from('drug_interactions')
        .select('*, drug_master!drug_interactions_drug_a_id_fkey(generic_name)')
        .eq('kind', 'drug_pregnancy')
        .in('drug_a_id', drugIds)
        .eq('partner_pregnancy_trimester', patient_context.pregnancy_trimester)
        .eq('is_active', true);
      if (error) throw error;
      (data || []).forEach(row => {
        findings.push({
          kind: 'drug_pregnancy',
          drug: row.drug_master?.generic_name,
          trimester: row.partner_pregnancy_trimester,
          severity: row.severity,
          mechanism: row.mechanism,
          advice: row.advice,
          kb_chunk_id: row.kb_chunk_id,
        });
      });
    }

    // ─── 5. drug-lactation ───
    if (patient_context?.is_lactating) {
      const { data, error } = await supabase
        .from('drug_interactions')
        .select('*, drug_master!drug_interactions_drug_a_id_fkey(generic_name)')
        .eq('kind', 'drug_lactation')
        .in('drug_a_id', drugIds)
        .eq('is_active', true);
      if (error) throw error;
      (data || []).forEach(row => {
        findings.push({
          kind: 'drug_lactation',
          drug: row.drug_master?.generic_name,
          severity: row.severity,
          mechanism: row.mechanism,
          advice: row.advice,
          kb_chunk_id: row.kb_chunk_id,
        });
      });
    }

    // ─── 6. drug-allergy (cross-class) ───
    const allergies = patient_context?.allergies || [];
    if (allergies.length) {
      const { data, error } = await supabase
        .from('drug_interactions')
        .select('*, drug_master!drug_interactions_drug_a_id_fkey(generic_name, drug_class)')
        .eq('kind', 'drug_allergy_class')
        .in('drug_a_id', drugIds)
        .eq('is_active', true);
      if (error) throw error;
      const allergyLowered = allergies.map(a => a.toLowerCase());
      (data || []).forEach(row => {
        const cls = (row.drug_master?.drug_class || '').toLowerCase();
        if (allergyLowered.some(a => cls.includes(a) || a.includes(cls))) {
          findings.push({
            kind: 'drug_allergy_class',
            drug: row.drug_master?.generic_name,
            allergy: cls,
            severity: row.severity,
            mechanism: row.mechanism,
            advice: row.advice,
            kb_chunk_id: row.kb_chunk_id,
          });
        }
      });
    }

    // Sort by severity (worst first)
    const severityRank = {
      contraindicated: 0,
      major: 1,
      moderate: 2,
      minor: 3,
    };
    findings.sort((a, b) =>
      (severityRank[a.severity] ?? 99) - (severityRank[b.severity] ?? 99));

    return {
      findings,
      resolved_drugs: resolved.map(r => ({
        input: r.input,
        generic: r.resolved.generic_name,
        class: r.resolved.drug_class,
      })),
      unresolved_names: drugs.filter(
        d => !resolved.some(r => r.input === d.toLowerCase())
      ),
      _meta: {
        latency_ms: Date.now() - startedAt,
        finding_count: findings.length,
        worst_severity: findings[0]?.severity || null,
      },
    };
  } catch (err) {
    return {
      error: err?.message || String(err),
      findings: [],
      _meta: { latency_ms: Date.now() - startedAt },
    };
  }
}

// Parse age band strings like "<18y", ">=65y", "1-12y", ">2m"
function matchesAgeBand(band, ageYears) {
  if (!band) return false;
  const s = band.toLowerCase().trim();
  // months
  if (s.endsWith('m')) {
    const months = ageYears * 12;
    return matchNumeric(s.slice(0, -1), months);
  }
  if (s.endsWith('y')) {
    return matchNumeric(s.slice(0, -1), ageYears);
  }
  return matchNumeric(s, ageYears);
}

function matchNumeric(s, x) {
  s = s.trim();
  if (s.startsWith('<=')) return x <= parseFloat(s.slice(2));
  if (s.startsWith('>=')) return x >= parseFloat(s.slice(2));
  if (s.startsWith('<'))  return x <  parseFloat(s.slice(1));
  if (s.startsWith('>'))  return x >  parseFloat(s.slice(1));
  if (s.includes('-')) {
    const [lo, hi] = s.split('-').map(parseFloat);
    return x >= lo && x <= hi;
  }
  const eq = parseFloat(s);
  return !Number.isNaN(eq) && Math.abs(x - eq) < 0.001;
}
