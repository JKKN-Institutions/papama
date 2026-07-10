import { describe, expect, it } from "vitest";

import {
    inrAmountSchema,
    geoPointSchema,
    isoTimestampSchema,
    faceCaptureSchema,
    FACE_EMBEDDING_DIM,
    clockTimeSchema,
    // Request schemas
    donationPurchaseRequestSchema,
    tokenMintRequestSchema,
    beneficiaryRegistrationRequestSchema,
    beneficiaryActionRequestSchema,
    redemptionRequestSchema,
    vendorActionRequestSchema,
    settlementActionRequestSchema,
    fraudActionRequestSchema,
    systemConfigUpdateRequestSchema,
    mealWindowCreateRequestSchema,
    mealWindowUpdateRequestSchema,
    emergencyGrantRequestSchema,
    donorProfilePatchSchema,
    volunteerCreateRequestSchema,
    volunteerActionRequestSchema,
    reportGenerateRequestSchema,
    institutionAllocateRequestSchema,
    corporateCsrProfileRequestSchema,
    csrReportGenerateRequestSchema,
    // Response schemas
    errorResponseSchema,
    mutationAckSchema,
} from "@/lib/validation/schemas";

import {
    userRoleSchema,
    tokenTypeSchema,
    tokenStatusSchema,
    vendorStatusSchema,
    kycStatusSchema,
    settlementStatusSchema,
    fraudFlagTypeSchema,
    fraudSeveritySchema,
    mealTypeSchema,
    beneficiaryCategorySchema,
    reportTypeSchema,
} from "@/lib/validation/enums";

// ---------------------------------------------------------------------------
// 1. Shared primitives
// ---------------------------------------------------------------------------

describe("inrAmountSchema", () => {
    it("accepts 0", () => {
        expect(inrAmountSchema.parse(0)).toBe(0);
    });

    it("accepts valid positive integer", () => {
        expect(inrAmountSchema.parse(500)).toBe(500);
    });

    it("accepts max value 1,000,000", () => {
        expect(inrAmountSchema.parse(1_000_000)).toBe(1_000_000);
    });

    it("rejects negative numbers", () => {
        expect(() => inrAmountSchema.parse(-1)).toThrow();
    });

    it("rejects decimals", () => {
        expect(() => inrAmountSchema.parse(50.5)).toThrow();
    });

    it("rejects above 1,000,000", () => {
        expect(() => inrAmountSchema.parse(1_000_001)).toThrow();
    });

    it("rejects strings", () => {
        expect(() => inrAmountSchema.parse("100")).toThrow();
    });

    it("rejects NaN", () => {
        expect(() => inrAmountSchema.parse(NaN)).toThrow();
    });
});

describe("geoPointSchema", () => {
    it("accepts valid coordinates", () => {
        const result = geoPointSchema.parse({ lat: 13.08, lng: 80.27 });
        expect(result).toEqual({ lat: 13.08, lng: 80.27 });
    });

    it("accepts boundary values", () => {
        expect(() => geoPointSchema.parse({ lat: -90, lng: -180 })).not.toThrow();
        expect(() => geoPointSchema.parse({ lat: 90, lng: 180 })).not.toThrow();
    });

    it("rejects lat out of range", () => {
        expect(() => geoPointSchema.parse({ lat: 91, lng: 80 })).toThrow();
        expect(() => geoPointSchema.parse({ lat: -91, lng: 80 })).toThrow();
    });

    it("rejects lng out of range", () => {
        expect(() => geoPointSchema.parse({ lat: 13, lng: 181 })).toThrow();
        expect(() => geoPointSchema.parse({ lat: 13, lng: -181 })).toThrow();
    });

    it("rejects missing fields", () => {
        expect(() => geoPointSchema.parse({ lat: 13 })).toThrow();
        expect(() => geoPointSchema.parse({ lng: 80 })).toThrow();
        expect(() => geoPointSchema.parse({})).toThrow();
    });
});

describe("isoTimestampSchema", () => {
    it("accepts valid ISO-8601 with offset", () => {
        expect(() => isoTimestampSchema.parse("2026-07-09T10:00:00.000Z")).not.toThrow();
        expect(() => isoTimestampSchema.parse("2026-07-09T10:00:00+05:30")).not.toThrow();
    });

    it("rejects plain date strings", () => {
        expect(() => isoTimestampSchema.parse("2026-07-09")).toThrow();
    });

    it("rejects arbitrary strings", () => {
        expect(() => isoTimestampSchema.parse("not-a-date")).toThrow();
    });

    it("rejects numbers", () => {
        expect(() => isoTimestampSchema.parse(1234567890)).toThrow();
    });
});

