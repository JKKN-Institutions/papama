import { describe, expect, it } from "vitest";

import {
    makeUser, TEST_USERS, ALL_ROLES,
    fakeSupabaseClient, fakeSupabaseSingle, fakeSupabaseMultiTable,
    makeToken, makeVendor, makeBeneficiary, makeDonor, makeRedemption,
    makeFraudFlag, makeAuditLog, makeSettlement,
    makeInstitution, makeLedgerEntry, makeCampaign, makeConsentRecord, makeDocument,
    allConfigRows, configRow, buildConfig,
    makeRequest,
} from "@test/helpers";

describe("test infrastructure", () => {
    describe("mockAuth", () => {
        it("makeUser creates users with correct role", () => {
            const admin = makeUser("admin");
            expect(admin.role).toBe("admin");
            expect(admin.email).toContain("admin");
            expect(admin.donor_id).toBeNull();
        });

        it("makeUser sets donor_id for donor role", () => {
            const donor = makeUser("donor");
            expect(donor.role).toBe("donor");
            expect(donor.donor_id).not.toBeNull();
        });

        it("TEST_USERS has all 8 roles", () => {
            expect(Object.keys(TEST_USERS)).toHaveLength(8);
        });

        it("ALL_ROLES has 8 entries", () => {
            expect(ALL_ROLES).toHaveLength(8);
        });
    });

    describe("mockSupabase", () => {
        it("fakeSupabaseClient returns rows via chain", async () => {
            const client = fakeSupabaseClient([{ id: "1" }]);
            const result = await client.from("test").select("*").order("id").range(0, 9);
            expect(result.data).toEqual([{ id: "1" }]);
            expect(result.error).toBeNull();
        });

        it("fakeSupabaseSingle returns a single row", async () => {
            const client = fakeSupabaseSingle({ id: "1", name: "test" });
            const result = await client.from("test").select("*").eq("id", "1").single();
            expect(result.data).toEqual({ id: "1", name: "test" });
        });

        it("fakeSupabaseClient with error returns error", async () => {
            const client = fakeSupabaseClient([], "connection failed");
            const result = await client.from("test").select("*").order("id").range(0, 9);
            expect(result.error).toBeTruthy();
            expect(result.data).toBeNull();
        });

        it("fakeSupabaseMultiTable routes by table name", async () => {
            const client = fakeSupabaseMultiTable({
                vendors: { rows: [{ id: "v1" }] },
                tokens: { rows: [{ id: "t1" }, { id: "t2" }] },
            });
            const vendors = await client.from("vendors").select("*").order("id").range(0, 9);
            const tokens = await client.from("tokens").select("*").order("id").range(0, 9);
            expect(vendors.data).toEqual([{ id: "v1" }]);
            expect(tokens.data).toEqual([{ id: "t1" }, { id: "t2" }]);
        });
    });

    describe("factories — spec-aligned shapes", () => {
        it("makeToken generates unique IDs", () => {
            const t1 = makeToken();
            const t2 = makeToken();
            expect(t1.id).not.toBe(t2.id);
        });

        it("makeToken defaults to value 50 (spec §7: standard_token_value)", () => {
            expect(makeToken().value).toBe(50);
        });

        it("makeToken has replacement_for_token_id field (spec §3.2: lost-token)", () => {
            const token = makeToken();
            expect(token).toHaveProperty("replacement_for_token_id");
            expect(token.replacement_for_token_id).toBeNull();
        });

        it("makeToken has issued_to_binding field (spec §5: non-transferability)", () => {
            const token = makeToken();
            expect(token).toHaveProperty("issued_to_binding");
            expect(token.issued_to_binding).toBeNull();
        });

        it("makeToken allows overrides", () => {
            const token = makeToken({ status: "redeemed", value: 100 });
            expect(token.status).toBe("redeemed");
            expect(token.value).toBe(100);
        });

        it("makeVendor uses Coimbatore coordinates (spec §3.1 F-11)", () => {
            const vendor = makeVendor();
            expect(vendor.geo_lat).toBeCloseTo(11.0168, 2);
            expect(vendor.geo_lng).toBeCloseTo(76.9558, 2);
        });

        it("makeVendor has settlement_cycle field (spec §3.1 F-2)", () => {
            expect(makeVendor()).toHaveProperty("settlement_cycle");
        });

        it("makeBeneficiary defaults to verified patient", () => {
            const ben = makeBeneficiary();
            expect(ben.category).toBe("patient");
            expect(ben.eligibility_status).toBe("verified");
        });

        it("makeRedemption has meal_window and co_contribution_amount (spec §3.1 F-9, §3.2)", () => {
            const r = makeRedemption();
            expect(r).toHaveProperty("meal_window");
            expect(r).toHaveProperty("co_contribution_amount");
        });

        it("all original factories produce valid objects", () => {
            expect(makeDonor()).toHaveProperty("id");
            expect(makeRedemption()).toHaveProperty("payment_status");
            expect(makeFraudFlag()).toHaveProperty("severity");
            expect(makeAuditLog()).toHaveProperty("action");
            expect(makeSettlement()).toHaveProperty("total_amount");
        });

        it("new spec-required factories produce valid objects", () => {
            expect(makeInstitution()).toHaveProperty("type");       // spec F-12
            expect(makeLedgerEntry()).toHaveProperty("ledger");     // spec F-10
            expect(makeCampaign()).toHaveProperty("type");          // spec §3.3
            expect(makeConsentRecord()).toHaveProperty("consent_type"); // spec M2-14
            expect(makeDocument()).toHaveProperty("document_type"); // spec M2-13
        });
    });

    describe("mockConfig — spec §7 defaults", () => {
        it("allConfigRows returns all spec defaults", () => {
            const rows = allConfigRows();
            expect(rows.length).toBeGreaterThanOrEqual(30);
        });

        it("standard_token_value defaults to 50 (spec §7)", () => {
            expect(configRow("standard_token_value").value).toBe("50");
        });

        it("token_expiry_days defaults to 90 (spec §7)", () => {
            expect(configRow("token_expiry_days").value).toBe("90");
        });

        it("max_meals_per_day defaults to 1 (spec §7: launch at 1, ceiling 3)", () => {
            expect(configRow("max_meals_per_day").value).toBe("1");
        });

        it("redemption_radius_km defaults to 20 (spec §7)", () => {
            expect(configRow("redemption_radius_km").value).toBe("20");
        });

        it("co_contribution_max defaults to 10 (spec §7: ₹0–₹10)", () => {
            expect(configRow("co_contribution_max").value).toBe("10");
        });

        it("vendor_min_rating defaults to 3.5 (spec §7)", () => {
            expect(configRow("vendor_min_rating").value).toBe("3.5");
        });

        it("vendor_max_complaint_rate defaults to 0.05 (spec §7: 5%)", () => {
            expect(configRow("vendor_max_complaint_rate").value).toBe("0.05");
        });

        it("audit_log_retention_days defaults to 2920 (spec §7: 8 years)", () => {
            expect(configRow("audit_log_retention_days").value).toBe("2920");
        });

        it("operating_city defaults to Coimbatore (spec §3.1 F-11)", () => {
            expect(configRow("operating_city").value).toBe("Coimbatore");
        });

        it("settlement_audit_sample_pct defaults to 0.05 (spec §7: 5%)", () => {
            expect(configRow("settlement_audit_sample_pct").value).toBe("0.05");
        });

        it("emergency_mode_max_duration_days defaults to 30 (spec §7)", () => {
            expect(configRow("emergency_mode_max_duration_days").value).toBe("30");
        });

        it("configRow allows value override", () => {
            const row = configRow("standard_token_value", "100");
            expect(row.value).toBe("100");
        });

        it("buildConfig merges overrides", () => {
            const rows = buildConfig({ standard_token_value: "200", emergency_mode_enabled: "true" });
            const tokenVal = rows.find(r => r.key === "standard_token_value");
            const emergency = rows.find(r => r.key === "emergency_mode_enabled");
            expect(tokenVal?.value).toBe("200");
            expect(emergency?.value).toBe("true");
        });
    });

    describe("routeTestHelper", () => {
        it("makeRequest creates a GET request", () => {
            const req = makeRequest("http://localhost/api/admin/vendors");
            expect(req.method).toBe("GET");
            expect(req.url).toContain("/api/admin/vendors");
        });

        it("makeRequest creates a POST request with body", () => {
            const req = makeRequest("http://localhost/api/admin/vendors", {
                method: "POST",
                body: { name: "test" },
            });
            expect(req.method).toBe("POST");
        });

        it("makeRequest adds search params", () => {
            const req = makeRequest("http://localhost/api/admin/vendors", {
                searchParams: { limit: "10", offset: "0" },
            });
            expect(req.url).toContain("limit=10");
            expect(req.url).toContain("offset=0");
        });
    });
});
