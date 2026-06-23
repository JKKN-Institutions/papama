# pApAmA — Donor Module Integration Plan

> Status: **Phase 1 (schema reconciliation) implemented** on branch
> `integrate/donor-unification`. Phases 2–5 are scoped below.
> Source audit: merge of `Sri-Subhiksha` (admin/backend) + `Dharshi` (donor).

## Goal

Unify the two merged halves into **one Next.js app on one Supabase schema**, per
`docs/papama-phase1-spec.md`. The admin/backend foundation is PRD-correct; the
donor module was a standalone mock with a conflicting schema. This plan keeps the
admin foundation and folds the donor module into it.

---

## The four critical conflicts (from the audit)

1. **`token_types` collision** — donor = campaign; PRD = Standard/Special-Care catalog.
2. **Open RLS** — donor schema used `using (true)` (public read/write).
3. **ID mismatch** — donor = text PKs + no auth; admin = UUID + Supabase Auth.
4. **Demo seed in a schema file** — donor schema injected `donor_001` etc.

---

## Phase 1 — Schema reconciliation ✅ DONE

New migrations (continue the M01–M13 series; UUID PKs, M01 enums,
`current_app_role()`/`current_donor_id()` helpers, real per-role RLS):

| Migration | Tables | Resolves |
|-----------|--------|----------|
| `m14_campaigns_token_types` | `campaigns` (was donor `token_types`), `token_types` (F-1 catalog, seeded) | conflict #1 |
| `m15_donors_credit_donations` | `donors`, `donor_credits`, `credit_transactions`, `payment_methods`, `donations` + `current_donor_id()` | conflicts #2, #3 |
| `m16_tokens` | `tokens` (real QR token), `token_batches`, `token_authorisations`, `token_distribution_records`, `scheduled_redemption_dates` | conflict #1/#3 |
| `m17_redemption_settlement_spine` | `token_redemptions`, `redemption_cooldown_log`, `forfeited_balances`, `settlement_line_items` | **the missing middle** |
| `m18_notifications` | `notifications` | TRANS alerts |

- `donor/supabase/schema.sql` emptied → deprecation stub (kills the open-RLS footgun).
- `settlement_line_items` (m17) completes the seam M10 explicitly left header-only.

**To verify (not yet run — needs a linked Supabase project):**
```bash
supabase db push            # or apply m14–m18 in the SQL editor in order
supabase db advisors        # MUST be clean (security + performance)
supabase migration list --local
```
After applying, smoke-test RLS: a donor JWT can read only its own donor/credits/
tokens; anon can read `campaigns`/`token_types` only; vendor JWT can write only
its own `token_redemptions`.

---

## Phase 2 — App unification (NOT STARTED)

- Move `donor/src/app/*` → root `app/donor/*` and `app/donate/*`.
- Merge `donor/package.json` deps into root: `react-hook-form`, `@hookform/resolvers`.
- Delete the donor app's duplicate `tsconfig.json`, `next.config.ts`, `eslint`,
  `postcss`, `package.json`, `public/*` (root already has equivalents).
- Replace `donor/src/services/supabase.ts` usage with root `lib/supabase/{client,server}.ts`.
- Reconcile types: donor `src/types/*` → root `lib/types` (avoid duplicate enums).

## Phase 3 — Real auth (NOT STARTED)

- Remove the hardcoded `donor_001` throughout donor services.
- Add donor login (Supabase Auth); `handle_new_user` already provisions a
  `users` row with role `donor` — additionally create/link a `donors` row.
- Replace donor service queries with `current_donor_id()`-scoped reads.

## Phase 4 — Real payments (NOT STARTED) — **requires `upi-qr-payment-gateway` skill**

- Replace the mocked donate flow + static `donate/qr` page with a real
  self-hosted UPI QR gateway (QR from merchant VPA, 15-min expiry, UTR capture,
  order back-link), writing a `pending` → `completed` `donations` row.
- Wire credit accumulation + ₹50 threshold (`system_config.standard_token_value`)
  to real confirmed payments, then notification.

## Phase 5 — Wire the spine end-to-end (NOT STARTED)

- Services for: credit→token conversion (m16), distribution (m16), redemption +
  validation (m17: QR, geofence via `redemption_radius_km`, 6h cooldown via
  `redemption_cooldown_log`, `max_meals_per_day`, value handling, ₹5 co-pay),
  proof-of-service unlocking `payment_status`, settlement run rolling
  `settlement_line_items` into `vendor_settlements`.
- Replace the donor module's 5-second `simulateBackgroundRedemption` with the
  real redemption → `notifications` (redemption alert with vendor/location/meal).

---

## Definition of done (PRD §10)

Demo script steps 1–9 run end-to-end on one app/one DB; `system_config` drives
every rule; proof-gated payments + settlement override work; audit immutable;
RLS enforced per the §6 matrix.
