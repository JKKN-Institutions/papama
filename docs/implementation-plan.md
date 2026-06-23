# Implementation Plan — pApAmA

Status snapshot + ordered plan to complete the app, with a focus on **UI ↔
backend-permission compatibility**. Single-developer project (whole app).

_Last updated: 2026-06-23._

---

## 1. Where the app stands

### Backend permission model — strong
- `lib/permissions/matrix.ts` encodes the spec §6 role×feature matrix for all 8
  roles (`admin, compliance, vendor_manager, vendor, volunteer, donor,
  beneficiary, guest`).
- `lib/api/handler.ts → defineRoute()` wraps every API route with: server-side
  auth (`requireAppUser`) → matrix check (`assertCan`) → audit log → consistent
  error mapping (401/403/400/404/500).
- Service-role client (`lib/supabase/admin.ts`) is server-only and used only
  after the matrix check. RLS is enabled on all 33 tables (defense-in-depth).
- DB is migration-backed (`supabase/migrations/m01…m19`).

### Compatibility scorecard (UI ↔ permissions)

| Area | State | Verdict |
|---|---|---|
| Admin READ pages | Call `GET /api/admin/*`, handle 401→login / 403→denied | ✅ Compatible |
| Admin role-gate before load | Was middleware-only ("signed in?"), not role | ✅ Fixed in Phase A |
| Client-side role awareness | None in `app/**` | ✅ Added in Phase A (`AppUserProvider`/`useCan`) |
| Admin WRITE actions | No `POST/PATCH/PUT/DELETE` routes exist | ❌ Console is read-only |
| Donor flow | Mock localStorage (`apiClient.ts`) + direct anon reads w/ mock fallback; no `app/api/donor|tokens|donations/**` routes | ❌ Bypasses the permission system |
| Enum alignment | Mock UI uses `active`/`invalidated`; DB enum is `live`/`redeemed`/`expired`/… | ❌ Mismatch |
| Tests | Only `test/api/admin-guard.test.ts` | ⚠️ Thin |

**Summary:** the permission *engine* is solid; the UI barely exercises it. The
admin console only reads, and the donor module is a mock prototype not wired to
the governed backend. Completing the app = building the **governed write layer**
and connecting the real UI to it.

---

## 2. Plan (phased)

### Phase A — Close permission/compatibility gaps ✅ DONE
- [x] **A1** Role-gate `/admin` server-side in `app/admin/layout.tsx`
  (`getAppUser` + `isAdminConsoleRole`; non-staff → Access Denied).
- [x] **A2** Client role context: `GET /api/me` + `components/auth/AppUserProvider.tsx`
  (`useAppUser`, `useCan`) mirroring the matrix to the UI.
- [x] **A3** Removed the dead duplicate service-role client
  (`lib/donor/services/supabase-server.ts`).
- [x] Offline-demo flag made authoritative (`lib/donor/services/mock-mode.ts`;
  `NEXT_PUBLIC_USE_MOCK_API=true` forces mock everywhere).

### Phase B — Admin write operations (make the console functional)
For each domain: add guarded `POST/PATCH` routes via `defineRoute` (correct
matrix cell + `audit()`), then wire UI controls gated by `useCan()`:
- [x] Vendors — approve / reject / suspend / reinstate + KYC verify/fail
  (`PATCH /api/admin/vendors`, state machine + audit; UI actions gated by `useCan`)
- [ ] Vendor menu pricing — approve (`vendor_menu_pricing`)
- [x] Beneficiaries — suspend / activate / block record-state
  (`PATCH /api/admin/beneficiaries`, admin-only state machine + audit; UI via
  `useRowAction`). _Registration approve/reject queue (`beneficiary_registrations`)
  is a separate later slice._
- [x] Volunteers — registry status (suspend / deactivate / activate)
  (`PATCH /api/admin/volunteers`, admin-only state machine + audit; UI via
  `useRowAction`). _Token allocation/grant + `max_tokens_per_volunteer` moved to
  Phase C (it mutates the tokens table) — see C5._
- [x] Settlements — lock / reconcile / pay + unlock override
  (`PATCH /api/admin/settlements`, admin-only state machine; pay stamps
  `settled_at`; audited; UI via `useRowAction`)
- [x] Fraud — resolve / dismiss (`PATCH /api/admin/fraud`, admin-only; dismiss
  clears block; resolver + notes recorded + audited; UI actions via `useRowAction`)
- [ ] System config — update values (set `max_tokens_per_volunteer` once mentor gives the number)
- [ ] Reports — generate / export (`audit_reports`)

### Phase C — Donor module: replace mock with governed backend
- [ ] **C1** Real donor routes (`donations/create`, `donor/credits`,
  `tokens/convert`, `donor/tokens`, `donor/dashboard`, `notifications`) via
  `defineRoute` with donor cells (scope `"own"`).
- [ ] **C2** Token lifecycle per `docs/token-flow.md` + credit service
  (threshold, deduct on mint).
- [ ] **C3** Repoint donor UI from the mock to real routes; **align token-status
  enums**; keep mock available only behind `NEXT_PUBLIC_USE_MOCK_API`.
- [ ] **C4** Replace mock campaigns; align donate flow with real
  `token_types`/`donations`.
- [ ] **C5** Volunteer token allocation/grant (token-flow §3a/3b): move tokens
  `in_admin_pool → assigned_to_volunteer`, write `token_distribution_records`,
  and **enforce `max_tokens_per_volunteer`** (concurrent holding limit; `NULL` =
  not set). Includes the volunteer-token-request queue route + UI. Lives here
  (not Phase B) because it mutates the tokens table.

### Phase D — Core meal loop (per `docs/papama-owner-scope.md`)
- [ ] Redemption + validation (`token_redemption`, `scan_proof`)
- [ ] Proof-of-service, payment lock, settlement generation

### Phase E — Open integrations (blocked on mentor/client — see `ASSUMPTIONS.md`)
- [ ] Payment provider (Razorpay / Cashfree / PhonePe) — replace mock donation
- [ ] Email / SMS notification sender
- [ ] `disaster_affected` proof/eligibility rules
- [ ] `max_tokens_per_volunteer` numeric value

### Phase F — Hardening
- [ ] Authz tests per matrix cell; service unit tests; RLS tests
- [ ] `.env.example` for onboarding

**Order:** A ✅ → B → C → D, with E slotted in when answers arrive, F continuous.
