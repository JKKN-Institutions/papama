import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AppUser } from "@/lib/auth";

/**
 * Resolve the signed-in user's `donors.id` server-side. Prefers the `donor_id`
 * already on the AppUser (from public.users, set by the M19 provisioning
 * trigger); falls back to a lookup by `user_id` for accounts provisioned before
 * that link existed. Returns null when the account has no donor profile.
 *
 * Pass the service-role (admin) client so the lookup is not constrained by RLS.
 */
export async function resolveDonorId(
    user: AppUser,
    admin: SupabaseClient
): Promise<string | null> {
    if (user.donor_id) return user.donor_id;

    const { data } = await admin
        .from("donors")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

    return (data?.id as string | undefined) ?? null;
}
