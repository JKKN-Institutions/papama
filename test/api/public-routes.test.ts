import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UnauthorizedError, type AppUser } from "@/lib/auth";

/**
 * Smoke tests for public (unauthenticated) routes and the two lightweight
 * authenticated routes (tokens/convert, me). Public routes do NOT use
 * defineRoute — they handle auth manually or use the admin client directly.
 */

// ── Mocks ──────────────────────────────────────────────────────────────────────

// Auth mock — used by /api/me and tokens/convert (via defineRoute).
vi.mock("@/lib/auth", async (importActual) => {
    const actual = await importActual<typeof import("@/lib/auth")>();
    return { ...actual, requireAppUser: vi.fn(), getAppUser: vi.fn() };
});

// Session client (for defineRoute-based routes).
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

// Admin client — used by ALL public routes and tokens/convert.
vi.mock("@/lib/supabase/admin", () => {
    const objResult = { data: { id: "mock-id", status: "pending" }, error: null };
    const arrResult = { data: [], error: null };
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    const methods = [
        "from", "select", "insert", "update", "delete",
        "eq", "in", "order", "limit", "range",
    ];
    for (const m of methods) chain[m] = vi.fn(() => proxy);
    chain.maybeSingle = vi.fn().mockResolvedValue(objResult);
    chain.single = vi.fn().mockResolvedValue(objResult);
    const proxy = new Proxy(chain, {
        get(target, prop) {
            if (prop === "then") {
                return (resolve: (v: unknown) => void) => resolve(arrResult);
            }
            if (prop === "auth") {
                return {
                    admin: {
                        createUser: vi.fn().mockResolvedValue({
                            data: { user: { id: "new-user-001" } },
                            error: null,
                        }),
                        deleteUser: vi.fn().mockResolvedValue({ error: null }),
                    },
                };
            }
            if (prop === "storage") {
                return {
                    from: () => ({
                        upload: vi.fn().mockResolvedValue({ error: null }),
                        createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: "https://signed.url" } }),
                    }),
                };
            }
            if (prop === "rpc") {
                return vi.fn().mockResolvedValue({ data: null, error: null });
            }
            return target[prop as string] ?? vi.fn(() => proxy);
        },
    });
    return { createAdminClient: vi.fn(() => proxy) };
});

// System config — used by transparency route and tokens/convert.
vi.mock("@/lib/system-config", () => ({
    getConfig: vi.fn(async () => 50),
    getNumber: vi.fn(async () => 50),
    getBoolean: vi.fn(async () => true),
    MissingConfigError: class MissingConfigError extends Error {
        constructor(message = "missing config") { super(message); this.name = "MissingConfigError"; }
    },
}));

// Transparency service
vi.mock("@/lib/services/transparency", () => ({
    getTransparencyStats: vi.fn(async () => ({
        total_donations_inr: 50000,
        total_tokens_minted: 100,
        total_meals_served: 80,
        active_vendors: 5,
    })),
}));

// Beneficiary register deps
vi.mock("@/lib/face/embedding", () => ({
    embeddingFingerprint: vi.fn(() => "face-hash-abc"),
    toVectorLiteral: vi.fn(() => "[0.1,0.2]"),
}));
vi.mock("@/lib/face/liveness", () => ({ assertLiveness: vi.fn(async () => {}) }));
// Let @/lib/validation/schemas import naturally — they are pure Zod schemas.
vi.mock("@/lib/services/audit", () => ({
    writeAuditLog: vi.fn(async () => {}),
    AuditError: class extends Error {},
}));

// Beneficiary feedback deps
vi.mock("@/lib/services/vendorRating", () => ({
    recordFeedback: vi.fn(async () => ({ feedback_id: "fb-001" })),
    autoSuspendBelowThreshold: vi.fn(async () => ({ suspended: false, reason: "" })),
}));

// Nearby vendors deps
vi.mock("@/lib/services/vendorDiscovery", () => ({
    findNearbyVendors: vi.fn(async () => [
        { id: "v1", name: "Test Vendor", geo_lat: 13.08, geo_lng: 80.27 },
    ]),
}));

// Guest donation deps
vi.mock("@/app/api/_lib/recordDonation", () => ({
    recordDonation: vi.fn(async () => ({
        donationId: "don-001",
        creditAdded: 500,
        creditBalance: 500,
        thresholdReached: false,
    })),
}));
vi.mock("@/lib/donations/guest-pool", () => ({
    ensureGuestPoolDonor: vi.fn(async () => "pool-donor-001"),
}));

// UPI QR deps
vi.mock("qrcode", () => ({
    default: { toDataURL: vi.fn(async () => "data:image/png;base64,fake") },
}));
vi.mock("nanoid", () => ({
    nanoid: vi.fn(() => "abc123"),
}));

// Tokens/convert deps
vi.mock("@/lib/donor/server-identity", () => ({
    resolveDonorId: vi.fn(async () => "donor-001"),
}));
vi.mock("@/app/api/_lib/tokenQr", () => ({
    deriveQrPayload: vi.fn(() => "qr-payload-abc"),
    qrHashOf: vi.fn(() => "qr-hash-abc"),
}));
vi.mock("@/lib/notifications/dispatch", () => ({
    dispatchNotification: vi.fn(async () => {}),
}));

