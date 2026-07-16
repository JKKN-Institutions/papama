# ASSUMPTIONS.md — pApAmA

Per the Phase 1 Definition of Done, this file records decisions made in the absence of an explicit client/mentor answer, plus known open items. Update it whenever an assumption is made or resolved.

> **Note:** This is now a single-developer project (no Developer 1 / Developer 2 split). The whole app — backend, admin, and frontend — is one person's responsibility. Any "Developer 1/2" wording below is historical.

## Resolved (decided with mentor — June 2026)

- **Token generation:** donor mints one token of a donor-chosen amount once accumulated credit exceeds `standard_token_value`; `threshold <= amount <= available credit`. Minting deducts from credit.
- **Post-generation fork:** (A) "use now" → token becomes `live`, donor self-distributes physically/digitally — **no in-app donor→beneficiary transfer exists**; (B) "authorize pApAmA" → token enters admin pool.
- **Admin pool → volunteer:** admin assigns tokens to a selected volunteer, OR grants a volunteer's request, both within `max_tokens_per_volunteer`.
- **`max_tokens_per_volunteer`:** a **concurrent** holding limit (max undistributed tokens a volunteer may hold at once), stored as an admin-editable `system_config` row. The **feature is decided and committed** — the allocation/grant service MUST read this row and enforce it. Only the **numeric value is pending** (mentor input). The seeded row therefore has `value = NULL`; code treats `NULL` as **"limit not yet set"** (do not block, do not invent a number). Do NOT remove the limit concept and do NOT hard-code a default.
- **Option-1 recipient:** donor distributes the live token themselves; the beneficiary is not selected in-app. Beneficiary-side rules apply only at redemption.

## Open — needs client/mentor input (do NOT invent)

- **Disaster-affected category:** is it a standing beneficiary category or an emergency mode, and what proof/eligibility applies? (client Q7) Also confirm proof for persons-with-disabilities.
- **Email provider:** which transactional email service; confirm email scope is notifications-only for Phase 1 (receipts deferred with 80G). (client Q4)
- **Payment provider:** confirm final provider from shortlist (Razorpay / Cashfree / PhonePe). Build provider-agnostic until then. (client Q17)
- **`max_tokens_per_volunteer` numeric value:** the *number* is not yet given (mentor input pending). The feature itself is NOT open — it is decided and must be enforced from config, treating `NULL` as "limit not yet set". Only the value is awaited.
  - **Flag (2026-06-24, volunteer/beneficiary fix pass):** the holding cap remains **INERT/unenforced** until a mentor value is set. No value was invented and the enforcement logic was deliberately left unchanged — the allocation service still reads the `system_config` row and treats `NULL` as "no limit". The volunteer UI continues to show "No holding limit is set". Action awaited: mentor supplies the number; no code change is needed at that point beyond seeding the config value.

## addon2 — decisions & placeholders (2026-07-02)

Reconciling `docs/addon2.md` (see `docs/addon2-scope-mapping.md`) surfaced these
owner-confirmed decisions and preserved placeholders. **No open values invented.**

- **Refunds = internal credit-reversal ONLY (no donor money-back).** A donor money-back
  refund would contradict the non-withdrawable-funds hard rule (AGENTS.md;
  owner-scope §2.1/§4.1). `refundCredit` (`lib/services/creditRefund.ts`) only claws
  back provisionally-granted credit — e.g. a payment reconciled as failed — and can
  never remove more than the live balance. Typed `credit_transaction_type='refund_reversal'`.
  A true money-back refund remains OUT of scope pending a Change Order + payment provider (Q17).
- **Multi-city/district/state hierarchy = DEFERRED.** City-level model kept
  (`operating_city` + `city_lock_enabled`). A region hierarchy + region-scoped RLS is a
  designed-for Phase-2 seam; building it now would be a large cross-cutting RLS rewrite.
- ~~**Lost-token handling & token revalidation = DEFERRED (Phase-2).**~~ **STALE — superseded
  2026-07-16.** `papama-phase1-spec-rev2.md` §3.2/§4/§11.2 and the 2026-07-10 developer-todo/
  feature-build-tracker/test-handover docs all confirm both are pulled into Phase 1. Built:
  `lib/services/token.ts::reportTokenLost()` (blocks the old token instantly — `token_status`
  enum gained `blocked` — and mints a same-value replacement via `replacement_for_token_id`,
  continuing the original expiry window) and `::revalidateToken()` (admin-only, audited,
  gated by `token_revalidation_allowed`, only `expired` tokens eligible). The 2026-07-02
  reasoning ("revalidation tensions with auto-invalidate-on-expiry") was never a real
  conflict — the spec treats revalidation as an explicit, audited admin override of that
  default, not a change to it. Actor mapping for report-loss: spec says "beneficiary or
  distributor," but neither role has a mutating permission cell on `token_generation`/
  `token_distribution` — mapped instead to donor (self-service, own Path-A token) + admin
  (on behalf of), a documented interpretation, not a client-specified route.
