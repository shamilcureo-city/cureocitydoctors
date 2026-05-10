// Deterministic risk-score calculators.
//
// Class A in the tool boundary — the agent NEVER computes these itself.
// All scoring is pure JS, unit-testable, and traceable.
//
// Each calculator:
//   - validates inputs strictly (returns { error } if invalid)
//   - returns { score, components, mortality_risk, recommendation }
//   - is unit-tested in __tests__/calcRiskScore.test.js
//
// New scores must be added with a citation in metadata and a unit test
// covering edge boundaries.

const SCORES = {
  curb65: {
    cite_kb: 'guideline:nice-cap-2014',
    compute({ confusion, bun_mmol_l, rr, sbp, dbp, age_years }) {
      const components = {
        confusion: confusion ? 1 : 0,
        urea: bun_mmol_l > 7 ? 1 : 0,            // > 7 mmol/L (~> 19 mg/dL)
        rr: rr >= 30 ? 1 : 0,
        bp: (sbp < 90 || dbp <= 60) ? 1 : 0,
        age: age_years >= 65 ? 1 : 0,
      };
      const score = Object.values(components).reduce((a, b) => a + b, 0);
      const mortality_risk =
        score >= 4 ? 'very high (>20%)' :
        score === 3 ? 'high (~14%)' :
        score === 2 ? 'moderate (~6%)' :
        score === 1 ? 'low (~3%)' :
                      'minimal (<1%)';
      const recommendation =
        score >= 4 ? 'Consider ICU admission' :
        score === 3 ? 'Hospital admission, consider ICU' :
        score === 2 ? 'Short hospital stay or supervised outpatient' :
                      'Outpatient management possible';
      return { score, components, mortality_risk, recommendation };
    },
    required: ['confusion', 'bun_mmol_l', 'rr', 'sbp', 'dbp', 'age_years'],
  },

  news2: {
    cite_kb: 'guideline:rcp-news2-2017',
    compute({ rr, spo2, on_oxygen, sbp, hr, consciousness, temp_c, scale_2 }) {
      // NEWS2 with optional Scale 2 SpO2 (for hypercapnic resp failure)
      const rrScore =
        rr <= 8 ? 3 :
        rr >= 25 ? 3 :
        rr >= 21 ? 2 :
        rr >= 12 ? 0 :
                   1;
      const spo2Scale1 =
        spo2 <= 91 ? 3 :
        spo2 <= 93 ? 2 :
        spo2 <= 95 ? 1 :
                     0;
      const spo2Scale2 = scale_2
        ? (spo2 <= 83 ? 3
          : spo2 <= 85 ? 2
          : spo2 <= 87 ? 1
          : (spo2 >= 88 && spo2 <= 92) ? 0
          : on_oxygen ? (spo2 >= 97 ? 3 : spo2 >= 95 ? 2 : 1) : 0)
        : null;
      const spo2Score = scale_2 ? spo2Scale2 : spo2Scale1;
      const o2Score = on_oxygen ? 2 : 0;
      const sbpScore =
        sbp <= 90 ? 3 :
        sbp <= 100 ? 2 :
        sbp <= 110 ? 1 :
        sbp >= 220 ? 3 :
                     0;
      const hrScore =
        hr <= 40 ? 3 :
        hr >= 131 ? 3 :
        hr >= 111 ? 2 :
        hr >= 91 ? 1 :
        hr >= 51 ? 0 :
                   1;
      const consScore = consciousness && consciousness !== 'A' ? 3 : 0;
      const tempScore =
        temp_c <= 35 ? 3 :
        temp_c >= 39.1 ? 2 :
        temp_c >= 38.1 ? 1 :
        temp_c <= 36 ? 1 :
                        0;
      const components = {
        rr: rrScore, spo2: spo2Score, o2: o2Score, sbp: sbpScore,
        hr: hrScore, consciousness: consScore, temp: tempScore,
      };
      const score = Object.values(components).reduce((a, b) => a + b, 0);
      const single_param_max = Math.max(...Object.values(components));
      const mortality_risk =
        score >= 7 ? 'high — emergency response, continuous monitoring' :
        score >= 5 ? 'medium — urgent response, frequent monitoring' :
        single_param_max >= 3 ? 'low-medium — single-parameter trigger' :
        score >= 1 ? 'low — routine monitoring, increased frequency' :
                      'minimal';
      const recommendation =
        score >= 7 ? 'Continuous monitoring, escalate to senior immediately' :
        score >= 5 ? 'Urgent senior review within 1 hour' :
        single_param_max >= 3 ? 'Urgent ward-based response' :
        score >= 1 ? '4–6 hourly observations' :
                      '12-hourly observations sufficient';
      return { score, components, single_param_max, mortality_risk, recommendation };
    },
    required: ['rr', 'spo2', 'on_oxygen', 'sbp', 'hr', 'consciousness', 'temp_c'],
  },

  wells_pe: {
    cite_kb: 'guideline:wells-pe-2000',
    compute(p) {
      const components = {
        clinical_dvt:        p.clinical_dvt        ? 3.0 : 0,
        pe_most_likely:      p.pe_most_likely      ? 3.0 : 0,
        hr_over_100:         p.hr_over_100         ? 1.5 : 0,
        immobilisation:      p.immobilisation      ? 1.5 : 0,
        previous_pe_dvt:     p.previous_pe_dvt     ? 1.5 : 0,
        haemoptysis:         p.haemoptysis         ? 1.0 : 0,
        active_malignancy:   p.active_malignancy   ? 1.0 : 0,
      };
      const score = Object.values(components).reduce((a, b) => a + b, 0);
      const category =
        score > 6   ? 'high'      :
        score >= 2  ? 'moderate'  :
                      'low';
      const recommendation =
        category === 'high'     ? 'CTPA; consider empiric anticoagulation while awaiting' :
        category === 'moderate' ? 'D-dimer; if positive proceed to CTPA' :
                                   'D-dimer; if negative PE excluded';
      return { score, components, category, recommendation };
    },
    required: ['clinical_dvt', 'pe_most_likely', 'hr_over_100', 'immobilisation',
               'previous_pe_dvt', 'haemoptysis', 'active_malignancy'],
  },

  wells_dvt: {
    cite_kb: 'guideline:wells-dvt-2003',
    compute(p) {
      const components = {
        active_cancer:                p.active_cancer                ? 1 : 0,
        paralysis_paresis_immobilisation: p.paralysis_paresis_immobilisation ? 1 : 0,
        bedridden_3d_or_surgery_12wk: p.bedridden_3d_or_surgery_12wk ? 1 : 0,
        local_tenderness:             p.local_tenderness             ? 1 : 0,
        entire_leg_swollen:           p.entire_leg_swollen           ? 1 : 0,
        calf_swelling_3cm:            p.calf_swelling_3cm            ? 1 : 0,
        pitting_oedema:               p.pitting_oedema               ? 1 : 0,
        collateral_superficial_veins: p.collateral_superficial_veins ? 1 : 0,
        previous_dvt:                 p.previous_dvt                 ? 1 : 0,
        alternative_dx_likely:        p.alternative_dx_likely        ? -2 : 0,
      };
      const score = Object.values(components).reduce((a, b) => a + b, 0);
      const category = score >= 2 ? 'likely' : 'unlikely';
      const recommendation =
        category === 'likely'
          ? 'Compression USS; if negative repeat in 1 week or D-dimer'
          : 'D-dimer; if negative DVT excluded';
      return { score, components, category, recommendation };
    },
    required: ['active_cancer', 'paralysis_paresis_immobilisation',
               'bedridden_3d_or_surgery_12wk', 'local_tenderness',
               'entire_leg_swollen', 'calf_swelling_3cm', 'pitting_oedema',
               'collateral_superficial_veins', 'previous_dvt',
               'alternative_dx_likely'],
  },

  centor: {
    cite_kb: 'guideline:centor-mcisaac-1998',
    compute({ age_years, tonsillar_exudate, tender_anterior_nodes, fever, no_cough }) {
      const ageMod = age_years < 15 ? 1 : age_years >= 45 ? -1 : 0;
      const components = {
        age:                  ageMod,
        tonsillar_exudate:    tonsillar_exudate    ? 1 : 0,
        tender_anterior_nodes: tender_anterior_nodes ? 1 : 0,
        fever:                fever                ? 1 : 0,
        no_cough:             no_cough             ? 1 : 0,
      };
      const score = Object.values(components).reduce((a, b) => a + b, 0);
      const recommendation =
        score >= 4 ? 'Empiric antibiotics or RADT' :
        score === 3 ? 'RADT; antibiotics if positive' :
        score === 2 ? 'RADT; antibiotics only if positive' :
                      'No testing or antibiotics';
      return { score, components, recommendation };
    },
    required: ['age_years', 'tonsillar_exudate', 'tender_anterior_nodes', 'fever', 'no_cough'],
  },

  has_bled: {
    cite_kb: 'guideline:has-bled-2010',
    compute(p) {
      const components = {
        hypertension:                  p.hypertension                  ? 1 : 0,
        abnormal_renal:                p.abnormal_renal                ? 1 : 0,
        abnormal_liver:                p.abnormal_liver                ? 1 : 0,
        stroke_history:                p.stroke_history                ? 1 : 0,
        bleeding_history_predisposition: p.bleeding_history_predisposition ? 1 : 0,
        labile_inr:                    p.labile_inr                    ? 1 : 0,
        elderly_over_65:               p.elderly_over_65               ? 1 : 0,
        drugs_predisposing_to_bleed:   p.drugs_predisposing_to_bleed   ? 1 : 0,
        alcohol_excess:                p.alcohol_excess                ? 1 : 0,
      };
      const score = Object.values(components).reduce((a, b) => a + b, 0);
      const category = score >= 3 ? 'high' : 'low-moderate';
      const recommendation =
        score >= 3
          ? 'High bleeding risk; review modifiable factors before anticoagulating'
          : 'Acceptable bleeding risk; standard anticoagulation if indicated';
      return { score, components, category, recommendation };
    },
    required: ['hypertension', 'abnormal_renal', 'abnormal_liver',
               'stroke_history', 'bleeding_history_predisposition',
               'labile_inr', 'elderly_over_65',
               'drugs_predisposing_to_bleed', 'alcohol_excess'],
  },

  chads_vasc: {
    cite_kb: 'guideline:chadsvasc-2010',
    compute(p) {
      const components = {
        chf:                 p.chf                 ? 1 : 0,
        hypertension:        p.hypertension        ? 1 : 0,
        age_75_or_more:      p.age_75_or_more      ? 2 : 0,
        diabetes:            p.diabetes            ? 1 : 0,
        stroke_or_tia:       p.stroke_or_tia       ? 2 : 0,
        vascular_disease:    p.vascular_disease    ? 1 : 0,
        age_65_to_74:        (!p.age_75_or_more && p.age_65_to_74) ? 1 : 0,
        female:              p.sex === 'F'         ? 1 : 0,
      };
      const score = Object.values(components).reduce((a, b) => a + b, 0);
      const recommendation =
        score >= 2 ? 'Anticoagulation recommended' :
        score === 1 ? 'Consider anticoagulation (non-female-sex point)' :
                      'No anticoagulation indicated';
      return { score, components, recommendation };
    },
    required: ['chf', 'hypertension', 'age_75_or_more', 'diabetes',
               'stroke_or_tia', 'vascular_disease', 'age_65_to_74', 'sex'],
  },

  perc: {
    cite_kb: 'guideline:perc-2008',
    compute(p) {
      // PERC rule-out: ALL must be negative to rule out PE in low-pretest pts
      const components = {
        age_under_50:        p.age_years < 50,
        hr_under_100:        p.hr < 100,
        spo2_at_least_95:    p.spo2 >= 95,
        no_unilateral_swelling: !p.unilateral_swelling,
        no_haemoptysis:      !p.haemoptysis,
        no_recent_surg_trauma: !p.recent_surg_trauma_4wk,
        no_prior_dvt_pe:     !p.prior_dvt_pe,
        no_estrogen_use:     !p.estrogen_use,
      };
      const allNegative = Object.values(components).every(Boolean);
      return {
        components,
        rules_out_pe: allNegative,
        recommendation: allNegative
          ? 'PERC negative — PE clinically ruled out in low-pretest patients'
          : 'PERC positive — proceed to D-dimer or imaging based on Wells',
      };
    },
    required: ['age_years', 'hr', 'spo2', 'unilateral_swelling',
               'haemoptysis', 'recent_surg_trauma_4wk',
               'prior_dvt_pe', 'estrogen_use'],
  },

  // GRACE is a multivariate logistic; full coefficient table omitted in
  // scaffold. Implemented in Sprint 2.
  grace: {
    cite_kb: 'guideline:grace-2014',
    compute() {
      return { error: 'not_implemented_in_scaffold' };
    },
    required: [],
  },

  ottawa_ankle: {
    cite_kb: 'guideline:ottawa-ankle-1992',
    compute({ malleolar_pain, midfoot_pain, bone_tenderness_lateral, bone_tenderness_medial,
              bone_tenderness_navicular, bone_tenderness_5th_mt,
              unable_to_bear_weight }) {
      const ankle_xray =
        malleolar_pain &&
        (bone_tenderness_lateral || bone_tenderness_medial || unable_to_bear_weight);
      const foot_xray =
        midfoot_pain &&
        (bone_tenderness_navicular || bone_tenderness_5th_mt || unable_to_bear_weight);
      return {
        ankle_xray_indicated: !!ankle_xray,
        foot_xray_indicated:  !!foot_xray,
        recommendation:
          ankle_xray && foot_xray ? 'Both ankle AND foot X-ray indicated' :
          ankle_xray              ? 'Ankle X-ray indicated' :
          foot_xray               ? 'Foot X-ray indicated' :
                                    'No X-ray indicated by Ottawa rules',
      };
    },
    required: ['malleolar_pain', 'midfoot_pain', 'bone_tenderness_lateral',
               'bone_tenderness_medial', 'bone_tenderness_navicular',
               'bone_tenderness_5th_mt', 'unable_to_bear_weight'],
  },
};

export function calcRiskScore({ score_type, params }) {
  const scorer = SCORES[score_type];
  if (!scorer) {
    return { error: `unknown_score_type:${score_type}`, available: Object.keys(SCORES) };
  }
  const missing = scorer.required.filter(k => params?.[k] === undefined || params?.[k] === null);
  if (missing.length) {
    return { error: 'missing_params', missing, score_type };
  }
  try {
    const result = scorer.compute(params);
    return {
      score_type,
      kb_cite: scorer.cite_kb,
      ...result,
    };
  } catch (err) {
    return { error: 'compute_failed', message: err?.message || String(err), score_type };
  }
}

export const SUPPORTED_SCORES = Object.keys(SCORES);
