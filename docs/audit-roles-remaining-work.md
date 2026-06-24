# pApAmA — Role-Based Implementation Audit (Remaining Work Log)

**Date:** 2026-06-24
**Audited against:** `docs/prd.md` (+ `docs/token-flow.md`, `docs/papama-owner-scope.md`, `lib/permissions/matrix.ts`, live RLS migrations)
**Method:** Parallel per-role audit (Donor / Vendor / Admin / Volunteer+Beneficiary). Read-only; every item is evidence-backed with `file:line`.
**Severity legend:** 🔴 Blocker · 🟡 Important · ⚪ Polish · ✅ Verified-solid (no action)

## Summary

| Role | Backend | UI | Overall | #1 Blocker |
|---|---|---|---|---|
| Donor | ~95% (auth) / ~85% | ~80% | **~80%** | Guest "no-app" donation can't succeed (401) |
| Vendor | ~70% | ~65% | **~70%** | No real QR scan; proof upload sends no image |
| Admin | ~85% | ~75% | **~80%** | No settlement "hold" override (demo step 7) |
| Volunteer / Beneficiary | ~90% | ~70% | **~80%** | Orphaned reg route; no beneficiary self-reg UI |

---

## 👤 DONOR

### UI
- [ ] 🔴 **Anonymous toggle is a dead end** — `app/donor/donate/page.tsx:59` sets `donorId=null` and POSTs to session-gated `/api/donations/create`, which ignores body `donor_id` and always credits the logged-in donor (or fails auth for a true guest).
- [ ] 🔴 **Public donate pages can't complete a donation** — `app/donate/page.tsx:58` & `app/donate/qr/page.tsx:53` call `createDonation(..., null)` against the auth-gated route → 401 for visitors. The "no-app public QR donation" requirement is non-functional in real mode.
- [ ] 🔴 **QR donation page is a fake-confirm** — `app/donate/qr/page.tsx:48-65` shows a static UPI QR (hardcoded VPA `papama@okaxis`, line 176) and "verifies" by the user typing any 6+ char UTR. Needs real manual-UTR capture/confirmation backend (see `upi-qr-payment-gateway` skill).
- [ ] 🟡 **Payment method selection is cosmetic** — UPI/Card/Netbanking offered (`app/donor/donate/page.tsx:12-18`) but backend records every donation `completed` with a `mock:` ref. Blocked on payment-provider open item.
- [ ] ⚪ `payment-failed` page only reachable via network error (donations never fail server-side).
- [ ] ⚪ Impact page has unescaped JSX quotes (`app/donor/impact/page.tsx:161`) — eslint `react/no-unescaped-entities` risk.
- [ ] ⚪ Token QR uses external `api.qrserver.com` (`app/donor/tokens/[id]/page.tsx:307`) — consider a local QR lib for offline/demo resilience.
- [x] ✅ Re-donate link + redemption alert (time/vendor/location + thank-you) correct — `components/donor/DashboardOverview.tsx:313`, `app/donor/impact/page.tsx:185`, `app/donor/notifications/page.tsx:167`.
- [x] ✅ Token QR display is real (`app/donor/tokens/[id]/page.tsx:307`).

### Backend
- [ ] 🔴 **No anonymous-donation path** — `defineRoute` → `requireAppUser` 401s; `app/api/donations/create/route.ts:33` resolves donor strictly from session. No way to persist a guest/no-account donation.
- [ ] 🟡 **Payment mocked end-to-end** — `app/api/donations/create/route.ts:38` writes `payment_ref=mock:` and marks `completed` immediately; convert + credit math trust it. No capture/verify/webhook.
- [ ] 🟡 **No email/receipt sending** — receipts and threshold/redemption alerts only written to in-app `notifications` table (`app/api/donations/create/route.ts:107-126`); no email despite 80G-receipt intent.
- [ ] 🟡 **₹50 threshold silently inert if unseeded** — `standard_token_value` config-driven, skipped when unset (`donations/create:92-97`, `tokens/convert:58-69`). Confirm `system_config` seeded for demo.
- [ ] 🟡 **`tokenQr` HMAC reuses `SUPABASE_SERVICE_ROLE_KEY`** (`app/api/_lib/tokenQr.ts:16-27`) — key rotation invalidates every issued QR. Needs dedicated `TOKEN_QR_SECRET`.
- [ ] 🟡 **Dashboard reads `token_redemptions` on service-role client** (`app/api/donor/dashboard/route.ts:124-164`) — RLS-bypass by design (scoped, no leak observed); `beneficiary_category` falls back to hardcoded `"patient"` (line 161) which can mislabel impact data. Worth a security pass.
- [x] ✅ Credit ledger, one-token-per-mint (Path A/B), QR hash at rest, donor-scoped RLS reads, notifications, profile PATCH w/ 80G PAN seam, redemption→donor alert all real & wired.

**Donor ≈ 80%** — authenticated flow ~95%; dragged down by missing guest-donation backend + stubbed payments/email.

---

## 🏪 VENDOR

