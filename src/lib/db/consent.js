/**
 * DPDP / TPG patient consent records.
 *
 * Every consult that uses AI assistance must capture an explicit consent
 * record. The patient may opt in/out separately for:
 *   - the consult itself (mandatory yes for any record-keeping)
 *   - AI-assist (Gemini / Claude usage)
 *   - audio retention (default no — audio is processed and discarded)
 *   - WhatsApp delivery of Rx (default no)
 *
 * Withdrawal is captured by setting withdrawn_at; the record is never
 * deleted (medical-records retention applies).
 */
import { supabase, supabaseConfigured } from '../supabaseClient';

export async function recordConsent({
  patientId,
  consultConsent,
  aiAssistConsent,
  audioRetentionConsent = false,
  whatsappDeliveryConsent = false,
}) {
  if (!supabaseConfigured) throw new Error('Supabase not configured');
  if (!patientId) throw new Error('patientId required');

  const { data, error } = await supabase
    .from('consent_records')
    .insert({
      patient_id: patientId,
      consult_consent: !!consultConsent,
      ai_assist_consent: !!aiAssistConsent,
      audio_retention_consent: !!audioRetentionConsent,
      whatsapp_delivery_consent: !!whatsappDeliveryConsent,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function withdrawConsent(consentRecordId) {
  if (!supabaseConfigured) throw new Error('Supabase not configured');
  const { data, error } = await supabase
    .from('consent_records')
    .update({ withdrawn_at: new Date().toISOString() })
    .eq('id', consentRecordId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getConsentHistoryForPatient(patientId) {
  if (!supabaseConfigured) return [];
  const { data, error } = await supabase
    .from('consent_records')
    .select('*')
    .eq('patient_id', patientId)
    .order('consented_at', { ascending: false });
  if (error) {
    console.warn('[db.consent] getConsentHistoryForPatient failed', error);
    return [];
  }
  return data || [];
}
