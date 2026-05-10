-- ─────────────────────────────────────────────────────────────────────
-- Cureocity Doctors — fix org_memberships_member_select recursion
-- ─────────────────────────────────────────────────────────────────────
-- The original policy used a self-referencing subquery:
--
--   org_id in (select org_id from public.org_memberships
--              where user_id = auth.uid() and is_active = true)
--   or user_id = auth.uid()
--
-- That subquery references the same table whose RLS is being evaluated.
-- Postgres protects against infinite recursion by silently returning
-- zero rows from the inner SELECT — which means the OUTER policy's
-- first clause never matches anything, and only the `or user_id =
-- auth.uid()` clause fires. The fallback should still let users see
-- their own rows... but in practice some clients hit edge cases where
-- the whole row gets filtered.
--
-- Canonical Supabase fix: extract the membership check into a
-- SECURITY DEFINER function. The function runs with the function
-- owner's privileges (postgres) so it can read the table without
-- re-triggering RLS.
-- ─────────────────────────────────────────────────────────────────────

create or replace function public.is_active_member_of_org(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.org_memberships
    where org_id = p_org_id
      and user_id = auth.uid()
      and is_active = true
  );
$$;

create or replace function public.is_active_org_owner_of(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.org_memberships
    where org_id = p_org_id
      and user_id = auth.uid()
      and role = 'org_owner'
      and is_active = true
  );
$$;

-- ─────────────────────────────────────────────────────────────────────
-- Replace recursive policies with the helper-based versions.
-- All policy logic stays semantically identical; only the underlying
-- mechanism changes from a recursive subquery to a SECURITY DEFINER
-- function call.
-- ─────────────────────────────────────────────────────────────────────

-- org_memberships ----------------------------------------------------
drop policy if exists org_memberships_member_select on public.org_memberships;
create policy org_memberships_member_select on public.org_memberships
  for select using (
    user_id = auth.uid() or public.is_active_member_of_org(org_id)
  );

drop policy if exists org_memberships_owner_manage on public.org_memberships;
create policy org_memberships_owner_manage on public.org_memberships
  for all using (
    public.is_active_org_owner_of(org_id)
  );

-- organizations ------------------------------------------------------
drop policy if exists organizations_members_select on public.organizations;
create policy organizations_members_select on public.organizations
  for select using (
    public.is_active_member_of_org(id)
  );

drop policy if exists organizations_owner_update on public.organizations;
create policy organizations_owner_update on public.organizations
  for update using (
    public.is_active_org_owner_of(id)
  );

-- patients -----------------------------------------------------------
drop policy if exists patients_org_select on public.patients;
create policy patients_org_select on public.patients
  for select using (
    public.is_active_member_of_org(org_id)
  );

drop policy if exists patients_org_insert on public.patients;
create policy patients_org_insert on public.patients
  for insert with check (
    public.is_active_member_of_org(org_id)
  );

drop policy if exists patients_org_update on public.patients;
create policy patients_org_update on public.patients
  for update using (
    public.is_active_member_of_org(org_id)
  );

-- consultations ------------------------------------------------------
drop policy if exists consultations_org_select on public.consultations;
create policy consultations_org_select on public.consultations
  for select using (
    public.is_active_member_of_org(org_id)
  );

drop policy if exists consultations_doctor_insert on public.consultations;
create policy consultations_doctor_insert on public.consultations
  for insert with check (
    doctor_id = auth.uid() and public.is_active_member_of_org(org_id)
  );

-- consultation_events ------------------------------------------------
drop policy if exists consultation_events_org_select on public.consultation_events;
create policy consultation_events_org_select on public.consultation_events
  for select using (
    consultation_id in (
      select id from public.consultations c
      where public.is_active_member_of_org(c.org_id)
    )
  );

-- prescriptions ------------------------------------------------------
drop policy if exists prescriptions_org_select on public.prescriptions;
create policy prescriptions_org_select on public.prescriptions
  for select using (
    public.is_active_member_of_org(org_id)
  );

drop policy if exists prescriptions_pharmacist_update on public.prescriptions;
create policy prescriptions_pharmacist_update on public.prescriptions
  for update using (
    exists (
      select 1 from public.org_memberships m
      where m.org_id = prescriptions.org_id
        and m.user_id = auth.uid()
        and m.role = 'pharmacist'
        and m.is_active = true
    )
  );

-- referrals ----------------------------------------------------------
drop policy if exists referrals_org_select on public.referrals;
create policy referrals_org_select on public.referrals
  for select using (
    public.is_active_member_of_org(org_id)
  );

-- consent_records ----------------------------------------------------
drop policy if exists consent_records_org_select on public.consent_records;
create policy consent_records_org_select on public.consent_records
  for select using (
    patient_id in (
      select id from public.patients p
      where public.is_active_member_of_org(p.org_id)
    )
  );

-- clinical_concerns --------------------------------------------------
drop policy if exists clinical_concerns_self_select on public.clinical_concerns;
create policy clinical_concerns_self_select on public.clinical_concerns
  for select using (
    reporter_user_id = auth.uid()
    or public.is_active_org_owner_of(org_id)
  );

drop policy if exists clinical_concerns_self_insert on public.clinical_concerns;
create policy clinical_concerns_self_insert on public.clinical_concerns
  for insert with check (
    reporter_user_id = auth.uid()
    and (org_id is null or public.is_active_member_of_org(org_id))
  );

drop policy if exists clinical_concerns_owner_update on public.clinical_concerns;
create policy clinical_concerns_owner_update on public.clinical_concerns
  for update using (
    public.is_active_org_owner_of(org_id)
  );
