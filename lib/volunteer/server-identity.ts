import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AppUser } from "@/lib/auth";

/**
 * Resolve the signed-in user's `volunteers.id` server-side (mirror of
 * resolveVendorId / resolveDonorId). A volunteer login is linked to its
 * profile via `volunteers.user_id = users.id`; we look that up rather than
 * trusting any client-sent volunteer id. Returns null when the account has no
 * volunteer profile.
 *
 * Pass the service-role (admin) client so the lookup is not constrained by RLS
 * (the route still gates on the permission matrix before calling this).
 */
export async function resolveVolunteerId(
    user: AppUser,
    admin: SupabaseClient
): Promise<string | null> {
    const { data } = await admin
        .from("volunteers")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

    return (data?.id as string | undefined) ?? null;
}
