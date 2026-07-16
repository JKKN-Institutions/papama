import { beforeEach, describe, expect, it, vi } from "vitest";

import { refundCredit } from "@/lib/services/creditRefund";
import { postLedgerEntry } from "@/lib/services/ledger";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/services/ledger", () => ({
    postLedgerEntry: vi.fn().mockResolvedValue({ id: "le-1" }),
}));

/**
 * Spec references:
 * - §3.1 F-10, §3.2, §3.3 — donations are non-withdrawable
 * - Refunds only for failed/duplicate payments
 * - Partial reversal caps at balance
 */

function buildAdmin(balance: number | null, updateSuccess = true) {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    chain.select = vi.fn().mockReturnValue(chain);
    chain.eq = vi.fn().mockReturnValue(chain);
    chain.maybeSingle = vi.fn().mockResolvedValue({
        data: balance !== null ? { balance_inr: balance, donor_id: "d1" } : null,
        error: null,
    });
    const updateChain: Record<string, ReturnType<typeof vi.fn>> = {};
    updateChain.eq = vi.fn().mockReturnValue(updateChain);
    updateChain.select = vi.fn().mockReturnValue(updateChain);
    updateChain.maybeSingle = vi.fn().mockResolvedValue({
        data: updateSuccess ? { donor_id: "d1" } : null,
        error: null,
    });
    const from = vi.fn().mockImplementation((table: string) => {
        if (table === "donor_credits") {
            return { select: vi.fn().mockReturnValue(chain), update: vi.fn().mockReturnValue(updateChain) };
        }
        if (table === "credit_transactions") {
            return {
                insert: vi.fn().mockReturnValue({
                    select: vi.fn().mockReturnValue({
                        single: vi.fn().mockResolvedValue({ data: { id: "tx-1" }, error: null }),
                    }),
                }),
            };
        }
        return {};
    });
    return { from } as unknown as SupabaseClient;
}

describe("refundCredit", () => {
    beforeEach(() => vi.clearAllMocks());

    it("reverses full amount when balance >= requested", async () => {
        const admin = buildAdmin(100);
        const result = await refundCredit({ admin, donorId: "d1", amountInr: 50, reason: "chargeback" });

        expect(result.reversed).toBe(50);
        expect(result.requested).toBe(50);
        expect(result.balance).toBe(50);
        expect(result.partial).toBe(false);
    });

    // Spec §3.2: partial reversal caps at balance
    it("caps reversal at live balance (partial)", async () => {
        const admin = buildAdmin(30);
        const result = await refundCredit({ admin, donorId: "d1", amountInr: 50, reason: "test" });

        expect(result.reversed).toBe(30);
        expect(result.partial).toBe(true);
        expect(result.balance).toBe(0);
    });

    it("returns zero reversal when no credit row exists", async () => {
        const admin = buildAdmin(null);
        const result = await refundCredit({ admin, donorId: "d1", amountInr: 50, reason: "test" });

        expect(result.reversed).toBe(0);
        expect(result.partial).toBe(true);
    });

    it("returns zero reversal when balance is 0", async () => {
        const admin = buildAdmin(0);
        const result = await refundCredit({ admin, donorId: "d1", amountInr: 50, reason: "test" });

        expect(result.reversed).toBe(0);
        expect(result.partial).toBe(true);
    });

    // Spec §3.1 F-10: refund amount must be positive
    it("throws when amount is not positive", async () => {
        const admin = buildAdmin(100);
        await expect(refundCredit({ admin, donorId: "d1", amountInr: 0, reason: "test" })).rejects.toThrow("positive");
        await expect(refundCredit({ admin, donorId: "d1", amountInr: -10, reason: "test" })).rejects.toThrow("positive");
    });

    // addon #18 — triple-ledger integration
    it("posts a donation-ledger debit on a successful reversal", async () => {
        const admin = buildAdmin(100);
        await refundCredit({ admin, donorId: "d1", amountInr: 50, reason: "chargeback" });

        expect(postLedgerEntry).toHaveBeenCalledWith(
            expect.objectContaining({ ledger: "donation", amountInr: -50 })
        );
    });

    it("uses the caller's ledgerReference when provided (addon #14/#20 refund workflow)", async () => {
        const admin = buildAdmin(100);
        await refundCredit({
            admin, donorId: "d1", amountInr: 50, reason: "refund",
            ledgerReference: { referenceType: "refund", referenceId: "refund-1" },
        });

        expect(postLedgerEntry).toHaveBeenCalledWith(
            expect.objectContaining({ referenceType: "refund", referenceId: "refund-1" })
        );
    });

    it("does not post a ledger entry when nothing was reversed", async () => {
        const admin = buildAdmin(0);
        await refundCredit({ admin, donorId: "d1", amountInr: 50, reason: "test" });
        expect(postLedgerEntry).not.toHaveBeenCalled();
    });
});
