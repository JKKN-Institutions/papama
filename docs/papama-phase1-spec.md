# pApAmA — Phase 1 Specification

**Goal:** A working, demoable product on a **correct foundation** — the spine of pApAmA end-to-end — so you can show real progress to the client and collect the milestone payment **without building anything that has to be torn up in Phase 2.**
**Parent document:** `papama-spec-complete.md` (full requirement IDs, complete schema, full role matrix)
**Companion:** `papama-phase2-spec.md`

**Revision — June 2026 (client decisions folded in):** Confirmed decisions from the 20-question set are incorporated here and tagged inline as `[client Q#]` (full record: `papama-client-decisions.docx`; parent §12 shows which items are resolved). Changes: beneficiary categories +2 `[Q7]`; vendor fields +4 `[Q14]`; Special-Care post-delivery window ≤6 months `[Q10]`; email + WhatsApp channels confirmed `[Q4, Q3]`; donor dashboard additions `[Q20]`; Special-Care equivalent-item approval `[Q9]`; **80G receipts deferred** (data hooks added now) `[Q5]`.

---

## 1. Phase 1 Principle

> Phase the **build**, not the foundation.

Everything that touches the **data model** or the **core flows** is built (or at least designed-for) in Phase 1, because retrofitting those later means migrations and reopening working code. Genuinely modular, additive features are deferred to Phase 2.

---

## 2. The Demoable Slice (what the client will see)

A complete, working path:

```
Donor donates (app / web / QR, any amount)
   → donor credit accumulates → alert at ₹50 threshold → convert to token
   → token generated (Standard or Special Care) with secure QR
   → distributed (digital or printed QR; direct or via volunteer)
   → beneficiary shows token at an approved vendor → vendor app scans
   → validation passes (QR, geofence, 6 h cooldown, meal limit, face-hash)
   → food selected within token value → on-the-spot meal served
   → vendor uploads proof (plate photo + receipt) → payment lock releases
   → settlement runs on the vendor's chosen cycle (admin can override)
   → donor gets an alert + sees it on the dashboard (time, vendor, location)
```

If you can demo that loop, you have demonstrated the entire product thesis.

---

## 3. In Scope — Phase 1

Requirement IDs reference `papama-spec-complete.md`.

### 3.1 Foundation (must be correct now — deferring causes rework)
- **F-1 Token categories (two-tier).** Build `token_types` with **Standard** + **Special Care** (up to 2×, restricted to nutritious menu categories). Even if Special Care issuance is lightly exercised in the demo, the schema and redemption logic must support it now. A single standard Care-item list applies to all shops; shops may request approval for equivalent nutritious local alternatives. [client Q9] *(TOK-4)*
- **F-2 Configurable settlement model.** Build the **daily / twice-weekly / weekly** settlement engine with **admin override** and **payment lock**. Do **not** build instant settlement — it is the wrong model and would be ripped out. *(SET-1…4, PROOF-4)*
- **F-3 Proof of service + payment lock.** Vendor uploads plate photo + receipt; no proof → no payment. *(PROOF-1…4)*
- **F-4 Beneficiary registration & eligibility.** System-driven approval with document submission and auto-expiry (pregnancy/patient). Drives Special Care eligibility. Categories include **persons with disabilities** and **disaster-affected individuals** [client Q7]; pregnancy post-delivery window defaults to **up to 6 months**, admin-configurable [client Q10]. *(BEN-1…5)*
- **F-5 Aadhaar reconciliation.** Aadhaar **optional only, never mandatory**; **face-hash is primary**. `beneficiaries.aadhaar_hash` is nullable. *(SEC-1…4)*
- **F-6 "Donor credit", not "wallet".** Tables and UI use **credit** terminology. *(DON positioning)*
- **F-7 `system_config`.** All "e.g." values (token value, expiry, cooldown, meal limit, radius, co-pay max, settlement defaults) are admin-configurable rows, not constants. *(§4 of parent)*
- **F-8 i18n-ready.** Externalize all UI strings from day one so Phase 2 multi-language is additive, not a rewrite. *(I18N-1)*

