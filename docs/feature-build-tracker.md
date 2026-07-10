# pApAmA — Feature Build Tracker

**Date:** 2026-07-10
**Spec:** `papama-phase1-spec-rev2.md` (July 2026)
**Permission framework:** All 24 features implemented in `lib/permissions/matrix.ts`
**Tests:** 2,140 passing (0 failures)

This document tracks which spec §6 features have backend service logic built, partially built, or not yet built. The permission matrix and enum types are complete — this is about the **service code, routes, and business logic**.

---

## Already Built — just need permission wiring in routes (8 features)

These services exist and work. They just need their API route guards updated to use the new permission matrix entries.

| # | Feature | Spec Ref | Service File | What's Done |
|---|---------|----------|--------------|-------------|
| 1 | Analytics dashboard | [M2-8] | `lib/services/analytics.ts` | Aggregation, city/category breakdowns, vendor performance |
| 2 | Public transparency | [M1-14] | `lib/services/transparency.ts` | RPC-based public stats (total donations, meals, vendors, cities) |
| 3 | Consent management | [M2-14] | `lib/services/consent.ts` | Record consent, version tracking, active consent check |
| 4 | Vendor capacity | [M1-4] | `lib/services/vendorCapacity.ts` | Remaining capacity check, usage increment via RPC |
| 5 | Vendor discovery | [M1-5] | `lib/services/vendorDiscovery.ts` | Nearby vendor search with geo filtering, distance sorting |
| 6 | Volunteer management | [M1-13] | `lib/services/volunteerActivity.ts` | Activity logging (token_distributed, registration_assisted), summaries |
| 7 | Vendor rating/quality | [M1-9] | `lib/services/vendorRating.ts` | Feedback recording, quality score computation, auto-suspend |
| 8 | Donor sponsorship counters | [M1-2] | — | Data exists (donations + redemptions), needs a view/computation layer |

---

## Partially Built — needs extension (8 features)

These services exist but don't cover all the spec requirements yet.

| # | Feature | Spec Ref | Service File | What Exists | What's Missing |
|---|---------|----------|--------------|-------------|----------------|
| 9 | Emergency/disaster mode | [M1-8, M2-9] | `lib/services/emergency.ts` | Emergency token minting, serial generation | Campaign creation, temp vendor onboarding (fast-track, time-boxed), rapid beneficiary registration (relaxed docs), temporary config overrides (meal limits, cooldown), auto-revert after `emergency_mode_max_duration_days` (30 days) |
| 10 | CSR module | [M1-7, M2-7] | `lib/services/csr.ts` | 80G feature flag check, basic CSR report generation | Downloadable utilization certificates, impact reports, annual donation statements |
| 11 | Settlement approval/hold | [M2-4, M1-10] | `lib/services/settlement.ts` | Run settlement, random audit queue sampling | `approved`/`held` lifecycle states in settlement flow, compliance approve route, hold/release admin override logic |
| 12 | Fraud detection | [M1-10] | `lib/services/fraud.ts` | Flag fraud (de-duplicated), vendor anomaly scan | `duplicate_media` detection logic — bill fingerprint comparison service (only photo perceptual hash exists today) |
| 13 | Proof integrity | [M1-10] | `lib/services/proofIntegrity.ts` | Photo perceptual hash (pHash), hamming distance, duplicate photo detection | Bill fingerprint comparison (spec §3.1 F-3 requires both photo AND bill duplicate detection) |
| 14 | Credit/refund | [M2-4] | `lib/services/creditRefund.ts` | Internal credit reversal (compare-and-swap) | Failed-payment handling (`payment_failures` table), policy-gated refund workflow (refunds only for failed/duplicate payments, never voluntary withdrawal) |
| 15 | Institution bulk | [M1-11] | `lib/services/institution.ts` | Bulk allocate via RPC, institution redemption report | Bulk redemption tracking per institution, institution-wise reporting dashboard |
| 16 | Quality/complaints | [M2-11] | `lib/services/vendorRating.ts` | Feedback + quality score + auto-suspend | Complaint triage lifecycle (open → investigating → resolved/dismissed), surprise inspection records + outcomes, inspection impact on quality score |

---

## Net-New — not built at all (6 features)

These need new service files and/or significant new logic.

| # | Feature | Spec Ref | What Needs Building |
|---|---------|----------|---------------------|
| 17 | Lost-token workflow | §3.2 [M2-5] | Beneficiary/distributor reports loss → old token status set to `blocked` instantly → replacement token issued with `replacement_for_token_id` referencing the blocked token → full audit trail. Demo step 10 validates this. |
| 18 | Financial ledgers | §3.1 F-10 [M1-12] | Double-entry ledger service — every money movement posts rows to three ledgers: donation, vendor_payable, revenue. Settlement reconciliation derives from ledgers. "Every rupee must be traceable." Uses `ledger_entries` table. Demo step 8 validates. |
| 19 | Document management | [M2-13] | Central versioned document store for KYC documents, FSSAI licences, vendor agreements, audit records. Expiry tracking with alerts (e.g., FSSAI renewal). Role-restricted access. Uses `documents` table. |
| 20 | Refund workflow | [M2-4] | Failed-payment capture in `payment_failures` table, retry state management, policy-gated refund (only for failed/duplicate payment-gateway cases, never voluntary withdrawal). Uses `refunds` table. |
| 21 | Multi-level cooldown | §3.1 F-9 | Cooldown resolution: global default → category-specific override → emergency override. Currently only global `meal_cooldown_hours` is enforced. Spec requires three levels with "most specific applicable value wins." |
| 22 | Token revalidation | §3.2 [M2-5] | Admin revalidates/extends expired tokens per policy (audited action). `token_revalidation_allowed` config key exists. Needs route + service logic + audit trail. |

---

## Summary

| Status | Count | Effort |
|--------|-------|--------|
| Already built (wire permissions only) | 8 | Low — route guard updates |
| Partially built (extend existing service) | 8 | Medium — add logic to existing files |
| Net-new (build from scratch) | 6 | High — new services, tables, routes |
| **Total** | **22** | |

---

## Related Files

- `docs/test-handover-report.md` — test results and the 2-file fix that was applied
- `docs/papama-phase1-spec-rev2.md` — the full Phase 1 spec (source of truth)
- `lib/permissions/matrix.ts` — the 24-feature permission matrix (complete)
- `lib/types/enums.ts` — all enum types including `blocked`, `approved`, `held`, `duplicate_media`
