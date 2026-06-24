# pApAmA — Fix Report (Donor / Vendor / Volunteer-Beneficiary)

**Date:** 2026-06-24
**Scope:** Resolved all remaining-work items from `docs/audit-roles-remaining-work.md` **except Admin** (Admin handed to a teammate via `docs/audit-admin-remaining-work.md`).
**Build status:** ✅ `npx tsc --noEmit` passes clean (exit 0) across the merged tree. VendorFixer also confirmed `npx next build` succeeds.
**Decisions honored:** volunteer cap stays inert (not invented); UPI manual flow only (card/netbanking + email remain flagged mock seams); **no migration was applied** — all proposed as `.sql` for manual run.

---

## ✅ MIGRATIONS APPLIED (2026-06-24, via MCP to project qxdxefofeykzvegykitt)

User explicitly authorized a one-time override of the CLAUDE.md "never apply" rule. Applied via `apply_migration` after read-only dependency verification; all four confirmed live:

| Order | File / migration name | Creates | Status |
|---|---|---|---|
| 1 | `m22_vendor_documents_storage` | `vendor-documents` bucket + 6 RLS policies | ✅ applied & verified |
| 2 | `m24_upi_qr_payments` | `upi_qr_payments` table + 1 RLS policy | ✅ applied & verified |
| 3 | `m25_vendor_settlement_cycle` | `vendors.settlement_cycle` column (nullable) | ✅ applied & verified |
| 4 | `m26_vendor_proofs_storage` | `vendor-proofs` bucket + 4 RLS policies | ✅ applied & verified |

> **Numbering note:** parallel agents both initially grabbed `m24`. Resolved during merge — donor UPI kept `m24`; vendor proofs renumbered to **`m26`** (route "apply m24" strings updated to "apply m26").
>
> **Ledger-drift note:** the live migration ledger uses different version names than the repo's `.sql` filenames (e.g. the repo's `m23_face_embeddings` isn't in the ledger). Verified this is **cosmetic only** — pgvector, `beneficiaries.face_embedding`, `beneficiary_registrations.face_embedding`, `match_beneficiary_face()`, and the `face_match_threshold`/`face_liveness_min` config keys all exist on live, so the face flows work. Pre-apply dependency checks confirmed `vendors.owner_id`, `current_app_role()`, `set_updated_at()`, the `settlement_cycle` enum, and `donations` were all present.

---

## 🟦 DONOR (task #5) — DonorFixer

- 🔴→✅ **Guest/anonymous donation path.** New ungated `POST /api/donations/create-guest` (Zod-validated, per-IP rate limit, service-role insert of donor-less `donations` row — `donor_id` already nullable in M15, no migration). New shared helper `app/api/_lib/recordDonation.ts` is now the single source of truth (guest route, UPI confirm, and the refactored authed create route all use it). Client gained `createGuestDonation()`; anonymous toggle + `/donate` wired to it.
- 🔴→✅ **Real UPI manual confirm** (per `upi-qr-payment-gateway` skill). `/donate/qr` rewritten to a real 3-step flow: amount → backend-generated QR (configurable VPA) + live 15-min countdown → UTR capture → confirm (writes `payment_ref = upi:<UTR>`, real evidence). New routes `POST /api/payment/upi-qr/generate` + `/confirm` (lazy expiry, double-confirm race guard). Deps added: `qrcode`, `nanoid`, `@types/qrcode`. **Needs migration m24.**
- 🟡→✅ **`TOKEN_QR_SECRET` seam** — `tokenQr.ts` reads it, falls back to service-role key when unset (no break pre-provisioning).
- 🟡→✅ **Dashboard "patient" mislabel** — unknown `beneficiary_category` now falls back to neutral `"beneficiary"`; types widened; scoped service-role read left as-is (already correctly bounded, no leak).
- ⚪→✅ JSX quotes escaped (`impact/page.tsx:161`).
- ✅ Verified `standard_token_value=50` already seeded in m03 — ₹50 threshold fires in demo.
- ⛔ **Still mock (by decision):** card/netbanking payment + email receipts — flagged in ASSUMPTIONS.md + new root `.env.example`.

