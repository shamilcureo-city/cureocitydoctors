-- ─────────────────────────────────────────────────────────────────────
-- Cureocity Doctors — multi-tenant + patient continuity (Sprint 1.4)
-- Region: ap-south-1 (Mumbai) for DPDP Act data residency
-- ─────────────────────────────────────────────────────────────────────
-- This migration adds the data primitives the production v1 needs:
--   organizations + org_memberships ........ multi-tenant clinic accounts
--   patients ............................... longitudinal patient records
--   consultations + consultation_events .... structured consult records
--   prescriptions .......................... queryable Rx history
--   referrals .............................. structured referral letters
--   consent_records ........................ DPDP/TPG patient consent log
--   kb_snapshots ........................... versioned KB references for audit
-- It is purely additive. Existing tables (doctors, cases, case_events,
-- audit_log, ai_calls, landing_signups) are untouched. The legacy `cases`
-- table remains for the existing solo-doctor flow until Phase 2 fully
-- migrates consults onto `consultations`.
--
-- To apply:
--   Paste this entire file into Supabase SQL editor and run.
--   Or:  supabase db push  (after `supabase link`)
-- ─────────────────────────────────────────────────────────────────────

create extension if not exists "pgcrypto";

-- ─────────────────────────────────────────────────────────────────────
-- organizations — a clinic, hospital, or pharma-funded GP panel
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.organizations (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  type            text not null check (type in ('clinic','solo_doctor','hospital','pharma_panel')),
  state           text,                 -- e.g. 'Kerala'
  city            text,
  abdm_facility_id text,                -- ABDM Health Facility Registry ID (Phase 2+)
  daily_ai_cost_cap_inr numeric not null default 2000,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists organizations_type_idx on public.organizations (type);
create index if not exists organizations_state_idx on public.organizations (state);

-- ─────────────────────────────────────────────────────────────────────
-- org_memberships — N:M between doctors/staff and organizations
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.org_memberships (
  org_id        uuid not null references public.organizations(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  role          text not null check (role in ('org_owner','doctor','receptionist','pharmacist','viewer')),
  doctor_registration_number text,      -- MCI/SMC reg # — required for TPG-compliant Rx
  is_active     boolean not null default true,
  invited_at    timestamptz not null default now(),
  joined_at     timestamptz,
  primary key (org_id, user_id)
);

create index if not exists org_memberships_user_idx on public.org_memberships (user_id, is_active);

-- Helper view: which orgs the current user belongs to (used by RLS).
create or replace view public.my_orgs as
  select org_id from public.org_memberships
  where user_id = auth.uid() and is_active = true;

-- ─────────────────────────────────────────────────────────────────────
-- patients — longitudinal patient record, phone-keyed within an org
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.patients (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  phone_e164      text not null,        -- E.164 format (+91...)
  abha_id         text,                 -- ABDM ABHA address (Phase 2+)
  name            text,                 -- optional — minimum identification only
  dob             date,
  age             integer,              -- denormalized for engine (recompute periodically)
  gender          text check (gender in ('M','F','O')),
  comorbidities   text[],
  allergies       jsonb,                -- [{allergen, reaction, severity}]
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (org_id, phone_e164)
);

create index if not exists patients_org_phone_idx on public.patients (org_id, phone_e164);
create index if not exists patients_abha_idx on public.patients (abha_id) where abha_id is not null;

-- ─────────────────────────────────────────────────────────────────────
-- consultations — one consult session
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.consultations (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id) on delete cascade,
  patient_id      uuid not null references public.patients(id) on delete cascade,
  doctor_id       uuid not null references auth.users(id) on delete restrict,
  modality        text not null check (modality in ('in_person','video','phone','async')),
  started_at      timestamptz not null,
  ended_at        timestamptz,
  chief_complaint text,
  primary_diagnosis_icd10 text,
  primary_diagnosis_name  text,
  certainty_pct   numeric,
  kb_version      text not null,
  consent_record_id uuid,
  audio_retention_consented boolean not null default false,
  -- Engine snapshot for fast list rendering and replay/audit
  engine_snapshot jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists consultations_patient_idx on public.consultations (patient_id, started_at desc);
create index if not exists consultations_org_doctor_idx on public.consultations (org_id, doctor_id, started_at desc);
create index if not exists consultations_org_started_idx on public.consultations (org_id, started_at desc);

-- ─────────────────────────────────────────────────────────────────────
-- consultation_events — append-only events within a consult
-- (ambient audio chunks, AI calls, doctor actions). Replays the consult.
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.consultation_events (
  id              bigserial primary key,
  consultation_id uuid not null references public.consultations(id) on delete cascade,
  event_type      text not null,        -- e.g. 'audio.chunk', 'gemini.extract', 'doctor.edit', 'rx.send'
  sequence        integer,
  payload         jsonb not null default '{}'::jsonb,
  model_version   text,
  latency_ms      integer,
  created_at      timestamptz not null default now()
);

create index if not exists consultation_events_consult_seq_idx on public.consultation_events (consultation_id, sequence);
create index if not exists consultation_events_consult_ts_idx on public.consultation_events (consultation_id, created_at);

-- ─────────────────────────────────────────────────────────────────────
-- prescriptions — finalized Rx, queryable for analytics + reminders
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.prescriptions (
  id              uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references public.consultations(id) on delete cascade,
  org_id          uuid not null references public.organizations(id) on delete cascade,
  patient_id      uuid not null references public.patients(id) on delete cascade,
  doctor_id       uuid not null references auth.users(id) on delete restrict,
  rx_number       text not null unique,
  drugs           jsonb not null,        -- [{generic, brand_india, dose, route, freq, duration, timing_grid, notes}]
  advice          text,
  follow_up_days  integer,
  delivered_via   text[],                -- {'whatsapp','print','sms','abdm'}
  delivered_at    timestamptz,
  fulfilled_pharmacy_id text,
  fulfilled_at    timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists prescriptions_patient_idx on public.prescriptions (patient_id, created_at desc);
create index if not exists prescriptions_org_idx on public.prescriptions (org_id, created_at desc);
create index if not exists prescriptions_doctor_idx on public.prescriptions (doctor_id, created_at desc);

-- ─────────────────────────────────────────────────────────────────────
-- referrals — structured referral letters
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.referrals (
  id              uuid primary key default gen_random_uuid(),
  consultation_id uuid not null references public.consultations(id) on delete cascade,
  org_id          uuid not null references public.organizations(id) on delete cascade,
  patient_id      uuid not null references public.patients(id) on delete cascade,
  specialist_type text,
  is_urgent       boolean not null default false,
  letter_text     text not null,
  delivered_via   text[],
  delivered_at    timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists referrals_patient_idx on public.referrals (patient_id, created_at desc);

-- ─────────────────────────────────────────────────────────────────────
-- consent_records — DPDP / TPG patient consent trail
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.consent_records (
  id                          uuid primary key default gen_random_uuid(),
  patient_id                  uuid not null references public.patients(id) on delete cascade,
  consult_consent             boolean not null,
  ai_assist_consent           boolean not null,
  audio_retention_consent     boolean not null default false,
  whatsapp_delivery_consent   boolean not null default false,
  consented_at                timestamptz not null default now(),
  withdrawn_at                timestamptz,
  ip_inet                     inet,
  user_agent                  text
);

create index if not exists consent_records_patient_idx on public.consent_records (patient_id, consented_at desc);

-- ─────────────────────────────────────────────────────────────────────
-- kb_snapshots — versioned KB references so every consult can be audited
-- against the exact KB content that was used to score it.
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.kb_snapshots (
  version       text primary key,        -- e.g. 'kb-2026-05-10-a'
  released_at   timestamptz not null default now(),
  content_hash  text not null,           -- SHA256 of the serialized CLINICAL_KB
  changelog     text
);

-- ─────────────────────────────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────────────────────────────

alter table public.organizations         enable row level security;
alter table public.org_memberships       enable row level security;
alter table public.patients              enable row level security;
alter table public.consultations         enable row level security;
alter table public.consultation_events   enable row level security;
alter table public.prescriptions         enable row level security;
alter table public.referrals             enable row level security;
alter table public.consent_records       enable row level security;
alter table public.kb_snapshots          enable row level security;

-- organizations — members can read; only org_owner can update
drop policy if exists organizations_members_select on public.organizations;
create policy organizations_members_select on public.organizations
  for select using (
    id in (select org_id from public.org_memberships
           where user_id = auth.uid() and is_active = true)
  );

drop policy if exists organizations_owner_update on public.organizations;
create policy organizations_owner_update on public.organizations
  for update using (
    id in (select org_id from public.org_memberships
           where user_id = auth.uid() and role = 'org_owner' and is_active = true)
  );

-- New users may insert their own personal org (via signup flow).
drop policy if exists organizations_self_insert on public.organizations;
create policy organizations_self_insert on public.organizations
  for insert to authenticated with check (true);

-- org_memberships — users can read all rows in orgs they belong to
drop policy if exists org_memberships_member_select on public.org_memberships;
create policy org_memberships_member_select on public.org_memberships
  for select using (
    org_id in (select org_id from public.org_memberships
               where user_id = auth.uid() and is_active = true)
    or user_id = auth.uid()
  );

-- org_owner can manage memberships in their org; user can self-insert (for personal-org bootstrapping).
drop policy if exists org_memberships_owner_manage on public.org_memberships;
create policy org_memberships_owner_manage on public.org_memberships
  for all using (
    org_id in (select org_id from public.org_memberships
               where user_id = auth.uid() and role = 'org_owner' and is_active = true)
  );

drop policy if exists org_memberships_self_insert on public.org_memberships;
create policy org_memberships_self_insert on public.org_memberships
  for insert to authenticated with check (user_id = auth.uid());

-- patients — visible to any active member of the patient's org
drop policy if exists patients_org_select on public.patients;
create policy patients_org_select on public.patients
  for select using (
    org_id in (select org_id from public.org_memberships
               where user_id = auth.uid() and is_active = true)
  );

drop policy if exists patients_org_insert on public.patients;
create policy patients_org_insert on public.patients
  for insert with check (
    org_id in (select org_id from public.org_memberships
               where user_id = auth.uid() and is_active = true
               and role in ('doctor','receptionist','org_owner'))
  );

drop policy if exists patients_org_update on public.patients;
create policy patients_org_update on public.patients
  for update using (
    org_id in (select org_id from public.org_memberships
               where user_id = auth.uid() and is_active = true
               and role in ('doctor','receptionist','org_owner'))
  );

-- consultations — visible to org members; insert/update by doctor only
drop policy if exists consultations_org_select on public.consultations;
create policy consultations_org_select on public.consultations
  for select using (
    org_id in (select org_id from public.org_memberships
               where user_id = auth.uid() and is_active = true)
  );

drop policy if exists consultations_doctor_insert on public.consultations;
create policy consultations_doctor_insert on public.consultations
  for insert with check (
    doctor_id = auth.uid()
    and org_id in (select org_id from public.org_memberships
                   where user_id = auth.uid() and role = 'doctor' and is_active = true)
  );

drop policy if exists consultations_doctor_update on public.consultations;
create policy consultations_doctor_update on public.consultations
  for update using (doctor_id = auth.uid());

-- consultation_events — visible to org members; insert by doctor of the consult
drop policy if exists consultation_events_org_select on public.consultation_events;
create policy consultation_events_org_select on public.consultation_events
  for select using (
    consultation_id in (
      select id from public.consultations
      where org_id in (select org_id from public.org_memberships
                       where user_id = auth.uid() and is_active = true)
    )
  );

drop policy if exists consultation_events_doctor_insert on public.consultation_events;
create policy consultation_events_doctor_insert on public.consultation_events
  for insert with check (
    consultation_id in (
      select id from public.consultations where doctor_id = auth.uid()
    )
  );

-- prescriptions — visible to org members; insert by doctor of the consult
drop policy if exists prescriptions_org_select on public.prescriptions;
create policy prescriptions_org_select on public.prescriptions
  for select using (
    org_id in (select org_id from public.org_memberships
               where user_id = auth.uid() and is_active = true)
  );

drop policy if exists prescriptions_doctor_insert on public.prescriptions;
create policy prescriptions_doctor_insert on public.prescriptions
  for insert with check (doctor_id = auth.uid());

-- pharmacist may mark fulfilled (update delivered_*/fulfilled_* fields)
drop policy if exists prescriptions_pharmacist_update on public.prescriptions;
create policy prescriptions_pharmacist_update on public.prescriptions
  for update using (
    org_id in (select org_id from public.org_memberships
               where user_id = auth.uid() and role = 'pharmacist' and is_active = true)
  );

-- referrals — same shape as prescriptions
drop policy if exists referrals_org_select on public.referrals;
create policy referrals_org_select on public.referrals
  for select using (
    org_id in (select org_id from public.org_memberships
               where user_id = auth.uid() and is_active = true)
  );

drop policy if exists referrals_doctor_insert on public.referrals;
create policy referrals_doctor_insert on public.referrals
  for insert with check (
    consultation_id in (select id from public.consultations where doctor_id = auth.uid())
  );

-- consent_records — visible to org members of the patient's org; insert by anyone authenticated
drop policy if exists consent_records_org_select on public.consent_records;
create policy consent_records_org_select on public.consent_records
  for select using (
    patient_id in (
      select id from public.patients
      where org_id in (select org_id from public.org_memberships
                       where user_id = auth.uid() and is_active = true)
    )
  );

drop policy if exists consent_records_authed_insert on public.consent_records;
create policy consent_records_authed_insert on public.consent_records
  for insert to authenticated with check (true);

-- kb_snapshots — read-only for everyone, write via service role only
drop policy if exists kb_snapshots_authed_select on public.kb_snapshots;
create policy kb_snapshots_authed_select on public.kb_snapshots
  for select to authenticated using (true);

-- ─────────────────────────────────────────────────────────────────────
-- Triggers — touch updated_at on the tables that have it
-- ─────────────────────────────────────────────────────────────────────

drop trigger if exists organizations_touch_updated_at on public.organizations;
create trigger organizations_touch_updated_at
  before update on public.organizations
  for each row execute function public.touch_updated_at();

drop trigger if exists patients_touch_updated_at on public.patients;
create trigger patients_touch_updated_at
  before update on public.patients
  for each row execute function public.touch_updated_at();

drop trigger if exists consultations_touch_updated_at on public.consultations;
create trigger consultations_touch_updated_at
  before update on public.consultations
  for each row execute function public.touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────
-- Bootstrap: when a new doctor signs up, auto-create a personal solo_doctor
-- organization for them. Users can later switch / get added to clinic orgs.
-- ─────────────────────────────────────────────────────────────────────
create or replace function public.bootstrap_personal_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
begin
  insert into public.organizations (name, type)
  values (coalesce(new.display_name, 'Personal') || ' (Solo)', 'solo_doctor')
  returning id into new_org_id;

  insert into public.org_memberships (org_id, user_id, role, joined_at)
  values (new_org_id, new.id, 'org_owner', now());

  return new;
end;
$$;

drop trigger if exists doctors_bootstrap_org on public.doctors;
create trigger doctors_bootstrap_org
  after insert on public.doctors
  for each row execute function public.bootstrap_personal_org();

-- ─────────────────────────────────────────────────────────────────────
-- Backfill: existing doctors without a personal org get one.
-- Safe to re-run; on conflict do nothing.
-- ─────────────────────────────────────────────────────────────────────
do $$
declare
  d record;
  new_org_id uuid;
begin
  for d in
    select doc.id, doc.display_name, doc.email
    from public.doctors doc
    where not exists (
      select 1 from public.org_memberships m
      where m.user_id = doc.id and m.is_active = true
    )
  loop
    insert into public.organizations (name, type)
    values (coalesce(d.display_name, d.email, 'Personal') || ' (Solo)', 'solo_doctor')
    returning id into new_org_id;

    insert into public.org_memberships (org_id, user_id, role, joined_at)
    values (new_org_id, d.id, 'org_owner', now())
    on conflict do nothing;
  end loop;
end $$;
