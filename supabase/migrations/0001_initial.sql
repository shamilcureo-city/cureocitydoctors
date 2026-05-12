-- Cureocity Scribe: initial schema
-- Multi-tenant ambient scribing for clinics in India + GCC.
-- All clinical data is scoped to a clinic; RLS enforces tenancy.

set search_path = public;

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- ============================================================
-- enums
-- ============================================================
create type clinic_role as enum ('owner', 'admin', 'doctor');
create type consult_status as enum ('draft', 'recording', 'transcribing', 'review', 'finalized', 'cancelled');
create type consent_kind as enum ('recording', 'data_processing', 'sharing');
create type region_code as enum ('IN', 'AE', 'SA', 'QA', 'KW', 'BH', 'OM');

-- ============================================================
-- profiles (1:1 with auth.users)
-- ============================================================
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email citext unique,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================
-- clinics (tenants)
-- ============================================================
create table clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  region region_code not null default 'IN',
  country text,
  city text,
  registration_number text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index clinics_created_by_idx on clinics(created_by);

-- ============================================================
-- clinic_members (user <-> clinic with role)
-- ============================================================
create table clinic_members (
  clinic_id uuid not null references clinics(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role clinic_role not null default 'doctor',
  invited_by uuid references auth.users(id),
  joined_at timestamptz not null default now(),
  primary key (clinic_id, user_id)
);

create index clinic_members_user_idx on clinic_members(user_id);

-- ============================================================
-- patients (clinic-scoped)
-- ============================================================
create table patients (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  mrn text,
  full_name text not null,
  date_of_birth date,
  sex text check (sex in ('male', 'female', 'other', 'unspecified')),
  phone text,
  email citext,
  preferred_language text,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, mrn)
);

create index patients_clinic_idx on patients(clinic_id);
create index patients_clinic_name_idx on patients(clinic_id, full_name);

