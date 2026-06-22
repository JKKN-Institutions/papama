import { defineRoute } from "@/lib/api/handler";
import { createClient } from "@/lib/supabase/server";
import type { VolunteerResponse } from "@/lib/validation/schemas";

/**
 * GET /api/admin/volunteers — volunteer registry (M09, token-flow §3).
 *
 * Gated by `token_distribution/read` (admin, compliance, vendor_manager;
 * volunteer own). `status` is text+CHECK in the DB (active|inactive|suspended);
 * the dedicated enum is a later slice. Newest first.
 */
export const GET = defineRoute({ feature: "token_distribution", action: "read" }, async () => {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from("volunteers")
        .select("id, user_id, full_name, phone, email, status, created_at, updated_at")
        .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    const volunteers: VolunteerResponse[] = (data ?? []).map((v) => ({
        id: v.id,
        user_id: v.user_id,
        full_name: v.full_name,
        phone: v.phone,
        email: v.email,
        status: v.status,
        created_at: v.created_at,
        updated_at: v.updated_at,
    }));

    return { volunteers, total: volunteers.length };
});
