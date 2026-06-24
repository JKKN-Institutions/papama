import { defineRoute } from "@/lib/api/handler";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/vendor/profile — the signed-in vendor's own outlet record.
 *
 * Gated by `vendor_management/read` (scope own). Read through the session (RLS)
 * client so the `vendors_select_own` policy scopes the row to this owner; we
 * still filter by owner_id for clarity. Returns the public-facing fields only
 * (name, status, kyc, city, geo) — never the bank/KYC document columns.
 */
export const GET = defineRoute(
    { feature: "vendor_management", action: "read", scope: "own" },
    async ({ user }) => {
        const supabase = await createClient();

        const { data, error } = await supabase
            .from("vendors")
            .select("id, name, status, kyc_status, city, geo_lat, geo_lng, hygiene_rating, created_at")
            .eq("owner_id", user.id)
            .maybeSingle();

        if (error) throw new Error(error.message);

        if (!data) return { vendor: null };

        return {
            vendor: {
                vendor_id: data.id,
                name: data.name,
                status: data.status,
                kyc_status: data.kyc_status,
                city: data.city,
                geo:
                    data.geo_lat != null && data.geo_lng != null
                        ? { lat: Number(data.geo_lat), lng: Number(data.geo_lng) }
                        : null,
                hygiene_rating: data.hygiene_rating,
                created_at: data.created_at,
            },
        };
    }
);
