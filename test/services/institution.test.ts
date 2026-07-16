import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { bulkAllocateToInstitution, institutionAllocationReport } from "@/lib/services/institution";
import { makeUser } from "@test/helpers";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Spec references:
 * - §3.1 F-12 — institutional distribution: orphanages, old-age homes, charity hospitals
 * - Bulk allocation via RPC (allocate_pooled_tokens_to_institution)
 */

function buildAdmin(rpcResult: unknown[], rpcError?: string) {
    return {
        rpc: vi.fn().mockResolvedValue(
            rpcError
                ? { data: null, error: { message: rpcError } }
                : { data: rpcResult, error: null }
        ),
        from: vi.fn().mockReturnValue({
            insert: vi.fn().mockResolvedValue({ error: null }),
        }),
    } as unknown as SupabaseClient;
}

describe("bulkAllocateToInstitution", () => {
    const actor = makeUser("admin", { id: "admin-1" });

    beforeEach(() => vi.clearAllMocks());

    // Spec §3.1 F-12: bulk allocation via RPC
    it("calls RPC and returns allocation result", async () => {
        const admin = buildAdmin([{ allocation_id: "alloc-1", moved_count: 10 }]);

        const result = await bulkAllocateToInstitution(admin, "ngo-1", 10, actor);

        expect(result.allocationId).toBe("alloc-1");
        expect(result.movedCount).toBe(10);
        expect(admin.rpc).toHaveBeenCalledWith(
            "allocate_pooled_tokens_to_institution",
            expect.objectContaining({ p_ngo_partner_id: "ngo-1", p_count: 10 })
        );
    });

    it("throws on RPC error", async () => {
        const admin = buildAdmin([], "not enough pooled tokens");

        await expect(
            bulkAllocateToInstitution(admin, "ngo-1", 50, actor)
        ).rejects.toThrow("not enough pooled tokens");
    });

    it("throws when RPC returns empty array", async () => {
        const admin = buildAdmin([]);

        await expect(
            bulkAllocateToInstitution(admin, "ngo-1", 10, actor)
        ).rejects.toThrow();
    });
});

// ---------------------------------------------------------------------------
// institutionAllocationReport — addon #15 (spec §3.1 F-12)
// ---------------------------------------------------------------------------

/** A chainable query-builder stub: every method returns itself; awaiting resolves `result`. */
function chainable(result: { data?: unknown; error?: unknown }) {
    const obj: Record<string, unknown> = {
        select: vi.fn(() => obj),
        eq: vi.fn(() => obj),
        in: vi.fn(() => obj),
        returns: vi.fn(() => obj),
        then: (resolve: (v: unknown) => void) => resolve(result),
    };
    return obj;
}

function buildReportAdmin(opts: {
    allocRows?: Array<{ token_count: number }>;
    tdrRows?: Array<{ token_id: string }>;
    tokenRows?: Array<{ status: string }>;
    mealRows?: Array<{ beneficiaries: { category: string | null } }>;
}) {
    const from = vi.fn().mockImplementation((table: string) => {
        if (table === "institution_token_allocations") {
            return chainable({ data: opts.allocRows ?? [], error: null });
        }
        if (table === "token_distribution_records") {
            return chainable({ data: opts.tdrRows ?? [], error: null });
        }
        if (table === "tokens") {
            return chainable({ data: opts.tokenRows ?? [], error: null });
        }
        if (table === "token_redemptions") {
            return chainable({ data: opts.mealRows ?? [], error: null });
        }
        return chainable({ data: [], error: null });
    });
    return { from } as unknown as SupabaseClient;
}

describe("institutionAllocationReport", () => {
    beforeEach(() => vi.clearAllMocks());

    it("sums tokens_allocated from the allocation ledger", async () => {
        const admin = buildReportAdmin({ allocRows: [{ token_count: 10 }, { token_count: 5 }] });
        const report = await institutionAllocationReport(admin, "ngo-1");
        expect(report.tokens_allocated).toBe(15);
    });

    it("buckets traced tokens by status (redeemed/expired/blocked/pending)", async () => {
        const admin = buildReportAdmin({
            tdrRows: [
                { token_id: "t1" }, { token_id: "t2" }, { token_id: "t3" },
                { token_id: "t4" }, { token_id: "t5" },
            ],
            tokenRows: [
                { status: "redeemed" }, { status: "redeemed" }, { status: "redeemed" },
                { status: "expired" }, { status: "blocked" },
            ],
        });
        const report = await institutionAllocationReport(admin, "ngo-1");
        expect(report.tokens_redeemed).toBe(3);
        expect(report.tokens_expired).toBe(1);
        expect(report.tokens_blocked).toBe(1);
        expect(report.tokens_pending).toBe(0);
    });

    it("counts 'live'/'distributed' as pending", async () => {
        const admin = buildReportAdmin({
            tdrRows: [{ token_id: "t1" }, { token_id: "t2" }],
            tokenRows: [{ status: "live" }, { status: "distributed" }],
        });
        const report = await institutionAllocationReport(admin, "ngo-1");
        expect(report.tokens_pending).toBe(2);
        expect(report.tokens_redeemed).toBe(0);
    });

    it("returns all-zero buckets when no tokens have been traced yet", async () => {
        const admin = buildReportAdmin({ tdrRows: [] });
        const report = await institutionAllocationReport(admin, "ngo-1");
        expect(report.tokens_redeemed).toBe(0);
        expect(report.tokens_pending).toBe(0);
        expect(report.tokens_expired).toBe(0);
        expect(report.tokens_blocked).toBe(0);
    });

    it("groups meals_by_category from the beneficiaries join", async () => {
        const admin = buildReportAdmin({
            mealRows: [
                { beneficiaries: { category: "patient" } },
                { beneficiaries: { category: "patient" } },
                { beneficiaries: { category: "pregnant_women" } },
            ],
        });
        const report = await institutionAllocationReport(admin, "ngo-1");
        expect(report.meals_by_category).toEqual({ patient: 2, pregnant_women: 1 });
    });
});
