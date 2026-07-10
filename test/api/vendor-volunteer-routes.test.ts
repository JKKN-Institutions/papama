import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UnauthorizedError, type AppUser } from "@/lib/auth";

/**
 * Smoke tests for vendor + volunteer route guards — verifies 401 / 403 / 200
 * through the real defineRoute permission matrix for every vendor and volunteer
 * endpoint. The Supabase client and auth are mocked; we are testing the guard
 * layer, not the DB.
 */

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock("@/lib/auth", async (importActual) => {
    const actual = await importActual<typeof import("@/lib/auth")>();
    return { ...actual, requireAppUser: vi.fn() };
});
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

// Many vendor/volunteer routes use admin client, vendor/volunteer identity
// resolvers, and various service modules — mock them all at the module level.
vi.mock("@/lib/supabase/admin", () => {
    const makeChain = () => {
        const objResult = { data: { id: "mock-id" }, error: null };
        const arrResult = { data: [], error: null };
        const builder: Record<string, unknown> = {};
        const self = () => builder;
        for (const m of ["from", "select", "insert", "update", "delete", "eq", "in", "order", "limit", "range"]) {
            builder[m] = vi.fn(self);
        }
        builder.maybeSingle = vi.fn().mockResolvedValue(objResult);
        builder.single = vi.fn().mockResolvedValue(objResult);
        builder.then = (resolve: (v: unknown) => void) => resolve(arrResult);
        builder.rpc = vi.fn().mockResolvedValue({ data: null, error: null });
        builder.storage = {
            from: () => ({
                upload: vi.fn().mockResolvedValue({ error: null }),
                createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: "https://signed.url" } }),
            }),
        };
        builder.auth = {
            admin: {
                createUser: vi.fn().mockResolvedValue({ data: { user: { id: "u1" } }, error: null }),
                deleteUser: vi.fn().mockResolvedValue({ error: null }),
            },
        };
        return builder;
    };
    return { createAdminClient: vi.fn(() => makeChain()) };
});
vi.mock("@/lib/vendor/server-identity", () => ({
    resolveVendorId: vi.fn(async () => "vendor-001"),
}));
vi.mock("@/lib/volunteer/server-identity", () => ({
    resolveVolunteerId: vi.fn(async () => "volunteer-001"),
}));
vi.mock("@/lib/services/vendorCapacity", () => ({
    getRemainingCapacity: vi.fn(async () => ({ served: 5, remaining: 15 })),
    incrementUsage: vi.fn(async () => {}),
}));
vi.mock("@/lib/volunteer/holdings", () => ({
    countHeldTokens: vi.fn(async () => 3),
    listHeldTokens: vi.fn(async () => []),
    listDistributedTokens: vi.fn(async () => []),
    GRANT_CHANNELS: ["admin_to_volunteer", "volunteer_request_grant"],
}));
vi.mock("@/lib/system-config", () => ({
    getConfig: vi.fn(async () => 50),
    getNumber: vi.fn(async () => 50),
    getBoolean: vi.fn(async () => true),
    MissingConfigError: class MissingConfigError extends Error {
        constructor(message = "missing config") { super(message); this.name = "MissingConfigError"; }
    },
}));
vi.mock("@/lib/services/redemption", () => ({
    validateRedemption: vi.fn(async () => ({
        ok: true,
        checks: [],
        token: { id: "t1", status: "live", token_type: "standard", value_inr: 100, expires_at: null, donor_id: "d1" },
        menuItem: { id: "m1", item_name: "Meal", price: 80 },
        beneficiary: null,
        value: { token_value: 100, menu_value: 80, difference_paid: 0, co_pay: 0, forfeited: 20 },
    })),
}));
vi.mock("@/lib/services/fraud", () => ({ flagFraud: vi.fn(async () => {}) }));
vi.mock("@/lib/face/embedding", () => ({
    embeddingFingerprint: vi.fn(() => "face-hash-abc"),
    toVectorLiteral: vi.fn(() => "[0.1,0.2]"),
}));
vi.mock("@/lib/face/liveness", () => ({ assertLiveness: vi.fn(async () => {}) }));
// Let @/lib/validation/schemas import naturally — they are pure Zod schemas.
vi.mock("@/lib/notifications/dispatch", () => ({
    dispatchNotification: vi.fn(async () => {}),
}));
vi.mock("@/lib/services/proofIntegrity", () => ({
    computePhash: vi.fn(() => "phash-abc"),
    findDuplicateProof: vi.fn(async () => null),
}));
vi.mock("@/lib/services/volunteerActivity", () => ({
    logActivity: vi.fn(async () => {}),
}));

