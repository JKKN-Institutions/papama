# pApAmA — Module Interface Contract

## Developer 2 — Admin & Backend Module

**Phase 1 · Version 1.0 · June 2026**
**Owner:** Subhiksha
**Branch:** `dev2-admin-view`
**Stack:** Next.js (App Router, Route Handlers) · Supabase (Postgres + RLS + Auth) · Zod

---

## Purpose

This document defines the interface contracts for the backend & admin module owned by Developer 2. Developer 2 owns the database, all API route handlers, authentication, authorization, the admin console, and every backend service. The response shapes defined here are the **source of truth** that Developer 1 (Donor module) builds against.

If Developer 2 changes any response field, this document **and** the Donor Module Contract must be updated and the team notified **before** the change is merged — the donor UI binds to these field names directly.

> Responses use `snake_case` field names that match the Supabase Postgres column names, so payloads map cleanly from `select()` results without manual renaming.

---

## Ownership Boundary

Developer 2 is responsible for backend foundation, database, APIs, admin console, vendor, beneficiary, settlement, fraud, compliance, and reporting.

### Owns

- **Database** — all Phase 1 tables, migrations, RLS policies, indexes, seed data, enums, Zod schemas
- All API route handlers under `/app/api/**`
- Authentication (`/lib/auth/**`) and authorization (`/lib/permissions/**`)
- System configuration (`/lib/system-config.ts`)
- Supabase clients (`/lib/supabase/server.ts`, service-role usage)
- All `/app/admin/**` pages and the admin console
- Vendor, Beneficiary, Settlement, Fraud, and Reports & Compliance backends

### Provides To Developer 1

Developer 2 implements the six donor-facing routes that Developer 1 consumes (see Section 11). These are a hard contract. Developer 1 must never implement or modify these route handlers, and never queries Supabase from the client.

---

## Backend Architecture Overview

```
  Client (Donor UI / Admin Console)
        |
        v
  [ Route Handlers ]   /app/api/**            (Developer 2)
        |   validate input with Zod
        |   resolve role via /lib/permissions
        v
  [ Services ]         auth, settlement,       (Developer 2)
                       fraud, reporting, ...
        |
        v
  [ Supabase ]         Postgres + RLS          (Developer 2)
                       migrations / enums / seed
                       audit_logs (append-only)
```

Every donor and admin read passes through a route handler. No client reads Supabase directly. RLS policies enforce that donors see only their own rows and admins are gated by the permission matrix. The service-role key is used **only** inside server-side route handlers, never exposed to the client.

---

## Route Handler Pattern (Standard)

All routes follow this shape: validate with Zod, use the server Supabase client, return JSON, never return `null` for the whole body.

```ts
// app/api/donor/credits/route.ts
import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("donor_credits")
    .select("balance, threshold")
    .eq("donor_id", user.id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    credit_balance: data?.balance ?? 0,
    threshold: data?.threshold ?? 50,
    threshold_reached: (data?.balance ?? 0) >= (data?.threshold ?? 50),
    withdrawable: false,
    transactions: [],
  });
}
```

**Type note:** all types below use TypeScript / JSON terminology — `string`, `number`, `boolean`, `array`, `object`, `null`. The DB column types are Postgres (`uuid`, `int4`, `numeric`, `bool`, `timestamptz`, `jsonb`); the route handler maps them to the JSON types shown.

---

## Section 1 — Backend Foundation

**Pages owned**

- `/app/admin/login`
- `/app/admin/dashboard`
- `/app/admin/settings`

**Responsibilities**

- Authentication (Supabase Auth)
- Authorization
- Role management
- Permission matrix
- Audit logging
- System configuration
- i18n-ready architecture

**Contract Rules**

- Every protected route resolves the caller's role via `/lib/permissions` before returning data
- Every mutating admin action inserts an `audit_logs` row
- System configuration is read through `/lib/system-config.ts` — never hard-coded in routes
- Supabase Auth session is read server-side with `supabase.auth.getUser()`; never trust a client-sent user id

---

## Section 2 — Database Layer

Developer 2 builds all Phase 1 tables. This list is the authoritative schema for Phase 1.

**Phase 1 Tables**

