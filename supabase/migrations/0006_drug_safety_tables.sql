-- ─────────────────────────────────────────────────────────────────────
-- Cureocity Doctors — Migration 0006
-- Deterministic drug-safety tools: interactions, doses, red flags
-- ─────────────────────────────────────────────────────────────────────
-- Phase: AI-first pivot (Sprint 0/2)
--
-- These three tables back the deterministic Class-A tools the agent
-- calls (see docs/architecture/tool-boundary.md). The LLM never decides
-- a drug interaction, dose, or red-flag escalation; it always queries
-- these tables via tool calls.
--
-- This is the regulatory shield. Every Rx finalized through the system
-- runs every drug through drug_interactions and drug_doses regardless
-- of what the agent claimed. Mismatches are blocked at the UI layer.
-- ─────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────
-- drug_master: canonical drug list (generic + Indian brands)
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.drug_master (
  id              uuid        primary key default gen_random_uuid(),
  generic_name    text        not null,                -- "amoxicillin"
  rxnorm_cui      text,                                 -- "723"
  atc_code        text,                                 -- "J01CA04"
  drug_class      text,                                 -- "penicillin"
  india_brands    text[]      not null default '{}',    -- ["Mox","Novamox","Amoxil"]
  routes          text[]      not null default '{}',    -- ["PO","IV","IM"]
  is_otc_india    boolean     not null default false,
  is_controlled   boolean     not null default false,
  pregnancy_cat   text,                                 -- "B" (FDA) — informational
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists drug_master_generic_idx
  on public.drug_master (lower(generic_name));
create index if not exists drug_master_class_idx
  on public.drug_master (drug_class);
create index if not exists drug_master_brands_gin
  on public.drug_master using gin (india_brands);

-- ─────────────────────────────────────────────────────────────────────
-- drug_interactions: drug-drug, drug-disease, drug-allergy
-- ─────────────────────────────────────────────────────────────────────
-- Symmetric for drug-drug (always store with drug_a_id < drug_b_id by
-- convention to dedupe). Asymmetric for drug-disease.
-- ─────────────────────────────────────────────────────────────────────
create type public.interaction_kind as enum (
  'drug_drug',
  'drug_disease',
  'drug_allergy_class',
  'drug_age_band',
  'drug_pregnancy',
  'drug_lactation'
);

create type public.interaction_severity as enum (
  'contraindicated',  -- never combine
  'major',            -- avoid if at all possible
  'moderate',         -- monitor closely / adjust
  'minor'             -- informational
);

create table if not exists public.drug_interactions (
  id              uuid        primary key default gen_random_uuid(),
  kind            public.interaction_kind     not null,
  drug_a_id       uuid        not null references public.drug_master(id) on delete cascade,
  drug_b_id       uuid        references public.drug_master(id) on delete cascade,
  -- For drug_disease: condition coded in the partner column
  partner_condition text,                         -- "CKD stage 4-5", "asthma"
  partner_age_band text,                           -- "<18y", ">=65y"
  partner_pregnancy_trimester int,                 -- 1, 2, 3, null
  severity        public.interaction_severity not null,
  mechanism       text        not null,           -- short clinical description
  advice          text        not null,           -- "Avoid; if essential, monitor INR"
  evidence_level  text,                            -- "A" (strong), "B", "C", "expert"
  source          text,                            -- "BNF 2024 §5.6"
  kb_chunk_id     uuid        references public.kb_chunks(id),  -- pointer to the KB excerpt
  is_active       boolean     not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- A drug-drug pair appears once (we order drug_a_id < drug_b_id at insert)
  constraint drug_interactions_drug_drug_unique
    unique nulls not distinct (kind, drug_a_id, drug_b_id, partner_condition, partner_age_band, partner_pregnancy_trimester),
  -- drug_drug must have both drugs; others must have only drug_a
  constraint drug_interactions_kind_check check (
    (kind = 'drug_drug' and drug_b_id is not null and partner_condition is null)
    or (kind = 'drug_disease' and drug_b_id is null and partner_condition is not null)
    or (kind = 'drug_allergy_class' and drug_b_id is null)
    or (kind = 'drug_age_band' and drug_b_id is null and partner_age_band is not null)
    or (kind = 'drug_pregnancy' and drug_b_id is null and partner_pregnancy_trimester is not null)
    or (kind = 'drug_lactation' and drug_b_id is null)
  )
);

create index if not exists drug_interactions_a_idx on public.drug_interactions (drug_a_id) where is_active;
create index if not exists drug_interactions_b_idx on public.drug_interactions (drug_b_id) where is_active and drug_b_id is not null;
create index if not exists drug_interactions_severity_idx on public.drug_interactions (severity);

-- ─────────────────────────────────────────────────────────────────────
-- drug_doses: dosing rules by patient context
-- ─────────────────────────────────────────────────────────────────────
-- A single drug can have many rows (different age bands, weight bands,
-- renal bands, indications). The dose_check tool selects the most
-- specific match.
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.drug_doses (
  id                  uuid        primary key default gen_random_uuid(),
  drug_id             uuid        not null references public.drug_master(id) on delete cascade,
  indication          text        not null,         -- "acute otitis media", "community-acquired pneumonia"
  route               text        not null,         -- "PO"
  -- Patient-band selectors (any may be null = applies to all)
  age_min_years       numeric,
  age_max_years       numeric,
  weight_min_kg       numeric,
  weight_max_kg       numeric,
  crcl_min_ml_min     numeric,                       -- creatinine clearance band
  crcl_max_ml_min     numeric,
  child_pugh_class    text,                          -- "A","B","C" or null
  is_pregnancy        boolean,
  is_lactation        boolean,
  -- Dose recommendation
  dose_type           text        not null,         -- "fixed" | "mg_per_kg" | "bsa"
  dose_value          numeric     not null,         -- 500 (mg) or 15 (mg/kg)
  dose_unit           text        not null,         -- "mg"
  frequency           text        not null,         -- "Q6H","BD","TDS","OD","STAT","PRN"
  duration_days_min   numeric,
  duration_days_max   numeric,
  max_single_dose_mg  numeric,
  max_daily_dose_mg   numeric,
  evidence_level      text,
  source              text,
  kb_chunk_id         uuid        references public.kb_chunks(id),
  is_active           boolean     not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists drug_doses_drug_active_idx
  on public.drug_doses (drug_id) where is_active;
create index if not exists drug_doses_indication_idx
  on public.drug_doses (lower(indication));

-- ─────────────────────────────────────────────────────────────────────
-- red_flag_phrases: deterministic escalation triggers
-- ─────────────────────────────────────────────────────────────────────
-- The LLM can detect red flags too, but these phrases are also matched
-- deterministically against the transcript. If the LLM misses one, the
-- deterministic matcher catches it.
-- ─────────────────────────────────────────────────────────────────────
create type public.red_flag_severity as enum (
  'p0_immediate',   -- 999 / ED now
  'p1_urgent',      -- ED or specialist within hours
  'p2_priority'     -- specialist within 24-48h
);

create table if not exists public.red_flag_phrases (
  id              uuid        primary key default gen_random_uuid(),
  phrase          text        not null,
  language        text        not null default 'en',  -- 'en','en-IN','ml','hi','manglish'
  match_type      text        not null default 'phrase', -- 'phrase' | 'regex'
  context_required text,                                -- e.g. only flag "tearing" if "pain" within 10 words
  severity        public.red_flag_severity   not null,
  category        text        not null,                 -- 'cardiac','neuro','gi','obs','paeds','sepsis'
  associated_conditions text[] not null default '{}',
  recommended_action text     not null,                 -- "ED now; do not drive"
  kb_chunk_id     uuid        references public.kb_chunks(id),
  is_active       boolean     not null default true,
  created_at      timestamptz not null default now()
);

create index if not exists red_flag_phrases_active_idx on public.red_flag_phrases (is_active) where is_active;
create index if not exists red_flag_phrases_lang_idx on public.red_flag_phrases (language);
create unique index if not exists red_flag_phrases_uniq on public.red_flag_phrases (lower(phrase), language);

-- ─────────────────────────────────────────────────────────────────────
-- tool_calls: audit log of every deterministic tool the agent invoked
-- ─────────────────────────────────────────────────────────────────────
-- Separate from ai_calls (which logs LLM calls). This logs tool
-- invocations: which tool, with what args, what it returned, how long.
-- Used for replay, debugging, and CDSCO audit.
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.tool_calls (
  id                  uuid        primary key default gen_random_uuid(),
  consultation_id     uuid        references public.consultations(id) on delete cascade,
  -- consultation_events.id is bigserial (bigint) — see migration 0002
  consultation_event_id bigint    references public.consultation_events(id) on delete set null,
  doctor_id           uuid        references public.doctors(id),
  tool_name           text        not null,    -- 'drug_interactions','dose_check', etc.
  tool_args           jsonb       not null,
  tool_result         jsonb,
  latency_ms          integer,
  success             boolean     not null,
  error_message       text,
  created_at          timestamptz not null default now()
);

create index if not exists tool_calls_consultation_idx on public.tool_calls (consultation_id);
create index if not exists tool_calls_doctor_idx on public.tool_calls (doctor_id);
create index if not exists tool_calls_name_time_idx on public.tool_calls (tool_name, created_at desc);

-- ─────────────────────────────────────────────────────────────────────
-- RLS policies
-- ─────────────────────────────────────────────────────────────────────
alter table public.drug_master         enable row level security;
alter table public.drug_interactions   enable row level security;
alter table public.drug_doses          enable row level security;
alter table public.red_flag_phrases    enable row level security;
alter table public.tool_calls          enable row level security;

-- Reference data: read-all-authenticated, write via service role only
drop policy if exists drug_master_read on public.drug_master;
create policy drug_master_read on public.drug_master
  for select to authenticated using (true);

drop policy if exists drug_interactions_read on public.drug_interactions;
create policy drug_interactions_read on public.drug_interactions
  for select to authenticated using (is_active);

drop policy if exists drug_doses_read on public.drug_doses;
create policy drug_doses_read on public.drug_doses
  for select to authenticated using (is_active);

drop policy if exists red_flag_phrases_read on public.red_flag_phrases;
create policy red_flag_phrases_read on public.red_flag_phrases
  for select to authenticated using (is_active);

-- tool_calls: org-scoped reads for audit; writes via service role
drop policy if exists tool_calls_read on public.tool_calls;
create policy tool_calls_read on public.tool_calls
  for select to authenticated
  using (
    exists (
      select 1
      from public.consultations c
      where c.id = tool_calls.consultation_id
        and public.is_active_member_of_org(c.org_id)
    )
  );

-- ─────────────────────────────────────────────────────────────────────
-- Convenience views
-- ─────────────────────────────────────────────────────────────────────

-- Drug-drug interactions denormalized for quick lookups by name
create or replace view public.v_drug_interactions_by_name as
select
  i.id,
  da.generic_name as drug_a,
  db.generic_name as drug_b,
  i.severity,
  i.mechanism,
  i.advice,
  i.evidence_level,
  i.source,
  i.kb_chunk_id
from public.drug_interactions i
join public.drug_master da on da.id = i.drug_a_id
left join public.drug_master db on db.id = i.drug_b_id
where i.kind = 'drug_drug' and i.is_active;

grant select on public.v_drug_interactions_by_name to authenticated, anon;
