import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/system-config", async (importActual) => {
    const actual = await importActual<typeof import("@/lib/system-config")>();
    return { ...actual, getConfig: vi.fn() };
});

import { computePhash, hammingDistanceHex, findDuplicateProof } from "@/lib/services/proofIntegrity";
import { getConfig } from "@/lib/system-config";
import type { SupabaseClient } from "@supabase/supabase-js";

const getConfigMock = vi.mocked(getConfig);

describe("computePhash", () => {
    it("returns a 16-char hex string", () => {
        const bytes = new Uint8Array(256).fill(128);
        const hash = computePhash(bytes);
        expect(hash).toHaveLength(16);
        expect(hash).toMatch(/^[0-9a-f]{16}$/);
    });

    it("is deterministic — same bytes produce same hash", () => {
        const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
        expect(computePhash(bytes)).toBe(computePhash(bytes));
    });

    it("returns a valid 16-char hash for empty input", () => {
        const hash = computePhash(new Uint8Array(0));
        expect(hash).toHaveLength(16);
        expect(hash).toMatch(/^[0-9a-f]{16}$/);
    });

    it("produces different hashes for different inputs", () => {
        const a = computePhash(new Uint8Array(256).fill(0));
        const b = computePhash(new Uint8Array(256).fill(255));
        // Both uniform → all buckets equal → might be same (all bits same relative to mean)
        // But let's test with genuinely different data
        const c = computePhash(new Uint8Array([0, 255, 0, 255, 0, 255, 0, 255]));
        const d = computePhash(new Uint8Array([255, 0, 255, 0, 255, 0, 255, 0]));
        // c and d should differ (inverse patterns)
        expect(c).not.toBe(d);
    });

    it("accepts ArrayBuffer input", () => {
        const buf = new ArrayBuffer(64);
        new Uint8Array(buf).fill(42);
        const hash = computePhash(buf);
        expect(hash).toHaveLength(16);
    });
});

describe("hammingDistanceHex", () => {
    it("returns 0 for identical hashes", () => {
        expect(hammingDistanceHex("abcdef0123456789", "abcdef0123456789")).toBe(0);
    });

    it("returns correct distance for known difference", () => {
        // 'a' = 1010, 'b' = 1011 → 1 bit difference
        expect(hammingDistanceHex("a", "b")).toBe(1);
    });

    it("returns max bits for inverse hashes", () => {
        // '0' = 0000, 'f' = 1111 → 4 bits different
        expect(hammingDistanceHex("0", "f")).toBe(4);
    });

    it("returns Infinity for empty strings", () => {
        expect(hammingDistanceHex("", "")).toBe(Infinity);
        expect(hammingDistanceHex("abc", "")).toBe(Infinity);
        expect(hammingDistanceHex("", "abc")).toBe(Infinity);
    });

    it("returns Infinity for mismatched lengths", () => {
        expect(hammingDistanceHex("abc", "abcd")).toBe(Infinity);
    });

    it("returns Infinity for invalid hex", () => {
        expect(hammingDistanceHex("xyz", "abc")).toBe(Infinity);
    });

    it("handles full 16-char hash comparison", () => {
        const dist = hammingDistanceHex("0000000000000000", "ffffffffffffffff");
        expect(dist).toBe(64); // all 64 bits different
    });
});

describe("findDuplicateProof", () => {
    beforeEach(() => vi.clearAllMocks());

    function buildAdmin(rows: unknown[]) {
        const chain: Record<string, ReturnType<typeof vi.fn>> = {};
        chain.select = vi.fn().mockReturnValue(chain);
        chain.not = vi.fn().mockReturnValue(chain);
        chain.neq = vi.fn().mockReturnValue(chain);
        chain.then = vi.fn().mockImplementation((resolve: (v: unknown) => void) =>
            resolve({ data: rows, error: null })
        );
        const from = vi.fn().mockReturnValue(chain);
        return { from } as unknown as SupabaseClient;
    }

    it("returns null when phash is empty", async () => {
        const admin = buildAdmin([]);
        expect(await findDuplicateProof("", admin)).toBeNull();
    });

    it("returns null when config key is missing (soft-skip)", async () => {
        getConfigMock.mockRejectedValue(new Error("missing"));
        const admin = buildAdmin([]);

        expect(await findDuplicateProof("abcdef0123456789", admin)).toBeNull();
    });

    it("returns null when config value is null", async () => {
        getConfigMock.mockResolvedValue(null);
        const admin = buildAdmin([]);

        expect(await findDuplicateProof("abcdef0123456789", admin)).toBeNull();
    });

    it("finds exact duplicate (distance 0)", async () => {
        getConfigMock.mockResolvedValue(10);
        const admin = buildAdmin([
            { id: "r1", vendor_id: "v1", proof_photo_phash: "abcdef0123456789" },
        ]);

        const match = await findDuplicateProof("abcdef0123456789", admin);

        expect(match).not.toBeNull();
        expect(match!.redemption_id).toBe("r1");
        expect(match!.distance).toBe(0);
    });

    it("returns null when no match within threshold", async () => {
        getConfigMock.mockResolvedValue(2); // very strict
        const admin = buildAdmin([
            { id: "r1", vendor_id: "v1", proof_photo_phash: "ffffffffffffffff" },
        ]);

        const match = await findDuplicateProof("0000000000000000", admin);

        expect(match).toBeNull(); // distance=64, way above threshold=2
    });

    it("returns closest match when multiple candidates", async () => {
        getConfigMock.mockResolvedValue(10);
        const admin = buildAdmin([
            { id: "r1", vendor_id: "v1", proof_photo_phash: "abcdef0123456780" }, // close
            { id: "r2", vendor_id: "v1", proof_photo_phash: "abcdef0123456789" }, // exact
        ]);

        const match = await findDuplicateProof("abcdef0123456789", admin);

        expect(match!.redemption_id).toBe("r2");
        expect(match!.distance).toBe(0);
    });

    it("skips rows with null proof_photo_phash", async () => {
        getConfigMock.mockResolvedValue(10);
        const admin = buildAdmin([
            { id: "r1", vendor_id: "v1", proof_photo_phash: null },
        ]);

        const match = await findDuplicateProof("abcdef0123456789", admin);

        expect(match).toBeNull();
    });
});
