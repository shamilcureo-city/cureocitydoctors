// ──────────────────────────────────────────────────────────────────────────────
// Safety Net Engine – Real-time Clinical Safety Alerts
// ──────────────────────────────────────────────────────────────────────────────

import { db } from '../db/connection.js';
import { checkDrugInteractions, checkAllergyConflicts } from './drug-interactions.js';
import type { Severity } from './drug-interactions.js';

export type SignalLevel = 'green' | 'yellow' | 'red';
export type AlertCategory =
  | 'missed_diagnosis'
  | 'drug_interaction'
  | 'missing_investigation'
  | 'red_flag'
  | 'guideline_adherence';

export interface SafetyAlert {
  signal: SignalLevel;
  category: AlertCategory;
  message: string;
  evidence: Record<string, unknown>;
}

interface ConsultationContext {
  consultationId: string;
  diagnoses: Array<{
    condition_name: string;
    icd10_code?: string;
    tier?: string;
    kbe_score?: number;
  }>;
  prescriptionDrugs: string[];
  labOrders: string[];
  vitals?: {
    bp_systolic?: number;
    bp_diastolic?: number;
    pulse?: number;
    temperature?: number;
    spo2?: number;
  };
  patientAllergies: string[];
  patientComorbidities: string[];
  patientAge?: number;
  kbeRedFlags: string[];
  kbeScoredConditions: Array<{
    name: string;
    tier: string;
    certaintyScore: number;
  }>;
}

/**
 * Run all safety net checks and return alerts.
 */
export async function runSafetyChecks(
  ctx: ConsultationContext,
): Promise<SafetyAlert[]> {
  const alerts: SafetyAlert[] = [];

  alerts.push(...checkDrugInteractionAlerts(ctx));
  alerts.push(...checkAllergyAlerts(ctx));
  alerts.push(...checkMissedDiagnoses(ctx));
  alerts.push(...checkMissingInvestigations(ctx));
  alerts.push(...checkRedFlagAlerts(ctx));
  alerts.push(...checkVitalAlerts(ctx));
  alerts.push(...checkGuidelineAdherence(ctx));

  // If no problems found, emit a green "all clear" signal
  if (alerts.length === 0) {
    alerts.push({
      signal: 'green',
      category: 'guideline_adherence',
      message: 'No safety concerns detected. Clinical workflow appears appropriate.',
      evidence: {},
    });
  }

  return alerts;
}

/**
 * Run safety checks and persist alerts to DB, replacing previous alerts.
 */
export async function runAndPersistSafetyChecks(
  ctx: ConsultationContext,
): Promise<SafetyAlert[]> {
  const alerts = await runSafetyChecks(ctx);

  // Clear old alerts for this consultation
  await db('safety_net_alerts')
    .where({ consultation_id: ctx.consultationId })
    .delete();

  // Insert new alerts
  if (alerts.length > 0) {
    const rows = alerts.map((a) => ({
      consultation_id: ctx.consultationId,
      signal: a.signal,
      category: a.category,
      message: a.message,
      evidence: JSON.stringify(a.evidence),
    }));
    await db('safety_net_alerts').insert(rows);
  }

  return alerts;
}

// ── Drug Interaction Checks ─────────────────────────────────────────────────

function checkDrugInteractionAlerts(ctx: ConsultationContext): SafetyAlert[] {
  if (ctx.prescriptionDrugs.length < 2) return [];

  const interactions = checkDrugInteractions(ctx.prescriptionDrugs);

  return interactions.map((ix) => {
    const signal: SignalLevel = ix.severity === 'major' ? 'red' : ix.severity === 'moderate' ? 'yellow' : 'green';
    return {
      signal,
      category: 'drug_interaction' as AlertCategory,
      message: `${ix.drug1} + ${ix.drug2}: ${ix.description}. ${ix.clinicalEffect}`,
      evidence: { drug1: ix.drug1, drug2: ix.drug2, severity: ix.severity },
    };
  });
}

// ── Allergy Checks ──────────────────────────────────────────────────────────

function checkAllergyAlerts(ctx: ConsultationContext): SafetyAlert[] {
  if (ctx.prescriptionDrugs.length === 0 || ctx.patientAllergies.length === 0) return [];

  const conflicts = checkAllergyConflicts(ctx.prescriptionDrugs, ctx.patientAllergies);

  return conflicts.map((c) => ({
    signal: 'red' as SignalLevel,
    category: 'drug_interaction' as AlertCategory,
    message: `ALLERGY ALERT: ${c.drug} prescribed to patient with known ${c.allergy} allergy`,
    evidence: { drug: c.drug, allergy: c.allergy },
  }));
}

// ── Missed Diagnosis Detection ──────────────────────────────────────────────

