-- ─────────────────────────────────────────────────────────────────────
-- Cureocity Doctors — Migration 0005
-- Knowledge base as RAG corpus (pgvector)
-- ─────────────────────────────────────────────────────────────────────
-- Phase: AI-first pivot (Sprint 0/2)
--
-- Replaces the in-engine KB (hardcoded JS objects in cureocityEngine.js)
-- with a vector-searchable corpus. The clinical agent retrieves chunks
-- via the search_kb tool; every clinical claim made by the agent must
-- cite a kb_chunks.id. See docs/architecture/tool-boundary.md.
--
-- Why pgvector and not Pinecone/Weaviate:
--   1. Already in Supabase (zero new infra)
--   2. Same RLS posture as the rest of the schema
--   3. ap-south-1 residency without further work
--   4. ivfflat index is sufficient for our corpus size (~5–20k chunks)
--
-- Note: Voyage-3 embeddings are 1024-dim. If we switch to OpenAI
-- text-embedding-3-large (3072-dim), bump the vector size and re-index.
-- ─────────────────────────────────────────────────────────────────────

-- Enable pgvector extension. Must be done with a Supabase project owner
-- role; in CI this runs via the service role.
create extension if not exists vector with schema extensions;

-- ─────────────────────────────────────────────────────────────────────
-- kb_chunks: the RAG corpus
-- ─────────────────────────────────────────────────────────────────────
-- Each row is a retrievable unit of clinical knowledge. Chunks are
-- ~500 tokens, sliced at semantic boundaries (per condition section,
-- per drug protocol section, per guideline paragraph).
--
-- The kb_version column lets a consultation pin the exact corpus
-- version used; required for audit replay and CDSCO traceability.
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.kb_chunks (
  id              uuid        primary key default gen_random_uuid(),
  source_doc      text        not null,         -- "ICMR Pneumonia Guidelines 2024"
  source_url      text,                          -- canonical URL if any
  source_section  text,                          -- "Severity Assessment"
  content         text        not null,          -- the chunk text
  embedding       extensions.vector(1024),       -- Voyage-3 dim
  kb_version      text        not null,          -- "v2026-05-10"
  metadata        jsonb       not null default '{}'::jsonb,
                                  -- { conditions: ['pneumonia'],
                                  --   drugs: ['amoxicillin'],
                                  --   age_groups: ['adult','paeds'],
                                  --   evidence_level: 'A',
                                  --   guideline: 'ICMR' }
  token_count     integer,                       -- approximate
  created_at      timestamptz not null default now(),
  superseded_at   timestamptz,                   -- set when a new kb_version replaces this chunk
  superseded_by   uuid        references public.kb_chunks(id) on delete set null
);

create index if not exists kb_chunks_kb_version_idx on public.kb_chunks (kb_version);
create index if not exists kb_chunks_source_doc_idx on public.kb_chunks (source_doc);
create index if not exists kb_chunks_metadata_gin   on public.kb_chunks using gin (metadata jsonb_path_ops);
create index if not exists kb_chunks_active_idx     on public.kb_chunks (kb_version) where superseded_at is null;

-- Vector similarity index — ivfflat with cosine distance.
-- lists=100 is appropriate for ~10k rows; bump to sqrt(N) at larger scale.
-- Run REINDEX after major ingestion runs.
create index if not exists kb_chunks_embedding_idx
  on public.kb_chunks
  using ivfflat (embedding extensions.vector_cosine_ops)
  with (lists = 100);

-- ─────────────────────────────────────────────────────────────────────
-- kb_versions: registry of corpus versions
-- ─────────────────────────────────────────────────────────────────────
-- Each ingestion run produces a new version. consultations.kb_version
-- (existing column) references this.
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.kb_versions (
  version         text        primary key,         -- "v2026-05-10"
  ingested_at     timestamptz not null default now(),
  ingested_by     uuid        references auth.users(id),
  embedding_model text        not null,            -- "voyage-3"
  chunk_count     integer     not null,
  source_corpus_hash text,                          -- sha256 of input doc set
  notes           text,
  is_active       boolean     not null default false  -- exactly one active at a time
);

