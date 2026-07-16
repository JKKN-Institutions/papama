import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/services/audit", () => ({
    writeAuditLog: vi.fn().mockResolvedValue(undefined),
    AuditError: class AuditError extends Error { name = "AuditError"; },
}));
vi.mock("@/lib/services/creditRefund", () => ({
    refundCredit: vi.fn(),
}));

import type { SupabaseClient } from "@supabase/supabase-js";

import { logPaymentFailure, requestRefund, decideRefund } from "@/lib/services/refund";
import { writeAuditLog } from "@/lib/services/audit";
import { refundCredit } from "@/lib/services/creditRefund";
import { makeUser } from "@test/helpers";

/**
 * Spec references:
 * - §3.1 F-10, §11.2 #3 — refunds ONLY for failed/duplicate payment cases,
 *   never voluntary withdrawal (schema-enforced: refunds.payment_failure_id NOT NULL)
 * - §18 (addon) — a refund approval posts a donation-ledger reversal
 */

const refundCreditMock = vi.mocked(refundCredit);
const actor = makeUser("admin", { id: "admin-1" });

describe("logPaymentFailure", () => {
    beforeEach(() => vi.clearAllMocks());

    function buildAdmin(opts: { insertError?: string } = {}) {
        const from = vi.fn().mockReturnValue({
            insert: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue(
                        opts.insertError
                            ? { data: null, error: { message: opts.insertError } }
                            : { data: { id: "pf-1" }, error: null }
                    ),
                }),
            }),
        });
        return { from } as unknown as SupabaseClient;
    }

    it("logs a payment failure and returns its id", async () => {
        const admin = buildAdmin();
        const result = await logPaymentFailure(
            admin,
            { donorId: "d1", amountInr: 100, reason: "gateway_failed" },
            actor
        );
        expect(result.id).toBe("pf-1");
        expect(writeAuditLog).toHaveBeenCalledWith(
            expect.objectContaining({ action: "payment_failure.log" }),
            admin
        );
    });

    it("throws when the insert fails", async () => {
        const admin = buildAdmin({ insertError: "insert failed" });
        await expect(
            logPaymentFailure(admin, { donorId: "d1", amountInr: 100, reason: "other" }, actor)
        ).rejects.toThrow("insert failed");
    });
});

describe("requestRefund", () => {
    beforeEach(() => vi.clearAllMocks());

    function buildAdmin(opts: {
        paymentFailure?: Record<string, unknown> | null;
        insertError?: string;
    }) {
        const from = vi.fn().mockImplementation((table: string) => {
            if (table === "payment_failures") {
                return {
                    select: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            maybeSingle: vi.fn().mockResolvedValue({
                                data: opts.paymentFailure === undefined
                                    ? { id: "pf-1", donor_id: "d1", amount_inr: 100, status: "open" }
                                    : opts.paymentFailure,
                                error: null,
                            }),
                        }),
                    }),
                };
            }
            if (table === "refunds") {
                return {
                    insert: vi.fn().mockReturnValue({
                        select: vi.fn().mockReturnValue({
                            single: vi.fn().mockResolvedValue(
                                opts.insertError
                                    ? { data: null, error: { message: opts.insertError } }
                                    : { data: { id: "refund-1" }, error: null }
                            ),
                        }),
                    }),
                };
            }
            return {};
        });
        return { from } as unknown as SupabaseClient;
    }

    it("creates a refund request against an open payment failure", async () => {
        const admin = buildAdmin({});
        const result = await requestRefund(
            admin,
            { paymentFailureId: "pf-1", donorId: "d1", amountInr: 50, reason: "duplicate charge" },
            actor
        );
        expect(result.id).toBe("refund-1");
    });

    it("rejects when the payment failure does not exist", async () => {
        const admin = buildAdmin({ paymentFailure: null });
        await expect(
            requestRefund(admin, { paymentFailureId: "missing", donorId: "d1", amountInr: 50, reason: "x" }, actor)
        ).rejects.toThrow("payment failure not found");
    });

    it("rejects an ownership mismatch as not-found", async () => {
        const admin = buildAdmin({
            paymentFailure: { id: "pf-1", donor_id: "someone-else", amount_inr: 100, status: "open" },
        });
        await expect(
            requestRefund(admin, { paymentFailureId: "pf-1", donorId: "d1", amountInr: 50, reason: "x" }, actor)
        ).rejects.toThrow("payment failure not found");
    });

    it("rejects when the payment failure is not open", async () => {
        const admin = buildAdmin({
            paymentFailure: { id: "pf-1", donor_id: "d1", amount_inr: 100, status: "resolved" },
        });
        await expect(
            requestRefund(admin, { paymentFailureId: "pf-1", donorId: "d1", amountInr: 50, reason: "x" }, actor)
        ).rejects.toThrow(/not open/);
    });

    it("rejects a refund amount exceeding the failed payment amount", async () => {
        const admin = buildAdmin({});
        await expect(
            requestRefund(admin, { paymentFailureId: "pf-1", donorId: "d1", amountInr: 500, reason: "x" }, actor)
        ).rejects.toThrow(/cannot exceed/);
    });
});

