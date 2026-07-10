# pApAmA — Phase 1 Specification (Revision 2)

**Goal:** A working, demoable product on a **correct foundation** — the spine of pApAmA end-to-end — so you can show real progress to the client and collect the milestone payment **without building anything that has to be torn up in Phase 2.**
**Parent document:** `papama-spec-complete.md` (full requirement IDs, complete schema, full role matrix)
**Companion:** `papama-phase2-spec.md`

**Revision 1 — June 2026 (client decisions folded in):** Confirmed decisions from the 20-question set are incorporated and tagged inline as `[client Q#]` (full record: `papama-client-decisions.docx`; parent §12 shows which items are resolved). Changes: beneficiary categories +2 `[Q7]`; vendor fields +4 `[Q14]`; Special-Care post-delivery window ≤6 months `[Q10]`; email + WhatsApp channels confirmed `[Q4, Q3]`; donor dashboard additions `[Q20]`; Special-Care equivalent-item approval `[Q9]`; **80G receipts deferred** (data hooks added now) `[Q5]`.

**Revision 2 — July 2026 (client email additions folded in):** Requirements from the client's two review emails are incorporated and tagged inline as `[M1-#]` (Mail 1, 14 items) and `[M2-#]` (Mail 2, 14 items). Major changes: meal time windows & entitlement rules `[M1-1]`; donor meal-sponsorship counters mandatory `[M1-2]`; vendor capacity management `[M1-4]`; nearby-vendor discovery `[M1-5]`; basic CSR module `[M1-7, M2-7]`; disaster/emergency mode pulled into Phase 1 `[M1-8, M2-9]`; settlement audit controls incl. duplicate-media detection `[M1-10, M2-4]`; NGO/institution bulk module `[M1-11]`; triple-ledger financial controls `[M1-12, M2-4]`; volunteer management `[M1-13, M2-6]`; public transparency dashboard `[M1-14]`; explicit meal & token business rules `[M2-1, M2-2, M2-5]`; **lost-token handling moved from Phase 2 into Phase 1** `[M2-5]`; analytics dashboard `[M2-8]`; document management `[M2-13]`; legal & compliance (consent, FSSAI, GST, retention) `[M2-14]`; multi-city/district/state administrative hierarchy designed-in `[M2-12]`. Two conflicts with earlier confirmed decisions (max meals/day, co-pay ceiling) are **resolved in favour of the latest client mails** — decision record in **§11.1**; remaining open gaps in **§11.2**.

---

## 1. Phase 1 Principle

> Phase the **build**, not the foundation.

Everything that touches the **data model** or the **core flows** is built (or at least designed-for) in Phase 1, because retrofitting those later means migrations and reopening working code. Genuinely modular, additive features are deferred to Phase 2.

**Positioning note `[M2, closing paragraph]`:** In all client-facing documents and progress updates, describe the platform as **four core operational workflows** (donation→credit→token, distribution, redemption/validation, settlement) **supported by underlying platform infrastructure** — donor management, beneficiary management, volunteer management, payment gateway integration, settlement engine, reporting, security, analytics, notifications, and compliance modules. Do not describe it as "four core features."

---

## 2. The Demoable Slice (what the client will see)

A complete, working path:

```
Donor donates (app / web / QR, any amount)
   → donor credit accumulates → alert at ₹50 threshold → convert to token
   → donor dashboard shows meals sponsored / redeemed / pending [M1-2]
   → token generated (Standard or Special Care) with secure QR
   → distributed (digital or printed QR; direct or via volunteer, tracked) [M1-13]
   → beneficiary finds a nearby approved vendor (distance, hours, availability) [M1-5, M1-4]
   → beneficiary shows token at an approved vendor → vendor app scans
   → validation passes (QR, geofence, meal time-window, cooldown, meal limit, face-hash) [M1-1]
   → food selected within token value — freshly prepared, on-the-spot only [M2-1]
   → vendor uploads proof (plate photo + receipt) → duplicate-media check → payment lock releases [M1-10]
   → settlement runs on the vendor's chosen cycle (admin approval + override) [M2-4]
   → every rupee posts to the ledgers (donation / vendor payable / revenue) [M1-12]
   → donor gets an alert (with meal photo, vendor, time, location, token ref, category) [M2-3]
   → public transparency dashboard counters update [M1-14]
```

If you can demo that loop, you have demonstrated the entire product thesis.

---

## 3. In Scope — Phase 1

Requirement IDs reference `papama-spec-complete.md`.

### 3.1 Foundation (must be correct now — deferring causes rework)

