import { beforeEach, describe, expect, it, vi } from "vitest";

import { recordConsent, hasActiveConsent, CURRENT_CONSENT_VERSION } from "@/lib/services/consent";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Spec references:
 * - §3.3 consent management, M2-14 Legal & compliance
 * - DPDP-aligned: versioned so policy change can require re-consent
 * - Consent types: data_privacy, communications, data_processing
 */

function buildClient(existing: unknown, insertResult?: { id: string }, insertError?: string) {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    chain.select = vi.fn().mockReturnValue(chain);
    chain.eq = vi.fn().mockReturnValue(chain);
    chain.is = vi.fn().mockReturnValue(chain);
    chain.maybeSingle = vi.fn().mockResolvedValue({ data: existing, error: null });
    const single = vi.fn().mockResolvedValue(
        insertError ? { data: null, error: { message: insertError } } : { data: insertResult ?? { id: "new-1" }, error: null }
    );
    chain.single = single;
    const from = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue(chain),
        insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single }) }),
    });
    return { from } as unknown as SupabaseClient;
}

describe("recordConsent", () => {
    beforeEach(() => vi.clearAllMocks());

    it("returns existing id if active consent exists (idempotent)", async () => {
        const client = buildClient({ id: "existing-1" });
        const id = await recordConsent(client, {
            subjectType: "donor", subjectId: "d1", consentType: "data_privacy",
        });
        expect(id).toBe("existing-1");
    });

    it("inserts new consent when none exists", async () => {
        const client = buildClient(null, { id: "new-1" });
        const id = await recordConsent(client, {
            subjectType: "donor", subjectId: "d1", consentType: "data_privacy",
        });
        expect(id).toBe("new-1");
    });

    it("uses CURRENT_CONSENT_VERSION by default", () => {
        expect(CURRENT_CONSENT_VERSION).toBe("v1");
    });

    it("throws on insert error", async () => {
        const client = buildClient(null, undefined, "db error");
        await expect(recordConsent(client, {
            subjectType: "donor", subjectId: "d1", consentType: "data_privacy",
        })).rejects.toThrow("db error");
    });
});

describe("hasActiveConsent", () => {
    it("returns true when active consent exists", async () => {
        const client = buildClient({ id: "c1" });
        expect(await hasActiveConsent(client, "donor", "d1", "data_privacy")).toBe(true);
    });

    it("returns false when no consent exists", async () => {
        const client = buildClient(null);
        expect(await hasActiveConsent(client, "donor", "d1", "data_privacy")).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Spec-derived tests — M2-14, DPDP-aligned
// ---------------------------------------------------------------------------

describe("consent — spec-derived versioning & types", () => {
    beforeEach(() => vi.clearAllMocks());

    it("consent is versioned (spec: versioned so policy change can require re-consent)", () => {
        // CURRENT_CONSENT_VERSION must exist and be a non-empty string
        expect(typeof CURRENT_CONSENT_VERSION).toBe("string");
        expect(CURRENT_CONSENT_VERSION.length).toBeGreaterThan(0);
    });

    it("data_privacy consent type is accepted", async () => {
        const client = buildClient(null, { id: "c1" });
        const id = await recordConsent(client, {
            subjectType: "donor", subjectId: "d1", consentType: "data_privacy",
        });
        expect(id).toBe("c1");
    });

    it("communications consent type is accepted", async () => {
        const client = buildClient(null, { id: "c2" });
        const id = await recordConsent(client, {
            subjectType: "donor", subjectId: "d1", consentType: "communications",
        });
        expect(id).toBe("c2");
    });

    it("data_processing consent type is accepted", async () => {
        const client = buildClient(null, { id: "c3" });
        const id = await recordConsent(client, {
            subjectType: "donor", subjectId: "d1", consentType: "data_processing",
        });
        expect(id).toBe("c3");
    });
});
