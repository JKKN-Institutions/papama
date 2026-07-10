# pApAmA — Developer TODO After Pull

**Date:** 2026-07-10
**Spec:** `docs/papama-phase1-spec-rev2.md`
**Tests:** 2,368 passing (0 failures)

---

## Step 1: Pull & Verify (5 min)

```bash
git pull origin main
npm install
npx vitest run
```

**Expected:** 2,368 tests, 0 failures.

Read these docs before starting:
- `docs/test-handover-report.md` — what changed and why
- `docs/feature-build-tracker.md` — 22 features categorized by build status
- `docs/papama-phase1-spec-rev2.md` — the spec (source of truth)

---

## Step 2: DONE — Wire Permissions Into Existing Routes

**Completed on 2026-07-10.** All 18 routes updated to use the correct spec §6 feature names in `defineRoute()`. No action needed.

---

## Step 3: Extend Partially Built Services (8 features — Medium effort)

These services exist but don't cover all spec requirements yet.

### Can build without client input (5 features)

| # | Feature | File | Spec Ref | What to Add |
|---|---------|------|----------|-------------|
| 11 | Settlement approval/hold | `lib/services/settlement.ts` | §3.1 F-2 [M2-4, M1-10] | See details below |
| 12 | Fraud — duplicate media | `lib/services/fraud.ts` | §3.1 F-3 [M1-10] | See details below |
| 13 | Proof — bill detection | `lib/services/proofIntegrity.ts` | §3.1 F-3 [M1-10] | See details below |
| 15 | Institution bulk | `lib/services/institution.ts` | §3.1 F-12 [M1-11] | See details below |
| 16 | Complaints/inspections | `lib/services/vendorRating.ts` | §3.3 [M1-9, M2-11] | See details below |

### Needs client input first (3 features)

| # | Feature | File | Open Question (spec §11.2) | What to ask client |
|---|---------|------|---------------------------|-------------------|
| 9 | Emergency/disaster mode | `lib/services/emergency.ts` | **§11.2 #5**: Emergency-mode authority | "Can one admin toggle emergency mode alone, or does it need a second admin to approve (two-person rule)?" |
| 10 | CSR module | `lib/services/csr.ts` | **§11.2 #6**: Utilization certificate format | "Is there a statutory/CSR format required for utilization certificates, or should we use a pApAmA-branded standard format?" |
| 14 | Credit/refund | `lib/services/creditRefund.ts` | **§11.2 #3**: Refund policy boundaries | "Please confirm: refunds apply ONLY to failed/duplicate payment-gateway cases, never voluntary withdrawal. Yes/No?" |

> **Note:** Features #9, #10, #14 can be built with a sensible default and the assumption noted in `ASSUMPTIONS.md`. But it's better to get client confirmation first since these affect money handling and emergency authority.

---

### Feature #11: Settlement Approval/Hold

**File:** `lib/services/settlement.ts`
**Spec:** §3.1 F-2 — "settlement approval step [M2-4]" + "settlement hold facility [M1-10]"
**Demo:** Step 8 — "run settlement → approval step → show admin hold and override"

**What exists:**
- `runSettlement()` — aggregates proof-released redemptions into vendor settlements
- `sampleSettlementsForAudit()` — random audit queue sampling
- Settlement statuses: `pending | locked | reconciled | paid` (+ new `approved | held`)

**What to build:**
- Add `approved` state between `locked` and `reconciled` in the lifecycle
- Add `held` as an override state (admin can hold any non-paid settlement)
- Compliance `approve` action — moves settlement from `locked` → `approved` (spec §6: compliance has R + Approve)
- Admin `hold` action — sets `on_hold: true`, blocks transition to `paid`
- Admin `release` action — clears `on_hold`, allows normal flow
- Admin `override` — can force any state transition (CRUD + Override capability)
- Audit trail for every state change

**Full lifecycle:**
```
pending → locked → approved → reconciled → paid
                ↕ (hold/release override at any point before paid)
              held
```

**Tables:** `vendor_settlements` (add `approval_status`, `hold_reason` columns if not present)
**Route:** PATCH `/api/admin/settlements` already handles `lock | unlock | reconcile | pay | hold | release` — add `approve` action

---

### Feature #12: Fraud — Duplicate Media Detection

**File:** `lib/services/fraud.ts`
**Spec:** §3.1 F-3 — "duplicate photo detection AND duplicate bill detection"
**Demo:** Step 7 — "re-upload same photo → duplicate detected & flagged"

