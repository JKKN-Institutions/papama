import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/system-config", async (importActual) => {
    const actual = await importActual<typeof import("@/lib/system-config")>();
    return { ...actual, getNumber: vi.fn() };
});

import { findNearbyVendors } from "@/lib/services/vendorDiscovery";
import { getNumber, MissingConfigError } from "@/lib/system-config";
import type { SupabaseClient } from "@supabase/supabase-js";

const getNumberMock = vi.mocked(getNumber);

function buildAdmin(vendors: unknown[], mealWindows?: unknown[]) {
    const from = vi.fn().mockImplementation((table: string) => {
        if (table === "vendors") {
            const chain: Record<string, ReturnType<typeof vi.fn>> = {};
            chain.select = vi.fn().mockReturnValue(chain);
            chain.eq = vi.fn().mockReturnValue(chain);
            chain.not = vi.fn().mockReturnValue(chain);
            chain.then = vi.fn().mockImplementation((resolve: (v: unknown) => void) =>
                resolve({ data: vendors, error: null })
            );
            return chain;
        }
        if (table === "meal_windows") {
            const chain: Record<string, ReturnType<typeof vi.fn>> = {};
            chain.select = vi.fn().mockReturnValue(chain);
            chain.eq = vi.fn().mockReturnValue(chain);
            chain.in = vi.fn().mockReturnValue(chain);
            chain.or = vi.fn().mockReturnValue(chain);
            chain.then = vi.fn().mockImplementation((resolve: (v: unknown) => void) =>
                resolve({ data: mealWindows ?? [], error: null })
            );
            return chain;
        }
        return {};
    });
    return { from } as unknown as SupabaseClient;
}

describe("findNearbyVendors", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getNumberMock.mockResolvedValue(5); // 5 km radius
    });

    it("returns vendors within radius sorted by distance", async () => {
        const admin = buildAdmin([
            { id: "v1", name: "Close Kitchen", status: "approved", geo_lat: 13.081, geo_lng: 80.271, hygiene_rating: 4 },
            { id: "v2", name: "Far Kitchen", status: "approved", geo_lat: 14.0, geo_lng: 81.0, hygiene_rating: 3 },
        ]);

        const results = await findNearbyVendors(
            { lat: 13.08, lng: 80.27 },
            admin
        );

        // Only v1 should be within 5km
        expect(results.length).toBeGreaterThanOrEqual(1);
        expect(results[0].id).toBe("v1");
    });

    it("returns empty when no vendors within radius", async () => {
        const admin = buildAdmin([
            { id: "v1", name: "Far", status: "approved", geo_lat: 28.0, geo_lng: 77.0, hygiene_rating: 4 },
        ]);

        const results = await findNearbyVendors({ lat: 13.08, lng: 80.27 }, admin);

        expect(results).toHaveLength(0);
    });

    it("returns empty when no vendors at all", async () => {
        const admin = buildAdmin([]);

        const results = await findNearbyVendors({ lat: 13.08, lng: 80.27 }, admin);

        expect(results).toHaveLength(0);
    });

    it("uses explicit radius over config", async () => {
        const admin = buildAdmin([
            { id: "v1", name: "Kitchen", status: "approved", geo_lat: 13.081, geo_lng: 80.271, hygiene_rating: 4 },
        ]);

        const results = await findNearbyVendors(
            { lat: 13.08, lng: 80.27, radiusKm: 10 },
            admin
        );

        expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it("returns all vendors unfiltered when no radius configured (nearest-N)", async () => {
        getNumberMock.mockRejectedValue(new MissingConfigError("redemption_radius_km", "missing"));
        const admin = buildAdmin([
            { id: "v1", name: "Far", status: "approved", geo_lat: 28.0, geo_lng: 77.0, hygiene_rating: 4 },
        ]);

        const results = await findNearbyVendors({ lat: 13.08, lng: 80.27 }, admin);

        // No radius filter → returns all vendors sorted by distance
        expect(results).toHaveLength(1);
    });
});
