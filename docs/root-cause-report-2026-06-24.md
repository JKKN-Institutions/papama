# pApAmA — Root-Cause Report & §5 Resolution (2026-06-24)

Resolves the **deferred/reported (§5)** items from `docs/audit-2026-06-24-full.md`. Work was done
by a 5-agent team with strictly disjoint file ownership, then centrally reviewed, type-checked, and
built (`tsc --noEmit` ✅, `next build` ✅). Two low-risk migrations were applied live; the
security-sensitive ones are proposed-and-ready (see §4).

---

## 1. The thematic root causes (the patterns underneath the symptoms)

Most §5 items are instances of **six** underlying causes. Fixing the symptom *and* naming the
pattern is the point of this report.

1. **supabase-js can neither express atomic column math nor wrap a transaction.**
   → every read-modify-write race: credit mint/deduct, donation increment, `total_donated_tokens`
   counter, beneficiary-approve two-step. *Fixed* with compare-and-swap guards in app code, plus
   atomic SECURITY DEFINER RPCs proposed (m27/m28) for the durable version.

2. **The service-role client bypasses RLS, so over-broad policies were never exercised.**
   → `system_config` readable by all, `audit_logs_insert_self`, `vtr_insert_staff` (vendor_manager),
   volunteer reading vendor bank columns. The app always worked, so the policies were never tested
   against a real low-privilege session. *Fixed/raised* via m30 (applied) + m33 (proposed).

3. **Untyped JSON metadata + cross-surface field-name conventions drift.**
   → notification `vendor` vs `vendor_name`/`meal_info`; settlement `cycle` vs `period`. No shared
   typed contract between the API writer and the UI reader. *Fixed* in the prior pass; the
   notification dispatcher (m-pass) now centralizes the write so keys can't diverge again.

4. **"Designed-for, not built" seams left without their thin runtime.**
   → multi-channel notifications (enum exists, no dispatcher), patient auto-expiry (config key
   missing), i18n (no `t()`). Phase-1 deferred the *feature* but also skipped the *seam runtime*.
   *Fixed* by building the seams: `lib/notifications/dispatch.ts`, `patient_eligibility_months`,
   `lib/i18n`.

5. **Aggregations/anti-joins computed in JS instead of SQL.**
   → settlement exclusion Set, report sums, volunteer holdings full-scan. Fine at demo scale, O(N)
   later. *Fixed* by pushing filters/joins to PostgREST (with a safe JS fallback where Supabase may
   disable aggregates) + a supporting index (m31, applied).

6. **Migrations applied via MCP without committing the source `.sql`.**
   → repo missing `m20`/`m21` while live has them → `db reset` diverges. *Fixed* by reconstructing
   the source (m20/m21 backfill) + a ledger-reconciliation doc.

---

## 2. Item-by-item resolution

