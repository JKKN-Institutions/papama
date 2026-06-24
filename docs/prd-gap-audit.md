# pApAmA — PRD Gap Audit (full codebase vs `docs/prd.md`)

**Date:** 2026-06-23 · **Branch:** `main` (== `full-app-build`, `59c8e5b`) · **Method:** 3 parallel read-only audit agents (donor / backend+DB+RLS via Supabase MCP / mid-loop) + synthesis.
**Legend:** ❌ NOT-IMPLEMENTED · 🔴 BROKEN · 🟠 WRONG-FLOW · 🟡 RISK · ✅ solid. Severity: H/M/L.

---

## 1. Headline

> **The governance shell + the donor outbound half are well-built. The entire middle of the loop (redeem → proof → settle) is unbuilt.** The m17 DB spine (`token_redemptions`, `redemption_cooldown_log`, `forfeited_balances`, `settlement_line_items`) exists with full RLS but has **zero application writers**. The redeem-and-settle loop **cannot run end-to-end today.**

**0 of the 9 demo steps run fully on the real flow.** Steps 1/3/7/8/9 are partial; steps 2/4/5/6 are not built.

---

## 2. Demo-readiness matrix (`prd.md` §9)

| # | Step | Status | Blocker |
|---|------|--------|---------|
| 1 | Donate → credit ₹50 → alert → Standard token + QR | 🟠 PARTIAL | Payment mocked; governed routes write **no** threshold/token notification (alert only in mock); QR is plaintext |
| 2 | Special Care token to a **registered** beneficiary, nutritious-restricted | ❌ NONE | No beneficiary-registration/approval route; no menu restriction |
| 3 | Distribute (digital + printed anti-copy QR; volunteer path) | 🟠 PARTIAL | Donor digital QR exists but **plaintext**; **Path B is a no-op**; volunteer allocation absent; no anti-copy |
| 4 | Vendor scan → live validations (6h block, geofence) | ❌ NONE | No vendor app, no redemption route, no validation engine |
| 5 | Under-value forfeit / over-value pay-diff / ₹5 co-pay | ❌ NONE | No value-handling code (`forfeited_balances` has 0 writers) |
| 6 | Vendor uploads plate photo + receipt → payment unlocks | ❌ NONE | No proof-upload route, no storage bucket, no lock-release |
| 7 | Settlement on vendor cycle + admin override (hold) | 🟠 PARTIAL | Override state-machine works **on empty headers**; no engine computes line items |
| 8 | Donor redemption alert + dashboard (time/vendor/location) + re-donate | 🟠 PARTIAL | UI + re-donate present, but redemption detail **stubbed**; alerts in-app only; fed by stub/mock |
| 9 | Fraud dashboard + immutable audit log + exportable CSR | 🟠 PARTIAL | **Audit log immutable ✅**; fraud always empty (no detection); CSR not file-exportable & zero-valued |

---

## 3. ❌ NOT-IMPLEMENTED (the big gaps)

