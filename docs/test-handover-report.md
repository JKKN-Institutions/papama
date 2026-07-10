# pApAmA — Spec-Driven Test Handover Report

**Date:** 2026-07-10
**Spec:** `papama-phase1-spec-rev2.md` (July 2026)
**Test framework:** Vitest (mocked Supabase — no DB required)
**Run command:** `npx vitest run`

---

## Summary

| Metric | Count |
|--------|-------|
| Total tests | 1,244 |
| Passing | 1,200 |
| Failing | 44 |
| Test files | 22 (20 pass, 2 fail) |

All 44 failures are **spec gaps in the code** — things the spec requires but the code has not yet implemented. Fixing requires changes to **2 files only**.

> **Important note for the developer:** This report covers the 44 failing spec-compliance tests. Fixing the 2 files listed below will make all tests pass, but those fixes only add the **type definitions and permissions framework**. The underlying **service logic** for the 13 new features still needs to be built as separate work items. Specifically:
>
> | Feature | What the fix adds | What still needs building |
> |---------|------------------|--------------------------|
> | Lost-token (`blocked` status) | Enum value in `TOKEN_STATUSES` | Block old token + issue replacement workflow, `replacement_for_token_id` chain, audit trail |
> | Duplicate media detection | `duplicate_media` in `FRAUD_FLAG_TYPES` | Bill fingerprint comparison service (only photo phash exists today) |
> | Settlement approval/hold | `approved`/`held` in `SETTLEMENT_STATUSES` | Approval step in settlement lifecycle, hold/release route logic, compliance approve flow |
> | Donor sponsorship counters | Permission matrix entry | Meals-sponsored computation, dashboard UI |
> | Vendor discovery | Permission matrix entry | Already built (`lib/services/vendorDiscovery.ts`), just needs permission gating |
> | Vendor capacity | Permission matrix entry | Already built (`lib/services/vendorCapacity.ts`), just needs permission gating |
> | Financial ledgers | Permission matrix entry | Ledger service (double-entry posting on every money movement) |
> | Refunds/failed payments | Permission matrix entry | Refund workflow, payment failure handling |
> | CSR module | Permission matrix entry | Partially built (`lib/services/csr.ts`), needs utilization certificates + impact reports |
> | Volunteer management | Permission matrix entry | Already built (`lib/services/volunteerActivity.ts`), needs admin approval flow |
> | Quality/complaints | Permission matrix entry | Partially built (vendor rating exists), needs complaint triage + inspection records |
> | Emergency/disaster mode | Permission matrix entry | Partially built (`lib/services/emergency.ts`), needs campaign creation + temp vendor onboarding + auto-revert |
> | Analytics dashboard | Permission matrix entry | Already built (`lib/services/analytics.ts`), just needs permission gating |
> | Public transparency | Permission matrix entry | Already built (`lib/services/transparency.ts`), just needs permission gating |
> | Document management | Permission matrix entry | Central document store with expiry tracking (net-new) |
> | Consent management | Permission matrix entry | Already built (`lib/services/consent.ts`), just needs permission gating |
>
> Services marked "Already built" only need the permission matrix entry wired into their route guards. Services marked "net-new" or "needs building" require new code beyond the 2-file fix.

---

## How to Fix All 44 Failures

### File 1: `lib/types/enums.ts` — Add 3 enum values (fixes 4 tests)

#### 1a. Add `duplicate_media` to `FRAUD_FLAG_TYPES` (line ~184)

**Spec ref:** §3.1 F-3 — "duplicate photo detection and duplicate bill detection" (active P1, not a seam)

```typescript
export const FRAUD_FLAG_TYPES = [
    "duplicate_token",
    "cloned_qr",
    "tampered_qr",
    "beneficiary_duplicate",
    "vendor_anomaly",
    "duplicate_media",       // ADD — spec §3.1 F-3, §5 [M1-10]
] as const;
```

#### 1b. Add `blocked` to `TOKEN_STATUSES` (line ~55)

**Spec ref:** §3.2 Token rules — "old token blocked instantly" (lost-token pulled into P1 per [M2-5])

```typescript
export const TOKEN_STATUSES = [
    "generated",
    "live",
    "in_admin_pool",
    "assigned_to_volunteer",
    "distributed",
    "redeemed",
    "expired",
    "blocked",               // ADD — spec §3.2 lost-token [M2-5]
] as const;
```

