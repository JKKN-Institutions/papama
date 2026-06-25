# Guest / no-auth donation flow — design

> How anonymous (no-account) donations enter the donor-centric token pipeline.
> Decided June 2026. Reconciles with `token-flow.md` (Path B) and PRD §4 (POOL is Phase 2).

## Problem
The token model is **donor-centric**: credit accrues to a donor → the donor mints →
Path A (live) or **Path B (admin pool → volunteer → beneficiary)**. A guest has no
donor, so a no-auth gift was recorded as a donor-less `donations` row that produced
**no credit and no token** — orphaned money that never became meals.

## Design — "attribution-first, anonymous-pooled, admin-converted"
An anonymous gift is conceptually *"money pApAmA decides how to distribute"* = **Path B**.
So we bridge guest money into the existing admin pool rather than invent a new lane.

```
Guest /donate (no login)
   ├─ (future) email/phone given → create/claimable donor → credit that donor
   └─ anonymous → credit the system "Guest Pool" donor
                       │  admin "Convert pool → tokens"
                       ▼
                 tokens minted to in_admin_pool  ── reuses Path B ──►
                 allocation → volunteer → beneficiary → redeem → settle
```

## What's built (Phase-1-safe)
- **Guest Pool donor** (`lib/donations/guest-pool.ts`) — a single userless system
  `donors` row (sentinel email `guest-pool@papama.internal`), find-or-create, no migration.
- **`/api/donations/create-guest`** now credits the Guest Pool donor (notifications
  skipped — no user), so anonymous gifts accumulate as usable credit.
- **`POST /api/admin/pool/mint`** (admin) — converts pool credit into Standard tokens
  placed directly into `in_admin_pool` (₹ = `standard_token_value`, never invented;
  atomic credit-deduct with compensating refund). Downstream = existing Path B.
- **`/admin/donations`** — all gifts (attributed + guest) + the Guest Pool balance +
  the convert action.

## Explicitly deferred to Phase 2 (PRD §4 POOL)
- Auto **value-completion** (topping a ₹30 gift up to a ₹50 token), micro-donation
  matching. We laid the accumulate + admin-convert seam; the auto-completion engine
  is not built.

## Open decisions / follow-ups
- **Email-attributed guests** (claimable donor): mechanism (passwordless link vs
  unclaimed-donor-record) not yet chosen — anonymous→pool is built; attribution layer is next.
- **Signed-in "Donate anonymously"** (`app/donor/donate`): currently routes to the
  Guest Pool (donor gets no personal credit). Decide: keep (true anonymous) vs credit
  the donor but hide their name publicly.
- **Backfill**: 4 legacy guest donations (₹300) predate this change and remain
  donor-less ("Unattributed" in /admin/donations). Optional one-time reassign to the pool.