describe("faceCaptureSchema", () => {
    const validEmbedding = Array.from({ length: FACE_EMBEDDING_DIM }, (_, i) => i * 0.001);

    it("accepts valid face capture", () => {
        const result = faceCaptureSchema.parse({ embedding: validEmbedding, liveness: 0.95 });
        expect(result.embedding).toHaveLength(FACE_EMBEDDING_DIM);
        expect(result.liveness).toBe(0.95);
    });

    it("rejects wrong embedding dimension", () => {
        expect(() => faceCaptureSchema.parse({
            embedding: [1, 2, 3],
            liveness: 0.9,
        })).toThrow();
    });

    it("rejects liveness below 0", () => {
        expect(() => faceCaptureSchema.parse({
            embedding: validEmbedding,
            liveness: -0.1,
        })).toThrow();
    });

    it("rejects liveness above 1", () => {
        expect(() => faceCaptureSchema.parse({
            embedding: validEmbedding,
            liveness: 1.1,
        })).toThrow();
    });

    it("accepts boundary liveness values", () => {
        expect(() => faceCaptureSchema.parse({ embedding: validEmbedding, liveness: 0 })).not.toThrow();
        expect(() => faceCaptureSchema.parse({ embedding: validEmbedding, liveness: 1 })).not.toThrow();
    });

    it("FACE_EMBEDDING_DIM is 1024", () => {
        expect(FACE_EMBEDDING_DIM).toBe(1024);
    });
});

describe("clockTimeSchema", () => {
    it("accepts valid 24-hour times", () => {
        expect(clockTimeSchema.parse("00:00")).toBe("00:00");
        expect(clockTimeSchema.parse("06:30")).toBe("06:30");
        expect(clockTimeSchema.parse("12:00")).toBe("12:00");
        expect(clockTimeSchema.parse("23:59")).toBe("23:59");
    });

    it("rejects invalid hours", () => {
        expect(() => clockTimeSchema.parse("24:00")).toThrow();
        expect(() => clockTimeSchema.parse("25:00")).toThrow();
    });

    it("rejects invalid minutes", () => {
        expect(() => clockTimeSchema.parse("12:60")).toThrow();
        expect(() => clockTimeSchema.parse("12:99")).toThrow();
    });

    it("rejects non-padded times", () => {
        expect(() => clockTimeSchema.parse("6:30")).toThrow();
        expect(() => clockTimeSchema.parse("12:5")).toThrow();
    });

    it("rejects times with seconds", () => {
        expect(() => clockTimeSchema.parse("12:00:00")).toThrow();
    });
});

// ---------------------------------------------------------------------------
// 2. Enum schemas — verify all valid values accepted, invalid rejected
// ---------------------------------------------------------------------------

describe("enum schemas", () => {
    const enumTests: Array<{ name: string; schema: ReturnType<typeof import("zod").z.enum>; validValues: readonly string[] }> = [
        { name: "userRole", schema: userRoleSchema, validValues: ["admin", "compliance", "vendor_manager", "vendor", "volunteer", "donor", "beneficiary", "guest"] },
        { name: "tokenType", schema: tokenTypeSchema, validValues: ["standard", "special_care"] },
        { name: "tokenStatus", schema: tokenStatusSchema, validValues: ["generated", "live", "in_admin_pool", "assigned_to_volunteer", "distributed", "redeemed", "expired"] },
        { name: "vendorStatus", schema: vendorStatusSchema, validValues: ["pending", "approved", "suspended", "rejected"] },
        { name: "kycStatus", schema: kycStatusSchema, validValues: ["pending", "verified", "failed"] },
        { name: "settlementStatus", schema: settlementStatusSchema, validValues: ["pending", "locked", "reconciled", "paid"] },
        { name: "fraudFlagType", schema: fraudFlagTypeSchema, validValues: ["duplicate_token", "cloned_qr", "tampered_qr", "beneficiary_duplicate", "vendor_anomaly"] },
        { name: "fraudSeverity", schema: fraudSeveritySchema, validValues: ["low", "medium", "high"] },
        { name: "mealType", schema: mealTypeSchema, validValues: ["breakfast", "lunch", "dinner", "snack"] },
        { name: "beneficiaryCategory", schema: beneficiaryCategorySchema, validValues: ["pregnant_women", "patient", "disability", "disaster_affected"] },
        { name: "reportType", schema: reportTypeSchema, validValues: ["csr", "donation", "redemption", "settlement", "compliance", "audit"] },
    ];

    for (const { name, schema, validValues } of enumTests) {
        describe(name, () => {
            for (const value of validValues) {
                it(`accepts '${value}'`, () => {
                    expect(schema.parse(value)).toBe(value);
                });
            }

            it("rejects invalid value", () => {
                expect(() => schema.parse("INVALID_VALUE")).toThrow();
            });

            it("rejects empty string", () => {
                expect(() => schema.parse("")).toThrow();
            });

            it("rejects number", () => {
                expect(() => schema.parse(123)).toThrow();
            });
        });
    }
});

