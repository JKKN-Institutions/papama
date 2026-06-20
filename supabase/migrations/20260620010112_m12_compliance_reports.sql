-- =============================================================================
-- M12 — compliance_reports (Developer 2)   [Group A: zero Dev-1 references]
-- =============================================================================
-- Net-new. Metadata store for generated reports & compliance exports
-- (contract §10). No collision with Developer 1's 12 tables; references only
-- public.users. No Section-A decision.
--
-- Design: a report ROW is metadata + computed aggregates + a file reference.
--   * No shadow copies of source data (contract §10): `summary` holds computed
--     aggregates only; the report is generated server-side by reading the
--     canonical tables at run time.
--   * `file_url` is a storage REFERENCE (e.g. a Supabase Storage path the route
--     turns into a signed URL) — not the file bytes.
--   * No FK to any reported entity (reports span many rows / Dev-1 tables).
--
-- Enums: report_type (M07: csr | donation | redemption | settlement | compliance | audit).
-- Depends on M02 (users) and M07 (report_type). Apply order: … M11 -> M12.
-- =============================================================================

begin;

-- --- table -------------------------------------------------------------------
create table public.compliance_reports (
    id            uuid primary key default gen_random_uuid(),
    report_type   public.report_type not null,             -- csr | donation | redemption | settlement | compliance | audit
    title         text,
    params        jsonb not null default '{}'::jsonb,       -- generation inputs (filters, range, options)
    summary       jsonb not null default '{}'::jsonb,       -- computed aggregates (NOT a copy of source rows)
    file_url      text,                                     -- storage reference; route issues a signed URL
    period_start  date,                                     -- reporting window (nullable)
    period_end    date,
    generated_by  uuid references public.users (id) on delete set null,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),
    constraint compliance_reports_period_order
        check (period_start is null or period_end is null or period_start <= period_end)
);

comment on table  public.compliance_reports is 'Generated report / export metadata (contract §10). summary = computed aggregates only; canonical data is read at generation time, never shadow-copied.';
comment on column public.compliance_reports.file_url is 'Storage reference (e.g. Supabase Storage path). The export route returns a signed URL; bytes are not stored in this row.';

create index compliance_reports_type_idx    on public.compliance_reports (report_type);
create index compliance_reports_period_idx  on public.compliance_reports (period_start, period_end);
create index compliance_reports_created_idx on public.compliance_reports (created_at desc);

create trigger compliance_reports_set_updated_at
    before update on public.compliance_reports
    for each row execute function public.set_updated_at();

-- =============================================================================
-- RLS — reports are internal: read AND manage by admin + compliance only.
-- (Generation service may also insert via service-role, which bypasses RLS.)
-- =============================================================================
alter table public.compliance_reports enable row level security;

create policy compliance_reports_select_staff on public.compliance_reports for select to authenticated
    using (public.current_app_role() in ('admin', 'compliance'));

create policy compliance_reports_insert_staff on public.compliance_reports for insert to authenticated
    with check (public.current_app_role() in ('admin', 'compliance'));

create policy compliance_reports_update_staff on public.compliance_reports for update to authenticated
    using (public.current_app_role() in ('admin', 'compliance'))
    with check (public.current_app_role() in ('admin', 'compliance'));

-- DELETE: admin only.
create policy compliance_reports_delete_admin on public.compliance_reports for delete to authenticated
    using (public.current_app_role() = 'admin');

commit;

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- begin;
-- drop table if exists public.compliance_reports cascade;
-- commit;
