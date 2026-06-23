# CLAUDE.md — pApAmA

This is the primary instruction file for Claude Code in this repository.

**Sole ownership.** There is no longer a Developer 1 / Developer 2 split. This is my app and my full responsibility end to end — backend, admin, **and** the frontend (donor flow + admin UI), including bridging any frontend gaps or flaws. Any reference below to "Developer 1/2" is historical; treat the whole codebase as in-scope.

**Working model (mentor-directed).** I work on a dedicated feature branch (cloned to my local repo) where the whole app is built; my mentor checks out that branch to review UI quality and the seamless end-to-end experience. Keep the branch buildable and demo-ready.

## Start here

1. Read `AGENTS.md` (repo root) — the full project rulebook. Everything in it applies to you.
2. Read the reference docs in `/docs` before building a feature:
   - `docs/token-flow.md` — **authoritative** token lifecycle & distribution (decided with mentor). Read before any token/distribution/volunteer work.
   - `docs/papama-phase1-spec.md` — what to build in Phase 1.
   - `docs/papama-owner-scope.md` — how the logic must behave (richer rules for redemption/proof/settlement/fraud).
   - `docs/papama-client-decisions.md` — confirmed values + open items.
   - `docs/CONTRACT_Developer_2_Admin_Backend_Module.md` — reference for the admin/backend module's API surface (originally drafted as a two-developer seam; now an internal contract for the whole app).
3. Check `ASSUMPTIONS.md` (repo root) for decisions made in the absence of a client/mentor answer. Do not contradict it; if you must assume something new, add it there.

## My ownership (whole app)

Everything is mine: database (migrations, RLS, indexes, seed, enums, Zod), all `app/api/**` route handlers, `lib/auth/**`, `lib/permissions/**`, `lib/system-config.ts`, `lib/supabase/**`, `app/admin/**`, **and** the frontend — `app/donor/**`, the public donate flow, and any shared UI. Bridging frontend gaps/flaws and delivering a seamless UX is explicitly in scope, since the mentor reviews the running app, not just the backend.

## How to work with me (BUILD MODE — speed-oriented)

I am building toward a deadline. Move fast. You do NOT need to explain every line. Build in larger ordered batches rather than one tiny slice at a time. BUT the following safety rules are absolute and override speed:

- **PLAN FIRST, ONCE.** Before generating anything, produce a complete ordered implementation plan and let me approve it. After approval, execute the plan in dependency order without stopping for line-by-line approval — but pause and flag if you hit something that conflicts with the existing database or the docs.
- **Propose migrations as SQL; NEVER apply them.** The Supabase MCP is **read-only** — use it only to inspect. Output migration SQL for me to apply myself. Never attempt to mutate the live database.
  - Use the **`supabase-papama`** MCP server (local scope, project ref `qxdxefofeykzvegykitt`) for all inspection. Do NOT use the `claude.ai Supabase` connector — it points at a different account.
- **Reconcile with the existing tables; never duplicate or conflict.** This database already has **33 tables** in `public` (RLS enabled on all of them) spanning donor/credits, tokens, beneficiaries, vendors/settlements, and admin/system/compliance — see `docs/db-schema-snapshot.md` for the full columns + RLS inventory. Inspect them first. Build ON them where they fit; explicitly flag and propose a resolution where they conflict with our spec/token-flow. Do not drop or overwrite existing data without flagging it first.
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
7. Frontend / UX (now in scope): donor flow, admin UI, and bridging any frontend gaps so the running app is seamless and demo-ready for mentor review.

## Stack

Next.js (App Router) · TypeScript · Supabase (Postgres + RLS + Auth) · Zod · Tailwind · npm.
