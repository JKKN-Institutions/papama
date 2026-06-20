-- =============================================================================
-- M11 — fraud_flags (Developer 2)   [Group A: zero Dev-1 references]
-- =============================================================================
-- Net-new. The fraud dashboard's flag store (contract §9). No collision with
-- Developer 1's 12 tables; references only public.users. No Section-A decision.
--
-- Polymorphic target (KEY design choice): the flagged thing is stored as a jsonb
-- `entity = { "kind": <string>, "id": <string> }` EXACTLY as the contract §9
-- response shape — NOT as a hard FK. A fraud flag can point at a token (Dev-1),
-- a beneficiary, or a vendor; a real FK to any of those would be a Section-A
-- coupling. The jsonb keeps it reference-free and uniform. A CHECK enforces the
-- {kind,id} shape so the polymorphic contract can't be violated.
--
-- Enums (M01): fraud_flag_type, fraud_severity, fraud_status, fraud_detection_method.
-- Depends on M01 (enums) and M02 (users, current_app_role, set_updated_at).
-- Apply order: … M10 -> M11.
-- =============================================================================

begin;

-- --- table -------------------------------------------------------------------
create table public.fraud_flags (
    id               uuid primary key default gen_random_uuid(),
    flag_type        public.fraud_flag_type        not null,            -- duplicate_token | cloned_qr | tampered_qr | beneficiary_duplicate | vendor_anomaly
    severity         public.fraud_severity         not null,            -- low | medium | high  (must be classified explicitly)
    status           public.fraud_status           not null default 'open', -- open | resolved | dismissed
    detection_method public.fraud_detection_method,                     -- how it was caught (nullable)
    -- Polymorphic target as contract §9: { kind: string, id: string }. No FK.
    entity           jsonb not null,
    blocked          boolean not null default false,                    -- entity temporarily blocked (contract §9)
    resolved_by      uuid references public.users (id) on delete set null,
    resolution_notes text,
    resolved_at      timestamptz,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now(),
    -- Enforce the polymorphic {kind,id} shape without a cross-table FK.
    constraint fraud_flags_entity_shape check (
        jsonb_typeof(entity) = 'object'
        and entity ? 'kind'
        and entity ? 'id'
    )
);

comment on table  public.fraud_flags is 'Fraud dashboard flags (contract §9). entity is a polymorphic {kind,id} jsonb (token/beneficiary/vendor) — deliberately NO FK, so flagging a Dev-1 token needs no Section-A coupling.';
comment on column public.fraud_flags.entity is 'Polymorphic target { "kind": string, "id": string }. Shape enforced by CHECK; intentionally not a foreign key.';

create index fraud_flags_status_idx   on public.fraud_flags (status);
create index fraud_flags_type_idx     on public.fraud_flags (flag_type);
create index fraud_flags_severity_idx on public.fraud_flags (severity);
create index fraud_flags_entity_idx   on public.fraud_flags using gin (entity); -- lookups by entity kind/id

create trigger fraud_flags_set_updated_at
    before update on public.fraud_flags
    for each row execute function public.set_updated_at();

-- =============================================================================
-- RLS — fraud is internal: read AND manage by admin + compliance only.
-- (No vendor/volunteer/own access. Detection service inserts via service-role,
--  which bypasses RLS.)
-- =============================================================================
alter table public.fraud_flags enable row level security;

create policy fraud_flags_select_staff on public.fraud_flags for select to authenticated
    using (public.current_app_role() in ('admin', 'compliance'));

create policy fraud_flags_insert_staff on public.fraud_flags for insert to authenticated
    with check (public.current_app_role() in ('admin', 'compliance'));

create policy fraud_flags_update_staff on public.fraud_flags for update to authenticated
    using (public.current_app_role() in ('admin', 'compliance'))
    with check (public.current_app_role() in ('admin', 'compliance'));

-- DELETE: admin only (compliance manages/resolves but does not erase flags).
create policy fraud_flags_delete_admin on public.fraud_flags for delete to authenticated
    using (public.current_app_role() = 'admin');

commit;

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- begin;
-- drop table if exists public.fraud_flags cascade;
-- commit;
