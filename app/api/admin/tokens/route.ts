import { defineRoute } from "@/lib/api/handler";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/admin/tokens — token registry for the admin console (token-flow §6/§7).
 *
 * Gated by `token_generation/read` (admin, compliance, vendor_manager, volunteer
 * per the matrix; RLS scopes non-admins). Returns the lifecycle view — status
 * (which encodes the holder: live=donor, in_admin_pool=pool, assigned_to_volunteer,
 * distributed, redeemed, expired), type, value and key timestamps. Newest mint first.
 * Capped to the most recent 500 to keep the payload bounded.
 */
export const GET = defineRoute({ feature: "token_generation", action: "read" }, async () => {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from("tokens")
        .select("id, status, token_type, value_inr, donor_id, beneficiary_id, minted_at, expires_at, redeemed_at")
        .order("minted_at", { ascending: false })
        .limit(500);

    if (error) throw new Error(error.message);

    const tokens = (data ?? []).map((t) => ({
        id: t.id,
        status: t.status,
        token_type: t.token_type,
        value_inr: t.value_inr,
        has_donor: t.donor_id != null,
        has_beneficiary: t.beneficiary_id != null,
        minted_at: t.minted_at,
        expires_at: t.expires_at,
        redeemed_at: t.redeemed_at,
    }));

    return { tokens, total: tokens.length };
});
