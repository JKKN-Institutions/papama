/**
 * pApAmA — Phase 1 Types Layer (T1): Enums
 *
 * Single source of truth for every Postgres `enum` type Developer 2 owns.
 * Each enum is declared as an `as const` value array (so Zod can build a
 * matching `z.enum(...)` from it — see `lib/validation/enums.ts`) plus a
 * derived TypeScript union type.
 *
 * Rules honored here:
 *  - Values are `snake_case` to match the intended Postgres column/enum values.
 *  - Phase-2 values are included as **seams only** (designed-for, not built) and
 *    are tagged `// P2 seam`.
 *  - OPEN items (ASSUMPTIONS.md) are tagged `// OPEN` — no values invented for
 *    their *rules*; the category/label may exist but its behaviour is a
 *    placeholder resolved later.
 *  - These enums describe Developer-2 tables ONLY. They are NOT applied to
 *    Developer-1's existing 12 tables (off-limits). Where a name overlaps
 *    (e.g. token status), that is flagged as the Section-A collision decision
 *    and is intentionally NOT reconciled into their tables.
 */

// --- helpers ---------------------------------------------------------------

/** Derive a string-union type from an `as const` value array. */
export type ValueOf<T extends readonly string[]> = T[number];

// --- identity & access -----------------------------------------------------

/** Application roles. Mirrors the Role Access Matrix (spec §6). */
export const USER_ROLES = [
    "admin",
    "compliance",
    "vendor_manager",
    "vendor",
    "volunteer",
    "donor",
    "beneficiary",
    "guest",
] as const;
export type UserRole = ValueOf<typeof USER_ROLES>;

// --- tokens ----------------------------------------------------------------

/** Two-tier token categories (F-1). */
export const TOKEN_TYPES = ["standard", "special_care"] as const;
export type TokenType = ValueOf<typeof TOKEN_TYPES>;

/**
 * Token lifecycle states — authoritative per docs/token-flow.md §6.
 * NOTE (Section A): Developer-1's existing `tokens.status` uses a different
 * value set (`unused|redeemed|expired|cancelled`). This enum is for Developer-2
 * tokens only and is NOT migrated into their table. Reconciliation is a mentor
 * decision, not encoded here.
 */
export const TOKEN_STATUSES = [
    "generated", // transient: minted, before the donor picks a path
    "live", // Path A: donor-held, redeemable
    "in_admin_pool", // Path B: authorized to pApAmA
    "assigned_to_volunteer", // allocated, not yet distributed
    "distributed", // out in the world via volunteer
    "redeemed", // terminal: consumed at vendor
    "expired", // terminal: auto-invalidated at expiry
] as const;
export type TokenStatus = ValueOf<typeof TOKEN_STATUSES>;

/** Hand-off channel logged on every distribution record (token-flow §7). */
export const DISTRIBUTION_CHANNELS = [
    "donor_self", // Path A
    "admin_to_volunteer", // 3a
    "volunteer_request_grant", // 3b
    "volunteer_to_beneficiary", // §4
    "admin_revoke", // reverse of 3a/3b: admin reclaims a held token back to the pool
] as const;
export type DistributionChannel = ValueOf<typeof DISTRIBUTION_CHANNELS>;

/** Admin decision lifecycle for a volunteer's token request (token-flow §3b). */
export const VOLUNTEER_REQUEST_STATUSES = [
    "pending",
    "granted",
    "partially_granted",
    "denied",
] as const;
export type VolunteerRequestStatus = ValueOf<typeof VOLUNTEER_REQUEST_STATUSES>;

// --- credit & donations ----------------------------------------------------

/**
 * Credit ledger movement type.
 * `token_conversion` is the DEBIT written when a donor mints a token from credit
 * (negative amount; distinct from `donation`/`purchase` inflows).
 * `pooling_supplement` is a // P2 seam (micro-donation pooling, spec §5).
 */
export const CREDIT_TRANSACTION_TYPES = [
    "purchase",
    "donation",
    "token_conversion",
    "pooling_supplement", // P2 seam
] as const;
export type CreditTransactionType = ValueOf<typeof CREDIT_TRANSACTION_TYPES>;

/** Donation processing status (for request/response validation). */
export const DONATION_STATUSES = ["pending", "completed", "failed"] as const;
export type DonationStatus = ValueOf<typeof DONATION_STATUSES>;

// --- beneficiaries ---------------------------------------------------------

/**
 * Beneficiary categories. Values follow the Developer-2 CONTRACT (authoritative
 * for the API seam): `pregnant_women | patient | disability | disaster_affected`.
 * `disaster_affected` exists as a label but its proof/eligibility RULES are
 * // OPEN (ASSUMPTIONS.md, client Q7) — not invented here.
 */
export const BENEFICIARY_CATEGORIES = [
    "pregnant_women",
    "patient",
    "disability",
    "disaster_affected", // OPEN: proof/eligibility rules unresolved
] as const;
export type BeneficiaryCategory = ValueOf<typeof BENEFICIARY_CATEGORIES>;

/** Result of eligibility verification (contract §6). */
export const ELIGIBILITY_STATUSES = ["pending", "verified", "failed"] as const;
export type EligibilityStatus = ValueOf<typeof ELIGIBILITY_STATUSES>;

/** Registration approval lifecycle (contract §6). */
export const REGISTRATION_STATUSES = ["pending", "approved", "rejected"] as const;
export type RegistrationStatus = ValueOf<typeof REGISTRATION_STATUSES>;

/**
 * Record state of an approved beneficiary (owner §4.6 suspend/block controls).
 * `active` = redeemable; `suspended` = temporary admin hold; `blocked` = permanent.
 */
