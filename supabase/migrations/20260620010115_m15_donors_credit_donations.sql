-- =============================================================================
-- M15 — donors, donor credit, donations (donor-module reconciliation)
-- =============================================================================
-- Brings the donor module's text-keyed, openly-readable donor tables into the
-- unified model: UUID PKs, linked to auth via donors.user_id, REAL per-role RLS.
--
-- Terminology is "credit", never "wallet" (F-6 / DON positioning).
-- 80G seams (client Q5): donors.pan_number, donations.financial_year — present
-- but unused until the entity has 80G registration.
--
-- Enums used (M01): credit_transaction_type, donation_status.
-- Depends on M01, M02 (users, current_app_role, set_updated_at), M14 (campaigns).
-- Apply order: … → M14 → M15.
-- =============================================================================

begin;

-- --- donors ------------------------------------------------------------------
create table public.donors (
    id                   uuid primary key default gen_random_uuid(),
    -- The login behind this donor. Nullable: guest/no-app donations create a
    -- donor row with no user until/if they later sign up.
    user_id              uuid references public.users (id) on delete set null,
    name                 text,
    email                text,
    avatar_url           text,
    pan_number           text,                -- 80G seam (Q5); nullable
    impact_score         integer not null default 0,
    total_donated_tokens integer not null default 0,
    joined_date          date not null default current_date,
    created_at           timestamptz not null default now(),
    updated_at           timestamptz not null default now()
);

comment on table public.donors is 'Donor profiles. user_id links to auth (nullable for guest donors). Replaces donor module''s text-keyed donors with open RLS.';

create unique index donors_user_id_key on public.donors (user_id) where user_id is not null;
create index donors_email_idx on public.donors (email) where email is not null;

create trigger donors_set_updated_at
    before update on public.donors
    for each row execute function public.set_updated_at();

-- --- RLS helper: the caller's donor id (mirrors current_app_role pattern) -----
create or replace function public.current_donor_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
    select id from public.donors where user_id = auth.uid();
$$;

comment on function public.current_donor_id() is 'Returns the calling user''s donors.id for use in RLS. SECURITY DEFINER to avoid recursion on public.donors.';

revoke all on function public.current_donor_id() from public;
grant execute on function public.current_donor_id() to authenticated, service_role;

-- --- donor_credits (one credit ledger balance per donor) ---------------------
create table public.donor_credits (
    id                  uuid primary key default gen_random_uuid(),
    donor_id            uuid not null references public.donors (id) on delete cascade,
    balance_inr         integer not null default 0 check (balance_inr >= 0),
    reserved_balance_inr integer not null default 0 check (reserved_balance_inr >= 0),
    updated_at          timestamptz not null default now()
);

create unique index donor_credits_donor_key on public.donor_credits (donor_id);

create trigger donor_credits_set_updated_at
    before update on public.donor_credits
    for each row execute function public.set_updated_at();

-- --- credit_transactions (append-only credit ledger) -------------------------
create table public.credit_transactions (
    id          uuid primary key default gen_random_uuid(),
    donor_id    uuid not null references public.donors (id) on delete cascade,
    amount_inr  integer not null,                      -- signed: + purchase, - allocation
    type        public.credit_transaction_type not null,
    description text not null default '',
    created_at  timestamptz not null default now()
);

create index credit_transactions_donor_idx on public.credit_transactions (donor_id, created_at desc);

-- --- payment_methods ---------------------------------------------------------
create table public.payment_methods (
    id           uuid primary key default gen_random_uuid(),
    donor_id     uuid not null references public.donors (id) on delete cascade,
    provider     text not null,            -- e.g. UPI | Net Banking | Card
    method_type  text not null,            -- e.g. upi | bank | card
    display_name text not null,
    is_default   boolean not null default false,
    created_at   timestamptz not null default now()
);

create index payment_methods_donor_idx on public.payment_methods (donor_id);

