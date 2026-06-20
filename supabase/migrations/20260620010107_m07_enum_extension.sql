-- =============================================================================
-- M07 — enum extension: escalation_status + report_type (Developer 2)
-- =============================================================================
-- Adds the two net-new enum TYPES that the remaining Group-A feature migrations
-- (vendor escalations, compliance reports) depend on. Kept in a dedicated enum
-- migration so ALL Postgres enums live in the same layer as M01 (the M01 pattern),
-- and mirror lib/types/enums.ts exactly (single source of truth for values).
--
-- These TYPES are net-new and touch NONE of Developer 1's 12 tables. No enum-name
-- collision exists (Developer 1 used text + CHECK constraints).
--
-- Used by:
--   * escalation_status -> public.vendor_escalations.status   (M10)
--   * report_type       -> public.compliance_reports.report_type (M12)
--
-- Depends on nothing beyond a clean schema. Apply order: M01 … M06 -> M07.
-- =============================================================================

begin;

-- Vendor escalation / appeal thread lifecycle (contract §4).
create type public.escalation_status as enum (
    'open', 'in_progress', 'resolved', 'closed'
);

-- Generated report categories (contract §10). `audit` exports the audit trail.
create type public.report_type as enum (
    'csr', 'donation', 'redemption', 'settlement', 'compliance', 'audit'
);

commit;

-- =============================================================================
-- DOWN (rollback) — safe to run only BEFORE M10/M12 (the tables that use these).
-- =============================================================================
-- begin;
-- drop type if exists public.report_type;
-- drop type if exists public.escalation_status;
-- commit;