- **F-1 Token categories (two-tier).** Build `token_types` with **Standard** + **Special Care** (up to 2×, restricted to nutritious menu categories). Even if Special Care issuance is lightly exercised in the demo, the schema and redemption logic must support it now. A single standard Care-item list applies to all shops; shops may request approval for equivalent nutritious local alternatives. [client Q9] *(TOK-4)*
- **F-2 Configurable settlement model.** Build the **daily / twice-weekly / weekly** settlement engine with **admin override**, **settlement approval step** `[M2-4]`, **settlement hold facility** `[M1-10]`, and **payment lock**. Do **not** build instant settlement — it is the wrong model and would be ripped out. *(SET-1…4, PROOF-4)*
- **F-3 Proof of service + payment lock + audit controls.** Vendor uploads plate photo + receipt; no proof → no payment. Add **duplicate photo detection** and **duplicate bill detection** (perceptual hash + bill fingerprint against history) and a **random audit queue** that samples settlements for manual review `[M1-10]`. *(PROOF-1…4)*
- **F-4 Beneficiary registration & eligibility.** System-driven approval with document submission and auto-expiry (pregnancy/patient). Drives Special Care eligibility. Categories include **persons with disabilities** and **disaster-affected individuals** [client Q7]; pregnancy post-delivery window defaults to **up to 6 months**, admin-configurable [client Q10]. Beneficiary categories themselves are **admin-configurable** `[M2-10]`. *(BEN-1…5)*
- **F-5 Aadhaar reconciliation.** Aadhaar **optional only, never mandatory**; **face-hash is primary**. `beneficiaries.aadhaar_hash` is nullable. *(SEC-1…4)*
- **F-6 "Donor credit", not "wallet".** Tables and UI use **credit** terminology. *(DON positioning)*
- **F-7 `system_config`.** All "e.g." values are admin-configurable rows, not constants — token values, expiry, cooldown, meal limits, meal time windows, radius, co-pay max, settlement defaults, beneficiary categories, and **notification templates** `[M2-10]`. *(§4 of parent)*
- **F-8 i18n-ready.** Externalize all UI strings from day one so Phase 2 multi-language is additive, not a rewrite. *(I18N-1)*
- **F-9 Meal entitlement model.** `[M1-1]` Meal time windows and entitlement rules are **first-class schema**, not bolt-ons: configurable **Breakfast / Lunch / Dinner / Snacks windows** (suggested defaults: Breakfast 6–10 AM, Lunch 11 AM–3 PM, Dinner 6–10 PM), **max meals per beneficiary per day**, **multi-level admin-adjustable cooling period** between redemptions (global default → category override → emergency override), and an explicit rule for **whether a beneficiary may redeem at multiple vendors on the same day** (default: allowed within daily meal limit; admin-toggleable — pending confirmation, §11). **Max meals per day: launch at 1, ceiling 3, admin-configurable** — resolved per client Mail 1, superseding the earlier confirmed value of 2 `[M1-1]`.
- **F-10 Ledger-based financial architecture.** `[M1-12, M2-4]` Every money movement posts double-entry-style rows to three ledgers: **Donation ledger**, **Vendor payable ledger**, **Admin/revenue ledger**. Settlement reconciliation reports derive from ledgers, not ad-hoc queries. **Every rupee must be traceable.** Includes **failed-payment handling** and a **refund workflow** where applicable (donations are otherwise non-withdrawable; refunds only for failed/duplicate payment cases per policy).
- **F-11 Geographic hierarchy (scalability seam).** `[M2-12, M1-5]` A `geo_units` hierarchy (**city → district → state**) referenced by vendors, beneficiaries, volunteers, and reports, so multi-city/district/state administration and reporting is a data question, not a schema migration. Phase 1 operates it with Coimbatore only; the hierarchy exists from day one. Vendors get **service zones**; city-wise rollout is a config/admin action.
- **F-12 Institution beneficiary type.** `[M1-11]` `beneficiaries`/`institutions` schema supports **orphanages, old-age homes, charity hospitals** as institutional beneficiaries with **bulk token allocation**, **bulk redemption tracking**, and **institution-wise reporting**. Phase 1 ships a basic working version (allocate batch → track redemptions → per-institution report).

### 3.2 Hard Business Rules (explicit, testable — UAT reference) `[M2-1, M2-2, M2-5, M1-3]`

These are stated verbatim as system-enforced rules so there is no scope for differing interpretation during development or UAT:

**Meal rules `[M2-1]`**
- Meals must be **freshly prepared and served for immediate on-the-spot consumption**.
- **No** packed meals, takeaway, groceries, raw food, or cash redemption.
- Tokens are **never exchangeable for cash or any other products**.

**Vendor operating rules `[M2-2]`**
- Vendors serve **only admin-approved menu items** at approved prices.
- **No partial redemption** of tokens; **no cash balance returned**; **no substitution** of menu items outside the approved list.
- **One token cannot be split between multiple beneficiaries.**

