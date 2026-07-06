-- RECOVERED from live DB (already applied under ledger version 20260624105730 / m31_guard_service_role_bypass).
-- Source reconstructed for db-reset reproducibility. Idempotent.
--
-- Column-guard trigger functions: block non-admin/non-vendor_manager users from changing
-- controlled columns; service_role short-circuits (trusted server writes). Verbatim from live.
--
-- KNOWN LIVE INCONSISTENCY (recovered as-is): guard_menu_controlled_cols below calls
-- public.current_app_role(), but m34 moved that helper to the `private` schema, so the
-- public copy no longer exists — the menu guard would ERROR for a non-service_role,
-- non-admin menu edit. This is FIXED forward in
-- 20260701000001_fix_menu_guard_private_schema.sql (kept separate to preserve the true
-- historical state at this ledger position).

CREATE OR REPLACE FUNCTION public.guard_vendor_controlled_cols()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
    if auth.role() = 'service_role' then
        return new;
    end if;
    if private.current_app_role() in ('admin', 'vendor_manager') then
        return new;
    end if;
    if new.status          is distinct from old.status
       or new.kyc_status      is distinct from old.kyc_status
       or new.hygiene_rating  is distinct from old.hygiene_rating
       or new.owner_id        is distinct from old.owner_id
       or new.rating_avg      is distinct from old.rating_avg
       or new.feedback_count  is distinct from old.feedback_count
       or new.complaint_count is distinct from old.complaint_count
       or new.quality_score   is distinct from old.quality_score then
        raise exception 'only admin/vendor_manager may change vendor status, kyc_status, hygiene_rating, owner, rating_avg, feedback_count, complaint_count, or quality_score';
    end if;
    return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.guard_menu_controlled_cols()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
    if auth.role() = 'service_role' then
        return new;
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

CREATE OR REPLACE FUNCTION public.guard_volunteer_controlled_cols()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
    if auth.role() = 'service_role' then
        return new;
    end if;
    if private.current_app_role() in ('admin', 'vendor_manager') then
        return new;
    end if;
    if new.status        is distinct from old.status
       or new.user_id       is distinct from old.user_id
       or new.assigned_area is distinct from old.assigned_area
       or new.approved_by   is distinct from old.approved_by
       or new.approved_at   is distinct from old.approved_at then
        raise exception 'only admin/vendor_manager may change volunteer status, user_id, zone or approval fields';
    end if;
    return new;
end;
$function$;
