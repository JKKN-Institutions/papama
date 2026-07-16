import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/system-config", async (importActual) => {
    const actual = await importActual<typeof import("@/lib/system-config")>();
    return { ...actual, getNumber: vi.fn(), getBoolean: vi.fn() };
});
vi.mock("@/app/api/_lib/tokenQr", () => ({
    deriveQrPayload: vi.fn().mockReturnValue("PAPAMA:mock-payload"),
    qrHashOf: vi.fn().mockReturnValue("mock-qr-hash"),
}));
vi.mock("@/lib/services/audit", () => ({
    writeAuditLog: vi.fn().mockResolvedValue(undefined),
    AuditError: class AuditError extends Error { name = "AuditError"; },
}));

import type { SupabaseClient } from "@supabase/supabase-js";

import { reportTokenLost, revalidateToken } from "@/lib/services/token";
import { writeAuditLog } from "@/lib/services/audit";
import { getBoolean, getNumber, MissingConfigError } from "@/lib/system-config";
import { makeUser } from "@test/helpers";

/**
 * Spec references:
 * - §3.2 Token rules [M2-5]: lost-token handling (report -> block -> replace)
 * - §3.2/§7 [M2-5]: token revalidation (admin, audited, config-gated)
 */

const getNumberMock = vi.mocked(getNumber);
const getBooleanMock = vi.mocked(getBoolean);

const BASE_TOKEN = {
    id: "tok-old",
    status: "live",
    serial_number: "PPM-STD-OLD",
    value_inr: 50,
    token_type: "standard",
    donor_id: "donor-1",
    beneficiary_id: null,
    campaign_id: null,
    is_emergency: false,
    expires_at: "2026-12-01T00:00:00.000Z",
};

function buildAdminForReportLoss(opts: {
    tokenRow?: Record<string, unknown> | null;
    blockedRows?: Array<{ id: string }>;
    mintResult?: { id: string; serial_number: string };
    mintError?: string;
}) {
    const tokens = {
        select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                    data: opts.tokenRow === undefined ? BASE_TOKEN : opts.tokenRow,
                    error: null,
                }),
            }),
        }),
        // Handles both call shapes: the block CAS (.eq(id).eq(status).select())
        // and the un-block rollback (.eq(id) alone, result never inspected).
        update: vi.fn().mockImplementation(() => ({
            eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                    select: vi.fn().mockResolvedValue({
                        data: opts.blockedRows ?? [{ id: "tok-old" }],
                        error: null,
                    }),
                }),
            }),
        })),
        insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue(
                    opts.mintError
                        ? { data: null, error: { message: opts.mintError } }
                        : { data: opts.mintResult ?? { id: "tok-new", serial_number: "PPM-RPL-NEW" }, error: null }
                ),
            }),
        }),
    };

    const from = vi.fn().mockImplementation((table: string) => {
        if (table === "tokens") return tokens;
        return {};
    });
    return { from } as unknown as SupabaseClient;
}

describe("reportTokenLost", () => {
    const actor = makeUser("admin", { id: "admin-1" });

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("blocks the old token and mints a same-value replacement", async () => {
        const client = buildAdminForReportLoss({});
        const result = await reportTokenLost({ tokenId: "tok-old" }, actor, client);

        expect(result.old_token_id).toBe("tok-old");
        expect(result.new_token_id).toBe("tok-new");
        expect(result.new_serial).toBe("PPM-RPL-NEW");
        expect(result.value_inr).toBe(50);
    });

    it("writes an audit log", async () => {
        const client = buildAdminForReportLoss({});
        await reportTokenLost({ tokenId: "tok-old", reason: "left in an auto" }, actor, client);

        expect(writeAuditLog).toHaveBeenCalledWith(
            expect.objectContaining({ action: "token.report_lost", entity_table: "tokens" }),
            client
        );
    });

    it("rejects when the token is not found", async () => {
        const client = buildAdminForReportLoss({ tokenRow: null });
        await expect(reportTokenLost({ tokenId: "missing" }, actor, client)).rejects.toThrow(
            "token not found"
        );
    });

    it("rejects a token that isn't live/distributed", async () => {
        const client = buildAdminForReportLoss({ tokenRow: { ...BASE_TOKEN, status: "redeemed" } });
        await expect(reportTokenLost({ tokenId: "tok-old" }, actor, client)).rejects.toThrow(
            /only a live\/distributed token/
        );
    });

    it("rejects an ownership mismatch as not-found (donor self-service)", async () => {
        const client = buildAdminForReportLoss({});
        await expect(
            reportTokenLost({ tokenId: "tok-old", expectedDonorId: "someone-else" }, actor, client)
        ).rejects.toThrow("token not found");
    });

    it("throws when the concurrent block CAS loses (status changed underneath)", async () => {
        const client = buildAdminForReportLoss({ blockedRows: [] });
        await expect(reportTokenLost({ tokenId: "tok-old" }, actor, client)).rejects.toThrow(
            /concurrently/
        );
    });

    it("rolls back the block and rethrows when minting the replacement fails", async () => {
        const client = buildAdminForReportLoss({ mintError: "insert failed" });
        await expect(reportTokenLost({ tokenId: "tok-old" }, actor, client)).rejects.toThrow(
            "insert failed"
        );
    });
});