**Token rules `[M2-5]`**
- Token values are **admin-configurable** (per token type).
- **One-time redemption** only; auto-invalidate on redemption or expiry.
- **Expiry and revalidation policy**: expired tokens are invalid; admin may revalidate/extend per policy (audited action).
- **Lost-token handling**: beneficiary/distributor reports loss → old token blocked instantly → replacement issued referencing `replacement_for_token_id` (audited). **Moved from Phase 2 into Phase 1.**
- **Non-transferable after issue** (bound to issued beneficiary/distribution record; face-hash check enforces at redemption).

**Co-contribution / dignity rule `[M1-3]`**
- Vendor may collect a co-contribution of **₹0 up to a configurable maximum of ₹10** (supersedes the earlier ₹5 value per client Mail 1 `[M1-3]` — **resolved**), **admin-settable per beneficiary category**.
- **₹0 is always available; no beneficiary is ever denied food for inability to pay.** This rule is documented, configured, and enforced in the redemption flow.

### 3.3 Core Flows

- **Donor donation & credit** — any amount; UPI/QR/card/net-banking/bank transfer; donor portal (Android + iOS + web); **no-app QR/web donation**; non-withdrawable funds; threshold alert; convert or accumulate; **failed-payment handling and refund workflow where applicable** `[M2-4]`. *(DON-1…8)*
- **Donor meal-sponsorship view (mandatory Phase 1)** `[M1-2]` — the ₹50 = 1 meal equivalence is surfaced everywhere: donation confirmation shows **meals sponsored** (₹500 → 10 meals, ₹5,000 → 100 meals); donor dashboard shows **meals sponsored / meals redeemed / meals pending** in real time.
- **Token generation** — unique encrypted one-time QR; admin-configurable value `[M2-5]`; no split/combine/partial; configurable expiry; auto-invalidate on expiry; revalidation policy `[M2-5]`; lost-token block & replacement `[M2-5]`. *(TOK-1…6, LOST → now P1)*
- **Token distribution** — direct / network / volunteer / pApAmA-authorised; digital + printed QR; printed anti-copy & optional area-lock; courier for batches above threshold; scheduled occasion + 7-day reminder; multi-level authorisation; **distribution tracking per volunteer** `[M2-6]`; **bulk allocation to institutions** `[M1-11]`. *(DIST-1…7)*
- **Redemption & validation** — menu within token value; QR + geofence + **meal time-window check** `[M1-1]` + cooldown (multi-level configurable `[M1-1]`) + daily meal-limit + verification; value handling (pay difference / forfeit balance — **never cash back** `[M2-2]`); co-contribution per §3.2 `[M1-3]`; on-the-spot freshly-prepared food only `[M2-1]`; respectful multi-option fallback so no genuine beneficiary is denied. *(RED-1…7)*
- **Beneficiary vendor discovery** `[M1-5]` — beneficiary-facing view (app/lightweight web) listing **nearby approved vendors with distance, operating hours, and live availability status** (from capacity module). Respects city lock / service zones.
- **Beneficiary verification & privacy** — temporary non-reversible face-hash; optional Aadhaar for immediate check only; offline photo captured and checked before vendor payment released. *(SEC-1…4)*
- **Vendor onboarding & management** — business info, shop photo, bank, KYC (+ **FSSAI licence, GST number, emergency contact, geo-location** [client Q14]); verification-pending checklist; menu/pricing admin approval (incl. approving **equivalent Special-Care items** [client Q9]); geofence + **service zone** `[M1-5]`; hygiene/quality ratings; suspension triggers + appeal. *(VEN-1…4)*
- **Vendor capacity management** `[M1-4]` — vendor declares **daily meal capacity**; **availability status** (open/closed/paused); **temporary closure** facility; **"meal stock exhausted" notification** that pauses new redemptions at that vendor and updates beneficiary discovery — so sponsored meals never route to a vendor who cannot serve.
- **Vendor settlement engine** — configurable cycle, **settlement approval process** `[M2-4]`, admin override, **hold facility** `[M1-10]`, reconciliation from ledgers `[M1-12]`, **random audit queue** `[M1-10]`. *(SET-1…4)*
- **Donor transparency (enhanced)** `[M2-3, Q4, Q20]` — redemption alert (in-app / SMS / email) includes **meal photo, vendor name, redemption time, location, token reference, and beneficiary category — never personal identity**; thank-you + re-donate link; dashboard of credit, tokens, history + sponsorship counters `[M1-2]` + impact stats & monthly summary [Q20]; forfeiture details hidden. *(TRANS-1…4)*
- **Donor impact dashboard** `[M1-6]` — meals funded, meals served, beneficiary categories served, **city-wise impact**, and (admin-side) **repeat-donor statistics** for retention analysis.
- **Corporate CSR module (basic)** `[M1-7, M2-7]` — **CSR/corporate donor registration** (donor_type = corporate, CIN/GST fields); **CSR reports**; **downloadable utilization certificates** and **impact reports**; **annual donation statements** `[M2-7]`. (80G tax receipts remain deferred pending registration [Q5]; data hooks already in place.)
- **Volunteer management** `[M1-13, M2-6]` — volunteer **onboarding & registration**, **admin approval**, **area allocation** (geo_units), **activity tracking** (registrations assisted, tokens distributed), and **activity/performance reports**.
- **Disaster & emergency operations** `[M1-8, M2-9]` — admin-togglable **disaster relief mode**: **emergency campaign creation**; **temporary vendor onboarding** (fast-track, time-boxed approval); **rapid beneficiary registration** (relaxed docs, `disaster_affected` category [Q7]); **temporary meal-limit increases** and **emergency token validity rules** (all as scoped config overrides, auto-reverting, fully audited).
- **Food quality monitoring** `[M1-9, M2-11]` — **beneficiary feedback/rating** after redemption; **complaint management** (log → triage → resolve); **surprise inspection records**; computed **vendor quality score**; **suspension workflow** (triggers: rating < threshold, complaint rate > threshold, failed inspection) + appeal.
- **Analytics dashboard (admin)** `[M2-8]` — meals served, donation trends, vendor performance, token utilisation, financial summaries (from ledgers), fraud monitoring, **city-wise and category-wise reports** (via geo hierarchy `[M2-12]`).
- **Public transparency dashboard** `[M1-14]` — unauthenticated page showing **total donations received, meals sponsored, meals served, active vendors, active beneficiaries (count only), cities covered**. Aggregate-only; no personal data.
- **Document management** `[M2-13]` — central, versioned store for **KYC documents, FSSAI licences, vendor agreements, and audit records**, with expiry tracking (e.g., FSSAI renewal alerts) and role-restricted access.
- **Admin module** — auth (role-based); vendor mgmt; token mgmt; beneficiary protection rules (one-per-window, 20 km radius, city lock, meal limit, cooldown, meal windows); co-contribution config (category-wise `[M1-3]`); fraud dashboard; reporting & exports; **multi-level geographic administration (city/district/state scoping)** `[M2-12]`. *(ADM)*
- **Security & fraud (core)** — encrypted one-time QR, auto-invalidation, anti-duplication, cloned/tampered rejection; geofencing; printed-token security; core AI fraud (beneficiary repeat via face-hash, vendor volume anomaly, token duplication, **duplicate proof media** `[M1-10]`, real-time flagging, auto temp-block). *(SEC-5…8, excluding GPS-spoofing & advanced behavioural analytics → P2)*
- **Legal & compliance** `[M2-14]` — **data privacy & consent management** (consent capture at registration, purpose limitation, DPDP-aligned); **FSSAI compliance** surfaced in vendor onboarding & document expiry; **GST compliance where applicable** (vendor GST captured [Q14]; GST fields on settlements/invoices); **audit-trail retention policy** (configurable retention period; immutable append-only `audit_logs`); CSR-compliant exportable reports. *(ADM reporting)*

