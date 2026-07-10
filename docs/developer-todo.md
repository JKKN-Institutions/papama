# pApAmA — Developer TODO After Pull

**Date:** 2026-07-10
**Spec:** `docs/papama-phase1-spec-rev2.md`
**Tests:** 2,140 passing (0 failures)

---

## Step 1: Pull & Verify (5 min)

```bash
git pull origin main
npm install
npx vitest run
```

**Expected:** 2,140 tests, 0 failures.

Read these docs before starting:
- `docs/test-handover-report.md` — what changed and why
- `docs/feature-build-tracker.md` — 22 features categorized by build status
- `docs/papama-phase1-spec-rev2.md` — the spec (source of truth)

---

## Step 2: Wire Permissions Into Existing Routes (8 features — Low effort, ~1-2 hrs)

These services already work. Add `assertCan()` guards in the route handlers so the new permission matrix entries are enforced.

```typescript
import { assertCan } from "@/lib/permissions";
```

| # | Feature | Route | Permission Check |
|---|---------|-------|-----------------|
| 1 | Analytics dashboard | `/api/admin/analytics` | `assertCan(user, "analytics_dashboard", "read")` |
| 2 | Public transparency | `/api/public/transparency` | No auth needed — Guest has R (spec §6) |
| 3 | Consent management | `/api/donor/consent` | `assertCan(user, "consent_management", "read", "own")` |
| 4 | Vendor capacity | `/api/admin/vendor-capacity` | `assertCan(user, "vendor_capacity_availability", "read")` |
| 5 | Vendor discovery | Beneficiary-facing vendor search | `assertCan(user, "vendor_discovery", "read")` |
| 6 | Volunteer management | `/api/admin/volunteers` | `assertCan(user, "volunteer_management", "read")` |
| 7 | Vendor rating/quality | `/api/admin/vendor-feedback` | `assertCan(user, "quality_feedback_complaints_inspections", "read")` |
| 8 | Donor sponsorship counters | `/api/donor/dashboard` | `assertCan(user, "donor_sponsorship_counters", "read", "own")` |

---

## Step 3: Extend Partially Built Services (8 features — Medium effort)

These services exist but don't cover all spec requirements yet.

| # | Feature | File | What to Add |
|---|---------|------|-------------|
| 9 | Emergency/disaster mode | `lib/services/emergency.ts` | Campaign creation, temp vendor onboarding (fast-track, time-boxed), rapid beneficiary registration (relaxed docs), temporary config overrides (meal limits, cooldown), auto-revert after 30 days (spec §7: `emergency_mode_max_duration_days`) |
| 10 | CSR module | `lib/services/csr.ts` | Downloadable utilization certificates, impact reports (meals funded/served/categories), annual donation statements |
| 11 | Settlement approval/hold | `lib/services/settlement.ts` | `approved`/`held` lifecycle states in settlement flow, compliance approve route, hold/release admin override logic. Full lifecycle: pending → locked → approved → reconciled → paid (with held as an override state) |
| 12 | Fraud — duplicate media | `lib/services/fraud.ts` | Bill fingerprint detection alongside existing photo phash. Spec §3.1 F-3: "duplicate photo detection AND duplicate bill detection" |
| 13 | Proof — bill detection | `lib/services/proofIntegrity.ts` | Bill fingerprint comparison (currently only photo perceptual hash exists). Spec requires both photo + bill duplicate checks |
| 14 | Credit/refund | `lib/services/creditRefund.ts` | Failed-payment handling (`payment_failures` table), policy-gated refund workflow. Refunds only for failed/duplicate payments — donations are non-withdrawable (spec §3.2) |
| 15 | Institution bulk | `lib/services/institution.ts` | Bulk redemption tracking per institution, institution-wise reporting dashboard |
| 16 | Complaints/inspections | `lib/services/vendorRating.ts` | Complaint triage lifecycle (open → investigating → resolved/dismissed), surprise inspection records + outcomes, inspection impact on quality score |

**Priority order:** Settlement approval (#11) → Fraud/proof (#12, #13) → Emergency (#9)

---

## Step 4: Build Net-New Services (6 features — High effort)

These need new service files and/or significant new logic.

| # | Feature | Spec Ref | New File(s) | What to Build |
|---|---------|----------|-------------|---------------|
| 17 | Lost-token workflow | §3.2 [M2-5] | Extend token service | Beneficiary/distributor reports loss → old token `status` set to `blocked` instantly → replacement token issued with `replacement_for_token_id` → full audit trail. Demo step 10. |
| 18 | Financial ledgers | §3.1 F-10 [M1-12] | `lib/services/ledger.ts` (new) | Double-entry ledger service — every money movement posts rows to 3 ledgers: donation, vendor_payable, revenue. Settlement reconciliation derives from ledgers. "Every rupee must be traceable." Uses `ledger_entries` table. Demo step 8. |
| 19 | Document management | [M2-13] | `lib/services/documents.ts` (new) | Central versioned store for KYC docs, FSSAI licences, vendor agreements, audit records. Expiry tracking with alerts (e.g., FSSAI renewal). Role-restricted access. Uses `documents` table. |
| 20 | Refund workflow | [M2-4] | `lib/services/refund.ts` (new) | Failed-payment capture in `payment_failures` table, retry state, policy-gated refund (only for failed/duplicate payment-gateway cases, never voluntary withdrawal). Uses `refunds` table. |
| 21 | Multi-level cooldown | §3.1 F-9 | Extend `lib/services/redemption.ts` | Cooldown resolution: global default → category-specific override → emergency override. Currently only global `meal_cooldown_hours` is enforced. Spec: "most specific applicable value wins." |
| 22 | Token revalidation | §3.2 [M2-5] | Extend token service | Admin revalidates/extends expired tokens per policy. Audited action. `token_revalidation_allowed` config key already exists. Needs route + service logic + audit trail. |

**Priority order:** Financial ledgers (#18) → Lost-token (#17) → Multi-level cooldown (#21)

---

## Suggested Build Sequence

```
Step 2  →  Wire permissions (1-2 hrs)
Step 3  →  Settlement approval (#11), then fraud/proof (#12-13), then emergency (#9)
Step 4  →  Ledger service (#18), then lost-token (#17), then cooldown (#21)
```

After each feature, run `npx vitest run` to ensure nothing breaks.

---

## Reference Files

| File | Purpose |
|------|---------|
| `docs/papama-phase1-spec-rev2.md` | The spec — source of truth for all rules |
| `docs/test-handover-report.md` | What was tested, what was fixed, config corrections |
| `docs/feature-build-tracker.md` | 22 features categorized: built / partial / net-new |
| `lib/permissions/matrix.ts` | 24-feature permission matrix (complete) |
| `lib/types/enums.ts` | All enum types including new values |
| `test/` | 2,140 spec-driven tests (run with `npx vitest run`) |
