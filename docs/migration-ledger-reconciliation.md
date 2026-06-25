# Migration Ledger Reconciliation

**Generated:** 2026-06-24  
**Updated:** 2026-06-25 (added the m31/m32/m34 batch; the live ledger now has 22 rows, not 19)  
**Live project:** `qxdxefofeykzvegykitt`  
**Source:** live `supabase_migrations.schema_migrations` inspected via MCP read-only; repo files in `supabase/migrations/`.

---

## Summary

The live DB has **22** applied migrations (re-checked 2026-06-25 via `list_migrations`). The repo
has 27 `supabase/migrations/*.sql` files. Several live entries have no direct repo source file
(m13b, m19_advisor_fixes/m20 revoke-anon, the donor-provisioning trigger, and the **m27–m34**
batch whose SQL still lives only in `docs/proposed-migrations/`). The live schema is correct; the
gap is purely **reproducibility** — `supabase db reset` would not rebuild prod until the
docs/ sources are promoted into `supabase/migrations/` (or a baseline is pulled — see the bottom
of this doc for the recommended robust path).

---

## Full ledger mapping

| Live version | Live name | Repo file | Status | Notes |
|---|---|---|---|---|
| 20260623042409 | m13b\_drop\_legacy\_donor\_module\_tables | **absent** | COVERED — see below | Effect: drops tables created by an unreachable pre-m13 dev branch. All target tables are confirmed absent from the live schema today, meaning the drop already ran. No reconstruction needed. |
| 20260623042430 | m14\_campaigns\_token\_types | `20260620010114_m14_campaigns_token_types.sql` | MATCHED | Timestamp mismatch (repo uses a synthetic 20260620 base) is expected — Supabase uses the live apply-time version, not the repo filename timestamp. |
| 20260623042452 | m15\_donors\_credit\_donations | `20260620010115_m15_donors_credit_donations.sql` | MATCHED | |
| 20260623042518 | m16\_tokens | `20260620010116_m16_tokens.sql` | MATCHED | |
| 20260623042545 | m17\_redemption\_settlement\_spine | `20260620010117_m17_redemption_settlement_spine.sql` | MATCHED | |
| 20260623042549 | m18\_notifications | `20260620010118_m18_notifications.sql` | MATCHED | |
| 20260623043445 | m19\_advisor\_fixes | **absent** | COVERED BY m20 BACKFILL | Effect: revoked EXECUTE on `current_app_role` and `current_donor_id` from `anon`. Verified live: both functions have `anon=false`. Reconstructed as `docs/proposed-migrations/m20_backfill_revoke_anon_execute.sql`. |
| 20260623043537 | m20\_revoke\_anon\_execute\_on\_definer\_fns | **absent** (duplicates the above intent) | COVERED BY m20 BACKFILL | The live ledger has two entries whose combined effect = revoke anon execute. Both are reconstructed by the single backfill file. |
| 20260623051707 | m19\_donor\_provisioning | `20260620010119_m19_donor_provisioning.sql` (partial) | PARTIAL — trigger gap | Repo file covers the `handle_new_user()` function body. The `on_auth_user_created` trigger on `auth.users` is NOT in the repo file. Trigger is confirmed live (signup creates donor rows). Full trigger wiring reconstructed as `docs/proposed-migrations/m21_backfill_donor_provisioning_trigger.sql`. |
| 20260624064508 | m23\_fix\_signup\_partial\_index\_arbiter | `20260624010123_m23_face_embeddings.sql` | NAME MISMATCH — see note | Live name says "fix\_signup\_partial\_index\_arbiter"; repo file `m23` covers face\_embeddings. A separate fix-signup partial-index change was applied under this version. The repo file for face\_embeddings is actually present as a separate file. Cross-check: `beneficiaries.face_embedding` column exists live (confirmed). Both effects are present. |
| 20260624084722 | m22\_vendor\_documents\_storage | `20260624010122_m22_vendor_documents_storage.sql` | MATCHED | Version order inverted vs. m23 above — apply order on the day was 23 before 22. Safe: the two migrations are independent. |
| 20260624084732 | m24\_upi\_qr\_payments | `20260624010124_m24_upi_qr_payments.sql` | MATCHED | |
| 20260624084739 | m25\_vendor\_settlement\_cycle | `20260624010125_m25_vendor_settlement_cycle.sql` | MATCHED | |
| 20260624084748 | m26\_vendor\_proofs\_storage | `20260624010126_m26_vendor_proofs_storage.sql` | MATCHED | |
| 20260624102335 | m27\_credit\_ops\_rpc | `docs/proposed-migrations/m27_credit_ops_rpc.sql` | APPLIED (source in docs/) | Applied 2026-06-24 per audit; source file remains in docs/ rather than supabase/migrations/ — move it to the migrations folder to close the reproducibility gap. |
| 20260624102347 | m28\_beneficiary\_approve\_rpc | `docs/proposed-migrations/m28_beneficiary_approve_rpc.sql` | APPLIED (source in docs/) | Same note as m27. |
| 20260624102352 | m29\_upi\_transaction\_id\_unique | `docs/proposed-migrations/m29_upi_transaction_id_unique.sql` | APPLIED (source in docs/) | Same note as m27. |
| 20260624102403 | m30\_rls\_hardening | `docs/proposed-migrations/m30_rls_hardening.sql` | APPLIED (source in docs/) | Same note as m27. |
| 20260624104336 | m31\_perf\_index\_token\_redemptions | `docs/proposed-migrations/m31_perf_indexes.sql` | APPLIED (source in docs/) | Added 2026-06-25 to this doc. Move source into `supabase/migrations/`. |
| 20260624104338 | m32\_patient\_eligibility\_config | `docs/proposed-migrations/m32_patient_eligibility_config.sql` | APPLIED (source in docs/) | Added 2026-06-25. Move source into `supabase/migrations/`. |
| 20260624105730 | m31\_guard\_service\_role\_bypass | `docs/proposed-migrations/m31_guard_service_role_bypass.sql` | APPLIED (source in docs/) | Added 2026-06-25. Note the duplicate logical "m31" prefix (perf-index vs guard) — keep distinct version timestamps. Move source in. |
| 20260624110138 | m34\_definer\_fns\_to\_private\_schema\_harmonized | `docs/proposed-migrations/m34_definer_fn_private_schema.sql` (SUPERSEDED) + `m34_pre_apply_policy_snapshot.sql` | APPLIED (source in docs/) | Added 2026-06-25. The live entry is the *harmonized* m34; the standalone `m34_definer_fn_private_schema.sql` is marked SUPERSEDED. Promote the harmonized version. |