// ── Imports (AFTER mocks) ──────────────────────────────────────────────────────

import { requireAppUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Vendor routes
import { GET as vendorProfileGET, PATCH as vendorProfilePATCH } from "@/app/api/vendor/profile/route";
import { GET as vendorAvailGET, PATCH as vendorAvailPATCH } from "@/app/api/vendor/availability/route";
import { GET as vendorDocsGET, POST as vendorDocsPOST } from "@/app/api/vendor/documents/route";
import { GET as vendorMenusGET, POST as vendorMenusPOST } from "@/app/api/vendor/menus/route";
import { PATCH as vendorMenuPATCH, DELETE as vendorMenuDELETE } from "@/app/api/vendor/menus/[id]/route";
import { GET as vendorRedemptionsGET, POST as vendorRedemptionsPOST } from "@/app/api/vendor/redemptions/route";
import { POST as vendorRedemptionPreviewPOST } from "@/app/api/vendor/redemptions/preview/route";
import { POST as vendorProofPOST } from "@/app/api/vendor/redemptions/[id]/proof/route";
import { GET as vendorSettlementsGET } from "@/app/api/vendor/settlements/route";

// Volunteer routes
import { GET as volunteerAllocationGET } from "@/app/api/volunteer/allocation/route";
import { GET as volunteerTokensGET } from "@/app/api/volunteer/tokens/route";
import { POST as volunteerDistributePOST } from "@/app/api/volunteer/tokens/[id]/distribute/route";
import { GET as volunteerRequestsGET, POST as volunteerRequestsPOST } from "@/app/api/volunteer/requests/route";
import { GET as volunteerBenRegGET, POST as volunteerBenRegPOST } from "@/app/api/volunteer/beneficiary-registrations/route";

const requireAppUserMock = vi.mocked(requireAppUser);
const createClientMock = vi.mocked(createClient);

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeUser(role: AppUser["role"]): AppUser {
    return { id: "a0000000-0000-4000-8000-000000000001", email: "u@papama.test", role, donor_id: null };
}

/** A chainable Supabase client mock that resolves any query chain to { data, error: null }. */
function fakeClient(data: unknown = []) {
    const result = { data, error: null };
    const builder: Record<string, unknown> = {};
    const self = () => builder;
    // Every chainable method returns the same builder object.
    for (const m of ["from", "select", "insert", "update", "delete", "eq", "in", "order", "limit", "range"]) {
        builder[m] = vi.fn(self);
    }
    // Terminal methods resolve to { data, error: null }.
    builder.maybeSingle = vi.fn().mockResolvedValue(result);
    builder.single = vi.fn().mockResolvedValue(result);
    // Make the builder itself awaitable for chains that end without a terminal.
    builder.then = (resolve: (v: unknown) => void) => resolve(result);
    // Storage for document routes.
    builder.storage = {
        from: () => ({
            upload: vi.fn().mockResolvedValue({ error: null }),
            createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: "https://signed.url" } }),
        }),
    };
    // Return an object that is NOT thenable at the top level (so mockResolvedValue
    // won't auto-unwrap it), but whose .from() chain IS thenable.
    return { from: builder.from, storage: builder.storage } as unknown as Awaited<ReturnType<typeof createClient>>;
}

function jsonReq(url: string, body?: unknown): NextRequest {
    if (body !== undefined) {
        return new NextRequest(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
        });
    }
    return new NextRequest(url);
}