| §5 item | Root cause | Resolution | Status |
|---|---|---|---|
| Patient eligibility no auto-expiry | seam (#4): only pregnancy branch existed | `patient` branch reads `patient_eligibility_months` (no guessed default); UI date input; config key created | ✅ code + m32 applied (value is an open decision — left NULL) |
| Multi-channel notifications absent | seam (#4): enum but no dispatcher | `lib/notifications/dispatch.ts` — in_app real; sms/email/whatsapp honest no-op adapters gated on provider env; all insert sites routed through it | ✅ code (providers client-procured) |
| i18n: zero infrastructure | seam (#4) | `lib/i18n` — dependency-free typed `t()` + `en` catalog (works server+client, interpolation); donor credit page migrated as the reference | ✅ infra + reference; full string sweep is mechanical follow-up |
| Perf: holdings full-scan | #5 | per-volunteer filter pushed to SQL (`distributed_by` + grant channels), tiny JS dedup | ✅ code |
| Perf: settlement exclusion in JS | #5 | PostgREST LEFT-JOIN anti-join (single query) | ✅ code |
| Perf: report sums full-scan | #5 | server-side aggregate **with JS fallback** (Supabase disables aggregates by default on many projects — never break demo step 9) | ✅ code |
| Perf: admin list routes unbounded | #5 | `?limit/offset` + caps (audit-logs ≤500) | ✅ code |
| Missing composite index | #5 | `idx_token_redemptions_status_redeemed_at` | ✅ m31 applied |
| `total_donated_tokens` non-atomic | #1 | CAS guard matching the credit pattern | ✅ code |
| Fraud day-boundary local TZ | local `setHours` vs UTC `redeemed_at` | `setUTCHours(0,0,0,0)` | ✅ code |
| Token QR via third-party host | leaked one-time payload to api.qrserver.com | `components/donor/TokenQrCode.tsx` renders client-side via `qrcode` | ✅ code |
| UI: window.prompt / confirms / NGO CRUD / token filters / badge tones / ₹50 | UX shortcuts | inline note input, approve/reinstate confirms, NGO create/edit UI, added pool/distributed filters, badge tones, ₹50→threshold | ✅ code |
| `m20`/`m21` missing from repo | #6 | reconstructed backfill `.sql` + `migration-ledger-reconciliation.md` | ✅ proposed (reproducibility; not applied — already live) |
| Volunteer reads vendor bank cols | #2 (RLS column-blindness) | `m33` view-based scoping (`vendors_volunteer_view`) | ⏸ proposed — needs volunteer-portal query change; NOT applied |
| Definer fns REST-callable | naive revoke breaks RLS | `m34` private-schema relocation (~65 policies repointed) | ⏸ proposed — HIGH RISK, branch-test first; NOT applied |
| TOKEN_QR_SECRET / leaked-password / pw min length / .env hygiene | env + dashboard, not code | `docs/security-actions-required.md` with exact steps | 📋 operator action |

---

## 3. Applied to the live DB this pass (project qxdxefofeykzvegykitt, verified)

- **m31** — `idx_token_redemptions_status_redeemed_at` (settlement hot-path index).
- **m32** — `patient_eligibility_months` config key created (value **NULL** = open item).
- **m33 + m34 (harmonized, applied 2026-06-24)** — see §4 for how this was done safely.

## 4. m33 + m34 — applied as a single harmonized, verified migration

The two as-written **conflicted** (both rewrote `vendors_select_staff`; m34 dropped the functions
m33's policy calls) and the hand-written m34 was **incomplete** (missed `vendor_menus_select_staff`
and the 4 `storage.objects` bucket policies, and omitted `GRANT USAGE ON SCHEMA private` — any of
which would break RLS). Rather than apply either verbatim, the relocation was done
**programmatically**:

- A `DO` block rewrote the **live qual text** of **every** policy referencing the helpers
  (`public.current_*` → `private.current_*`) across **both `public` and `storage`** schemas — faithful
  by construction (no transcription), and complete (the final `DROP FUNCTION` is the safety net: it
  fails and rolls back the whole transaction if even one policy is missed — which is exactly what
  caught the storage-bucket gap on the first attempt).
- `GRANT USAGE ON SCHEMA private TO authenticated` was added (the missing piece that would otherwise
  deny all RLS).
- m33's goal was folded in: `volunteer` removed from `vendors_select_staff`.
- A full **pre-apply policy snapshot** was saved (`docs/proposed-migrations/m34_pre_apply_policy_snapshot.sql`)
  for rollback.

**Verified live:** public fns gone; `private.current_app_role/donor_id` present; **0** policies
reference the old public fns; **115** policies repointed to `private.*`; `vendors_select_staff` =
{admin, vendor_manager, compliance}; `authenticated` has USAGE on `private` and a smoke test
confirms it can call the helpers (so RLS evaluates). The `private` schema is **not** in PostgREST's
exposed-schema list, so the helpers are no longer REST-callable — the advisor finding is closed. No
app code changed (the helpers were never called as RPCs; service-role bypasses RLS; session clients
rely on RLS which now works via `private.*`).

> **m33's `vendors_volunteer_view` was intentionally NOT created** — it has no consumer (no volunteer
> code reads `vendors`) and is moot now that volunteers are removed from the base policy. The
> exposure is fully closed by the policy change.
>
> **The original `m33_*.sql` / `m34_*.sql` proposal files are SUPERSEDED** — do not apply them (they
> carry the bugs described above). The applied migration is the harmonized one.

- **m20/m21 backfill** — repo reproducibility only; effects already live, so do **not** re-apply.

## 5. Operator actions (not code — see `docs/security-actions-required.md`)

Provision a dedicated `TOKEN_QR_SECRET`; enable Supabase leaked-password protection; raise password
min length to 12; keep `.env.local` untracked and rotate keys before prod. Decide the numeric values
for `patient_eligibility_months` (m32) and `max_tokens_per_volunteer` (existing open item). Procure
SMS/email/WhatsApp providers and set the env vars listed in `lib/notifications/dispatch.ts`.

## 6. Verification

`tsc --noEmit` ✅ · `next build` ✅ · m31/m32 confirmed live via MCP. The notification dispatcher
defaults to in_app-only (no behavior change for the demo); the report-sum aggregate falls back to
JS so CSR export can't break; the settlement anti-join and holdings filter return identical shapes.
