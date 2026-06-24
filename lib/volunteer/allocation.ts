import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { BadRequestError } from "@/lib/api/handler";
import { countHeldTokens } from "@/lib/volunteer/holdings";
import { getNumber } from "@/lib/system-config";

/**
 * The two grant channels that put a pooled token into a volunteer's hands
 * (token-flow §3): admin-initiated assignment (§3a) and the request-grant path
 * (§3b). Both land the token in `assigned_to_volunteer`; they differ only in the
 * recorded channel. Kept in sync with GRANT_CHANNELS in lib/volunteer/holdings.
 */
export type GrantChannel = "admin_to_volunteer" | "volunteer_request_grant";

export interface AllocationResult {
    /** The volunteer's linked auth user id (distribution records attribute to it). */
    volunteerUserId: string;
    /** The ids of the tokens actually moved into the volunteer's hands. */
    movedIds: string[];
}

/**
 * Move `count` admin-pool tokens to a volunteer (token-flow §3). Shared by the
 * admin-initiated assignment route (§3a, `admin_to_volunteer`) and the
 * request-grant decide route (§3b, `volunteer_request_grant`).
 *
 * Steps, in order:
 *   1. resolve the volunteer's linked user_id (records attribute to it),
 *   2. enforce the concurrent `max_tokens_per_volunteer` limit — ONLY when the
 *      key is set; unset/missing does NOT block and never invents a default,
 *   3. pull `count` tokens from `in_admin_pool`, oldest-minted first (400 if the
 *      pool has fewer),
 *   4. move each to `assigned_to_volunteer` guarding on the still-pooled status
 *      so a concurrent allocation loses the race cleanly, and
 *   5. write one grant distribution record per moved token.
 *
 * The caller is responsible for the audit entry (and, for §3b, finalising the
 * request row). Throws BadRequestError on any limit/pool/race failure.
 */
export async function allocatePooledTokens(
    admin: SupabaseClient,
    volunteerId: string,
    count: number,
    channel: GrantChannel
): Promise<AllocationResult> {
    // 1. Resolve the volunteer's user_id.
    const { data: volunteerRow, error: volunteerError } = await admin
        .from("volunteers")
        .select("user_id")
        .eq("id", volunteerId)
        .maybeSingle();
    if (volunteerError) throw new Error(volunteerError.message);
    const volunteerUserId = (volunteerRow as { user_id: string | null } | null)?.user_id ?? null;
    if (!volunteerUserId) {
        throw new BadRequestError("volunteer has no linked user account");
    }

    // 2. Concurrent-limit check — only when max_tokens_per_volunteer is set.
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
                `allocation of ${count} would exceed max_tokens_per_volunteer (${limit}); volunteer already holds ${currentlyHeld}`
            );
        }
    }

    // 3. Pull `count` tokens from the admin pool, oldest minted first.
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

    // 4. Move each token, guarding on still-pooled status.
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

    // 5. One grant record per moved token, attributed to the volunteer's user.
    const { error: recordError } = await admin
        .from("token_distribution_records")
        .insert(
            movedIds.map((tokenId) => ({
                token_id: tokenId,
                distributed_by: volunteerUserId,
                channel,
                distributed_at: nowIso,
            }))
        );
    if (recordError) throw new Error(recordError.message);

    return { volunteerUserId, movedIds };
}
