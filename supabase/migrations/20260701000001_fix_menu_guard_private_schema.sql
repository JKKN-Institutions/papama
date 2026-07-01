-- FORWARD FIX (Finding B): repoint guard_menu_controlled_cols to private.current_app_role().
--
-- After m34 moved current_app_role() into the `private` schema and dropped the public copy,
-- guard_menu_controlled_cols() still called public.current_app_role() — which no longer
-- exists — so any non-service_role, non-admin menu edit would ERROR instead of being cleanly
-- guarded. Its sibling guards (vendor, volunteer) already call private.current_app_role();
-- this aligns the menu guard with them. Body is otherwise identical to the recovered version.

CREATE OR REPLACE FUNCTION public.guard_menu_controlled_cols()
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
    if new.approval_status is distinct from old.approval_status
       or new.special_care_equivalent_approved is distinct from old.special_care_equivalent_approved then
        raise exception 'only admin/vendor_manager may change menu approval_status or special-care approval';
    end if;
    return new;
end;
$function$;
