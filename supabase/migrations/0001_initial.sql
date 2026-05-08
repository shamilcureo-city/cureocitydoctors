-- ─────────────────────────────────────────────────────────────────────
-- Cureocity Doctors — initial schema (Sprint 1)
-- Region: ap-south-1 (Mumbai) for DPDP Act data residency
-- ─────────────────────────────────────────────────────────────────────
-- To apply:
--   1. Create Supabase project (region: South Asia / Mumbai)
--   2. supabase link --project-ref <ref>
--   3. supabase db push
-- Or paste this entire file into the SQL editor and run.
-- ─────────────────────────────────────────────────────────────────────

-- ───────────── extensions ─────────────
create extension if not exists "pgcrypto";

-- ───────────── doctors ─────────────
-- One row per signed-in clinician. Linked 1:1 with auth.users.
create table if not exists public.doctors (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name  text,
  hpr_id        text,             -- ABDM Healthcare Professional Registry ID (Sprint 6+)
  phone         text,
  email         text,
  state         text,             -- e.g. 'Kerala'
  specialty     text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists doctors_state_idx on public.doctors (state);

-- ───────────── cases ─────────────
-- One row per consultation. Mostly metadata; the truth lives in case_events.
create table if not exists public.cases (
  id            uuid primary key default gen_random_uuid(),
  doctor_id     uuid not null references public.doctors(id) on delete cascade,
  status        text not null default 'in_progress'
                check (status in ('in_progress', 'completed', 'archived')),
  started_at    timestamptz not null default now(),
  completed_at  timestamptz,
  patient_label text,             -- free-text patient identifier (no PII required)
  summary       jsonb,            -- snapshot of last engine state for fast list rendering
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists cases_doctor_status_idx on public.cases (doctor_id, status, started_at desc);

-- ───────────── case_events ─────────────
-- Append-only event log. Replaying these reconstructs case state.
create table if not exists public.case_events (
  id         bigserial primary key,
  case_id    uuid not null references public.cases(id) on delete cascade,
  doctor_id  uuid not null references public.doctors(id) on delete cascade,
  ts         timestamptz not null default now(),
  type       text not null,       -- e.g. 'intake.analyze', 'gap.fill', 'lab.update'
  payload    jsonb not null default '{}'::jsonb
);

create index if not exists case_events_case_ts_idx on public.case_events (case_id, ts);
create index if not exists case_events_doctor_ts_idx on public.case_events (doctor_id, ts);

-- ───────────── audit_log ─────────────
-- Broader than case_events: also captures session-level actions
-- (login, disclaimer ack, navigation). Required for DPDP audit trail.
create table if not exists public.audit_log (
  id         bigserial primary key,
  doctor_id  uuid references public.doctors(id) on delete set null,
  session_id text not null,
  ts         timestamptz not null default now(),
  type       text not null,
  payload    jsonb not null default '{}'::jsonb,
  ip_inet    inet,                -- captured server-side via RLS-bypassed function (Sprint 2)
  user_agent text
);

create index if not exists audit_log_doctor_ts_idx on public.audit_log (doctor_id, ts);
create index if not exists audit_log_session_ts_idx on public.audit_log (session_id, ts);

-- ───────────── ai_calls ─────────────
-- Cost & latency tracking for LLM calls (Gemini, Claude). Enables per-clinic
-- cost dashboards and model A/B comparisons.
create table if not exists public.ai_calls (
  id            bigserial primary key,
  case_id       uuid references public.cases(id) on delete set null,
  doctor_id     uuid references public.doctors(id) on delete set null,
  provider      text not null,    -- 'gemini' | 'anthropic' | 'openai' | …
  model         text not null,    -- e.g. 'gemini-2.5-flash', 'claude-opus-4-7'
  task          text not null,    -- 'extract' | 'reason' | 'translate' | …
  tokens_in     integer,
  tokens_out    integer,
  cost_inr      numeric(10, 4),
  latency_ms    integer,
  ts            timestamptz not null default now(),
  request       jsonb,
  response      jsonb,
  error         text
);

create index if not exists ai_calls_doctor_ts_idx on public.ai_calls (doctor_id, ts);
create index if not exists ai_calls_provider_model_idx on public.ai_calls (provider, model, ts);

-- ───────────── landing_signups ─────────────
-- Signups from the public landing page. Anon-insertable, never publicly readable.
create table if not exists public.landing_signups (
  id          bigserial primary key,
  ts          timestamptz not null default now(),
  email       text,
  phone       text,
  name        text,
  state       text,
  message     text,
  utm_source  text,
  utm_medium  text,
  utm_campaign text
);

create index if not exists landing_signups_ts_idx on public.landing_signups (ts desc);

-- ─────────────────────────────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────────────────────────────

alter table public.doctors          enable row level security;
alter table public.cases            enable row level security;
alter table public.case_events      enable row level security;
alter table public.audit_log        enable row level security;
alter table public.ai_calls         enable row level security;
alter table public.landing_signups  enable row level security;

-- doctors — a doctor can read/update only their own row
drop policy if exists doctors_self_select on public.doctors;
create policy doctors_self_select on public.doctors
  for select using (auth.uid() = id);

drop policy if exists doctors_self_update on public.doctors;
create policy doctors_self_update on public.doctors
  for update using (auth.uid() = id);

drop policy if exists doctors_self_insert on public.doctors;
create policy doctors_self_insert on public.doctors
  for insert with check (auth.uid() = id);

-- cases — owner only
drop policy if exists cases_owner_all on public.cases;
create policy cases_owner_all on public.cases
  for all using (auth.uid() = doctor_id) with check (auth.uid() = doctor_id);

-- case_events — owner only
drop policy if exists case_events_owner_all on public.case_events;
create policy case_events_owner_all on public.case_events
  for all using (auth.uid() = doctor_id) with check (auth.uid() = doctor_id);

-- audit_log — owner reads own; insert anyone authed (their own); anon insert allowed for pre-login events
drop policy if exists audit_log_owner_select on public.audit_log;
create policy audit_log_owner_select on public.audit_log
  for select using (auth.uid() = doctor_id);

drop policy if exists audit_log_insert_self on public.audit_log;
create policy audit_log_insert_self on public.audit_log
  for insert with check (
    doctor_id is null or doctor_id = auth.uid()
  );

-- ai_calls — owner only
drop policy if exists ai_calls_owner_all on public.ai_calls;
create policy ai_calls_owner_all on public.ai_calls
  for all using (auth.uid() = doctor_id) with check (auth.uid() = doctor_id);

-- landing_signups — anyone can insert, no one can read via the API
-- (admin reads via service role / Supabase studio)
drop policy if exists landing_signups_anon_insert on public.landing_signups;
create policy landing_signups_anon_insert on public.landing_signups
  for insert to anon, authenticated with check (true);

-- ─────────────────────────────────────────────────────────────────────
-- Triggers — auto-create doctor row on signup, maintain updated_at
-- ─────────────────────────────────────────────────────────────────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.doctors (id, email, phone)
  values (new.id, new.email, new.phone)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists doctors_touch_updated_at on public.doctors;
create trigger doctors_touch_updated_at
  before update on public.doctors
  for each row execute function public.touch_updated_at();

drop trigger if exists cases_touch_updated_at on public.cases;
create trigger cases_touch_updated_at
  before update on public.cases
  for each row execute function public.touch_updated_at();
