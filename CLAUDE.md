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

## How to work with me (BUILD MODE — speed-oriented)

I am building toward a deadline. Move fast. You do NOT need to explain every line. Build in larger ordered batches rather than one tiny slice at a time. BUT the following safety rules are absolute and override speed:

- **PLAN FIRST, ONCE.** Before generating anything, produce a complete ordered implementation plan and let me approve it. After approval, execute the plan in dependency order without stopping for line-by-line approval — but pause and flag if you hit something that conflicts with the existing database or the docs.
- **Propose migrations as SQL; NEVER apply them.** The Supabase MCP is **read-only** — use it only to inspect. Output migration SQL for me to apply myself. Never attempt to mutate the live database.
- **Reconcile with the 12 existing tables; never duplicate or conflict.** This database already has tables (donors, donor_credits, payment_methods, token_types, donations, credit_transactions, token_batches, tokens, token_authorisations, token_distribution_records, scheduled_redemption_dates, notifications) with data and RLS. Inspect them first. Build ON them where they fit; explicitly flag and propose a resolution where they conflict with our spec/token-flow. Do not drop or overwrite existing data without flagging it first.
- **Never invent values for open items** (`ASSUMPTIONS.md`): disaster-affected proof, email provider, payment provider, and the `max_tokens_per_volunteer` numeric default. Use a clearly-marked placeholder and note it.
- Don't commit secrets. `.env.local` is git-ignored; the service-role key is server-only, never `NEXT_PUBLIC_`.
- Build order still applies (auth foundation first, since existing RLS needs a users table + user_role enum).

## Build order (current)

1. ✅ Project scaffold, Supabase clients, agent context.
2. **Now:** Types layer — enums (`user_role`, `token_status`, `token_type`, `beneficiary_category`, `eligibility_status`, `settlement_cycle`, `payment_status`, fraud `detection_method`) + Zod schemas.
3. Database layer — `system_config` (seed defaults incl. `max_tokens_per_volunteer`) + `users` + `token_types`, with RLS.
4. Donor spine — `donors`, `donor_credits`, `credit_transactions`, `donations` + Credit service + `POST /api/donations/create`, `GET /api/donor/credits`.
5. Tokens — `tokens`, `token_batches`, `token_distribution_records`, `volunteer_token_requests` + Token & Distribution services (per `docs/token-flow.md`) + token routes.
6. Then: beneficiary registration → vendor onboarding → redemption + validation → proof + settlement → fraud → reports.

## Stack

Next.js (App Router) · TypeScript · Supabase (Postgres + RLS + Auth) · Zod · Tailwind · npm.
