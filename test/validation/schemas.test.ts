/**
 * Validation schema tests — derived from papama-phase1-spec-rev2.md.
 *
 * Every assertion references a spec section. Tests that exercise spec rules
 * the code has not yet implemented are expected to FAIL — surfacing the gap.
 *
 * Spec sections referenced:
 *   §3.1 F-1..F-12  Foundation features
 *   §3.2            Hard business rules (meal, vendor, token, co-pay)
 *   §3.3            Core flows
 *   §6              Role access matrix
 *   §7              Configurable defaults
 *   §8              Build checklist (Layer 1 — types/enums)
 */

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

    it("accepts ₹50 — the standard token value (spec §7)", () => {
        expect(inrAmountSchema.parse(50)).toBe(50);
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
    it("accepts Coimbatore coordinates (spec §3.1 F-11: operating city)", () => {
        const result = geoPointSchema.parse({ lat: 11.0168, lng: 76.9558 });
        expect(result.lat).toBeCloseTo(11.0168, 4);
        expect(result.lng).toBeCloseTo(76.9558, 4);
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

    it("accepts valid face capture — spec §3.3: face-hash is primary verification", () => {
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
    it("accepts spec §7 meal window boundaries", () => {
        // Breakfast 06:00–10:00, Lunch 11:00–15:00, Dinner 18:00–22:00
        expect(clockTimeSchema.parse("06:00")).toBe("06:00");
        expect(clockTimeSchema.parse("10:00")).toBe("10:00");
        expect(clockTimeSchema.parse("11:00")).toBe("11:00");
        expect(clockTimeSchema.parse("15:00")).toBe("15:00");
        expect(clockTimeSchema.parse("18:00")).toBe("18:00");
        expect(clockTimeSchema.parse("22:00")).toBe("22:00");
    });

    it("accepts valid 24-hour times", () => {
        expect(clockTimeSchema.parse("00:00")).toBe("00:00");
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
// 2. Enum schemas — spec §8 Layer 1 types
// ---------------------------------------------------------------------------

describe("enum schemas — spec §8 Layer 1", () => {
    const enumTests: Array<{ name: string; schema: ReturnType<typeof import("zod").z.enum>; validValues: readonly string[]; specRef: string }> = [
        { name: "userRole", schema: userRoleSchema, specRef: "§6: 8 roles",
          validValues: ["admin", "compliance", "vendor_manager", "vendor", "volunteer", "donor", "beneficiary", "guest"] },
        { name: "tokenType", schema: tokenTypeSchema, specRef: "§3.1 F-1: two-tier",
          validValues: ["standard", "special_care"] },
        { name: "tokenStatus", schema: tokenStatusSchema, specRef: "§3.2 token lifecycle",
          validValues: ["generated", "live", "in_admin_pool", "assigned_to_volunteer", "distributed", "redeemed", "expired"] },
        { name: "vendorStatus", schema: vendorStatusSchema, specRef: "§3.3 vendor onboarding",
          validValues: ["pending", "approved", "suspended", "rejected"] },
        { name: "kycStatus", schema: kycStatusSchema, specRef: "§3.3 vendor KYC",
          validValues: ["pending", "verified", "failed"] },
        { name: "settlementStatus", schema: settlementStatusSchema, specRef: "§3.1 F-2: settlement lifecycle",
          validValues: ["pending", "locked", "reconciled", "paid"] },
        { name: "fraudFlagType", schema: fraudFlagTypeSchema, specRef: "§3.3 Security & fraud",
          validValues: ["duplicate_token", "cloned_qr", "tampered_qr", "beneficiary_duplicate", "vendor_anomaly"] },
        { name: "fraudSeverity", schema: fraudSeveritySchema, specRef: "§3.3 fraud severity",
          validValues: ["low", "medium", "high"] },
        { name: "mealType", schema: mealTypeSchema, specRef: "§3.1 F-9: meal windows",
          validValues: ["breakfast", "lunch", "dinner", "snack"] },
        { name: "beneficiaryCategory", schema: beneficiaryCategorySchema, specRef: "§3.1 F-4: +disability +disaster_affected [Q7]",
          validValues: ["pregnant_women", "patient", "disability", "disaster_affected"] },
        { name: "reportType", schema: reportTypeSchema, specRef: "§3.3 admin reports",
          validValues: ["csr", "donation", "redemption", "settlement", "compliance", "audit"] },
    ];

    for (const { name, schema, validValues, specRef } of enumTests) {
        describe(`${name} (${specRef})`, () => {
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

    // --- Spec-gap tests: enum values the spec REQUIRES but code may not have ---

    describe("spec-gap: fraudFlagType must include duplicate_media (spec §3.1 F-3, §5)", () => {
        it("accepts 'duplicate_media' — spec §3.1 F-3: duplicate photo + bill detection", () => {
            // Spec §3.1 F-3: "duplicate photo detection and duplicate bill detection"
            // Spec §5: fraud_flags.detection_method includes duplicate_media (active P1)
            expect(fraudFlagTypeSchema.parse("duplicate_media")).toBe("duplicate_media");
        });
    });

    describe("spec-gap: tokenStatus must include 'blocked' (spec §3.2 lost-token)", () => {
        it("accepts 'blocked' — spec §3.2: lost token → old token blocked instantly", () => {
            // Spec §3.2 Token rules: "old token blocked instantly"
            expect(tokenStatusSchema.parse("blocked")).toBe("blocked");
        });
    });

    describe("spec-gap: settlementStatus should support approval flow (spec §3.1 F-2)", () => {
        it("accepts 'approved' — spec §3.1 F-2: settlement approval step", () => {
            // Spec §3.1 F-2: "settlement approval step [M2-4]"
            expect(settlementStatusSchema.parse("approved")).toBe("approved");
        });

        it("accepts 'held' — spec §3.1 F-2: settlement hold facility", () => {
            // Spec §3.1 F-2: "settlement hold facility [M1-10]"
            expect(settlementStatusSchema.parse("held")).toBe("held");
        });
    });
});

// ---------------------------------------------------------------------------
// 3. Request schemas — spec-derived rules
// ---------------------------------------------------------------------------

describe("donationPurchaseRequestSchema — spec §3.3: any amount", () => {
    it("accepts valid request", () => {
        const result = donationPurchaseRequestSchema.parse({ amount_inr: 500 });
        expect(result.amount_inr).toBe(500);
    });

    it("accepts ₹30 — spec demo script step 1: donate ₹30 then ₹20", () => {
        expect(donationPurchaseRequestSchema.parse({ amount_inr: 30 }).amount_inr).toBe(30);
    });

    it("accepts with optional payment_method", () => {
        const result = donationPurchaseRequestSchema.parse({ amount_inr: 100, payment_method: "upi" });
        expect(result.payment_method).toBe("upi");
    });

    it("rejects zero amount — donations must be positive", () => {
        expect(() => donationPurchaseRequestSchema.parse({ amount_inr: 0 })).toThrow();
    });

    it("rejects negative amount", () => {
        expect(() => donationPurchaseRequestSchema.parse({ amount_inr: -100 })).toThrow();
    });

    it("rejects missing amount", () => {
        expect(() => donationPurchaseRequestSchema.parse({})).toThrow();
    });
});

describe("tokenMintRequestSchema — spec §3.2: admin-configurable value per token type", () => {
    it("accepts standard token with use_now path", () => {
        const result = tokenMintRequestSchema.parse({
            token_type: "standard",
            amount_inr: 50,
            distribution_path: "use_now",
        });
        expect(result.token_type).toBe("standard");
        expect(result.distribution_path).toBe("use_now");
    });

    it("accepts special_care with authorize_papama (spec §3.1 F-1: two-tier)", () => {
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

    it("rejects invalid token_type — only standard/special_care (spec §3.1 F-1)", () => {
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

describe("beneficiaryRegistrationRequestSchema — spec §3.1 F-4, F-5", () => {
    it("accepts valid registration with face_hash as primary (spec F-5)", () => {
        const result = beneficiaryRegistrationRequestSchema.parse({
            full_name: "Test Person",
            category: "patient",
            face_hash: "abc123hash",
        });
        expect(result.full_name).toBe("Test Person");
        expect(result.document_refs).toEqual([]); // default
    });

    it("accepts optional aadhaar_hash — never mandatory (spec F-5)", () => {
        const result = beneficiaryRegistrationRequestSchema.parse({
            full_name: "Test",
            category: "pregnant_women",
            face_hash: "hash",
            aadhaar_hash: "aadhaar-hash",
        });
        expect(result.aadhaar_hash).toBe("aadhaar-hash");
    });

    it("accepts null aadhaar_hash — Aadhaar optional only (spec F-5)", () => {
        const result = beneficiaryRegistrationRequestSchema.parse({
            full_name: "Test",
            category: "disability",
            face_hash: "hash",
            aadhaar_hash: null,
        });
        expect(result.aadhaar_hash).toBeNull();
    });

    it("accepts disaster_affected category (spec F-4, client Q7)", () => {
        const result = beneficiaryRegistrationRequestSchema.parse({
            full_name: "Flood victim",
            category: "disaster_affected",
            face_hash: "hash",
        });
        expect(result.category).toBe("disaster_affected");
    });

    it("accepts disability category (spec F-4, client Q7)", () => {
        const result = beneficiaryRegistrationRequestSchema.parse({
            full_name: "PWD",
            category: "disability",
            face_hash: "hash",
        });
        expect(result.category).toBe("disability");
    });

    it("rejects missing face_hash — face-hash is primary identity (spec F-5)", () => {
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

describe("beneficiaryActionRequestSchema — spec §3.1 F-4: state machine", () => {
    it("accepts valid action", () => {
        const result = beneficiaryActionRequestSchema.parse({
            beneficiary_id: "550e8400-e29b-41d4-a716-446655440000",
            action: "suspend",
            reason: "Duplicate identity detected",
        });
        expect(result.action).toBe("suspend");
    });

    it("accepts all valid actions: suspend, activate, block", () => {
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

describe("redemptionRequestSchema — spec §3.2 hard business rules", () => {
    const validRedemption = {
        qr_payload: "qr-signed-payload",
        vendor_id: "vendor-001",
        selected_items: [{ menu_item_id: "item-1", price: 50 }],
        beneficiary_face_hash: "face-hash-123",
        geo: { lat: 11.0168, lng: 76.9558 }, // Coimbatore per spec
    };

    it("accepts valid redemption", () => {
        const result = redemptionRequestSchema.parse(validRedemption);
        expect(result.co_contribution).toBe(0); // default — ₹0 always available (spec §3.2)
    });

    it("co_contribution defaults to ₹0 — spec §3.2: ₹0 is always available", () => {
        const result = redemptionRequestSchema.parse(validRedemption);
        expect(result.co_contribution).toBe(0);
    });

    it("accepts co_contribution up to ₹10 (spec §7: co_contribution_max = ₹10)", () => {
        const result = redemptionRequestSchema.parse({ ...validRedemption, co_contribution: 10 });
        expect(result.co_contribution).toBe(10);
    });

    it("rejects negative co_contribution", () => {
        expect(() => redemptionRequestSchema.parse({
            ...validRedemption,
            co_contribution: -1,
        })).toThrow();
    });

    it("rejects empty selected_items — spec §3.2: vendor must serve approved menu items", () => {
        expect(() => redemptionRequestSchema.parse({
            ...validRedemption,
            selected_items: [],
        })).toThrow();
    });

    it("rejects missing qr_payload — spec §3.3: encrypted one-time QR required", () => {
        const { qr_payload, ...rest } = validRedemption;
        expect(() => redemptionRequestSchema.parse(rest)).toThrow();
    });

    it("rejects missing beneficiary_face_hash — spec F-5: face-hash is primary", () => {
        const { beneficiary_face_hash, ...rest } = validRedemption;
        expect(() => redemptionRequestSchema.parse(rest)).toThrow();
    });

    it("rejects missing geo — spec §3.3: geofence check required", () => {
        const { geo, ...rest } = validRedemption;
        expect(() => redemptionRequestSchema.parse(rest)).toThrow();
    });
});

describe("vendorActionRequestSchema — spec §3.3 vendor onboarding", () => {
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

describe("settlementActionRequestSchema — spec §3.1 F-2", () => {
    it("accepts lifecycle actions: lock, unlock, approve, reconcile, pay (spec F-2)", () => {
        for (const action of ["lock", "unlock", "approve", "reconcile", "pay"]) {
            expect(() => settlementActionRequestSchema.parse({
                settlement_id: "550e8400-e29b-41d4-a716-446655440000",
                action,
            })).not.toThrow();
        }
    });

    it("accepts 'approve' — spec §3.1 F-2 [M2-4]: settlement approval step (compliance capability)", () => {
        expect(settlementActionRequestSchema.parse({
            settlement_id: "550e8400-e29b-41d4-a716-446655440000",
            action: "approve",
        }).action).toBe("approve");
    });

    it("accepts admin override actions: hold, release (spec F-2: hold facility)", () => {
        for (const action of ["hold", "release"]) {
            expect(() => settlementActionRequestSchema.parse({
                settlement_id: "550e8400-e29b-41d4-a716-446655440000",
                action,
            })).not.toThrow();
        }
    });

    it("rejects 'refund' — not a settlement action", () => {
        expect(() => settlementActionRequestSchema.parse({
            settlement_id: "550e8400-e29b-41d4-a716-446655440000",
            action: "refund",
        })).toThrow();
    });

    it("rejects 'instant' — spec F-2: no instant settlement", () => {
        expect(() => settlementActionRequestSchema.parse({
            settlement_id: "550e8400-e29b-41d4-a716-446655440000",
            action: "instant",
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

describe("systemConfigUpdateRequestSchema — spec §7.1 config change semantics", () => {
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

    it("accepts null value — intentional unset (spec §7.1: null allowed)", () => {
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

describe("mealWindowCreateRequestSchema — spec §3.1 F-9, §7", () => {
    it("accepts spec default breakfast window: 06:00–10:00 (spec §7)", () => {
        const result = mealWindowCreateRequestSchema.parse({
            meal_type: "breakfast",
            start_time: "06:00",
            end_time: "10:00",
        });
        expect(result.meal_type).toBe("breakfast");
    });

    it("accepts spec default lunch window: 11:00–15:00 (spec §7)", () => {
        const result = mealWindowCreateRequestSchema.parse({
            meal_type: "lunch",
            start_time: "11:00",
            end_time: "15:00",
        });
        expect(result.meal_type).toBe("lunch");
    });

    it("accepts spec default dinner window: 18:00–22:00 (spec §7)", () => {
        const result = mealWindowCreateRequestSchema.parse({
            meal_type: "dinner",
            start_time: "18:00",
            end_time: "22:00",
        });
        expect(result.meal_type).toBe("dinner");
    });

    it("accepts snack window — spec §7: admin-defined / disabled by default", () => {
        expect(() => mealWindowCreateRequestSchema.parse({
            meal_type: "snack",
            start_time: "15:00",
            end_time: "17:00",
        })).not.toThrow();
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

describe("donorProfilePatchSchema — spec §5: pan_number seam for 80G", () => {
    it("accepts full_name only", () => {
        const result = donorProfilePatchSchema.parse({ full_name: "New Name" });
        expect(result.full_name).toBe("New Name");
    });

    it("accepts pan_number — spec §5: donors.pan_number is the 80G seam", () => {
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

describe("volunteerCreateRequestSchema — spec §3.3 volunteer management", () => {
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

describe("volunteerActionRequestSchema — spec §3.3: admin approval required", () => {
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

describe("reportGenerateRequestSchema — spec §3.3 admin reports", () => {
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

describe("institutionAllocateRequestSchema — spec §3.1 F-12", () => {
    it("accepts valid allocation (spec F-12: bulk token allocation)", () => {
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

describe("corporateCsrProfileRequestSchema — spec §3.3 CSR module [M1-7]", () => {
    it("accepts minimal request (spec: CSR/corporate donor registration)", () => {
        const result = corporateCsrProfileRequestSchema.parse({ company_name: "JKKN Corp" });
        expect(result.company_name).toBe("JKKN Corp");
    });

    it("accepts with CIN and GST fields (spec: donor_type=corporate, CIN/GST)", () => {
        const result = corporateCsrProfileRequestSchema.parse({
            company_name: "JKKN Corp",
            cin: "U12345TN2020PLC123456",
            registration_number: "REG-001",
        });
        expect(result.cin).toBe("U12345TN2020PLC123456");
    });

    it("rejects empty company_name", () => {
        expect(() => corporateCsrProfileRequestSchema.parse({ company_name: "" })).toThrow();
    });
});

describe("csrReportGenerateRequestSchema — spec §3.3: CSR reports", () => {
    it("accepts empty object (generate for all corporate donors)", () => {
        expect(() => csrReportGenerateRequestSchema.parse({})).not.toThrow();
    });

    it("accepts with donor_id and date range", () => {
        expect(() => csrReportGenerateRequestSchema.parse({
            donor_id: "550e8400-e29b-41d4-a716-446655440000",
            period_start: "2026-01-01",
            period_end: "2026-06-30",
        })).not.toThrow();
    });

    it("rejects start after end", () => {
        expect(() => csrReportGenerateRequestSchema.parse({
            period_start: "2026-07-01",
            period_end: "2026-01-01",
        })).toThrow();
    });
});

describe("emergencyGrantRequestSchema — spec §3.3 disaster/emergency", () => {
    it("accepts empty object", () => {
        expect(() => emergencyGrantRequestSchema.parse({})).not.toThrow();
    });

    it("accepts with reason (spec: fully audited)", () => {
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