⚠️ `docs/proposed-migrations/m33_vendor_bank_scoping.sql` has **no `m33` row in the live ledger** —
confirm whether it was applied under another name or is genuinely unapplied before promoting it.

Repo files in `supabase/migrations/` with **no live counterpart** (applied only on fresh reset):

| Repo file | Logical purpose | Live status |
|---|---|---|
| `20260620010101_m01_enums.sql` | Enums | Enums confirmed live; applied as part of base setup |
| `20260620010102_m02_users_auth.sql` | users table + auth helpers | Table + functions confirmed live |
| `20260620010103_m03_system_config.sql` | system\_config | Table confirmed live |
| `20260620010104_m04_vendors.sql` | vendors + documents + menus | Tables confirmed live |
| `20260620010105_m05_beneficiaries.sql` | beneficiaries | Table confirmed live |
| `20260620010106_m06_beneficiary_status_enum.sql` | Enum extension | Confirmed live |
| `20260620010107_m07_enum_extension.sql` | Additional enums | Confirmed live |
| `20260620010108_m08_audit_logs.sql` | audit\_logs | Table confirmed live |
| `20260620010109_m09_volunteers.sql` | volunteers | Table confirmed live |
| `20260620010110_m10_vendor_settlement_ops.sql` | settlement ops tables | Tables confirmed live |
| `20260620010111_m11_fraud_flags.sql` | fraud\_flags | Table confirmed live |
| `20260620010112_m12_compliance_reports.sql` | compliance\_reports | Table confirmed live |
| `20260620010113_m13_ngo_partners.sql` | ngo\_partners | Table confirmed live |
| `20260625000001_fraud_anomaly_config.sql` | Fraud config | Applied post-audit |
| `20260625000002_settlement_hold.sql` | Settlement hold columns | Columns confirmed live (on\_hold/hold\_note) |
| `20260625000003_schedule_expire_sweep.sql` | pg\_cron expire sweep | Cron job confirmed live (papama-expire-tokens, daily 02:00) |

---

## Action items for `supabase db reset` reproducibility

1. **Move m27–m34 sources** from `docs/proposed-migrations/` into `supabase/migrations/` with
   version timestamps matching the live ledger entries
   (20260624102335, 20260624102347, 20260624102352, 20260624102403,
   **20260624104336, 20260624104338, 20260624105730, 20260624110138**). Use the *harmonized*
   m34, not the SUPERSEDED standalone.

2. **Apply m20 backfill** (`docs/proposed-migrations/m20_backfill_revoke_anon_execute.sql`)
   — idempotent, safe to run now. Also commit it into `supabase/migrations/`.

3. **Apply m21 backfill** (`docs/proposed-migrations/m21_backfill_donor_provisioning_trigger.sql`)
   — creates the `on_auth_user_created` trigger that the repo's m19 file omitted.
   Needs superuser (postgres role) — runs fine under `supabase db reset`.

4. **m13b** — no reconstruction needed. The dropped tables are absent from the live schema;
   their absence is the correct end-state. Document this as intentional.

5. **Resolve m33** — confirm whether `m33_vendor_bank_scoping.sql` is applied (under another name)
   or unapplied; promote or drop accordingly.

---

## Recommended robust path — baseline from the live DB

The per-file repair above works but is fragile (mismatched timestamps, missing base `m01`–`m13`
ledger rows, duplicate `m31` prefixes). If you want a guarantee that `db reset` == prod with the
least hand-wiring, snapshot the live schema into a single baseline instead. All commands run
against **your** linked project — nothing here mutates prod's ledger except `db pull`, which only
records the baseline remotely.

```bash
supabase link --project-ref qxdxefofeykzvegykitt        # once

mkdir -p supabase/migrations_archive_2026-06-25          # archive hand-written history
git mv supabase/migrations/*.sql supabase/migrations_archive_2026-06-25/

supabase db pull                                          # one baseline migration from live
# Verify the baseline carries the system_config seed rows (the five validation keys are present
# LIVE: co_contribution_max=5, face_match_threshold=0.4, meal_cooldown_hours=6,
# max_meals_per_day=2, redemption_radius_km=20). If you keep seeds separate, move them to
# supabase/seed.sql.

supabase db reset                                         # local shadow DB only — proves reset==prod
```

After this, write any *new* forward migrations on top of the baseline.
