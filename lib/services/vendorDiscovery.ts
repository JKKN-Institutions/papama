import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getGreatCircleDistanceKm } from "@/lib/services/geo";
import { getNumber } from "@/lib/system-config";

/**
 * Nearby-vendor discovery (addon #5).
 *
 * Returns approved vendors near a point, sorted by distance, with operating
 * hours (from meal_windows when present) and live availability attached. This is
 * a BENEFICIARY-FACING read: the vendors RLS is deliberately NOT widened for
 * anon/beneficiary — instead the caller (app/api/beneficiary/nearby-vendors)
 * runs this on the service-role client and we return a SAFE PROJECTION only.
 * Bank details, GST/FSSAI numbers, owner_id and contact email/phone NEVER leave
 * this function.
 */

/** A meal-serving window surfaced to the beneficiary as "operating hours". */
export interface VendorHours {
    /** Optional meal slot label (breakfast/lunch/dinner/snack) when known. */
    meal_type: string | null;
    start_time: string;
    end_time: string;
}

/** The safe, public-facing shape of a nearby vendor. */
export interface NearbyVendor {
    id: string;
    name: string;
    address: string | null;
    city: string | null;
    geo_lat: number | null;
    geo_lng: number | null;
    is_open: boolean;
    stock_exhausted: boolean;
    temporary_closure_until: string | null;
    distance_km: number;
    hours: VendorHours[];
}

export interface FindNearbyInput {
    lat: number;
    lng: number;
    /** Override radius (km). When omitted, falls back to redemption_radius_km. */
    radiusKm?: number;
    /** Hard cap on rows returned (default 50). */
    limit?: number;
}

interface VendorBaseRow {
    id: string;
    name: string;
    address: string | null;
    city: string | null;
    geo_lat: number | string | null;
    geo_lng: number | string | null;
}

interface VendorAvailabilityRow extends VendorBaseRow {
    is_open: boolean | null;
    stock_exhausted: boolean | null;
    temporary_closure_until: string | null;
}

/**
 * Find approved vendors within the radius of (lat,lng), nearest first.
 *
 * Radius resolution: explicit `radiusKm` wins; otherwise `redemption_radius_km`
 * from system_config; if THAT is unset we do not invent a radius — we return the
 * nearest `limit` vendors unfiltered (still distance-sorted). Availability
 * columns and the meal_windows table belong to later/sibling addon migrations,
 * so both reads degrade gracefully when absent.
 */
export async function findNearbyVendors(
    input: FindNearbyInput,
    admin: SupabaseClient
): Promise<NearbyVendor[]> {
    const limit = input.limit ?? 50;

    // Resolve the radius (no invented default when config is unset).
    let radiusKm: number | null = input.radiusKm ?? null;
    if (radiusKm == null) {
        try {
            radiusKm = await getNumber("redemption_radius_km", admin as never);
        } catch {
            radiusKm = null; // unset → no radius filter, just nearest-N
        }
    }

    // Select approved vendors WITH availability columns; fall back to the base
    // (always-present) columns if the addon #4 migration isn't applied yet.
    const SAFE_AVAIL =
        "id, name, address, city, geo_lat, geo_lng, is_open, stock_exhausted, temporary_closure_until";
    const SAFE_BASE = "id, name, address, city, geo_lat, geo_lng";

    let rows: VendorAvailabilityRow[] = [];
    const withAvail = await admin
        .from("vendors")
        .select(SAFE_AVAIL)
        .eq("status", "approved");

    if (withAvail.error) {
        const base = await admin.from("vendors").select(SAFE_BASE).eq("status", "approved");
        if (base.error) throw new Error(base.error.message);
        rows = ((base.data as VendorBaseRow[] | null) ?? []).map((v) => ({
            ...v,
            is_open: true,
            stock_exhausted: false,
            temporary_closure_until: null,
        }));
    } else {
        rows = (withAvail.data as VendorAvailabilityRow[] | null) ?? [];
    }

    // Operating hours from meal_windows (vendor-specific override global). Tolerate
    // the table being absent (sibling addon migration not applied).
    const hoursByVendor = new Map<string, VendorHours[]>();
    let globalHours: VendorHours[] = [];
    try {
        const { data: windows, error: winErr } = await admin
            .from("meal_windows")
            .select("vendor_id, meal_type, start_time, end_time, is_active")
            .eq("is_active", true);
        if (!winErr && windows) {
            for (const w of windows as {
                vendor_id: string | null;
                meal_type: string | null;
                start_time: string;
                end_time: string;
            }[]) {
                const entry: VendorHours = {
                    meal_type: w.meal_type ?? null,
                    start_time: w.start_time,
                    end_time: w.end_time,
                };
                if (w.vendor_id == null) {
                    globalHours.push(entry);
                } else {
                    const arr = hoursByVendor.get(w.vendor_id) ?? [];
                    arr.push(entry);
                    hoursByVendor.set(w.vendor_id, arr);
                }
            }
        }
    } catch {
        globalHours = [];
    }

    const num = (v: number | string | null): number | null =>
        v == null ? null : typeof v === "number" ? v : Number(v);

    const out: NearbyVendor[] = [];
    for (const v of rows) {
        const vLat = num(v.geo_lat);
        const vLng = num(v.geo_lng);
        if (vLat == null || vLng == null) continue; // can't place an outlet with no geo

        const distance = getGreatCircleDistanceKm(input.lat, input.lng, vLat, vLng);
        if (radiusKm != null && distance > radiusKm) continue;

        out.push({
            id: v.id,
            name: v.name,
            address: v.address,
            city: v.city,
            geo_lat: vLat,
            geo_lng: vLng,
            is_open: v.is_open ?? true,
            stock_exhausted: v.stock_exhausted ?? false,
            temporary_closure_until: v.temporary_closure_until ?? null,
            distance_km: Math.round(distance * 100) / 100,
            hours: hoursByVendor.get(v.id) ?? globalHours,
        });
    }

    out.sort((a, b) => a.distance_km - b.distance_km);
    return out.slice(0, limit);
}
