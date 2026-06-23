/**
 * pApAmA — Phase 1 Types Layer (T2): Zod request/response schemas
 *
 * Mirrors the DB shape and the response shapes in
 * docs/CONTRACT_Developer_2_Admin_Backend_Module.md (authoritative for the
 * API seam Developer 1 binds to). Field names are `snake_case` to match the
 * Supabase columns and the contract exactly.
 *
 * Scope note: these are TYPES ONLY (no DB, no I/O). Schemas whose backing table
 * collides with Developer-1's existing tables (donations, credits, tokens) are
 * tagged `// Section A` — their *route wiring* waits on the mentor's collision
 * decision, but the validators are safe to define now.
 *
 * Requires the `zod` package (`npm install zod`).
 */

import { z } from "zod";

import {
    beneficiaryCategorySchema,
    beneficiaryStatusSchema,
    donationStatusSchema,
    eligibilityStatusSchema,
    escalationStatusSchema,
    fraudDetectionMethodSchema,
    fraudFlagTypeSchema,
    fraudSeveritySchema,
    fraudStatusSchema,
    kycStatusSchema,
    registrationStatusSchema,
    reportTypeSchema,
    settlementCycleSchema,
    settlementStatusSchema,
    tokenStatusSchema,
    tokenTypeSchema,
    userRoleSchema,
    vendorStatusSchema,
    volunteerRequestStatusSchema,
} from "@/lib/validation/enums";

// --- shared primitives -----------------------------------------------------

/** Positive INR amount in whole rupees (Phase-1 columns are int4). */
export const inrAmountSchema = z.number().int().nonnegative();

/** Geo point as stored in `vendors.geo` (jsonb). */
export const geoPointSchema = z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
});

/** ISO-8601 timestamp string as returned by route handlers. */
export const isoTimestampSchema = z.string().datetime({ offset: true });

// ===========================================================================
// Donor contract (consumed by Developer 1) — Section A gated for wiring
// ===========================================================================

/** POST /api/donations/create — request. // Section A (touches donations/credit) */
export const donationCreateRequestSchema = z.object({
    token_type_id: z.string().min(1),
    // Any amount, including micro-donations below token value (owner §2.1).
    fiat_amount: inrAmountSchema.positive(),
    payment_method_id: z.string().min(1).optional(),
});
export type DonationCreateRequest = z.infer<typeof donationCreateRequestSchema>;

/** POST /api/donations/create — response. */
export const donationResponseSchema = z.object({
    donation_id: z.string(),
    status: donationStatusSchema,
    token_amount: inrAmountSchema,
    fiat_amount: inrAmountSchema,
    credit_balance: inrAmountSchema,
});
export type DonationResponse = z.infer<typeof donationResponseSchema>;

/** GET /api/donor/credits — response (shape per contract Route Handler example). */
export const creditsResponseSchema = z.object({
    credit_balance: inrAmountSchema,
    threshold: inrAmountSchema,
    threshold_reached: z.boolean(),
    withdrawable: z.literal(false), // funds are never withdrawable
    transactions: z.array(
        z.object({
            id: z.string(),
            amount: z.number().int(),
            type: z.string(),
            description: z.string(),
            timestamp: isoTimestampSchema,
        })
    ),
});
export type CreditsResponse = z.infer<typeof creditsResponseSchema>;

/**
 * POST /api/tokens/convert — request. // Section A (touches tokens)
 * Donor mints ONE token of a chosen amount; constrained server-side to
 * standard_token_value <= amount <= available credit (token-flow §1).
 */
export const tokenConvertRequestSchema = z.object({
    token_type_id: z.string().min(1),
    amount: inrAmountSchema.positive(),
    // Path choice immediately after mint (token-flow §2).
    distribution_path: z.enum(["use_now", "authorize_papama"]),
});
export type TokenConvertRequest = z.infer<typeof tokenConvertRequestSchema>;

/** A token as returned to the donor (GET /api/donor/tokens). */
export const tokenResponseSchema = z.object({
    token_id: z.string(),
    serial_number: z.string(),
    token_type: tokenTypeSchema,
    status: tokenStatusSchema,
    value: inrAmountSchema,
    qr_payload: z.string(), // stable signed payload consumed by Developer 1
    expires_at: isoTimestampSchema.nullable(),
});
export type TokenResponse = z.infer<typeof tokenResponseSchema>;