-- --- donations ---------------------------------------------------------------
create table public.donations (
    id              uuid primary key default gen_random_uuid(),
    donor_id        uuid references public.donors (id) on delete set null,  -- nullable: anonymous/guest
    campaign_id     uuid references public.campaigns (id) on delete set null,
    amount_inr      integer not null check (amount_inr > 0),
    token_amount    integer not null default 0,         -- tokens funded by this donation
    status          public.donation_status not null default 'pending',
    payment_ref     text,                               -- gateway/UTR reference
    financial_year  text,                               -- 80G seam (Q5)
    event_campaign_id uuid,                             -- P2 seam (EVT)
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create index donations_donor_idx    on public.donations (donor_id) where donor_id is not null;
create index donations_campaign_idx on public.donations (campaign_id) where campaign_id is not null;
create index donations_status_idx   on public.donations (status);

create trigger donations_set_updated_at
    before update on public.donations
    for each row execute function public.set_updated_at();

-- =============================================================================
-- RLS — spec §6 "Donor Donation & Credit": Donor=Own, Admin=CRUD, Compliance=R.
-- Guest donations go through a server route using the service-role client
-- (bypasses RLS), so there is NO anon write surface here.
-- =============================================================================
alter table public.donors             enable row level security;
alter table public.donor_credits      enable row level security;
alter table public.credit_transactions enable row level security;
alter table public.payment_methods    enable row level security;
alter table public.donations          enable row level security;

-- --- donors ------------------------------------------------------------------
create policy donors_select_own on public.donors for select to authenticated
    using (user_id = auth.uid());
create policy donors_select_staff on public.donors for select to authenticated
    using (public.current_app_role() in ('admin', 'compliance'));
create policy donors_update_own on public.donors for update to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid());
create policy donors_write_admin on public.donors for all to authenticated
    using (public.current_app_role() = 'admin')
    with check (public.current_app_role() = 'admin');

-- --- donor_credits (read own / staff; writes via service role or admin) -------
create policy donor_credits_select_own on public.donor_credits for select to authenticated
    using (donor_id = public.current_donor_id());
create policy donor_credits_select_staff on public.donor_credits for select to authenticated
    using (public.current_app_role() in ('admin', 'compliance'));
create policy donor_credits_write_admin on public.donor_credits for all to authenticated
    using (public.current_app_role() = 'admin')
    with check (public.current_app_role() = 'admin');

-- --- credit_transactions (read own / staff; inserts via service role or admin)-
create policy credit_tx_select_own on public.credit_transactions for select to authenticated
    using (donor_id = public.current_donor_id());
create policy credit_tx_select_staff on public.credit_transactions for select to authenticated
    using (public.current_app_role() in ('admin', 'compliance'));
create policy credit_tx_insert_admin on public.credit_transactions for insert to authenticated
    with check (public.current_app_role() = 'admin');

-- --- payment_methods (donor manages own) -------------------------------------
create policy payment_methods_select_own on public.payment_methods for select to authenticated
    using (donor_id = public.current_donor_id());
create policy payment_methods_modify_own on public.payment_methods for all to authenticated
    using (donor_id = public.current_donor_id())
    with check (donor_id = public.current_donor_id());
create policy payment_methods_select_staff on public.payment_methods for select to authenticated
    using (public.current_app_role() in ('admin', 'compliance'));

-- --- donations ---------------------------------------------------------------
create policy donations_select_own on public.donations for select to authenticated
    using (donor_id = public.current_donor_id());
create policy donations_select_staff on public.donations for select to authenticated
    using (public.current_app_role() in ('admin', 'compliance'));
create policy donations_write_admin on public.donations for all to authenticated
    using (public.current_app_role() = 'admin')
    with check (public.current_app_role() = 'admin');

commit;

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- begin;
-- drop table if exists public.donations          cascade;
-- drop table if exists public.payment_methods    cascade;
-- drop table if exists public.credit_transactions cascade;
-- drop table if exists public.donor_credits      cascade;
-- drop function if exists public.current_donor_id();
-- drop table if exists public.donors             cascade;
-- commit;