---

## 4. Explicitly Deferred to Phase 2

These are **designed-for** (schema leaves room) but **not built** in Phase 1:

- Event-campaign QR donations (`EVT`) — *general* marketing/event campaigns remain P2, but they will reuse the `campaigns` table built for **emergency campaigns**, which are now Phase 1 `[M2-9]`.
- Micro-donation pooling & admin-assisted value completion (`POOL`)
- ~~Lost-token & replacement workflow (`LOST`)~~ — **pulled into Phase 1** `[M2-5]` (§3.2 Token rules).
- Training & awareness module (`TRN`)
- Multi-language UI rollout (`I18N` — strings externalized now, translations later)
- GPS-spoofing detection & advanced behavioural/clustered-abuse analytics (core duplicate-media detection is P1 `[M1-10]`; ML-driven behavioural clustering remains P2)
- ~~WhatsApp/SMS channels~~ — **confirmed and in scope** [client Q3]; per the MOU these are base-scope multi-channel delivery. SMS & email notifications ship in Phase 1; WhatsApp interactions are within the contracted scope. (WhatsApp / SMS / email providers are client-procured.)
- Advanced CSR portal (self-serve corporate sub-accounts, employee-matching campaigns) — **basic CSR module is P1** `[M1-7]`; the richer portal is P2.
- Full multi-city *operations* — the geo hierarchy, scoped administration, and city-wise reporting are P1 `[M2-12]`; onboarding cities beyond Coimbatore is an operational rollout, not new build.

Deferring these is safe because none of them force a change to Phase 1 tables — they add new tables or layer on top.

---

## 5. Phase 1 Data Model

Build all tables marked **Phase 1** in `papama-spec-complete.md` §7:

`users`, `system_config`, `donors`, `donor_credits`, `credit_transactions`, `donations`, `payment_methods`, `token_types`, `tokens`, `token_batches`, `token_authorisations`, `token_distribution_records`, `scheduled_redemption_dates`, `beneficiaries`, `beneficiary_registrations`, `token_redemptions`, `redemption_cooldown_log`, `forfeited_balances`, `vendors`, `vendor_documents`, `vendor_menus`, `vendor_settlements`, `settlement_line_items`, `vendor_communication_history`, `vendor_escalations`, `volunteers`, `ngo_partners`, `audit_logs`, `notifications`, `fraud_flags`, `compliance_reports`.

**New Phase 1 tables (Revision 2):**

| Table | Purpose | Source |
|---|---|---|
| `geo_units` | city → district → state hierarchy; FK from vendors/beneficiaries/volunteers/reports | `[M2-12, M1-5]` |
| `meal_time_windows` | configurable Breakfast/Lunch/Dinner/Snacks windows | `[M1-1]` |
| `vendor_capacity` | daily capacity, availability status, temp closure, stock-exhausted flag | `[M1-4]` |
| `vendor_service_zones` | vendor coverage areas within geo hierarchy | `[M1-5]` |
| `ledger_entries` | unified double-entry rows; `ledger` ∈ {donation, vendor_payable, revenue} | `[M1-12]` |
| `payment_failures` | failed-payment capture, retry state | `[M2-4]` |
| `refunds` | refund workflow (policy-gated) | `[M2-4]` |
| `settlement_audit_queue` | random-sample + flagged settlements for manual review | `[M1-10]` |
| `media_fingerprints` | perceptual hashes of proof photos + bill fingerprints for duplicate detection | `[M1-10]` |
| `institutions` | orphanages / old-age homes / charity hospitals | `[M1-11]` |
| `institution_token_allocations` | bulk allocation + redemption tracking per institution | `[M1-11]` |
| `campaigns` | emergency campaigns now; general event campaigns (P2) reuse it | `[M2-9]` |
| `emergency_overrides` | time-boxed config overrides (meal limits, token validity), auto-revert, audited | `[M1-8, M2-9]` |
| `volunteer_area_allocations` | volunteer ↔ geo_unit assignment | `[M1-13]` |
| `volunteer_activities` | activity/performance tracking | `[M1-13, M2-6]` |
| `beneficiary_feedback` | post-redemption meal rating/feedback | `[M1-9, M2-11]` |
| `complaints` | complaint intake → triage → resolution | `[M2-11]` |
| `vendor_inspections` | surprise inspection records + outcomes | `[M1-9, M2-11]` |
| `documents` | central versioned document store (KYC, FSSAI, agreements, audit records) with expiry tracking | `[M2-13]` |
| `consent_records` | data-privacy consent capture per user/beneficiary | `[M2-14]` |
| `notification_templates` | admin-editable templates per channel/event | `[M2-10]` |
| `csr_certificates` | generated utilization certificates / annual statements | `[M1-7, M2-7]` |
| `public_stats_snapshots` | cached aggregates for the public dashboard | `[M1-14]` |

**Column additions to existing tables:** `donors.donor_type` (individual/corporate) + corporate fields (CIN) `[M1-7]`; `tokens.issued_to_binding` (non-transferability) `[M2-5]`; `vendors.geo_unit_id`, `beneficiaries.geo_unit_id`, `volunteers.geo_unit_id` `[M2-12]`; `vendor_settlements.approval_status`, `.hold_reason` `[M2-4, M1-10]`; `token_redemptions.meal_window`, `.co_contribution_amount` `[M1-1, M1-3]`.

