import { defineRoute } from "@/lib/api/handler";
import { createClient } from "@/lib/supabase/server";
import type { NgoPartnerResponse } from "@/lib/validation/schemas";

/**
 * GET /api/admin/ngo-partners — partner NGO registry (M13, spec §5).
 *
 * Gated by `audit_reports/read` (admin + compliance) — admin manages, compliance
 * has read oversight (matrix §6 "Audit & Reports" altitude). `status` is
 * text+CHECK (active|inactive|suspended); the ngo_status enum is a later slice.
 */
export const GET = defineRoute({ feature: "audit_reports", action: "read" }, async () => {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from("ngo_partners")
        .select(
            "id, name, registration_number, focus_area, contact_person, contact_email, contact_phone, address, city, contact_user_id, status, notes, created_at, updated_at"
        )
        .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    const ngo_partners: NgoPartnerResponse[] = (data ?? []).map((n) => ({
        id: n.id,
        name: n.name,
        registration_number: n.registration_number,
        focus_area: n.focus_area,
        contact_person: n.contact_person,
        contact_email: n.contact_email,
        contact_phone: n.contact_phone,
        address: n.address,
        city: n.city,
        contact_user_id: n.contact_user_id,
        status: n.status,
        notes: n.notes,
        created_at: n.created_at,
        updated_at: n.updated_at,
    }));

    return { ngo_partners, total: ngo_partners.length };
});
