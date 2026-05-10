/**
 * Organization + membership helpers.
 *
 * Every authenticated doctor has at minimum a personal solo_doctor org
 * (auto-created on signup via the bootstrap_personal_org() trigger).
 * Clinic mode (Phase 3) lets them join additional orgs.
 *
 * All reads/writes go through Supabase RLS — these functions never
 * include service-role credentials. RLS enforces that you only see
 * orgs you're a member of.
 */
import { supabase, supabaseConfigured } from '../supabaseClient';

/**
 * Returns all active org memberships for the current user, with the
 * organization details joined in.
 *
 *   [{ org_id, role, doctor_registration_number,
 *      organizations: { id, name, type, state, city, ... } }]
 */
export async function getMyOrgs() {
  if (!supabaseConfigured) return [];
  const { data, error } = await supabase
    .from('org_memberships')
    .select('org_id, role, doctor_registration_number, organizations(*)')
    .eq('is_active', true);
  if (error) {
    console.warn('[db.orgs] getMyOrgs failed', error);
    return [];
  }
  return data || [];
}

/**
 * Returns the user's "active" org for the current session.
 * Convention: prefer the most recent clinic/hospital membership;
 * fallback to their personal solo_doctor org.
 *
 * Phase 3 will add an explicit org-switcher UI; until then we pick
 * the first clinic-type org the user belongs to, or the first
 * membership of any kind.
 */
export async function getActiveOrg() {
  const memberships = await getMyOrgs();
  if (memberships.length === 0) return null;

  // Prefer non-solo orgs first
  const clinic = memberships.find(m => m.organizations?.type !== 'solo_doctor');
  return (clinic || memberships[0]).organizations || null;
}

/**
 * Update an org owner's profile (name, state, city, daily AI cost cap).
 * RLS allows only org_owner.
 */
export async function updateOrg(orgId, patch) {
  if (!supabaseConfigured) throw new Error('Supabase not configured');
  const { data, error } = await supabase
    .from('organizations')
    .update(patch)
    .eq('id', orgId)
    .select()
    .single();
  if (error) throw error;
  return data;
}
