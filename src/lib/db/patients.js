/**
 * Patient longitudinal record helpers.
 *
 * Patients are scoped per-org and uniquely identified by phone in E.164
 * format. The "look up by phone, create-if-new" flow is the entry point
 * for every consult in Phase 1+.
 */
import { supabase, supabaseConfigured } from '../supabaseClient';

const E164_RX = /^\+\d{10,15}$/;

export function normalisePhone(input, defaultCountryCode = '91') {
  if (!input) return null;
  const digits = String(input).replace(/\D/g, '');
  if (!digits) return null;
  if (input.startsWith('+')) {
    const e164 = '+' + digits;
    return E164_RX.test(e164) ? e164 : null;
  }
  // Assume Indian mobile by default (10 digits)
  if (digits.length === 10) return `+${defaultCountryCode}${digits}`;
  if (digits.length > 10) return `+${digits}`;
  return null;
}

/**
 * Find an existing patient in the current org by phone, or null.
 */
export async function findPatientByPhone(orgId, phoneE164) {
  if (!supabaseConfigured) return null;
  const phone = normalisePhone(phoneE164);
  if (!phone || !orgId) return null;
  const { data, error } = await supabase
    .from('patients')
    .select('*')
    .eq('org_id', orgId)
    .eq('phone_e164', phone)
    .maybeSingle();
  if (error) {
    console.warn('[db.patients] findPatientByPhone failed', error);
    return null;
  }
  return data;
}

/**
 * Get-or-create a patient. Returns the patient row.
 * Required: orgId, phone (E.164 or 10-digit Indian).
 * Optional: name, age, gender, comorbidities, allergies.
 */
export async function getOrCreatePatient(orgId, { phone, name, age, gender, comorbidities, allergies }) {
  const phoneE164 = normalisePhone(phone);
  if (!phoneE164) throw new Error('Invalid phone (must be 10-digit Indian or E.164)');

  const existing = await findPatientByPhone(orgId, phoneE164);
  if (existing) return existing;

  const { data, error } = await supabase
    .from('patients')
    .insert({
      org_id: orgId,
      phone_e164: phoneE164,
      name: name || null,
      age: age ?? null,
      gender: gender || null,
      comorbidities: comorbidities || null,
      allergies: allergies || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Update a patient's denormalized fields (age, comorbidities, allergies)
 * after they're refined during a consult.
 */
export async function updatePatient(patientId, patch) {
  if (!supabaseConfigured) throw new Error('Supabase not configured');
  const { data, error } = await supabase
    .from('patients')
    .update(patch)
    .eq('id', patientId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Returns the patient timeline — last N consultations chronologically.
 * Each row is summary metadata; full state lives in consultation_events.
 */
export async function getPatientTimeline(patientId, limit = 10) {
  if (!supabaseConfigured) return [];
  const { data, error } = await supabase
    .from('consultations')
    .select(`
      id, started_at, ended_at, modality, chief_complaint,
      primary_diagnosis_icd10, primary_diagnosis_name, certainty_pct,
      doctor_id, kb_version
    `)
    .eq('patient_id', patientId)
    .order('started_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.warn('[db.patients] getPatientTimeline failed', error);
    return [];
  }
  return data || [];
}
