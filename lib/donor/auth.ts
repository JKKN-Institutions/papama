import { createClient } from "@/lib/supabase/client";

/**
 * Donor auth/identity (browser).
 *
 * Replaces the legacy hardcoded `donor_001`. The current donor is derived from
 * the Supabase Auth session: auth user -> public.donors row (linked by user_id,
 * provisioned by the M19 trigger). Cached per page load to avoid refetching.
 */

let cachedDonorId: string | null | undefined;

/** The signed-in donor's donors.id, or null if not signed in / no donor row. */
export async function getCurrentDonorId(): Promise<string | null> {
    if (cachedDonorId !== undefined) return cachedDonorId;

    const supabase = createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        cachedDonorId = null;
        return null;
    }

    const { data } = await supabase
        .from("donors")
        .select("id")
        .eq("user_id", user.id)
        .single();

    cachedDonorId = (data?.id as string | undefined) ?? null;
    return cachedDonorId ?? null;
}

/** True when a donor is signed in. */
export async function isDonorSignedIn(): Promise<boolean> {
    return (await getCurrentDonorId()) !== null;
}

/** Sign the donor out and clear the cached identity. */
export async function signOutDonor(): Promise<void> {
    const supabase = createClient();
    await supabase.auth.signOut();
    cachedDonorId = undefined;
}

/** Clear the identity cache (call after sign-in so the new donor resolves). */
export function clearDonorCache(): void {
    cachedDonorId = undefined;
}