#### 1c. Add `approved` and `held` to `SETTLEMENT_STATUSES` (line ~161)

**Spec ref:** §3.1 F-2 — "settlement approval step [M2-4]" + "settlement hold facility [M1-10]"

```typescript
export const SETTLEMENT_STATUSES = [
    "pending",
    "locked",
    "approved",              // ADD — spec §3.1 F-2 [M2-4]
    "reconciled",
    "paid",
    "held",                  // ADD — spec §3.1 F-2 [M1-10]
] as const;
```

---

### File 2: `lib/permissions/matrix.ts` — Add 13 features + 1 capability fix (fixes 40 tests)

#### 2a. Expand `FEATURES` array from 11 to 24

```typescript
export const FEATURES = [
    // --- Existing 11 ---
    "donor_donation_credit",
    "token_generation",
    "token_distribution",
    "beneficiary_registration",
    "token_redemption",
    "vendor_management",
    "vendor_menu_pricing",
    "vendor_settlement",
    "proof_of_service",
    "fraud_monitoring",
    "audit_reports",
    // --- NEW: Spec §6 Revision 2 features ---
    "donor_sponsorship_counters",                // [M1-2]
    "institution_bulk_allocation",               // [M1-11]
    "vendor_discovery",                          // [M1-5]
    "vendor_capacity_availability",              // [M1-4]
    "financial_ledgers_reconciliation",          // [M1-12]
    "refunds_failed_payments",                   // [M2-4]
    "csr_module",                                // [M1-7]
    "volunteer_management",                      // [M1-13]
    "quality_feedback_complaints_inspections",   // [M2-11]
    "emergency_disaster_mode",                   // [M2-9]
    "analytics_dashboard",                       // [M2-8]
    "public_transparency_dashboard",             // [M1-14]
    "document_management",                       // [M2-13]
    "consent_management",                        // [M2-14]
] as const;
```

#### 2b. Fix compliance `vendor_settlement` — add `approve` capability

**Current (line ~124):**
```typescript
compliance: R_ALL,
```

**Change to:**
```typescript
compliance: perm({ read: "all", caps: ["approve"] }),  // spec §6: R + Approve
```

#### 2c. Add 13 new entries to `PERMISSION_MATRIX`

Each entry below maps to spec §6 Role Access Matrix. The `perm()` helper and `CRUD_ALL`/`R_ALL` constants already exist in the file.

```typescript
// [M1-2] Donor Sponsorship Counters — spec §6 row 2
donor_sponsorship_counters: {
    admin: R_ALL,
    compliance: R_ALL,
    donor: perm({ read: "own" }),
},

// [M1-11] Institution Bulk Allocation — spec §6 row 5
institution_bulk_allocation: {
    admin: CRUD_ALL,
    compliance: R_ALL,
    vendor_manager: R_ALL,
    volunteer: R_ALL,
    beneficiary: perm({ read: "own" }),
},

// [M1-5] Vendor Discovery — spec §6 row 7
vendor_discovery: {
    admin: R_ALL,
    vendor_manager: R_ALL,
    vendor: perm({ read: "own" }),
    volunteer: R_ALL,
    beneficiary: R_ALL,
},

// [M1-4] Vendor Capacity & Availability — spec §6 row 10
vendor_capacity_availability: {
    admin: CRUD_ALL,
    compliance: R_ALL,
    vendor_manager: R_ALL,
    vendor: perm({ create: "own", read: "own", update: "own" }),
    beneficiary: perm({ read: "own" }),
},

// [M1-12] Financial Ledgers & Reconciliation — spec §6 row 14
financial_ledgers_reconciliation: {
    admin: CRUD_ALL,
    compliance: R_ALL,
    vendor: perm({ read: "own" }),
},

// [M2-4] Refunds / Failed Payments — spec §6 row 15
refunds_failed_payments: {
    admin: CRUD_ALL,
    compliance: R_ALL,
    donor: perm({ read: "own" }),
},

// [M1-7] CSR Module — spec §6 row 16
csr_module: {
    admin: CRUD_ALL,
    compliance: R_ALL,
    donor: perm({ create: "own", read: "own", update: "own" }),
},

// [M1-13] Volunteer Management — spec §6 row 17
volunteer_management: {
    admin: CRUD_ALL,
    compliance: R_ALL,
    vendor_manager: R_ALL,
    volunteer: perm({ read: "own" }),
},

// [M2-11] Quality: Feedback / Complaints / Inspections — spec §6 row 18
quality_feedback_complaints_inspections: {
    admin: CRUD_ALL,
    compliance: R_ALL,
    vendor_manager: perm({ create: "all", read: "all", update: "all" }),
    vendor: perm({ read: "own", update: "own" }),
    beneficiary: perm({ create: "own" }),
},

// [M2-9] Emergency / Disaster Mode — spec §6 row 19
emergency_disaster_mode: {
    admin: CRUD_ALL,
    compliance: R_ALL,
    vendor_manager: R_ALL,
    volunteer: R_ALL,
},

// [M2-8] Analytics Dashboard — spec §6 row 20
analytics_dashboard: {
    admin: R_ALL,
    compliance: R_ALL,
    vendor_manager: R_ALL,
},

// [M1-14] Public Transparency Dashboard — spec §6 row 21
public_transparency_dashboard: {
    admin: R_ALL,
    compliance: R_ALL,
    vendor_manager: R_ALL,
    vendor: R_ALL,
    volunteer: R_ALL,
    donor: R_ALL,
    beneficiary: R_ALL,
    guest: R_ALL,
},

// [M2-13] Document Management — spec §6 row 22
document_management: {
    admin: CRUD_ALL,
    compliance: R_ALL,
    vendor_manager: R_ALL,
    vendor: perm({ create: "own", read: "own" }),
    beneficiary: perm({ create: "own", read: "own" }),
},

// [M2-14] Consent Management — spec §6 row 23
consent_management: {
    admin: CRUD_ALL,
    compliance: R_ALL,
    donor: perm({ create: "own", read: "own", update: "own" }),
    beneficiary: perm({ create: "own", read: "own", update: "own" }),
},
```

