import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The system "Guest Pool" donor — the destination for ANONYMOUS (no-account)
 * donations. The token model (token-flow.md) is donor-centric: credit accrues to
 * a donor, then Path B routes donor-authorised tokens through the admin pool. An
 * anonymous gift is conceptually "money pApAmA decides how to distribute" = Path
 * B, so we accumulate it on a single userless system donor and let an admin mint
 * its credit into `in_admin_pool` tokens (see app/api/admin/pool/mint).
 *
 * It is identified by a stable sentinel email and has NO auth user
 * (donors.user_id is nullable). Find-or-create — no migration/seed needed.
 *
 * NOTE: the full micro-donation POOL engine (auto value-completion of partial
 * gifts) is Phase-2 per PRD §4; this is only the Phase-1-safe accumulate + admin-
 * convert seam, reusing the existing credit→mint→pool machinery.
 */
export const GUEST_POOL_EMAIL = "guest-pool@papama.internal";
export const GUEST_POOL_NAME = "pApAmA Guest Pool";

/** Find (or lazily create) the system Guest Pool donor; returns its donors.id. */
export async function ensureGuestPoolDonor(admin: SupabaseClient): Promise<string> {
    const { data: existing, error } = await admin
        .from("donors")
        .select("id")
        .eq("email", GUEST_POOL_EMAIL)
        .maybeSingle();
    if (error) throw new Error(error.message);
    if (existing) return (existing as { id: string }).id;

    const { data: created, error: insertError } = await admin
        .from("donors")
        .insert({ name: GUEST_POOL_NAME, email: GUEST_POOL_EMAIL, user_id: null })
        .select("id")
        .single();
    if (insertError || !created) {
        // A concurrent guest donation may have created it first — re-read.
        const { data: race } = await admin
            .from("donors")
            .select("id")
            .eq("email", GUEST_POOL_EMAIL)
            .maybeSingle();
        if (race) return (race as { id: string }).id;
        throw new Error(insertError?.message ?? "failed to ensure guest pool donor");
    }
    return (created as { id: string }).id;
}

/** The Guest Pool's current accumulated (unconverted) credit balance in ₹. */
export async function getGuestPoolBalance(admin: SupabaseClient): Promise<{ donorId: string; balance: number }> {
    const donorId = await ensureGuestPoolDonor(admin);
    const { data } = await admin
        .from("donor_credits")
        .select("balance_inr")
        .eq("donor_id", donorId)
        .maybeSingle();
    return { donorId, balance: (data?.balance_inr as number) ?? 0 };
}
