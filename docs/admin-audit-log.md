# pApAmA — ADMIN Role: Remaining Work Log

**Date:** 2026-06-24
**Audited against:** `docs/prd.md` (§9 demo script, §10 Definition of Done)
**Scope:** every admin UI page (`app/admin/**`) and backend route (`app/api/admin/**`), plus `lib/permissions/matrix.ts`, `lib/system-config.ts`, `lib/services/fraud.ts`, `lib/api/handler.ts`, and the M08 audit-log migration.
**Method:** read-only audit; every item is evidence-backed with `file:line`.
**Severity legend:** 🔴 Blocker · 🟡 Important · ⚪ Polish · ✅ Verified-solid (no action)

**Overall admin completeness: ~80%** — broadly functional (real DB-backed lists, solid server-side role gating, working approval queues, genuine settlement run, on-demand CSV export, truly immutable audit trail). The notable gaps are the settlement "hold" override, NGO-partner management, dashboard KPIs, and an admin Tokens UI.

---

## UI

- [ ] 🔴 **No settlement "hold"/override control.** PRD §9 step 7 requires "Run a settlement… show admin override (hold)." `app/admin/settlements/page.tsx:121-154` only offers lock / unlock / reconcile / pay. The per-redemption `held` payment status (`lib/types/enums.ts:164`) has no admin UI to set it. **(named demo step)**
- [ ] 🟡 **NGO partners is read-only.** `app/admin/ngo-partners/page.tsx` lists with no add/edit/suspend controls; partners can only be created by direct DB insert.
- [ ] 🟡 **Dashboard has no KPIs/metrics.** `app/admin/page.tsx:67-93` is a static directory of nav cards only — no donation/redemption/open-fraud/pending-settlement figures, despite aggregation already existing in `app/api/admin/reports/route.ts:99-144`.
- [ ] 🟡 **No admin Tokens page.** No `app/admin/tokens/*`; expire-sweep is API-only (`app/api/admin/tokens/expire-sweep/route.ts`) with no UI trigger or token-batch/distribution view.
- [ ] ⚪ **Reports: date-only filters, no report-detail drill-down.** `app/admin/reports/page.tsx` lists summaries + CSV link but no on-screen line-item view.
- [ ] ⚪ **Fraud notes not capturable in UI.** Dismiss/resolve sends no `notes` (`app/admin/fraud/page.tsx:104-126`) though the route accepts `body.notes` (`app/api/admin/fraud/route.ts:78`).

## Backend

- [ ] 🔴 **No settlement override/hold route.** `app/api/admin/settlements/route.ts:57-62` defines only lock/unlock/reconcile/pay; `unlock` is locked→pending, not a "hold." Matrix grants admin the `override` cap for `vendor_settlement` ("hold/delay", `lib/permissions/matrix.ts:123`) but no route consumes it. No route ever sets a redemption `payment_status` to `held` (only locked→released in `app/api/vendor/redemptions/[id]/proof/route.ts:56`).
- [ ] 🟡 **NGO partners has no create/update route.** `app/api/admin/ngo-partners/route.ts` exports GET only — no POST/PATCH/DELETE.
- [ ] 🟡 **Fraud "scan" is vendor-volume-only, heuristics hard-coded.** `lib/services/fraud.ts:72-107` flags vendors ≥3 redemptions/day and ≥3× median; multiplier/floor are constants (comment: should move to system_config). Cloned/tampered-QR + GPS-integrity are reserved enums, unimplemented (Phase-2 seam). Real-time repeat-beneficiary/duplicate-token flags are raised by the redemption route. *(functional for demo)*
- [ ] ⚪ **Report file_url / storage export unimplemented.** `app/api/admin/reports/route.ts:50-51` — export rendered on-the-fly as CSV (`app/api/admin/reports/export/route.ts`); no persisted artifact.
- [ ] ⚪ **expire-sweep / fraud scan are admin-triggered, not scheduled.** Cron-ready POST routes, no cron wired (`app/api/admin/tokens/expire-sweep/route.ts:9`).

## ✅ What IS solid (verified, not gaps)

- [x] **Audit-log immutability genuinely enforced** — m08 migration: no UPDATE/DELETE RLS policy + BEFORE UPDATE/DELETE trigger (`audit_logs_block_mutation`) hard-raising even for service_role; no `updated_at`. Every mutating route audits via `defineRoute`'s bound `audit()`.
- [x] **Role gating is real + centralized** — every admin route uses `defineRoute` (`lib/api/handler.ts:89-113`) → `requireAppUser` + `assertCan` vs `PERMISSION_MATRIX`; UI `useCan()` is cosmetic, server is the true gate (403 → access-denied).
- [x] **system_config drives features** — `lib/system-config.ts` is the sole reader (redemption, volunteer allocation, handler); admin PATCH coerces by `value_type`, refuses guessed defaults (null = unset).
- [x] **All lists are real DB-backed** (vendors, beneficiaries, registrations, vendor-menus, settlements, fraud, reports, audit-logs, system-config, volunteers, requests, ngo-partners) with loading/forbidden/empty states.

---

## Suggested order of attack

1. 🔴 **Settlement "hold" override** (route + UI button) — named PRD demo step 7; the `held` enum and the `override` matrix cap already exist, so this is wiring, not new infrastructure.
2. 🟡 **NGO-partners create/manage** (POST/PATCH/DELETE route + UI controls).
3. 🟡 **Dashboard KPIs** — reuse the existing aggregation in `app/api/admin/reports/route.ts:99-144`.
4. 🟡 **Admin Tokens page** (batch/distribution view + expire-sweep trigger).
5. ⚪ Fraud notes in UI, report drill-down, move fraud heuristics to `system_config`, schedule expire-sweep/fraud-scan.