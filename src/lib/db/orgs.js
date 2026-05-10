/**
 * Organization + membership helpers.
 *
 * Every authenticated doctor has at minimum a personal solo_doctor org.
 * Normally this is created by the `bootstrap_personal_org()` trigger
 * (migration 0002), which fires on INSERT into `doctors`, which itself
 * fires from the `handle_new_user()` trigger on auth.users INSERT.
 *
 * BUT — users who signed up before migration 0001 (or before the
 * triggers existed) may be missing one or both of those rows. The
 * 0002 backfill catches the doctors→org gap, but if the doctors row
 * itself is missing (no handle_new_user fired for them), they fall
 * through and `getActiveOrg()` returns null, which leaves the UI
 * stuck on "Waiting for organization context to load".
 *
 * The fix: client-side self-healing. `ensureUserBootstrapped()`
 * idempotently creates the doctors row + a personal solo_doctor org
 * + an org_owner membership, using only RLS-allowed inserts (the
 * doctors_self_insert / organizations_self_insert /
 * org_memberships_self_insert policies all permit the user to write
 * their own rows). Called automatically inside `getActiveOrg()` if
 * no membership is found. After bootstrap, future loads see the
 * normal happy path.
 *
 * All reads/writes go through Supabase RLS — these functions never
 * include service-role credentials.
 */
import { supabase, supabaseConfigured } from '../supabaseClient';

/**
 * Idempotent client-side bootstrap.
 *
 * Ensures the current authenticated user has:
 *   1. A row in public.doctors (links auth.uid() → display name + reg #)
 *   2. A personal solo_doctor org
 *   3. An org_owner membership in that org
 *
 * Safe to call any number of times — each insert is gated by an
 * existence check against RLS-visible rows. Returns the personal
 * org row if bootstrapped or already-present, or null if anything
 * goes wrong (RLS denial, network failure). Never throws — callers
 * treat null as "no org context, show the spinner".
 */
export async function ensureUserBootstrapped() {
  if (!supabaseConfigured) return null;

  // 1. Need an authenticated user
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) return null;

  // 2. Ensure doctors row exists. Self-insert is allowed by the
  //    doctors_self_insert policy (auth.uid() = id).
  try {
    await supabase.from('doctors').upsert({
      id: user.id,
      email: user.email || null,
      phone: user.phone || null,
    }, { onConflict: 'id', ignoreDuplicates: true });
  } catch (e) {
    // Non-fatal — the doctors row may already be there with content
    // we shouldn't clobber. Continue to the org check.
    console.warn('[db.orgs] doctors upsert (non-fatal):', e);
  }

  // 3. Already a member of an org? Nothing to do.
  const { data: existing, error: exErr } = await supabase
    .from('org_memberships')
    .select('org_id, organizations(*)')
    .eq('is_active', true)
    .limit(1);
  if (!exErr && existing && existing.length > 0) {
    return existing[0].organizations || null;
  }

  // 4. Create a personal solo_doctor org. The
  //    organizations_self_insert policy permits any authenticated user.
  const personalName = (user.email?.split('@')[0] || 'Personal') + ' (Solo)';
  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .insert({ name: personalName, type: 'solo_doctor' })
    .select()
    .single();
  if (orgErr || !org) {
    console.warn('[db.orgs] org create failed:', orgErr);
    return null;
  }

  // 5. Add the user as org_owner. The org_memberships_self_insert
  //    policy permits user_id = auth.uid().
  const { error: memErr } = await supabase
    .from('org_memberships')
    .insert({
      org_id: org.id,
      user_id: user.id,
      role: 'org_owner',
      joined_at: new Date().toISOString(),
    });
  if (memErr) {
    console.warn('[db.orgs] membership insert failed:', memErr);
    return null;
  }

  return org;
}

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
 * Self-heals: if the user has no org memberships at all, we
 * auto-bootstrap a personal solo_doctor org + org_owner membership.
 * This catches users who signed up before migration 0002's
 * bootstrap trigger existed, or whose handle_new_user trigger
 * didn't fire for any reason.
 */
export async function getActiveOrg() {
  const memberships = await getMyOrgs();
  if (memberships.length === 0) {
    // Self-heal: create the personal org on the fly. After this
    // succeeds, every future load sees the happy path above.
    return await ensureUserBootstrapped();
  }
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
