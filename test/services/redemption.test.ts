import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for the redemption validation engine (lib/services/redemption.ts).
 *
 * The engine is "pure-ish" — it reads from the DB and system_config but never
 * writes. We mock all DB reads + config reads and verify the check results.
 */

// Stub server-only and mock all external dependencies
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

// Mock qrHashOf (deterministic hash — we control the output)
vi.mock("@/app/api/_lib/tokenQr", () => ({
    qrHashOf: vi.fn().mockReturnValue("hashed-qr-payload"),
}));

// Mock face embedding helper
vi.mock("@/lib/face/embedding", () => ({
    toVectorLiteral: vi.fn().mockReturnValue("[0.1,0.2,0.3]"),
}));

// Mock system-config — we control each config read
vi.mock("@/lib/system-config", async (importActual) => {
    const actual = await importActual<typeof import("@/lib/system-config")>();
    return {
        ...actual,
        getNumber: vi.fn(),
        getBoolean: vi.fn(),
        getString: vi.fn(),
    };
});

import { validateRedemption, type ValidateRedemptionInput } from "@/lib/services/redemption";
import { getNumber, getBoolean, getString, MissingConfigError } from "@/lib/system-config";

const getNumberMock = vi.mocked(getNumber);
const getBooleanMock = vi.mocked(getBoolean);
const getStringMock = vi.mocked(getString);

// ---------------------------------------------------------------------------
// Helpers to build a fake Supabase client with per-table, per-call responses
// ---------------------------------------------------------------------------

interface QueryResult { data: unknown; error: unknown }

function buildFakeAdmin(responses: Record<string, QueryResult[]>) {
    // Track call index per table
    const callIndex: Record<string, number> = {};

    const from = vi.fn().mockImplementation((table: string) => {
        if (!callIndex[table]) callIndex[table] = 0;
        const results = responses[table] ?? [{ data: null, error: null }];
        const idx = Math.min(callIndex[table], results.length - 1);

        const result = results[idx];
        callIndex[table]++;

        // Build a chainable mock that resolves to the result at terminal methods
        const chain: Record<string, ReturnType<typeof vi.fn>> = {};
        const methods = ["select", "eq", "neq", "gte", "or", "order", "maybeSingle", "single", "range", "filter", "in", "limit"];
        for (const m of methods) {
            chain[m] = vi.fn();
        }
        // Terminal methods resolve the result
        chain.maybeSingle.mockResolvedValue(result);
        chain.single.mockResolvedValue(result);
        chain.range.mockResolvedValue(result);
        chain.order.mockReturnValue(chain);
        // Non-terminal return chain
        for (const m of methods) {
            if (!["maybeSingle", "single", "range"].includes(m)) {
                chain[m].mockReturnValue(chain);
            }
        }
        // Also make order→range chainable for list queries
        // and make the chain itself thenable for `await from().select()` patterns
        chain.then = vi.fn().mockImplementation((resolve: (v: unknown) => void) => resolve(result));

        return chain;
    });

    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });

    return { from, rpc } as unknown as import("@supabase/supabase-js").SupabaseClient;
}

// ---------------------------------------------------------------------------
// Default test fixtures
// ---------------------------------------------------------------------------

const TOKEN_ROW = {
    id: "token-1",
    qr_hash: "hashed-qr-payload",
    status: "live",
    value_inr: 50,
    token_type: "standard",
    donor_id: "donor-1",
    beneficiary_id: null,
    expires_at: "2099-12-31T23:59:59.000Z",
    redeemed_at: null,
};

const MENU_ROW = {
    id: "menu-1",
    vendor_id: "vendor-1",
    item_name: "Rice & Sambar",
    price: 50,
    nutrition_category: "standard",
    is_special_care_equivalent: false,
    special_care_equivalent_approved: false,
    approval_status: "approved",
};

const VENDOR_STATUS_ROW = { status: "approved" };
const VENDOR_AVAIL_ROW = {
    is_open: true,
    stock_exhausted: false,
    temporary_closure_until: null,
    daily_meal_capacity: null,
};
const VENDOR_GEO_ROW = { geo_lat: 13.08, geo_lng: 80.27 };

