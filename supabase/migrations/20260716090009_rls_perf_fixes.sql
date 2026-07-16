-- =============================================================================
-- Phase-1 batch 2026-07-16 follow-up — RLS perf: cache auth.uid() per statement
-- =============================================================================
-- Supabase's performance advisor flagged ledger_entries_select_vendor_own,
-- refunds_insert_own_or_admin, and refunds_select_staff_or_own for
-- re-evaluating auth.uid() per row. Wrapping as (select auth.uid()) lets
-- Postgres evaluate it once per statement (the existing private.current_app_
-- role() helper already does this internally, which is why those policies
-- never triggered the warning).
-- =============================================================================

drop policy if exists ledger_entries_select_vendor_own on public.ledger_entries;
create policy ledger_entries_select_vendor_own on public.ledger_entries
    for select to authenticated
    using (
        private.current_app_role() = 'vendor'
        and ledger = 'vendor_payable'
        and reference_type = 'redemption'
        and reference_id in (
            select id from public.token_redemptions
            where vendor_id = (select id from public.vendors where owner_id = (select auth.uid()))
        )
    );

drop policy if exists refunds_select_staff_or_own on public.refunds;
create policy refunds_select_staff_or_own on public.refunds
    for select to authenticated
    using (
        private.current_app_role() in ('admin', 'compliance')
        or donor_id = (select id from public.donors where user_id = (select auth.uid()))
    );

drop policy if exists refunds_insert_own_or_admin on public.refunds;
create policy refunds_insert_own_or_admin on public.refunds
    for insert to authenticated
    with check (
        private.current_app_role() = 'admin'
        or donor_id = (select id from public.donors where user_id = (select auth.uid()))
    );

-- =============================================================================
-- DOWN
-- =============================================================================
-- Recreate the pre-fix policy bodies from 20260716090008_payment_failures_and_refunds.sql
-- and 20260716090004_ledger_entries.sql.
