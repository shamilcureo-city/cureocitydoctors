-- ─────────────────────────────────────────────────────────────────────
-- ROLLBACK for migration 0007_drug_safety_seed.sql
-- ─────────────────────────────────────────────────────────────────────
-- Clears the seeded data so the seed migration can be re-run. Leaves
-- table structures intact (those are owned by 0006).
--
-- TRUNCATE ... CASCADE clears child rows in drug_interactions and
-- drug_doses via the drug_master FK.
-- ─────────────────────────────────────────────────────────────────────

truncate
  public.red_flag_phrases,
  public.drug_doses,
  public.drug_interactions,
  public.drug_master
  cascade;
