# pApAmA — Full-App Audit & Demo-Blocker Remediation (2026-06-24)

**Scope:** every module — donor, vendor, token/distribution, volunteer, beneficiary, admin —
plus security/RLS, performance, and data-integrity, audited against the authoritative specs
(`papama-phase1-spec.md`, `papama-owner-scope.md`, `token-flow.md`).

**Method:** 6 parallel read-only audit agents, then direct re-reading of disputed files and
**live read-only DB inspection via the `supabase-papama` MCP** to confirm/refute each finding.
This supersedes `prd-gap-audit.md` (2026-06-23, pre-build-out) and independently verifies the
self-reported `fix-report-2026-06-24.md`.

**Legend — Status:** `FIXED` (in this pass) · `SQL` (proposed migration, not applied) ·
`DEFER` (reported, out of demo-blocker scope) · `FALSE+` (claimed by an agent, disproved here).
**Severity:** H = breaks the demo or corrupts money/data · M = spec violation / demo-visible ·
L = polish.

---

## 1. Headline

The governance shell, donor outbound flow, redemption engine, proof gating, settlement, face
verification, UPI-QR confirm and pg_cron expiry are all **real and largely sound** — a big step up
from the 2026-06-23 state. The defects that remained were concentrated in **money atomicity**
(read-modify-write races), a handful of **redemption/settlement correctness gaps**, one
**donor-transparency key mismatch**, and **RLS hardening**. The genuine demo-blockers are now
**FIXED in code**; the deeper money-integrity and RLS items are **proposed as SQL** (m27–m30).

**Verified positive:** the admin settlement-hold columns (`on_hold`/`hold_note`) **exist live**, so
demo step 7 (admin override hold) works.

---

## 2. False positives disproved (do NOT act on these)

| Agent claim | Reality (verified) |
|---|---|
| Donor `dashboard`/`credits` leak cross-donor data (missing `.eq donor_id`) | RLS `*_select_own USING donor_id = current_donor_id()` scopes every row. Confirmed live. Defense-in-depth nit only. |
| `/donate` guest path returns 401 | `app/donate/page.tsx:58` calls the ungated `createGuestDonation`. Works. |
| Vendor proof upload posts file *names*, not binaries | `app/vendor/scan/page.tsx:264-302` posts real `FormData` File objects. Works. (Agent quoted the stale June-24 doc.) |
| `tokens.serial_number` collisions create silent duplicates | A UNIQUE constraint **exists live** (found=1) — a collision is a hard mint *failure*, not a duplicate. Fixed by hardening the generator instead. |
| `credit_transactions.type='donation'` for a mint is High | UI maps `purchase→Added`, else→`Converted`; displayed ledger is correct. Downgraded to L (odd raw label only). |

---

## 3. Demo-blockers — FIXED in this pass

### Money atomicity (3 races; cross-verified by 3 agents)
- **H · FIXED · `app/api/tokens/convert/route.ts`** — mint deducted credit *after* inserting the
  token via a plain read→write; concurrent mints could double-spend. **Reordered to a
  compare-and-swap deduct-first** (`.eq("balance_inr", balance)`), 409-style reject on conflict,
  then insert, with a compensating CAS refund if the token insert fails.
- **H · FIXED · `app/api/_lib/recordDonation.ts`** — credit increment was read→add→write.
  **Replaced with a bounded CAS retry loop** (`.eq("balance_inr", oldBalance)`), so concurrent
  donations can't lose an update.
- **H · FIXED · `app/api/payment/upi-qr/confirm/route.ts`** — `recordDonation` ran *before* the
  PENDING→PAID guard, double-recording on a race with no rollback. **Reordered to claim
  PENDING→PAID first**; record the donation only if we won; revert the claim on failure.
- (Hardening RPCs that make these fully atomic at the DB layer are proposed in **m27**.)

### Redemption / vendor
- **H · FIXED · `lib/services/redemption.ts`** — added a HARD `vendor_status` check; a
  pending/suspended/rejected outlet can no longer scan, burn a token, or lock payment.