// ---------------------------------------------------------------------------
// 3. Request schemas
// ---------------------------------------------------------------------------

describe("donationPurchaseRequestSchema", () => {
    it("accepts valid request", () => {
        const result = donationPurchaseRequestSchema.parse({ amount_inr: 500 });
        expect(result.amount_inr).toBe(500);
    });

    it("accepts with optional payment_method", () => {
        const result = donationPurchaseRequestSchema.parse({ amount_inr: 100, payment_method: "upi" });
        expect(result.payment_method).toBe("upi");
    });

    it("rejects zero amount", () => {
        expect(() => donationPurchaseRequestSchema.parse({ amount_inr: 0 })).toThrow();
    });

    it("rejects negative amount", () => {
        expect(() => donationPurchaseRequestSchema.parse({ amount_inr: -100 })).toThrow();
    });

    it("rejects missing amount", () => {
        expect(() => donationPurchaseRequestSchema.parse({})).toThrow();
    });
});

describe("tokenMintRequestSchema", () => {
    it("accepts valid mint request", () => {
        const result = tokenMintRequestSchema.parse({
            token_type: "standard",
            amount_inr: 50,
            distribution_path: "use_now",
        });
        expect(result.token_type).toBe("standard");
        expect(result.distribution_path).toBe("use_now");
    });

    it("accepts special_care type with authorize_papama", () => {
        const result = tokenMintRequestSchema.parse({
            token_type: "special_care",
            amount_inr: 100,
            distribution_path: "authorize_papama",
        });
        expect(result.token_type).toBe("special_care");
    });

    it("accepts optional special_instructions", () => {
        const result = tokenMintRequestSchema.parse({
            token_type: "standard",
            amount_inr: 50,
            distribution_path: "use_now",
            special_instructions: "For elderly in ward 3",
        });
        expect(result.special_instructions).toBe("For elderly in ward 3");
    });

    it("rejects invalid token_type", () => {
        expect(() => tokenMintRequestSchema.parse({
            token_type: "premium",
            amount_inr: 50,
            distribution_path: "use_now",
        })).toThrow();
    });

    it("rejects invalid distribution_path", () => {
        expect(() => tokenMintRequestSchema.parse({
            token_type: "standard",
            amount_inr: 50,
            distribution_path: "give_to_friend",
        })).toThrow();
    });
});

describe("beneficiaryRegistrationRequestSchema", () => {
    it("accepts valid registration", () => {
        const result = beneficiaryRegistrationRequestSchema.parse({
            full_name: "Test Person",
            category: "patient",
            face_hash: "abc123hash",
        });
        expect(result.full_name).toBe("Test Person");
        expect(result.document_refs).toEqual([]); // default
    });

    it("accepts optional aadhaar_hash", () => {
        const result = beneficiaryRegistrationRequestSchema.parse({
            full_name: "Test",
            category: "pregnant_women",
            face_hash: "hash",
            aadhaar_hash: "aadhaar-hash",
        });
        expect(result.aadhaar_hash).toBe("aadhaar-hash");
    });

    it("accepts null aadhaar_hash", () => {
        const result = beneficiaryRegistrationRequestSchema.parse({
            full_name: "Test",
            category: "disability",
            face_hash: "hash",
            aadhaar_hash: null,
        });
        expect(result.aadhaar_hash).toBeNull();
    });

    it("rejects missing face_hash", () => {
        expect(() => beneficiaryRegistrationRequestSchema.parse({
            full_name: "Test",
            category: "patient",
        })).toThrow();
    });

    it("rejects invalid category", () => {
        expect(() => beneficiaryRegistrationRequestSchema.parse({
            full_name: "Test",
            category: "elderly",
            face_hash: "hash",
        })).toThrow();
    });
});

