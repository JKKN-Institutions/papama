/**
 * Test data factories for pApAmA domain objects.
 *
 * Each factory returns a valid row shape matching the Postgres table schema.
 * Override any field via the optional parameter. Auto-incrementing IDs ensure
 * uniqueness across a test run.
 */

import type {
    TokenType, TokenStatus, DistributionChannel,
    BeneficiaryCategory, EligibilityStatus, BeneficiaryStatus,
    VendorStatus, KycStatus, SettlementStatus, PaymentStatus,
    ProofStatus, FraudFlagType, FraudSeverity, FraudStatus,
    MealType, DonationStatus, CreditTransactionType,
} from "@/lib/types/enums";

let seq = 0;
function nextId(prefix = "id"): string {
    seq++;
    return `${prefix}-${String(seq).padStart(6, "0")}`;
}

/** Reset sequence counter (call in beforeEach for deterministic IDs). */
export function resetFactorySeq(): void {
    seq = 0;
}

const NOW = "2026-07-09T10:00:00.000Z";

// --- Donors -----------------------------------------------------------------

export function makeDonor(overrides?: Record<string, unknown>) {
    return {
        id: nextId("donor"),
        user_id: nextId("user"),
        name: "Test Donor",
        email: "donor@papama.test",
        phone: "+919876543210",
        kyc_verified: false,
        created_at: NOW,
        updated_at: NOW,
        ...overrides,
    };
}

export function makeCreditTransaction(overrides?: Record<string, unknown>) {
    return {
        id: nextId("ct"),
        donor_id: nextId("donor"),
        type: "donation" as CreditTransactionType,
        amount: 100,
        description: "Test donation",
        created_at: NOW,
        ...overrides,
    };
}

export function makeDonation(overrides?: Record<string, unknown>) {
    return {
        id: nextId("donation"),
        donor_id: nextId("donor"),
        amount: 100,
        payment_method: "upi",
        payment_ref: "UPI-REF-001",
        status: "completed" as DonationStatus,
        created_at: NOW,
        ...overrides,
    };
}

// --- Tokens -----------------------------------------------------------------

export function makeToken(overrides?: Record<string, unknown>) {
    return {
        id: nextId("token"),
        donor_id: nextId("donor"),
        token_type: "standard" as TokenType,
        status: "live" as TokenStatus,
        value: 50,
        qr_hash: `qr-hash-${seq}`,
        created_at: NOW,
        expires_at: "2026-08-08T10:00:00.000Z",
        redeemed_at: null,
        vendor_id: null,
        beneficiary_id: null,
        ...overrides,
    };
}

export function makeTokenDistribution(overrides?: Record<string, unknown>) {
    return {
        id: nextId("dist"),
        token_id: nextId("token"),
        from_user_id: nextId("user"),
        to_user_id: nextId("user"),
        channel: "donor_self" as DistributionChannel,
        created_at: NOW,
        ...overrides,
    };
}

// --- Beneficiaries ----------------------------------------------------------

export function makeBeneficiary(overrides?: Record<string, unknown>) {
    return {
        id: nextId("ben"),
        user_id: nextId("user"),
        name: "Test Beneficiary",
        category: "patient" as BeneficiaryCategory,
        eligibility_status: "verified" as EligibilityStatus,
        record_status: "active" as BeneficiaryStatus,
        face_hash: `face-hash-${seq}`,
        aadhaar_hash: null,
        created_at: NOW,
        updated_at: NOW,
        ...overrides,
    };
}

export function makeBeneficiaryRegistration(overrides?: Record<string, unknown>) {
    return {
        id: nextId("reg"),
        beneficiary_id: nextId("ben"),
        category: "patient" as BeneficiaryCategory,
        status: "pending" as "pending" | "approved" | "rejected",
        documents: [],
        submitted_at: NOW,
        decided_at: null,
        decided_by: null,
        ...overrides,
    };
}

// --- Vendors ----------------------------------------------------------------

