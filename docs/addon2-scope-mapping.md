# addon2 — Scope Mapping (built / net-new / deferred)

Traces every area of `docs/addon2.md` to where it lives in the codebase. Written
2026-07-02 after reconciling the doc against the live schema and app. **Headline:
~80% of addon2 was already implemented** by the Phase-1 addon migration wave
(`20260630000001`–`11`) plus the June `20260625*` and `m22`–`m26` migrations; the
old `db-schema-snapshot.md` simply predated them.

## Decisions taken (owner-confirmed)

1. **Refunds** — internal credit-reversal only (no donor money-back). Funds stay
   locked to the food-token lifecycle (AGENTS.md; owner-scope §2.1/§4.1). See A6.
2. **Multi-city/district/state hierarchy** — **deferred**; city-level model kept
   (`system_config.operating_city` + `city_lock_enabled`). Region hierarchy is a
   designed-for Phase-2 seam, not built.
3. **Blocked/deferred stay as placeholders** (never invent — AGENTS.md): disaster
   proof (client Q7), email provider (Q4), payment provider (Q17), lost-token &
   token revalidation (Phase-2), `max_tokens_per_volunteer` value, 80G certificates.

## addon2 areas → status

| addon2 area | Status | Where |
|---|---|---|
| Meal/vendor operating rules | Built | redemption engine (`lib/services/redemption.ts`), `vendor_menus`, `meal_windows`, fixed-value one-time tokens |
| Enhanced donor transparency | Built + **A5 added** meal photo + token reference | redemption alert + proof-approval `meal_photo` alert (`app/api/admin/proofs/[id]/decide`), donor notifications + impact pages, dashboard route signed URLs |
| Financial: reconciliation / settlement approval / audit reports | Built | `lib/services/settlement.ts`, `settlement_audit_queue`, `compliance_reports` |
| Financial: failed payment + refund | **A6 added** | `credit_transaction_type='refund_reversal'`, `lib/services/creditRefund.ts`, `POST /api/admin/donations/[id]/reverse`, Reverse action on the donations page |
| Analytics dashboard | **A1 added** | `lib/services/analytics.ts`, `GET /api/admin/analytics`, `app/admin/analytics` (meals, donation trends, vendor perf, token utilisation, financial, fraud, city + category) |
| CSR reporting | Built (certs deferred) | `corporate_csr_profiles`, `app/admin/csr`; 80G/annual statements gated `csr_80g_certificates_enabled=false` |
| Volunteer management | Built + **A4 added** performance metrics (active days, last active) | `lib/services/volunteerActivity.ts`, `app/admin/volunteer-activity` |
| Food quality (ratings/inspections/suspension) | Built | `lib/services/vendorRating.ts`, `vendor_feedback`, `surprise_inspections` |
| Food quality: complaint workflow | **A3 added** | complaint lifecycle on `vendor_feedback`, `GET/PATCH /api/admin/complaints`, `app/admin/complaints` |
| Disaster & emergency ops | Partial (built: emergency mode) | `emergency_token_grants`, `app/admin/emergency`; emergency-campaign object / temporary-vendor / rapid-registration + disaster proof rules **deferred** (Q7 open) |
| System configuration | Built + **A2 added** notification templates | `system_config`, `app/admin/system-config`; `notification_templates` + `app/admin/notification-templates` |
| Notification-template config | **A2 added** | `notification_templates`, `lib/services/notificationTemplates.ts`, wired in `lib/notifications/dispatch.ts` |
| Multi-city/district/state scalability | **Deferred** | city-level only today; region hierarchy is a Phase-2 seam |
| Document management (KYC/FSSAI/agreements) | Partial | `vendor_documents` (vendor-scoped); generic doc store proposed in A8, not built |
| Legal & compliance: consent + retention | **A7 added** | `consent_records`, `lib/services/consent.ts`, `POST/GET /api/donor/consent`, signup consent checkbox; `system_config.audit_log_retention_days` (NULL, purge is a seam) |
| Token business rules (value/one-time/expiry/non-transfer) | Built | `system_config`, token state machine, expire-sweep |
| Token: lost-token & revalidation | **Deferred (Phase-2)** | `tokens.replacement_for_token_id` seam only |

## "Four core features" wording (addon2 line 61)

That paragraph lives in an **external** client progress-update document, **not in
this repo** — it cannot be edited here. The closest in-repo equivalents are
`README.md` (one-line summary) and `docs/prd.md` §2/§3.2. When updating the
external doc, frame it as *"four core operational workflows supported by the
underlying platform infrastructure"* (donor mgmt, beneficiary mgmt, volunteer
mgmt, payments, settlement, reporting, security, analytics, notifications,
compliance).

## Migrations added by addon2

`20260702000001_addon2_enums` · `20260702000002_notification_templates` ·
`20260702000003_complaint_workflow` · `20260702000004_consent_and_retention`
(all reversible; applied via the `supabase-papama` MCP after live reconciliation).
