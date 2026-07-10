import { describe, expect, it } from "vitest";

import {
    makeUser, TEST_USERS, ALL_ROLES,
    fakeSupabaseClient, fakeSupabaseSingle, fakeSupabaseMultiTable,
    makeToken, makeVendor, makeBeneficiary, makeDonor, makeRedemption,
    makeFraudFlag, makeAuditLog, makeSettlement,
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

    describe("factories", () => {
        it("makeToken generates unique IDs", () => {
            const t1 = makeToken();
            const t2 = makeToken();
            expect(t1.id).not.toBe(t2.id);
        });

        it("makeToken allows overrides", () => {
            const token = makeToken({ status: "redeemed", value: 100 });
            expect(token.status).toBe("redeemed");
            expect(token.value).toBe(100);
        });

        it("makeVendor has geo coordinates", () => {
            const vendor = makeVendor();
            expect(vendor.geo_lat).toBeDefined();
            expect(vendor.geo_lng).toBeDefined();
        });

        it("makeBeneficiary defaults to verified patient", () => {
            const ben = makeBeneficiary();
            expect(ben.category).toBe("patient");
            expect(ben.eligibility_status).toBe("verified");
        });

        it("all factories produce valid objects", () => {
            expect(makeDonor()).toHaveProperty("id");
            expect(makeRedemption()).toHaveProperty("payment_status");
            expect(makeFraudFlag()).toHaveProperty("severity");
            expect(makeAuditLog()).toHaveProperty("action");
            expect(makeSettlement()).toHaveProperty("total_amount");
        });
    });

    describe("mockConfig", () => {
        it("allConfigRows returns all defaults", () => {
            const rows = allConfigRows();
            expect(rows.length).toBeGreaterThan(20);
        });

        it("configRow returns a specific key", () => {
            const row = configRow("standard_token_value");
            expect(row.key).toBe("standard_token_value");
            expect(row.value).toBe("50");
            expect(row.value_type).toBe("number");
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
