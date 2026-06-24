-- =============================================================================
-- Fraud anomaly thresholds → system_config (admin-tunable, not hard-coded)
-- =============================================================================
-- AGENTS.md: every tunable rule lives in system_config and is read at runtime;
-- the vendor volume-anomaly sweep (lib/services/fraud.ts) previously hard-coded
-- its floor (3) and median-multiple (3) as constants. These rows let admins tune
-- fraud sensitivity without a redeploy. The service falls back to 3/3 only if a
-- key is unset, so applying this is safe and backward-compatible.
--
-- Apply AFTER m03 (system_config). Idempotent.
-- =============================================================================

begin;

insert into public.system_config (key, value, value_type, description) values
    ('fraud_anomaly_min_count', '3', 'number',
     'Vendor anomaly sweep: minimum redemptions TODAY before a vendor can be flagged.'),
    ('fraud_anomaly_median_multiple', '3', 'number',
     'Vendor anomaly sweep: flag a vendor whose daily redemptions are >= this multiple of the across-vendor median.')
on conflict (key) do nothing;

commit;

-- =============================================================================
-- DOWN
-- =============================================================================
-- begin;
-- delete from public.system_config
--   where key in ('fraud_anomaly_min_count', 'fraud_anomaly_median_multiple');
-- commit;
