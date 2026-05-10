-- ─────────────────────────────────────────────────────────────────────
-- ROLLBACK for migration 0005_kb_chunks_pgvector.sql
-- ─────────────────────────────────────────────────────────────────────
-- Run only if 0005 needs to be reversed. Idempotent.
-- The `vector` extension is intentionally LEFT INSTALLED — it's harmless
-- and other tooling may rely on it. Drop manually if you really want.
-- ─────────────────────────────────────────────────────────────────────

drop function if exists public.search_kb_chunks(extensions.vector, integer, jsonb);

drop policy if exists agent_kb_citations_read on public.agent_kb_citations;
drop policy if exists kb_versions_read on public.kb_versions;
drop policy if exists kb_chunks_read on public.kb_chunks;

drop table if exists public.agent_kb_citations cascade;
drop table if exists public.kb_versions cascade;
drop table if exists public.kb_chunks cascade;

-- Uncomment the next line if you want to also drop the extension.
-- drop extension if exists vector;
