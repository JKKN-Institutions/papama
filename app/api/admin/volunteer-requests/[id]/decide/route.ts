import { z } from "zod";

import { BadRequestError, defineRoute, parseBody } from "@/lib/api/handler";
import { countHeldTokens } from "@/lib/volunteer/holdings";
import { createAdminClient } from "@/lib/supabase/admin";
import { getNumber } from "@/lib/system-config";

/**
 * POST /api/admin/volunteer-requests/[id]/decide — the admin grants, partially
 * grants, or denies a volunteer token request (token-flow Path-B allocation).
 *
 * Gated by `token_distribution/update` (scope all). The request must be pending.
 *
 * DENY  → status='denied', decided_by=admin, decided_count=0.
 * GRANT / PARTIALLY_GRANT → allocate `count` tokens (decided_count ?? the
 *   requested count for a full grant, or the explicit count for a partial):
 *     1. concurrent-limit check — read `max_tokens_per_volunteer`; if unset
 *        (NULL/missing) DON'T block; else the volunteer's current held count +
 *        count must not exceed it,
 *     2. pull `count` tokens from status='in_admin_pool' (oldest minted_at) — 400
 *        if the pool has fewer than `count`,
 *     3. move them to 'assigned_to_volunteer' guarding `.eq('status',
 *        'in_admin_pool')` so a race that already claimed any of them is rejected,
 *     4. append one 'volunteer_request_grant' distribution record per moved token
 *        (distributed_by = the volunteer's user_id, so the held-set derivation
 *        attributes the tokens to the volunteer), and
 *     5. update the request {status:decision, decided_by, decided_count:count}.
 *
 * All DB work runs on the service-role client after the matrix check.
 */
const decideSchema = z.object({
    decision: z.enum(["granted", "partially_granted", "denied"]),
    decided_count: z.number().int().positive().optional(),
});

export const POST = defineRoute<{ id: string }>(
    { feature: "token_distribution", action: "update" },
    async ({ req, user, params, audit }) => {
        const body = await parseBody(req, decideSchema);
        const requestId = params.id;

        const admin = createAdminClient();

        // Load the request; it must exist and be pending.
        const { data: requestRow, error: requestError } = await admin
            .from("volunteer_token_requests")
            .select("id, volunteer_id, requested_count, status")
            .eq("id", requestId)
            .maybeSingle();
        if (requestError) throw new Error(requestError.message);
        if (!requestRow) throw new BadRequestError("request not found");
        const request = requestRow as {
            id: string;
            volunteer_id: string;
            requested_count: number;
            status: string;
        };
        if (request.status !== "pending") {
            throw new BadRequestError("request has already been decided");
        }

        // DENY path — no token movement.
        if (body.decision === "denied") {
            const { error: denyError } = await admin
                .from("volunteer_token_requests")
                .update({
                    status: "denied",
                    decided_by: user.id,
                    decided_count: 0,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", requestId)
                .eq("status", "pending");
            if (denyError) throw new Error(denyError.message);

            await audit({
                action: "volunteer.allocate",
                entity_table: "volunteer_token_requests",
                entity_id: requestId,
                summary: `denied volunteer request ${requestId}`,
                metadata: { volunteer_id: request.volunteer_id, decision: "denied" },
            });

            return { request_id: requestId, granted_count: 0 };
        }

        // GRANT / PARTIALLY_GRANT — allocate the explicit decided_count when given,
        // else the full requested count.
        const count = body.decided_count ?? request.requested_count;

        // Resolve the volunteer's user_id (distribution records attribute to it).
        const { data: volunteerRow, error: volunteerError } = await admin
            .from("volunteers")
            .select("user_id")
            .eq("id", request.volunteer_id)
            .maybeSingle();
        if (volunteerError) throw new Error(volunteerError.message);
        const volunteerUserId = (volunteerRow as { user_id: string | null } | null)?.user_id ?? null;
        if (!volunteerUserId) {
            throw new BadRequestError("volunteer has no linked user account");
        }

        // Concurrent-limit check — only when max_tokens_per_volunteer is set.
        let limit: number | null = null;
        try {
            limit = await getNumber("max_tokens_per_volunteer", admin as never);
        } catch {
            // unset (NULL) or missing — do not block, do not invent a default.
            limit = null;
        }
        if (limit !== null) {
            const currentlyHeld = await countHeldTokens(admin, volunteerUserId);
            if (currentlyHeld + count > limit) {
                throw new BadRequestError(
                    `grant of ${count} would exceed max_tokens_per_volunteer (${limit}); volunteer already holds ${currentlyHeld}`
                );
            }
        }

        // Pull `count` tokens from the admin pool, oldest minted first.
        const { data: poolData, error: poolError } = await admin
            .from("tokens")
            .select("id")
            .eq("status", "in_admin_pool")
            .order("minted_at", { ascending: true })
            .limit(count);
        if (poolError) throw new Error(poolError.message);
        const poolTokens = (poolData ?? []) as { id: string }[];
        if (poolTokens.length < count) {
            throw new BadRequestError(
                `admin pool has only ${poolTokens.length} token(s); ${count} requested`
            );
        }

        const nowIso = new Date().toISOString();
        const movedIds: string[] = [];

        // Move each token to assigned_to_volunteer, guarding on still-pooled
        // status so a race that claimed it loses cleanly.
        for (const t of poolTokens) {
            const { data: moved, error: moveError } = await admin
                .from("tokens")
                .update({ status: "assigned_to_volunteer" })
                .eq("id", t.id)
                .eq("status", "in_admin_pool")
                .select("id");
            if (moveError) throw new Error(moveError.message);
            if (moved && moved.length > 0) movedIds.push(t.id);
        }

        if (movedIds.length < count) {
            throw new BadRequestError(
                "could not reserve enough tokens (a concurrent allocation claimed some)"
            );
        }

        // One grant record per moved token, attributed to the volunteer's user.
        const { error: recordError } = await admin
            .from("token_distribution_records")
            .insert(
                movedIds.map((tokenId) => ({
                    token_id: tokenId,
                    distributed_by: volunteerUserId,
                    channel: "volunteer_request_grant",
                    distributed_at: nowIso,
                }))
            );
        if (recordError) throw new Error(recordError.message);

        // Finalize the request.
        const { error: updateError } = await admin
            .from("volunteer_token_requests")
            .update({
                status: body.decision,
                decided_by: user.id,
                decided_count: count,
                updated_at: nowIso,
            })
            .eq("id", requestId)
            .eq("status", "pending");
        if (updateError) throw new Error(updateError.message);

        await audit({
            action: "volunteer.allocate",
            entity_table: "volunteer_token_requests",
            entity_id: requestId,
            summary: `${body.decision} volunteer request ${requestId}: ${count} tokens`,
            metadata: {
                volunteer_id: request.volunteer_id,
                volunteer_user_id: volunteerUserId,
                decision: body.decision,
                granted_count: count,
                token_ids: movedIds,
            },
        });

        return { request_id: requestId, granted_count: count };
    }
);
