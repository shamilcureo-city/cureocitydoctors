/**
 * Prescription persistence.
 *
 * When the doctor finalizes Step 7, the printable Rx is also saved to
 * the prescriptions table — separate from the consultation_events log
 * because pharmacies, patients, and analytics need to query Rx
 * directly (e.g., "today's most-prescribed drug across the clinic").
 *
 * The drugs JSONB column contains an array of:
 *   { generic, brand_india, dose, route, freq, duration, timing_grid,
 *     risk, notes, cost_inr_month, jan_aushadhi }
 */
import { supabase, supabaseConfigured } from '../supabaseClient';
import { reportError } from '../errorReporting';

/**
 * Generate a human-readable Rx number scoped to today.
 * Format: CX-YYYYMMDD-XXXX (4-char random suffix). Unique enforced by
 * the prescriptions.rx_number UNIQUE constraint; on conflict the caller
 * should retry.
 */
export function generateRxNumber() {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `CX-${yyyy}${mm}${dd}-${rand}`;
}

export async function savePrescription({
  consultationId,
  orgId,
  patientId,
  doctorId,
  drugs,
  advice,
  followUpDays,
}) {
  if (!supabaseConfigured) throw new Error('Supabase not configured');
  if (!consultationId || !orgId || !patientId || !doctorId) {
    throw new Error('consultationId, orgId, patientId, doctorId required');
  }
  if (!Array.isArray(drugs) || drugs.length === 0) {
    throw new Error('At least one drug required to save a prescription');
  }

  const rxNumber = generateRxNumber();
  try {
    const { data, error } = await supabase
      .from('prescriptions')
      .insert({
        consultation_id: consultationId,
        org_id: orgId,
        patient_id: patientId,
        doctor_id: doctorId,
        rx_number: rxNumber,
        drugs,
        advice: advice || null,
        follow_up_days: followUpDays ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  } catch (err) {
    reportError(err, { consultationId }, { tags: { area: 'db.prescriptions', op: 'save' } });
    throw err;
  }
}

export async function markPrescriptionDelivered(rxId, channel) {
  if (!supabaseConfigured) throw new Error('Supabase not configured');
  const valid = new Set(['whatsapp', 'print', 'sms', 'abdm']);
  if (!valid.has(channel)) throw new Error(`invalid channel: ${channel}`);
  const { data, error } = await supabase
    .from('prescriptions')
    .update({
      delivered_via: [channel],
      delivered_at: new Date().toISOString(),
    })
    .eq('id', rxId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function saveReferral({
  consultationId,
  orgId,
  patientId,
  specialistType,
  isUrgent,
  letterText,
}) {
  if (!supabaseConfigured) throw new Error('Supabase not configured');
  if (!consultationId || !orgId || !patientId) {
    throw new Error('consultationId, orgId, patientId required');
  }
  try {
    const { data, error } = await supabase
      .from('referrals')
      .insert({
        consultation_id: consultationId,
        org_id: orgId,
        patient_id: patientId,
        specialist_type: specialistType || null,
        is_urgent: !!isUrgent,
        letter_text: letterText,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  } catch (err) {
    reportError(err, { consultationId }, { tags: { area: 'db.referrals', op: 'save' } });
    throw err;
  }
}
