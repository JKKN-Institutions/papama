-- ============================================================================
-- Migration m23 — fix "Database error saving new user" (signup 500)
-- APPLIED 2026-06-24 to project qxdxefofeykzvegykitt via Supabase MCP.
-- ----------------------------------------------------------------------------
-- ROOT CAUSE (confirmed against the LIVE database, not inferred):
--   public.handle_new_user() (fires on every auth.users insert) upserts:
--     insert into public.donors (...)        on conflict (user_id)  do nothing;
--     insert into public.donor_credits (...)  on conflict (donor_id) do nothing;
--
--   * donor_credits.donor_id already had a FULL unique index
--     (donor_credits_donor_key) -> its ON CONFLICT (donor_id) was fine.
--   * donors.user_id had ONLY a PARTIAL unique index:
--       CREATE UNIQUE INDEX donors_user_id_key
--         ON public.donors (user_id) WHERE (user_id IS NOT NULL)
--     Postgres will NOT use a partial index as the arbiter for a plain
--     ON CONFLICT (user_id) (the statement carries no matching predicate), so
--     the planner raised SQLSTATE 42P10 ("no unique or exclusion constraint
--     matching the ON CONFLICT specification"). The trigger aborted at the very
--     first statement, so EVERY signup transaction rolled back with a 500
--     ("Database error saving new user") — donor AND vendor. On the client this
--     surfaced as `AuthRetryableFetchError: {}`.
--
--   Bonus gotcha: because a *relation* named donors_user_id_key already existed
--   (the partial index), a naive `ALTER TABLE ... ADD CONSTRAINT donors_user_id_key`
--   failed with 42P07 ("relation already exists") — which is why earlier attempts
--   to "just add the constraint" never took.
--
-- FIX: drop the partial index and add a FULL unique constraint on donors.user_id.
--   A full unique constraint still treats NULLs as distinct (multiple NULLs
--   allowed), so the donors.user_id -> users(id) ON DELETE SET NULL FK is
--   unaffected. Verified before applying: 0 duplicate and 0 NULL user_id values,
--   so the constraint adds cleanly.
--
-- This block is idempotent — safe to re-run on a fresh DB (which still has the
-- partial index from the donors table migration) or on one already fixed.
-- ============================================================================

do $$
begin
  -- Remove the partial unique index that cannot serve as an ON CONFLICT arbiter,
  -- but only if the full unique constraint isn't already in place.
  if exists (
        select 1 from pg_indexes
        where schemaname = 'public' and tablename = 'donors'
          and indexname = 'donors_user_id_key'
      )
     and not exists (
        select 1 from pg_constraint
        where conname = 'donors_user_id_key' and contype = 'u'
      )
  then
    execute 'drop index public.donors_user_id_key';
  end if;

  -- Add the full unique constraint the trigger's ON CONFLICT (user_id) requires.
  if not exists (
        select 1 from pg_constraint
        where conrelid = 'public.donors'::regclass
          and conname = 'donors_user_id_key' and contype = 'u'
      )
  then
    alter table public.donors
      add constraint donors_user_id_key unique (user_id);
  end if;
end $$;

-- POST-APPLY verification (confirmed on apply):
--   EXPLAIN INSERT INTO public.donors (user_id) VALUES ('...')
--     ON CONFLICT (user_id) DO NOTHING;
--   ->  "Conflict Arbiter Indexes: donors_user_id_key"   (arbiter resolves, no 42P10)
--   Then: sign up a brand-new email at /vendor/register (or /donor/signup) -> no 500.
--
-- DOWN (rollback):
--   alter table public.donors drop constraint donors_user_id_key;
--   -- (optionally recreate the old partial index if it is ever wanted back:
--   --  create unique index donors_user_id_key on public.donors (user_id)
--   --    where (user_id is not null);)
