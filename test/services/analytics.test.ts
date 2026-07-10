import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { getAnalytics } from "@/lib/services/analytics";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Spec references:
 * - §3.3 Analytics dashboard [M2-8]
 * - §3.3 city-wise reports via geo hierarchy [M2-12]
 * - §3.3 category-wise breakdowns
 */

function buildAdmin() {
    const from = vi.fn().mockImplementation(() => {
        const chain: Record<string, ReturnType<typeof vi.fn>> = {};
        chain.select = vi.fn().mockReturnValue(chain);
        chain.eq = vi.fn().mockReturnValue(chain);
        chain.gte = vi.fn().mockReturnValue(chain);
        chain.in = vi.fn().mockReturnValue(chain);
        chain.order = vi.fn().mockReturnValue(chain);
        chain.limit = vi.fn().mockReturnValue(chain);
        chain.range = vi.fn().mockResolvedValue({ data: [], error: null });
        chain.then = vi.fn().mockImplementation((resolve: (v: unknown) => void) =>
            resolve({ data: [], error: null })
        );
        return chain;
    });
    return { from } as unknown as SupabaseClient;
}

describe("getAnalytics", () => {
    beforeEach(() => vi.clearAllMocks());

    it("returns a well-shaped summary with empty data", async () => {
        const admin = buildAdmin();
        const result = await getAnalytics(admin);

        expect(result).toHaveProperty("meals_served_total");
        expect(result).toHaveProperty("meals_trend_30d");
        expect(result).toHaveProperty("donation_total_inr");
        expect(result).toHaveProperty("donation_trend_6m");
        expect(result).toHaveProperty("token_utilisation");
        expect(result).toHaveProperty("financial");
        expect(result).toHaveProperty("fraud_open_by_severity");
        expect(result).toHaveProperty("top_vendors");
        expect(result).toHaveProperty("city_wise");
        expect(result).toHaveProperty("category_wise");
    });

    it("returns zero financial values for empty data", async () => {
        const admin = buildAdmin();
        const result = await getAnalytics(admin);

        expect(result.financial.donated_inr).toBe(0);
        expect(result.financial.settlements_paid_inr).toBe(0);
        expect(result.financial.settlements_pending_inr).toBe(0);
        expect(result.financial.forfeited_inr).toBe(0);
    });

    it("returns zero meals for empty data", async () => {
        const admin = buildAdmin();
        const result = await getAnalytics(admin);

        expect(result.meals_served_total).toBe(0);
        expect(result.donation_total_inr).toBe(0);
        expect(result.donation_count).toBe(0);
    });

    it("returns 30-day meals trend array", async () => {
        const admin = buildAdmin();
        const result = await getAnalytics(admin);

        expect(result.meals_trend_30d).toHaveLength(30);
    });
});

// ---------------------------------------------------------------------------
// Spec-derived tests — §3.3 M2-8, M2-12
// ---------------------------------------------------------------------------

describe("getAnalytics — spec-derived breakdowns", () => {
    beforeEach(() => vi.clearAllMocks());

    it("result includes city-wise breakdowns (spec §3.3: city-wise reports via geo hierarchy M2-12)", async () => {
        const admin = buildAdmin();
        const result = await getAnalytics(admin);

        expect(result).toHaveProperty("city_wise");
        expect(Array.isArray(result.city_wise)).toBe(true);
    });

    it("result includes category-wise breakdowns (spec §3.3: category-wise)", async () => {
        const admin = buildAdmin();
        const result = await getAnalytics(admin);

        expect(result).toHaveProperty("category_wise");
        expect(Array.isArray(result.category_wise)).toBe(true);
    });
});