**Layer-5 apps that don't exist at all** (Glob: no files):
- **Vendor app** (`app/vendor/**`) — login/scan/validate/menu/proof/settlement-view. **H** — blocks steps 4–7 + DoD "proof-gated payments."
- **Volunteer app** (`app/volunteer/**`) — registration-assist + distribution. **H** — blocks step 3 volunteer path.
- **Beneficiary self-register** (`app/beneficiary/**`) + the `beneficiary_registrations` route (admin route comment references it; it doesn't exist). **H** — blocks step 2.

**Engines with schema but no code:**
- **Redemption + validation** (QR + geofence + 6h cooldown + meal-limit + face-hash). **H** — no route writes `token_redemptions`/`redemption_cooldown_log`. (DoD: face-hash verification "working" — schema only.)
- **Value handling** (forfeit / pay-difference / co-pay). **H** — `forfeited_balances`/`difference_paid_inr`/`co_pay_inr` unused.
- **Proof-of-service + payment lock** — no upload route, **no storage bucket** (no `storage.buckets`/`.upload` anywhere), nothing flips `payment_status` locked→released. **H** (named DoD item).
- **Settlement engine** — `settlement_line_items` has 0 writers; no cycle scheduler; amounts stay 0. Step 7 is a header state-machine only. **H**
- **Fraud detection** — `fraud_flags` only listed/resolved; nothing detects repeat-beneficiary / vendor-anomaly / token-duplication / auto-block. **H**
- **Vendor menu/pricing approval** — no `menu` route; Special-Care nutritious restriction unenforceable. **M**

**Contract / lifecycle gaps:**
- **`GET /api/admin/tokens`** (Contract §11) — route dir absent. **H**
- **Auto-invalidate-on-expiry** — `expires_at` only displayed; no sweep/cron transitions tokens to `expired`. **H** (TOK-6).
- **i18n** — no lib/i18n, no locales, all strings hardcoded. **H** (DoD F-8).
- **Multi-channel notifications** (SMS/email/WhatsApp) — in-app only; no channel/send path. **M** (Q4).
- **Real payment gateway** — `payment_ref = mock:…`, QR page accepts any UTR. **M** (accepted placeholder, provider Q17 open).

---

## 4. 🔴 BROKEN / 🟠 WRONG-FLOW (built, but incorrect)

- 🔴 **H — Token QR is plaintext `PAPAMA:SERIAL`, not hashed/signed/one-time.** `tokens.convert/route.ts:81` stores the guessable plaintext as `qr_hash`; the m16 migration explicitly requires a *non-reversible hash* (SEC-5) and `schemas.ts:129` mislabels it "signed." No HMAC/nonce/anti-duplication. Violates TOK + step-3 anti-copy.
- 🟠 **H — Path B ("Authorize pApAmA") is a no-op.** `credit/page.tsx` always mints `use_now`; the fork buttons only set local React state and never send `authorize_papama`, so the token never enters `in_admin_pool`. (The route fully supports it — the UI just doesn't call it.) Breaks token-flow §2 Path B. *(Regression in the just-shipped fork fix.)*
- 🔴 **M — Governed convert/donate write no notifications.** Only `audit()` is called; no threshold/token-generated notification row → step-1 "threshold → alert" only works in mock-mode.
- 🔴 **M — Dashboard redemption detail is stubbed.** `donor/dashboard/route.ts:112-121` hardcodes `vendor_name:"Vendor"`, `location:""`, `meal_info:"Meal served"`, `beneficiary_category:"patient"`. Step-8 rich transparency isn't real.
- 🔴 **M — CSR report exports no file.** `reports/route.ts` POST inserts a JSON summary with `file_url` always null; UI Download shows "—". And the redemption/settlement/CSR summaries read **0** because nothing writes redemptions/line-items. DoD "CSR report exports" unmet.
- 🟠 **M — Donor can still server-mint Special Care.** UI selector is correctly gone, but `tokenMintRequestSchema` + the convert route still accept `token_type:'special_care'` + instructions from any donor caller.
- 🟠 **L — `convertible_tokens` N×₹50 framing leftover.** Mint is correctly one-token, but the credits banner still says "convert into N token(s)" (cosmetic contradiction of token-flow §1).

---

## 5. 🟡 Security / infrastructure (backend foundation is sound; these are cleanups)

- 🟡 **M — Migration files ≠ applied DB (not replayable).** Repo holds `m01–m19` stamped `20260620…`; the DB's applied set is stamped `20260623…` (incl. `m13b`, `m20`, `m19_advisor_fixes` with **no source file**, and repo `m01–m12` not in DB history). Live schema is correct, but `db reset` would diverge from prod. (DoD "reversible migrations.")
- 🟡 **L/M — `current_app_role()` / `current_donor_id()` RPC-callable by `authenticated`** (advisor 0029 ×2). Low real risk (STABLE, parameterless, return only the caller's own role/donor_id). Fix = relocate/revoke per the proposed `docs/proposed-migrations/m21*` (still **pending**).
- 🟡 **L — Leaked-password protection disabled** (advisor) — one Auth-dashboard toggle.
- 🟡 **L — `users` RLS policies granted to role `public`** not `authenticated` (inconsistent; not an exposure — quals deny anon).
- 🟡 **L — Donor `update:own on donor_donation_credit` overloaded** to gate notifications-read + profile-PATCH (intent blur, not exploitable; each handler re-scopes to the donor).

---

## 6. ✅ What's genuinely solid (verified, fair to lead with)

- **Governed-route architecture is consistent** across all `app/api/**`: `defineRoute → requireAppUser → assertCan(matrix) → session-client reads (RLS) / admin-client writes after check → audit() → Zod parseBody`.
- **RLS on 33/33 public tables**, all with policies; no table exposed without a policy.
- **Audit log is genuinely immutable** — no UPDATE/DELETE policies + BEFORE UPDATE/DELETE triggers that hard-raise even for `service_role`. (DoD met.)
- **`system_config` drives rules at runtime**; **donor id never trusted from the client** (`resolveDonorId` from session).
- **Donor happy path is real** (donate → credit → mint ONE chosen-value Standard token → QR/dashboard on governed routes); single-token mint, no donor Special-Care selector, opt-in mock, `simulateBackgroundRedemption` removed, **PAN/80G hook works**, forfeiture hidden.
- **Schema-vs-code clean** — no missing columns, no enum/22P02 risks in implemented routes.

---

## 7. Definition-of-Done scorecard (`prd.md` §10)

| DoD item | Status |
|---|---|
| Full demo runs end-to-end | ❌ (middle unbuilt) |
| All Phase-1 tables migrated with RLS | ✅ live (🟡 files not reproducible — B2) |
| `system_config` drives every rule | ✅ |
| Proof-gated payments + configurable settlement + admin override | ❌ (override toggle only; proof/engine unbuilt) |
| Aadhaar non-mandatory + **face-hash verification working** | ❌ (schema only, no verification) |
| Audit log immutable | ✅ |
| CSR report exports | ❌ (no file, zero-valued) |
| UI strings externalized (i18n-ready) | ❌ |
| `ASSUMPTIONS.md` present | ✅ |

**Met: 3/9** (RLS, config, audit immutability).

---

## 8. Recommended priority

1. **Quick correctness fixes (cheap, high-trust):** Path-B no-op (wire the fork to send `authorize_papama`); token `qr_hash` → real non-reversible hash/HMAC (SEC-5); reject donor `special_care` in the convert route; write threshold/token notifications in the governed flow.
2. **Security cleanups:** apply `m21` (revoke `authenticated` EXECUTE on the definer fns) + enable leaked-password protection + normalize `users` policies; reconcile migration files with the applied DB (B2).
3. **The missing middle (largest effort, unblocks the demo):** redemption + validation engine → proof-of-service + storage + payment-lock release → settlement line-item engine. Then the **vendor app** to drive them.
4. **Registration paths:** beneficiary self-register + eligibility approval (unblocks step 2); volunteer allocation (token-flow §3).
5. **DoD finishers:** real CSR file export, auto-invalidate-on-expiry job, i18n externalization, multi-channel notifications, `GET /api/admin/tokens`.