function checkMissedDiagnoses(ctx: ConsultationContext): SafetyAlert[] {
  const alerts: SafetyAlert[] = [];
  const confirmedNames = new Set(
    ctx.diagnoses.map((d) => d.condition_name.toLowerCase()),
  );

  // Check KBE high-scoring conditions not captured in diagnoses
  for (const kbeCond of ctx.kbeScoredConditions) {
    if (kbeCond.tier === 't1' && kbeCond.certaintyScore >= 40) {
      if (!confirmedNames.has(kbeCond.name.toLowerCase())) {
        alerts.push({
          signal: 'yellow',
          category: 'missed_diagnosis',
          message: `KBE suggests "${kbeCond.name}" (T1, certainty ${kbeCond.certaintyScore}%) but it is not in the diagnosis list. Consider adding or ruling out.`,
          evidence: { condition: kbeCond.name, tier: kbeCond.tier, certainty: kbeCond.certaintyScore },
        });
      }
    }
  }

  return alerts;
}

// ── Missing Investigation Checks ────────────────────────────────────────────

// Maps diagnosis -> required investigations
const REQUIRED_INVESTIGATIONS: Record<string, string[]> = {
  'dengue fever': ['CBC', 'dengue NS1', 'dengue IgM', 'dengue IgG'],
  'dengue': ['CBC', 'dengue NS1', 'dengue IgM'],
  'leptospirosis': ['CBC', 'RFT', 'LFT', 'leptospira IgM'],
  'scrub typhus': ['CBC', 'LFT', 'Weil-Felix', 'scrub typhus IgM'],
  'typhoid fever': ['CBC', 'blood culture', 'Widal', 'typhoid IgM'],
  'typhoid': ['CBC', 'blood culture', 'Widal'],
  'acute gastroenteritis': ['CBC', 'stool routine'],
  'diabetes mellitus': ['HbA1c', 'FBS', 'PPBS', 'RFT'],
  'hypertension': ['RFT', 'ECG', 'lipid profile'],
  'acute coronary syndrome': ['troponin', 'ECG', 'CBC', 'RFT', 'lipid profile'],
  'pneumonia': ['chest X-ray', 'CBC', 'CRP'],
  'urinary tract infection': ['urine routine', 'urine culture'],
};

function checkMissingInvestigations(ctx: ConsultationContext): SafetyAlert[] {
  const alerts: SafetyAlert[] = [];
  const orderedTests = new Set(ctx.labOrders.map((t) => t.toLowerCase()));

  for (const dx of ctx.diagnoses) {
    const key = dx.condition_name.toLowerCase();
    const required = REQUIRED_INVESTIGATIONS[key];
    if (!required) continue;

    const missing = required.filter(
      (test) => !orderedTests.has(test.toLowerCase()),
    );
    if (missing.length > 0) {
      alerts.push({
        signal: 'yellow',
        category: 'missing_investigation',
        message: `For "${dx.condition_name}": consider ordering ${missing.join(', ')}`,
        evidence: { diagnosis: dx.condition_name, missingTests: missing },
      });
    }
  }

  return alerts;
}

// ── Red Flag Alerts ─────────────────────────────────────────────────────────

function checkRedFlagAlerts(ctx: ConsultationContext): SafetyAlert[] {
  return ctx.kbeRedFlags.map((flag) => ({
    signal: 'red' as SignalLevel,
    category: 'red_flag' as AlertCategory,
    message: `RED FLAG: ${flag} — requires immediate clinical attention`,
    evidence: { redFlag: flag },
  }));
}

// ── Vital Sign Alerts ───────────────────────────────────────────────────────

