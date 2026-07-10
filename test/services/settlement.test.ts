import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/system-config", async (importActual) => {
    const actual = await importActual<typeof import("@/lib/system-config")>();
    return { ...actual, getConfig: vi.fn() };
});

import { runSettlement, type SettlementRunResult } from "@/lib/services/settlement";
import { getConfig } from "@/lib/system-config";
import type { SupabaseClient } from "@supabase/supabase-js";

const getConfigMock = vi.mocked(getConfig);

function buildSettlementAdmin(opts: {
    redemptions?: unknown[];
    vendorCycles?: unknown[];
    insertSettlement?: { id: string } | null;
    insertError?: string | null;
    lineItemError?: string | null;
    auditExisting?: unknown[];
}) {
    const from = vi.fn().mockImplementation((table: string) => {
        if (table === "token_redemptions") {
            return {
                select: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                        order: vi.fn().mockResolvedValue({
                            data: opts.redemptions ?? [],
                            error: null,
                        }),
                    }),
                }),
            };
        }
        if (table === "vendors") {
            return {
                select: vi.fn().mockReturnValue({
                    in: vi.fn().mockResolvedValue({
                        data: opts.vendorCycles ?? [],
                        error: null,
                    }),
                }),
            };
        }
        if (table === "vendor_settlements") {
            const single = vi.fn().mockResolvedValue(
                opts.insertError
                    ? { data: null, error: { message: opts.insertError } }
                    : { data: opts.insertSettlement ?? { id: "settle-1" }, error: null }
            );
            const select = vi.fn().mockReturnValue({ single });
            return {
                insert: vi.fn().mockReturnValue({ select }),
                delete: vi.fn().mockReturnValue({
                    eq: vi.fn().mockResolvedValue({ error: null }),
                }),
            };
        }
        if (table === "settlement_line_items") {
            return {
                insert: vi.fn().mockResolvedValue(
                    opts.lineItemError
                        ? { error: { message: opts.lineItemError } }
                        : { error: null }
                ),
            };
        }
        if (table === "settlement_audit_queue") {
            return {
                select: vi.fn().mockReturnValue({
                    in: vi.fn().mockResolvedValue({
                        data: opts.auditExisting ?? [],
                        error: null,
                    }),
                }),
                insert: vi.fn().mockResolvedValue({ error: null }),
            };
        }
        return { select: vi.fn().mockReturnThis(), insert: vi.fn().mockResolvedValue({ error: null }) };
    });
    return { from } as unknown as SupabaseClient;
}

function makeRedemption(vendorId: string, tokenValue: number, menuValue: number, diffPaid = 0) {
    return {
        id: `red-${Math.random().toString(36).slice(2, 8)}`,
        vendor_id: vendorId,
        token_value_inr: tokenValue,
        menu_value_inr: menuValue,
        difference_paid_inr: diffPaid,
        redeemed_at: "2026-07-09T10:00:00.000Z",
        settlement_line_items: [], // not yet settled
    };
}