describe("decideRefund", () => {
    beforeEach(() => vi.clearAllMocks());

    function buildAdmin(opts: {
        refundRow?: Record<string, unknown> | null;
    }) {
        const from = vi.fn().mockImplementation((table: string) => {
            if (table === "refunds") {
                return {
                    select: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            maybeSingle: vi.fn().mockResolvedValue({
                                data: opts.refundRow === undefined
                                    ? {
                                          id: "refund-1", donor_id: "d1", amount_inr: 50,
                                          status: "pending", payment_failure_id: "pf-1", reason: "test",
                                      }
                                    : opts.refundRow,
                                error: null,
                            }),
                        }),
                    }),
                    update: vi.fn().mockReturnValue({
                        eq: vi.fn().mockReturnValue({
                            eq: vi.fn().mockResolvedValue({ error: null }),
                        }),
                    }),
                };
            }
            if (table === "payment_failures") {
                return {
                    update: vi.fn().mockReturnValue({
                        eq: vi.fn().mockResolvedValue({ error: null }),
                    }),
                };
            }
            return {};
        });
        return { from } as unknown as SupabaseClient;
    }

    it("rejects: updates status, no credit reversal", async () => {
        const admin = buildAdmin({});
        const result = await decideRefund(admin, "refund-1", "reject", actor, "not eligible");
        expect(result).toEqual({ id: "refund-1", status: "rejected" });
        expect(refundCreditMock).not.toHaveBeenCalled();
    });

    it("approves: reverses credit, marks refund completed and payment_failure resolved", async () => {
        refundCreditMock.mockResolvedValue({ reversed: 50, requested: 50, balance: 0, partial: false });
        const admin = buildAdmin({});
        const result = await decideRefund(admin, "refund-1", "approve", actor);
        expect(result).toEqual({ id: "refund-1", status: "completed", reversed: 50 });
        expect(refundCreditMock).toHaveBeenCalledWith(
            expect.objectContaining({
                donorId: "d1",
                amountInr: 50,
                ledgerReference: { referenceType: "refund", referenceId: "refund-1" },
            })
        );
    });

    it("throws when the refund is not found", async () => {
        const admin = buildAdmin({ refundRow: null });
        await expect(decideRefund(admin, "missing", "approve", actor)).rejects.toThrow(
            "refund not found"
        );
    });

    it("throws when the refund is not pending", async () => {
        const admin = buildAdmin({
            refundRow: {
                id: "refund-1", donor_id: "d1", amount_inr: 50,
                status: "completed", payment_failure_id: "pf-1", reason: "test",
            },
        });
        await expect(decideRefund(admin, "refund-1", "approve", actor)).rejects.toThrow(/not pending/);
    });
});
