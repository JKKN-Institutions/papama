-- =============================================================================
-- M14 — campaigns + token_types catalog (donor-module reconciliation)
-- =============================================================================
-- RECONCILES the donor module's standalone schema (donor/supabase/schema.sql)
-- into the unified Phase-1 model. Two name collisions are resolved here:
--
--   * Donor module's `token_types` = a FUND-RAISING CAMPAIGN (title, target,
--     organization, category). That semantic is RENAMED to `campaigns`.
--   * PRD F-1 `token_types` = the Standard / Special-Care CATALOG (TOK-4).
--     That is the canonical meaning kept under the `token_types` name.
--
-- Both use UUID / enum PKs and REAL per-role RLS (replacing the donor module's
-- `using (true)` open policies, which were a security regression).
--
-- Enums used (M01): token_type. Depends on M01, M02 (current_app_role).
-- Apply order: M01 → … → M13 → M14.
-- =============================================================================

begin;

-- --- campaigns (was donor module's `token_types`) ----------------------------
create table public.campaigns (
    id                 uuid primary key default gen_random_uuid(),
    title              text not null,
    description        text not null default '',
    organization_name  text not null,
    category           text not null
        check (category in ('School', 'Orphanage', 'Disaster Relief', 'Community Kitchen')),
    location           text,
    image_url          text,
    target_tokens      integer not null default 0 check (target_tokens >= 0),
    raised_tokens      integer not null default 0 check (raised_tokens >= 0),
    token_price_inr    integer not null check (token_price_inr > 0),
    status             text not null default 'active'
        check (status in ('active', 'completed', 'paused')),
    -- P2 seam (EVT): event-campaign QR donations layer on top of this table.
    event_campaign_id  uuid,
    created_at         timestamptz not null default now(),
    updated_at         timestamptz not null default now()
);

comment on table public.campaigns is 'Fund-raising campaigns donors contribute to. Renamed from donor module''s campaign-style token_types to free that name for the PRD F-1 catalog.';

create index campaigns_status_idx   on public.campaigns (status);
create index campaigns_category_idx on public.campaigns (category);

create trigger campaigns_set_updated_at
    before update on public.campaigns
    for each row execute function public.set_updated_at();

-- --- token_types (PRD F-1 catalog: Standard / Special Care) -------------------
-- The monetary value is NOT duplicated here — it derives from system_config
-- (standard_token_value, special_care_multiplier) so there is one source of
-- truth. This table holds the category metadata + redemption restrictions.
create table public.token_types (
    code                  public.token_type primary key,        -- 'standard' | 'special_care'
    label                 text not null,
    description           text not null default '',
    -- Special Care is restricted to nutritious menu categories (TOK-4 / owner §4.2.1).
    is_restricted         boolean not null default false,
    -- vendor_menus.nutrition_category values a token of this type may redeem against.
    allowed_nutrition_categories text[] not null default '{}',
    requires_eligibility  boolean not null default false,       -- Special Care needs verified beneficiary
    created_at            timestamptz not null default now(),
    updated_at            timestamptz not null default now()
);

comment on table public.token_types is 'PRD F-1 catalog of token categories. Value derives from system_config, not stored here.';

create trigger token_types_set_updated_at
    before update on public.token_types
    for each row execute function public.set_updated_at();

-- =============================================================================
-- RLS
-- =============================================================================
alter table public.campaigns   enable row level security;
alter table public.token_types enable row level security;

-- --- campaigns: public read (powers the no-app/guest donate page); admin write
create policy campaigns_select_public on public.campaigns for select to anon, authenticated
    using (true);
create policy campaigns_insert_admin on public.campaigns for insert to authenticated
    with check (public.current_app_role() = 'admin');
create policy campaigns_update_admin on public.campaigns for update to authenticated
    using (public.current_app_role() = 'admin')
    with check (public.current_app_role() = 'admin');
create policy campaigns_delete_admin on public.campaigns for delete to authenticated
    using (public.current_app_role() = 'admin');

-- --- token_types: any authenticated user reads the catalog; admin writes -------
create policy token_types_select_authenticated on public.token_types for select to authenticated
    using (true);
create policy token_types_insert_admin on public.token_types for insert to authenticated
    with check (public.current_app_role() = 'admin');
create policy token_types_update_admin on public.token_types for update to authenticated
    using (public.current_app_role() = 'admin')
    with check (public.current_app_role() = 'admin');
create policy token_types_delete_admin on public.token_types for delete to authenticated
    using (public.current_app_role() = 'admin');

-- --- seed the two catalog rows (F-1) -----------------------------------------
insert into public.token_types (code, label, description, is_restricted, allowed_nutrition_categories, requires_eligibility)
values
    ('standard', 'Standard Food Token',
     'Redeemable for regular meals from any admin-approved menu item.',
     false, '{}', false),
    ('special_care', 'Special Care Token',
     'Higher-value token (up to 2x) for pregnant women and patients. Restricted to nutritious categories.',
     true, '{nutritious_meal, fruits_vegetables, milk_protein}', true)
on conflict (code) do nothing;

commit;

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- begin;
-- drop table if exists public.token_types cascade;
-- drop table if exists public.campaigns   cascade;
-- commit;
