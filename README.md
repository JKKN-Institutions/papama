# pApAmA — Food Token Platform

pApAmA turns donations into meals. Donors fund food tokens, admins and volunteers
distribute them, beneficiaries redeem them at approved vendors, and vendors are
settled — with proof-of-service, fair-usage rules, fraud checks, and compliance
reporting throughout.

## Stack

- **Next.js 16** (App Router, Turbopack) · **TypeScript** · React 19
- **Supabase** — Postgres + Row Level Security + Auth (`@supabase/ssr`)
- **Zod** (validation) · **Tailwind CSS v4** · **Vitest**
- **Poppins** as the global font (`next/font`)

## Modules

| Area | Lives in | Notes |
|------|----------|-------|
| Admin & backend | `app/admin/**`, `app/api/**`, `lib/auth`, `lib/permissions`, `lib/system-config`, `lib/supabase` | RBAC via a permission matrix; all writes go through audited route handlers |
| Donor portal | `app/donor/**`, `lib/donor/**` | Credit, donations, tokens, impact, notifications. Has an offline **mock mode** for demos — see below |
| Shared auth | `app/login`, `app/auth/confirm`, `app/forgot-password`, `app/update-password` | Email/password sign-in, email confirmation, password reset |
| Database | `supabase/migrations/**` | Versioned SQL migrations (`m01`…`m19`), RLS on every table |

## Getting started

### Prerequisites

- Node.js 20+
- A Supabase project (URL + keys)

### 1. Install

```bash
npm install
```

### 2. Configure environment

Create `.env.local` in the repo root (git-ignored):

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-or-publishable-key>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>   # server-only — never prefix NEXT_PUBLIC_
```

### 3. Apply the database migrations

Run the files in `supabase/migrations/` **in filename order** (`m01` → `m19`) via the
Supabase SQL editor or the Supabase CLI. They create the schema, enums, RLS
policies, and the `handle_new_user` trigger that auto-provisions a donor profile
on signup.

### 4. Run

```bash
npm run dev      # http://localhost:3000
```

## Offline demo (mock mode) — for reviewers

You can run and click through the **donor portal with no Supabase project, no
database, and no network** — it serves realistic sample data from an in-browser
mock store (`lib/donor/services/apiClient.ts`). Ideal for a quick UI/UX review.

### Run it (2 steps)

```bash
npm install
echo "NEXT_PUBLIC_USE_MOCK_API=true" > .env.local   # the only var needed for mock mode
npm run dev                                          # http://localhost:3000
```

Then open the donor portal:

| Page | URL |
|------|-----|
| Donate | http://localhost:3000/donor/donate |
| Dashboard | http://localhost:3000/donor/dashboard |
| Tokens | http://localhost:3000/donor/tokens |
| Credit | http://localhost:3000/donor/credit |
| Impact | http://localhost:3000/donor/impact |
| Notifications | http://localhost:3000/donor/notifications |

### What works in mock mode
- Donating adds credit; converting credit mints tokens; a token "redeems" itself
  a few seconds later to demonstrate the live impact/notification updates.
- All donor data is stored in your browser's `localStorage` (clear site data to
  reset). When `NEXT_PUBLIC_USE_MOCK_API=true`, the app never calls Supabase.

### Notes / limits
- The **admin console** (`/admin`) needs real Supabase Auth + data, so it is not
  part of the offline mock demo — use the full setup below for that.
- Mock mode is for demos only; the real backend (Phase C of
  [`docs/implementation-plan.md`](./docs/implementation-plan.md)) is what ships.
- To switch back to the real backend, remove `NEXT_PUBLIC_USE_MOCK_API` (or set
  it to `false`) and configure the Supabase vars in the next section.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run test` | Run the Vitest suite |

## Authentication notes

- Email/password is handled by Supabase Auth through the SSR client. New self-signups
  default to the `donor` role and are auto-provisioned a `donors` + `donor_credits`
  row (migration `m19`). **Admins are provisioned manually / via the admin portal**,
  not through self-signup.
- For email **confirmation** and **password-reset** links to work, set the Supabase
  email templates to the `token_hash` format pointing at `/auth/confirm`, and add your
  origins to **Authentication → URL Configuration → Redirect URLs**. See
  `app/auth/confirm/route.ts` for the exact template snippets.

## Documentation

Project reference docs live in [`/docs`](./docs):

- `token-flow.md` — authoritative token lifecycle & distribution
- `papama-phase1-spec.md` — Phase 1 scope
- `papama-owner-scope.md` — redemption / proof / settlement / fraud rules
- `papama-client-decisions.md` — confirmed values & open items
- `CONTRACT_Developer_2_Admin_Backend_Module.md` — admin/backend API seam