**What exists:**
- `flagFraud()` — de-duplicated fraud flag insertion
- `scanVendorAnomalies()` — vendor volume anomaly detection
- `FRAUD_FLAG_TYPES` now includes `duplicate_media`

**What to build:**
- When a vendor uploads proof (plate photo + receipt), compute:
  - Photo perceptual hash (already exists in `proofIntegrity.ts`)
  - Bill fingerprint (new — see #13)
- Compare both against `media_fingerprints` table history
- If either matches within threshold → auto-create a `duplicate_media` fraud flag
- Flag severity: `high` (duplicate bill is likely intentional fraud)
- Link the flag to the redemption and vendor

**Tables:** `media_fingerprints` (does NOT exist yet — needs migration)
- Columns: `id`, `redemption_id`, `type` (photo | bill), `hash` (text), `created_at`

**Integration point:** Call from the proof upload route (`vendor/redemptions/[id]/proof/route.ts`) after saving the proof

---

### Feature #13: Proof — Bill Fingerprint Detection

**File:** `lib/services/proofIntegrity.ts`
**Spec:** §3.1 F-3 — "perceptual hash + bill fingerprint against history"

**What exists:**
- `computePhash()` — photo perceptual hash (16-char hex)
- `hammingDistanceHex()` — hamming distance comparison
- `findDuplicateProof()` — finds duplicates within threshold (photo only)

**What to build:**
- `computeBillFingerprint(billImageBytes)` — extract bill fingerprint (can reuse phash or use OCR-based text extraction + hash)
- `findDuplicateBill(fingerprint, supabase)` — compare against `media_fingerprints` table where `type = 'bill'`
- Update `findDuplicateProof()` to check BOTH photo AND bill
- Store both hashes in `media_fingerprints` after proof upload

**Tables:** Same `media_fingerprints` table as #12

---

### Feature #15: Institution Bulk — Redemption Tracking & Reporting

**File:** `lib/services/institution.ts`
**Spec:** §3.1 F-12 [M1-11]

**What exists:**
- `bulkAllocateToInstitution()` — RPC-based bulk token allocation
- `institutionRedemptionReport()` — basic institution-scoped analytics

**What to build:**
- Track redemptions per institution (which tokens from a bulk allocation were redeemed, when, by whom)
- Per-institution report: tokens allocated vs redeemed vs pending vs expired
- Meals served breakdown by category for the institution
- Route: GET `/api/admin/institutions/[id]/report` or extend existing

**Tables:** `institution_token_allocations` (exists), `token_redemptions` (join on allocated tokens)

---

### Feature #16: Complaints & Inspections

**File:** `lib/services/vendorRating.ts` (extend) or new `lib/services/complaints.ts`
**Spec:** §3.3 [M1-9, M2-11]
**Demo:** Step 12 — "beneficiary submits meal rating + complaint → admin triages"

**What exists:**
- `recordFeedback()` — feedback insertion
- `recomputeQualityScore()` — quality score computation
- `autoSuspendBelowThreshold()` — auto-suspend logic
- `COMPLAINT_STATUSES` enum: `open | investigating | resolved | dismissed`

**What to build:**
- **Complaint triage lifecycle:** when feedback is flagged `is_complaint: true`:
  - Status starts at `open`
  - Admin moves to `investigating` (assigns to staff)
  - Resolves as `resolved` or `dismissed`
  - Each transition writes audit log
- **Surprise inspection records:**
  - Insert inspection with outcome (pass/fail/conditional)
  - Failed inspection impacts vendor quality score
  - Inspection history viewable per vendor
- **Suspension triggers (spec §7):**
  - Rating < 3.5 (`vendor_min_rating`) → auto-suspend
  - Complaint rate > 5% (`vendor_max_complaint_rate` = 0.05) → auto-suspend
  - Failed inspection → manual suspension review

**Tables:** `vendor_feedback` (exists, has `is_complaint` + `complaint_status`), `vendor_inspections` (may need to verify if exists)
**Routes:** PATCH `/api/admin/complaints` already exists — verify it handles the lifecycle

---

### Feature #9: Emergency/Disaster Mode (NEEDS CLIENT INPUT)

**File:** `lib/services/emergency.ts`
**Spec:** §3.3 [M1-8, M2-9]
**Demo:** Step 11
**Open question:** §11.2 #5 — single admin or two-person rule for activation?

**What exists:**
- `issueEmergencyToken()` — mint emergency relief tokens
- `emergencySerial()` — serial number generation

**What to build (once client confirms authority model):**
- **Emergency campaign creation** — create a `campaigns` row with type `emergency`, name, duration
- **Toggle emergency mode** — set `emergency_mode_enabled: true` in system_config (audited)
- **Temporary vendor onboarding** — fast-track approval with time-boxed expiry (auto-revert to pending)
- **Rapid beneficiary registration** — relaxed document requirements when `disaster_affected` category
- **Temporary config overrides** — raise `max_meals_per_day`, lower `meal_cooldown_hours` via `emergency_overrides` table (does NOT exist yet — needs migration)
- **Auto-revert** — after `emergency_mode_max_duration_days` (30 days), all overrides revert automatically
- Full audit trail for every emergency action

**Tables:** `campaigns` (exists), `emergency_overrides` (does NOT exist — needs migration)
**Default assumption if no client answer:** Single admin can toggle (log in ASSUMPTIONS.md)

---

### Feature #10: CSR Module (NEEDS CLIENT INPUT)

**File:** `lib/services/csr.ts`
**Spec:** §3.3 [M1-7, M2-7]
**Demo:** Step 13 — "CSR utilization certificate download"
**Open question:** §11.2 #6 — certificate format (statutory vs pApAmA-branded)?

**What exists:**
- `generateCsrReport()` — aggregates corporate donor donations by company/campaign/FY
- `csr80gCertificatesEnabled()` — feature flag (returns false — 80G deferred)

**What to build (once client confirms format):**
- **Utilization certificate generation** — PDF with donation summary, meals funded, impact stats
- **Impact reports** — meals funded, meals served, beneficiary categories served, city-wise impact
- **Annual donation statements** — per-year summary for corporate donors
- **Download route** — GET `/api/admin/csr/certificate/[id]` returns PDF

**Tables:** `csr_certificates` (does NOT exist — needs migration)
**Default assumption if no client answer:** pApAmA-branded standard format (log in ASSUMPTIONS.md)

---

### Feature #14: Credit/Refund (NEEDS CLIENT INPUT)

**File:** `lib/services/creditRefund.ts`
**Spec:** §3.1 F-10 [M2-4]
**Open question:** §11.2 #3 — confirm refunds are ONLY for failed/duplicate payments

**What exists:**
- `refundCredit()` — internal credit reversal (compare-and-swap)

**What to build (once client confirms policy):**
- **Failed-payment handling** — capture failed payments in `payment_failures` table (does NOT exist — needs migration)
- **Retry state management** — track retry attempts, max retries
- **Policy-gated refund workflow:**
  - Only for failed or duplicate payment-gateway cases
  - Never for voluntary withdrawal (donations are non-withdrawable per spec §3.2)
  - Refund request → admin review → approve/reject → credit reversal
  - Audit trail for every refund decision
- **Ledger posting** — refund posts a reversal entry to the donation ledger (ties into #18 Financial Ledgers)

**Tables:** `payment_failures` (does NOT exist), `refunds` (does NOT exist — both need migration)
**Default assumption if no client answer:** Refunds only for failed/duplicate payments (log in ASSUMPTIONS.md)

---

## Step 4: Build Net-New Services (6 features — High effort)

### Can build without client input (5 features)

| # | Feature | Spec Ref | New File(s) | Details below |
|---|---------|----------|-------------|---------------|
| 17 | Lost-token workflow | §3.2 [M2-5] | Extend token service | Yes |
| 18 | Financial ledgers | §3.1 F-10 [M1-12] | `lib/services/ledger.ts` (new) | Yes |
| 21 | Multi-level cooldown | §3.1 F-9 | Extend `lib/services/redemption.ts` | Yes |
| 22 | Token revalidation | §3.2 [M2-5] | Extend token service | Yes |
| 20 | Refund workflow | [M2-4] | `lib/services/refund.ts` (new) | Depends on #14 client answer |

### Needs client input first (1 feature)

| # | Feature | Open Question | What to ask client |
|---|---------|--------------|-------------------|
| 19 | Document management | Email provider unresolved (spec §11.2) | "Which email provider should we use for FSSAI expiry alerts — SendGrid, AWS SES, or client-procured?" |

---

### Feature #17: Lost-Token Workflow

**Spec:** §3.2 [M2-5] — "Moved from Phase 2 into Phase 1"
**Demo:** Step 10 — "report a token lost → old QR blocked instantly → replacement issued and redeemed"

**What to build:**
1. **Report loss endpoint** — beneficiary or distributor reports a token as lost
2. **Block instantly** — set old token `status` to `blocked` (new enum value, already added)
3. **Issue replacement** — mint a new token with same value, set `replacement_for_token_id` pointing to the blocked token (column already added to factory)
4. **Audit trail** — log: who reported, when, old token ID, new token ID, reason
5. **The old QR is permanently invalid** — redemption engine already rejects non-live/distributed tokens

**Tables:** `tokens` (existing — uses `blocked` status + `replacement_for_token_id` column)
**Route:** POST `/api/tokens/[id]/report-loss` or similar (new route)
**No migration needed** — `blocked` status and `replacement_for_token_id` column should already be in the tokens table (verify; if not, add migration)

---

### Feature #18: Financial Ledgers

**Spec:** §3.1 F-10 [M1-12] — "Every rupee must be traceable"
**Demo:** Step 8 — "open the ledgers and trace one rupee end-to-end (donation → payable → settled)"

**What to build:**
1. **Ledger service** (`lib/services/ledger.ts` — new file):
   - `postLedgerEntry(ledger, amount, reference_type, reference_id, description)`
   - `getLedgerBalance(ledger)` — sum of all entries for a ledger
   - `getLedgerEntriesForReference(reference_type, reference_id)` — trace one transaction
   - `reconcileLedgers()` — verify donation = vendor_payable + revenue (every rupee accounted)
2. **Three ledgers** (spec §3.1 F-10):
   - `donation` — credits when donor donates
   - `vendor_payable` — credits when redemption is proof-verified
   - `revenue` — platform fee / forfeited balances
3. **Integration points** — post entries from:
   - Donation creation → `donation` ledger
   - Proof approval → `vendor_payable` ledger
   - Settlement payout → `vendor_payable` debit
   - Forfeited balance → `revenue` ledger
   - Refund → `donation` ledger reversal

**Tables:** `ledger_entries` (does NOT exist — needs migration)
- Columns: `id`, `ledger` (donation | vendor_payable | revenue), `amount` (integer, positive=credit, negative=debit), `reference_type`, `reference_id`, `description`, `created_at`
**Route:** GET `/api/admin/ledgers` (new route)

---

### Feature #19: Document Management (NEEDS CLIENT INPUT)

**Spec:** [M2-13]
**Open question:** Email provider for FSSAI expiry alerts is unresolved

**What to build:**
1. **Document store service** (`lib/services/documents.ts` — new file):
   - `uploadDocument(entity_type, entity_id, document_type, file_url, expires_at)`
   - `getDocuments(entity_type, entity_id)` — list docs for a vendor/beneficiary
   - `getExpiringDocuments(days_ahead)` — find docs expiring within N days
2. **Document types:** KYC documents, FSSAI licences, vendor agreements, audit records
3. **Expiry tracking:** check `expires_at`, send alerts when approaching expiry
4. **Role-restricted access:** vendors see own docs, admin sees all, beneficiaries see own
5. **Versioning:** new upload for same document_type creates a new version, old version kept

**Tables:** `documents` (does NOT exist — needs migration)
- Columns: `id`, `entity_type` (vendor | beneficiary), `entity_id`, `document_type` (fssai_license | kyc | vendor_agreement | audit_record), `file_url`, `version`, `expires_at`, `uploaded_at`, `uploaded_by`
**Route:** GET/POST `/api/vendor/documents` (exists), GET `/api/admin/vendors/[id]/documents` (exists)
**Blocker:** Expiry alert emails need an email provider — ask client which one

---

### Feature #20: Refund Workflow

**Spec:** [M2-4]
**Depends on:** Feature #14 client answer (refund policy confirmation)

**What to build:**
1. **Failed-payment capture** — when payment gateway returns failure:
   - Insert into `payment_failures` table: payment_ref, donor_id, amount, error_code, retry_count
   - Auto-retry up to max_retries (configurable)
2. **Refund request** — donor or admin initiates refund for a failed/duplicate payment:
   - Insert into `refunds` table: donor_id, amount, reason, status (pending)
   - Admin reviews → approve or reject
   - On approve: credit reversal via `refundCredit()` + ledger posting
3. **Policy gate:** reject refund requests that aren't for failed/duplicate payments

**Tables:** `payment_failures` (does NOT exist), `refunds` (does NOT exist — both need migration)
**Route:** POST `/api/donor/refund-request` (new), PATCH `/api/admin/refunds/[id]` (new)

---

### Feature #21: Multi-Level Cooldown

**Spec:** §3.1 F-9 — "multi-level: global → category → emergency override"

**What to build:**
1. Extend `validateRedemption()` in `lib/services/redemption.ts`:
   - Currently reads only `meal_cooldown_hours` (global)
   - Add: check `meal_cooldown_hours_<category>` override (e.g., `meal_cooldown_hours_pregnant_women`)
   - Add: check `emergency_meal_cooldown_hours` when `emergency_mode_enabled: true`
   - Resolution order: emergency > category > global (most specific wins)
2. Update `system_config` seed to include category-level cooldown keys

**Tables:** `system_config` (existing — add category-level keys)
**No new migration needed** — just config rows

---

### Feature #22: Token Revalidation

**Spec:** §3.2 [M2-5] — "admin may revalidate/extend per policy (audited action)"

**What to build:**
1. **Revalidation service:**
   - Admin selects an `expired` token
   - Check `token_revalidation_allowed` config (already exists, default `true`)
   - Extend `expires_at` by `token_expiry_days` from now
   - Change status from `expired` back to `live` (or `distributed` if it was distributed)
   - Full audit trail: admin ID, token ID, old expiry, new expiry, reason
2. **Guards:**
   - Only `expired` tokens can be revalidated (not `redeemed` or `blocked`)
   - Only admin role (CRUD on `token_generation`)
   - Revalidation is blocked if `token_revalidation_allowed: false`

**Tables:** `tokens` (existing)
**Route:** POST `/api/admin/tokens/[id]/revalidate` (new route)

---

## Suggested Build Sequence

```
PHASE A — No client input needed (start immediately):
  #11 Settlement approval/hold
  #12 Fraud duplicate media + #13 Proof bill detection (together)
  #15 Institution bulk tracking
  #16 Complaints/inspections
  #17 Lost-token workflow
  #18 Financial ledgers
  #21 Multi-level cooldown
  #22 Token revalidation

PHASE B — After client answers 4 questions:
  #9  Emergency mode (after authority model confirmed)
  #10 CSR module (after certificate format confirmed)
  #14 Credit/refund (after refund policy confirmed)
  #19 Document management (after email provider confirmed)
  #20 Refund workflow (after #14 confirmed)
```

After each feature, run `npx vitest run` to ensure nothing breaks.

---

## Tables That Need Migration (8 missing tables)

These tables are referenced in the spec but don't exist in the DB yet:

| Table | Needed by Feature(s) | Spec Ref |
|-------|---------------------|----------|
| `vendor_capacity` | #15 Vendor capacity (Step 2 — already wired) | [M1-4] |
| `emergency_overrides` | #9 Emergency mode | [M1-8, M2-9] |
| `volunteer_activities` | #19 Volunteer management (Step 2 — already wired) | [M1-13] |
| `complaints` | #16 Complaints (or use vendor_feedback.is_complaint) | [M2-11] |
| `documents` | #19 Document management | [M2-13] |
| `ledger_entries` | #18 Financial ledgers | [M1-12] |
| `media_fingerprints` | #12-13 Duplicate media/bill detection | [M1-10] |
| `geo_units` | Geographic hierarchy (already wired, operational) | [M2-12] |

Create reversible migrations with DOWN scripts before applying.

---

## Open Questions for Client (spec §11.2)

| # | Question | Affects Feature | Suggested Default |
|---|----------|----------------|-------------------|
| 1 | Snacks meal window — define time or disable at launch? | Meal windows | Disable at launch |
| 2 | Multi-vendor same-day — allowed within daily limit? | Redemption | Yes, allowed (config: `multi_vendor_same_day: true`) |
| 3 | Refund policy — ONLY for failed/duplicate payments? | #14 Credit/refund, #20 Refund workflow | Yes, only failed/duplicate |
| 4 | Audit retention — 8 years legally required? | Audit logs | 8 years (2920 days) |
| 5 | Emergency-mode authority — single admin or two-person? | #9 Emergency mode | Single admin |
| 6 | Utilization certificate format — statutory or branded? | #10 CSR module | pApAmA-branded |
| 7 | Disaster-affected definition/proof requirements? | Beneficiary registration | Relaxed docs (ASSUMPTIONS.md) |
| 8 | Email provider for notifications/alerts? | #19 Document management, notifications | Client-procured |
| 9 | Payment provider for donations? | Payment routes | Placeholder (ASSUMPTIONS.md) |

---

## Reference Files

| File | Purpose |
|------|---------|
| `docs/papama-phase1-spec-rev2.md` | The spec — source of truth for all rules |
| `docs/test-handover-report.md` | What was tested, what was fixed, config corrections |
| `docs/feature-build-tracker.md` | 22 features categorized: built / partial / net-new |
| `lib/permissions/matrix.ts` | 24-feature permission matrix (complete) |
| `lib/types/enums.ts` | All enum types including new values |
| `test/` | 2,368 spec-driven tests (run with `npx vitest run`) |