describe("beneficiaryActionRequestSchema", () => {
    it("accepts valid action", () => {
        const result = beneficiaryActionRequestSchema.parse({
            beneficiary_id: "550e8400-e29b-41d4-a716-446655440000",
            action: "suspend",
            reason: "Duplicate identity detected",
        });
        expect(result.action).toBe("suspend");
    });

    it("accepts all valid actions", () => {
        for (const action of ["suspend", "activate", "block"]) {
            expect(() => beneficiaryActionRequestSchema.parse({
                beneficiary_id: "550e8400-e29b-41d4-a716-446655440000",
                action,
            })).not.toThrow();
        }
    });

    it("rejects invalid action", () => {
        expect(() => beneficiaryActionRequestSchema.parse({
            beneficiary_id: "550e8400-e29b-41d4-a716-446655440000",
            action: "delete",
        })).toThrow();
    });

    it("rejects non-UUID beneficiary_id", () => {
        expect(() => beneficiaryActionRequestSchema.parse({
            beneficiary_id: "not-a-uuid",
            action: "suspend",
        })).toThrow();
    });
});

describe("redemptionRequestSchema", () => {
    const validRedemption = {
        qr_payload: "qr-signed-payload",
        vendor_id: "vendor-001",
        selected_items: [{ menu_item_id: "item-1", price: 50 }],
        beneficiary_face_hash: "face-hash-123",
        geo: { lat: 13.08, lng: 80.27 },
    };

    it("accepts valid redemption", () => {
        const result = redemptionRequestSchema.parse(validRedemption);
        expect(result.co_contribution).toBe(0); // default
    });

    it("accepts with co_contribution", () => {
        const result = redemptionRequestSchema.parse({ ...validRedemption, co_contribution: 10 });
        expect(result.co_contribution).toBe(10);
    });

    it("rejects empty selected_items", () => {
        expect(() => redemptionRequestSchema.parse({
            ...validRedemption,
            selected_items: [],
        })).toThrow();
    });

    it("rejects missing qr_payload", () => {
        const { qr_payload, ...rest } = validRedemption;
        expect(() => redemptionRequestSchema.parse(rest)).toThrow();
    });
});

describe("vendorActionRequestSchema", () => {
    const validActions = ["approve", "reject", "suspend", "reinstate", "verify_kyc", "fail_kyc"];

    for (const action of validActions) {
        it(`accepts action '${action}'`, () => {
            expect(() => vendorActionRequestSchema.parse({
                vendor_id: "550e8400-e29b-41d4-a716-446655440000",
                action,
            })).not.toThrow();
        });
    }

    it("rejects invalid action", () => {
        expect(() => vendorActionRequestSchema.parse({
            vendor_id: "550e8400-e29b-41d4-a716-446655440000",
            action: "terminate",
        })).toThrow();
    });
});

describe("settlementActionRequestSchema", () => {
    const validActions = ["lock", "unlock", "reconcile", "pay", "hold", "release"];

    for (const action of validActions) {
        it(`accepts action '${action}'`, () => {
            expect(() => settlementActionRequestSchema.parse({
                settlement_id: "550e8400-e29b-41d4-a716-446655440000",
                action,
            })).not.toThrow();
        });
    }

    it("rejects invalid action", () => {
        expect(() => settlementActionRequestSchema.parse({
            settlement_id: "550e8400-e29b-41d4-a716-446655440000",
            action: "refund",
        })).toThrow();
    });
});

describe("fraudActionRequestSchema", () => {
    it("accepts valid actions", () => {
        for (const action of ["resolve", "dismiss", "unblock"]) {
            expect(() => fraudActionRequestSchema.parse({
                flag_id: "550e8400-e29b-41d4-a716-446655440000",
                action,
            })).not.toThrow();
        }
    });

    it("rejects invalid action", () => {
        expect(() => fraudActionRequestSchema.parse({
            flag_id: "550e8400-e29b-41d4-a716-446655440000",
            action: "escalate",
        })).toThrow();
    });
});

