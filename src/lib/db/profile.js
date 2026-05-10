/**
 * Doctor profile + per-org membership profile helpers.
 *
 * The doctors table holds personal info (display_name, specialty, state,
 * phone). The org_memberships table holds the per-org doctor registration
 * number (MCI / SMC reg #) — required by TPG 2020 on every prescription.
 *
 * Two separate tables because a doctor can be registered with different
 * state councils when working at multi-state clinics, but their personal
 * details are global.
 */
import { supabase, supabaseConfigured } from '../supabaseClient';

export async function getMyDoctorProfile() {
  if (!supabaseConfigured) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from('doctors')
    .select('id, display_name, hpr_id, phone, email, state, specialty, updated_at')
    .eq('id', user.id)
    .maybeSingle();
  if (error) {
    console.warn('[db.profile] getMyDoctorProfile failed', error);
    return null;
  }
  return data;
}

export async function updateMyDoctorProfile(patch) {
  if (!supabaseConfigured) throw new Error('Supabase not configured');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not authenticated');
  const allowed = ['display_name', 'phone', 'state', 'specialty', 'hpr_id'];
  const clean = {};
  for (const k of allowed) if (patch[k] !== undefined) clean[k] = patch[k] || null;
  const { data, error } = await supabase
    .from('doctors')
    .update(clean)
    .eq('id', user.id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Update the doctor's MCI/SMC registration number FOR a specific org.
 * Reg numbers can vary per state when a doctor practices across orgs.
 */
export async function setMyRegistrationNumber(orgId, registrationNumber) {
  if (!supabaseConfigured) throw new Error('Supabase not configured');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not authenticated');
  const { data, error } = await supabase
    .from('org_memberships')
    .update({ doctor_registration_number: registrationNumber || null })
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getMyRegistrationNumber(orgId) {
  if (!supabaseConfigured) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !orgId) return null;
  const { data, error } = await supabase
    .from('org_memberships')
    .select('doctor_registration_number')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) return null;
  return data?.doctor_registration_number || null;
}
