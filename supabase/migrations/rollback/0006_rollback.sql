-- ─────────────────────────────────────────────────────────────────────
-- ROLLBACK for migration 0006_drug_safety_tables.sql
-- ─────────────────────────────────────────────────────────────────────
-- Run only if 0006 needs to be reversed. Idempotent.
-- ─────────────────────────────────────────────────────────────────────

drop view if exists public.v_drug_interactions_by_name;

drop policy if exists tool_calls_read         on public.tool_calls;
drop policy if exists red_flag_phrases_read   on public.red_flag_phrases;
drop policy if exists drug_doses_read         on public.drug_doses;
drop policy if exists drug_interactions_read  on public.drug_interactions;
drop policy if exists drug_master_read        on public.drug_master;

drop table if exists public.tool_calls         cascade;
drop table if exists public.red_flag_phrases   cascade;
drop table if exists public.drug_doses         cascade;
drop table if exists public.drug_interactions  cascade;
drop table if exists public.drug_master        cascade;

drop type if exists public.red_flag_severity;
drop type if exists public.interaction_severity;
drop type if exists public.interaction_kind;
