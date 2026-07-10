import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/system-config", async (importActual) => {
    const actual = await importActual<typeof import("@/lib/system-config")>();
    return { ...actual, getBoolean: vi.fn() };
});

import { csr80gCertificatesEnabled } from "@/lib/services/csr";
import { getBoolean } from "@/lib/system-config";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Spec references:
 * - §3.3 CSR module [M1-7, M2-7]
 * - Q5: 80G certificates are deferred (feature flag controls availability)
 */

const getBooleanMock = vi.mocked(getBoolean);

describe("csr80gCertificatesEnabled", () => {
    beforeEach(() => vi.clearAllMocks());

    it("returns true when config is enabled", async () => {
        getBooleanMock.mockResolvedValue(true);
        const admin = {} as SupabaseClient;
        expect(await csr80gCertificatesEnabled(admin)).toBe(true);
    });

    it("returns false when config is disabled", async () => {
        getBooleanMock.mockResolvedValue(false);
        const admin = {} as SupabaseClient;
        expect(await csr80gCertificatesEnabled(admin)).toBe(false);
    });

    it("throws when config key is missing", async () => {
        getBooleanMock.mockRejectedValue(new Error("missing"));
        const admin = {} as SupabaseClient;
        await expect(csr80gCertificatesEnabled(admin)).rejects.toThrow("missing");
    });
});

// ---------------------------------------------------------------------------
// Spec-derived tests — §3.3 CSR, Q5
// ---------------------------------------------------------------------------

describe("csr80gCertificatesEnabled — spec-derived (Q5: 80G deferred)", () => {
    beforeEach(() => vi.clearAllMocks());

    it("80G certificates are deferred — feature flag returns false (spec Q5)", async () => {
        getBooleanMock.mockResolvedValue(false);
        const admin = {} as SupabaseClient;

        const enabled = await csr80gCertificatesEnabled(admin);

        // Per spec Q5, 80G is deferred, so the flag should be false in production
        expect(enabled).toBe(false);
    });
});