**Design-for-Phase-2 (leave the seams, don't build the feature):**
- `tokens.replacement_for_token_id` — **now actively used** (lost-token reissue is P1 `[M2-5]`)
- `donations.event_campaign_id` (nullable) — general event campaigns (emergency campaigns use it in P1)
- `credit_transactions.transaction_type` includes `pooling_supplement`
- `fraud_flags.detection_method` enum includes `gps_integrity`, `pattern_analysis` (and now `duplicate_media` — active in P1 `[M1-10]`)
- `notifications.channel` enum includes `whatsapp`
- `donors.pan_number` (nullable) + `donations.financial_year` — seams for **deferred 80G receipts** [client Q5]

---

## 6. Phase 1 Role Access Matrix

| Feature | Admin | Compliance | Vendor_Manager | Vendor | Volunteer | Donor | Beneficiary | Guest |
|---------|-------|-----------|----------------|--------|-----------|-------|-------------|-------|
| Donor Donation & Credit | CRUD | R | — | — | — | Own | — | Donate (QR/web) |
| Donor Sponsorship Counters `[M1-2]` | R | R | — | — | — | Own | — | — |
| Token Generation & Mgmt (incl. lost-token) | CRUD | R | R | — | R | Own (CRU) | Report loss | — |
| Token Distribution | CRUD | R | R | — | CR | CRU | — | — |
| Institution Bulk Allocation `[M1-11]` | CRUD | R | R | — | R | — | Institution (Own view) | — |
| Beneficiary Registration | CRUD | R | R | — | CR (assist) | — | Own | Self-register |
| Vendor Discovery `[M1-5]` | R | — | R | Own listing | R | — | R | — |
| Token Redemption | CRUD | R | R | CR (scan/proof) | R | — | Own | — |
| Vendor Management | CRUD | R | Approve/CRU | Own profile | R | — | — | — |
| Vendor Capacity & Availability `[M1-4]` | CRUD | R | R | Own (CRU) | — | — | R (status) | — |
| Vendor Menu & Pricing | CRUD | R | Approve | Propose (Own) | — | — | — | — |
| Vendor Settlement (+ approval/hold) | CRUD + Override | R + Approve | R | Own (view) | — | — | — | — |
| Proof of Service (+ duplicate checks) | R | R | R | C (Own) | — | — | — | — |
| Financial Ledgers & Reconciliation `[M1-12]` | CRUD | R | — | Own payable (R) | — | — | — | — |
| Refunds / Failed Payments `[M2-4]` | CRUD | R | — | — | — | Own (view/request) | — | — |
| CSR Module `[M1-7]` | CRUD | R | — | — | — | Own (corporate) | — | — |
| Volunteer Management `[M1-13]` | CRUD | R | R | — | Own profile/activity | — | — | — |
| Quality: Feedback / Complaints / Inspections `[M2-11]` | CRUD | R | CRU | Own (respond) | — | — | C (feedback/complaint) | — |
| Emergency / Disaster Mode `[M2-9]` | CRUD (toggle) | R | R | — | R | — | — | — |
| Analytics Dashboard `[M2-8]` | R (full) | R | R (scoped) | — | — | — | — | — |
| Public Transparency Dashboard `[M1-14]` | Config | R | R | R | R | R | R | **R** |
| Document Management `[M2-13]` | CRUD | R | R (vendor docs) | Own (upload) | — | — | Own (upload) | — |
| Consent Management `[M2-14]` | CRUD | R | — | — | — | Own | Own | — |
| Fraud Monitoring | CRUD | R | R | — | — | — | — | — |
| Audit & Reports | CRUD | R | — | — | — | — | — | — |

---

## 7. Phase 1 Configurable Defaults (`system_config`)

| Key | Default | Confirm? |
|-----|---------|----------|
| `standard_token_value` | ₹50 | admin-configurable per token type `[M2-5, M2-10]` |
| `special_care_multiplier` | 2× | |
| `special_care_post_delivery_months` | 6 | [client Q10] |
| `token_expiry_days` | 90 | revalidation policy applies `[M2-5]` |
| `token_revalidation_allowed` | true (admin action, audited) | `[M2-5]` |
| `meal_cooldown_hours` | 6 | **multi-level**: global → category → emergency override `[M1-1]` |
| `max_meals_per_day` | **launch value 1; ceiling 3** (supersedes earlier "2 confirmed" per client Mail 1 — resolved) | `[M1-1]` |
| `meal_window_breakfast` | 06:00–10:00 | `[M1-1]` |
| `meal_window_lunch` | 11:00–15:00 | `[M1-1]` |
| `meal_window_dinner` | 18:00–22:00 | `[M1-1]` |
| `meal_window_snacks` | admin-defined / disabled by default | `[M1-1]` |
| `multi_vendor_same_day` | true (within daily limit) | `[M1-1]` — confirm |
| `redemption_radius_km` | 20 | |
| `city_lock_enabled` | true | |
| `co_contribution_max` | **₹10** (supersedes earlier ₹5 per client Mail 1 — resolved); category-wise overrides; **₹0 always allowed** | `[M1-3]` |
| `courier_batch_min_value` | ₹5,000 | |
| `vendor_min_rating` | 3.5 | feeds suspension workflow `[M2-11]` |
| `vendor_max_complaint_rate` | 5% | feeds suspension workflow `[M2-11]` |
| `settlement_audit_sample_pct` | 5% | random audit queue `[M1-10]` |
| `emergency_mode_max_duration_days` | 30 (auto-revert) | `[M2-9]` |
| `audit_retention_years` | 8 | retention policy — confirm with client `[M2-14]` |
| `beneficiary_categories` | list, admin-editable | `[M2-10]` |
| `notification_templates` | per channel/event, admin-editable | `[M2-10]` |

### 7.1 Config Change Semantics (how "admin-configurable" behaves)

The admin can change any §7 value at any time from the admin console — no developer involvement, no redeployment. The following rules govern every change:

1. **Prospective effect only.** Config changes apply to transactions *after* the change. Already-issued tokens keep the value, expiry, and rules encoded at issuance; in-flight redemptions complete under the rules in force when the scan occurred. No change ever retroactively alters an issued token or a completed transaction.
2. **Fully audited.** Every change writes an immutable audit entry: admin identity, key, old value, new value, timestamp, and (optionally) reason. Visible in the audit log and analytics.
3. **Bounded where safety requires.** Certain keys have hard bounds that normal config edits cannot cross: `co_contribution_max` cannot exceed ₹10 and **₹0 availability can never be disabled**; `meal_cooldown_hours` cannot be set to 0; fraud checks cannot be switched off. Exceeding normal bounds is possible **only** through a time-boxed, auto-reverting **emergency override** (`[M2-9]`), which is separately audited.
4. **Effective-from scheduling (optional).** Admin may schedule a change to take effect at a future date/time (e.g., new meal windows from next Monday) so vendors and beneficiaries can be notified in advance via notification templates.
5. **Multi-level resolution.** Where a key supports levels (cooldown: global → category → emergency; co-pay: global → category), the most specific applicable value wins, and each level is independently editable and audited.

---

## 8. Phase 1 Build Checklist (5-layer per feature)

**Layer 1 — Types:** enums (token_type, beneficiary_category [incl. persons_with_disabilities, disaster_affected — Q7; admin-extensible `[M2-10]`], eligibility_status, settlement_cycle, settlement_approval_status `[M2-4]`, payment_status, refund_status `[M2-4]`, ledger_type `[M1-12]`, meal_window `[M1-1]`, availability_status `[M1-4]`, complaint_status `[M2-11]`, campaign_type `[M2-9]`, document_type `[M2-13]`, role, fraud detection_method [+ duplicate_media `[M1-10]`]); Zod schemas for donations, tokens, registrations, redemptions, settlements, capacity, feedback, complaints, refunds, campaigns.

**Layer 2 — Database:** migrations for all Phase 1 tables incl. Revision-2 tables (§5); RLS per role (matrix §6, geo-scoped for Vendor_Manager `[M2-12]`); indexes (token_code, face_hash, redemption datetime, vendor geofence, settlement period, `media_fingerprints.hash`, `ledger_entries(ledger, period)`, `geo_units` path); reversible DOWN migrations; seed `system_config`, `token_types`, `meal_time_windows`, `geo_units` (Coimbatore), `notification_templates`.

**Layer 3 — Services:** Credit, Token (incl. LostToken + Revalidation `[M2-5]`), Distribution (incl. InstitutionBulk `[M1-11]`), BeneficiaryRegistration, Redemption (+ validation rules: QR, geofence, **meal window**, multi-level cooldown, meal-limit, value handling, co-pay category-wise, hard rules §3.2), VendorDiscovery `[M1-5]`, VendorCapacity `[M1-4]`, ProofOfService (+ DuplicateMediaCheck `[M1-10]`), VendorOnboarding (+ temp/emergency mode `[M2-9]`), Settlement (+ payment lock + approval + hold + override + reconciliation + audit queue), **Ledger** `[M1-12]`, Refund/PaymentFailure `[M2-4]`, CSRReporting `[M1-7]`, VolunteerManagement `[M1-13]`, Quality (feedback/complaints/inspections/suspension `[M2-11]`), EmergencyCampaign `[M2-9]`, DocumentManagement `[M2-13]`, Consent `[M2-14]`, Notification (template-driven `[M2-10]`), Audit (+ retention policy `[M2-14]`), Fraud (core), Analytics `[M2-8]`, PublicStats `[M1-14]`. Permission checks per role.

**Layer 4 — Hooks:** useQuery/useMutation per domain; error & loading states.

**Layer 5 — Pages:** Donor portal (donate, credit, tokens, history, **sponsorship counters `[M1-2]`**, **impact dashboard `[M1-6]`**, CSR downloads for corporate `[M1-7]`) + no-app QR donation page; Vendor app (login, scan, validate, menu, **capacity/availability toggle `[M1-4]`**, proof upload, settlement view, complaint responses); Admin console (vendors, menus, tokens, beneficiary rules, **meal windows**, settlements + **approval/hold/audit queue**, **ledgers & reconciliation**, volunteers, institutions, **emergency mode**, quality/complaints/inspections, documents, **analytics `[M2-8]`**, fraud dashboard, reports, notification templates); Volunteer (registration assist, distribution, own activity); **Beneficiary vendor-discovery view `[M1-5]`**; **Public transparency dashboard (unauthenticated) `[M1-14]`**; mobile-responsive throughout.

---

## 9. Demo Script (for the client review / milestone)

1. Donor donates ₹30, then ₹20 → credit reaches ₹50 → alert → convert to a **Standard** token (show QR). Confirmation screen shows **"1 meal sponsored"**; dashboard shows sponsored/redeemed/pending `[M1-2]`.
2. Show a **Special Care** token issued to a registered pregnant/patient beneficiary, restricted to nutritious menu items.
3. Distribute a token (digital QR + printed anti-copy QR) via a **volunteer — show the distribution logged to their activity record** `[M1-13]`.
4. Beneficiary opens **vendor discovery** — nearby approved vendors with distance, hours, availability `[M1-5]`. Toggle one vendor to **"stock exhausted"** and show it drop from availability `[M1-4]`.
5. Vendor app scans → validations run live: blocked second redemption inside cooldown, geofence rejection, **and a redemption attempt outside the lunch window rejected** `[M1-1]`.
6. Beneficiary picks a meal under token value → balance forfeited (no cash back `[M2-2]`); then one over value → pays difference; show co-contribution with **₹0 default** and category-wise config `[M1-3]`.
7. Vendor uploads plate photo + receipt → **re-upload the same photo on a second redemption → duplicate detected & flagged** `[M1-10]` → valid proof → payment unlocks.
8. Run a settlement on the vendor's chosen cycle → **approval step** → show admin **hold** and override `[M2-4]`; open the **ledgers** and trace one rupee end-to-end (donation → payable → settled) `[M1-12]`.
9. Donor receives the redemption alert — **meal photo, vendor, time, location, token ref, beneficiary category, no identity** `[M2-3]` — with thank-you + re-donate link.
10. Report a token **lost** → old QR blocked instantly → replacement issued and redeemed `[M2-5]`.
11. Toggle **emergency mode**: create an emergency campaign, fast-track a temporary vendor, raise the meal limit temporarily (auto-revert shown in config) `[M2-9]`.
12. Beneficiary submits a **meal rating + one complaint** → admin triages → show vendor quality score & the suspension threshold `[M2-11]`.
13. Admin: **analytics dashboard** (meals served, donation trends, vendor performance, city/category cuts) `[M2-8]`, fraud dashboard, immutable audit log, **CSR utilization certificate download** `[M1-7]`, exportable CSR report.
14. Open the **public transparency dashboard** and show the counters updated by the demo's own transactions `[M1-14]`.

---

## 10. Phase 1 Definition of Done

- The full demo script (all 14 steps) runs end-to-end on Android + iOS (vendor) and donor web/app.
- All Phase 1 tables (incl. Revision-2 tables §5) migrated with RLS; `system_config` drives every configurable rule, including meal windows, multi-level cooldowns, category-wise co-pay, and notification templates.
- Hard business rules of §3.2 are enforced in code and covered by automated tests (these are the UAT acceptance criteria).
- Proof-gated payments with duplicate-media detection; configurable settlement with approval, hold, override, and random audit queue.
- Triple-ledger financials reconcile to the paisa; failed-payment and refund workflows operational.
- Aadhaar non-mandatory; face-hash verification working; privacy-safe; consent records captured.
- Audit log immutable with configured retention; CSR report + utilization certificate exports.
- Public transparency dashboard live with aggregate-only data.
- Geo hierarchy in place (Coimbatore seeded); all reports support city/district/state cuts.
- UI strings externalized (i18n-ready).
- `ASSUMPTIONS.md` lists anything decided in the absence of a client answer.

---

## 11. Decision Record & Open Questions

### 11.1 Resolved conflicts (latest client mail prevails — decided July 2026)

| # | Item | Earlier value | Resolution (per client mails) |
|---|------|--------------|-------------------------------|
| R-1 | Max meals per beneficiary per day `[M1-1]` | 2 (previously confirmed) | **Launch at 1; ceiling 3; admin-configurable.** Latest mail supersedes the earlier confirmation. Reflected in §3.1 F-9 and §7. |
| R-2 | Co-contribution maximum `[M1-3]` | ₹5 (₹0 always allowed) | **₹0–₹10 configurable, category-wise; ₹0 always allowed.** Latest mail supersedes. Reflected in §3.2 and §7. |

### 11.2 Still open (gaps — client asked for the feature but not the detail)

1. **Snacks window** `[M1-1]` — Mail 1 lists Snacks as a meal type but gives no time window. Define or disable at launch?
2. **Multi-vendor same-day redemption** `[M1-1]` — proposed default: allowed within the daily meal limit. Confirm.
3. **Refund policy boundaries** `[M2-4]` — donations are contractually non-withdrawable; confirm refunds apply **only** to failed/duplicate payment-gateway cases.
4. **Audit retention period** `[M2-14]` — default proposed 8 years; confirm the legally required period.
5. **Emergency-mode authority** `[M2-9]` — who may activate disaster mode and temporary limit increases (single admin vs. two-person rule)?
6. **Utilization certificate format** `[M1-7]` — any statutory/CSR format the client requires, or pApAmA-branded standard format? (80G remains deferred per Q5.)
7. **Effort & milestone impact** — Revision 2 adds ~22 new tables and several new modules (capacity, ledgers, quality, emergency, CSR, analytics, public dashboard) to Phase 1. Confirm revised timeline/commercials with the client alongside this scope acceptance.

Still open from Revision 1: disaster-affected definition/proof (now more urgent given `[M2-9]`), email provider, payment provider.
