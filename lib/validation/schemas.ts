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
    donationStatusSchema,
    eligibilityStatusSchema,
    fraudFlagTypeSchema,
    fraudSeveritySchema,
    fraudStatusSchema,
    kycStatusSchema,
    registrationStatusSchema,
    settlementCycleSchema,
    settlementStatusSchema,
    tokenStatusSchema,
    tokenTypeSchema,
    vendorStatusSchema,
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

/** GET /api/admin/beneficiaries — list item (contract §6). */
export const beneficiaryResponseSchema = z.object({
    beneficiary_id: z.string(),
    category: beneficiaryCategorySchema,
    status: registrationStatusSchema,
    eligibility: eligibilityStatusSchema,
    aadhaar_linked: z.boolean(),
    face_hash_valid: z.boolean(),
    registered_at: isoTimestampSchema,
});
export type BeneficiaryResponse = z.infer<typeof beneficiaryResponseSchema>;

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

/** GET /api/admin/vendors — list item (contract §4). */
export const vendorResponseSchema = z.object({
    vendor_id: z.string(),
    name: z.string(),
    status: vendorStatusSchema,
    kyc_status: kycStatusSchema,
    fssai_license: z.string(), // client Q14
    gst_number: z.string(), // client Q14
    geo: geoPointSchema, // client Q14
    hygiene_rating: z.number().int().min(1).max(5),
    created_at: isoTimestampSchema,
});
export type VendorResponse = z.infer<typeof vendorResponseSchema>;

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

// --- standard error body (contract: never a bare null) ---------------------

export const errorResponseSchema = z.object({ error: z.string() });
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
