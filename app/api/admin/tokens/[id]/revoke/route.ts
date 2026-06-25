import { z } from "zod";

import { BadRequestError, defineRoute, parseBody } from "@/lib/api/handler";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/admin/tokens/[id]/revoke — reclaim a volunteer-held token back to the
 * admin pool (the reverse of token-flow §3a/§3b allocation).
 *
 * The lifecycle audit found that an `assigned_to_volunteer` token could only ever
 * leave a volunteer's hands by being distributed or by expiring — there was no
 * admin lever to reclaim a mis-allocated token, or one held by a volunteer who has
 * quit / been deactivated. Until then the token's value AND the volunteer's
 * `max_tokens_per_volunteer` headroom stayed frozen. This route adds that lever.
 *
 * Gated by `token_distribution/update` (admin, scope all) — same cell as the
 * §3a allocate and §3b decide routes, since this is their inverse.
 *
 * It:
 *   1. flips the token to `in_admin_pool`, GUARDED on the still-held
 *      status='assigned_to_volunteer' so only a currently-held token can be
 *      revoked and a concurrent double-revoke (or a race with the volunteer's own
 *      distribute) loses cleanly, and
 *   2. appends a distribution record on the NEW `admin_revoke` channel so the
 *      reclaim stays auditable. `admin_revoke` is deliberately NOT a grant channel
 *      (admin_to_volunteer | volunteer_request_grant), so the holdings derivation
 *      in lib/volunteer/holdings.ts never treats this record as a holding — and the
 *      status flip alone already drops the token out of listHeldTokens, freeing the
 *      volunteer's concurrent-limit headroom.
 *
 * Reallocation afterward is just the normal §3a/§3b flow against the pool.
 */
const revokeSchema = z.object({
    reason: z.string().min(1).optional(),
});

export const POST = defineRoute<{ id: string }>(
    { feature: "token_distribution", action: "update" },
    async ({ req, user, params, audit }) => {
        const body = await parseBody(req, revokeSchema);
        const tokenId = params.id;

        const admin = createAdminClient();

        // Confirm the token exists and read its current status (so we can give a
        // precise error rather than a bare "not revokable").
        const { data: tokenRow, error: tokenError } = await admin
            .from("tokens")
            .select("id, status")
            .eq("id", tokenId)
            .maybeSingle();
        if (tokenError) throw new Error(tokenError.message);
        if (!tokenRow) throw new BadRequestError("token not found");
        if ((tokenRow as { status: string }).status !== "assigned_to_volunteer") {
            throw new BadRequestError(
                `only a volunteer-held token can be revoked (token is '${(tokenRow as { status: string }).status}')`
            );
        }

        // 1. Return the token to the pool — guarded on the still-held status so a
        //    concurrent revoke / volunteer-distribute race resolves to one winner.
        const { data: moved, error: moveError } = await admin
            .from("tokens")
            .update({ status: "in_admin_pool" })
            .eq("id", tokenId)
            .eq("status", "assigned_to_volunteer")
            .select("id");
        if (moveError) throw new Error(moveError.message);
        if (!moved || moved.length === 0) {
            throw new BadRequestError(
                "token is no longer assigned to a volunteer (already revoked or distributed)"
            );
        }

        // 2. Record the reclaim on the admin_revoke channel (auditable hand-off).
        //    distributed_by = the acting admin; this is NOT a grant channel, so the
        //    holdings derivation will not count it.
        const { error: insertError } = await admin
            .from("token_distribution_records")
            .insert({
                token_id: tokenId,
                distributed_by: user.id,
                channel: "admin_revoke",
                notes: body.reason ?? null,
            });
        if (insertError) throw new Error(insertError.message);

        await audit({
            action: "admin.token_revoke",
            entity_table: "tokens",
            entity_id: tokenId,
            summary: `admin revoked token ${tokenId} from a volunteer back to the pool`,
            metadata: {
                channel: "admin_revoke",
                reason: body.reason ?? null,
            },
        });

        return { token_id: tokenId, status: "in_admin_pool" };
    }
);