---

## Verification

After making the above changes, run:

```bash
npx vitest run
```

**Expected:** 1,244 tests, 0 failures.

---

## Detailed Failure List (44 tests)

### Validation Failures (4) — `test/validation/schemas.test.ts`

| # | Test | Spec | Root Cause |
|---|------|------|------------|
| 1 | `fraudFlagType accepts 'duplicate_media'` | §3.1 F-3, §5 | `FRAUD_FLAG_TYPES` missing `duplicate_media` |
| 2 | `tokenStatus accepts 'blocked'` | §3.2 Token rules | `TOKEN_STATUSES` missing `blocked` |
| 3 | `settlementStatus accepts 'approved'` | §3.1 F-2 [M2-4] | `SETTLEMENT_STATUSES` missing `approved` |
| 4 | `settlementStatus accepts 'held'` | §3.1 F-2 [M1-10] | `SETTLEMENT_STATUSES` missing `held` |

### Permission Failures (40) — `test/permissions/matrix.test.ts`

| # | Feature | Test | Spec §6 Row |
|---|---------|------|-------------|
| 1 | `donor_sponsorship_counters` | feature exists in FEATURES | Row 2 [M1-2] |
| 2 | `donor_sponsorship_counters` | admin can read | Row 2 |
| 3 | `donor_sponsorship_counters` | donor can read own | Row 2 |
| 4 | `institution_bulk_allocation` | feature exists in FEATURES | Row 5 [M1-11] |
| 5 | `institution_bulk_allocation` | admin has CRUD (x4 actions) | Row 5 |
| 6 | `vendor_discovery` | feature exists in FEATURES | Row 7 [M1-5] |
| 7 | `vendor_discovery` | beneficiary can read | Row 7 |
| 8 | `vendor_capacity_availability` | feature exists in FEATURES | Row 10 [M1-4] |
| 9 | `vendor_capacity_availability` | vendor can CRU own | Row 10 |
| 10 | `vendor_capacity_availability` | beneficiary can read status | Row 10 |
| 11 | `financial_ledgers_reconciliation` | feature exists in FEATURES | Row 14 [M1-12] |
| 12 | `financial_ledgers_reconciliation` | admin has CRUD (x4) | Row 14 |
| 13 | `financial_ledgers_reconciliation` | vendor can read own payable | Row 14 |
| 14 | `refunds_failed_payments` | feature exists in FEATURES | Row 15 [M2-4] |
| 15 | `refunds_failed_payments` | donor can view/request own | Row 15 |
| 16 | `csr_module` | feature exists in FEATURES | Row 16 [M1-7] |
| 17 | `csr_module` | donor can access own CSR | Row 16 |
| 18 | `volunteer_management` | feature exists in FEATURES | Row 17 [M1-13] |
| 19 | `volunteer_management` | admin has CRUD (x4) | Row 17 |
| 20 | `volunteer_management` | volunteer can access own | Row 17 |
| 21 | `quality_feedback_complaints_inspections` | feature exists in FEATURES | Row 18 [M2-11] |
| 22 | `quality_feedback_complaints_inspections` | beneficiary can create | Row 18 |
| 23 | `quality_feedback_complaints_inspections` | vendor can respond to own | Row 18 |
| 24 | `emergency_disaster_mode` | feature exists in FEATURES | Row 19 [M2-9] |
| 25 | `emergency_disaster_mode` | admin has CRUD (x4) | Row 19 |
| 26 | `emergency_disaster_mode` | volunteer can read but not toggle | Row 19 |
| 27 | `analytics_dashboard` | feature exists in FEATURES | Row 20 [M2-8] |
| 28 | `analytics_dashboard` | admin has full read | Row 20 |
| 29 | `analytics_dashboard` | vendor_manager has scoped read | Row 20 |
| 30 | `public_transparency_dashboard` | feature exists in FEATURES | Row 21 [M1-14] |
| 31 | `public_transparency_dashboard` | guest has read access | Row 21 |
| 32 | `public_transparency_dashboard` | all 8 roles have read | Row 21 |
| 33 | `document_management` | feature exists in FEATURES | Row 22 [M2-13] |
| 34 | `document_management` | vendor can upload own docs | Row 22 |
| 35 | `document_management` | beneficiary can upload own docs | Row 22 |
| 36 | `consent_management` | feature exists in FEATURES | Row 23 [M2-14] |
| 37 | `consent_management` | donor can manage own consent | Row 23 |
| 38 | `consent_management` | beneficiary can manage own consent | Row 23 |
| 39 | `vendor_settlement` | compliance has approve capability | Row 12 |
| 40 | Structural | FEATURES has 22+ entries | §6 full matrix |

