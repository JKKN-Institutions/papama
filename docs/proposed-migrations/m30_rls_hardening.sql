-- ============================================================================
-- Migration m30 — RLS hardening (PROPOSED — NOT APPLIED)
-- ----------------------------------------------------------------------------
-- Apply via Supabase MCP AFTER review. All policy names/definitions below were
-- verified against the LIVE database on 2026-06-24.
--
-- IMPORTANT APP PRE-REQ for part (b): app/api/donor/credits/route.ts was changed
-- to read standard_token_value via the SERVICE-ROLE client (not the donor's
-- session client). Ship that code change BEFORE applying (b), or donors lose the
-- mint-threshold display. All other system_config reads already use the
-- service-role client (which bypasses RLS), so they are unaffected.
-- ============================================================================

-- (a) users.* policies target PUBLIC (no TO clause) — they are safe by accident
--     (auth.uid()/current_app_role() are null for anon) but should be scoped.
alter policy users_select_own   on public.users to authenticated;
alter policy users_select_admin on public.users to authenticated;
alter policy users_insert_admin on public.users to authenticated;
alter policy users_update_admin on public.users to authenticated;
alter policy users_delete_admin on public.users to authenticated;

-- (b) system_config is readable by EVERY authenticated user (USING true). That
--     exposes fraud / face-match thresholds (face_liveness_min, face_match_threshold,
--     fraud_anomaly_*) — operational intelligence an attacker can calibrate against.
--     Restrict SELECT to staff. (Server routes use the service-role client.)
drop policy if exists system_config_select_authenticated on public.system_config;
create policy system_config_select_staff on public.system_config
  for select to authenticated
  using (current_app_role() = any (array['admin','compliance']::user_role[]));

-- (c) audit_logs_insert_self lets ANY authenticated user forge audit rows with
--     their own actor_id. All real audit writes go through the service-role
--     client, so the policy is pure liability — drop it. (The immutability
--     trigger blocking UPDATE/DELETE is unaffected and remains in force.)
drop policy if exists audit_logs_insert_self on public.audit_logs;

-- (d) volunteer_token_requests: vendor_manager has NO token-distribution role
--     (spec §6) yet can INSERT requests and SELECT all of them. Remove it. Admin
--     keeps full control (vtr_update_admin / vtr_delete_admin); volunteers use the
--     existing vtr_insert_own / vtr_select_own policies.
drop policy if exists vtr_insert_staff on public.volunteer_token_requests;
create policy vtr_insert_staff on public.volunteer_token_requests
  for insert to authenticated
  with check (current_app_role() = 'admin'::user_role);

drop policy if exists vtr_select_staff on public.volunteer_token_requests;
create policy vtr_select_staff on public.volunteer_token_requests
  for select to authenticated
  using (current_app_role() = any (array['admin','compliance']::user_role[]));

-- ----------------------------------------------------------------------------
-- DOWN (restore the prior, looser definitions)
-- alter policy users_select_own   on public.users to public;
-- alter policy users_select_admin on public.users to public;
-- alter policy users_insert_admin on public.users to public;
-- alter policy users_update_admin on public.users to public;
-- alter policy users_delete_admin on public.users to public;
-- drop policy if exists system_config_select_staff on public.system_config;
-- create policy system_config_select_authenticated on public.system_config
--   for select to authenticated using (true);
-- create policy audit_logs_insert_self on public.audit_logs
--   for insert to authenticated with check (actor_id = (select auth.uid()));
-- drop policy if exists vtr_insert_staff on public.volunteer_token_requests;
-- create policy vtr_insert_staff on public.volunteer_token_requests
--   for insert to authenticated with check (current_app_role() = any (array['admin','vendor_manager']::user_role[]));
-- drop policy if exists vtr_select_staff on public.volunteer_token_requests;
-- create policy vtr_select_staff on public.volunteer_token_requests
--   for select to authenticated using (current_app_role() = any (array['admin','vendor_manager','compliance']::user_role[]));
-- ============================================================================
