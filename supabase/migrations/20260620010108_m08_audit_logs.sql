-- =============================================================================
-- M08 — audit_logs (Developer 2)  [Group A: zero Dev-1 references]
-- =============================================================================
-- Net-new. The append-only audit trail every mutating admin action writes to
-- (contract §1 "Audit logging", §2 "audit_logs is append-only", §10). No
-- collision with Developer 1's 12 tables; references only public.users. No
-- Section-A decision.
--
-- Design notes:
--   * Polymorphic target: entity_table (text) + entity_id (text) — text so it
--     can reference ANY entity, including Developer-1's text-keyed rows, WITHOUT
--     a cross-table FK (a FK would be a Section-A coupling). Same soft-link
--     pattern as users.donor_id.
--   * actor_id is nullable + ON DELETE SET NULL so deleting a user never erases
--     or blocks history. actor_role snapshots the role AT action time.
--   * APPEND-ONLY is enforced two ways: (1) no UPDATE/DELETE RLS policy for
--     normal roles, AND (2) a BEFORE UPDATE/DELETE trigger that hard-raises —
--     this also stops the service-role client (which BYPASSES RLS) from ever
--     rewriting the trail. There is intentionally NO updated_at (rows are immutable).
--
-- Depends on M02 (users, current_app_role). Apply order: … M07 -> M08.
-- =============================================================================

begin;

-- --- table -------------------------------------------------------------------
create table public.audit_logs (
    id           uuid primary key default gen_random_uuid(),
    actor_id     uuid references public.users (id) on delete set null, -- who acted; null = system/service action
    actor_role   public.user_role,                                     -- role snapshot at action time
    action       text not null,                       -- e.g. 'vendor.approve', 'beneficiary.reject', 'settlement.lock'
    entity_table text not null,                        -- target entity kind, e.g. 'vendors', 'beneficiary_registrations'
    entity_id    text,                                 -- target row id (text: works for uuid or Dev-1 text keys). No FK by design.
    summary      text,                                 -- human-readable one-line description
    metadata     jsonb not null default '{}'::jsonb,   -- structured context / before-after diff
    created_at   timestamptz not null default now()
);

comment on table  public.audit_logs is 'Append-only audit trail (contract §1/§2/§10). Immutable: no updates or deletes, enforced by trigger even for service_role.';
comment on column public.audit_logs.entity_id is 'Soft polymorphic target (text). No FK — cross-table coupling to Dev-1 is a Section-A decision.';

create index audit_logs_actor_idx   on public.audit_logs (actor_id) where actor_id is not null;
create index audit_logs_entity_idx  on public.audit_logs (entity_table, entity_id);
create index audit_logs_action_idx  on public.audit_logs (action);
create index audit_logs_created_idx on public.audit_logs (created_at desc);

-- --- immutability guard (blocks UPDATE/DELETE for everyone, incl. service_role)
create or replace function public.audit_logs_block_mutation()
returns trigger
language plpgsql
as $$
begin
    raise exception 'audit_logs is append-only: % is not permitted', tg_op;
end;
$$;

create trigger audit_logs_no_update
    before update on public.audit_logs
    for each row execute function public.audit_logs_block_mutation();

create trigger audit_logs_no_delete
    before delete on public.audit_logs
    for each row execute function public.audit_logs_block_mutation();

-- =============================================================================
-- RLS — read for admin/compliance; insert-only for authenticated (as self);
-- NO update/delete policies (append-only, contract §2). Server-side system
-- logging uses the service-role client, which bypasses RLS for INSERT.
-- =============================================================================
alter table public.audit_logs enable row level security;

-- SELECT: only admin + compliance may read the trail.
create policy audit_logs_select_staff on public.audit_logs for select to authenticated
    using (public.current_app_role() in ('admin', 'compliance'));

-- INSERT: an authenticated user may write a log entry only AS THEMSELVES
-- (cannot forge another actor). System/service inserts bypass RLS via service_role.
create policy audit_logs_insert_self on public.audit_logs for insert to authenticated
    with check (actor_id = auth.uid());

-- (no UPDATE policy, no DELETE policy — append-only)

commit;

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- begin;
-- drop trigger if exists audit_logs_no_delete on public.audit_logs;
-- drop trigger if exists audit_logs_no_update on public.audit_logs;
-- drop function if exists public.audit_logs_block_mutation();
-- drop table if exists public.audit_logs cascade;
-- commit;