---

## Test Config Values Updated (spec §7)

These defaults were corrected in `test/helpers/mockConfig.ts` to match the spec:

| Config Key | Old Value | Spec Value | Spec Ref |
|------------|-----------|------------|----------|
| `token_expiry_days` | 30 | **90** | §7 |
| `max_meals_per_day` | 3 | **1** (launch) | §7: launch at 1, ceiling 3 |
| `redemption_radius_km` | 5 | **20** | §7 |
| `co_contribution_max` | 0 | **10** | §7: ₹0–₹10 |
| `vendor_min_rating` | 3 | **3.5** | §7 |
| `vendor_max_complaint_rate` | 0.1 | **0.05** | §7: 5% |
| `audit_log_retention_days` | 365 | **2920** | §7: 8 years |
| `operating_city` | Komarapalayam | **Coimbatore** | §3.1 F-11 |
| `city_lock_enabled` | false | **true** | §7 |
| `meal_window_enforcement_enabled` | false | **true** | §3.1 F-9 |

---

## What the Tests Cover (1,244 total)

| Area | Tests | Spec Sections |
|------|-------|---------------|
| Permission matrix (RBAC) | 787 | §6 |
| Validation schemas | 211 | §3.2, §7, §8 |
| Redemption engine | 41 | §3.1 F-9, §3.2, §3.3 |
| Settlement | 14 | §3.1 F-2, F-3, F-10 |
| Test helpers (spec defaults) | 36 | §7 |
| Fraud detection | 19 | §3.3 |
| Proof integrity | 21 | §3.1 F-3 |
| Audit logging | 19 | §3.3, §7.1 |
| Vendor capacity | 9 | §3.3 [M1-4] |
| Vendor discovery | 8 | §3.3 [M1-5] |
| Vendor rating | 8 | §3.3 [M1-9, M2-11] |
| Geo distance | 9 | §3.1 F-11 |
| Emergency | 8 | §3.3 [M2-9] |
| Analytics | 6 | §3.3 [M2-8] |
| Consent | 10 | [M2-14] |
| Credit/refund | 5 | §3.1 F-10 |
| CSR | 4 | [M1-7] |
| Institution | 3 | §3.1 F-12 |
| Notification templates | 11 | §3.1 F-7 |
| Transparency | 8 | [M1-14] |
| Volunteer activity | 11 | [M1-13] |
