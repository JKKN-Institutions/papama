# CLAUDE.md — pApAmA (Developer 2)

This is the primary instruction file for Claude Code in this repository.

## Start here

1. Read `AGENTS.md` (repo root) — the full project rulebook. Everything in it applies to you.
2. Read the reference docs in `/docs` before building a feature:
   - `docs/token-flow.md` — **authoritative** token lifecycle & distribution (decided with mentor). Read before any token/distribution/volunteer work.
   - `docs/papama-phase1-spec.md` — what to build in Phase 1.
   - `docs/papama-owner-scope.md` — how the logic must behave (richer rules for redemption/proof/settlement/fraud).
   - `docs/papama-client-decisions.md` — confirmed values + open items.
   - `docs/CONTRACT_Developer_2_Admin_Backend_Module.md` — API seam with Developer 1.
3. Check `ASSUMPTIONS.md` (repo root) for decisions made in the absence of a client/mentor answer. Do not contradict it; if you must assume something new, add it there.

## My ownership (Developer 2)

Backend + admin only: database (migrations, RLS, indexes, seed, enums, Zod), all `app/api/**` route handlers, `lib/auth/**`, `lib/permissions/**`, `lib/system-config.ts`, `lib/supabase/**`, and `app/admin/**`. Do NOT generate or edit `app/donor/**` or the public donate flow — that is Developer 1's.

## How to work with me

- **Explain before generating.** I am learning; when you produce a migration, service, or route, briefly explain what each significant part does and why.
- **Propose migrations; do not apply them.** The Supabase MCP here is **read-only** — use it to inspect/explain the live schema, never to mutate. I apply reviewed migrations myself (Supabase CLI / dashboard).
- **One vertical slice at a time.** Prefer: one table + its RLS + its service + its route, fully working and reviewable, over large multi-file dumps.
- **Foundational + logic-heavy parts go slow.** For enums, core migrations, the token state machine, and redemption validation, move carefully and let me review closely. Move faster on repetitive boilerplate once a pattern is set.
- **Never invent values for open items** (see `ASSUMPTIONS.md`): disaster-affected proof, email provider, payment provider.
- Don't commit secrets. `.env.local` holds Supabase keys and is git-ignored. The service-role key is server-only, never `NEXT_PUBLIC_`.

## Build order (current)

1. ✅ Project scaffold, Supabase clients, agent context.
2. **Now:** Types layer — enums (`user_role`, `token_status`, `token_type`, `beneficiary_category`, `eligibility_status`, `settlement_cycle`, `payment_status`, fraud `detection_method`) + Zod schemas.
3. Database layer — `system_config` (seed defaults incl. `max_tokens_per_volunteer`) + `users` + `token_types`, with RLS.
4. Donor spine — `donors`, `donor_credits`, `credit_transactions`, `donations` + Credit service + `POST /api/donations/create`, `GET /api/donor/credits`.
5. Tokens — `tokens`, `token_batches`, `token_distribution_records`, `volunteer_token_requests` + Token & Distribution services (per `docs/token-flow.md`) + token routes.
6. Then: beneficiary registration → vendor onboarding → redemption + validation → proof + settlement → fraud → reports.

## Stack

Next.js (App Router) · TypeScript · Supabase (Postgres + RLS + Auth) · Zod · Tailwind · npm.