-- Only one active version at a time
create unique index if not exists kb_versions_one_active
  on public.kb_versions (is_active) where is_active = true;

-- ─────────────────────────────────────────────────────────────────────
-- agent_kb_citations: which chunks did the agent actually cite per turn
-- ─────────────────────────────────────────────────────────────────────
-- Audit trail of every kb_chunks.id the agent referenced. Lets us
-- detect fabricated citations (chunk_id not present in kb_chunks) and
-- compute citation rate per turn for quality monitoring.
-- ─────────────────────────────────────────────────────────────────────
create table if not exists public.agent_kb_citations (
  id                   uuid        primary key default gen_random_uuid(),
  consultation_id      uuid        not null references public.consultations(id) on delete cascade,
  -- consultation_events.id is bigserial (bigint) — see migration 0002
  consultation_event_id bigint     references public.consultation_events(id) on delete set null,
  chunk_id             uuid        references public.kb_chunks(id) on delete set null,
  cited_id_raw         text        not null,            -- what the agent said
  is_valid             boolean     not null,            -- chunk_id resolves to a real row
  agent_claim          text,                            -- the claim being cited
  created_at           timestamptz not null default now()
);

create index if not exists agent_kb_citations_consultation_idx
  on public.agent_kb_citations (consultation_id);
create index if not exists agent_kb_citations_invalid_idx
  on public.agent_kb_citations (consultation_id) where is_valid = false;

-- ─────────────────────────────────────────────────────────────────────
-- RLS policies
-- ─────────────────────────────────────────────────────────────────────
-- kb_chunks and kb_versions: read-all-authenticated. Writes via service
-- role only (ingestion script uses SUPABASE_SERVICE_ROLE_KEY).
--
-- agent_kb_citations: read by org members of the parent consultation.
-- Writes via service role (server-side agent endpoint).
-- ─────────────────────────────────────────────────────────────────────

alter table public.kb_chunks            enable row level security;
alter table public.kb_versions          enable row level security;
alter table public.agent_kb_citations   enable row level security;

drop policy if exists kb_chunks_read on public.kb_chunks;
create policy kb_chunks_read on public.kb_chunks
  for select to authenticated
  using (true);

drop policy if exists kb_versions_read on public.kb_versions;
create policy kb_versions_read on public.kb_versions
  for select to authenticated
  using (true);

drop policy if exists agent_kb_citations_read on public.agent_kb_citations;
create policy agent_kb_citations_read on public.agent_kb_citations
  for select to authenticated
  using (
    exists (
      select 1
      from public.consultations c
      where c.id = agent_kb_citations.consultation_id
        and public.is_active_member_of_org(c.org_id)
    )
  );

-- ─────────────────────────────────────────────────────────────────────
-- Helpers
-- ─────────────────────────────────────────────────────────────────────

-- Top-k retrieval against the active corpus, with optional metadata filter.
-- Called from the search_kb tool handler in src/lib/agent/tools/searchKb.js.
create or replace function public.search_kb_chunks(
  query_embedding extensions.vector(1024),
  match_count     integer default 5,
  metadata_filter jsonb   default '{}'::jsonb
)
returns table (
  id          uuid,
  content     text,
  source_doc  text,
  source_section text,
  metadata    jsonb,
  similarity  float
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select
    c.id,
    c.content,
    c.source_doc,
    c.source_section,
    c.metadata,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.kb_chunks c
  join public.kb_versions v on v.version = c.kb_version
  where v.is_active = true
    and c.superseded_at is null
    and (metadata_filter = '{}'::jsonb or c.metadata @> metadata_filter)
  order by c.embedding <=> query_embedding
  limit match_count
$$;

grant execute on function public.search_kb_chunks to authenticated, anon;
