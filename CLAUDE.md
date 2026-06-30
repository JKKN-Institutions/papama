# CLAUDE.md — pApAmA

Primary instructions for Claude Code in this repo. I own the whole app
end-to-end: database, `app/api/**`, `lib/**`, `app/admin/**`, and the
frontend (`app/donor/**`, public donate flow, shared UI). Keep `main`
buildable and demo-ready — my mentor checks out the branch to review the
running app, so UX quality counts as much as backend correctness.

## Read before building a feature
- `AGENTS.md` — full project rulebook (authoritative; this file only adds
  Claude-specific operating rules).
- `docs/token-flow.md` — authoritative token lifecycle. Read before ANY
  token/distribution/volunteer work.
- `docs/papama-phase1-spec.md`, `docs/papama-owner-scope.md`,
  `docs/papama-client-decisions.md` — what to build + how the logic behaves.
- `docs/db-schema-snapshot.md` — the existing tables (33, all RLS-enabled).
  Inspect first; build on them, never duplicate.
- `ASSUMPTIONS.md` — decisions made without a client answer. Don't contradict;
  add new assumptions here.

## Hard rules (override speed)
- **Use the `supabase-papama` MCP** (ref `qxdxefofeykzvegykitt`), NOT the
  claude.ai Supabase connector (wrong account). Reconcile against the live
  schema and keep reversible DOWNs before applying a migration.
- **Never invent values for open items** (disaster-proof, email/payment
  provider, `max_tokens_per_volunteer`). Use a marked placeholder + note it.
- **No secrets in git.** Service-role key is server-only, never `NEXT_PUBLIC_`.
- **Reconcile, don't overwrite.** Flag conflicts with existing tables/docs
  before changing data.

## How I work (build mode)
Move fast, build in ordered batches, don't explain every line. But: produce a
complete plan and let me approve it ONCE before generating; then execute in
dependency order without line-by-line approval — pausing only to flag conflicts
with the DB or docs.

## Stack
Next.js (App Router) · TypeScript · Supabase (Postgres + RLS + Auth) · Zod · Tailwind · npm.
