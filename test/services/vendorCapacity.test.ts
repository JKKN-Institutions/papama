import { beforeEach, describe, expect, it, vi } from "vitest";

import { getRemainingCapacity, incrementUsage } from "@/lib/services/vendorCapacity";
import type { SupabaseClient } from "@supabase/supabase-js";

function buildAdmin(capacity: number | null, served: number | null) {
    const from = vi.fn().mockImplementation((table: string) => {
        if (table === "vendors") {
            const chain: Record<string, ReturnType<typeof vi.fn>> = {};
            chain.select = vi.fn().mockReturnValue(chain);
            chain.eq = vi.fn().mockReturnValue(chain);
            chain.maybeSingle = vi.fn().mockResolvedValue({
                data: { daily_meal_capacity: capacity },
                error: null,
            });
            return chain;
        }
        if (table === "vendor_capacity_usage") {
            const chain: Record<string, ReturnType<typeof vi.fn>> = {};
            chain.select = vi.fn().mockReturnValue(chain);
            chain.eq = vi.fn().mockReturnValue(chain);
            chain.maybeSingle = vi.fn().mockResolvedValue({
                data: served !== null ? { meals_served: served } : null,
                error: null,
            });
            return chain;
        }
        return {};
    });
    return { from } as unknown as SupabaseClient;
}

describe("getRemainingCapacity", () => {
    beforeEach(() => vi.clearAllMocks());

    it("returns remaining when capacity is set", async () => {
        const admin = buildAdmin(20, 8);
        const result = await getRemainingCapacity("v1", admin);

        expect(result.capacity).toBe(20);
        expect(result.served).toBe(8);
        expect(result.remaining).toBe(12);
    });

    it("returns null remaining when vendor is uncapped", async () => {
        const admin = buildAdmin(null, 5);
        const result = await getRemainingCapacity("v1", admin);

        expect(result.capacity).toBeNull();
        expect(result.remaining).toBeNull();
    });

    it("returns 0 remaining when at capacity", async () => {
        const admin = buildAdmin(10, 10);
        const result = await getRemainingCapacity("v1", admin);

        expect(result.remaining).toBe(0);
    });

    it("returns 0 remaining when over capacity", async () => {
        const admin = buildAdmin(10, 15);
        const result = await getRemainingCapacity("v1", admin);

        expect(result.remaining).toBe(0);
    });

    it("returns 0 served when no usage row exists", async () => {
        const admin = buildAdmin(20, null);
        const result = await getRemainingCapacity("v1", admin);

        expect(result.served).toBe(0);
        expect(result.remaining).toBe(20);
    });
});

describe("incrementUsage", () => {
    beforeEach(() => vi.clearAllMocks());

    it("returns the new count from RPC", async () => {
        const admin = {
            rpc: vi.fn().mockResolvedValue({ data: 5, error: null }),
        } as unknown as SupabaseClient;

        const count = await incrementUsage("v1", admin);
        expect(count).toBe(5);
    });

    it("returns null for non-numeric response", async () => {
        const admin = {
            rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
        } as unknown as SupabaseClient;

        const count = await incrementUsage("v1", admin);
        expect(count).toBeNull();
    });

    it("throws on RPC error", async () => {
        const admin = {
            rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "rpc failed" } }),
        } as unknown as SupabaseClient;

        await expect(incrementUsage("v1", admin)).rejects.toThrow("rpc failed");
    });
});