function checkVitalAlerts(ctx: ConsultationContext): SafetyAlert[] {
  const alerts: SafetyAlert[] = [];
  const v = ctx.vitals;
  if (!v) return alerts;

  if (v.bp_systolic !== undefined) {
    if (v.bp_systolic >= 180 || (v.bp_diastolic !== undefined && v.bp_diastolic >= 120)) {
      alerts.push({
        signal: 'red',
        category: 'red_flag',
        message: `Hypertensive crisis: BP ${v.bp_systolic}/${v.bp_diastolic} mmHg. Evaluate for end-organ damage.`,
        evidence: { bpSystolic: v.bp_systolic, bpDiastolic: v.bp_diastolic },
      });
    } else if (v.bp_systolic < 90) {
      alerts.push({
        signal: 'red',
        category: 'red_flag',
        message: `Hypotension: systolic BP ${v.bp_systolic} mmHg. Assess for shock, dehydration.`,
        evidence: { bpSystolic: v.bp_systolic },
      });
    }
  }

  if (v.spo2 !== undefined && v.spo2 < 92) {
    alerts.push({
      signal: 'red',
      category: 'red_flag',
      message: `Low SpO2: ${v.spo2}%. Consider supplemental oxygen, chest X-ray.`,
      evidence: { spo2: v.spo2 },
    });
  }

  if (v.pulse !== undefined) {
    if (v.pulse > 120) {
      alerts.push({
        signal: 'yellow',
        category: 'red_flag',
        message: `Tachycardia: pulse ${v.pulse} bpm. Evaluate for fever, dehydration, arrhythmia.`,
        evidence: { pulse: v.pulse },
      });
    }
    if (v.pulse < 50) {
      alerts.push({
        signal: 'yellow',
        category: 'red_flag',
        message: `Bradycardia: pulse ${v.pulse} bpm. Check medications (beta-blockers), ECG.`,
        evidence: { pulse: v.pulse },
      });
    }
  }

  if (v.temperature !== undefined && v.temperature >= 104) {
    alerts.push({
      signal: 'red',
      category: 'red_flag',
      message: `High fever: ${v.temperature}°F. Risk of febrile seizures (pediatric), consider aggressive cooling.`,
      evidence: { temperature: v.temperature },
    });
  }

  return alerts;
}

// ── Guideline Adherence ─────────────────────────────────────────────────────

function checkGuidelineAdherence(ctx: ConsultationContext): SafetyAlert[] {
  const alerts: SafetyAlert[] = [];
  const drugLower = ctx.prescriptionDrugs.map((d) => d.toLowerCase());
  const dxLower = ctx.diagnoses.map((d) => d.condition_name.toLowerCase());

  // Steroid without PPI cover check
  const steroids = ['prednisolone', 'prednisone', 'dexamethasone', 'methylprednisolone', 'hydrocortisone'];
  const ppis = ['omeprazole', 'pantoprazole', 'rabeprazole', 'esomeprazole', 'lansoprazole'];
  const hasSteroid = drugLower.some((d) => steroids.some((s) => d.includes(s)));
  const hasPPI = drugLower.some((d) => ppis.some((p) => d.includes(p)));
  if (hasSteroid && !hasPPI) {
    alerts.push({
      signal: 'yellow',
      category: 'guideline_adherence',
      message: 'Steroid prescribed without PPI cover. Consider adding a proton pump inhibitor for GI protection.',
      evidence: { guideline: 'steroid-ppi-cover' },
    });
  }

  // NSAID in renal disease
  const nsaids = ['ibuprofen', 'diclofenac', 'naproxen', 'piroxicam', 'aceclofenac', 'etoricoxib', 'nimesulide', 'ketorolac'];
  const hasNSAID = drugLower.some((d) => nsaids.some((n) => d.includes(n)));
  const hasCKD = ctx.patientComorbidities.some((c) =>
    c.toLowerCase().includes('ckd') || c.toLowerCase().includes('renal') || c.toLowerCase().includes('kidney'),
  );
  if (hasNSAID && hasCKD) {
    alerts.push({
      signal: 'red',
      category: 'guideline_adherence',
      message: 'NSAID prescribed to patient with renal disease. NSAIDs are contraindicated in CKD. Use paracetamol.',
      evidence: { guideline: 'nsaid-ckd-contraindication' },
    });
  }

  // Dengue + NSAID warning
  const hasDengue = dxLower.some((d) => d.includes('dengue'));
  if (hasDengue && hasNSAID) {
    alerts.push({
      signal: 'red',
      category: 'guideline_adherence',
      message: 'NSAID prescribed in suspected dengue. NSAIDs increase bleeding risk in dengue. Use paracetamol only.',
      evidence: { guideline: 'dengue-nsaid-contraindication' },
    });
  }

  // Antibiotic without culture in febrile illness > 5 days
  const hasAntibiotic = drugLower.some((d) =>
    ['amoxicillin', 'azithromycin', 'ciprofloxacin', 'levofloxacin', 'ceftriaxone',
     'cefixime', 'doxycycline', 'metronidazole', 'augmentin', 'amoxyclav'].some((a) => d.includes(a)),
  );
  const hasCulture = ctx.labOrders.some((t) => t.toLowerCase().includes('culture'));
  if (hasAntibiotic && !hasCulture && dxLower.some((d) =>
    d.includes('fever') || d.includes('typhoid') || d.includes('leptospirosis'),
  )) {
    alerts.push({
      signal: 'yellow',
      category: 'guideline_adherence',
      message: 'Antibiotic prescribed for febrile illness without blood/urine culture. Consider ordering cultures before starting antibiotics.',
      evidence: { guideline: 'culture-before-antibiotics' },
    });
  }

  return alerts;
}
