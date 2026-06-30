import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Public transparency stats (addon #14). Reads the aggregate-only scalars from
 * the SECURITY DEFINER function public.public_transparency_stats() — no PII, no
 * row data. The function is grant-executable to anon/authenticated, so this works
 * with either the anon/server client or the service-role client; the public route
 * passes whichever it holds.
 */

export interface TransparencyStats {
    total_donations_inr: number;
    meals_sponsored: number;
    meals_served: number;
    active_vendors: number;
    active_beneficiaries: number;
    cities_covered: number;
}

const ZERO: TransparencyStats = {
    total_donations_inr: 0,
    meals_sponsored: 0,
    meals_served: 0,
    active_vendors: 0,
    active_beneficiaries: 0,
    cities_covered: 0,
};

export async function getTransparencyStats(client: SupabaseClient): Promise<TransparencyStats> {
    const { data, error } = await client.rpc("public_transparency_stats");
    if (error) throw new Error(error.message);

    // The function returns a single-row set; supabase-js gives an array.
    const row = (Array.isArray(data) ? data[0] : data) as
        | Record<keyof TransparencyStats, number | string | null>
        | null
        | undefined;
    if (!row) return ZERO;

    const num = (v: number | string | null | undefined): number => {
        const n = typeof v === "number" ? v : Number(v ?? 0);
        return Number.isFinite(n) ? n : 0;
    };

    return {
        total_donations_inr: num(row.total_donations_inr),
        meals_sponsored: num(row.meals_sponsored),
        meals_served: num(row.meals_served),
        active_vendors: num(row.active_vendors),
        active_beneficiaries: num(row.active_beneficiaries),
        cities_covered: num(row.cities_covered),
    };
}