describe("systemConfigUpdateRequestSchema", () => {
    it("accepts string value", () => {
        const result = systemConfigUpdateRequestSchema.parse({ key: "operating_city", value: "Chennai" });
        expect(result.value).toBe("Chennai");
    });

    it("accepts number value", () => {
        const result = systemConfigUpdateRequestSchema.parse({ key: "standard_token_value", value: 100 });
        expect(result.value).toBe(100);
    });

    it("accepts boolean value", () => {
        const result = systemConfigUpdateRequestSchema.parse({ key: "emergency_mode_enabled", value: true });
        expect(result.value).toBe(true);
    });

    it("accepts null value (intentional unset)", () => {
        const result = systemConfigUpdateRequestSchema.parse({ key: "max_tokens_per_volunteer", value: null });
        expect(result.value).toBeNull();
    });

    it("rejects missing key", () => {
        expect(() => systemConfigUpdateRequestSchema.parse({ value: "test" })).toThrow();
    });

    it("rejects empty key", () => {
        expect(() => systemConfigUpdateRequestSchema.parse({ key: "", value: "test" })).toThrow();
    });
});

describe("mealWindowCreateRequestSchema", () => {
    it("accepts valid meal window", () => {
        const result = mealWindowCreateRequestSchema.parse({
            meal_type: "lunch",
            start_time: "12:00",
            end_time: "14:00",
        });
        expect(result.meal_type).toBe("lunch");
    });

    it("rejects overnight windows (start >= end)", () => {
        expect(() => mealWindowCreateRequestSchema.parse({
            meal_type: "dinner",
            start_time: "22:00",
            end_time: "06:00",
        })).toThrow();
    });

    it("rejects equal start and end", () => {
        expect(() => mealWindowCreateRequestSchema.parse({
            meal_type: "lunch",
            start_time: "12:00",
            end_time: "12:00",
        })).toThrow();
    });

    it("rejects extra fields (strict mode)", () => {
        expect(() => mealWindowCreateRequestSchema.parse({
            meal_type: "lunch",
            start_time: "12:00",
            end_time: "14:00",
            extra_field: true,
        })).toThrow();
    });
});

describe("mealWindowUpdateRequestSchema", () => {
    it("accepts partial update (just is_active)", () => {
        const result = mealWindowUpdateRequestSchema.parse({ is_active: false });
        expect(result.is_active).toBe(false);
    });

    it("accepts both times when valid", () => {
        expect(() => mealWindowUpdateRequestSchema.parse({
            start_time: "08:00",
            end_time: "10:00",
        })).not.toThrow();
    });

    it("rejects invalid time range when both provided", () => {
        expect(() => mealWindowUpdateRequestSchema.parse({
            start_time: "14:00",
            end_time: "12:00",
        })).toThrow();
    });

    it("allows single time field without range check", () => {
        expect(() => mealWindowUpdateRequestSchema.parse({ start_time: "14:00" })).not.toThrow();
        expect(() => mealWindowUpdateRequestSchema.parse({ end_time: "06:00" })).not.toThrow();
    });
});

describe("donorProfilePatchSchema", () => {
    it("accepts full_name only", () => {
        const result = donorProfilePatchSchema.parse({ full_name: "New Name" });
        expect(result.full_name).toBe("New Name");
    });

    it("accepts pan_number only", () => {
        const result = donorProfilePatchSchema.parse({ pan_number: "ABCDE1234F" });
        expect(result.pan_number).toBe("ABCDE1234F");
    });

    it("accepts null pan_number (clear)", () => {
        const result = donorProfilePatchSchema.parse({ pan_number: null });
        expect(result.pan_number).toBeNull();
    });

    it("accepts empty object", () => {
        expect(() => donorProfilePatchSchema.parse({})).not.toThrow();
    });
});

describe("volunteerCreateRequestSchema", () => {
    it("accepts valid volunteer", () => {
        const result = volunteerCreateRequestSchema.parse({
            email: "vol@test.com",
            password: "secure123",
            full_name: "Test Volunteer",
        });
        expect(result.email).toBe("vol@test.com");
    });

    it("rejects invalid email", () => {
        expect(() => volunteerCreateRequestSchema.parse({
            email: "not-an-email",
            password: "secure123",
            full_name: "Test",
        })).toThrow();
    });

    it("rejects short password", () => {
        expect(() => volunteerCreateRequestSchema.parse({
            email: "vol@test.com",
            password: "12345",
            full_name: "Test",
        })).toThrow();
    });

    it("rejects empty full_name", () => {
        expect(() => volunteerCreateRequestSchema.parse({
            email: "vol@test.com",
            password: "secure123",
            full_name: "",
        })).toThrow();
    });
});

