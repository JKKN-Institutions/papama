-- =============================================================================
-- M06 — convert beneficiaries.status from text+CHECK to beneficiary_status enum
-- =============================================================================
-- Follow-up to M05: M05 used a text+CHECK for beneficiaries.status to avoid
-- inventing an enum outside the types layer. Now that `beneficiary_status` is
-- declared in lib/types/enums.ts, this migration introduces the matching
-- Postgres enum and converts the column, for consistency with every other
-- status field. Values are identical (active | suspended | blocked), so the
-- cast is lossless. Touches only Developer-2's beneficiaries table.
--
-- Depends on M05. Apply order: … → M05 → M06.
-- =============================================================================

begin;

create type public.beneficiary_status as enum ('active', 'suspended', 'blocked');

-- Drop the old text default + CHECK, retype via cast, restore the default.
alter table public.beneficiaries alter column status drop default;
alter table public.beneficiaries drop constraint if exists beneficiaries_status_check;
alter table public.beneficiaries
    alter column status type public.beneficiary_status
    using status::public.beneficiary_status;
alter table public.beneficiaries alter column status set default 'active';

commit;

-- =============================================================================
-- DOWN (rollback) — revert to text + CHECK.
-- =============================================================================
-- begin;
-- alter table public.beneficiaries alter column status drop default;
-- alter table public.beneficiaries
--     alter column status type text using status::text;
-- alter table public.beneficiaries
--     add constraint beneficiaries_status_check
--     check (status in ('active', 'suspended', 'blocked'));
-- alter table public.beneficiaries alter column status set default 'active';
-- drop type if exists public.beneficiary_status;
-- commit;
