-- RECOVERED from live DB (already applied under ledger version 20260623042409 / m13b_drop_legacy_donor_module_tables).
-- Source reconstructed for db-reset reproducibility. Idempotent.
--
-- INTENTIONAL NO-OP on a fresh reset. This live migration dropped tables created by an
-- unreachable pre-m13 developer branch that never existed in the repo lineage. Those
-- tables are confirmed ABSENT from the live schema today, so there is nothing to drop on a
-- clean `supabase db reset` (the repo migrations never create them).
--
-- The original table names are not recoverable from the live DB (the objects are gone).
-- Kept as a documented placeholder so the ledger position is represented in source. If the
-- legacy names are ever recovered from history, list them here:
--   drop table if exists public.<legacy_table> cascade;

do $$ begin
  raise notice 'm13b: no-op on fresh reset (legacy pre-m13 tables never created in repo lineage)';
end $$;