### 3.2 Core Flows
- **Donor donation & credit** — any amount; UPI/QR/card/net-banking/bank transfer; donor portal (Android + iOS + web); **no-app QR/web donation**; non-withdrawable funds; threshold alert; convert or accumulate. *(DON-1…8)*
- **Token generation** — unique encrypted one-time QR; fixed value; no split/combine/partial; configurable expiry; auto-invalidate on expiry. *(TOK-1…6)*
- **Token distribution** — direct / network / volunteer / pApAmA-authorised; digital + printed QR; printed anti-copy & optional area-lock; courier for batches above threshold; scheduled occasion + 7-day reminder; multi-level authorisation. *(DIST-1…7)*
- **Redemption & validation** — menu within token value; QR + geofence + cooldown (6 h) + meal-limit + verification; value handling (pay difference / forfeit balance); optional ₹5 co-pay with ₹0 always available; on-the-spot food only; respectful multi-option fallback so no genuine beneficiary is denied. *(RED-1…7)*
- **Beneficiary verification & privacy** — temporary non-reversible face-hash; optional Aadhaar for immediate check only; offline photo captured and checked before vendor payment released. *(SEC-1…4)*
- **Vendor onboarding & management** — business info, shop photo, bank, KYC (+ **FSSAI licence, GST number, emergency contact, geo-location** [client Q14]); verification-pending checklist; menu/pricing admin approval (incl. approving **equivalent Special-Care items** [client Q9]); geofence; hygiene/quality ratings; suspension triggers + appeal. *(VEN-1…4)*
- **Vendor settlement engine** — configurable cycle, admin override, reconciliation. *(SET-1…4)*
- **Donor transparency** — redemption alert (in-app / SMS / **email** [client Q4]) with time/vendor/location + **meal & beneficiary category** [client Q20]; thank-you + re-donate link; dashboard of credit, tokens, history + **impact stats (total meals sponsored) & monthly summary** [client Q20]; forfeiture details hidden. *(TRANS-1…4)*
- **Admin module** — auth (role-based); vendor mgmt; token mgmt; beneficiary protection rules (one-per-window, 20 km radius, city lock, meal limit, cooldown); co-contribution config; fraud dashboard; reporting & exports. *(ADM)*
- **Security & fraud (core)** — encrypted one-time QR, auto-invalidation, anti-duplication, cloned/tampered rejection; geofencing; printed-token security; core AI fraud (beneficiary repeat via face-hash, vendor volume anomaly, token duplication, real-time flagging, auto temp-block). *(SEC-5…8, excluding GPS-spoofing & advanced behavioural analytics → P2)*
- **Audit & compliance** — immutable append-only `audit_logs`; CSR-compliant exportable reports. *(ADM reporting)*

---

## 4. Explicitly Deferred to Phase 2

These are **designed-for** (schema leaves room) but **not built** in Phase 1:

- Event-campaign QR donations (`EVT`)
- Micro-donation pooling & admin-assisted value completion (`POOL`)
- Lost-token & replacement workflow (`LOST`)
- Training & awareness module (`TRN`)
- Multi-language UI rollout (`I18N` — strings externalized now, translations later)
- GPS-spoofing detection & advanced behavioural/clustered-abuse analytics
- ~~WhatsApp/SMS channels~~ — **now confirmed and in scope** [client Q3]; per the MOU these are base-scope multi-channel delivery. SMS & email notifications ship in Phase 1 (see Donor transparency); WhatsApp interactions are within the contracted scope. (WhatsApp / SMS / email providers are client-procured.)

Deferring these is safe because none of them force a change to Phase 1 tables — they add new tables or layer on top.

---

## 5. Phase 1 Data Model

Build all tables marked **Phase 1** in `papama-spec-complete.md` §7:

`users`, `system_config`, `donors`, `donor_credits`, `credit_transactions`, `donations`, `payment_methods`, `token_types`, `tokens`, `token_batches`, `token_authorisations`, `token_distribution_records`, `scheduled_redemption_dates`, `beneficiaries`, `beneficiary_registrations`, `token_redemptions`, `redemption_cooldown_log`, `forfeited_balances`, `vendors`, `vendor_documents`, `vendor_menus`, `vendor_settlements`, `settlement_line_items`, `vendor_communication_history`, `vendor_escalations`, `volunteers`, `ngo_partners`, `audit_logs`, `notifications`, `fraud_flags`, `compliance_reports`.

