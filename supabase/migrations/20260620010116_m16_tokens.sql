-- =============================================================================
-- M16 — tokens + batches + authorisation + distribution (the token lifecycle)
-- =============================================================================
-- The real, redeemable food token (TOK-1..6). Replaces the donor module's
-- text-keyed `tokens` (whose token_type_id pointed at a campaign) with a
-- UUID token carrying a proper token_type (standard/special_care), an
-- encrypted one-time QR (stored as a hash, never raw), and a configurable expiry.
--
-- Enums used (M01): token_type, token_status, distribution_channel.
-- Depends on M14 (token_types, campaigns), M15 (donors, donations),
--   M05 (beneficiaries), M02 (users, current_app_role, set_updated_at).
-- Apply order: … → M15 → M16.
-- =============================================================================

begin;

-- --- token_batches (a donation mints a batch of tokens) ----------------------
create table public.token_batches (
    id           uuid primary key default gen_random_uuid(),
    donation_id  uuid references public.donations (id) on delete set null,
    campaign_id  uuid references public.campaigns (id) on delete set null,
    token_count  integer not null check (token_count > 0),
    status       text not null default 'minted'
        check (status in ('minted', 'distributed', 'cancelled')),
    minted_at    timestamptz not null default now()
);

create index token_batches_donation_idx on public.token_batches (donation_id);

-- --- tokens ------------------------------------------------------------------
create table public.tokens (
    id                      uuid primary key default gen_random_uuid(),
    serial_number           text not null unique,
    -- Encrypted one-time QR: store only a non-reversible hash of the payload
    -- (SEC-5). The raw payload lives only on the issued QR, never at rest.
    qr_hash                 text unique,
    token_type              public.token_type not null default 'standard',
    value_inr               integer not null check (value_inr > 0),
    status                  public.token_status not null default 'generated',
    -- provenance
    donor_id                uuid references public.donors (id)    on delete set null,
    donation_id             uuid references public.donations (id) on delete set null,
    campaign_id             uuid references public.campaigns (id) on delete set null,
    batch_id                uuid references public.token_batches (id) on delete set null,
    -- assignment (set on distribution; a non-app beneficiary may be null)
    beneficiary_id          uuid references public.beneficiaries (id) on delete set null,
    special_instructions    text,
    -- P2 seam (LOST): lost-token reissue points new token at the cancelled one.
    replacement_for_token_id uuid references public.tokens (id) on delete set null,
    -- lifecycle timestamps
    expires_at              timestamptz,
    minted_at               timestamptz not null default now(),
    distributed_at          timestamptz,
    redeemed_at             timestamptz,
    expired_at              timestamptz,
    cancelled_at            timestamptz,
    created_at              timestamptz not null default now(),
    updated_at              timestamptz not null default now()
);

comment on table public.tokens is 'Redeemable food tokens (TOK-1..6). token_type is standard/special_care; qr_hash is a non-reversible hash of the one-time QR payload.';

create index tokens_status_idx      on public.tokens (status);
create index tokens_donor_idx       on public.tokens (donor_id)       where donor_id is not null;
create index tokens_beneficiary_idx on public.tokens (beneficiary_id) where beneficiary_id is not null;
create index tokens_expires_idx     on public.tokens (expires_at)     where expires_at is not null;

create trigger tokens_set_updated_at
    before update on public.tokens
    for each row execute function public.set_updated_at();

-- --- token_authorisations (multi-level distribution authorisation, DIST-7) ----
create table public.token_authorisations (
    id            uuid primary key default gen_random_uuid(),
    token_id      uuid not null references public.tokens (id) on delete cascade,
    authorised_by uuid references public.users (id) on delete set null,
    status        text not null default 'authorised'
        check (status in ('authorised', 'revoked')),
    notes         text,
    authorised_at timestamptz not null default now()
);

create index token_authorisations_token_idx on public.token_authorisations (token_id);

-- --- token_distribution_records (DIST-1..6) ----------------------------------
create table public.token_distribution_records (
    id                   uuid primary key default gen_random_uuid(),
    token_id             uuid not null references public.tokens (id) on delete cascade,
    beneficiary_id       uuid references public.beneficiaries (id) on delete set null,
    distributed_by       uuid references public.users (id) on delete set null,
    channel              public.distribution_channel,
    distribution_location text,
    notes                text,
    distributed_at       timestamptz not null default now()
);

create index token_distribution_token_idx on public.token_distribution_records (token_id);