## 🟩 VENDOR (task #6) — VendorFixer

- 🔴→✅ **Real QR camera scan** — new `components/vendor/QrScanner.tsx` (html5-qrcode, rear camera, lazy-loaded); wired into `vendor/scan` with paste kept as fallback.
- 🔴→✅ **Proof upload sends real binaries + true gating** — scan page POSTs multipart (`photo`,`receipt`); proof route rewritten to **require both images**, upload to `vendor-proofs` bucket, and only then flip `locked→released`. No proof, no release. **Needs migration m26.**
- 🔴→✅ **m22 vendor-documents bucket** authored (was the missing migration causing 400s). **Needs migration m22.**
- 🔴→✅ **Vendor profile GET contract** — now returns the full flat shape the edit form + dashboard expect (incl. flat `geo_lat/geo_lng`, `settlement_cycle`); PATCH aligned. Also fixes the dashboard location bug (no page change needed).
- 🟡→✅ **Geofence fail-closed** — omitting `geo` now HARD-blocks when vendor geo + radius are configured (seeded 20km); soft-skips only when genuinely unevaluable.
- 🟡→✅ **Per-vendor settlement cycle** — `vendors.settlement_cycle` column (m25) + cycle picker in profile UI + `runSettlement` honors per-vendor cycle with period windowing. **Needs migration m25.**
- ⚪→✅ Co-pay ₹0 default / ₹5 max hint + client clamp.

## 🟪 VOLUNTEER & BENEFICIARY (task #7) — VolunteerFixer

- 🟡→✅ **Beneficiary self-registration** — new public `app/beneficiary/register/page.tsx` + `POST /api/beneficiary/register` (hand-written public route, service-role insert of PENDING row, `submitted_by=null`). Full face parity with admin route (liveness gate + embedding); privacy-safe (on-device embedding only, no raw image). No migration (m05 already allows it).
- 🟡→✅ **Orphaned volunteer route revived to parity** — `/api/volunteer/beneficiary-registrations` now handles `face_capture`→embedding + liveness; `volunteer/beneficiaries` page repointed (GET + POST) to it (was wrongly hitting the admin path). `BeneficiaryRegisterForm` got optional `endpoint`/`credentials` props (admin default unchanged).
- ⚪→✅ **Cosmetic face-hash input removed** from distribute form + route schema/audit; replaced with a note that face verification happens at redemption (token-flow §4).
- ⛔ **`max_tokens_per_volunteer` left inert (by decision)** — flagged dated in ASSUMPTIONS.md; enforcement logic unchanged (NULL = no cap).

---

## 🚩 Flags & demo-day notes

- ✅ **`.env.local` is NOT committed** — `.env*` is gitignored; the earlier "live keys committed" worry was a false alarm (file is local-only, as intended).
- **Set `NEXT_PUBLIC_UPI_VPA`** to a real merchant VPA before launch — dev falls back to a flagged demo VPA `papama@upi` (not a real collecting account).
- **Geofence is now mandatory when configured** — on the vendor scan page the operator must click "Use my location" or the check hard-fails (intended/demo-honest; bake into the demo script).
- **Admin coordination:** `runSettlement` now honors per-vendor `settlement_cycle`; the admin `settlements/run` `period` arg is now a **fallback** (for vendors with no chosen cycle), not a global label. Noted in the admin handoff doc.
- **Still open (mentor decisions):** card/netbanking provider, email provider, `max_tokens_per_volunteer` value.

## Next steps

1. Apply the 4 migrations above (in order).
2. Set `NEXT_PUBLIC_UPI_VPA` + (optionally) `TOKEN_QR_SECRET` in `.env.local`.
3. Smoke-test the demo script end-to-end (guest donate → UPI confirm; vendor scan → proof → release; self-register beneficiary).
4. Admin items proceed in parallel via `docs/audit-admin-remaining-work.md`.