describe("volunteerActionRequestSchema", () => {
    const validActions = ["approve", "reject", "suspend", "deactivate", "activate"];

    for (const action of validActions) {
        it(`accepts action '${action}'`, () => {
            expect(() => volunteerActionRequestSchema.parse({
                volunteer_id: "550e8400-e29b-41d4-a716-446655440000",
                action,
            })).not.toThrow();
        });
    }
});

describe("reportGenerateRequestSchema", () => {
    it("accepts valid request", () => {
        const result = reportGenerateRequestSchema.parse({ report_type: "csr" });
        expect(result.report_type).toBe("csr");
    });

    it("accepts with date range", () => {
        expect(() => reportGenerateRequestSchema.parse({
            report_type: "donation",
            period_start: "2026-01-01",
            period_end: "2026-06-30",
        })).not.toThrow();
    });

    it("rejects start after end", () => {
        expect(() => reportGenerateRequestSchema.parse({
            report_type: "donation",
            period_start: "2026-07-01",
            period_end: "2026-01-01",
        })).toThrow();
    });

    it("rejects invalid date format", () => {
        expect(() => reportGenerateRequestSchema.parse({
            report_type: "audit",
            period_start: "July 1 2026",
        })).toThrow();
    });
});

describe("institutionAllocateRequestSchema", () => {
    it("accepts valid allocation", () => {
        const result = institutionAllocateRequestSchema.parse({
            ngo_partner_id: "550e8400-e29b-41d4-a716-446655440000",
            count: 50,
        });
        expect(result.count).toBe(50);
    });

    it("rejects zero count", () => {
        expect(() => institutionAllocateRequestSchema.parse({
            ngo_partner_id: "550e8400-e29b-41d4-a716-446655440000",
            count: 0,
        })).toThrow();
    });

    it("rejects count above 10,000", () => {
        expect(() => institutionAllocateRequestSchema.parse({
            ngo_partner_id: "550e8400-e29b-41d4-a716-446655440000",
            count: 10_001,
        })).toThrow();
    });
});

describe("corporateCsrProfileRequestSchema", () => {
    it("accepts minimal request", () => {
        const result = corporateCsrProfileRequestSchema.parse({ company_name: "JKKN Corp" });
        expect(result.company_name).toBe("JKKN Corp");
    });

    it("rejects empty company_name", () => {
        expect(() => corporateCsrProfileRequestSchema.parse({ company_name: "" })).toThrow();
    });
});

describe("emergencyGrantRequestSchema", () => {
    it("accepts empty object", () => {
        expect(() => emergencyGrantRequestSchema.parse({})).not.toThrow();
    });

    it("accepts with reason", () => {
        const result = emergencyGrantRequestSchema.parse({ reason: "Flood relief" });
        expect(result.reason).toBe("Flood relief");
    });

    it("rejects extra fields (strict mode)", () => {
        expect(() => emergencyGrantRequestSchema.parse({ reason: "test", extra: true })).toThrow();
    });
});

// ---------------------------------------------------------------------------
// 4. Response / envelope schemas
// ---------------------------------------------------------------------------

describe("errorResponseSchema", () => {
    it("accepts valid error body", () => {
        const result = errorResponseSchema.parse({ error: "unauthorized" });
        expect(result.error).toBe("unauthorized");
    });

    it("rejects missing error field", () => {
        expect(() => errorResponseSchema.parse({})).toThrow();
    });
});

describe("mutationAckSchema", () => {
    it("accepts ok: true", () => {
        const result = mutationAckSchema.parse({ ok: true });
        expect(result.ok).toBe(true);
    });

    it("accepts ok: true with id", () => {
        const result = mutationAckSchema.parse({ ok: true, id: "abc-123" });
        expect(result.id).toBe("abc-123");
    });

    it("rejects ok: false", () => {
        expect(() => mutationAckSchema.parse({ ok: false })).toThrow();
    });
});