- **Notification templates ship editable but conservative.** `notification_templates`
  seeds the two live donor alerts (redemption / thank_you). `dispatch.ts` falls back to
  the caller's hard-coded copy when no active template exists, so behaviour is unchanged
  until an admin activates one. SMS/email/WhatsApp remain no-op seams (Q4).
- **Consent + retention.** `consent_records` captures donor data-privacy consent at
  signup (version `v1`). `audit_log_retention_days` is seeded **NULL** — no retention
  duration invented; `audit_logs` stays append-only and is never purged until an admin
  sets a value and a sweep is enabled (the purge is a documented seam).
- **"Four core features" paragraph (addon2 line 61)** lives in an EXTERNAL client doc,
  not in this repo — cannot be edited here. Align the external wording to "four core
  operational workflows supported by the underlying platform infrastructure".
- **Generic document store (addon2 doc-management) = PROPOSED, not built.** `vendor_documents`
  stays vendor-scoped; widening `doc_type`s vs a generic `documents` table is A8, deferred.

## Phase-1 addon — placeholders for blocked sub-parts (2026-06-30)

The Phase-1 addon (14 reviewer items; 10 genuine gaps built) shipped everything
buildable now and stubbed the parts that depend on an open answer or an external
provider behind a marked placeholder. **No open values were invented.**

