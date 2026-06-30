-- =============================================================================
-- ADDON #7 — Corporate CSR donor profiles
-- =============================================================================
-- Branches an existing donors row into a CORPORATE donor (company metadata + an
-- optional implementing NGO partner). It deliberately REUSES the existing donor
-- spine — donors, campaigns and donations.financial_year — rather than building a
-- parallel corporate-donation model. CSR reporting (lib/services/csr.ts) then
-- aggregates donations for these corporate donors and stores the result by
-- REUSING compliance_reports with report_type='csr' (already in the report_type
-- enum — no new enum value, no new report table).
--
-- 80G UTILIZATION CERTIFICATES ARE OUT OF SCOPE for Phase-1: they need an 80G
-- registration + an email/PDF provider (open items). The feature is gated behind
-- system_config.csr_80g_certificates_enabled (seeded false in 20260630000002).
-- This migration adds NO certificate storage; the app only shows a disabled
-- affordance + a marked TODO until those open items are resolved.
--
-- Depends on M15 (donors, current_donor_id), M13 (ngo_partners), M02 (users,
-- set_updated_at). Apply order: … → 20260630000007 → 20260630000008.
-- =============================================================================

begin;

create table public.corporate_csr_profiles (
    id                  uuid primary key default gen_random_uuid(),
    -- One CSR profile per donor: this BRANCHES a donors row into a corporate donor.
    donor_id            uuid not null unique references public.donors (id) on delete cascade,
    company_name        text not null,
    cin                 text,                                   -- Corporate Identification Number (optional)
    registration_number text,
    csr_focus_area      text,
    -- Optional implementing partner the company channels its CSR through.
    ngo_partner_id      uuid references public.ngo_partners (id) on delete set null,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);

comment on table public.corporate_csr_profiles is
    'Corporate CSR donor profile (addon #7). Branches a donors row into a company donor; reuses donors/campaigns/donations.financial_year. 80G certificates are gated off (csr_80g_certificates_enabled).';
comment on column public.corporate_csr_profiles.cin is
    'Corporate Identification Number. Optional; no 80G utilization-certificate logic is built yet (blocked on 80G registration + email/PDF provider).';

create index corporate_csr_profiles_ngo_idx
    on public.corporate_csr_profiles (ngo_partner_id) where ngo_partner_id is not null;

create trigger corporate_csr_profiles_set_updated_at
    before update on public.corporate_csr_profiles
    for each row execute function public.set_updated_at();

-- =============================================================================
-- RLS — mirrors the donors policies: the owning donor reads their own profile;
-- admin has full CRUD; compliance reads. The donor self-service write goes
-- through a server route on the service-role client AFTER the matrix check
-- (same discipline as donor/profile), so there is no anon write surface.
-- =============================================================================
alter table public.corporate_csr_profiles enable row level security;

create policy corporate_csr_select_own on public.corporate_csr_profiles for select to authenticated
    using (donor_id = public.current_donor_id());
create policy corporate_csr_select_staff on public.corporate_csr_profiles for select to authenticated
    using (public.current_app_role() in ('admin', 'compliance'));
-- The donor may create/update their own profile directly (RLS-scoped); the
-- server route still runs the matrix check first.
create policy corporate_csr_modify_own on public.corporate_csr_profiles for all to authenticated
    using (donor_id = public.current_donor_id())
    with check (donor_id = public.current_donor_id());
create policy corporate_csr_write_admin on public.corporate_csr_profiles for all to authenticated
    using (public.current_app_role() = 'admin')
    with check (public.current_app_role() = 'admin');

commit;

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- begin;
-- drop table if exists public.corporate_csr_profiles cascade;
-- commit;