| | | |
| --- | --- | --- |
| `users` | `system_config` | `donors` |
| `donor_credits` | `credit_transactions` | `donations` |
| `payment_methods` | `token_types` | `tokens` |
| `token_batches` | `token_authorisations` | `token_distribution_records` |
| `scheduled_redemption_dates` | `beneficiaries` | `beneficiary_registrations` |
| `token_redemptions` | `redemption_cooldown_log` | `forfeited_balances` |
| `vendors` | `vendor_documents` | `vendor_menus` |
| `vendor_settlements` | `settlement_line_items` | `vendor_communication_history` |
| `vendor_escalations` | `volunteers` | `ngo_partners` |
| `audit_logs` | `notifications` | `fraud_flags` |
| `compliance_reports` | | |

**Responsibilities**

- Migrations (SQL in `/supabase/migrations/**`)
- RLS policies
- Indexes
- Seed data
- Enums (Postgres `enum` types)
- Zod schemas (mirror the DB shape for request/response validation)

**Contract Rules**

- Migrations live in `/supabase/migrations/**` — only Developer 2 edits these
- Every table holding donor or beneficiary data **must** have an RLS policy
- Postgres enums and Zod schemas are the single source of truth for allowed values (token type, status, beneficiary category, etc.)
- `audit_logs` is **append-only** — no `update` or `delete` policies

---

## Section 3 — Token Management

**Pages owned**

- `/app/admin/tokens`
- `/app/admin/token-batches`
- `/app/admin/token-authorisations`

**Features**

- Standard token configuration
- Special care token configuration
- Token generation logic
- Token expiry logic
- Token batch management
- Token authorisation
- Printed QR security
- Token invalidation

**Contract Rules**

- Token generation produces the `qr_payload` signature consumed by Developer 1 — the format must stay stable across the project
- Expiry is computed server-side from the `token_types` config; the donor UI only displays `expires_at`
- Invalidated tokens must return `status: "invalidated"` in `GET /api/donor/tokens`

---

## Section 4 — Vendor Management

**Pages owned**

- `/app/admin/vendors`
- `/app/admin/vendors/[id]`

**Features**

- Vendor onboarding
- Vendor approval
- Vendor documents
- Shop photos
- KYC
- Bank details
- FSSAI license
- GST number
- Emergency contact
- Geo-location
- Vendor suspension
- Vendor appeals

---

### Route Owned — Admin Vendors

```
GET /api/admin/vendors
```

**Response Body (JSON)**

```json
{
  "vendors": [
    {
      "vendor_id": "uuid",
      "name": "Anna Canteen",
      "status": "approved",
      "kyc_status": "verified",
      "fssai_license": "12345678901234",
      "gst_number": "33ABCDE1234F1Z5",
      "geo": { "lat": 13.04, "lng": 80.23 },
      "hygiene_rating": 4,
      "created_at": "2026-06-10T09:00:00Z"
    }
  ]
}
```

**Response Field Reference**

| Field | Type | DB Column | Description |
| --- | --- | --- | --- |
| `vendor_id` | `string` | `uuid` | Vendor UUID |
| `name` | `string` | `text` | Vendor display name |
| `status` | `string` | `enum` | `"pending" \| "approved" \| "suspended" \| "rejected"` |
| `kyc_status` | `string` | `enum` | `"pending" \| "verified" \| "failed"` |
| `fssai_license` | `string` | `text` | FSSAI license number |
| `gst_number` | `string` | `text` | GST registration number |
| `geo` | `object` | `jsonb` | `{ lat: number, lng: number }` |
| `hygiene_rating` | `number` | `int4` | Hygiene rating 1–5 |
| `created_at` | `string` | `timestamptz` | ISO 8601 timestamp |

---

## Section 5 — Vendor Menu Management

**Pages owned**

- `/app/admin/vendor-menus`
- `/app/admin/special-care-items`

**Features**

- Menu approval
- Pricing approval
- Nutrition category approval
- Special care equivalent item approval
- Hygiene rating
- Vendor quality rating

---

## Section 6 — Beneficiary Management

**Pages owned**

- `/app/admin/beneficiaries`
- `/app/admin/beneficiary-registrations`

**Features**