// ===========================================================================
// Beneficiary registration (BEN-1…5) — net-new, no collision
// ===========================================================================

/**
 * Beneficiary self/assisted registration request.
 * Aadhaar is OPTIONAL, never mandatory (F-5); face-hash is primary.
 * Document requirements for `disaster_affected` are // OPEN (client Q7).
 */
export const beneficiaryRegistrationRequestSchema = z.object({
    full_name: z.string().min(1),
    category: beneficiaryCategorySchema,
    face_hash: z.string().min(1), // primary identity signal
    aadhaar_hash: z.string().min(1).nullable().optional(), // optional only
    // Supporting docs (medical cert / antenatal card / hospital ref) as
    // storage references; presence rules are category-driven in the service.
    document_refs: z.array(z.string()).default([]),
    location_hint: z.string().optional(),
});
export type BeneficiaryRegistrationRequest = z.infer<typeof beneficiaryRegistrationRequestSchema>;

/**
 * GET /api/admin/beneficiaries — approved-beneficiary registry item.
 * Backed by the `beneficiaries` table, so `status` is the record-state enum
 * (active|suspended|blocked), NOT the registration_status used by the separate
 * `beneficiary_registrations` review queue. Privacy-first: identity columns are
 * exposed only as booleans (`aadhaar_linked`, `face_hash_valid`), never raw hashes.
 */
export const beneficiaryResponseSchema = z.object({
    beneficiary_id: z.string(),
    category: beneficiaryCategorySchema,
    status: beneficiaryStatusSchema,
    eligibility: eligibilityStatusSchema,
    aadhaar_linked: z.boolean(),
    face_hash_valid: z.boolean(),
    registered_at: isoTimestampSchema,
});
export type BeneficiaryResponse = z.infer<typeof beneficiaryResponseSchema>;

/**
 * PATCH /api/admin/beneficiaries — admin record-state control (owner §4.6).
 * `suspend` = temporary hold, `activate` = lift the hold, `block` = permanent
 * stop. Operates on the `beneficiaries.status` enum (active|suspended|blocked).
 * `reason` is recorded in the audit trail.
 */
export const beneficiaryActionSchema = z.enum(["suspend", "activate", "block"]);
export type BeneficiaryAction = z.infer<typeof beneficiaryActionSchema>;

export const beneficiaryActionRequestSchema = z.object({
    beneficiary_id: z.string().uuid(),
    action: beneficiaryActionSchema,
    reason: z.string().trim().max(500).optional(),
});
export type BeneficiaryActionRequest = z.infer<typeof beneficiaryActionRequestSchema>;

// ===========================================================================
// Redemption & validation (RED-1…7, owner §4.4–4.6) — net-new
// ===========================================================================

/**
 * Redemption attempt initiated by a vendor scan. Validation (QR, geofence,
 * cooldown, meal-limit, face-hash) runs server-side; this is just the input.
 * co_contribution is OPTIONAL and capped at system_config.co_contribution_max;
 * ₹0 must always be allowed (owner §4.4).
 */
export const redemptionRequestSchema = z.object({
    qr_payload: z.string().min(1),
    vendor_id: z.string().min(1),
    selected_items: z
        .array(z.object({ menu_item_id: z.string(), price: inrAmountSchema }))
        .min(1),
    beneficiary_face_hash: z.string().min(1),
    geo: geoPointSchema,
    co_contribution: inrAmountSchema.default(0), // 0 always valid
});
export type RedemptionRequest = z.infer<typeof redemptionRequestSchema>;

/**
 * Redemption history entry — the shape the donor dashboard + notifications use
 * (contract §7: vendor_name, location, time, meal_info, beneficiary_category).
 */
export const redemptionHistoryEntrySchema = z.object({
    redemption_id: z.string(),
    token_id: z.string(),
    vendor_name: z.string(),
    location: z.string(),
    time: isoTimestampSchema,
    meal_info: z.string(),
    beneficiary_category: beneficiaryCategorySchema,
});
export type RedemptionHistoryEntry = z.infer<typeof redemptionHistoryEntrySchema>;

// ===========================================================================
// Vendor management (contract §4) — net-new
// ===========================================================================

/**
 * GET /api/admin/vendors — list item (contract §4).
 * Nullable fields mirror the live `vendors` columns: licence/GST/geo/rating are
 * captured progressively during onboarding, so they may be unset (null) for a
 * pending vendor. `geo` composes the split `geo_lat`/`geo_lng` numeric columns.
 */