- **Emergency / disaster-affected proof rules (area #8, ties to client Q7 above).**
  Emergency mode ships as a fully working admin toggle plus relaxed-limit hooks in
  the redemption engine: when `system_config.emergency_mode_enabled` is on, the
  cooldown / daily-meal-limit checks use `emergency_meal_cooldown_hours` /
  `emergency_max_meals_per_day` if set, else degrade to soft (relief). The
  **disaster-affected eligibility/proof gating is NOT implemented** — it is a marked
  `TODO` in `lib/services/emergency.ts`. Both emergency numeric config keys are
  seeded **NULL** (admin must set; unset → that rule soft-skips). Awaiting client Q7.

- **Duplicate-BILL detection via OCR (area #10).** Duplicate **photo** detection is
  built: `lib/services/proofIntegrity.ts` computes a perceptual hash on proof upload
  and holds the settlement + raises a `vendor_anomaly` fraud flag on a near-duplicate
  (Hamming ≤ `system_config.proof_phash_dup_distance`, seeded NULL → soft-skip until
  set). The current hash is an **average-hash over the compressed file bytes**
  (reliably catches byte-identical / near-identical re-uploads; not robust to
  re-encode/resize) — a documented drop-in for a true pixel pHash once an image-decode
  dependency is approved. Duplicate-**bill** OCR (reading bill number/amount) is a
  marked `TODO` placeholder — it needs an OCR provider. No provider was added.

- **CSR 80G utilization certificates (area #7).** CSR donor onboarding
  (`corporate_csr_profiles`) and CSR reporting (reusing `compliance_reports`,
  `report_type='csr'`) are built. **80G certificate generation is NOT built** — gated
  behind `system_config.csr_80g_certificates_enabled` (seeded `false`) with a disabled
  UI affordance and a marked `TODO`. It needs 80G registration + an email/PDF provider
  (ties to the email/payment open items above). No provider was added.

> All 13 addon `system_config` keys are seeded in
> `supabase/migrations/20260630000002_addon_config_seed.sql` (7 boolean flags `false`,
> 6 numeric thresholds NULL). Boolean flags ship **OFF** so every addon behaviour stays
> dark until an admin opts in; numeric thresholds stay NULL so each rule soft-skips
> until a value is set — same discipline as `max_tokens_per_volunteer`.

## Donor payment seams (decided June 2026 — donor remediation)

- **UPI is REAL (manual confirm).** The public UPI QR donation (`/donate/qr`) now
  uses a self-hosted manual-confirm flow: a backend route generates a UPI deep-link
  QR from a configurable merchant VPA, records a `PENDING` `upi_qr_payments` row
  with a 15-minute expiry, and the donor confirms by entering their UTR (static-VPA
  UPI has no webhook, so manual confirm is by design). The confirmed UTR is the
  payment evidence (`donations.payment_ref = upi:<UTR>`), not a mock. Merchant VPA
  is `NEXT_PUBLIC_UPI_VPA`; if unset, a clearly-flagged demo VPA (`papama@upi`) is
  used so the demo renders — it is NOT a real collecting account and must be set
  before launch.
- **Card / netbanking stay MOCK.** Per decision, the card/netbanking provider
  (Razorpay / Cashfree / PhonePe — still the open item above) is NOT wired. Those
  methods record a clearly-flagged `mock:` `payment_ref` and complete immediately
  so the credit flow is demoable. Do NOT add real provider keys.
- **Email stays MOCK.** No transactional email is sent; donation receipts and
  threshold alerts are in-app `notifications` only (email provider is the open item
  above). Do NOT add a real email provider.
- **Guest donations** (no account): `POST /api/donations/create-guest`, ungated,
  records a donor-less `donations` row (no credit balance — there is no account to
  hold it). The UPI QR confirm route credits through the same path.
- **TOKEN_QR_SECRET** added as the dedicated token-QR HMAC secret, with fallback to
  `SUPABASE_SERVICE_ROLE_KEY` so nothing breaks pre-provisioning. See `.env.example`.

## Face liveness fail-safe — hardening follow-up (2026-07-06, PR #6 merge)

- **Known gap:** `assertLiveness()` (`lib/face/liveness.ts`) and the redemption
  liveness gate (`lib/services/redemption.ts`) treat `MissingConfigError` as
  "config unset → soft-skip the anti-spoof check". But `getConfig()`
  (`lib/system-config.ts`) collapses **any** Supabase query failure (network /
  timeout / RLS) into `MissingConfigError(..., "missing")`, so a *transient* DB
  error is misclassified as "unset" and the gate soft-skips rather than blocks.
  PR #6 is still strictly safer than the prior `.catch(() => 0)` (which set the
  floor to 0 and accepted anything on any error), so it was merged as-is.
- **Fix when hardening:** make `getConfig` distinguish PostgREST "row not found"
  (`error.code === 'PGRST116'`) — the genuine unset case → keep `MissingConfigError`
  — from every other error, which should surface as a distinct transient/DB error
  type so the liveness gates **block** (fail-closed) instead of skipping. No behaviour
  change intended for the genuinely-unset path.

## Phase-1 batch 2026-07-16 — 11 spec features built (holding #13, #10, #19)

Built per `docs/developer-todo.md`'s Phase A/B split, holding **#13 (bill
fingerprint), #10 (CSR module), #19 (document management)**. The live DB was
queried directly before building because `docs/developer-todo.md`'s "missing
tables" list was stale (same pattern as the earlier addon2 staleness) —
`vendor_capacity_usage`, `volunteer_activity_log`, `surprise_inspections`, and
`vendor_feedback`'s complaint columns already existed under different names
than the doc assumed; only `media_fingerprints`, `ledger_entries`,
`emergency_overrides`, `payment_failures`, and `refunds` were genuinely new.

- **Emergency-mode authority (client Q7/§11.2 #5): single admin, no
  two-person rule.** This was already true of the existing generic
  `PATCH /api/admin/system-config` route (admin-only, audited) — no new
  authorization surface was added for the toggle itself. New:
  `emergency_overrides` gives time-boxed `system_config` overrides
  (`lib/services/emergency.ts::activateEmergencyOverride`/
  `revertEmergencyOverride`), auto-reverting via the
  `revert_emergency_overrides()` pg_cron job when
  `emergency_mode_max_duration_days` is set (seeded NULL — soft-skip, an
  override never auto-reverts until an admin sets a duration). **Disaster-
  affected proof/eligibility gating (fast-track vendor onboarding, relaxed
  beneficiary docs) remains OUT of scope pending client Q7** — do not build
  ad hoc rules for it.
- **Refund policy boundary (client Q3/§11.2 #3): confirmed default
  applied — refunds ONLY for failed/duplicate payment-gateway cases, never
  voluntary withdrawal.** Enforced at the **schema level**, not just app
  logic: `refunds.payment_failure_id` is `NOT NULL` (`ON DELETE RESTRICT`) —
  there is no code path that creates a refund without an existing open
  `payment_failures` row. Phase 1 has no live payment-gateway webhook, so
  `payment_failures` rows are admin-logged via manual reconciliation
  (`POST /api/admin/payment-failures`), not auto-detected — ties to the
  still-open payment-provider question (client Q17). Approval reverses
  credit via the existing `refundCredit()` (still internal-only, no donor
  money-back — see the addon2 entry above) and posts the reversal to the
  `donation` ledger.
- **Multi-level cooldown key naming.** Category-level overrides are named
  `meal_cooldown_hours_<category>` (one per `BENEFICIARY_CATEGORIES` value),
  seeded NULL. Resolution order is **emergency > category > global**, all
  soft-skip-on-unset; falling through from an unset emergency override to
  category/global relaxes the check to soft (never hard-blocks), matching the
  prior single-level emergency-relief discipline. `max_meals_per_day` was
  NOT given the same per-category treatment — spec §3.1 F-9 only requires
  multi-level *cooldown*.
- **Duplicate-photo detection now raises the real `duplicate_media` flag
  type**, not the `vendor_anomaly` workaround it used while the enum value
  didn't exist yet. `media_fingerprints` is a new durable evidence table
  (photo rows populated/checked now); `bill_number`/`bill_amount_inr` are
  nullable forward-compat columns for **#13 (bill-fingerprint detection),
  still held**.
- **Institution allocation tracing.** `token_distribution_records` gained a
  nullable `ngo_partner_id` column so `institutionAllocationReport()` can
  precisely bucket a bulk allocation's tokens into redeemed/pending/expired/
  blocked. This is independent of the existing `institutionRedemptionReport()`
  (keyed by `beneficiaries.institution_id`, not the allocation batch) — a
  beneficiary can be fed by a token NOT drawn from this institution's bulk
  batch, so the two figures can legitimately diverge. `institution_token_
  allocations` itself still has no FK to individual tokens (count-only header
  row, by design, matching the original addon #11 migration's model).
- **Failed-inspection quality penalty** (`vendor_inspection_fail_penalty`)
  seeded NULL — soft-skip until an admin sets a value, same discipline as
  `vendor_min_rating`. Failed inspections never auto-suspend (manual review
  only, per spec — `applyInspectionOutcome()` only adjusts `quality_score`).
- **Triple-ledger reconciliation invariant:** `donation == vendor_payable +
  revenue`, checked by `lib/services/ledger.ts::reconcileLedgers()`.
  `ledger_entries` is append-only (no update/delete RLS policy, matching
  `audit_logs`'s discipline) — a correction is a new offsetting entry, never
  an edit. Four integration points post to it: donation creation, proof
  approval (`vendor_payable` credit via the newly-exported
  `settlement.ts::payoutAmount()`), a forfeited remainder at redemption
  creation (`revenue` credit), settlement `pay` (`vendor_payable` debit), and
  `refundCredit()` (`donation` reversal).
- **Flagged, NOT built — `settlement_random_audit_rate` vs
  `settlement_audit_sample_pct` drift.** `test/helpers/mockConfig.ts` already
  uses the spec §7 renamed key `settlement_audit_sample_pct`, but
  `lib/services/settlement.ts` still reads the old `settlement_random_audit_rate`
  key. This is unrelated to the 11 features above — flagging it here so the
  rename isn't silently lost as a follow-up.
- **Flagged decision point — `token_revalidation_allowed` seed value.**
  Seeded **`false`**, matching this codebase's convention that every addon
  boolean ships OFF until an admin opts in — even though the spec's §7 table
  suggests a launch default of `true`. One-line SQL change either way;
  confirm with the client/spec owner if `true`-at-seed is actually required.
- **Permission-matrix change (the only one across all 11 features):**
  `refunds_failed_payments.donor` gained `create:"own"` (previously
  `read:"own"` only) so a donor can self-initiate a refund request via the
  new `POST /api/donor/refund-request`.
- **Route-level authorization bug fixed as part of #11:**
  `PATCH /api/admin/settlements` was gated with `{feature:"vendor_settlement",
  action:"update"}`, but `compliance`'s matrix cell has `update:"none"` (only
  `caps:["approve"]`) — compliance could never call this route at all,
  blocking the spec's own approval step. Fixed by loosening the route guard to
  `action:"read"` (both admin and compliance hold `read:"all"`) and enforcing
  the real authorization per action via `userHasCapability` in-handler.

## Schema decisions to confirm

- Token **current-holder** representation: explicit `current_holder_type`/`current_holder_id` on `tokens`, vs. derived from status + latest `token_distribution_records`. (Pick one; keep consistent.)
- API **field names/enums** in the admin/backend contract were drafted by design, not specified by the client — confirm against the real Supabase columns (see `docs/db-schema-snapshot.md`) before locking.
