import { beforeEach, describe, expect, it, vi } from "vitest";

import { getTransparencyStats } from "@/lib/services/transparency";
import type { SupabaseClient } from "@supabase/supabase-js";

function buildClient(rpcResult: unknown, error?: string) {
    return {
        rpc: vi.fn().mockResolvedValue(
            error ? { data: null, error: { message: error } } : { data: rpcResult, error: null }
        ),
    } as unknown as SupabaseClient;
}

describe("getTransparencyStats", () => {
    beforeEach(() => vi.clearAllMocks());

    it("returns parsed stats from RPC", async () => {
        const client = buildClient([{
            total_donations_inr: 50000,
            meals_sponsored: 1000,
            meals_served: 800,
            active_vendors: 15,
            active_beneficiaries: 200,
            cities_covered: 3,
        }]);

        const stats = await getTransparencyStats(client);

        expect(stats.total_donations_inr).toBe(50000);
        expect(stats.meals_served).toBe(800);
        expect(stats.active_vendors).toBe(15);
    });

    it("returns zeros when RPC returns null row", async () => {
        const client = buildClient([]);

        const stats = await getTransparencyStats(client);

        expect(stats.total_donations_inr).toBe(0);
        expect(stats.meals_served).toBe(0);
    });

    it("throws on RPC error", async () => {
        const client = buildClient(null, "function not found");

        await expect(getTransparencyStats(client)).rejects.toThrow("function not found");
    });

    it("handles string values by converting to numbers", async () => {
        const client = buildClient([{ total_donations_inr: "50000", meals_sponsored: "100", meals_served: "80", active_vendors: "5", active_beneficiaries: "20", cities_covered: "1" }]);

        const stats = await getTransparencyStats(client);

        expect(stats.total_donations_inr).toBe(50000);
    });

    it("handles null values as zero", async () => {
        const client = buildClient([{ total_donations_inr: null, meals_sponsored: null, meals_served: null, active_vendors: null, active_beneficiaries: null, cities_covered: null }]);

        const stats = await getTransparencyStats(client);

        expect(stats.total_donations_inr).toBe(0);
        expect(stats.meals_served).toBe(0);
    });
});
