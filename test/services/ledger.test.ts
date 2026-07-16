import { beforeEach, describe, expect, it, vi } from "vitest";

import {
    postLedgerEntry,
    getLedgerBalance,
    getLedgerEntriesForReference,
    reconcileLedgers,
} from "@/lib/services/ledger";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Spec references:
 * - §3.1 F-10, §5 [M1-12] — triple-ledger financial architecture
 * - "Every rupee must be traceable" — reconcileLedgers checks
 *   donation == vendor_payable + revenue
 */

function buildAdmin(opts: {
    insertResult?: { id: string };
    insertError?: string;
    balanceRows?: Record<string, Array<{ amount: number }>>;
    referenceRows?: Array<Record<string, unknown>>;
}) {
    const from = vi.fn().mockImplementation((table: string) => {
        if (table === "ledger_entries") {
            return {
                insert: vi.fn().mockReturnValue({
                    select: vi.fn().mockReturnValue({
                        single: vi.fn().mockResolvedValue(
                            opts.insertError
                                ? { data: null, error: { message: opts.insertError } }
                                : { data: opts.insertResult ?? { id: "le-1" }, error: null }
                        ),
                    }),
                }),
                select: vi.fn().mockImplementation((_cols: string) => {
                    const chain = {
                        eq: vi.fn().mockImplementation((col: string, val: string) => {
                            if (col === "ledger") {
                                return Promise.resolve({
                                    data: opts.balanceRows?.[val] ?? [],
                                    error: null,
                                });
                            }
                            return chain;
                        }),
                        order: vi.fn().mockResolvedValue({
                            data: opts.referenceRows ?? [],
                            error: null,
                        }),
                    };
                    return chain;
                }),
            };
        }
        return {};
    });
    return { from } as unknown as SupabaseClient;
}

describe("postLedgerEntry", () => {
    beforeEach(() => vi.clearAllMocks());

    it("inserts a ledger entry and returns its id", async () => {
        const admin = buildAdmin({ insertResult: { id: "le-42" } });
        const result = await postLedgerEntry({
            admin,
            ledger: "donation",
            amountInr: 100,
            referenceType: "donation",
            referenceId: "d1",
            description: "test",
        });
        expect(result.id).toBe("le-42");
    });

    it("throws when the insert fails", async () => {
        const admin = buildAdmin({ insertError: "insert failed" });
        await expect(
            postLedgerEntry({
                admin,
                ledger: "donation",
                amountInr: 100,
                referenceType: "donation",
                referenceId: "d1",
                description: "test",
            })
        ).rejects.toThrow("insert failed");
    });
});

describe("getLedgerBalance", () => {
    beforeEach(() => vi.clearAllMocks());

    it("sums credits and debits for a ledger", async () => {
        const admin = buildAdmin({
            balanceRows: { donation: [{ amount: 100 }, { amount: 50 }, { amount: -20 }] },
        });
        const balance = await getLedgerBalance(admin, "donation");
        expect(balance).toBe(130);
    });

    it("returns 0 for an empty ledger", async () => {
        const admin = buildAdmin({ balanceRows: { revenue: [] } });
        const balance = await getLedgerBalance(admin, "revenue");
        expect(balance).toBe(0);
    });
});

describe("getLedgerEntriesForReference", () => {
    beforeEach(() => vi.clearAllMocks());

    it("returns entries for a reference, ordered", async () => {
        const rows = [
            { id: "1", ledger: "donation", amount: 100, reference_type: "redemption", reference_id: "r1", description: null, created_at: "t1" },
        ];
        const admin = buildAdmin({ referenceRows: rows });
        const entries = await getLedgerEntriesForReference(admin, "redemption", "r1");
        expect(entries).toEqual(rows);
    });
});

describe("reconcileLedgers", () => {
    beforeEach(() => vi.clearAllMocks());

    it("reports balanced when donation == vendor_payable + revenue", async () => {
        const admin = buildAdmin({
            balanceRows: {
                donation: [{ amount: 100 }],
                vendor_payable: [{ amount: 80 }],
                revenue: [{ amount: 20 }],
            },
        });
        const result = await reconcileLedgers(admin);
        expect(result.balanced).toBe(true);
        expect(result.discrepancy).toBe(0);
    });

    it("reports unbalanced with the discrepancy when they don't tie out", async () => {
        const admin = buildAdmin({
            balanceRows: {
                donation: [{ amount: 100 }],
                vendor_payable: [{ amount: 70 }],
                revenue: [{ amount: 20 }],
            },
        });
        const result = await reconcileLedgers(admin);
        expect(result.balanced).toBe(false);
        expect(result.discrepancy).toBe(10);
    });
});
