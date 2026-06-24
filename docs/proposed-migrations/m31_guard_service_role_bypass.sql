-- ============================================================================
-- Migration m31 — controlled-column guards: service-role bypass (PROPOSED — NOT APPLIED)
-- ----------------------------------------------------------------------------
-- Apply via the Supabase SQL editor / MCP AFTER review. Function bodies below
-- were verified byte-for-byte against the LIVE database on 2026-06-24 (incl. the
-- `SET search_path TO ''` hardening that was applied after m04/m09 shipped).
--
-- WHY ------------------------------------------------------------------------
-- Staff routes (PATCH /api/admin/vendors, the volunteer-status and menu-approval
-- routes) authorize via the app permission matrix and THEN run their UPDATE on
-- the service-role client (createAdminClient), which bypasses RLS.
--
-- These three BEFORE UPDATE trigger functions, however, fire for EVERY update —
-- triggers are not RLS — and allow a controlled-column change only when
-- public.current_app_role() in ('admin','vendor_manager'). current_app_role() is
-- `select role from public.users where id = auth.uid()`, but under the
-- service-role JWT there is no `sub`, so auth.uid() is NULL → current_app_role()
-- is NULL → the guard RAISES:
--   "only admin/vendor_manager may change vendor status, kyc_status, ..."
-- That is why vendor KYC verify / approve / suspend (and the sibling volunteer /
-- menu actions) fail with a 400/500 even for a real admin.
--
-- The guards exist to stop a VENDOR / VOLUNTEER session client (role
-- 'authenticated') from self-escalating their own controlled columns. They were
-- never meant to block trusted server code holding the service-role key — that
-- key already bypasses RLS entirely and is only reachable through routes that
-- gate on the permission matrix first. Adding the bypass does NOT weaken
-- security; it removes an accidental block.
--
-- FIX ------------------------------------------------------------------------
-- Early-return for the service-role JWT (auth.role() = 'service_role') BEFORE the
-- current_app_role() check. The self-escalation protection is fully preserved for
-- the 'authenticated' path. search_path stays '' so auth.role() /
-- public.current_app_role() remain schema-qualified.
-- ============================================================================

begin;

-- (1) vendors: status / kyc_status / hygiene_rating / owner_id ----------------
create or replace function public.guard_vendor_controlled_cols()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
    if auth.role() = 'service_role' then
        return new;  -- trusted server path (route already gated on the matrix)
    end if;
    if public.current_app_role() in ('admin', 'vendor_manager') then
        return new;
    end if;
    if new.status        is distinct from old.status
       or new.kyc_status is distinct from old.kyc_status
       or new.hygiene_rating is distinct from old.hygiene_rating
       or new.owner_id   is distinct from old.owner_id then
        raise exception 'only admin/vendor_manager may change vendor status, kyc_status, hygiene_rating, or owner';
    end if;
    return new;
end;
$function$;

-- (2) vendor_menus: approval_status / special-care approval -------------------
create or replace function public.guard_menu_controlled_cols()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
    if auth.role() = 'service_role' then
        return new;  -- trusted server path (route already gated on the matrix)
    end if;
    if public.current_app_role() in ('admin', 'vendor_manager') then
        return new;
    end if;
    if new.approval_status is distinct from old.approval_status
       or new.special_care_equivalent_approved is distinct from old.special_care_equivalent_approved then
        raise exception 'only admin/vendor_manager may change menu approval_status or special-care approval';
    end if;
    return new;
end;
$function$;

-- (3) volunteers: status / user_id --------------------------------------------
create or replace function public.guard_volunteer_controlled_cols()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
    if auth.role() = 'service_role' then
        return new;  -- trusted server path (route already gated on the matrix)
    end if;
    if public.current_app_role() in ('admin', 'vendor_manager') then
        return new;
    end if;
    if new.status  is distinct from old.status
       or new.user_id is distinct from old.user_id then
        raise exception 'only admin/vendor_manager may change volunteer status or user_id';
    end if;
    return new;
end;
$function$;

commit;

-- ----------------------------------------------------------------------------
-- DOWN (restore the prior definitions — drop the service-role bypass)
-- ----------------------------------------------------------------------------
-- begin;
-- create or replace function public.guard_vendor_controlled_cols()
-- returns trigger language plpgsql set search_path to '' as $function$
-- begin
--     if public.current_app_role() in ('admin', 'vendor_manager') then return new; end if;
--     if new.status is distinct from old.status
--        or new.kyc_status is distinct from old.kyc_status
--        or new.hygiene_rating is distinct from old.hygiene_rating
--        or new.owner_id is distinct from old.owner_id then
--         raise exception 'only admin/vendor_manager may change vendor status, kyc_status, hygiene_rating, or owner';
--     end if;
--     return new;
-- end; $function$;
-- create or replace function public.guard_menu_controlled_cols()
-- returns trigger language plpgsql set search_path to '' as $function$
-- begin
--     if public.current_app_role() in ('admin', 'vendor_manager') then return new; end if;
--     if new.approval_status is distinct from old.approval_status
--        or new.special_care_equivalent_approved is distinct from old.special_care_equivalent_approved then
--         raise exception 'only admin/vendor_manager may change menu approval_status or special-care approval';
--     end if;
--     return new;
-- end; $function$;
-- create or replace function public.guard_volunteer_controlled_cols()
-- returns trigger language plpgsql set search_path to '' as $function$
-- begin
--     if public.current_app_role() in ('admin', 'vendor_manager') then return new; end if;
--     if new.status is distinct from old.status or new.user_id is distinct from old.user_id then
--         raise exception 'only admin/vendor_manager may change volunteer status or user_id';
--     end if;
--     return new;
-- end; $function$;
-- commit;
-- ============================================================================