### UI
- [ ] 🔴 **No real QR scanning** — token code is paste-only `<input>`; camera scan is an explicit TODO (`app/vendor/scan/page.tsx:307-308` "Camera scan coming soon"). Fails PRD demo step 4.
- [ ] 🔴 **Proof upload submits only file *names*, not images** — `onUploadProof` posts `photoFile.name`/`receiptFile.name` as text; no binary reaches storage, yet UI shows "Payment released" (`app/vendor/scan/page.tsx:263-266, 526-529`).
- [ ] 🔴 **Profile edit form loads blank** — page expects `legal_name, address, pincode, phone, email, fssai_license, gst_number, bank_*, geo_lat/lng` but GET returns only `name, status, kyc_status, city, geo:{lat,lng}, hygiene_rating`. Fields empty on load; save nulls them all (`app/vendor/profile/page.tsx:10-28,79-83` vs `app/api/vendor/profile/route.ts:33-48`).
- [ ] 🟡 **Dashboard location never renders** — reads `vendor.geo_lat/geo_lng` but GET returns nested `geo:{lat,lng}` (`app/vendor/page.tsx:68-71`).
- [ ] 🟡 **No settlement-cycle selection** anywhere — settlements page read-only, profile has no cycle picker; vendor can't choose daily/twice_weekly/weekly.
- [ ] ⚪ Co-pay ₹5 max / ₹0 default not surfaced client-side (`app/vendor/scan/page.tsx:357-374`).
- [ ] ⚪ Latent `token` typing mismatch in preview (`app/vendor/scan/page.tsx:34-44` vs `app/api/vendor/redemptions/preview/route.ts:52-60`).

### Backend
- [ ] 🔴 **`vendor-documents` storage bucket (m22) migration does not exist** — migrations jump m19→m23; every KYC doc upload fails by design with 400 "apply m22" (`app/api/vendor/documents/route.ts:13,51-53`). KYC flow non-functional.
- [ ] 🔴 **Proof route releases payment without verifying proof exists** — both refs `.optional()`; empty body flips `locked`→`released` (`app/api/vendor/redemptions/[id]/proof/route.ts:19-22,50-57`). Defeats proof-gating.
- [ ] 🟡 **Geofence bypassable by omitting location** — check is HARD only when `geo` sent; omit it → recorded SOFT, never blocks (`lib/services/redemption.ts:218-265`).
- [ ] 🟡 **Settlement ignores per-vendor cycle** — `runSettlement(period)` aggregates all vendors under one admin-chosen label, no per-vendor preference or date windowing; vendors table has no `settlement_cycle` column (`lib/services/settlement.ts:43-59`; `app/api/admin/settlements/run/route.ts:16-18`).
- [ ] 🟡 **6h double-redeem block is face-dependent** — cooldown/meal-limit run only when `face_match_threshold` set (seeded 0.4 in m23); a non-matching face embedding escapes cooldown (`lib/services/redemption.ts:307-425`).
- [ ] ⚪ Settlement view returns header rows only, no line items (`app/api/vendor/settlements/route.ts:17-19`).
- [ ] ⚪ Document GET mints a signed URL per row per call — N storage round-trips (`app/api/vendor/documents/route.ts:98-110`).
- [x] ✅ Registration atomic; redemption engine implements token/menu/geofence/liveness/face/cooldown/meal-limit/special-care + forfeit/pay-difference/co-pay split; double-scan race-guarded; donor notifications fire.

**Vendor ≈ 70%** — core mechanics built, but scanning, proof-gating, document KYC, profile contract, and settlement-cycle are not demo-ready.

---

## 🛡️ ADMIN

### UI
- [ ] 🔴 **No settlement "hold"/override control** — settlements page only offers lock/unlock/reconcile/pay (`app/admin/settlements/page.tsx:121-154`); the per-redemption `held` status (`lib/types/enums.ts:164`) has no UI. Fails PRD demo step 7.
- [ ] 🟡 **NGO partners read-only** — no add/edit/suspend (`app/admin/ngo-partners/page.tsx`); created only by direct DB insert.
- [ ] 🟡 **Dashboard has no KPIs** — static nav-card directory (`app/admin/page.tsx:67-93`) despite aggregation existing in `app/api/admin/reports/route.ts:99-144`.
- [ ] 🟡 **No admin Tokens page** — expire-sweep is API-only (`app/api/admin/tokens/expire-sweep/route.ts`), no batch/distribution view.
- [ ] ⚪ Reports: no on-screen line-item drill-down (`app/admin/reports/page.tsx`).
- [ ] ⚪ Fraud dismiss/resolve doesn't send `notes` though route accepts it (`app/admin/fraud/page.tsx:104-126` vs `app/api/admin/fraud/route.ts:78`).