- Beneficiary registration approval
- Eligibility verification
- Pregnancy eligibility
- Patient eligibility
- Disability category
- Disaster-affected category
- Aadhaar optional flow
- Face hash validation

---

### Route Owned — Admin Beneficiaries

```
GET /api/admin/beneficiaries
```

**Response Body (JSON)**

```json
{
  "beneficiaries": [
    {
      "beneficiary_id": "uuid",
      "category": "pregnant_women",
      "status": "approved",
      "eligibility": "verified",
      "aadhaar_linked": false,
      "face_hash_valid": true,
      "registered_at": "2026-06-09T08:00:00Z"
    }
  ]
}
```

**Response Field Reference**

| Field | Type | DB Column | Description |
| --- | --- | --- | --- |
| `beneficiary_id` | `string` | `uuid` | Beneficiary UUID |
| `category` | `string` | `enum` | `"pregnant_women" \| "patient" \| "disability" \| "disaster_affected"` |
| `status` | `string` | `enum` | `"pending" \| "approved" \| "rejected"` |
| `eligibility` | `string` | `enum` | `"pending" \| "verified" \| "failed"` |
| `aadhaar_linked` | `boolean` | `bool` | Whether Aadhaar was provided (optional flow) |
| `face_hash_valid` | `boolean` | `bool` | Result of face hash validation |
| `registered_at` | `string` | `timestamptz` | ISO 8601 timestamp |

> The `category` enum values here **must** match the `beneficiary_category` field returned in Developer 1's redemption history and notification meta.

---

## Section 7 — Redemption Rules

**Pages owned**

- `/app/admin/redemption-rules`

**Features**

- QR validation
- Geofence validation
- Cooldown validation
- Meal limit validation
- Radius validation
- City lock validation
- Co-pay configuration
- Forfeit rules
- Beneficiary protection rules

**Contract Rules**

- All redemption validation happens server-side — the donor UI only displays the result
- A successful redemption produces the `redemption_history` entry shape used by the donor dashboard and notifications (`vendor_name`, `location`, `time`, `meal_info`, `beneficiary_category`)
- Forfeited balances move to the `forfeited_balances` table and are non-recoverable

---

## Section 8 — Settlement Engine

**Pages owned**

- `/app/admin/settlements`
- `/app/admin/settlements/[id]`

**Features**

- Daily settlement
- Twice weekly settlement
- Weekly settlement
- Payment lock
- Proof validation
- Admin override
- Reconciliation

---

### Route Owned — Admin Settlements

```
GET /api/admin/settlements
```

**Response Body (JSON)**

```json
{
  "settlements": [
    {
      "settlement_id": "uuid",
      "vendor_id": "uuid",
      "period": "weekly",
      "amount": 4500,
      "status": "locked",
      "line_items": 12,
      "settled_at": null
    }
  ]
}
```

**Response Field Reference**

| Field | Type | DB Column | Description |
| --- | --- | --- | --- |
| `settlement_id` | `string` | `uuid` | Settlement UUID |
| `vendor_id` | `string` | `uuid` | Vendor being settled |
| `period` | `string` | `enum` | `"daily" \| "twice_weekly" \| "weekly"` |
| `amount` | `number` | `numeric` | Settlement amount in INR |
| `status` | `string` | `enum` | `"pending" \| "locked" \| "reconciled" \| "paid"` |
| `line_items` | `number` | `int4` | Count of `settlement_line_items` rows |
| `settled_at` | `string \| null` | `timestamptz` | ISO 8601 settle time; `null` until paid |

---

## Section 9 — Fraud Dashboard

**Pages owned**

- `/app/admin/fraud`

**Features**

- Duplicate token detection
- Cloned QR detection
- Tampered QR detection
- Beneficiary duplicate detection
- Vendor volume anomaly detection
- Fraud flagging
- Temporary blocking

---

### Route Owned — Admin Fraud

```
GET /api/admin/fraud
```

**Response Body (JSON)**

```json
{
  "flags": [
    {
      "flag_id": "uuid",
      "type": "cloned_qr",
      "severity": "high",
      "entity": { "kind": "token", "id": "uuid" },
      "status": "open",
      "blocked": true,
      "created_at": "2026-06-17T14:00:00Z"
    }
  ]
}
```

