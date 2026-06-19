# AGENTS.md — pApAmA (Developer 2: Admin & Backend Module)

This file tells AI coding agents how to work in this repository. Read it before generating any code. Follow it strictly. When in doubt, ask the developer rather than guessing.

## What this project is

pApAmA is a token-based meal-donation platform. Donors give money → it becomes non-withdrawable **credit** → at a threshold it converts to a food **token** (Standard or Special Care) → the token reaches a beneficiary (directly or via a volunteer) → the beneficiary redeems it at an approved vendor for an on-the-spot cooked meal → the vendor uploads proof → payment unlocks → settlement runs → the donor sees the impact.

It is **not** a wallet, payment, or discount app. Tokens represent food value only; they can never be withdrawn, exchanged for cash, or used as discounts. Use the word **"credit"**, never **"wallet"**.

## My role and ownership boundary

This developer (Developer 2) owns the **backend and admin**:
- The database: all migrations, RLS policies, indexes, seed data, enums, Zod schemas
- All API route handlers under `app/api/**`
- Authentication (`lib/auth/**`) and authorization (`lib/permissions/**`)
- System configuration (`lib/system-config.ts`)
- Supabase clients (`lib/supabase/**`)
- All admin console pages under `app/admin/**`

**Do NOT generate or modify** donor-facing pages under `app/donor/**` or the public donate flow — those belong to Developer 1. This developer only *provides the APIs* Developer 1 consumes.

## Source-of-truth documents (read these before building a feature)

Reference docs live in `/docs`:
- `docs/papama-phase1-spec.md` — **what to build in Phase 1.** The authoritative scope and the 5-layer build checklist. If something is deferred here, do not build it.
- `docs/papama-owner-scope.md` — **how the logic must behave.** The owner's full requirements. When building redemption, proof, settlement, or fraud logic, follow the rules in this document's §4.4–4.8 and §5 — they are richer than the spec summary.
- `docs/papama-client-decisions.md` — confirmed values and open items. Honor confirmed decisions; do NOT invent answers for open items (disaster-affected proof, email provider, payment provider).
- `docs/CONTRACT_Developer_2_Admin_Backend_Module.md` — the API seam with Developer 1. Route response shapes must match this contract.

If a request conflicts with these documents, stop and flag the conflict instead of generating code.

## Architecture: the 5-layer structure

Build every feature in this order, one layer at a time. Do not skip layers or merge them.

1. **Types** — TypeScript enums and Zod schemas. Enums must mirror the values in the spec (`token_type`, `beneficiary_category`, `eligibility_status`, `settlement_cycle`, `payment_status`, `user_role`, fraud `detection_method`).
2. **Database** — migrations for tables; RLS policies per the role matrix; indexes; **reversible DOWN migrations**; seed data.
3. **Services** — plain functions holding business logic (Credit, Token, Distribution, BeneficiaryRegistration, Redemption, ProofOfService, VendorOnboarding, Settlement, Notification, Audit, Fraud). No HTTP or UI concerns inside services.
4. **Hooks** — data-fetching/state for the admin UI only.
5. **Pages** — admin console screens only.

Route handlers (`app/api/**`) are thin: validate input with Zod, check permissions, call a service, return JSON. Business logic lives in services, not in route handlers.

## Token lifecycle & distribution (DECIDED — follow exactly)

The full flow lives in `docs/token-flow.md`. That document is authoritative; read it before touching any token, distribution, or volunteer code. Key rules:

- Donor mints **one token** of a **chosen amount** once accumulated credit exceeds `standard_token_value`. Constraint: `standard_token_value <= amount <= donor available credit`. Minting deducts from credit.
- After minting the donor picks a path: **(A) use now** → token becomes `live`, donor self-distributes (NO in-app donor→beneficiary transfer exists); or **(B) authorize pApAmA** → token enters `in_admin_pool`.
- Admin allocates pooled tokens to volunteers (admin-initiated OR by granting a volunteer request), always within `max_tokens_per_volunteer` (a **concurrent** holding limit, stored in `system_config`).
- Volunteer distributes to beneficiary (physical/digital QR), freeing limit headroom.
- All paths converge at redemption (validation → `redeemed`) or `expired`.
- `token_status` enum: `generated | live | in_admin_pool | assigned_to_volunteer | distributed | redeemed | expired`.
- `token_distribution_records` logs every hand-off with a channel: `donor_self | admin_to_volunteer | volunteer_request_grant | volunteer_to_beneficiary`.
- Volunteers may receive/hold/distribute tokens + assist registration; they may NOT approve eligibility, change rules, or release payments (client Q16).

## Hard rules (never violate)

- **`system_config` drives every tunable rule.** Token value, expiry, cooldown, meal limit, radius, co-pay max, settlement defaults, max tokens per volunteer — all read from the `system_config` table at runtime. NEVER hard-code these as constants. Defaults are seeded, but the running code reads the table.
- **Field names are `snake_case`** matching Postgres column names exactly (e.g. `credit_balance`, not `creditBalance`). The donor UI binds to these names.
- **The service-role key is server-only.** Never expose it to the client, never prefix it with `NEXT_PUBLIC_`, never commit it. Use the session-aware (anon-key) Supabase client by default; use the service-role client only in server code where permissions have already been checked.
- **RLS on every table holding donor or beneficiary data.** The role matrix in spec §6 is the RLS specification.
- **`audit_logs` is append-only.** No update or delete policies on it. Every mutating admin action writes an audit row.
- **Migrations are reversible.** Every migration has a working DOWN.
- **Tokens are one-time, fixed-value.** No split, combine, or partial redemption. Auto-invalidate on expiry.
- **Aadhaar is never mandatory.** `beneficiaries.aadhaar_hash` is nullable; face-hash is primary.
- **No instant settlement.** Only daily / twice-weekly / weekly cycles with admin override. (The MOU's "instant settlement" wording is a known error — do not implement it.)
- **i18n-ready:** externalize user-facing strings; do not hard-code display text that will need translation.
- **Routes never return a bare `null` body.** Return complete JSON; use empty arrays/objects as defaults and HTTP status codes for errors.

## Phase 2 — designed-for, NOT built now

Leave schema seams but do NOT build: event-campaign donations (`donations.event_campaign_id`), micro-donation pooling (`credit_transactions.transaction_type` includes `pooling_supplement`), lost-token replacement (`tokens.replacement_for_token_id`), training module, multi-language translations, GPS-spoofing/advanced fraud analytics. If asked to build one of these, remind the developer it is Phase 2.

## How to work with me (the developer) — BUILD MODE

Working toward a deadline; prioritise speed. Do not explain every line. Build in ordered batches. The following are non-negotiable regardless of speed:

- **Plan first, once, and get approval.** Then execute in dependency order without per-line approval; pause only to flag a genuine conflict.
- **Propose migrations as SQL; never apply.** The Supabase MCP is read-only. I apply migrations myself.
- **Reconcile with the existing 12 tables.** Inspect before building; build on them where they fit; flag conflicts and propose resolutions; never drop/overwrite data without flagging.
- **Never invent open-item values** (ASSUMPTIONS.md). Use marked placeholders.
- Auth foundation (users + user_role enum) comes first, because existing RLS needs it.

## Stack

Next.js (App Router, Route Handlers) · TypeScript · Supabase (Postgres + RLS + Auth) · Zod · Tailwind. Package manager: npm.
