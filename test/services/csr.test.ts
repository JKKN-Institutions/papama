import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/system-config", async (importActual) => {
    const actual = await importActual<typeof import("@/lib/system-config")>();
    return { ...actual, getBoolean: vi.fn() };
});

import { csr80gCertificatesEnabled } from "@/lib/services/csr";
import { getBoolean } from "@/lib/system-config";
import type { SupabaseClient } from "@supabase/supabase-js";

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
