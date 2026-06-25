import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UnauthorizedError, type AppUser } from "@/lib/auth";

/**
 * Smoke test for the shared route guard (lib/api/handler `defineRoute`), driven
 * through the real /api/admin/vendors route. Because all nine admin GET routes
 * use the same guard, verifying 401 / 403 / 200 here validates the guard for all.
 *
 * What is real vs mocked:
 *   - REAL: defineRoute, the permission matrix + assertCan (so 403 is a genuine
 *     matrix denial), error mapping, JSON shaping.
 *   - MOCKED: requireAppUser (who is signed in + their role) and the Supabase
 *     server client (the DB read) — we are testing the guard, not the DB.
 */

// Mock auth: keep the real UnauthorizedError class, override requireAppUser.
vi.mock("@/lib/auth", async (importActual) => {
    const actual = await importActual<typeof import("@/lib/auth")>();
    return { ...actual, requireAppUser: vi.fn() };
});

// Mock the RLS-aware server client so no real DB call happens.
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { requireAppUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { GET } from "@/app/api/admin/vendors/route";

const requireAppUserMock = vi.mocked(requireAppUser);
const createClientMock = vi.mocked(createClient);

function makeUser(role: AppUser["role"]): AppUser {
    return { id: "00000000-0000-0000-0000-000000000001", email: "u@papama.test", role, donor_id: null };
}

/** A fake supabase client whose `.from().select().order().range()` resolves to rows. */
function fakeClientReturning(rows: unknown[]) {
    const range = vi.fn().mockResolvedValue({ data: rows, error: null });
    const order = vi.fn(() => ({ range }));
    const select = vi.fn(() => ({ order }));
    const from = vi.fn(() => ({ select }));
    return { from } as unknown as Awaited<ReturnType<typeof createClient>>;
}

const req = () => new NextRequest("http://localhost/api/admin/vendors");

describe("admin route guard (via /api/admin/vendors)", () => {
    beforeEach(() => vi.clearAllMocks());

    it("returns 401 when unauthenticated", async () => {
        requireAppUserMock.mockRejectedValue(new UnauthorizedError());

        const res = await GET(req());

        expect(res.status).toBe(401);
        expect(await res.json()).toEqual({ error: "unauthorized" });
    });

    it("returns 403 for an authenticated but non-permitted role (donor)", async () => {
        requireAppUserMock.mockResolvedValue(makeUser("donor")); // donor has no vendor_management read

        const res = await GET(req());

        expect(res.status).toBe(403);
        expect(await res.json()).toEqual({ error: "forbidden" });
    });

    it("returns 200 with a well-shaped body for admin", async () => {
        requireAppUserMock.mockResolvedValue(makeUser("admin"));
        createClientMock.mockResolvedValue(
            fakeClientReturning([
                {
                    id: "v1",
                    name: "Anna's Kitchen",
                    status: "approved",
                    kyc_status: "verified",
                    fssai_license: "FSSAI-123",
                    gst_number: null,
                    geo_lat: 13.08,
                    geo_lng: 80.27,
                    hygiene_rating: 4,
                    created_at: "2026-06-20T10:00:00.000Z",
                },
            ])
        );

        const res = await GET(req());
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.total).toBe(1);
        expect(body.vendors).toHaveLength(1);
        expect(body.vendors[0]).toMatchObject({
            vendor_id: "v1",
            name: "Anna's Kitchen",
            status: "approved",
            geo: { lat: 13.08, lng: 80.27 },
            gst_number: null, // nullable onboarding field preserved
        });
    });
});