const BASE_INPUT: ValidateRedemptionInput = {
    qr_payload: "PAPAMA:test-payload",
    vendor_id: "vendor-1",
    menu_item_id: "menu-1",
};

function defaultConfigMock() {
    getBooleanMock.mockImplementation(async (key: string) => {
        if (key === "city_lock_enabled") return false;
        if (key === "meal_window_enforcement_enabled") return false;
        if (key === "vendor_capacity_enforcement_enabled") return false;
        if (key === "emergency_mode_enabled") return false;
        throw new MissingConfigError(key, "missing");
    });
    getNumberMock.mockImplementation(async (key: string) => {
        if (key === "redemption_radius_km") return 5;
        if (key === "co_contribution_max") return 0;
        if (key === "meal_cooldown_hours") return 6;
        if (key === "max_meals_per_day") return 3;
        throw new MissingConfigError(key, "missing");
    });
    getStringMock.mockImplementation(async (key: string) => {
        if (key === "operating_city") return "Komarapalayam";
        throw new MissingConfigError(key, "missing");
    });
}

function defaultAdmin() {
    return buildFakeAdmin({
        // First call: token lookup by qr_hash
        tokens: [{ data: TOKEN_ROW, error: null }],
        // vendor status, vendor availability, vendor geo, vendor city — multiple from("vendors") calls
        vendors: [
            { data: VENDOR_STATUS_ROW, error: null },
            { data: VENDOR_AVAIL_ROW, error: null },
            { data: VENDOR_GEO_ROW, error: null },
            { data: { city: null }, error: null },
        ],
        vendor_menus: [{ data: MENU_ROW, error: null }],
        meal_windows: [{ data: [], error: null }],
    });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("validateRedemption", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        defaultConfigMock();
    });

    // --- token checks -------------------------------------------------------

    describe("token checks", () => {
        it("returns ok=false when no token matches the QR", async () => {
            const admin = buildFakeAdmin({
                tokens: [{ data: null, error: null }],
            });

            const result = await validateRedemption(BASE_INPUT, admin);

            expect(result.ok).toBe(false);
            expect(result.token).toBeNull();
            const tokenCheck = result.checks.find(c => c.name === "token");
            expect(tokenCheck?.pass).toBe(false);
            expect(tokenCheck?.hard).toBe(true);
        });

        it("returns ok when token is live and not expired", async () => {
            const admin = defaultAdmin();

            const result = await validateRedemption(BASE_INPUT, admin);

            const tokenCheck = result.checks.find(c => c.name === "token");
            expect(tokenCheck?.pass).toBe(true);
        });

        it("fails when token is expired", async () => {
            const admin = buildFakeAdmin({
                tokens: [{ data: { ...TOKEN_ROW, expires_at: "2020-01-01T00:00:00.000Z" }, error: null }],
                vendors: [
                    { data: VENDOR_STATUS_ROW, error: null },
                    { data: VENDOR_AVAIL_ROW, error: null },
                    { data: VENDOR_GEO_ROW, error: null },
                    { data: { city: null }, error: null },
                ],
                vendor_menus: [{ data: MENU_ROW, error: null }],
            });

            const result = await validateRedemption(BASE_INPUT, admin);

            expect(result.ok).toBe(false);
            const tokenCheck = result.checks.find(c => c.name === "token");
            expect(tokenCheck?.pass).toBe(false);
            expect(tokenCheck?.detail).toContain("expired");
        });

        it("fails when token status is not redeemable", async () => {
            const admin = buildFakeAdmin({
                tokens: [{ data: { ...TOKEN_ROW, status: "in_admin_pool" }, error: null }],
                vendors: [
                    { data: VENDOR_STATUS_ROW, error: null },
                    { data: VENDOR_AVAIL_ROW, error: null },
                    { data: VENDOR_GEO_ROW, error: null },
                    { data: { city: null }, error: null },
                ],
                vendor_menus: [{ data: MENU_ROW, error: null }],
            });

            const result = await validateRedemption(BASE_INPUT, admin);

            const tokenCheck = result.checks.find(c => c.name === "token");
            expect(tokenCheck?.pass).toBe(false);
            expect(tokenCheck?.detail).toContain("in_admin_pool");
        });

        it("accepts 'distributed' status as redeemable", async () => {
            const admin = buildFakeAdmin({
                tokens: [{ data: { ...TOKEN_ROW, status: "distributed" }, error: null }],
                vendors: [
                    { data: VENDOR_STATUS_ROW, error: null },
                    { data: VENDOR_AVAIL_ROW, error: null },
                    { data: VENDOR_GEO_ROW, error: null },
                    { data: { city: null }, error: null },
                ],
                vendor_menus: [{ data: MENU_ROW, error: null }],
            });

            const result = await validateRedemption(BASE_INPUT, admin);

            const tokenCheck = result.checks.find(c => c.name === "token");
            expect(tokenCheck?.pass).toBe(true);
        });
    });

    // --- vendor status check ------------------------------------------------

    describe("vendor status check", () => {
        it("passes when vendor is approved", async () => {
            const admin = defaultAdmin();

            const result = await validateRedemption(BASE_INPUT, admin);

            const check = result.checks.find(c => c.name === "vendor_status");
            expect(check?.pass).toBe(true);
        });

        it("fails when vendor is pending", async () => {
            const admin = buildFakeAdmin({
                tokens: [{ data: TOKEN_ROW, error: null }],
                vendors: [
                    { data: { status: "pending" }, error: null },
                    { data: VENDOR_AVAIL_ROW, error: null },
                    { data: VENDOR_GEO_ROW, error: null },
                    { data: { city: null }, error: null },
                ],
                vendor_menus: [{ data: MENU_ROW, error: null }],
            });

            const result = await validateRedemption(BASE_INPUT, admin);

            const check = result.checks.find(c => c.name === "vendor_status");
            expect(check?.pass).toBe(false);
            expect(check?.hard).toBe(true);
        });

        it("fails when vendor not found", async () => {
            const admin = buildFakeAdmin({
                tokens: [{ data: TOKEN_ROW, error: null }],
                vendors: [
                    { data: null, error: null },
                    { data: null, error: null },
                    { data: null, error: null },
                    { data: null, error: null },
                ],
                vendor_menus: [{ data: MENU_ROW, error: null }],
            });

            const result = await validateRedemption(BASE_INPUT, admin);

            const check = result.checks.find(c => c.name === "vendor_status");
            expect(check?.pass).toBe(false);
            expect(check?.detail).toContain("not found");
        });
    });

    // --- menu checks --------------------------------------------------------

    describe("menu checks", () => {
        it("passes for approved menu item belonging to vendor", async () => {
            const admin = defaultAdmin();

            const result = await validateRedemption(BASE_INPUT, admin);

            const check = result.checks.find(c => c.name === "menu");
            expect(check?.pass).toBe(true);
        });

        it("fails when menu item not found", async () => {
            const admin = buildFakeAdmin({
                tokens: [{ data: TOKEN_ROW, error: null }],
                vendors: [
                    { data: VENDOR_STATUS_ROW, error: null },
                    { data: VENDOR_AVAIL_ROW, error: null },
                    { data: VENDOR_GEO_ROW, error: null },
                    { data: { city: null }, error: null },
                ],
                vendor_menus: [{ data: null, error: null }],
            });

            const result = await validateRedemption(BASE_INPUT, admin);

            const check = result.checks.find(c => c.name === "menu");
            expect(check?.pass).toBe(false);
            expect(check?.detail).toContain("not found");
        });

        it("fails when menu item belongs to different vendor", async () => {
            const admin = buildFakeAdmin({
                tokens: [{ data: TOKEN_ROW, error: null }],
                vendors: [
                    { data: VENDOR_STATUS_ROW, error: null },
                    { data: VENDOR_AVAIL_ROW, error: null },
                    { data: VENDOR_GEO_ROW, error: null },
                    { data: { city: null }, error: null },
                ],
                vendor_menus: [{ data: { ...MENU_ROW, vendor_id: "other-vendor" }, error: null }],
            });

            const result = await validateRedemption(BASE_INPUT, admin);

            const check = result.checks.find(c => c.name === "menu");
            expect(check?.pass).toBe(false);
            expect(check?.detail).toContain("does not belong");
        });

        it("fails when menu item is not approved", async () => {
            const admin = buildFakeAdmin({
                tokens: [{ data: TOKEN_ROW, error: null }],
                vendors: [
                    { data: VENDOR_STATUS_ROW, error: null },
                    { data: VENDOR_AVAIL_ROW, error: null },
                    { data: VENDOR_GEO_ROW, error: null },
                    { data: { city: null }, error: null },
                ],
                vendor_menus: [{ data: { ...MENU_ROW, approval_status: "pending" }, error: null }],
            });

            const result = await validateRedemption(BASE_INPUT, admin);

            const check = result.checks.find(c => c.name === "menu");
            expect(check?.pass).toBe(false);
            expect(check?.detail).toContain("not approved");
        });

        it("fails for special_care token with non-approved special care menu", async () => {
            const admin = buildFakeAdmin({
                tokens: [{ data: { ...TOKEN_ROW, token_type: "special_care" }, error: null }],
                vendors: [
                    { data: VENDOR_STATUS_ROW, error: null },
                    { data: VENDOR_AVAIL_ROW, error: null },
                    { data: VENDOR_GEO_ROW, error: null },
                    { data: { city: null }, error: null },
                ],
                vendor_menus: [{
                    data: {
                        ...MENU_ROW,
                        is_special_care_equivalent: true,
                        special_care_equivalent_approved: false,
                    },
                    error: null,
                }],
            });

            const result = await validateRedemption(BASE_INPUT, admin);

            const check = result.checks.find(c => c.name === "menu");
            expect(check?.pass).toBe(false);
            expect(check?.detail).toContain("special-care");
        });
    });

    // --- geofence -----------------------------------------------------------

    describe("geofence checks", () => {
        it("passes when within radius", async () => {
            const admin = defaultAdmin();
            // Same coords as vendor → distance = 0
            const input = { ...BASE_INPUT, geo: { lat: 13.08, lng: 80.27 } };

            const result = await validateRedemption(input, admin);

            const check = result.checks.find(c => c.name === "geofence");
            expect(check?.pass).toBe(true);
            expect(check?.detail).toContain("within");
        });

        it("fails when outside radius", async () => {
            const admin = defaultAdmin();
            // Far away from vendor (13.08, 80.27)
            const input = { ...BASE_INPUT, geo: { lat: 28.61, lng: 77.21 } }; // Delhi

            const result = await validateRedemption(input, admin);

            const check = result.checks.find(c => c.name === "geofence");
            expect(check?.pass).toBe(false);
            expect(check?.detail).toContain("outside");
        });

        it("soft-skips when vendor has no geo on file", async () => {
            const admin = buildFakeAdmin({
                tokens: [{ data: TOKEN_ROW, error: null }],
                vendors: [
                    { data: VENDOR_STATUS_ROW, error: null },
                    { data: VENDOR_AVAIL_ROW, error: null },
                    { data: { geo_lat: null, geo_lng: null }, error: null },
                    { data: { city: null }, error: null },
                ],
                vendor_menus: [{ data: MENU_ROW, error: null }],
            });
            const input = { ...BASE_INPUT, geo: { lat: 13.08, lng: 80.27 } };

            const result = await validateRedemption(input, admin);

            const check = result.checks.find(c => c.name === "geofence");
            expect(check?.pass).toBe(true);
            expect(check?.hard).toBe(false);
            expect(check?.detail).toContain("skipped");
        });

        it("hard-fails when geo not provided but geofence is enforceable", async () => {
            const admin = defaultAdmin();
            // No geo in input, vendor has geo + radius configured
            const input = { ...BASE_INPUT }; // no geo field

            const result = await validateRedemption(input, admin);

            const check = result.checks.find(c => c.name === "geofence");
            expect(check?.pass).toBe(false);
            expect(check?.hard).toBe(true);
            expect(check?.detail).toContain("location required");
        });
    });

    // --- value computation --------------------------------------------------

    describe("value computation", () => {
        it("computes zero difference when token = menu price", async () => {
            const admin = defaultAdmin();

            const result = await validateRedemption(BASE_INPUT, admin);

            expect(result.value.token_value).toBe(50);
            expect(result.value.menu_value).toBe(50);
            expect(result.value.difference_paid).toBe(0);
            expect(result.value.forfeited).toBe(0);
        });

        it("computes difference_paid when menu > token", async () => {
            const admin = buildFakeAdmin({
                tokens: [{ data: TOKEN_ROW, error: null }],
                vendors: [
                    { data: VENDOR_STATUS_ROW, error: null },
                    { data: VENDOR_AVAIL_ROW, error: null },
                    { data: VENDOR_GEO_ROW, error: null },
                    { data: { city: null }, error: null },
                ],
                vendor_menus: [{ data: { ...MENU_ROW, price: 80 }, error: null }],
            });

            const result = await validateRedemption(BASE_INPUT, admin);

            expect(result.value.difference_paid).toBe(30); // 80 - 50
            expect(result.value.forfeited).toBe(0);
        });

        it("computes forfeited when token > menu", async () => {
            const admin = buildFakeAdmin({
                tokens: [{ data: { ...TOKEN_ROW, value_inr: 100 }, error: null }],
                vendors: [
                    { data: VENDOR_STATUS_ROW, error: null },
                    { data: VENDOR_AVAIL_ROW, error: null },
                    { data: VENDOR_GEO_ROW, error: null },
                    { data: { city: null }, error: null },
                ],
                vendor_menus: [{ data: MENU_ROW, error: null }],
            });

            const result = await validateRedemption(BASE_INPUT, admin);

            expect(result.value.forfeited).toBe(50); // 100 - 50
            expect(result.value.difference_paid).toBe(0);
        });

        it("clamps co_pay to co_contribution_max", async () => {
            getNumberMock.mockImplementation(async (key: string) => {
                if (key === "co_contribution_max") return 20;
                if (key === "redemption_radius_km") return 5;
                if (key === "meal_cooldown_hours") return 6;
                if (key === "max_meals_per_day") return 3;
                throw new MissingConfigError(key, "missing");
            });

            const admin = defaultAdmin();
            const input = { ...BASE_INPUT, co_pay: 50 };

            const result = await validateRedemption(input, admin);

            expect(result.value.co_pay).toBe(20); // clamped to max 20
        });

        it("returns zero value when token or menu is missing", async () => {
            const admin = buildFakeAdmin({
                tokens: [{ data: null, error: null }],
            });

            const result = await validateRedemption(BASE_INPUT, admin);

            expect(result.value).toEqual({
                token_value: 0, menu_value: 0,
                difference_paid: 0, co_pay: 0, forfeited: 0,
            });
        });
    });

    // --- overall ok ---------------------------------------------------------

    describe("overall result", () => {
        it("ok=true when all hard checks pass (no geo, no face = soft skips)", async () => {
            const admin = defaultAdmin();

            // Override so geofence is NOT enforceable (no vendor geo)
            const adminNoGeo = buildFakeAdmin({
                tokens: [{ data: TOKEN_ROW, error: null }],
                vendors: [
                    { data: VENDOR_STATUS_ROW, error: null },
                    { data: VENDOR_AVAIL_ROW, error: null },
                    { data: { geo_lat: null, geo_lng: null }, error: null },
                    { data: { city: null }, error: null },
                ],
                vendor_menus: [{ data: MENU_ROW, error: null }],
            });

            const result = await validateRedemption(BASE_INPUT, adminNoGeo);

            expect(result.ok).toBe(true);
            // All hard checks should pass
            const failedHard = result.checks.filter(c => c.hard && !c.pass);
            expect(failedHard).toHaveLength(0);
        });

        it("ok=false when any hard check fails", async () => {
            // Use expired token
            const admin = buildFakeAdmin({
                tokens: [{ data: { ...TOKEN_ROW, expires_at: "2020-01-01T00:00:00.000Z" }, error: null }],
                vendors: [
                    { data: VENDOR_STATUS_ROW, error: null },
                    { data: VENDOR_AVAIL_ROW, error: null },
                    { data: { geo_lat: null, geo_lng: null }, error: null },
                    { data: { city: null }, error: null },
                ],
                vendor_menus: [{ data: MENU_ROW, error: null }],
            });

            const result = await validateRedemption(BASE_INPUT, admin);

            expect(result.ok).toBe(false);
        });

        it("ok=true even when soft checks fail", async () => {
            // No face, no geo, config unset → all soft skips but ok=true
            getNumberMock.mockImplementation(async (key: string) => {
                if (key === "co_contribution_max") return 0;
                if (key === "meal_cooldown_hours") return 0;
                if (key === "max_meals_per_day") return 0;
                throw new MissingConfigError(key, "missing");
            });

            const admin = buildFakeAdmin({
                tokens: [{ data: TOKEN_ROW, error: null }],
                vendors: [
                    { data: VENDOR_STATUS_ROW, error: null },
                    { data: VENDOR_AVAIL_ROW, error: null },
                    { data: { geo_lat: null, geo_lng: null }, error: null },
                    { data: { city: null }, error: null },
                ],
                vendor_menus: [{ data: MENU_ROW, error: null }],
            });

            const result = await validateRedemption(BASE_INPUT, admin);

            expect(result.ok).toBe(true);
            // Should have soft checks that are skipped/passed
            const softChecks = result.checks.filter(c => !c.hard);
            expect(softChecks.length).toBeGreaterThan(0);
        });
    });

    // --- city lock -----------------------------------------------------------

    describe("city lock", () => {
        it("soft-skips when city_lock_enabled is false", async () => {
            const admin = defaultAdmin();

            const result = await validateRedemption(BASE_INPUT, admin);

            const check = result.checks.find(c => c.name === "city_lock");
            expect(check?.pass).toBe(true);
            expect(check?.hard).toBe(false);
            expect(check?.detail).toContain("disabled");
        });

        it("passes when vendor city matches operating city", async () => {
            getBooleanMock.mockImplementation(async (key: string) => {
                if (key === "city_lock_enabled") return true;
                if (key === "meal_window_enforcement_enabled") return false;
                if (key === "vendor_capacity_enforcement_enabled") return false;
                if (key === "emergency_mode_enabled") return false;
                throw new MissingConfigError(key, "missing");
            });

            const admin = buildFakeAdmin({
                tokens: [{ data: TOKEN_ROW, error: null }],
                vendors: [
                    { data: VENDOR_STATUS_ROW, error: null },
                    { data: VENDOR_AVAIL_ROW, error: null },
                    { data: VENDOR_GEO_ROW, error: null },
                    { data: { city: "Komarapalayam" }, error: null },
                ],
                vendor_menus: [{ data: MENU_ROW, error: null }],
            });

            const result = await validateRedemption(BASE_INPUT, admin);

            const check = result.checks.find(c => c.name === "city_lock");
            expect(check?.pass).toBe(true);
        });

        it("fails when vendor city does not match operating city", async () => {
            getBooleanMock.mockImplementation(async (key: string) => {
                if (key === "city_lock_enabled") return true;
                if (key === "meal_window_enforcement_enabled") return false;
                if (key === "vendor_capacity_enforcement_enabled") return false;
                if (key === "emergency_mode_enabled") return false;
                throw new MissingConfigError(key, "missing");
            });

            const admin = buildFakeAdmin({
                tokens: [{ data: TOKEN_ROW, error: null }],
                vendors: [
                    { data: VENDOR_STATUS_ROW, error: null },
                    { data: VENDOR_AVAIL_ROW, error: null },
                    { data: VENDOR_GEO_ROW, error: null },
                    { data: { city: "Chennai" }, error: null },
                ],
                vendor_menus: [{ data: MENU_ROW, error: null }],
            });

            const result = await validateRedemption(BASE_INPUT, admin);

            const check = result.checks.find(c => c.name === "city_lock");
            expect(check?.pass).toBe(false);
            expect(check?.hard).toBe(true);
            expect(check?.detail).toContain("Chennai");
        });
    });

    // --- face / no face -----------------------------------------------------

    describe("face capture", () => {
        it("soft-skips when no face is provided (preview mode)", async () => {
            const admin = buildFakeAdmin({
                tokens: [{ data: TOKEN_ROW, error: null }],
                vendors: [
                    { data: VENDOR_STATUS_ROW, error: null },
                    { data: VENDOR_AVAIL_ROW, error: null },
                    { data: { geo_lat: null, geo_lng: null }, error: null },
                    { data: { city: null }, error: null },
                ],
                vendor_menus: [{ data: MENU_ROW, error: null }],
            });

            const result = await validateRedemption(BASE_INPUT, admin);

            const check = result.checks.find(c => c.name === "face");
            expect(check?.pass).toBe(true);
            expect(check?.hard).toBe(false);
            expect(check?.detail).toContain("pending");
        });
    });

    // --- vendor availability ------------------------------------------------

    describe("vendor availability", () => {
        it("fails when vendor is closed", async () => {
            const admin = buildFakeAdmin({
                tokens: [{ data: TOKEN_ROW, error: null }],
                vendors: [
                    { data: VENDOR_STATUS_ROW, error: null },
                    { data: { ...VENDOR_AVAIL_ROW, is_open: false }, error: null },
                    { data: VENDOR_GEO_ROW, error: null },
                    { data: { city: null }, error: null },
                ],
                vendor_menus: [{ data: MENU_ROW, error: null }],
            });

            const result = await validateRedemption(BASE_INPUT, admin);

            const check = result.checks.find(c => c.name === "vendor_availability");
            expect(check?.pass).toBe(false);
            expect(check?.detail).toContain("closed");
        });

        it("fails when vendor is out of stock", async () => {
            const admin = buildFakeAdmin({
                tokens: [{ data: TOKEN_ROW, error: null }],
                vendors: [
                    { data: VENDOR_STATUS_ROW, error: null },
                    { data: { ...VENDOR_AVAIL_ROW, stock_exhausted: true }, error: null },
                    { data: VENDOR_GEO_ROW, error: null },
                    { data: { city: null }, error: null },
                ],
                vendor_menus: [{ data: MENU_ROW, error: null }],
            });

            const result = await validateRedemption(BASE_INPUT, admin);

            const check = result.checks.find(c => c.name === "vendor_availability");
            expect(check?.pass).toBe(false);
            expect(check?.detail).toContain("out of stock");
        });

        it("soft-skips when availability fields unavailable", async () => {
            const admin = buildFakeAdmin({
                tokens: [{ data: TOKEN_ROW, error: null }],
                vendors: [
                    { data: VENDOR_STATUS_ROW, error: null },
                    { data: null, error: { message: "column not found" } },
                    { data: VENDOR_GEO_ROW, error: null },
                    { data: { city: null }, error: null },
                ],
                vendor_menus: [{ data: MENU_ROW, error: null }],
            });

            const result = await validateRedemption(BASE_INPUT, admin);

            const check = result.checks.find(c => c.name === "vendor_availability");
            expect(check?.pass).toBe(true);
            expect(check?.hard).toBe(false);
            expect(check?.detail).toContain("skipped");
        });
    });

    // --- return shape -------------------------------------------------------

    describe("return shape", () => {
        it("returns token and menuItem in result", async () => {
            const admin = buildFakeAdmin({
                tokens: [{ data: TOKEN_ROW, error: null }],
                vendors: [
                    { data: VENDOR_STATUS_ROW, error: null },
                    { data: VENDOR_AVAIL_ROW, error: null },
                    { data: { geo_lat: null, geo_lng: null }, error: null },
                    { data: { city: null }, error: null },
                ],
                vendor_menus: [{ data: MENU_ROW, error: null }],
            });

            const result = await validateRedemption(BASE_INPUT, admin);

            expect(result.token).not.toBeNull();
            expect(result.token?.id).toBe("token-1");
            expect(result.menuItem).not.toBeNull();
            expect(result.menuItem?.item_name).toBe("Rice & Sambar");
        });

        it("checks array contains all evaluated checks", async () => {
            const admin = buildFakeAdmin({
                tokens: [{ data: TOKEN_ROW, error: null }],
                vendors: [
                    { data: VENDOR_STATUS_ROW, error: null },
                    { data: VENDOR_AVAIL_ROW, error: null },
                    { data: { geo_lat: null, geo_lng: null }, error: null },
                    { data: { city: null }, error: null },
                ],
                vendor_menus: [{ data: MENU_ROW, error: null }],
            });

            const result = await validateRedemption(BASE_INPUT, admin);

            const checkNames = result.checks.map(c => c.name);
            expect(checkNames).toContain("token");
            expect(checkNames).toContain("vendor_status");
            expect(checkNames).toContain("vendor_availability");
            expect(checkNames).toContain("menu");
        });
    });
});
