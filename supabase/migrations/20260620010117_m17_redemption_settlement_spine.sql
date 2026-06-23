-- =============================================================================
-- M17 — redemption + settlement spine (THE MISSING MIDDLE)
-- =============================================================================
-- This is the connective tissue neither branch built: it ties a donor's token
-- to a vendor redemption, the proof-gated payment lock, value handling
-- (forfeit / pay-difference / co-pay), the fair-usage cooldown log, and the
-- settlement line items that roll up into the admin's vendor_settlements
-- headers (M10). It makes the PRD demo spine (steps 4–7) real.
--
-- Enums used (M01): payment_status. References tokens (M16), beneficiaries (M05),
--   vendors (M04), vendor_settlements (M10).
-- Apply order: … → M16 → M17.
-- =============================================================================

begin;

-- --- token_redemptions (RED-1..7 + PROOF-1..4) -------------------------------
create table public.token_redemptions (
    id                 uuid primary key default gen_random_uuid(),
    token_id           uuid not null references public.tokens (id) on delete restrict,
    beneficiary_id     uuid references public.beneficiaries (id) on delete set null,
    vendor_id          uuid not null references public.vendors (id) on delete restrict,
    -- value handling (owner §4.4)
    token_value_inr    integer not null,
    menu_value_inr     integer not null check (menu_value_inr >= 0),
    difference_paid_inr integer not null default 0 check (difference_paid_inr >= 0), -- beneficiary pays over-value
    co_pay_inr         integer not null default 0 check (co_pay_inr >= 0),           -- optional ₹5; ₹0 always allowed
    -- validation evidence
    geo_lat            numeric(9, 6),
    geo_lng            numeric(9, 6),
    face_hash_checked  boolean not null default false,
    -- proof of service (PROOF-1..4) — storage references, gates payment
    proof_photo_ref    text,
    proof_receipt_ref  text,
    proof_uploaded_at  timestamptz,
    -- payment lock: 'locked' until proof + validation, then 'released'/'held'
    payment_status     public.payment_status not null default 'locked',
    redeemed_at        timestamptz not null default now(),
    created_at         timestamptz not null default now(),
    updated_at         timestamptz not null default now()
);

comment on table public.token_redemptions is 'A redemption event at a vendor. payment_status stays locked until proof (photo+receipt) is uploaded and validations pass (PROOF-4).';

create index token_redemptions_token_idx   on public.token_redemptions (token_id);
create index token_redemptions_vendor_idx  on public.token_redemptions (vendor_id, redeemed_at desc);
create index token_redemptions_benef_idx   on public.token_redemptions (beneficiary_id, redeemed_at desc)
    where beneficiary_id is not null;
create index token_redemptions_payment_idx on public.token_redemptions (payment_status);

create trigger token_redemptions_set_updated_at
    before update on public.token_redemptions
    for each row execute function public.set_updated_at();

-- --- redemption_cooldown_log (fair-usage: 6h gap + max meals/day, RED-3) ------
-- Append-only log queried to enforce meal_cooldown_hours and max_meals_per_day
-- across vendors/locations for a beneficiary (face-hash identity).
create table public.redemption_cooldown_log (
    id             uuid primary key default gen_random_uuid(),
    beneficiary_id uuid references public.beneficiaries (id) on delete set null,
    face_hash      text,                              -- identity signal for non-registered beneficiaries
    token_id       uuid references public.tokens (id) on delete set null,
    vendor_id      uuid references public.vendors (id) on delete set null,
    redeemed_at    timestamptz not null default now()
);

create index cooldown_benef_time_idx on public.redemption_cooldown_log (beneficiary_id, redeemed_at desc)
    where beneficiary_id is not null;
create index cooldown_facehash_time_idx on public.redemption_cooldown_log (face_hash, redeemed_at desc)
    where face_hash is not null;

-- --- forfeited_balances (under-value remainder retained as system credit) -----
create table public.forfeited_balances (
    id              uuid primary key default gen_random_uuid(),
    token_id        uuid references public.tokens (id) on delete set null,
    redemption_id   uuid references public.token_redemptions (id) on delete cascade,
    forfeited_inr   integer not null check (forfeited_inr >= 0),
    created_at      timestamptz not null default now()
);

comment on table public.forfeited_balances is 'Unused token value retained by system/admin when menu value < token value (owner §4.4). Never returned to beneficiary; hidden from donor.';

