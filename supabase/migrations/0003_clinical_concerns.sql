-- ─────────────────────────────────────────────────────────────────────
-- Cureocity Doctors — pilot operations: clinical concern reports
-- ─────────────────────────────────────────────────────────────────────
-- A safety-net feedback channel for pilot doctors. Whenever a doctor
-- thinks the AI got something wrong (missed a red flag, suggested an
-- inappropriate drug, hallucinated a diagnosis, etc.), they file a
-- structured concern from inside the consult. Reviewed weekly by the
-- clinical advisor; flagged ones become test fixtures + KB updates.
--
-- This is the explicit feedback mechanism CDSCO post-market
-- surveillance requires (MDR §13). Without it, we have no documented
-- process to catch and remediate clinical issues in production.
-- ─────────────────────────────────────────────────────────────────────

create extension if not exists "pgcrypto";

create table if not exists public.clinical_concerns (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid references public.organizations(id) on delete set null,
  consultation_id uuid references public.consultations(id) on delete set null,
  reporter_user_id uuid references auth.users(id) on delete set null,
  -- What category of concern
  category        text not null check (category in (
    'missed_red_flag',
    'inappropriate_drug',
    'wrong_differential',
    'hallucinated_finding',
    'transcription_error',
    'timing_grid_wrong',
    'paediatric_safety',
    'allergy_conflict_missed',
    'cost_or_brand_wrong',
    'other'
  )),
  severity        text not null default 'medium' check (severity in ('low','medium','high','critical')),
  description     text not null,
  -- Captures relevant context. Examples: model_version, kb_version,
  -- the specific differential / drug / suggestion, screenshot URL, etc.
  context         jsonb not null default '{}'::jsonb,
  status          text not null default 'open' check (status in ('open','triaged','resolved','wont_fix')),
  resolution_notes text,
  resolved_at     timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists clinical_concerns_org_status_idx on public.clinical_concerns (org_id, status, created_at desc);
create index if not exists clinical_concerns_severity_idx   on public.clinical_concerns (severity, created_at desc) where status = 'open';
create index if not exists clinical_concerns_consult_idx    on public.clinical_concerns (consultation_id) where consultation_id is not null;

-- ─────────────────────────────────────────────────────────────────────
-- RLS: doctors can file concerns + read their own; org_owners can read
-- + triage all concerns within their org; the clinical advisor reads
-- everything via service_role only (out-of-band).
-- ─────────────────────────────────────────────────────────────────────
alter table public.clinical_concerns enable row level security;

drop policy if exists clinical_concerns_self_select on public.clinical_concerns;
create policy clinical_concerns_self_select on public.clinical_concerns
  for select using (
    reporter_user_id = auth.uid()
    or org_id in (select org_id from public.org_memberships
                  where user_id = auth.uid() and role = 'org_owner' and is_active = true)
  );

drop policy if exists clinical_concerns_self_insert on public.clinical_concerns;
create policy clinical_concerns_self_insert on public.clinical_concerns
  for insert with check (
    reporter_user_id = auth.uid()
    and (
      org_id is null
      or org_id in (select org_id from public.org_memberships
                    where user_id = auth.uid() and is_active = true)
    )
  );

-- Owner can update status/resolution within their org.
drop policy if exists clinical_concerns_owner_update on public.clinical_concerns;
create policy clinical_concerns_owner_update on public.clinical_concerns
  for update using (
    org_id in (select org_id from public.org_memberships
               where user_id = auth.uid() and role = 'org_owner' and is_active = true)
  );