**Design-for-Phase-2 (leave the seams, don't build the feature):**
- `tokens.replacement_for_token_id` (nullable) — for lost-token reissue
- `donations.event_campaign_id` (nullable) — for event campaigns
- `credit_transactions.transaction_type` includes `pooling_supplement`
- `fraud_flags.detection_method` enum includes `gps_integrity`, `pattern_analysis`
- `notifications.channel` enum includes `whatsapp`
- `donors.pan_number` (nullable) + `donations.financial_year` — seams for **deferred 80G receipts** (build hooks now, generate receipts after the entity has 80G registration) [client Q5]

---

## 6. Phase 1 Role Access Matrix

| Feature | Admin | Compliance | Vendor_Manager | Vendor | Volunteer | Donor | Beneficiary | Guest |
|---------|-------|-----------|----------------|--------|-----------|-------|-------------|-------|
| Donor Donation & Credit | CRUD | R | — | — | — | Own | — | Donate (QR/web) |
| Token Generation & Mgmt | CRUD | R | R | — | R | Own (CRU) | — | — |
| Token Distribution | CRUD | R | R | — | CR | CRU | — | — |
| Beneficiary Registration | CRUD | R | R | — | CR (assist) | — | Own | Self-register |
| Token Redemption | CRUD | R | R | CR (scan/proof) | R | — | Own | — |
| Vendor Management | CRUD | R | Approve/CRU | Own profile | R | — | — | — |
| Vendor Menu & Pricing | CRUD | R | Approve | Propose (Own) | — | — | — | — |
| Vendor Settlement | CRUD + Override | R | R | Own (view) | — | — | — | — |
| Proof of Service | R | R | R | C (Own) | — | — | — | — |
| Fraud Monitoring | CRUD | R | R | — | — | — | — | — |
| Audit & Reports | CRUD | R | — | — | — | — | — | — |

---

## 7. Phase 1 Configurable Defaults (`system_config`)

| Key | Default | Confirm? |
|-----|---------|----------|
| `standard_token_value` | ₹50 | |
| `special_care_multiplier` | 2× | |
| `special_care_post_delivery_months` | 6 | post-delivery eligibility window for pregnancy category [client Q10] |
| `token_expiry_days` | 90 | |
| `meal_cooldown_hours` | 6 | |
| `max_meals_per_day` | **2** | confirmed by client |
| `redemption_radius_km` | 20 | |
| `city_lock_enabled` | true | |
| `co_contribution_max` | ₹5 (₹0 always allowed) | |
| `courier_batch_min_value` | ₹5,000 | |
| `vendor_min_rating` | 3.5 | |
| `vendor_max_complaint_rate` | 5% | |

---

## 8. Phase 1 Build Checklist (5-layer per feature)

**Layer 1 — Types:** enums (token_type, beneficiary_category [incl. persons_with_disabilities, disaster_affected — client Q7], eligibility_status, settlement_cycle, payment_status, role, fraud detection_method); Zod schemas for donations, tokens, registrations, redemptions, settlements.

**Layer 2 — Database:** migrations for all Phase 1 tables; RLS per role (matrix §6); indexes (token_code, beneficiary face_hash, redemption datetime, vendor geofence, settlement period); reversible DOWN migrations; seed `system_config` and `token_types`.

**Layer 3 — Services:** Credit, Token, Distribution, BeneficiaryRegistration, Redemption (+ validation rules: QR, geofence, cooldown, meal-limit, value handling, co-pay), ProofOfService, VendorOnboarding, Settlement (+ payment lock + override + reconciliation), Notification, Audit, Fraud (core). Permission checks per role.

**Layer 4 — Hooks:** useQuery/useMutation per domain; error & loading states.

**Layer 5 — Pages:** Donor portal (donate, credit, tokens, history, dashboard) + no-app QR donation page; Vendor app (login, scan, validate, menu, proof upload, settlement view); Admin console (vendors, menus, tokens, beneficiary rules, settlements, fraud dashboard, reports); Volunteer (registration assist, distribution); mobile-responsive throughout.

---

## 9. Demo Script (for the client review / milestone)

1. Donor donates ₹30, then ₹20 → credit reaches ₹50 → alert → convert to a **Standard** token (show QR).
2. Show a **Special Care** token issued to a registered pregnant/patient beneficiary, restricted to nutritious menu items.
3. Distribute a token (digital QR + show a printed token with anti-copy QR).
4. Vendor app scans → validations run live (show a blocked second redemption within 6 h, and a geofence rejection).
5. Beneficiary picks a meal under token value → balance forfeited; then one over value → pays difference; show optional ₹5 co-pay with ₹0 default.
6. Vendor uploads plate photo + receipt → payment unlocks.
7. Run a settlement on the vendor's chosen cycle; show admin override (hold).
8. Donor receives the redemption alert + sees it on the dashboard (time, vendor, location) with thank-you + re-donate link.
9. Admin: show fraud dashboard, audit log (immutable), and an exportable CSR report.

---

## 10. Phase 1 Definition of Done

- The full demo script runs end-to-end on Android + iOS (vendor) and donor web/app.
- All Phase 1 tables migrated with RLS; `system_config` drives every configurable rule.
- Proof-gated payments and configurable settlement working with admin override.
- Aadhaar non-mandatory; face-hash verification working; privacy-safe (no permanent identity storage).
- Audit log immutable; CSR report exports.
- UI strings externalized (i18n-ready).
- `ASSUMPTIONS.md` lists anything decided in the absence of a client answer (see parent §12 — most items now **resolved** by client decisions; remaining open: disaster-affected definition/proof, email provider, payment provider).