export const vendorResponseSchema = z.object({
    vendor_id: z.string(),
    name: z.string(),
    status: vendorStatusSchema,
    kyc_status: kycStatusSchema,
    fssai_license: z.string().nullable(), // client Q14; null until onboarding submits it
    gst_number: z.string().nullable(), // client Q14
    geo: geoPointSchema.nullable(), // client Q14; from geo_lat/geo_lng
    hygiene_rating: z.number().int().min(1).max(5).nullable(), // null until first rated
    created_at: isoTimestampSchema,
});
export type VendorResponse = z.infer<typeof vendorResponseSchema>;

/**
 * PATCH /api/admin/vendors — a staff action on one vendor. The action drives a
 * server-side state machine (approve/reject/suspend/reinstate operate on
 * `status`; verify_kyc/fail_kyc operate on `kyc_status`). `reason` is recorded
 * in the audit trail (the vendors table has no reason column).
 */
export const vendorActionSchema = z.enum([
    "approve",
    "reject",
    "suspend",
    "reinstate",
    "verify_kyc",
    "fail_kyc",
]);
export type VendorAction = z.infer<typeof vendorActionSchema>;

export const vendorActionRequestSchema = z.object({
    vendor_id: z.string().uuid(),
    action: vendorActionSchema,
    reason: z.string().trim().max(500).optional(),
});
export type VendorActionRequest = z.infer<typeof vendorActionRequestSchema>;

// ===========================================================================
// Settlement (contract §8, owner §4.8) — net-new
// ===========================================================================

/** GET /api/admin/settlements — list item (contract §8). */
export const settlementResponseSchema = z.object({
    settlement_id: z.string(),
    vendor_id: z.string(),
    period: settlementCycleSchema,
    amount: z.number().nonnegative(), // numeric in DB
    status: settlementStatusSchema,
    line_items: z.number().int().nonnegative(),
    settled_at: isoTimestampSchema.nullable(),
});
export type SettlementResponse = z.infer<typeof settlementResponseSchema>;

/**
 * PATCH /api/admin/settlements — admin settlement lifecycle (contract §8, owner
 * §4.8). Forward cycle lock → reconcile → pay; `unlock` is the admin override
 * that returns a locked settlement to pending. `pay` stamps `settled_at`.
 * `note` is appended to the audit trail.
 */
export const settlementActionSchema = z.enum(["lock", "unlock", "reconcile", "pay"]);
export type SettlementAction = z.infer<typeof settlementActionSchema>;

export const settlementActionRequestSchema = z.object({
    settlement_id: z.string().uuid(),
    action: settlementActionSchema,
    note: z.string().trim().max(500).optional(),
});
export type SettlementActionRequest = z.infer<typeof settlementActionRequestSchema>;

// ===========================================================================
// Fraud (contract §9) — net-new
// ===========================================================================

/** GET /api/admin/fraud — list item (contract §9). */
export const fraudFlagResponseSchema = z.object({
    flag_id: z.string(),
    type: fraudFlagTypeSchema,
    severity: fraudSeveritySchema,
    entity: z.object({ kind: z.string(), id: z.string() }), // jsonb
    status: fraudStatusSchema,
    blocked: z.boolean(),
    created_at: isoTimestampSchema,
});
export type FraudFlagResponse = z.infer<typeof fraudFlagResponseSchema>;

/**
 * PATCH /api/admin/fraud — resolve or dismiss an open flag. `resolve` = a real
 * issue that has been handled (the block, if any, stands); `dismiss` = a false
 * positive (any block is cleared). `notes` is stored in `resolution_notes`.
 */
export const fraudActionSchema = z.enum(["resolve", "dismiss"]);
export type FraudAction = z.infer<typeof fraudActionSchema>;

export const fraudActionRequestSchema = z.object({
    flag_id: z.string().uuid(),
    action: fraudActionSchema,
    notes: z.string().trim().max(500).optional(),
});
export type FraudActionRequest = z.infer<typeof fraudActionRequestSchema>;

// ===========================================================================
// System config (GET /api/admin/system-config) — net-new
// ===========================================================================

/**
 * A single config row. `value` is stored as text and coerced by the service
 * per `value_type`. NOTE: `max_tokens_per_volunteer` ships with a PLACEHOLDER
 * (unset) value pending the mentor's number (ASSUMPTIONS.md) — the schema
 * allows a null value so an unset row validates.
 */