create index forfeited_redemption_idx on public.forfeited_balances (redemption_id);

-- --- settlement_line_items (rolls redemptions into M10 settlement headers) ----
create table public.settlement_line_items (
    id            uuid primary key default gen_random_uuid(),
    settlement_id uuid not null references public.vendor_settlements (id) on delete cascade,
    redemption_id uuid not null references public.token_redemptions (id) on delete restrict,
    amount_inr    numeric(12, 2) not null check (amount_inr >= 0),
    created_at    timestamptz not null default now()
);

comment on table public.settlement_line_items is 'Per-redemption payout lines that aggregate into vendor_settlements (M10), which were created header-only pending this table.';

create unique index settlement_line_items_redemption_key on public.settlement_line_items (redemption_id);
create index settlement_line_items_settlement_idx on public.settlement_line_items (settlement_id);

-- =============================================================================
-- RLS
--   token_redemptions  — spec §6 "Token Redemption" (Admin CRUD, Vendor CR own
--                        scan/proof, Compliance/Vendor_Manager R) + "Proof of
--                        Service" (Vendor C own).
--   cooldown / forfeited — internal: admin + compliance only.
--   settlement_line_items — spec §6 "Vendor Settlement" (Admin CRUD, Compliance
--                        R, Vendor own view).
-- =============================================================================
alter table public.token_redemptions      enable row level security;
alter table public.redemption_cooldown_log enable row level security;
alter table public.forfeited_balances     enable row level security;
alter table public.settlement_line_items  enable row level security;

-- --- token_redemptions -------------------------------------------------------
create policy redemptions_select_staff on public.token_redemptions for select to authenticated
    using (public.current_app_role() in ('admin', 'compliance', 'vendor_manager'));
create policy redemptions_select_own_vendor on public.token_redemptions for select to authenticated
    using (exists (select 1 from public.vendors v where v.id = vendor_id and v.owner_id = auth.uid()));
-- A vendor creates the redemption (scan) and updates it (proof upload) for own outlet.
create policy redemptions_insert_own_vendor on public.token_redemptions for insert to authenticated
    with check (exists (select 1 from public.vendors v where v.id = vendor_id and v.owner_id = auth.uid()));
create policy redemptions_update_own_vendor on public.token_redemptions for update to authenticated
    using (exists (select 1 from public.vendors v where v.id = vendor_id and v.owner_id = auth.uid()))
    with check (exists (select 1 from public.vendors v where v.id = vendor_id and v.owner_id = auth.uid()));
create policy redemptions_write_admin on public.token_redemptions for all to authenticated
    using (public.current_app_role() = 'admin')
    with check (public.current_app_role() = 'admin');

-- --- redemption_cooldown_log (admin/compliance read; vendor inserts own) ------
create policy cooldown_select_staff on public.redemption_cooldown_log for select to authenticated
    using (public.current_app_role() in ('admin', 'compliance'));
create policy cooldown_insert_vendor on public.redemption_cooldown_log for insert to authenticated
    with check (
        public.current_app_role() = 'admin'
        or exists (select 1 from public.vendors v where v.id = vendor_id and v.owner_id = auth.uid())
    );

-- --- forfeited_balances (system credit: admin + compliance only) -------------
create policy forfeited_select_staff on public.forfeited_balances for select to authenticated
    using (public.current_app_role() in ('admin', 'compliance'));
create policy forfeited_write_admin on public.forfeited_balances for all to authenticated
    using (public.current_app_role() = 'admin')
    with check (public.current_app_role() = 'admin');

-- --- settlement_line_items ---------------------------------------------------
create policy settlement_lines_select_staff on public.settlement_line_items for select to authenticated
    using (public.current_app_role() in ('admin', 'compliance'));
create policy settlement_lines_select_own_vendor on public.settlement_line_items for select to authenticated
    using (exists (
        select 1 from public.vendor_settlements s
        join public.vendors v on v.id = s.vendor_id
        where s.id = settlement_id and v.owner_id = auth.uid()
    ));
create policy settlement_lines_write_admin on public.settlement_line_items for all to authenticated
    using (public.current_app_role() = 'admin')
    with check (public.current_app_role() = 'admin');

commit;

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- begin;
-- drop table if exists public.settlement_line_items   cascade;
-- drop table if exists public.forfeited_balances      cascade;
-- drop table if exists public.redemption_cooldown_log cascade;
-- drop table if exists public.token_redemptions       cascade;
-- commit;