### Backend
- [ ] 🔴 **No settlement override/hold route** — only lock/unlock/reconcile/pay (`app/api/admin/settlements/route.ts:57-62`); matrix grants admin the `override` cap ("hold/delay", `lib/permissions/matrix.ts:123`) but no route consumes it; nothing ever sets `payment_status='held'`.
- [ ] 🟡 **NGO partners route is GET-only** — no POST/PATCH/DELETE (`app/api/admin/ngo-partners/route.ts`).
- [ ] 🟡 **Fraud scan is vendor-volume-only, heuristics hard-coded** — flags ≥3/day & ≥3× median, constants should move to system_config (`lib/services/fraud.ts:72-107`); cloned-QR / GPS-integrity enums reserved/unimplemented (Phase-2).
- [ ] ⚪ Reports export on-the-fly CSV, no persisted artifact (`app/api/admin/reports/route.ts:50-51`; `app/api/admin/reports/export/route.ts`).
- [ ] ⚪ expire-sweep/fraud-scan are admin-triggered, no cron wired (`app/api/admin/tokens/expire-sweep/route.ts:9`).
- [x] ✅ Audit-log immutability genuinely enforced (m08: no UPDATE/DELETE policy + `audit_logs_block_mutation` trigger hard-raising even for service_role).
- [x] ✅ Role gating real & centralized (`defineRoute`→`assertCan` vs matrix; UI `useCan()` cosmetic).
- [x] ✅ `system_config` truly drives features (`lib/system-config.ts` sole reader).
- [x] ✅ All lists real DB-backed with loading/forbidden/empty states.

**Admin ≈ 80%** — broadly functional; gaps are the hold override, NGO management, dashboard KPIs, and tokens UI.

---

## 🤝 VOLUNTEER & BENEFICIARY

### UI
- [ ] 🟡 **No beneficiary self-registration page** — matrix grants `guest→self_register` (`lib/permissions/matrix.ts:99`) and RLS anticipates it (`supabase/migrations/...m05_beneficiaries.sql:117`), but no `app/beneficiary/**` route exists. Registration only via admin/volunteer.
- [ ] ⚪ **Distribute form's "face hash" input is cosmetic** — free-text field; route only records `face_hash_checked: !!body...` (`app/api/volunteer/tokens/[id]/distribute/route.ts:106`). No verification (face-hash applies at *redemption* per token-flow §4). Relabel/remove for demo honesty (`app/volunteer/page.tsx:196-204`).
- [ ] ⚪ No volunteer self-signup (login only — `app/volunteer/login/page.tsx`).
- [ ] ⚪ Volunteer beneficiaries list reads the *admin* path (`app/volunteer/beneficiaries/page.tsx:34`) — RLS-safe but leaves the dedicated volunteer route unused.
- [ ] ⚪ No volunteer-facing redemption visibility despite `read all` cap (`matrix.ts:106`).

### Backend
- [ ] 🟡 **`POST /api/volunteer/beneficiary-registrations` is broken/orphaned** — schema accepts only `face_hash`/`aadhaar_hash` (`route.ts:23-31`), never handles `face_capture`/`face_embedding`; shared form posts to the *admin* path instead, so this is dead code that would silently drop the embedding. Delete it or bring to parity with the admin route (`app/api/admin/beneficiary-registrations/route.ts:79-89`).
- [ ] 🟡 **Same route lacks the liveness gate** the admin route has (`app/api/admin/beneficiary-registrations/route.ts:72-78`) — only matters if revived.
- [ ] 🟡 **`max_tokens_per_volunteer` unset** (ASSUMPTIONS.md open item) — enforced only when set (`lib/volunteer/allocation.ts:60-75`; `app/api/volunteer/allocation/route.ts:28-37`); until the mentor sets a number, volunteers have **no holding cap** and UI shows "No holding limit is set" (`app/volunteer/page.tsx:310-315`). Decision blocker, not a bug.
- [x] ✅ Beneficiary face verification real & privacy-safe — on-device embedding → `pgvector(1024)` (never raw image), cosine match via server-only `match_beneficiary_face` (m23), required at redemption (`app/api/vendor/redemptions/route.ts:36`), liveness-gated + cross-vendor repeat detection (`lib/services/redemption.ts:267-468`).
- [x] ✅ Allocation/request/distribute fully conform to token-flow §3–§4 — race-guarded, oldest-first pool pull, derived holdings (`lib/volunteer/holdings.ts`), correct RBAC.
- [x] ✅ Volunteer cannot approve eligibility — enforced at RLS (`m05_beneficiaries.sql:132-136`) + decide route (`app/api/admin/beneficiary-registrations/[id]/decide/route.ts:27`).

**Volunteer+Beneficiary ≈ 80%** (backend ~90%, UI ~70%).

---

## 🎯 Cross-cutting priorities (demo-readiness order)

1. 🔴 **Guest donation 401 + real UPI confirm** (Donor) — breaks demo step 1 & the no-app QR page. (`upi-qr-payment-gateway` skill maps onto this.)
2. 🔴 **Real QR scan + proof upload→storage→payment gate** (Vendor) — breaks demo steps 4 & 6.
3. 🔴 **Settlement "hold" override route + UI** (Admin) — breaks demo step 7. Enum + matrix cap already exist; needs route + button.
4. 🔴 **Apply missing m22 storage bucket migration** (Vendor docs/KYC).
5. 🟡 **Fix vendor profile GET contract** so the edit form works.
6. 🟡 **Resolve `max_tokens_per_volunteer`** (needs a mentor value) + delete/fix the orphaned volunteer reg route.
7. 🟡 **Payment + email providers** — standing open items behind several mocks.
