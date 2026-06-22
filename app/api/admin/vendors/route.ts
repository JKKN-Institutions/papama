import { defineRoute } from "@/lib/api/handler";
import { createClient } from "@/lib/supabase/server";
import type { VendorResponse } from "@/lib/validation/schemas";

/**
 * GET /api/admin/vendors — list vendors for the admin console (contract §4).
 *
 * Thin read: the guard authenticates + checks `vendor_management/read` (admin,
 * compliance, vendor_manager, volunteer per the matrix); RLS applies again on
 * the session client as defense-in-depth. Maps the live `vendors` columns to the
 * VendorResponse contract shape (geo composed from geo_lat/geo_lng). Never null
 * body — returns an empty list on no rows.
 */
export const GET = defineRoute({ feature: "vendor_management", action: "read" }, async () => {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from("vendors")
        .select(
            "id, name, status, kyc_status, fssai_license, gst_number, geo_lat, geo_lng, hygiene_rating, created_at"
        )
        .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    const vendors: VendorResponse[] = (data ?? []).map((v) => ({
        vendor_id: v.id,
        name: v.name,
        status: v.status,
        kyc_status: v.kyc_status,
        fssai_license: v.fssai_license,
        gst_number: v.gst_number,
        geo:
            v.geo_lat != null && v.geo_lng != null
                ? { lat: Number(v.geo_lat), lng: Number(v.geo_lng) }
                : null,
        hygiene_rating: v.hygiene_rating,
        created_at: v.created_at,
    }));

    return { vendors, total: vendors.length };
});