-- ============================================================
-- consultations
-- ============================================================
create table consultations (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete restrict,
  doctor_id uuid not null references auth.users(id),
  status consult_status not null default 'draft',
  chief_complaint text,
  audio_path text,
  audio_duration_seconds integer,
  language text,
  transcript text,
  soap jsonb,
  prescription jsonb,
  doctor_notes text,
  started_at timestamptz,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index consultations_clinic_idx on consultations(clinic_id);
create index consultations_patient_idx on consultations(patient_id);
create index consultations_doctor_idx on consultations(doctor_id);
create index consultations_status_idx on consultations(clinic_id, status);

-- ============================================================
-- consent_records
-- ============================================================
create table consent_records (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  consultation_id uuid references consultations(id) on delete cascade,
  kind consent_kind not null,
  language text,
  text_shown text not null,
  agreed boolean not null,
  captured_audio_path text,
  captured_by uuid references auth.users(id),
  captured_at timestamptz not null default now()
);

create index consent_records_patient_idx on consent_records(patient_id);
create index consent_records_consult_idx on consent_records(consultation_id);

-- ============================================================
-- audit_logs (append-only)
-- ============================================================
create table audit_logs (
  id bigserial primary key,
  clinic_id uuid references clinics(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_table text,
  target_id text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_clinic_idx on audit_logs(clinic_id, created_at desc);
create index audit_logs_actor_idx on audit_logs(actor_id, created_at desc);

-- ============================================================
-- helpers
-- ============================================================
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch before update on profiles
  for each row execute function public.touch_updated_at();
create trigger clinics_touch before update on clinics
  for each row execute function public.touch_updated_at();
create trigger patients_touch before update on patients
  for each row execute function public.touch_updated_at();
create trigger consultations_touch before update on consultations
  for each row execute function public.touch_updated_at();

-- Auto-create a profile row on signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Membership check helper (security definer to avoid RLS recursion).
create or replace function public.is_clinic_member(p_clinic uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from clinic_members
    where clinic_id = p_clinic and user_id = auth.uid()
  );
$$;

create or replace function public.is_clinic_admin(p_clinic uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from clinic_members
    where clinic_id = p_clinic
      and user_id = auth.uid()
      and role in ('owner', 'admin')
  );
$$;

-- ============================================================
-- RLS
-- ============================================================
alter table profiles enable row level security;
alter table clinics enable row level security;
alter table clinic_members enable row level security;
alter table patients enable row level security;
alter table consultations enable row level security;
alter table consent_records enable row level security;
alter table audit_logs enable row level security;

-- profiles: user manages own row
create policy profiles_self_select on profiles
  for select using (id = auth.uid());
create policy profiles_self_update on profiles
  for update using (id = auth.uid());
create policy profiles_self_insert on profiles
  for insert with check (id = auth.uid());

-- clinics: members can read; only the creator can insert (becomes owner via app code); admins can update.
create policy clinics_member_select on clinics
  for select using (public.is_clinic_member(id));
create policy clinics_insert_self on clinics
  for insert with check (created_by = auth.uid());
create policy clinics_admin_update on clinics
  for update using (public.is_clinic_admin(id));

-- clinic_members:
-- members can read other members in clinics they belong to.
-- admins can insert/update/delete members; a user can also insert themselves as owner of a clinic they just created.
create policy clinic_members_select on clinic_members
  for select using (public.is_clinic_member(clinic_id));
create policy clinic_members_self_owner_insert on clinic_members
  for insert with check (
    user_id = auth.uid()
    and role = 'owner'
    and exists (select 1 from clinics c where c.id = clinic_id and c.created_by = auth.uid())
  );
create policy clinic_members_admin_insert on clinic_members
  for insert with check (public.is_clinic_admin(clinic_id));
create policy clinic_members_admin_update on clinic_members
  for update using (public.is_clinic_admin(clinic_id));
create policy clinic_members_admin_delete on clinic_members
  for delete using (public.is_clinic_admin(clinic_id));

-- patients: members can read/write within their clinic
create policy patients_member_select on patients
  for select using (public.is_clinic_member(clinic_id));
create policy patients_member_insert on patients
  for insert with check (public.is_clinic_member(clinic_id));
create policy patients_member_update on patients
  for update using (public.is_clinic_member(clinic_id));
create policy patients_admin_delete on patients
  for delete using (public.is_clinic_admin(clinic_id));

-- consultations: doctor sees own + clinic admin sees all
create policy consultations_select on consultations
  for select using (
    public.is_clinic_member(clinic_id)
    and (doctor_id = auth.uid() or public.is_clinic_admin(clinic_id))
  );
create policy consultations_doctor_insert on consultations
  for insert with check (
    public.is_clinic_member(clinic_id) and doctor_id = auth.uid()
  );
create policy consultations_doctor_update on consultations
  for update using (
    public.is_clinic_member(clinic_id)
    and (doctor_id = auth.uid() or public.is_clinic_admin(clinic_id))
  );
create policy consultations_admin_delete on consultations
  for delete using (public.is_clinic_admin(clinic_id));

-- consent_records: clinic members can read consent in their clinic; only the capturing user (or admin) can insert.
create policy consent_select on consent_records
  for select using (public.is_clinic_member(clinic_id));
create policy consent_insert on consent_records
  for insert with check (
    public.is_clinic_member(clinic_id) and captured_by = auth.uid()
  );

-- audit_logs: clinic admins read; inserts done by service role (skip RLS) or by the actor themselves.
create policy audit_select_admin on audit_logs
  for select using (
    clinic_id is not null and public.is_clinic_admin(clinic_id)
  );
create policy audit_select_self on audit_logs
  for select using (actor_id = auth.uid());
create policy audit_insert_self on audit_logs
  for insert with check (actor_id = auth.uid());

-- ============================================================
-- storage buckets are created via Supabase Dashboard or CLI:
--   - consult-audio (private)
--   - consent-audio (private)
-- ============================================================