describe("runSettlement", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getConfigMock.mockRejectedValue(new Error("unset")); // audit sampling off
    });

    it("returns empty result when no released redemptions", async () => {
        const admin = buildSettlementAdmin({ redemptions: [] });

        const result = await runSettlement("daily", admin);

        expect(result.settlements_created).toBe(0);
        expect(result.total_amount).toBe(0);
        expect(result.vendors).toHaveLength(0);
        expect(result.errors).toHaveLength(0);
    });

    it("creates one settlement per vendor", async () => {
        const admin = buildSettlementAdmin({
            redemptions: [
                makeRedemption("v1", 50, 50),
                makeRedemption("v1", 50, 50),
                makeRedemption("v2", 100, 80),
            ],
            insertSettlement: { id: "settle-1" },
        });

        const result = await runSettlement("daily", admin);

        expect(result.settlements_created).toBe(2);
        expect(result.vendors).toHaveLength(2);
    });

    it("computes payout as menu_value minus difference_paid", async () => {
        // token=50, menu=80, diff_paid=30 → payout = 80 - 30 = 50
        const admin = buildSettlementAdmin({
            redemptions: [makeRedemption("v1", 50, 80, 30)],
            insertSettlement: { id: "s1" },
        });

        const result = await runSettlement("daily", admin);

        expect(result.total_amount).toBe(50);
    });

    it("payout is zero when difference_paid >= menu_value", async () => {
        const admin = buildSettlementAdmin({
            redemptions: [makeRedemption("v1", 50, 80, 100)],
            insertSettlement: { id: "s1" },
        });

        const result = await runSettlement("daily", admin);

        expect(result.total_amount).toBe(0);
    });

    it("skips already-settled redemptions (non-empty settlement_line_items)", async () => {
        const admin = buildSettlementAdmin({
            redemptions: [
                {
                    ...makeRedemption("v1", 50, 50),
                    settlement_line_items: [{ settlement_id: "old" }], // already settled
                },
            ],
        });

        const result = await runSettlement("daily", admin);

        expect(result.settlements_created).toBe(0);
    });

    it("isolates vendor errors — other vendors still settle", async () => {
        // Insert will fail on first call (v1), succeed on second (v2)
        let callCount = 0;
        const admin = {
            from: vi.fn().mockImplementation((table: string) => {
                if (table === "token_redemptions") {
                    return {
                        select: vi.fn().mockReturnValue({
                            eq: vi.fn().mockReturnValue({
                                order: vi.fn().mockResolvedValue({
                                    data: [
                                        makeRedemption("v1", 50, 50),
                                        makeRedemption("v2", 50, 50),
                                    ],
                                    error: null,
                                }),
                            }),
                        }),
                    };
                }
                if (table === "vendors") {
                    return {
                        select: vi.fn().mockReturnValue({
                            in: vi.fn().mockResolvedValue({ data: [], error: null }),
                        }),
                    };
                }
                if (table === "vendor_settlements") {
                    callCount++;
                    if (callCount === 1) {
                        return {
                            insert: vi.fn().mockReturnValue({
                                select: vi.fn().mockReturnValue({
                                    single: vi.fn().mockResolvedValue({
                                        data: null,
                                        error: { message: "v1 failed" },
                                    }),
                                }),
                            }),
                        };
                    }
                    return {
                        insert: vi.fn().mockReturnValue({
                            select: vi.fn().mockReturnValue({
                                single: vi.fn().mockResolvedValue({
                                    data: { id: "s2" },
                                    error: null,
                                }),
                            }),
                        }),
                    };
                }
                if (table === "settlement_line_items") {
                    return { insert: vi.fn().mockResolvedValue({ error: null }) };
                }
                if (table === "settlement_audit_queue") {
                    return {
                        select: vi.fn().mockReturnValue({
                            in: vi.fn().mockResolvedValue({ data: [], error: null }),
                        }),
                        insert: vi.fn().mockResolvedValue({ error: null }),
                    };
                }
                return {};
            }),
        } as unknown as SupabaseClient;

        const result = await runSettlement("daily", admin);

        expect(result.settlements_created).toBe(1);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].vendor_id).toBe("v1");
    });

    it("throws when redemption query fails", async () => {
        const admin = {
            from: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                        order: vi.fn().mockResolvedValue({
                            data: null,
                            error: { message: "db down" },
                        }),
                    }),
                }),
            }),
        } as unknown as SupabaseClient;

        await expect(runSettlement("daily", admin)).rejects.toThrow("db down");
    });

    it("result shape includes all fields", async () => {
        const admin = buildSettlementAdmin({ redemptions: [] });

        const result = await runSettlement("weekly", admin);

        expect(result).toHaveProperty("settlements_created");
        expect(result).toHaveProperty("total_amount");
        expect(result).toHaveProperty("line_items");
        expect(result).toHaveProperty("vendors");
        expect(result).toHaveProperty("errors");
        expect(result).toHaveProperty("audit_queued");
    });
});