- **H · FIXED · `app/vendor/scan/page.tsx:305`** — `allChecksPass` used `.every(c => c.pass)`,
  so any informational SOFT-fail blocked the Serve button. Now `.every(c => !c.hard || c.pass)`,
  mirroring the engine's own `ok` rule. (Client `PreviewCheck` type gained `hard`.)
- **H · FIXED · `app/api/vendor/redemptions/[id]/proof/route.ts`** — proof UPDATE had no
  `payment_status='locked'` guard, so a vendor could overwrite proof on a released row or flip an
  admin **hold** back to released. Added an early `locked`-only check **and** a CAS on the update.

### Donor transparency
- **H · FIXED · `app/api/vendor/redemptions/route.ts`** — redemption notification wrote `vendor`
  (and no `meal_info`); the UI reads `vendor_name`/`meal_info`, so panels showed `undefined`.
  Writer now emits `vendor_name` + `meal_info` (from `result.menuItem.item_name`).

### Settlement / admin
- **H · FIXED · `lib/services/settlement.ts`** — cycle windowing dropped released redemptions older
  than one cycle, permanently stranding them (never paid). Now **settles all released, not-yet-
  settled redemptions**; `period_start/period_end` stamp the actual span. Removed the unused
  `CYCLE_WINDOW_MS`.
- **M(visible) · FIXED · `app/vendor/settlements/page.tsx`** — page read `s.cycle`; API returns
  `period`, so the "Cycle" column was always "—". Now reads `s.period`.
- **M(visible) · FIXED · admin settlements** — table showed a raw vendor UUID. Added `vendor_name`
  to `settlementResponseSchema` + a batch name lookup in `GET /api/admin/settlements`; the page now
  shows the name (UUID prefix fallback).
- **M · FIXED · `app/api/admin/vendors/route.ts`** — `approve` no longer succeeds unless
  `kyc_status='verified'`.
- **M · FIXED · `app/api/admin/system-config/route.ts`** — numeric config now rejects negative
  values (a negative radius/cooldown silently disabled rules).

### Security quick-wins
- **M · FIXED · `app/login/page.tsx`, `app/volunteer/login/page.tsx`** — `?redirect=` open-redirect
  guarded to same-origin relative paths (`/…`, not `//evil.com`).
- **L · FIXED · `app/api/tokens/convert/route.ts`** — serial generator hardened (base-36 timestamp
  + random) so it won't collide against the existing UNIQUE constraint and fail a mint.
- **M · FIXED · `app/api/donor/credits/route.ts`** — threshold read moved to the service-role
  client so the **m30** `system_config` restriction won't break the donor UI.

---

## 4. SQL migrations — APPLIED 2026-06-24 (via MCP, user-authorized)

Source in `docs/proposed-migrations/`; applied to project `qxdxefofeykzvegykitt` in order and
verified live (functions present, index present, policies updated).

| File | What | Fixes | Status |
|---|---|---|---|
| `m27_credit_ops_rpc.sql` | `papama_add/deduct_donor_credit()` atomic SECURITY DEFINER fns | Fully closes the credit races (hardening over the app-level CAS) | ✅ applied |
| `m28_beneficiary_approve_rpc.sql` | `papama_approve_beneficiary()` — insert + link in one txn, row-locked | Orphan/duplicate beneficiary on partial approve | ✅ applied |
| `m29_upi_transaction_id_unique.sql` | partial UNIQUE on `upi_qr_payments.upi_transaction_id` | Durable UTR-reuse guard (verified: none existed) | ✅ applied |
| `m30_rls_hardening.sql` | `users`→authenticated; restrict `system_config` SELECT to staff; drop `audit_logs_insert_self`; drop `vendor_manager` from `vtr_*` | RLS exposure (all defs verified live) | ✅ applied |

> **m30 pre-req (done):** `donor/credits` reads `standard_token_value` via the service-role client,
> so the `system_config` SELECT restriction does not break the donor mint-threshold display.
> **m27/m28 are hardening primitives** — the routes still use the app-level CAS today and can be
> switched to call these RPCs in a follow-up (no behavior change required for them to be live).

---

## 5. Reported / deferred (not in demo-blocker scope)

