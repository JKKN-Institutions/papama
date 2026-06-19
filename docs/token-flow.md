# pApAmA — Token Lifecycle & Distribution Flow

> **Authoritative flow document.** Decided with the project mentor (June 2026). This is the single source of truth for how a token is generated, distributed, and reaches a beneficiary. Where this document and the owner scope differ on distribution mechanics, **this document wins** (it is the team's resolved decision). All token-related schema, services, and routes must conform to this.

## 1. Generation (donor side)

1. A donor donates any amount, repeatedly. Donations accumulate into the donor's **credit** (non-withdrawable).
2. When a donor's accumulated credit **exceeds the minimum token value** (`system_config.standard_token_value`, the threshold), the donor is alerted and an **"Enable token creation"** option becomes available.
3. On enabling, the donor mints **one token** of a **donor-chosen amount**, constrained to:
   - `amount >= standard_token_value` (the threshold), and
   - `amount <= donor's available (unconverted) credit`.
4. Minting deducts the chosen amount from the donor's available credit and creates one `tokens` row with a unique encrypted one-time QR. Token value is fixed at mint time. No split / combine / partial.

## 2. The fork: two paths after generation

Immediately after minting, the donor chooses one of two paths:

### Path A — "Use it now" (donor self-distributes)
- The token becomes a **live token** held by the donor.
- The donor distributes it **themselves**, physically (printed QR) or digitally (sharing the QR). **There is no in-app donor→beneficiary handoff** — the app does not transfer a token to a specific beneficiary.
- The token is immediately valid for redemption and subject to expiry (`token_expiry_days`). Beneficiary-side rules (cooldown, meal-limit, geofence, face-hash) apply only at **redemption time**, not at generation.
- State: `live`.

### Path B — "Authorize pApAmA to distribute"
- The donor grants distribution rights to pApAmA. The token moves into the **admin pool**.
- State: `in_admin_pool`.
- From the pool, the admin allocates tokens to volunteers (see §3).

## 3. Admin pool → volunteer allocation (Path B only)

Two ways a pooled token reaches a volunteer:

### 3a. Admin-initiated assignment
- The admin selects a specific volunteer and allocates a chosen **number of tokens** to them.
- Allocation must respect the per-volunteer limit: a volunteer may hold at most `system_config.max_tokens_per_volunteer` undistributed tokens at once.
- Each allocation moves those tokens from `in_admin_pool` to `assigned_to_volunteer` and writes a `token_distribution_records` row.

### 3b. Volunteer-requested allocation
- A volunteer may **request** tokens (a requested count), within their remaining headroom under `max_tokens_per_volunteer`.
- The admin may grant (fully or partially) or deny. A grant behaves exactly like 3a (same limit check, same records).
- The request itself is tracked so the admin has a queue to act on.

**Limit semantics (decided):** `max_tokens_per_volunteer` is a **concurrent** limit — the maximum number of tokens a volunteer may currently hold in `assigned_to_volunteer` state (not yet distributed). Distributing a token frees headroom. It is a `system_config` row, admin-editable.

**Volunteer restrictions (client Q16):** volunteers may receive, hold, and distribute tokens, and assist beneficiary registration. Volunteers may **NOT** approve eligibility, change rules, or release payments. Enforce in RBAC + RLS.

## 4. Volunteer → beneficiary distribution

- A volunteer distributes an `assigned_to_volunteer` token to a beneficiary (physical/printed or digital QR), the same way a donor does in Path A. No in-app transfer to a specific beneficiary account is required.
- State moves to `distributed`. This frees the volunteer's concurrent-limit headroom.

## 5. Redemption (terminal, all paths converge here)

- A beneficiary presents the token QR at an approved vendor; the vendor app scans.
- Validation runs server-side: QR authenticity + geofence + 6h cooldown + meal-limit + face-hash (per spec / owner §4.5).
- On success the token is consumed → state `redeemed`; redemption recorded.
- Value handling: under value → balance forfeited; over value → beneficiary pays difference; optional ₹5 co-pay with ₹0 always available.
- If never redeemed by expiry → state `expired` (auto-invalidate).

## 6. Token state machine (authoritative)

```
                      mint
                       |
                       v
                  [ generated ]
                   /         \
        Path A (use now)   Path B (authorize pApAmA)
              |                   |
              v                   v
           [ live ]        [ in_admin_pool ]
              |                   |  admin assign / grant request
              |                   v
              |         [ assigned_to_volunteer ]
              |                   |  volunteer distributes
              |                   v
              +------------> [ distributed ]
              |                   |
              |   (donor/volunteer-held live token redeemed
              |    by beneficiary at vendor)
              v                   v
            [ redeemed ]   or   [ expired ]
```

**Status enum (proposed):** `token_status = generated | live | in_admin_pool | assigned_to_volunteer | distributed | redeemed | expired`.

> Note: `generated` is transient (the instant before the donor picks a path). `live` and `distributed` are both "out in the world, redeemable." If the team prefers to collapse `generated`→ straight into `live`/`in_admin_pool`, that is acceptable — but the pool, volunteer-assignment, and redeemed/expired terminal states are required.

## 7. Schema implications (for Developer 2)

- `tokens.status` uses the `token_status` enum above.
- `tokens` needs a **current holder** reference distinguishing donor-held / pool / volunteer-held — e.g. `current_holder_type` (`donor | pool | volunteer`) + `current_holder_id`, OR derive holder from status + the latest distribution record. Decide one approach and keep it consistent.
- `token_distribution_records` logs every hand-off with a **channel/path**: `donor_self` (Path A), `admin_to_volunteer` (3a), `volunteer_request_grant` (3b), `volunteer_to_beneficiary` (§4). This makes every documented route auditable.
- A `volunteer_token_requests` concept (table or rows) tracks 3b requests and their admin decision.
- `system_config` gains `max_tokens_per_volunteer` (concurrent limit, admin-editable).
- Enforce the concurrent limit in the allocation service AND mirror it in RLS/constraints where feasible.
