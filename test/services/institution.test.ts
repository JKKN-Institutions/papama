import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { bulkAllocateToInstitution } from "@/lib/services/institution";
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
