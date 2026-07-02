-- =============================================================================
-- ADDON2 A7 — consent management + audit-trail retention policy
-- =============================================================================
-- consent_records is an append-style log of privacy/communication consents a
-- subject (donor/beneficiary/volunteer/vendor) has granted or revoked, with a
-- version string so a policy change can require re-consent. Donor consent is
-- self-service (own-row RLS); other subjects are captured server-side at
-- registration via the service-role client.
--
-- Retention: `audit_log_retention_days` is added to system_config but seeded
-- NULL (do NOT invent — AGENTS.md). audit_logs stays append-only; there is NO
-- destructive purge job here — enforcement is a documented SEAM a scheduled
-- sweep can implement once the client confirms a retention duration.
--
-- Depends on 20260702000001 (consent_type), M02 (users/current_donor_id),
-- M03 (system_config). snake_case · RLS · reversible DOWN.
-- =============================================================================

begin;

create table if not exists public.consent_records (
    id           uuid primary key default gen_random_uuid(),
    subject_type text not null check (subject_type in ('donor', 'beneficiary', 'volunteer', 'vendor')),
    subject_id   uuid not null,
    consent_type public.consent_type not null,
    -- policy version the subject consented to (re-consent when this changes)
    version      text not null default 'v1',
    granted_at   timestamptz not null default now(),
    revoked_at   timestamptz,
    created_at   timestamptz not null default now()
);

comment on table public.consent_records is
    'Privacy/communication consent log per subject. version enables re-consent on policy change; revoked_at set on withdrawal (data-privacy compliance, addon2).';

create index consent_records_subject_idx on public.consent_records (subject_type, subject_id, consent_type);

-- --- RLS ---------------------------------------------------------------------
-- Staff (admin/compliance) read all; a donor reads/records their OWN consent;
-- other subjects are server-mediated (service-role) at registration.
alter table public.consent_records enable row level security;

create policy consent_records_select_staff on public.consent_records
    for select to authenticated
    using (private.current_app_role() in ('admin', 'compliance'));

create policy consent_records_select_own_donor on public.consent_records
    for select to authenticated
    using (subject_type = 'donor' and subject_id = private.current_donor_id());

create policy consent_records_insert_own_donor on public.consent_records
    for insert to authenticated
    with check (subject_type = 'donor' and subject_id = private.current_donor_id());

create policy consent_records_write_admin on public.consent_records
    for all to authenticated
    using (private.current_app_role() = 'admin')
    with check (private.current_app_role() = 'admin');

-- --- retention policy config (seeded NULL — do NOT invent a duration) --------
insert into public.system_config (key, value, value_type, description) values
    ('audit_log_retention_days', null, 'number',
     'Retention window (days) for audit_logs before archival/purge (addon2 compliance). NULL = no policy set; append-only logs are never purged until an admin sets this and a sweep is enabled.')
on conflict (key) do nothing;

commit;

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- begin;
-- delete from public.system_config where key = 'audit_log_retention_days';
-- drop table if exists public.consent_records cascade;
-- commit;
