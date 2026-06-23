import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AppUser } from "@/lib/auth";

/**
 * Resolve the signed-in user's `vendors.id` server-side (mirror of
 * resolveDonorId). A vendor login is linked to its outlet via
 * `vendors.owner_id = users.id`; we look that up rather than trusting any
 * client-sent vendor id. Returns null when the account has no vendor profile.
 *
 * Pass the service-role (admin) client so the lookup is not constrained by RLS
 * (the route still gates on the permission matrix before calling this).
 */
export async function resolveVendorId(
    user: AppUser,
    admin: SupabaseClient
): Promise<string | null> {
    const { data } = await admin
        .from("vendors")
        .select("id")
        .eq("owner_id", user.id)
        .maybeSingle();

    return (data?.id as string | undefined) ?? null;
}
