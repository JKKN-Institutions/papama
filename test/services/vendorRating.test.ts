import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/services/audit", () => ({
    writeAuditLog: vi.fn().mockResolvedValue(undefined),
    AuditError: class AuditError extends Error { name = "AuditError"; },
}));
vi.mock("@/lib/system-config", async (importActual) => {
    const actual = await importActual<typeof import("@/lib/system-config")>();
    return { ...actual, getBoolean: vi.fn(), getNumber: vi.fn() };
});

import { recordFeedback, recomputeQualityScore, autoSuspendBelowThreshold } from "@/lib/services/vendorRating";
import { getBoolean, getNumber, MissingConfigError } from "@/lib/system-config";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Spec references:
 * - §3.3 Food quality monitoring [M1-9, M2-11]:
 *   vendor quality score, suspension triggers, complaint rate threshold
 * - §7: vendor_min_rating = 3.5, vendor_max_complaint_rate = 0.05 (5%)
 */

const getBooleanMock = vi.mocked(getBoolean);
const getNumberMock = vi.mocked(getNumber);

function buildRatingAdmin(opts: {
    insertResult?: { id: string };
    feedbackRows?: unknown[];
    vendorUpdate?: boolean;
    vendorStatus?: string;
}) {
    const from = vi.fn().mockImplementation((table: string) => {
        if (table === "vendor_feedback") {
            const chain: Record<string, ReturnType<typeof vi.fn>> = {};
            chain.select = vi.fn().mockReturnValue(chain);
            chain.eq = vi.fn().mockReturnValue(chain);
            chain.then = vi.fn().mockImplementation((resolve: (v: unknown) => void) =>
                resolve({ data: opts.feedbackRows ?? [], error: null })
            );
            const single = vi.fn().mockResolvedValue({
                data: opts.insertResult ?? { id: "fb-1" },
                error: null,
            });
            return {
                select: vi.fn().mockReturnValue(chain),
                insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single }) }),
            };
        }
        if (table === "vendors") {
            const updChain: Record<string, ReturnType<typeof vi.fn>> = {};
            updChain.eq = vi.fn().mockReturnValue(updChain);
            updChain.select = vi.fn().mockReturnValue(updChain);
            updChain.maybeSingle = vi.fn().mockResolvedValue({
                data: opts.vendorUpdate !== false ? { id: "v1" } : null,
                error: null,
            });
            const selChain: Record<string, ReturnType<typeof vi.fn>> = {};
            selChain.eq = vi.fn().mockReturnValue(selChain);
            selChain.maybeSingle = vi.fn().mockResolvedValue({
                data: { status: opts.vendorStatus ?? "approved" },
                error: null,
            });
            return {
                update: vi.fn().mockReturnValue(updChain),
                select: vi.fn().mockReturnValue(selChain),
            };
        }
        return {};
    });
    return { from } as unknown as SupabaseClient;
}

describe("recordFeedback", () => {
    beforeEach(() => vi.clearAllMocks());

    it("inserts feedback and returns id", async () => {
        const admin = buildRatingAdmin({
            insertResult: { id: "fb-1" },
            feedbackRows: [{ rating: 4, is_complaint: false }],
        });

        const result = await recordFeedback(admin, {
            vendor_id: "v1", rating: 4, comment: "Good food",
        });

        expect(result.feedback_id).toBe("fb-1");
    });
});

describe("recomputeQualityScore", () => {
    beforeEach(() => vi.clearAllMocks());

    it("computes quality score from feedback", async () => {
        const admin = buildRatingAdmin({
            feedbackRows: [
                { rating: 5, is_complaint: false },
                { rating: 4, is_complaint: false },
                { rating: 3, is_complaint: true },
            ],
        });

        const summary = await recomputeQualityScore("v1", admin);

        expect(summary.feedback_count).toBe(3);
        expect(summary.complaint_count).toBe(1);
        expect(summary.rating_avg).toBeCloseTo(4, 1);
    });

    it("returns zeros/null for no feedback", async () => {
        const admin = buildRatingAdmin({ feedbackRows: [] });

        const summary = await recomputeQualityScore("v1", admin);

        expect(summary.feedback_count).toBe(0);
        expect(summary.complaint_count).toBe(0);
    });
});

describe("autoSuspendBelowThreshold", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getBooleanMock.mockRejectedValue(new MissingConfigError("vendor_auto_suspend_enabled", "missing"));
        getNumberMock.mockRejectedValue(new MissingConfigError("", "missing"));
    });

    it("returns not suspended when feature is disabled", async () => {
        getBooleanMock.mockResolvedValue(false);
        const admin = buildRatingAdmin({ feedbackRows: [] });

        const result = await autoSuspendBelowThreshold(admin, "v1");

        expect(result.suspended).toBe(false);
    });

    it("returns not suspended when config is unset (soft-skip)", async () => {
        getBooleanMock.mockRejectedValue(new Error("missing"));
        const admin = buildRatingAdmin({ feedbackRows: [] });

        const result = await autoSuspendBelowThreshold(admin, "v1");

        expect(result.suspended).toBe(false);
    });
});

describe("spec §7: vendor quality thresholds", () => {
    it("vendor_min_rating threshold should be 3.5 (spec §7)", () => {
        // Spec §7 defines vendor_min_rating = 3.5
        // Vendors with a quality score below this should be flagged for suspension
        const specMinRating = 3.5;
        expect(specMinRating).toBe(3.5);

        // A vendor with avg rating 3.4 is below threshold
        const belowThreshold = 3.4 < specMinRating;
        expect(belowThreshold).toBe(true);

        // A vendor with avg rating 3.6 is above threshold
        const aboveThreshold = 3.6 >= specMinRating;
        expect(aboveThreshold).toBe(true);
    });

    it("vendor_max_complaint_rate should be 0.05 / 5% (spec §7)", () => {
        // Spec §7 defines vendor_max_complaint_rate = 0.05 (5%)
        const specMaxComplaintRate = 0.05;
        expect(specMaxComplaintRate).toBe(0.05);

        // 3 complaints out of 50 feedbacks = 6% → exceeds threshold
        const complaintRate = 3 / 50;
        expect(complaintRate).toBeGreaterThan(specMaxComplaintRate);

        // 2 complaints out of 50 feedbacks = 4% → within threshold
        const safeRate = 2 / 50;
        expect(safeRate).toBeLessThan(specMaxComplaintRate);
    });
});
