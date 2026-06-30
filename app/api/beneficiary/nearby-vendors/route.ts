import { z } from "zod";

import { parseQuery, toErrorResponse } from "@/lib/api/handler";
import { createAdminClient } from "@/lib/supabase/admin";
import { findNearbyVendors } from "@/lib/services/vendorDiscovery";

/**
 * GET /api/beneficiary/nearby-vendors — PUBLIC nearby approved-vendor discovery
 * (addon #5).
 *
 * Beneficiaries are non-app users, so this is a public GET (no session). The
 * vendors RLS is deliberately NOT widened for anon — instead this route runs the
 * discovery on the SERVICE-ROLE client and returns a SAFE PROJECTION only (no
 * bank/GST/FSSAI/owner/contact). Radius defaults to system_config
 * redemption_radius_km; when that is unset we return the nearest vendors
 * unfiltered rather than inventing a radius.
 */
const querySchema = z.object({
    lat: z.coerce.number().min(-90).max(90),
    lng: z.coerce.number().min(-180).max(180),
    radius_km: z.coerce.number().positive().max(500).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
});

export async function GET(req: Request) {
    try {
        const url = new URL(req.url);
        const { lat, lng, radius_km, limit } = parseQuery(url.searchParams, querySchema);

        const admin = createAdminClient();
        const vendors = await findNearbyVendors({ lat, lng, radiusKm: radius_km, limit }, admin);

        return new Response(JSON.stringify({ vendors, total: vendors.length }), {
            status: 200,
            headers: { "content-type": "application/json" },
        });
    } catch (err) {
        return toErrorResponse(err);
    }
}
