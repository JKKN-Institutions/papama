-- =============================================================================
-- Volunteer self-registration → admin approval: widen volunteers.status
-- =============================================================================
-- Volunteers can now self-register (POST /api/volunteer/register), landing in a
-- 'pending' state that an admin approves (pending→active) or rejects
-- (pending→rejected) on /admin/volunteers. Previously volunteers.status only
-- allowed active|inactive|suspended and there was no creation path at all.
--
-- Adds 'pending' (new default for self-registration) and 'rejected' to the CHECK.
-- Existing rows are unaffected (their values stay in the allowed set).
--
-- Apply AFTER m09 (volunteers). Idempotent.
-- =============================================================================

begin;

alter table public.volunteers drop constraint if exists volunteers_status_check;

alter table public.volunteers
    add constraint volunteers_status_check
    check (status in ('pending', 'active', 'inactive', 'suspended', 'rejected'));

-- Self-registered volunteers start pending until an admin approves them.
alter table public.volunteers alter column status set default 'pending';

commit;

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- begin;
-- alter table public.volunteers alter column status set default 'active';
-- alter table public.volunteers drop constraint if exists volunteers_status_check;
-- alter table public.volunteers
--     add constraint volunteers_status_check
--     check (status in ('active', 'inactive', 'suspended'));
-- commit;