function patchReq(url: string, body: unknown): NextRequest {
    return new NextRequest(url, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}

// ── Test suites ────────────────────────────────────────────────────────────────

describe("vendor route guards", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        createClientMock.mockResolvedValue(fakeClient());
    });

    // ── vendor/profile GET ─────────────────────────────────────────────────
    describe("GET /api/vendor/profile", () => {
        const req = () => new NextRequest("http://localhost/api/vendor/profile");

        it("returns 401 when unauthenticated", async () => {
            requireAppUserMock.mockRejectedValue(new UnauthorizedError());
            const res = await vendorProfileGET(req());
            expect(res.status).toBe(401);
        });

        it("returns 403 for donor role", async () => {
            requireAppUserMock.mockResolvedValue(makeUser("donor"));
            const res = await vendorProfileGET(req());
            expect(res.status).toBe(403);
        });

        it("returns 200 for vendor role", async () => {
            requireAppUserMock.mockResolvedValue(makeUser("vendor"));
            createClientMock.mockResolvedValue(fakeClient({ id: "v1", name: "Test" }));
            const res = await vendorProfileGET(req());
            expect(res.status).toBe(200);
        });
    });

    // ── vendor/profile PATCH ───────────────────────────────────────────────
    describe("PATCH /api/vendor/profile", () => {
        const req = () => patchReq("http://localhost/api/vendor/profile", { name: "Updated" });

        it("returns 401 when unauthenticated", async () => {
            requireAppUserMock.mockRejectedValue(new UnauthorizedError());
            const res = await vendorProfilePATCH(req());
            expect(res.status).toBe(401);
        });

        it("returns 403 for donor role", async () => {
            requireAppUserMock.mockResolvedValue(makeUser("donor"));
            const res = await vendorProfilePATCH(req());
            expect(res.status).toBe(403);
        });

        it("returns 200 for vendor role", async () => {
            requireAppUserMock.mockResolvedValue(makeUser("vendor"));
            createClientMock.mockResolvedValue(fakeClient({ id: "v1", name: "Updated" }));
            const res = await vendorProfilePATCH(req());
            expect(res.status).toBe(200);
        });
    });

    // ── vendor/availability GET ────────────────────────────────────────────
    describe("GET /api/vendor/availability", () => {
        const req = () => new NextRequest("http://localhost/api/vendor/availability");

        it("returns 401 when unauthenticated", async () => {
            requireAppUserMock.mockRejectedValue(new UnauthorizedError());
            const res = await vendorAvailGET(req());
            expect(res.status).toBe(401);
        });

        it("returns 403 for donor role", async () => {
            requireAppUserMock.mockResolvedValue(makeUser("donor"));
            const res = await vendorAvailGET(req());
            expect(res.status).toBe(403);
        });

        it("returns 200 for vendor role", async () => {
            requireAppUserMock.mockResolvedValue(makeUser("vendor"));
            createClientMock.mockResolvedValue(fakeClient({ id: "v1", name: "Test", status: "approved", is_open: true, stock_exhausted: false, temporary_closure_until: null, daily_meal_capacity: 20 }));
            const res = await vendorAvailGET(req());
            expect(res.status).toBe(200);
        });
    });

    // ── vendor/availability PATCH ──────────────────────────────────────────
    describe("PATCH /api/vendor/availability", () => {
        const req = () => patchReq("http://localhost/api/vendor/availability", { is_open: false });

        it("returns 401 when unauthenticated", async () => {
            requireAppUserMock.mockRejectedValue(new UnauthorizedError());
            const res = await vendorAvailPATCH(req());
            expect(res.status).toBe(401);
        });

        it("returns 403 for donor role", async () => {
            requireAppUserMock.mockResolvedValue(makeUser("donor"));
            const res = await vendorAvailPATCH(req());
            expect(res.status).toBe(403);
        });

        it("returns 200 for vendor role", async () => {
            requireAppUserMock.mockResolvedValue(makeUser("vendor"));
            createClientMock.mockResolvedValue(fakeClient({ id: "v1", is_open: false }));
            const res = await vendorAvailPATCH(req());
            expect(res.status).toBe(200);
        });
    });

    // ── vendor/documents GET ───────────────────────────────────────────────
    describe("GET /api/vendor/documents", () => {
        const req = () => new NextRequest("http://localhost/api/vendor/documents");

        it("returns 401 when unauthenticated", async () => {
            requireAppUserMock.mockRejectedValue(new UnauthorizedError());
            const res = await vendorDocsGET(req());
            expect(res.status).toBe(401);
        });

        it("returns 403 for donor role", async () => {
            requireAppUserMock.mockResolvedValue(makeUser("donor"));
            const res = await vendorDocsGET(req());
            expect(res.status).toBe(403);
        });

        it("returns 200 for vendor role", async () => {
            requireAppUserMock.mockResolvedValue(makeUser("vendor"));
            const res = await vendorDocsGET(req());
            expect(res.status).toBe(200);
        });
    });

    // ── vendor/documents POST ──────────────────────────────────────────────
    describe("POST /api/vendor/documents", () => {
        it("returns 401 when unauthenticated", async () => {
            requireAppUserMock.mockRejectedValue(new UnauthorizedError());
            const req = new NextRequest("http://localhost/api/vendor/documents", { method: "POST" });
            const res = await vendorDocsPOST(req);
            expect(res.status).toBe(401);
        });

        it("returns 403 for donor role", async () => {
            requireAppUserMock.mockResolvedValue(makeUser("donor"));
            const req = new NextRequest("http://localhost/api/vendor/documents", { method: "POST" });
            const res = await vendorDocsPOST(req);
            expect(res.status).toBe(403);
        });
    });

    // ── vendor/menus GET ───────────────────────────────────────────────────
    describe("GET /api/vendor/menus", () => {
        const req = () => new NextRequest("http://localhost/api/vendor/menus");

        it("returns 401 when unauthenticated", async () => {
            requireAppUserMock.mockRejectedValue(new UnauthorizedError());
            const res = await vendorMenusGET(req());
            expect(res.status).toBe(401);
        });

        it("returns 403 for donor role", async () => {
            requireAppUserMock.mockResolvedValue(makeUser("donor"));
            const res = await vendorMenusGET(req());
            expect(res.status).toBe(403);
        });

        it("returns 200 for vendor role", async () => {
            requireAppUserMock.mockResolvedValue(makeUser("vendor"));
            createClientMock.mockResolvedValue(fakeClient([]));
            const res = await vendorMenusGET(req());
            expect(res.status).toBe(200);
        });
    });

    // ── vendor/menus POST ──────────────────────────────────────────────────
    describe("POST /api/vendor/menus", () => {
        const req = () => jsonReq("http://localhost/api/vendor/menus", {
            item_name: "Dosa", price: 40,
        });

        it("returns 401 when unauthenticated", async () => {
            requireAppUserMock.mockRejectedValue(new UnauthorizedError());
            const res = await vendorMenusPOST(req());
            expect(res.status).toBe(401);
        });

        it("returns 403 for donor role", async () => {
            requireAppUserMock.mockResolvedValue(makeUser("donor"));
            const res = await vendorMenusPOST(req());
            expect(res.status).toBe(403);
        });

        it("returns 200 for vendor role", async () => {
            requireAppUserMock.mockResolvedValue(makeUser("vendor"));
            createClientMock.mockResolvedValue(fakeClient({ id: "m1" }));
            const res = await vendorMenusPOST(req());
            expect(res.status).toBe(200);
        });
    });

    // ── vendor/menus/[id] PATCH ────────────────────────────────────────────
    describe("PATCH /api/vendor/menus/[id]", () => {
        const req = () => patchReq("http://localhost/api/vendor/menus/m1", { item_name: "Idli" });
        const params = { params: Promise.resolve({ id: "m1" }) };

        it("returns 401 when unauthenticated", async () => {
            requireAppUserMock.mockRejectedValue(new UnauthorizedError());
            const res = await vendorMenuPATCH(req(), params);
            expect(res.status).toBe(401);
        });

        it("returns 403 for donor role", async () => {
            requireAppUserMock.mockResolvedValue(makeUser("donor"));
            const res = await vendorMenuPATCH(req(), params);
            expect(res.status).toBe(403);
        });

        it("returns 200 for vendor role", async () => {
            requireAppUserMock.mockResolvedValue(makeUser("vendor"));
            createClientMock.mockResolvedValue(fakeClient({ id: "m1", item_name: "Idli", price: 30 }));
            const res = await vendorMenuPATCH(req(), params);
            expect(res.status).toBe(200);
        });
    });

    // ── vendor/menus/[id] DELETE ───────────────────────────────────────────
    // The matrix gives vendor only create/read/update on vendor_menu_pricing,
    // NOT delete. So vendor gets 403 for delete; admin has full CRUD.
    describe("DELETE /api/vendor/menus/[id]", () => {
        const req = () => new NextRequest("http://localhost/api/vendor/menus/m1", { method: "DELETE" });
        const params = { params: Promise.resolve({ id: "m1" }) };

        it("returns 401 when unauthenticated", async () => {
            requireAppUserMock.mockRejectedValue(new UnauthorizedError());
            const res = await vendorMenuDELETE(req(), params);
            expect(res.status).toBe(401);
        });

        it("returns 403 for vendor role (no delete on vendor_menu_pricing)", async () => {
            requireAppUserMock.mockResolvedValue(makeUser("vendor"));
            const res = await vendorMenuDELETE(req(), params);
            expect(res.status).toBe(403);
        });

        it("returns 200 for admin role", async () => {
            requireAppUserMock.mockResolvedValue(makeUser("admin"));
            createClientMock.mockResolvedValue(fakeClient({ id: "m1" }));
            const res = await vendorMenuDELETE(req(), params);
            expect(res.status).toBe(200);
        });
    });

    // ── vendor/redemptions GET ─────────────────────────────────────────────
    describe("GET /api/vendor/redemptions", () => {
        const req = () => new NextRequest("http://localhost/api/vendor/redemptions");

        it("returns 401 when unauthenticated", async () => {
            requireAppUserMock.mockRejectedValue(new UnauthorizedError());
            const res = await vendorRedemptionsGET(req());
            expect(res.status).toBe(401);
        });

        it("returns 403 for donor role", async () => {
            requireAppUserMock.mockResolvedValue(makeUser("donor"));
            const res = await vendorRedemptionsGET(req());
            expect(res.status).toBe(403);
        });

        it("returns 200 for vendor role", async () => {
            requireAppUserMock.mockResolvedValue(makeUser("vendor"));
            createClientMock.mockResolvedValue(fakeClient([]));
            const res = await vendorRedemptionsGET(req());
            expect(res.status).toBe(200);
        });
    });

    // ── vendor/redemptions POST ────────────────────────────────────────────
    describe("POST /api/vendor/redemptions", () => {
        it("returns 401 when unauthenticated", async () => {
            requireAppUserMock.mockRejectedValue(new UnauthorizedError());
            const req = jsonReq("http://localhost/api/vendor/redemptions", {
                qr_payload: "tok-abc", menu_item_id: "a0000000-0000-4000-8000-000000000002",
                face_capture: { embedding: [0.1, 0.2], liveness_score: 0.95 },
            });
            const res = await vendorRedemptionsPOST(req);
            expect(res.status).toBe(401);
        });

        it("returns 403 for donor role", async () => {
            requireAppUserMock.mockResolvedValue(makeUser("donor"));
            const req = jsonReq("http://localhost/api/vendor/redemptions", {
                qr_payload: "tok-abc", menu_item_id: "a0000000-0000-4000-8000-000000000002",
                face_capture: { embedding: [0.1, 0.2], liveness_score: 0.95 },
            });
            const res = await vendorRedemptionsPOST(req);
            expect(res.status).toBe(403);
        });
    });

    // ── vendor/redemptions/preview POST ────────────────────────────────────
    describe("POST /api/vendor/redemptions/preview", () => {
        const req = () => jsonReq("http://localhost/api/vendor/redemptions/preview", {
            qr_payload: "tok-abc", menu_item_id: "a0000000-0000-4000-8000-000000000002",
        });

        it("returns 401 when unauthenticated", async () => {
            requireAppUserMock.mockRejectedValue(new UnauthorizedError());
            const res = await vendorRedemptionPreviewPOST(req());
            expect(res.status).toBe(401);
        });

        it("returns 403 for donor role", async () => {
            requireAppUserMock.mockResolvedValue(makeUser("donor"));
            const res = await vendorRedemptionPreviewPOST(req());
            expect(res.status).toBe(403);
        });

        it("returns 200 for vendor role", async () => {
            requireAppUserMock.mockResolvedValue(makeUser("vendor"));
            const res = await vendorRedemptionPreviewPOST(req());
            expect(res.status).toBe(200);
        });
    });

    // ── vendor/redemptions/[id]/proof POST ─────────────────────────────────
    describe("POST /api/vendor/redemptions/[id]/proof", () => {
        it("returns 401 when unauthenticated", async () => {
            requireAppUserMock.mockRejectedValue(new UnauthorizedError());
            const req = new NextRequest("http://localhost/api/vendor/redemptions/r1/proof", { method: "POST" });
            const res = await vendorProofPOST(req, { params: Promise.resolve({ id: "r1" }) });
            expect(res.status).toBe(401);
        });

        it("returns 403 for donor role", async () => {
            requireAppUserMock.mockResolvedValue(makeUser("donor"));
            const req = new NextRequest("http://localhost/api/vendor/redemptions/r1/proof", { method: "POST" });
            const res = await vendorProofPOST(req, { params: Promise.resolve({ id: "r1" }) });
            expect(res.status).toBe(403);
        });
    });

    // ── vendor/settlements GET ─────────────────────────────────────────────
    describe("GET /api/vendor/settlements", () => {
        const req = () => new NextRequest("http://localhost/api/vendor/settlements");

        it("returns 401 when unauthenticated", async () => {
            requireAppUserMock.mockRejectedValue(new UnauthorizedError());
            const res = await vendorSettlementsGET(req());
            expect(res.status).toBe(401);
        });

        it("returns 403 for donor role", async () => {
            requireAppUserMock.mockResolvedValue(makeUser("donor"));
            const res = await vendorSettlementsGET(req());
            expect(res.status).toBe(403);
        });

        it("returns 200 for vendor role", async () => {
            requireAppUserMock.mockResolvedValue(makeUser("vendor"));
            createClientMock.mockResolvedValue(fakeClient([]));
            const res = await vendorSettlementsGET(req());
            expect(res.status).toBe(200);
        });
    });
});

