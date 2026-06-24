import { z } from "zod";

import { BadRequestError, defineRoute, parseBody } from "@/lib/api/handler";
import { allocatePooledTokens } from "@/lib/volunteer/allocation";
import { createAdminClient } from "@/lib/supabase/admin";

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

        // GRANT / PARTIALLY_GRANT — resolve the count, bounded by the request so a
        // "granted" can never allocate MORE than was requested:
        //   granted           → exactly requested_count (a full grant),
        //   partially_granted  → an explicit decided_count in 1..requested_count-1.
        let count: number;
        if (body.decision === "granted") {
            if (body.decided_count !== undefined && body.decided_count !== request.requested_count) {
                throw new BadRequestError(
                    "a full grant allocates exactly the requested count — use partially_granted for fewer"
                );
            }
            count = request.requested_count;
        } else {
            if (body.decided_count === undefined) {
                throw new BadRequestError("partially_granted requires decided_count");
            }
            if (body.decided_count < 1 || body.decided_count >= request.requested_count) {
                throw new BadRequestError(
                    `decided_count must be between 1 and ${request.requested_count - 1} for a partial grant`
                );
            }
            count = body.decided_count;
        }

        // The shared helper does the pool-pull + concurrent-limit check +
        // 'assigned_to_volunteer' move + grant records (same engine as the §3a
        // admin-initiated route, channel differs).

        const { volunteerUserId, movedIds } = await allocatePooledTokens(
            admin,
            request.volunteer_id,
            count,
            "volunteer_request_grant"
        );

        // Finalize the request.
        const { error: updateError } = await admin
            .from("volunteer_token_requests")
            .update({
                status: body.decision,
                decided_by: user.id,
                decided_count: count,
                updated_at: new Date().toISOString(),
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