export const BENEFICIARY_STATUSES = ["active", "suspended", "blocked"] as const;
export type BeneficiaryStatus = ValueOf<typeof BENEFICIARY_STATUSES>;

// --- vendors ---------------------------------------------------------------

/** Vendor approval lifecycle (contract §4). */
export const VENDOR_STATUSES = ["pending", "approved", "suspended", "rejected"] as const;
export type VendorStatus = ValueOf<typeof VENDOR_STATUSES>;

/** KYC verification result (contract §4). */
export const KYC_STATUSES = ["pending", "verified", "failed"] as const;
export type KycStatus = ValueOf<typeof KYC_STATUSES>;

/**
 * Vendor escalation / appeal thread lifecycle (contract §4 "Vendor suspension /
 * Vendor appeals"). Tracks a support/dispute ticket raised against or by a vendor.
 */
export const ESCALATION_STATUSES = ["open", "in_progress", "resolved", "closed"] as const;
export type EscalationStatus = ValueOf<typeof ESCALATION_STATUSES>;

// --- settlement & payment --------------------------------------------------

/** Configurable settlement cycles (F-2). No instant settlement by design. */
export const SETTLEMENT_CYCLES = ["daily", "twice_weekly", "weekly"] as const;
export type SettlementCycle = ValueOf<typeof SETTLEMENT_CYCLES>;

/** Settlement record lifecycle (contract §8). */
export const SETTLEMENT_STATUSES = ["pending", "locked", "reconciled", "paid"] as const;
export type SettlementStatus = ValueOf<typeof SETTLEMENT_STATUSES>;

/**
 * Per-redemption payment-lock state (owner §4.8 "Payment Lock Mechanism").
 * Locked until proof + validation; released on verification; `held` = admin
 * override hold. Distinct from SETTLEMENT_STATUSES (which is the payout cycle).
 */
export const PAYMENT_STATUSES = ["locked", "released", "held", "failed"] as const;
export type PaymentStatus = ValueOf<typeof PAYMENT_STATUSES>;

/**
 * Admin review state of a redemption's uploaded proof-of-service. Distinct from
 * PAYMENT_STATUSES: the vendor's upload sets `submitted` while payment stays
 * `locked`; an admin `approve` releases the payment, a `reject` keeps it locked
 * and the vendor may re-upload. `null` (no value) = proof not yet submitted.
 */
export const PROOF_STATUSES = ["submitted", "approved", "rejected"] as const;
export type ProofStatus = ValueOf<typeof PROOF_STATUSES>;

// --- fraud -----------------------------------------------------------------

/** Fraud flag categories (contract §9). */
export const FRAUD_FLAG_TYPES = [
    "duplicate_token",
    "cloned_qr",
    "tampered_qr",
    "beneficiary_duplicate",
    "vendor_anomaly",
] as const;
export type FraudFlagType = ValueOf<typeof FRAUD_FLAG_TYPES>;

/** Fraud flag severity (contract §9). */
export const FRAUD_SEVERITIES = ["low", "medium", "high"] as const;
export type FraudSeverity = ValueOf<typeof FRAUD_SEVERITIES>;

/** Fraud flag review lifecycle (contract §9). */
export const FRAUD_STATUSES = ["open", "resolved", "dismissed"] as const;
export type FraudStatus = ValueOf<typeof FRAUD_STATUSES>;

/**
 * How a fraud signal was detected. Core Phase-1 methods plus // P2 seams
 * (`gps_integrity`, `pattern_analysis` — spec §5, deferred analytics).
 */
export const FRAUD_DETECTION_METHODS = [
    "face_hash_repeat",
    "vendor_volume_anomaly",
    "token_duplication",
    "cloned_qr",
    "tampered_qr",
    "geofence_violation",
    "gps_integrity", // P2 seam
    "pattern_analysis", // P2 seam
] as const;
export type FraudDetectionMethod = ValueOf<typeof FRAUD_DETECTION_METHODS>;

// --- notifications ---------------------------------------------------------

/**
 * Delivery channels (spec §5 / client Q3, Q4). `whatsapp` is a // P2 seam value
 * (interaction deferred; SMS + email ship in Phase 1).
 */
export const NOTIFICATION_CHANNELS = [
    "in_app",
    "sms",
    "email",
    "whatsapp", // P2 seam
] as const;
export type NotificationChannel = ValueOf<typeof NOTIFICATION_CHANNELS>;

/** Read state for a notification. */
export const NOTIFICATION_STATUSES = ["unread", "read"] as const;
export type NotificationStatus = ValueOf<typeof NOTIFICATION_STATUSES>;

// --- reports & compliance --------------------------------------------------

/**
 * Generated report categories (contract §10 "Reports & Compliance"). Drives the
 * report generator + export routes; `audit` exports the append-only audit trail.
 */
export const REPORT_TYPES = [
    "csr",
    "donation",
    "redemption",
    "settlement",
    "compliance",
    "audit",
] as const;
export type ReportType = ValueOf<typeof REPORT_TYPES>;

// --- meals & volunteer activity (Phase-1 addon) ----------------------------

/**
 * Meal slots a vendor/redemption can be bound to (addon #1 meal windows).
 * Drives the configurable per-slot serving windows enforced at redemption when
 * `meal_window_enforcement_enabled` is on.
 */
export const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;
export type MealType = ValueOf<typeof MEAL_TYPES>;

/**
 * Volunteer field-activity categories logged for zones/activity tracking
 * (addon #13). Each row records a discrete on-ground action by a volunteer.
 */
export const VOLUNTEER_ACTIVITY_TYPES = [
    "token_distributed",
    "registration_assisted",
] as const;
export type VolunteerActivityType = ValueOf<typeof VOLUNTEER_ACTIVITY_TYPES>;