describe("volunteer route guards", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        createClientMock.mockResolvedValue(fakeClient());
    });

    // ── volunteer/allocation GET ───────────────────────────────────────────
    // Feature: token_distribution/read — donor HAS access; use beneficiary for 403.
    describe("GET /api/volunteer/allocation", () => {
        const req = () => new NextRequest("http://localhost/api/volunteer/allocation");

        it("returns 401 when unauthenticated", async () => {
            requireAppUserMock.mockRejectedValue(new UnauthorizedError());
            const res = await volunteerAllocationGET(req());
            expect(res.status).toBe(401);
        });

        it("returns 403 for beneficiary role (no token_distribution access)", async () => {
            requireAppUserMock.mockResolvedValue(makeUser("beneficiary"));
            const res = await volunteerAllocationGET(req());
            expect(res.status).toBe(403);
        });

        it("returns 200 for volunteer role", async () => {
            requireAppUserMock.mockResolvedValue(makeUser("volunteer"));
            const res = await volunteerAllocationGET(req());
            expect(res.status).toBe(200);
        });
    });

    // ── volunteer/tokens GET ───────────────────────────────────────────────
    // Feature: token_generation/read — donor HAS access; use beneficiary for 403.
    describe("GET /api/volunteer/tokens", () => {
        const req = () => new NextRequest("http://localhost/api/volunteer/tokens");

        it("returns 401 when unauthenticated", async () => {
            requireAppUserMock.mockRejectedValue(new UnauthorizedError());
            const res = await volunteerTokensGET(req());
            expect(res.status).toBe(401);
        });

        it("returns 403 for beneficiary role (no token_generation read)", async () => {
            requireAppUserMock.mockResolvedValue(makeUser("beneficiary"));
            const res = await volunteerTokensGET(req());
            expect(res.status).toBe(403);
        });

        it("returns 200 for volunteer role", async () => {
            requireAppUserMock.mockResolvedValue(makeUser("volunteer"));
            const res = await volunteerTokensGET(req());
            expect(res.status).toBe(200);
        });
    });

    // ── volunteer/tokens/[id]/distribute POST ──────────────────────────────
    // Feature: token_distribution/create — donor HAS access; use beneficiary for 403.
    describe("POST /api/volunteer/tokens/[id]/distribute", () => {
        const req = () => jsonReq("http://localhost/api/volunteer/tokens/t1/distribute", {});
        const params = { params: Promise.resolve({ id: "t1" }) };

        it("returns 401 when unauthenticated", async () => {
            requireAppUserMock.mockRejectedValue(new UnauthorizedError());
            const res = await volunteerDistributePOST(req(), params);
            expect(res.status).toBe(401);
        });

        it("returns 403 for beneficiary role (no token_distribution create)", async () => {
            requireAppUserMock.mockResolvedValue(makeUser("beneficiary"));
            const res = await volunteerDistributePOST(req(), params);
            expect(res.status).toBe(403);
        });
    });

    // ── volunteer/requests GET ─────────────────────────────────────────────
    // Feature: token_distribution/read — donor HAS access; use beneficiary for 403.
    describe("GET /api/volunteer/requests", () => {
        const req = () => new NextRequest("http://localhost/api/volunteer/requests");

        it("returns 401 when unauthenticated", async () => {
            requireAppUserMock.mockRejectedValue(new UnauthorizedError());
            const res = await volunteerRequestsGET(req());
            expect(res.status).toBe(401);
        });

        it("returns 403 for beneficiary role (no token_distribution read)", async () => {
            requireAppUserMock.mockResolvedValue(makeUser("beneficiary"));
            const res = await volunteerRequestsGET(req());
            expect(res.status).toBe(403);
        });

        it("returns 200 for volunteer role", async () => {
            requireAppUserMock.mockResolvedValue(makeUser("volunteer"));
            createClientMock.mockResolvedValue(fakeClient([]));
            const res = await volunteerRequestsGET(req());
            expect(res.status).toBe(200);
        });
    });

    // ── volunteer/requests POST ────────────────────────────────────────────
    // Feature: token_distribution/create — donor HAS access; use beneficiary for 403.
    describe("POST /api/volunteer/requests", () => {
        const req = () => jsonReq("http://localhost/api/volunteer/requests", { requested_count: 10 });

        it("returns 401 when unauthenticated", async () => {
            requireAppUserMock.mockRejectedValue(new UnauthorizedError());
            const res = await volunteerRequestsPOST(req());
            expect(res.status).toBe(401);
        });

        it("returns 403 for beneficiary role (no token_distribution create)", async () => {
            requireAppUserMock.mockResolvedValue(makeUser("beneficiary"));
            const res = await volunteerRequestsPOST(req());
            expect(res.status).toBe(403);
        });
    });

    // ── volunteer/beneficiary-registrations GET ────────────────────────────
    describe("GET /api/volunteer/beneficiary-registrations", () => {
        const req = () => new NextRequest("http://localhost/api/volunteer/beneficiary-registrations");

        it("returns 401 when unauthenticated", async () => {
            requireAppUserMock.mockRejectedValue(new UnauthorizedError());
            const res = await volunteerBenRegGET(req());
            expect(res.status).toBe(401);
        });

        it("returns 403 for donor role", async () => {
            requireAppUserMock.mockResolvedValue(makeUser("donor"));
            const res = await volunteerBenRegGET(req());
            expect(res.status).toBe(403);
        });

        it("returns 200 for volunteer role", async () => {
            requireAppUserMock.mockResolvedValue(makeUser("volunteer"));
            createClientMock.mockResolvedValue(fakeClient([]));
            const res = await volunteerBenRegGET(req());
            expect(res.status).toBe(200);
        });
    });

    // ── volunteer/beneficiary-registrations POST ───────────────────────────
    describe("POST /api/volunteer/beneficiary-registrations", () => {
        const req = () => jsonReq("http://localhost/api/volunteer/beneficiary-registrations", {
            category: "patient",
        });

        it("returns 401 when unauthenticated", async () => {
            requireAppUserMock.mockRejectedValue(new UnauthorizedError());
            const res = await volunteerBenRegPOST(req());
            expect(res.status).toBe(401);
        });

        it("returns 403 for donor role", async () => {
            requireAppUserMock.mockResolvedValue(makeUser("donor"));
            const res = await volunteerBenRegPOST(req());
            expect(res.status).toBe(403);
        });

        it("returns 200 for volunteer role", async () => {
            requireAppUserMock.mockResolvedValue(makeUser("volunteer"));
            const res = await volunteerBenRegPOST(req());
            expect(res.status).toBe(200);
        });
    });
});
