-- =============================================================================
-- M25 — vendors.settlement_cycle (per-vendor payout cadence)
-- =============================================================================
-- The PRD requires settlements to run on the VENDOR's chosen cycle, but the
-- vendors table had no such column — runSettlement aggregated every vendor under
-- one admin-chosen label (lib/services/settlement.ts). This adds the vendor's own
-- cadence preference.
--
-- NULLABLE: a vendor who hasn't picked a cycle yet falls back to the cadence the
-- admin passes to the settlement run (no invented default). The vendor sets it via
-- the profile page; the settlement engine honours it with period windowing.
--
-- Reuses the existing settlement_cycle enum (M01): daily | twice_weekly | weekly.
-- The existing guard_vendor_controlled_cols() trigger does NOT cover this column,
-- so a vendor CAN set their own cycle through vendors_update_own — which is the
-- intended behaviour.
--
-- Depends on M01 (settlement_cycle enum) and M04 (vendors). Apply AFTER M04.
-- =============================================================================

begin;

alter table public.vendors
    add column if not exists settlement_cycle public.settlement_cycle;

comment on column public.vendors.settlement_cycle is
    'Vendor-chosen payout cadence (daily | twice_weekly | weekly). NULL = unset; the settlement run falls back to its run-level period for this vendor.';

commit;

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- begin;
-- alter table public.vendors drop column if exists settlement_cycle;
-- commit;