export const systemConfigRowSchema = z.object({
    key: z.string().min(1),
    value: z.string().nullable(),
    value_type: z.enum(["number", "boolean", "string"]),
    description: z.string().optional(),
    updated_at: isoTimestampSchema,
});
export type SystemConfigRow = z.infer<typeof systemConfigRowSchema>;

export const systemConfigResponseSchema = z.object({
    config: z.array(systemConfigRowSchema),
});
export type SystemConfigResponse = z.infer<typeof systemConfigResponseSchema>;

/**
 * PATCH /api/admin/system-config — update one existing config row's value
 * (admin only). The value is validated/coerced against the row's `value_type`
 * server-side and stored as text. `null` intentionally UNSETS the row (e.g.
 * leaving `max_tokens_per_volunteer` unset) — never a guessed default.
 */
export const systemConfigUpdateRequestSchema = z.object({
    key: z.string().min(1),
    value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
});
export type SystemConfigUpdateRequest = z.infer<typeof systemConfigUpdateRequestSchema>;

// ===========================================================================
// Admin-only response schemas — net-new Dev-2 tables (M07–M13). Field names &
// nullability mirror the live columns exactly so the route handlers stay honest.
// ===========================================================================

/** GET /api/admin/audit — one append-only audit_logs row (M08, contract §10). */
export const auditLogResponseSchema = z.object({
    id: z.string(),
    actor_id: z.string().nullable(), // null = system/service action
    actor_role: userRoleSchema.nullable(), // role snapshot at action time
    action: z.string(),
    entity_table: z.string(),
    entity_id: z.string().nullable(),
    summary: z.string().nullable(),
    metadata: z.record(z.string(), z.unknown()),
    created_at: isoTimestampSchema,
});
export type AuditLogResponse = z.infer<typeof auditLogResponseSchema>;

/** GET /api/admin/ngo-partners — partner NGO registry row (M13). */
export const ngoPartnerResponseSchema = z.object({
    id: z.string(),
    name: z.string(),
    registration_number: z.string().nullable(),
    focus_area: z.string().nullable(),
    contact_person: z.string().nullable(),
    contact_email: z.string().nullable(),
    contact_phone: z.string().nullable(),
    address: z.string().nullable(),
    city: z.string().nullable(),
    contact_user_id: z.string().nullable(),
    status: z.enum(["active", "inactive", "suspended"]), // text+CHECK; ngo_status enum is a later slice
    notes: z.string().nullable(),
    created_at: isoTimestampSchema,
    updated_at: isoTimestampSchema,
});
export type NgoPartnerResponse = z.infer<typeof ngoPartnerResponseSchema>;

/** GET /api/admin/vendor-escalations — vendor dispute/appeal thread (M10, contract §4). */
export const vendorEscalationResponseSchema = z.object({
    id: z.string(),
    vendor_id: z.string(),
    raised_by: z.string().nullable(),
    assigned_to: z.string().nullable(),
    subject: z.string(),
    description: z.string().nullable(),
    status: escalationStatusSchema,
    resolution: z.string().nullable(),
    resolved_at: isoTimestampSchema.nullable(),
    created_at: isoTimestampSchema,
    updated_at: isoTimestampSchema,
});
export type VendorEscalationResponse = z.infer<typeof vendorEscalationResponseSchema>;