> **RESOLVED 2026-06-24** — every item below was subsequently addressed by a 5-agent team.
> See **`docs/root-cause-report-2026-06-24.md`** for per-item resolution + thematic root causes.
> Code fixes are merged (build green); m31/m32 applied live; m33/m34 proposed-and-ready (need
> go-ahead); operator/env items in `docs/security-actions-required.md`.

**Spec gaps**
- **M** Patient eligibility has no auto-expiry (only pregnancy does) —
  `…/beneficiary-registrations/[id]/decide/route.ts:69-79`; needs a `patient_eligibility_months`
  config + branch + UI date-picker.
- **M** Multi-channel notifications (SMS/email/WhatsApp): enum seam exists, **no dispatcher** —
  all inserts default `channel='in_app'`. (Providers are client-procured — ASSUMPTIONS.md.)
- **M** i18n (DoD F-8): **zero** infrastructure; all strings hardcoded across `app/**`. Phase-2
  retrofit will touch every component.

**Security (deeper)**
- **L/DEFER** Definer fns `current_app_role()`/`current_donor_id()` are REST-callable by
  `authenticated` (advisor 0029). A naive `REVOKE` **would break RLS** (policy expressions need
  caller EXECUTE), so the correct fix is relocating them to a non-API `private` schema + repointing
  every dependent policy — a larger, test-gated change. Low real risk (parameterless, return only
  the caller's own role/donor_id). **Deliberately NOT shipped as a quick migration.**
- **L** Leaked-password protection disabled + 6-char min (Supabase Auth dashboard toggles).
- **M** `TOKEN_QR_SECRET` unset → the service-role key signs QRs; rotating it invalidates every
  issued QR. **Provision a dedicated `TOKEN_QR_SECRET`** before launch (env, not code).
- **L** `.env.local` holds live keys but is **git-ignored and untracked** (verified) — rotate
  before production as hygiene, not a leak.
- **M** Volunteer role can read all `vendors` rows incl. bank columns *via the raw Supabase client*
  (no API route exposes them — the admin vendors GET selects no bank columns). RLS-level only;
  fold into a future `vendors` column-scoping policy.

**Performance**
- **M** `lib/volunteer/holdings.ts` full-scans all `assigned_to_volunteer` tokens + their
  distribution records on every allocation (no per-volunteer SQL filter).
- **M** `lib/services/settlement.ts:62` and `app/api/admin/reports` sum full table scans in JS.
- **M** Admin list routes (vendors/beneficiaries/settlements/fraud/audit-logs) have no pagination.
- **L** Missing composite index `token_redemptions(payment_status, redeemed_at)` for the settlement
  filter+sort.

**Data integrity / build**
- **M** Migrations `m20`/`m21` absent from the repo → `supabase db reset` diverges from live
  (reproducibility / DoD "reversible migrations").
- **L** `total_donated_tokens` counter increment is non-atomic (display-only, best-effort).
- **L** Token QR rendered via third-party `api.qrserver.com` (leaks the payload); render with the
  local `qrcode` dep instead.
- **L** Fraud day-boundary uses local `setHours` not `setUTCHours` (`lib/services/fraud.ts:86`).

**UI/UX**
- **L** `window.prompt()` for fraud-resolution notes; missing confirm dialogs on vendor
  approve/reinstate; NGO-partners page is read-only (API has POST/PATCH); donor token-filter
  missing `assigned_to_volunteer`/`distributed`; volunteer `StatusBadge` lacks tones for pool/
  assigned states.

---

## 6. Verification

- `npx tsc --noEmit` → **clean (exit 0)** after all edits.
- `npx next build` → see the build task result appended to this PR.
- **Mint race:** two concurrent `POST /api/tokens/convert` on a ₹50 credit → one succeeds, the
  other rejects with "balance just changed"; balance never negative; no orphan token.
- **Redemption:** a `status='pending'` vendor is hard-blocked; an approved vendor with only SOFT
  failing checks can still serve; proof on a `held` row is rejected.
- **Transparency:** a real redemption produces a donor notification showing vendor name + meal
  (not `undefined`).
- **Settlement:** a >cycle-old released redemption is included in the next run; the hold blocks
  payout (columns confirmed live).
- After applying m27–m30, re-run a security pass to confirm advisors clear.