-- --- scheduled_redemption_dates (scheduled occasion + reminder, DIST-6) -------
create table public.scheduled_redemption_dates (
    id            uuid primary key default gen_random_uuid(),
    token_id      uuid references public.tokens (id) on delete cascade,
    campaign_id   uuid references public.campaigns (id) on delete cascade,
    scheduled_for date not null,
    location      text,
    status        text not null default 'scheduled'
        check (status in ('scheduled', 'completed', 'cancelled')),
    created_at    timestamptz not null default now()
);

create index scheduled_redemption_token_idx on public.scheduled_redemption_dates (token_id);

-- =============================================================================
-- RLS — spec §6 "Token Generation" (Donor=Own CRU, Admin=CRUD, Compliance/
-- Vendor_Manager/Volunteer=R) and "Token Distribution" (Volunteer=CR).
-- =============================================================================
alter table public.token_batches              enable row level security;
alter table public.tokens                     enable row level security;
alter table public.token_authorisations       enable row level security;
alter table public.token_distribution_records enable row level security;
alter table public.scheduled_redemption_dates enable row level security;

-- --- tokens ------------------------------------------------------------------
create policy tokens_select_own on public.tokens for select to authenticated
    using (donor_id = public.current_donor_id());
create policy tokens_select_staff on public.tokens for select to authenticated
    using (public.current_app_role() in ('admin', 'compliance', 'vendor_manager', 'volunteer'));
-- A donor may create/update tokens they fund (convert credit → token);
-- controlled status transitions (redeemed/expired) are driven server-side.
create policy tokens_insert_own on public.tokens for insert to authenticated
    with check (donor_id = public.current_donor_id());
create policy tokens_update_own on public.tokens for update to authenticated
    using (donor_id = public.current_donor_id())
    with check (donor_id = public.current_donor_id());
create policy tokens_write_admin on public.tokens for all to authenticated
    using (public.current_app_role() = 'admin')
    with check (public.current_app_role() = 'admin');

-- --- token_batches (read own via donation; staff manage) ---------------------
create policy token_batches_select_staff on public.token_batches for select to authenticated
    using (public.current_app_role() in ('admin', 'compliance', 'vendor_manager', 'volunteer'));
create policy token_batches_select_own on public.token_batches for select to authenticated
    using (exists (select 1 from public.donations d
                   where d.id = donation_id and d.donor_id = public.current_donor_id()));
create policy token_batches_write_admin on public.token_batches for all to authenticated
    using (public.current_app_role() = 'admin')
    with check (public.current_app_role() = 'admin');

-- --- token_authorisations (admin authorises; staff read) ---------------------
create policy token_auth_select_staff on public.token_authorisations for select to authenticated
    using (public.current_app_role() in ('admin', 'compliance', 'vendor_manager'));
create policy token_auth_write_admin on public.token_authorisations for all to authenticated
    using (public.current_app_role() = 'admin')
    with check (public.current_app_role() = 'admin');

-- --- token_distribution_records (Volunteer=CR; Donor=own; Admin=all) ---------
create policy token_dist_select_staff on public.token_distribution_records for select to authenticated
    using (public.current_app_role() in ('admin', 'compliance', 'vendor_manager', 'volunteer'));
create policy token_dist_select_own on public.token_distribution_records for select to authenticated
    using (exists (select 1 from public.tokens t
                   where t.id = token_id and t.donor_id = public.current_donor_id()));
-- Volunteers and donors may record a distribution they perform.
create policy token_dist_insert_distributor on public.token_distribution_records for insert to authenticated
    with check (
        public.current_app_role() in ('admin', 'volunteer')
        or exists (select 1 from public.tokens t
                   where t.id = token_id and t.donor_id = public.current_donor_id())
    );
create policy token_dist_write_admin on public.token_distribution_records for all to authenticated
    using (public.current_app_role() = 'admin')
    with check (public.current_app_role() = 'admin');

-- --- scheduled_redemption_dates ----------------------------------------------
create policy sched_select_staff on public.scheduled_redemption_dates for select to authenticated
    using (public.current_app_role() in ('admin', 'compliance', 'vendor_manager', 'volunteer'));
create policy sched_select_own on public.scheduled_redemption_dates for select to authenticated
    using (exists (select 1 from public.tokens t
                   where t.id = token_id and t.donor_id = public.current_donor_id()));
create policy sched_write_admin on public.scheduled_redemption_dates for all to authenticated
    using (public.current_app_role() = 'admin')
    with check (public.current_app_role() = 'admin');

commit;

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- begin;
-- drop table if exists public.scheduled_redemption_dates cascade;
-- drop table if exists public.token_distribution_records cascade;
-- drop table if exists public.token_authorisations       cascade;
-- drop table if exists public.tokens                     cascade;
-- drop table if exists public.token_batches              cascade;
-- commit;
