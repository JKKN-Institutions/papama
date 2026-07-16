import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UnauthorizedError, type AppUser } from "@/lib/auth";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/auth", async (importActual) => {
    const actual = await importActual<typeof import("@/lib/auth")>();
    return { ...actual, requireAppUser: vi.fn() };
});

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

// Service-level mocks
vi.mock("@/lib/donor/server-identity", () => ({
    resolveDonorId: vi.fn().mockResolvedValue("donor-001"),
}));
vi.mock("@/lib/system-config", () => ({
    getNumber: vi.fn().mockResolvedValue(50),
    getBoolean: vi.fn().mockResolvedValue(false),
}));
vi.mock("@/lib/services/consent", () => ({
    CURRENT_CONSENT_VERSION: 1,
    recordConsent: vi.fn().mockResolvedValue("consent-001"),
}));
vi.mock("@/lib/services/csr", () => ({
    csr80gCertificatesEnabled: vi.fn().mockReturnValue(false),
    generateCsrReport: vi.fn(),
}));
vi.mock("@/app/api/_lib/tokenQr", () => ({
    deriveQrPayload: vi.fn().mockReturnValue("qr-payload"),
    qrHashOf: vi.fn().mockReturnValue("qr-hash"),
}));
vi.mock("@/app/api/_lib/recordDonation", () => ({
    recordDonation: vi.fn().mockResolvedValue({
        donation_id: "don-001",
        credit_balance: 100,
        token_minted: false,
    }),
}));
vi.mock("@/lib/donations/guest-pool", () => ({
    GUEST_POOL_EMAIL: "guest-pool@papama.test",
    getGuestPoolBalance: vi.fn().mockResolvedValue(0),
    ensureGuestPoolDonor: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { requireAppUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

import { GET as profileGET } from "@/app/api/donor/profile/route";
import { GET as creditsGET } from "@/app/api/donor/credits/route";
import { GET as tokensGET } from "@/app/api/donor/tokens/route";
import { GET as notificationsGET } from "@/app/api/donor/notifications/route";
import { GET as consentGET } from "@/app/api/donor/consent/route";
import { GET as dashboardGET } from "@/app/api/donor/dashboard/route";
import { GET as csrGET } from "@/app/api/donor/csr/route";
import { POST as donationCreatePOST } from "@/app/api/donations/create/route";

// ---------------------------------------------------------------------------
// Typed mock handles
// ---------------------------------------------------------------------------

const requireAppUserMock = vi.mocked(requireAppUser);
const createClientMock = vi.mocked(createClient);
const createAdminClientMock = vi.mocked(createAdminClient);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeUser(role: AppUser["role"], overrides?: Partial<AppUser>): AppUser {
    return {
        id: "00000000-0000-0000-0000-000000000001",
        email: "donor@papama.test",
        role,
        donor_id: role === "donor" ? "donor-001" : null,
        ...overrides,
    };
}

/** Fake Supabase client whose chained calls resolve to `rows`. */
function fakeClient(rows: unknown[] = []) {
    const signedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: "https://signed.test/photo" }, error: null });
    const createSignedUrl = vi.fn().mockResolvedValue({ data: { signedUrl: "https://signed.test/photo" }, error: null });
    const storage = { from: vi.fn(() => ({ createSignedUrl })) };
    const maybeSingle = vi.fn().mockResolvedValue({ data: rows[0] ?? null, error: null });
    const limit = vi.fn().mockResolvedValue({ data: rows, error: null });
    const eq = vi.fn(() => ({ eq, maybeSingle, limit, order: vi.fn(() => ({ limit, range })) }));
    const range = vi.fn().mockResolvedValue({ data: rows, error: null });
    const order = vi.fn(() => ({ range, limit, eq }));
    const select = vi.fn(() => ({ order, eq, limit, maybeSingle }));
    const from = vi.fn(() => ({ select, insert: vi.fn().mockResolvedValue({ data: rows, error: null }) }));
    const rpc = vi.fn().mockResolvedValue({ data: rows, error: null });
    return { from, rpc, storage } as unknown as Awaited<ReturnType<typeof createClient>>;
}

function req(url = "http://localhost/api/donor/test") {
    return new NextRequest(url);
}

// ---------------------------------------------------------------------------
// Route test table
// ---------------------------------------------------------------------------

interface RouteSpec {
    name: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test harness accepts any defineRoute handler shape
    handler: (req: NextRequest, ctx?: any) => Promise<Response>;
    method: "GET" | "POST";
    body?: Record<string, unknown>;
}

const donorRoutes: RouteSpec[] = [
    { name: "donor/profile GET", handler: profileGET, method: "GET" },
    { name: "donor/credits GET", handler: creditsGET, method: "GET" },
    { name: "donor/tokens GET", handler: tokensGET, method: "GET" },
    { name: "donor/notifications GET", handler: notificationsGET, method: "GET" },
    { name: "donor/consent GET", handler: consentGET, method: "GET" },
    { name: "donor/dashboard GET", handler: dashboardGET, method: "GET" },
    { name: "donor/csr GET", handler: csrGET, method: "GET" },
];

/**
 * donations/create POST is special: the permission matrix grants guest
 * `donor_donation_credit/create`, so a guest is NOT 403. We test it
 * separately with a `beneficiary` role (which has no donation create).
 */
const donationCreateRoute: RouteSpec = {
    name: "donations/create POST",
    handler: donationCreatePOST,
    method: "POST",
    body: { amount_inr: 100 },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("donor API routes — auth guard", () => {
    beforeEach(() => vi.clearAllMocks());

    function setupFakeClients() {
        const client = fakeClient([
            { id: "row-1", name: "Test Donor", pan_number: null, balance_inr: 100 },
        ]);
        createClientMock.mockResolvedValue(client);
        createAdminClientMock.mockReturnValue(client as never);
    }

    for (const route of donorRoutes) {
        describe(route.name, () => {
            function makeReq(): NextRequest {
                if (route.method === "POST" && route.body) {
                    return new NextRequest("http://localhost/api/donor/test", {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify(route.body),
                    });
                }
                return new NextRequest("http://localhost/api/donor/test");
            }

            it("returns 401 when unauthenticated", async () => {
                requireAppUserMock.mockRejectedValue(new UnauthorizedError());

                const res = await route.handler(makeReq());

                expect(res.status).toBe(401);
                expect(await res.json()).toEqual({ error: "unauthorized" });
            });

            it("returns 403 for guest role", async () => {
                requireAppUserMock.mockResolvedValue(makeUser("guest"));

                const res = await route.handler(makeReq());

                expect(res.status).toBe(403);
                expect(await res.json()).toEqual({ error: "forbidden" });
            });

            it("returns 200 for donor role", async () => {
                requireAppUserMock.mockResolvedValue(makeUser("donor"));
                setupFakeClients();

                const res = await route.handler(makeReq());

                expect(res.status).toBe(200);
            });
        });
    }

    // donations/create POST — guest has create permission, so 403 uses beneficiary
    describe(donationCreateRoute.name, () => {
        function makeReq(): NextRequest {
            return new NextRequest("http://localhost/api/donations/create", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(donationCreateRoute.body),
            });
        }

        it("returns 401 when unauthenticated", async () => {
            requireAppUserMock.mockRejectedValue(new UnauthorizedError());

            const res = await donationCreateRoute.handler(makeReq());

            expect(res.status).toBe(401);
            expect(await res.json()).toEqual({ error: "unauthorized" });
        });

        it("returns 403 for beneficiary role (no donation create)", async () => {
            requireAppUserMock.mockResolvedValue(makeUser("beneficiary"));

            const res = await donationCreateRoute.handler(makeReq());

            expect(res.status).toBe(403);
            expect(await res.json()).toEqual({ error: "forbidden" });
        });

        it("returns 200 for donor role", async () => {
            requireAppUserMock.mockResolvedValue(makeUser("donor"));
            setupFakeClients();

            const res = await donationCreateRoute.handler(makeReq());

            expect(res.status).toBe(200);
        });
    });
});