/** GET /api/admin/volunteers — volunteers registry row (M09). */
export const volunteerResponseSchema = z.object({
    id: z.string(),
    user_id: z.string(),
    full_name: z.string().nullable(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
    status: z.enum(["active", "inactive", "suspended"]), // text+CHECK; volunteer status enum is a later slice
    created_at: isoTimestampSchema,
    updated_at: isoTimestampSchema,
});
export type VolunteerResponse = z.infer<typeof volunteerResponseSchema>;

/**
 * PATCH /api/admin/volunteers — admin registry-status control. `suspend` =
 * temporary hold, `deactivate` = retire, `activate` = restore. Operates on the
 * `volunteers.status` text+CHECK value (active|inactive|suspended). `reason` is
 * recorded in the audit trail. NOTE: token allocation / grant decisions and the
 * `max_tokens_per_volunteer` limit are a separate token-flow slice (they mutate
 * the tokens table), not part of this status control.
 */
export const volunteerActionSchema = z.enum(["suspend", "deactivate", "activate"]);
export type VolunteerAction = z.infer<typeof volunteerActionSchema>;

export const volunteerActionRequestSchema = z.object({
    volunteer_id: z.string().uuid(),
    action: volunteerActionSchema,
    reason: z.string().trim().max(500).optional(),
});
export type VolunteerActionRequest = z.infer<typeof volunteerActionRequestSchema>;

/** GET /api/admin/volunteer-token-requests — allocation request queue row (M09, token-flow §3b). */
export const volunteerTokenRequestResponseSchema = z.object({
    id: z.string(),
    volunteer_id: z.string(),
    requested_count: z.number().int().nonnegative(),
    status: volunteerRequestStatusSchema,
    decided_by: z.string().nullable(),
    decided_count: z.number().int().nonnegative().nullable(),
    notes: z.string().nullable(),
    created_at: isoTimestampSchema,
    updated_at: isoTimestampSchema,
});
export type VolunteerTokenRequestResponse = z.infer<typeof volunteerTokenRequestResponseSchema>;

/** GET /api/admin/reports — generated compliance/CSR report row (M11, contract §10). */
export const complianceReportResponseSchema = z.object({
    id: z.string(),
    report_type: reportTypeSchema,
    title: z.string().nullable(),
    params: z.record(z.string(), z.unknown()), // jsonb
    summary: z.record(z.string(), z.unknown()), // jsonb
    file_url: z.string().nullable(),
    period_start: z.string().nullable(), // date (YYYY-MM-DD)
    period_end: z.string().nullable(),
    generated_by: z.string().nullable(),
    created_at: isoTimestampSchema,
    updated_at: isoTimestampSchema,
});
export type ComplianceReportResponse = z.infer<typeof complianceReportResponseSchema>;

/**
 * POST /api/admin/reports — generate a report by aggregating live data into a
 * `compliance_reports` row (admin only). Optional period (YYYY-MM-DD) filters the
 * aggregation window. File export (PDF/CSV to storage) is a later slice; for now
 * the computed `summary` jsonb is the report payload.
 */
const reportDateString = z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "expected a YYYY-MM-DD date");

export const reportGenerateRequestSchema = z
    .object({
        report_type: reportTypeSchema,
        title: z.string().trim().max(200).optional(),
        period_start: reportDateString.optional(),
        period_end: reportDateString.optional(),
    })
    .refine(
        (r) => !r.period_start || !r.period_end || r.period_start <= r.period_end,
        { message: "period_start must be on or before period_end", path: ["period_start"] }
    );
export type ReportGenerateRequest = z.infer<typeof reportGenerateRequestSchema>;

/**
 * Richer fraud_flags row (M12) — superset of fraudFlagResponseSchema above with
 * the resolution + detection-method columns the admin fraud console needs.
 */
export const fraudFlagDetailResponseSchema = z.object({
    id: z.string(),
    flag_type: fraudFlagTypeSchema,
    severity: fraudSeveritySchema,
    status: fraudStatusSchema,
    detection_method: fraudDetectionMethodSchema.nullable(),
    entity: z.object({ kind: z.string(), id: z.string() }), // jsonb polymorphic target
    blocked: z.boolean(),
    resolved_by: z.string().nullable(),
    resolution_notes: z.string().nullable(),
    resolved_at: isoTimestampSchema.nullable(),
    created_at: isoTimestampSchema,
    updated_at: isoTimestampSchema,
});
export type FraudFlagDetailResponse = z.infer<typeof fraudFlagDetailResponseSchema>;

// --- generic envelopes -----------------------------------------------------

/**
 * Standard mutation acknowledgement. Routes that change state return this so
 * Developer 1 always gets a well-shaped, non-null body (contract "Never Return
 * a Null Body"). `id` is the affected row where applicable.
 */
export const mutationAckSchema = z.object({
    ok: z.literal(true),
    id: z.string().optional(),
});
export type MutationAck = z.infer<typeof mutationAckSchema>;

/**
 * Build a `{ <key>: T[], total: number }` list-envelope schema. Use empty arrays
 * as defaults so a list route never returns null (contract). e.g.
 *   const vendorListSchema = listResponseSchema("vendors", vendorResponseSchema);
 */
export function listResponseSchema<T extends z.ZodTypeAny>(key: string, item: T) {
    return z.object({
        [key]: z.array(item).default([]),
        total: z.number().int().nonnegative().default(0),
    });
}

// --- standard error body (contract: never a bare null) ---------------------

export const errorResponseSchema = z.object({ error: z.string() });
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
