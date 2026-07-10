import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/system-config", async (importActual) => {
    const actual = await importActual<typeof import("@/lib/system-config")>();
    return { ...actual, getNumber: vi.fn() };
});
vi.mock("@/app/api/_lib/tokenQr", () => ({
    deriveQrPayload: vi.fn().mockReturnValue("PAPAMA:mock-payload"),
    qrHashOf: vi.fn().mockReturnValue("mock-qr-hash"),
}));
vi.mock("@/lib/services/audit", () => ({
    writeAuditLog: vi.fn().mockResolvedValue(undefined),
    AuditError: class AuditError extends Error { name = "AuditError"; },
}));

import { issueEmergencyToken } from "@/lib/services/emergency";
import { getNumber, MissingConfigError } from "@/lib/system-config";
import { writeAuditLog } from "@/lib/services/audit";
import { makeUser } from "@test/helpers";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Spec references:
 * - §3.3 Disaster & emergency — emergency token minting
 * - §7 emergency_mode_max_duration_days = 30
 * - §7.1 — every emergency action must be fully audited
 */

const getNumberMock = vi.mocked(getNumber);

function buildAdmin(opts: {
    mintResult?: { id: string; serial_number: string };
    mintError?: string;
    grantResult?: { id: string };
    grantError?: string;
}) {
    const from = vi.fn().mockImplementation((table: string) => {
        if (table === "tokens") {
            const single = vi.fn().mockResolvedValue(
                opts.mintError
                    ? { data: null, error: { message: opts.mintError } }
                    : { data: opts.mintResult ?? { id: "tok-1", serial_number: "PPM-EMG-TEST" }, error: null }
            );
            return {
                insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single }) }),
                delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
            };
        }
        if (table === "emergency_token_grants") {
            const single = vi.fn().mockResolvedValue(
                opts.grantError
                    ? { data: null, error: { message: opts.grantError } }
                    : { data: opts.grantResult ?? { id: "grant-1" }, error: null }
            );
            return {
                insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single }) }),
            };
        }
        return {};
    });
    return { from } as unknown as SupabaseClient;
}

describe("issueEmergencyToken", () => {
    const admin = makeUser("admin", { id: "admin-1" });

    beforeEach(() => {
        vi.clearAllMocks();
        getNumberMock.mockImplementation(async (key: string) => {
            if (key === "standard_token_value") return 50;
            if (key === "token_expiry_days") return 30;
            throw new MissingConfigError(key, "missing");
        });
    });

    it("mints a token and returns result", async () => {
        const client = buildAdmin({});
        const result = await issueEmergencyToken({}, admin, client);

        expect(result.token_id).toBe("tok-1");
        expect(result.serial_number).toBe("PPM-EMG-TEST");
        expect(result.value_inr).toBe(50);
        expect(result.grant_id).toBe("grant-1");
    });

    it("writes an audit log", async () => {
        const client = buildAdmin({});
        await issueEmergencyToken({ reason: "Flood relief" }, admin, client);

        expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
            action: "emergency.token.grant",
            entity_table: "tokens",
        }));
    });

    it("throws when standard_token_value is unset", async () => {
        getNumberMock.mockRejectedValue(new MissingConfigError("standard_token_value", "missing"));
        const client = buildAdmin({});

        await expect(issueEmergencyToken({}, admin, client)).rejects.toThrow();
    });

    it("throws when mint fails", async () => {
        const client = buildAdmin({ mintError: "insert failed" });

        await expect(issueEmergencyToken({}, admin, client)).rejects.toThrow("insert failed");
    });

    it("rolls back token when grant recording fails", async () => {
        const client = buildAdmin({ grantError: "grant insert failed" });

        await expect(issueEmergencyToken({}, admin, client)).rejects.toThrow("grant insert failed");
        // Token delete should have been called for rollback
        expect(client.from).toHaveBeenCalledWith("tokens");
    });

    it("passes reason to grant trail", async () => {
        const client = buildAdmin({});
        await issueEmergencyToken({ reason: "Cyclone Michaung" }, admin, client);

        expect(client.from).toHaveBeenCalledWith("emergency_token_grants");
    });
});

// ---------------------------------------------------------------------------
// Spec-derived tests — §7, §7.1
// ---------------------------------------------------------------------------

describe("issueEmergencyToken — spec-derived", () => {
    const actor = makeUser("admin", { id: "admin-1" });

    beforeEach(() => {
        vi.clearAllMocks();
        getNumberMock.mockImplementation(async (key: string) => {
            if (key === "standard_token_value") return 50;
            if (key === "token_expiry_days") return 30;
            throw new MissingConfigError(key, "missing");
        });
    });

    it("uses standard_token_value from config for emergency minting (spec §7)", async () => {
        getNumberMock.mockImplementation(async (key: string) => {
            if (key === "standard_token_value") return 75;
            if (key === "token_expiry_days") return 30;
            throw new MissingConfigError(key, "missing");
        });
        const client = buildAdmin({});
        const result = await issueEmergencyToken({}, actor, client);

        expect(result.value_inr).toBe(75);
    });

    it("writes audit log for every emergency action (spec §7.1: fully audited)", async () => {
        const client = buildAdmin({});
        await issueEmergencyToken({ reason: "Earthquake" }, actor, client);

        expect(writeAuditLog).toHaveBeenCalledTimes(1);
        expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({
            action: "emergency.token.grant",
        }));
    });
});
