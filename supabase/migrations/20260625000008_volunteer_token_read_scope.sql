-- m: volunteer token-read scope tightening
--
-- WHY
-- ---
-- The original M16 policy `tokens_select_staff` (supabase/migrations/
-- 20260620010116_m16_tokens.sql:126) grants role 'volunteer' a BROAD SELECT over
-- the entire `tokens` table:
--     using (current_app_role() in ('admin','compliance','vendor_manager','volunteer'))
-- so a signed-in volunteer can read EVERY token in the system, not just the ones
-- they hold. There is no volunteer-scoped token RLS and no held-by column on
-- `tokens` (holdings are derived, not stored), so the "only my held tokens"
-- guarantee is enforced only in app code.
--
-- This migration removes 'volunteer' from the broad staff read on the `tokens`
-- table. This is SAFE: the volunteer portal reads its held tokens through the
-- scoped service-role path in app/api/volunteer/tokens/route.ts (which resolves
-- the volunteer's user_id and derives the held set via lib/volunteer/holdings),
-- NOT through the volunteer's own RLS context. No volunteer UI relies on a
-- session-scoped direct SELECT against `tokens`. Admin / compliance /
-- vendor_manager broad reads are unchanged.
--
-- SCOPE NOTE: only the `tokens` table is tightened here (the audit finding,
-- db-schema-snapshot.md:631). The sibling token tables still grant 'volunteer'
-- broad SELECT — token_batches (m16:141), token_distribution_records (m16:158),
-- scheduled_redemption_dates (m16:175). token_distribution_records in particular
-- backs the derived-holdings query and the volunteer insert-on-distribute policy
-- (token_dist_insert_distributor, m16:163), so leave it as-is; revisit the others
-- in a follow-up if a defence-in-depth pass is wanted.
--
-- MUST BE APPLIED for the RLS tightening to take effect (the onboarding seam in
-- app/api/admin/volunteers needs NO migration and works immediately).

begin;

drop policy if exists tokens_select_staff on public.tokens;

create policy tokens_select_staff on public.tokens for select to authenticated
    using (private.current_app_role() in ('admin', 'compliance', 'vendor_manager'));

commit;

-- DOWN (rollback) — restore the M16 grant that included 'volunteer'.
-- begin;
--   drop policy if exists tokens_select_staff on public.tokens;
--   create policy tokens_select_staff on public.tokens for select to authenticated
--       using (private.current_app_role() in ('admin', 'compliance', 'vendor_manager', 'volunteer'));
-- commit;
