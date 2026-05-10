/**
 * Consultation lifecycle helpers.
 *
 * A consultation is opened when the doctor starts a consult, gathers
 * events as it runs (audio chunks, AI calls, doctor edits), and is
 * finalized with a primary diagnosis + Rx. The engine snapshot is
 * persisted so the consult can be reopened or replayed for audit.
 */
import { supabase, supabaseConfigured } from '../supabaseClient';

/**
 * Open a new consultation. Returns the consultation row.
 *
 * Required: orgId, patientId, doctorId, kbVersion.
 * Optional: modality (defaults to 'in_person'), chiefComplaint, consentRecordId.
 */
export async function openConsultation({
  orgId,
  patientId,
  doctorId,
  kbVersion,
  modality = 'in_person',
  chiefComplaint = null,
  consentRecordId = null,
  audioRetentionConsented = false,
}) {
  if (!supabaseConfigured) throw new Error('Supabase not configured');
  if (!orgId || !patientId || !doctorId || !kbVersion) {
    throw new Error('orgId, patientId, doctorId, kbVersion required');
  }
  const { data, error } = await supabase
    .from('consultations')
    .insert({
      org_id: orgId,
      patient_id: patientId,
      doctor_id: doctorId,
      modality,
      started_at: new Date().toISOString(),
      chief_complaint: chiefComplaint,
      kb_version: kbVersion,
      consent_record_id: consentRecordId,
      audio_retention_consented: audioRetentionConsented,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Append an event to a consultation. Cheap; called every audio chunk
 * and every AI call. Sequence is the per-consult monotonic ordinal.
 */
export async function appendConsultationEvent({
  consultationId,
  eventType,
  sequence,
  payload,
  modelVersion,
  latencyMs,
}) {
  if (!supabaseConfigured) return;
  try {
    await supabase.from('consultation_events').insert({
      consultation_id: consultationId,
      event_type: eventType,
      sequence: sequence ?? null,
      payload: payload || {},
      model_version: modelVersion ?? null,
      latency_ms: latencyMs ?? null,
    });
  } catch (err) {
    // Telemetry failures must never block the consult.
    console.warn('[db.consultations] appendConsultationEvent failed', err);
  }
}

/**
 * Finalize a consultation — sets ended_at, primary diagnosis, and saves
 * the engine snapshot for audit/replay.
 */
export async function finalizeConsultation(consultationId, {
  primaryDiagnosisIcd10,
  primaryDiagnosisName,
  certaintyPct,
  engineSnapshot,
}) {
  if (!supabaseConfigured) throw new Error('Supabase not configured');
  const { data, error } = await supabase
    .from('consultations')
    .update({
      ended_at: new Date().toISOString(),
      primary_diagnosis_icd10: primaryDiagnosisIcd10 ?? null,
      primary_diagnosis_name: primaryDiagnosisName ?? null,
      certainty_pct: certaintyPct ?? null,
      engine_snapshot: engineSnapshot || null,
    })
    .eq('id', consultationId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Read a single consultation by id (RLS scopes by org membership).
 */
export async function getConsultation(consultationId) {
  if (!supabaseConfigured) return null;
  const { data, error } = await supabase
    .from('consultations')
    .select('*')
    .eq('id', consultationId)
    .maybeSingle();
  if (error) {
    console.warn('[db.consultations] getConsultation failed', error);
    return null;
  }
  return data;
}