function buildAdminForRevalidate(opts: {
    tokenRow?: Record<string, unknown> | null;
    distributionCount?: number;
    updatedRows?: Array<{ id: string }>;
}) {
    const tables: Record<string, unknown> = {
        tokens: {
            select: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                        data: opts.tokenRow === undefined
                            ? { id: "tok-1", status: "expired", expires_at: "2026-01-01T00:00:00.000Z" }
                            : opts.tokenRow,
                        error: null,
                    }),
                }),
            }),
            update: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                        select: vi.fn().mockResolvedValue({
                            data: opts.updatedRows ?? [{ id: "tok-1" }],
                            error: null,
                        }),
                    }),
                }),
            }),
        },
        token_distribution_records: {
            select: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ count: opts.distributionCount ?? 0, error: null }),
            }),
        },
    };
    const from = vi.fn().mockImplementation((table: string) => tables[table] ?? {});
    return { from } as unknown as SupabaseClient;
}

describe("revalidateToken", () => {
    const actor = makeUser("admin", { id: "admin-1" });

    beforeEach(() => {
        vi.clearAllMocks();
        getBooleanMock.mockResolvedValue(true);
        getNumberMock.mockImplementation(async (key: string) => {
            if (key === "token_expiry_days") return 90;
            throw new MissingConfigError(key, "missing");
        });
    });

    it("throws when revalidation is disabled", async () => {
        getBooleanMock.mockResolvedValue(false);
        const client = buildAdminForRevalidate({});
        await expect(revalidateToken("tok-1", actor, client)).rejects.toThrow(
            "token revalidation is disabled"
        );
    });

    it("rejects a non-expired token", async () => {
        const client = buildAdminForRevalidate({
            tokenRow: { id: "tok-1", status: "live", expires_at: null },
        });
        await expect(revalidateToken("tok-1", actor, client)).rejects.toThrow(
            /only an expired token/
        );
    });

    it("restores 'live' when no distribution record exists", async () => {
        const client = buildAdminForRevalidate({ distributionCount: 0 });
        const result = await revalidateToken("tok-1", actor, client);
        expect(result.restored_status).toBe("live");
    });

    it("restores 'distributed' when a distribution record exists", async () => {
        const client = buildAdminForRevalidate({ distributionCount: 1 });
        const result = await revalidateToken("tok-1", actor, client);
        expect(result.restored_status).toBe("distributed");
    });

    it("throws when token_expiry_days is unset", async () => {
        getNumberMock.mockRejectedValue(new MissingConfigError("token_expiry_days", "missing"));
        const client = buildAdminForRevalidate({});
        await expect(revalidateToken("tok-1", actor, client)).rejects.toThrow();
    });

    it("writes an audit log", async () => {
        const client = buildAdminForRevalidate({});
        await revalidateToken("tok-1", actor, client);
        expect(writeAuditLog).toHaveBeenCalledWith(
            expect.objectContaining({ action: "token.revalidate", entity_table: "tokens" }),
            client
        );
    });
});
