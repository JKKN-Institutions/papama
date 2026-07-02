-- =============================================================================
-- ADDON2 — new enum types (mirrors lib/types/enums.ts, the SoT)
-- =============================================================================
-- Net-new named types for the addon2 build:
--   COMPLAINT_STATUSES -> public.complaint_status   (A3 complaint lifecycle)
--   CONSENT_TYPES      -> public.consent_type        (A7 consent management)
-- Plus one EXTENSION to an existing type:
--   credit_transaction_type += 'refund_reversal'     (A6 internal credit-refund)
--
-- 'refund_reversal' is the INTERNAL compensating credit movement (funds stay in
-- the food-token lifecycle; NO money-back — see AGENTS.md "non-withdrawable" rule
-- and ASSUMPTIONS.md). It types the re-credit written when a provisional credit
-- must be reversed (e.g. a token mint fails, or a payment is reconciled failed).
--
-- ALTER TYPE ... ADD VALUE is committed here and NOT used in this migration, so
-- it is safe inside the transaction block (PG 12+). Follows the m01 named-type
-- pattern. Apply as-is; roll back via the DOWN block at the bottom.
-- =============================================================================

begin;

create type public.complaint_status as enum (
    'open', 'investigating', 'resolved', 'dismissed'
);

create type public.consent_type as enum (
    'data_privacy', 'communications', 'data_processing'
);

alter type public.credit_transaction_type add value if not exists 'refund_reversal';

commit;

-- =============================================================================
-- DOWN (rollback) — drop in reverse dependency order.
-- NOTE: Postgres cannot DROP a single enum VALUE. To fully reverse
-- 'refund_reversal' you must recreate credit_transaction_type without it (only
-- safe if no row uses it) — steps included but commented as a last resort.
-- =============================================================================
-- begin;
-- drop type if exists public.consent_type;
-- drop type if exists public.complaint_status;
-- -- Reverse the enum value only if unused:
-- -- alter type public.credit_transaction_type rename to credit_transaction_type_old;
-- -- create type public.credit_transaction_type as enum
-- --     ('purchase','donation','token_conversion','pooling_supplement');
-- -- alter table public.credit_transactions
-- --     alter column type type public.credit_transaction_type
-- --     using type::text::public.credit_transaction_type;
-- -- drop type public.credit_transaction_type_old;
-- commit;
