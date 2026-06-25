import { z } from "zod";

import { BadRequestError, defineRoute, parseBody } from "@/lib/api/handler";
import { resolveVolunteerId } from "@/lib/volunteer/server-identity";
import { GRANT_CHANNELS } from "@/lib/volunteer/holdings";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/volunteer/tokens/[id]/distribute — the volunteer hands a held token
 * to a beneficiary (token-flow Path-B, final step).
 *
 * Gated by `token_distribution/create` (scope own). The volunteer identity is
 * resolved server-side. We verify the token is currently held by THIS volunteer
 * (status='assigned_to_volunteer' AND its latest grant record was distributed_by
 * = user.id on a grant channel), then:
 *   1. flip the token to 'distributed', distributed_at=now — guarded on the
 *      still-assigned status so a concurrent double-distribute can't fire twice
 *      (mirrors the redemption double-redeem guard), and
 *   2. append a 'volunteer_to_beneficiary' distribution record (newer
 *      distributed_at), which drops the token out of the held set and frees the
 *      volunteer's concurrent-limit headroom.
 */
// Note: face verification is performed at REDEMPTION (vendor scan), not at
// distribution (token-flow §4) — so this route deliberately collects no face hash.
const distributeSchema = z.object({
    distribution_location: z.string().min(1).optional(),
});

export const POST = defineRoute<{ id: string }>(
    { feature: "token_distribution", action: "create", scope: "own" },
    async ({ req, user, params, audit }) => {
        const body = await parseBody(req, distributeSchema);
        const tokenId = params.id;

        const admin = createAdminClient();
        const volunteerId = await resolveVolunteerId(user, admin);
        if (!volunteerId) {
            throw new BadRequestError("no volunteer profile for this account");
        }

        // Gate on the volunteer being ACTIVE — a suspended/inactive volunteer who
        // still holds tokens must not be able to hand them off (the layout blocks
        // the UI, but the API needs its own guard). Mirrors the request route and
        // the allocate_pooled_tokens RPC, which both require status='active'.
        const { data: volStatusRow, error: volStatusError } = await admin
            .from("volunteers")
            .select("status")
            .eq("id", volunteerId)
            .maybeSingle();
        if (volStatusError) throw new Error(volStatusError.message);
        const volStatus = (volStatusRow as { status: string } | null)?.status;
        if (volStatus !== "active") {
            throw new BadRequestError(
                "your volunteer account is not active — you can't distribute tokens"
            );
        }

        // Confirm the token exists and is still assigned to a volunteer.
        const { data: tokenRow, error: tokenError } = await admin
            .from("tokens")
            .select("id, status")
            .eq("id", tokenId)
            .maybeSingle();
        if (tokenError) throw new Error(tokenError.message);
        if (!tokenRow) throw new BadRequestError("token not found");
        if ((tokenRow as { status: string }).status !== "assigned_to_volunteer") {
            throw new BadRequestError("token is not available to distribute");
        }

        // Confirm THIS volunteer holds it: latest distribution record must be a
        // grant to this user.
        const { data: recordData, error: recordError } = await admin
            .from("token_distribution_records")
            .select("distributed_by, channel, distributed_at")
            .eq("token_id", tokenId)
            .order("distributed_at", { ascending: false })
            .limit(1);
        if (recordError) throw new Error(recordError.message);
        const latest = (recordData ?? [])[0] as
            | { distributed_by: string | null; channel: string }
            | undefined;
        if (
            !latest ||
            latest.distributed_by !== user.id ||
            !(GRANT_CHANNELS as readonly string[]).includes(latest.channel)
        ) {
            throw new BadRequestError("this token is not assigned to you");
        }

        const nowIso = new Date().toISOString();

        // 1. Move the token to distributed — guarded on the still-assigned status
        //    so a concurrent double-distribute loses the race cleanly.
        const { data: moved, error: moveError } = await admin
            .from("tokens")
            .update({ status: "distributed", distributed_at: nowIso })
            .eq("id", tokenId)
            .eq("status", "assigned_to_volunteer")
            .select("id");
        if (moveError) throw new Error(moveError.message);
        if (!moved || moved.length === 0) {
            throw new BadRequestError("token was already distributed");
        }

        // 2. Record the volunteer→beneficiary handoff.
        const { error: insertError } = await admin
            .from("token_distribution_records")
            .insert({
                token_id: tokenId,
                distributed_by: user.id,
                channel: "volunteer_to_beneficiary",
                distribution_location: body.distribution_location ?? null,
            });
        if (insertError) throw new Error(insertError.message);

        await audit({
            action: "volunteer.distribute",
            entity_table: "tokens",
            entity_id: tokenId,
            summary: `volunteer distributed token ${tokenId} to a beneficiary`,
            metadata: {
                volunteer_id: volunteerId,
                distribution_location: body.distribution_location ?? null,
            },
        });

        return { token_id: tokenId, status: "distributed" };
    }
);