**Response Field Reference**

| Field | Type | DB Column | Description |
| --- | --- | --- | --- |
| `flag_id` | `string` | `uuid` | Fraud flag UUID |
| `type` | `string` | `enum` | `"duplicate_token" \| "cloned_qr" \| "tampered_qr" \| "beneficiary_duplicate" \| "vendor_anomaly"` |
| `severity` | `string` | `enum` | `"low" \| "medium" \| "high"` |
| `entity` | `object` | `jsonb` | The flagged entity: `{ kind: string, id: string }` |
| `status` | `string` | `enum` | `"open" \| "resolved" \| "dismissed"` |
| `blocked` | `boolean` | `bool` | Whether the entity is temporarily blocked |
| `created_at` | `string` | `timestamptz` | ISO 8601 timestamp |

---

## Section 10 — Reports & Compliance

**Pages owned**

- `/app/admin/reports`
- `/app/admin/compliance`
- `/app/admin/audit-logs`

**Features**

- CSR reports
- Donation reports
- Redemption reports
- Settlement reports
- Audit logs
- Compliance reports
- Export features

**Contract Rules**

- Reports are generated server-side; export routes return a downloadable file reference (e.g. a Supabase Storage signed URL)
- `audit_logs` is append-only — never updated or deleted
- Compliance reports read from the canonical tables — no shadow copies of data

---

## Section 11 — API Ownership

Developer 2 owns and implements every route below. The first six are the **donor contract** consumed by Developer 1 and must match the response shapes in the Donor Module Contract exactly.

### Donor Routes (consumed by Developer 1)

| Route | Method | Returns |
| --- | --- | --- |
| `/api/donations/create` | `POST` | donation + updated credit balance |
| `/api/donor/credits` | `GET` | credit balance + transactions |
| `/api/tokens/convert` | `POST` | generated token(s) + new balance |
| `/api/donor/tokens` | `GET` | donor's tokens with `qr_payload` |
| `/api/donor/dashboard` | `GET` | totals, history, impact |
| `/api/donor/notifications` | `GET` | donor notifications |

### Admin Routes (consumed by the Admin console)

| Route | Method | Returns |
| --- | --- | --- |
| `/api/admin/vendors` | `GET` | vendor list |
| `/api/admin/beneficiaries` | `GET` | beneficiary list |
| `/api/admin/tokens` | `GET` | token configuration & batches |
| `/api/admin/system-config` | `GET` | system configuration |
| `/api/admin/settlements` | `GET` | settlements |
| `/api/admin/fraud` | `GET` | fraud flags |
| `/api/admin/reports` | `GET` | report data |
| `/api/admin/audit-logs` | `GET` | audit log entries |

---

## Final Ownership

Developer 2 owns:

- Database
- Backend services
- Authentication
- APIs (route handlers)
- Admin console
- Vendor management
- Beneficiary management
- Settlement engine
- Fraud monitoring
- Reports & compliance
- System configuration

---

## Team Rules

### Changing a Contract

- Notify the full team before changing any response field consumed by Developer 1
- Update this document **and** the Donor Module Contract together, then commit before integration
- The team lead resolves conflicts during the integration phase

### Never Return a Null Body

Every route returns a complete, well-shaped JSON body even on partial failure. Use empty arrays and empty objects as defaults so Developer 1's UI never crashes on a missing field. Use HTTP status codes for errors (`401`, `403`, `404`, `500`) with an `{ "error": string }` body — never a bare `null`.

### Field Names Are Case-Sensitive

Use the exact field names defined here and in the Donor Module Contract. `credit_balance` is not `creditBalance`. Responses use `snake_case` to align with Supabase column names; the donor UI binds to these directly.

### Boundaries Are One-Directional

Developer 2 implements routes; Developer 1 consumes them. Developer 1 never edits `/app/api/**`, `/supabase/migrations/**`, `/lib/auth/**`, `/lib/permissions/**`, or `/lib/system-config.ts`, and never imports the Supabase client on the client side. All backend and admin work happens on branch `dev2-admin-view`.

---

*pApAmA · Phase 1 · Admin & Backend Module Contract · v1.0*
