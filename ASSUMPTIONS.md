# ASSUMPTIONS.md — pApAmA

Per the Phase 1 Definition of Done, this file records decisions made in the absence of an explicit client/mentor answer, plus known open items. Update it whenever an assumption is made or resolved.

> **Note:** This is now a single-developer project (no Developer 1 / Developer 2 split). The whole app — backend, admin, and frontend — is one person's responsibility. Any "Developer 1/2" wording below is historical.

## Resolved (decided with mentor — June 2026)

- **Token generation:** donor mints one token of a donor-chosen amount once accumulated credit exceeds `standard_token_value`; `threshold <= amount <= available credit`. Minting deducts from credit.
- **Post-generation fork:** (A) "use now" → token becomes `live`, donor self-distributes physically/digitally — **no in-app donor→beneficiary transfer exists**; (B) "authorize pApAmA" → token enters admin pool.
- **Admin pool → volunteer:** admin assigns tokens to a selected volunteer, OR grants a volunteer's request, both within `max_tokens_per_volunteer`.
- **`max_tokens_per_volunteer`:** a **concurrent** holding limit (max undistributed tokens a volunteer may hold at once), stored as an admin-editable `system_config` row. The **feature is decided and committed** — the allocation/grant service MUST read this row and enforce it. Only the **numeric value is pending** (mentor input). The seeded row therefore has `value = NULL`; code treats `NULL` as **"limit not yet set"** (do not block, do not invent a number). Do NOT remove the limit concept and do NOT hard-code a default.
- **Option-1 recipient:** donor distributes the live token themselves; the beneficiary is not selected in-app. Beneficiary-side rules apply only at redemption.

## Open — needs client/mentor input (do NOT invent)

- **Disaster-affected category:** is it a standing beneficiary category or an emergency mode, and what proof/eligibility applies? (client Q7) Also confirm proof for persons-with-disabilities.
- **Email provider:** which transactional email service; confirm email scope is notifications-only for Phase 1 (receipts deferred with 80G). (client Q4)
- **Payment provider:** confirm final provider from shortlist (Razorpay / Cashfree / PhonePe). Build provider-agnostic until then. (client Q17)
- **`max_tokens_per_volunteer` numeric value:** the *number* is not yet given (mentor input pending). The feature itself is NOT open — it is decided and must be enforced from config, treating `NULL` as "limit not yet set". Only the value is awaited.
  - **Flag (2026-06-24, volunteer/beneficiary fix pass):** the holding cap remains **INERT/unenforced** until a mentor value is set. No value was invented and the enforcement logic was deliberately left unchanged — the allocation service still reads the `system_config` row and treats `NULL` as "no limit". The volunteer UI continues to show "No holding limit is set". Action awaited: mentor supplies the number; no code change is needed at that point beyond seeding the config value.

## Donor payment seams (decided June 2026 — donor remediation)

- **UPI is REAL (manual confirm).** The public UPI QR donation (`/donate/qr`) now
  uses a self-hosted manual-confirm flow: a backend route generates a UPI deep-link
  QR from a configurable merchant VPA, records a `PENDING` `upi_qr_payments` row
  with a 15-minute expiry, and the donor confirms by entering their UTR (static-VPA
  UPI has no webhook, so manual confirm is by design). The confirmed UTR is the
  payment evidence (`donations.payment_ref = upi:<UTR>`), not a mock. Merchant VPA
  is `NEXT_PUBLIC_UPI_VPA`; if unset, a clearly-flagged demo VPA (`papama@upi`) is
  used so the demo renders — it is NOT a real collecting account and must be set
  before launch.
- **Card / netbanking stay MOCK.** Per decision, the card/netbanking provider
  (Razorpay / Cashfree / PhonePe — still the open item above) is NOT wired. Those
  methods record a clearly-flagged `mock:` `payment_ref` and complete immediately
  so the credit flow is demoable. Do NOT add real provider keys.
- **Email stays MOCK.** No transactional email is sent; donation receipts and
  threshold alerts are in-app `notifications` only (email provider is the open item
  above). Do NOT add a real email provider.
- **Guest donations** (no account): `POST /api/donations/create-guest`, ungated,
  records a donor-less `donations` row (no credit balance — there is no account to
  hold it). The UPI QR confirm route credits through the same path.
- **TOKEN_QR_SECRET** added as the dedicated token-QR HMAC secret, with fallback to
  `SUPABASE_SERVICE_ROLE_KEY` so nothing breaks pre-provisioning. See `.env.example`.

## Schema decisions to confirm

- Token **current-holder** representation: explicit `current_holder_type`/`current_holder_id` on `tokens`, vs. derived from status + latest `token_distribution_records`. (Pick one; keep consistent.)
- API **field names/enums** in the admin/backend contract were drafted by design, not specified by the client — confirm against the real Supabase columns (see `docs/db-schema-snapshot.md`) before locking.
