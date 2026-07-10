import { beforeEach, describe, expect, it, vi } from "vitest";

import { logActivity, volunteerActivitySummary, volunteerActivitySummaries } from "@/lib/services/volunteerActivity";
import type { SupabaseClient } from "@supabase/supabase-js";

function buildAdmin(rows: unknown[], insertError?: string) {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    chain.select = vi.fn().mockReturnValue(chain);
    chain.eq = vi.fn().mockReturnValue(chain);
    chain.in = vi.fn().mockReturnValue(chain);
    chain.then = vi.fn().mockImplementation((resolve: (v: unknown) => void) =>
        resolve({ data: rows, error: null })
    );
    const from = vi.fn().mockImplementation(() => ({
        select: vi.fn().mockReturnValue(chain),
        insert: vi.fn().mockResolvedValue(
            insertError ? { error: { message: insertError } } : { error: null }
        ),
    }));
    return { from } as unknown as SupabaseClient;
}

describe("logActivity", () => {
    beforeEach(() => vi.clearAllMocks());

    it("inserts an activity row", async () => {
        const admin = buildAdmin([]);
        await logActivity("vol-1", "token_distributed", "token-1", admin);
        expect(admin.from).toHaveBeenCalledWith("volunteer_activity_log");
    });

    it("throws on insert error", async () => {
        const admin = buildAdmin([], "insert failed");
        await expect(logActivity("vol-1", "token_distributed", "t1", admin)).rejects.toThrow("insert failed");
    });
});

describe("volunteerActivitySummary", () => {
    it("returns correct counts by activity type", async () => {
        const rows = [
            { activity_type: "token_distributed", created_at: "2026-07-09T10:00:00Z" },
            { activity_type: "token_distributed", created_at: "2026-07-09T11:00:00Z" },
            { activity_type: "registration_assisted", created_at: "2026-07-09T12:00:00Z" },
        ];
        const admin = buildAdmin(rows);

        const summary = await volunteerActivitySummary("vol-1", admin);

        expect(summary.volunteer_id).toBe("vol-1");
        expect(summary.tokens_distributed).toBe(2);
        expect(summary.registrations_assisted).toBe(1);
        expect(summary.total).toBe(3);
    });

    it("counts active days from distinct dates", async () => {
        const rows = [
            { activity_type: "token_distributed", created_at: "2026-07-08T10:00:00Z" },
            { activity_type: "token_distributed", created_at: "2026-07-08T14:00:00Z" },
            { activity_type: "token_distributed", created_at: "2026-07-09T10:00:00Z" },
        ];
        const admin = buildAdmin(rows);

        const summary = await volunteerActivitySummary("vol-1", admin);

        expect(summary.active_days).toBe(2);
    });

    it("returns last_active_at as latest timestamp", async () => {
        const rows = [
            { activity_type: "token_distributed", created_at: "2026-07-08T10:00:00Z" },
            { activity_type: "token_distributed", created_at: "2026-07-09T15:00:00Z" },
        ];
        const admin = buildAdmin(rows);

        const summary = await volunteerActivitySummary("vol-1", admin);

        expect(summary.last_active_at).toBe("2026-07-09T15:00:00Z");
    });

    it("returns zeros for no activity", async () => {
        const admin = buildAdmin([]);

        const summary = await volunteerActivitySummary("vol-1", admin);

        expect(summary.tokens_distributed).toBe(0);
        expect(summary.registrations_assisted).toBe(0);
        expect(summary.total).toBe(0);
        expect(summary.active_days).toBe(0);
        expect(summary.last_active_at).toBeNull();
    });
});

describe("volunteerActivitySummaries", () => {
    it("returns a map with entries for all requested IDs", async () => {
        const admin = buildAdmin([
            { volunteer_id: "v1", activity_type: "token_distributed", created_at: "2026-07-09T10:00:00Z" },
        ]);

        const map = await volunteerActivitySummaries(["v1", "v2"], admin);

        expect(map.size).toBe(2);
        expect(map.get("v1")!.total).toBe(1);
        expect(map.get("v2")!.total).toBe(0);
    });

    it("returns empty map for empty input", async () => {
        const admin = buildAdmin([]);
        const map = await volunteerActivitySummaries([], admin);
        expect(map.size).toBe(0);
    });
});
