# ASSUMPTIONS.md — pApAmA (Developer 2)

Per the Phase 1 Definition of Done, this file records decisions made in the absence of an explicit client/mentor answer, plus known open items. Update it whenever an assumption is made or resolved.

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

## Schema decisions to confirm

- Token **current-holder** representation: explicit `current_holder_type`/`current_holder_id` on `tokens`, vs. derived from status + latest `token_distribution_records`. (Pick one; keep consistent.)
- API **field names/enums** in the Dev 2 contract were drafted by design, not specified by the client — confirm against real Supabase columns with Developer 1 before locking.