export function makeVendor(overrides?: Record<string, unknown>) {
    return {
        id: nextId("vendor"),
        user_id: nextId("user"),
        name: "Test Kitchen",
        status: "approved" as VendorStatus,
        kyc_status: "verified" as KycStatus,
        fssai_license: `FSSAI-${seq}`,
        gst_number: null,
        geo_lat: 13.08,
        geo_lng: 80.27,
        hygiene_rating: 4,
        phone: "+919876543210",
        emergency_contact: "+919876543211",
        created_at: NOW,
        updated_at: NOW,
        ...overrides,
    };
}

export function makeVendorMenu(overrides?: Record<string, unknown>) {
    return {
        id: nextId("menu"),
        vendor_id: nextId("vendor"),
        item_name: "Rice & Sambar",
        price: 50,
        nutrition_category: "standard",
        is_special_care_approved: false,
        is_approved: true,
        created_at: NOW,
        ...overrides,
    };
}

// --- Redemptions ------------------------------------------------------------

export function makeRedemption(overrides?: Record<string, unknown>) {
    return {
        id: nextId("redemption"),
        token_id: nextId("token"),
        vendor_id: nextId("vendor"),
        beneficiary_id: nextId("ben"),
        redeemed_at: NOW,
        proof_status: null as ProofStatus | null,
        payment_status: "locked" as PaymentStatus,
        plate_photo_url: null,
        receipt_url: null,
        vendor_amount: 50,
        forfeit_amount: 0,
        co_pay_amount: 0,
        ...overrides,
    };
}

// --- Settlements ------------------------------------------------------------

export function makeSettlement(overrides?: Record<string, unknown>) {
    return {
        id: nextId("settlement"),
        vendor_id: nextId("vendor"),
        status: "pending" as SettlementStatus,
        total_amount: 500,
        redemption_count: 10,
        cycle_start: "2026-07-01T00:00:00.000Z",
        cycle_end: "2026-07-07T23:59:59.000Z",
        created_at: NOW,
        paid_at: null,
        ...overrides,
    };
}

// --- Fraud ------------------------------------------------------------------

export function makeFraudFlag(overrides?: Record<string, unknown>) {
    return {
        id: nextId("fraud"),
        flag_type: "vendor_anomaly" as FraudFlagType,
        severity: "medium" as FraudSeverity,
        status: "open" as FraudStatus,
        entity_table: "vendors",
        entity_id: nextId("vendor"),
        description: "Volume spike detected",
        detection_method: "vendor_volume_anomaly",
        created_at: NOW,
        resolved_at: null,
        resolved_by: null,
        ...overrides,
    };
}

// --- Audit ------------------------------------------------------------------

export function makeAuditLog(overrides?: Record<string, unknown>) {
    return {
        id: nextId("audit"),
        actor_id: nextId("user"),
        actor_role: "admin",
        action: "vendor.approve",
        entity_table: "vendors",
        entity_id: nextId("vendor"),
        details: null,
        created_at: NOW,
        ...overrides,
    };
}

// --- Volunteers -------------------------------------------------------------

export function makeVolunteer(overrides?: Record<string, unknown>) {
    return {
        id: nextId("vol"),
        user_id: nextId("user"),
        name: "Test Volunteer",
        phone: "+919876543210",
        zone: null,
        tokens_held: 0,
        created_at: NOW,
        ...overrides,
    };
}

// --- Notifications ----------------------------------------------------------

export function makeNotification(overrides?: Record<string, unknown>) {
    return {
        id: nextId("notif"),
        user_id: nextId("user"),
        channel: "in_app",
        title: "Test Notification",
        body: "This is a test notification.",
        status: "unread",
        created_at: NOW,
        ...overrides,
    };
}

// --- Meal Windows -----------------------------------------------------------

export function makeMealWindow(overrides?: Record<string, unknown>) {
    return {
        id: nextId("mw"),
        vendor_id: nextId("vendor"),
        meal_type: "lunch" as MealType,
        start_time: "12:00",
        end_time: "14:00",
        is_active: true,
        created_at: NOW,
        ...overrides,
    };
}

// --- System Config (single row) ---------------------------------------------

export function makeConfigRow(key: string, value: string | null, value_type: "number" | "boolean" | "string" = "number") {
    return { key, value, value_type };
}
