# Token-Flow End-to-End Audit — 2026-06-25

Audit of the full token lifecycle against `docs/prd.md` (Phase 1 spec) and `docs/token-flow.md`.
Conducted by a 4-agent team, one per lifecycle segment. Verdicts: OK / GAP / BUG / MISSING.

> **Spine verdict:** the core money/redemption integrity is sound — credit→mint, atomic
> volunteer allocation, redemption burn + value-handling, proof-gated payment, cycle-aware
> settlement with admin hold, immutable audit. Issues cluster in **distribution breadth**
> and a few **enforcement gaps**.

## Issue register (prioritised)

### 🔴 Demo-blocking / correctness
| # | Issue | Where | Status |
|---|-------|-------|--------|
| 1 | **DIST-5 printed/anti-copy QR not built** — on-screen QR only; no print view, anti-copy mark, or area-lock | `app/donor/tokens/[id]/page.tsx` | open |
| 2 | **Sub-threshold mint possible** — `standard_token_value` floor is route-only inside a swallowing try/catch; no DB CHECK on `tokens.value_inr` | `app/api/tokens/convert/route.ts:64-75` | open |
| 3 | **`city_lock_enabled` enforced nowhere** — redemption reads only radius; city-lock (default true) is a silent no-op | `lib/services/redemption.ts` (geofence) | open |
| 4 | **Cooldown/meal-limit bypassable** when no face matches; cooldown-log insert is non-throwing so it may never seed | `redemption.ts:388`, `vendor/redemptions/route.ts:139-149` | open |

### 🟠 Functional gaps (PRD requirement unbuilt)
| # | Issue | Where | Status |
|---|-------|-------|--------|
| 5 | **DIST-6 scheduled occasion + 7-day reminder** — `scheduled_redemption_dates` is dead schema | no app/ usage | open |
| 6 | **DIST-7 courier for batches > ₹5,000** — `courier_batch_min_value` configured but never consumed | no `courier` in app/ | open |
| 7 | **Path A `donor_self` distribution record never written** — audit-chain hole for self-held tokens | `convert/route.ts:86,187-198` | open |
| 8 | **Thank-you alert never sent** — `thank_you` type styled but no route dispatches it (re-donate link exists) | redemption route | open |
| 9 | **Mint ledger row mistyped** `'donation'` with negative amount | `convert/route.ts:154-159` | open |

### 🟡 Minor / cosmetic / accepted
| # | Issue | Where | Status |
|---|-------|-------|--------|
| 10 | `₹50` hardcoded in donor credit banner + `?? 50` fallbacks (logic is config-driven) | `app/donor/credit/page.tsx:147,33,56` | open |
| 11 | Redemption-alert key mismatch — writes `metadata.redeemed_at`, UI reads `meta.time` → falls back to `created_at` | `vendor/redemptions/route.ts:201` | open |
| 12 | SMS/email channels are seams, not wired — gated on un-procured provider keys (ASSUMPTIONS Q4) | `lib/notifications/dispatch.ts` | **deferred (Phase 1 accepted)** |

## Verified correct (no action)
Donate-any-amount → non-withdrawable credit → config threshold alert → single-token CAS mint →
encrypted one-time QR, fixed value, no split/combine · two-tier `token_types` (Special-Care 2×,
nutrition-restricted, eligibility-gated) · expiry auto-invalidate cron LIVE (`papama-expire-tokens`,
daily 02:00 UTC) · atomic `allocate_pooled_tokens` RPC (concurrent cap + active gate + partial grants) ·
volunteer→beneficiary + admin revoke + all channels (except donor_self) · QR auth / fail-closed geofence
radius / face-hash primary + liveness / value handling (forfeit, pay-difference, ₹0 co-pay) /
double-scan-safe burn · proof gate (no proof = no pay) · settlement engine + admin hold · donor dashboard
(impact stats, monthly summary, forfeiture hidden) · immutable `audit_logs`.
