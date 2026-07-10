import { describe, expect, it } from "vitest";
import { getGreatCircleDistanceKm } from "@/lib/services/geo";

describe("getGreatCircleDistanceKm", () => {
    it("returns 0 for identical points", () => {
        expect(getGreatCircleDistanceKm(13.08, 80.27, 13.08, 80.27)).toBe(0);
    });

    it("computes correct distance between known cities", () => {
        // Chennai (13.08, 80.27) to Delhi (28.61, 77.21) ≈ 1750-1770 km
        const dist = getGreatCircleDistanceKm(13.08, 80.27, 28.61, 77.21);
        expect(dist).toBeGreaterThan(1700);
        expect(dist).toBeLessThan(1800);
    });

    it("computes short distance correctly", () => {
        // ~1 km apart (roughly 0.009 degrees latitude)
        const dist = getGreatCircleDistanceKm(13.08, 80.27, 13.089, 80.27);
        expect(dist).toBeGreaterThan(0.9);
        expect(dist).toBeLessThan(1.1);
    });

    it("is symmetric", () => {
        const d1 = getGreatCircleDistanceKm(13.08, 80.27, 28.61, 77.21);
        const d2 = getGreatCircleDistanceKm(28.61, 77.21, 13.08, 80.27);
        expect(d1).toBeCloseTo(d2, 10);
    });

    it("handles antipodal points", () => {
        // North pole to south pole ≈ 20015 km (half earth circumference)
        const dist = getGreatCircleDistanceKm(90, 0, -90, 0);
        expect(dist).toBeGreaterThan(20000);
        expect(dist).toBeLessThan(20100);
    });

    it("handles equatorial crossing", () => {
        const dist = getGreatCircleDistanceKm(1, 0, -1, 0);
        expect(dist).toBeGreaterThan(200);
        expect(dist).toBeLessThan(230);
    });

    it("handles same latitude different longitude", () => {
        // At equator, 1 degree longitude ≈ 111 km
        const dist = getGreatCircleDistanceKm(0, 0, 0, 1);
        expect(dist).toBeGreaterThan(110);
        expect(dist).toBeLessThan(112);
    });
});