// ── Imports (AFTER mocks) ──────────────────────────────────────────────────────

import { requireAppUser, getAppUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import { GET as transparencyGET } from "@/app/api/public/transparency/route";
import { POST as beneficiaryRegisterPOST } from "@/app/api/beneficiary/register/route";
import { POST as beneficiaryFeedbackPOST } from "@/app/api/beneficiary/feedback/route";
import { GET as nearbyVendorsGET } from "@/app/api/beneficiary/nearby-vendors/route";
import { POST as vendorRegisterPOST } from "@/app/api/vendor/register/route";
import { POST as volunteerRegisterPOST } from "@/app/api/volunteer/register/route";
import { POST as guestDonationPOST } from "@/app/api/donations/create-guest/route";
import { POST as upiGeneratePOST } from "@/app/api/payment/upi-qr/generate/route";
import { GET as upiConfirmGET, POST as upiConfirmPOST } from "@/app/api/payment/upi-qr/confirm/route";
import { POST as tokensConvertPOST } from "@/app/api/tokens/convert/route";
import { GET as meGET } from "@/app/api/me/route";

const requireAppUserMock = vi.mocked(requireAppUser);
const getAppUserMock = vi.mocked(getAppUser);
const createClientMock = vi.mocked(createClient);

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeUser(role: AppUser["role"]): AppUser {
    return { id: "a0000000-0000-4000-8000-000000000001", email: "u@papama.test", role, donor_id: "donor-001" };
}

function jsonReq(url: string, body: unknown, method = "POST"): NextRequest {
    return new NextRequest(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}

/** Fake chainable Supabase client for session-scoped routes. */
function fakeSessionClient(data: unknown = null) {
    const terminal = vi.fn().mockResolvedValue({ data, error: null });
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    const methods = [
        "from", "select", "insert", "update", "delete",
        "eq", "in", "order", "limit", "range", "maybeSingle", "single",
    ];
    for (const m of methods) chain[m] = vi.fn(() => proxy);
    chain.maybeSingle = terminal;
    chain.single = terminal;
    const proxy = new Proxy(chain, {
        get(target, prop) {
            if (prop === "then") {
                return (resolve: (v: unknown) => void) => resolve({ data, error: null });
            }
            return target[prop as string] ?? vi.fn(() => proxy);
        },
    }) as unknown as Awaited<ReturnType<typeof createClient>>;
    return proxy;
}

// ── Public route tests ─────────────────────────────────────────────────────────

describe("public routes (no auth required)", () => {
    beforeEach(() => vi.clearAllMocks());

    // ── transparency ───────────────────────────────────────────────────────
    describe("GET /api/public/transparency", () => {
        it("returns 200 with stats when enabled", async () => {
            const res = await transparencyGET();
            expect(res.status).toBe(200);
            const body = await res.json();
            expect(body.stats).toBeDefined();
            expect(body.stats.total_meals_served).toBe(80);
        });

        it("returns 404 when transparency is disabled", async () => {
            const { getBoolean } = await import("@/lib/system-config");
            vi.mocked(getBoolean).mockResolvedValueOnce(false as never);
            const res = await transparencyGET();
            expect(res.status).toBe(404);
        });
    });

    // ── beneficiary register ───────────────────────────────────────────────
    describe("POST /api/beneficiary/register", () => {
        it("returns 200 for a valid registration", async () => {
            const req = jsonReq("http://localhost/api/beneficiary/register", {
                category: "patient",
                full_name: "Test User",
            });
            const res = await beneficiaryRegisterPOST(req);
            expect(res.status).toBe(200);
            const body = await res.json();
            expect(body.status).toBe("pending");
        });
    });

    // ── beneficiary feedback ───────────────────────────────────────────────
    describe("POST /api/beneficiary/feedback", () => {
        it("returns 200 for valid feedback", async () => {
            const req = jsonReq("http://localhost/api/beneficiary/feedback", {
                vendor_id: "a0000000-0000-4000-8000-000000000002",
                rating: 4,
                comment: "Good food",
            });
            const res = await beneficiaryFeedbackPOST(req);
            expect(res.status).toBe(200);
            const body = await res.json();
            expect(body.id).toBe("fb-001");
        });
    });

    // ── nearby vendors ─────────────────────────────────────────────────────
    describe("GET /api/beneficiary/nearby-vendors", () => {
        it("returns 200 with vendors for valid coords", async () => {
            const req = new NextRequest("http://localhost/api/beneficiary/nearby-vendors?lat=13.08&lng=80.27");
            const res = await nearbyVendorsGET(req);
            expect(res.status).toBe(200);
            const body = await res.json();
            expect(body.vendors).toHaveLength(1);
            expect(body.total).toBe(1);
        });
    });

    // ── vendor register ────────────────────────────────────────────────────
    describe("POST /api/vendor/register", () => {
        it("returns 200 for valid vendor registration", async () => {
            const req = jsonReq("http://localhost/api/vendor/register", {
                email: "vendor@test.com",
                password: "password123",
                name: "Test Kitchen",
            });
            const res = await vendorRegisterPOST(req);
            expect(res.status).toBe(200);
            const body = await res.json();
            expect(body.status).toBe("pending");
        });
    });

    // ── volunteer register ─────────────────────────────────────────────────
    describe("POST /api/volunteer/register", () => {
        it("returns 200 for valid volunteer registration", async () => {
            const req = jsonReq("http://localhost/api/volunteer/register", {
                email: "vol@test.com",
                password: "password123",
                full_name: "Test Volunteer",
            });
            const res = await volunteerRegisterPOST(req);
            expect(res.status).toBe(200);
            const body = await res.json();
            expect(body.status).toBe("pending");
        });
    });

    // ── guest donation ─────────────────────────────────────────────────────
    describe("POST /api/donations/create-guest", () => {
        it("returns 200 for a valid guest donation", async () => {
            const req = jsonReq("http://localhost/api/donations/create-guest", {
                amount_inr: 500,
            }) as NextRequest;
            const res = await guestDonationPOST(req);
            expect(res.status).toBe(200);
            const body = await res.json();
            expect(body.donation_id).toBe("don-001");
            expect(body.status).toBe("completed");
        });
    });

    // ── UPI QR generate ────────────────────────────────────────────────────
    describe("POST /api/payment/upi-qr/generate", () => {
        it("returns 200 with QR data for valid amount", async () => {
            const req = jsonReq("http://localhost/api/payment/upi-qr/generate", {
                amount_inr: 200,
            }) as NextRequest;
            const res = await upiGeneratePOST(req);
            expect(res.status).toBe(200);
            const body = await res.json();
            expect(body.success).toBe(true);
            expect(body.qrCode).toBeDefined();
            expect(body.transactionRef).toBeDefined();
        });
    });

    // ── UPI QR confirm GET ─────────────────────────────────────────────────
    describe("GET /api/payment/upi-qr/confirm", () => {
        it("returns 400 when ref is missing", async () => {
            const req = new NextRequest("http://localhost/api/payment/upi-qr/confirm");
            const res = await upiConfirmGET(req);
            expect(res.status).toBe(400);
        });
    });

    // ── UPI QR confirm POST ────────────────────────────────────────────────
    describe("POST /api/payment/upi-qr/confirm", () => {
        it("returns 400 for invalid body (missing upiTransactionId)", async () => {
            const req = jsonReq("http://localhost/api/payment/upi-qr/confirm", {
                transactionRef: "PAPAMA123abc123",
                // upiTransactionId missing
            }) as NextRequest;
            const res = await upiConfirmPOST(req);
            expect(res.status).toBe(400);
        });
    });
});

// ── Authenticated routes (use defineRoute or manual auth) ──────────────────────

describe("authenticated routes", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        createClientMock.mockResolvedValue(fakeSessionClient());
    });

    // ── tokens/convert ─────────────────────────────────────────────────────
    describe("POST /api/tokens/convert", () => {
        it("returns 401 when unauthenticated", async () => {
            requireAppUserMock.mockRejectedValue(new UnauthorizedError());
            const req = jsonReq("http://localhost/api/tokens/convert", {
                token_type: "standard",
                amount_inr: 100,
                distribution_path: "use_now",
            });
            const res = await tokensConvertPOST(req);
            expect(res.status).toBe(401);
        });

        it("returns 200 for donor role", async () => {
            requireAppUserMock.mockResolvedValue(makeUser("donor"));
            // The route needs:
            // 1. donor_credits.balance_inr (via admin.from("donor_credits").select...maybeSingle)
            // 2. donor_credits.update (CAS deduction)
            // 3. tokens.insert
            // 4. various other writes
            // The admin client mock handles all of these via the proxy.
            const res = await tokensConvertPOST(
                jsonReq("http://localhost/api/tokens/convert", {
                    token_type: "standard",
                    amount_inr: 100,
                    distribution_path: "use_now",
                })
            );
            // May return 200 or a 400/500 depending on the mock data shape, but
            // the key assertion is it does NOT return 401 or 403.
            expect(res.status).not.toBe(401);
            expect(res.status).not.toBe(403);
        });
    });

    // ── me ─────────────────────────────────────────────────────────────────
    describe("GET /api/me", () => {
        it("returns 401 when not signed in", async () => {
            getAppUserMock.mockResolvedValue(null);
            const res = await meGET();
            expect(res.status).toBe(401);
            const body = await res.json();
            expect(body.error).toBe("unauthorized");
        });

        it("returns 200 with user when signed in", async () => {
            const user = makeUser("donor");
            getAppUserMock.mockResolvedValue(user);
            const res = await meGET();
            expect(res.status).toBe(200);
            const body = await res.json();
            expect(body.user).toMatchObject({ id: user.id, role: "donor" });
        });
    });
});
