import { z } from "zod";

import { BadRequestError, defineRoute, parseBody } from "@/lib/api/handler";
import { createClient } from "@/lib/supabase/server";

/**
 * GET + PATCH /api/vendor/profile — the signed-in vendor reads/edits their own
 * outlet record.
 *
 * GET is gated by `vendor_management/read` (own), PATCH by `.../update` (own).
 * Both run on the session (RLS) client so the `vendors_select_own` /
 * `vendors_update_own` policies scope to this owner AND the DB
 * `guard_vendor_controlled_cols` trigger fires — a vendor cannot move
 * status/kyc_status/hygiene_rating/owner_id even if they smuggle the column in.
 * The PATCH schema only admits the editable business fields, so those columns
 * never reach the update in the first place.
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

/** Editable vendor business fields only — never status/kyc/hygiene/owner. */
const vendorProfilePatchSchema = z
    .object({
        name: z.string().trim().min(1).optional(),
        legal_name: z.string().trim().nullable().optional(),
        address: z.string().trim().nullable().optional(),
        city: z.string().trim().nullable().optional(),
        pincode: z.string().trim().nullable().optional(),
        phone: z.string().trim().nullable().optional(),
        email: z.string().trim().email().nullable().optional(),
        emergency_contact: z.string().trim().nullable().optional(),
        fssai_license: z.string().trim().nullable().optional(),
        gst_number: z.string().trim().nullable().optional(),
        bank_account_name: z.string().trim().nullable().optional(),
        bank_account_number: z.string().trim().nullable().optional(),
        bank_ifsc: z.string().trim().nullable().optional(),
        geo_lat: z.number().nullable().optional(),
        geo_lng: z.number().nullable().optional(),
    })
    .strict();

export const PATCH = defineRoute(
    { feature: "vendor_management", action: "update", scope: "own" },
    async ({ req, user, audit }) => {
        const body = await parseBody(req, vendorProfilePatchSchema);

        // Build the update from only the keys the caller actually sent.
        const update: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(body)) {
            if (value !== undefined) update[key] = value;
        }
        if (Object.keys(update).length === 0) {
            throw new BadRequestError("no editable fields supplied");
        }
        update.updated_at = new Date().toISOString();

        // Session client → vendors_update_own + guard_vendor_controlled_cols apply.
        const supabase = await createClient();
        const { data, error } = await supabase
            .from("vendors")
            .update(update)
            .eq("owner_id", user.id)
            .select(
                "id, name, legal_name, address, city, pincode, phone, email, emergency_contact, fssai_license, gst_number, bank_account_name, bank_account_number, bank_ifsc, geo_lat, geo_lng, status, kyc_status, hygiene_rating, created_at"
            )
            .maybeSingle();

        if (error) throw new Error(error.message);
        if (!data) throw new BadRequestError("no vendor profile for this account");

        await audit({
            action: "vendor.profile.update",
            entity_table: "vendors",
            entity_id: data.id as string,
            summary: "vendor updated their outlet profile",
            metadata: { fields: Object.keys(update).filter((k) => k !== "updated_at") },
        });

        return { vendor: data };
    }
);
