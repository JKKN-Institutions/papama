import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { BadRequestError } from "@/lib/api/handler";

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
 * The actual work runs inside the `allocate_pooled_tokens` Postgres function
 * (supabase/migrations/20260625000004_allocate_pooled_tokens_rpc.sql) so it is
 * ATOMIC: in one locked transaction it gates on the volunteer being `active`,
 * enforces the concurrent `max_tokens_per_volunteer` cap (counting only tokens
 * currently in `assigned_to_volunteer` whose latest distribution record is a
 * grant to that volunteer — same semantics as lib/volunteer/holdings.ts), pulls
 * `count` oldest-minted pool tokens, flips them to `assigned_to_volunteer`, and
 * writes one grant distribution record each. This removes the read-then-write
 * race the previous JS implementation had (two allocations could both pass the
 * limit check and overshoot the cap, with no DB backstop).
 *
 * A cheap app-layer status pre-check fails fast before the RPC; the RPC repeats
 * the check authoritatively under the row lock. The migration MUST be applied
 * before this works at runtime.
 *
 * The caller is responsible for the audit entry (and, for §3b, finalising the
 * request row). Throws BadRequestError on any limit/pool/status/race failure.
 */
export async function allocatePooledTokens(
    admin: SupabaseClient,
    volunteerId: string,
    count: number,
    channel: GrantChannel
): Promise<AllocationResult> {
    // Resolve the volunteer's user_id (the result attributes records to it) and
    // fail fast on a non-active volunteer. The RPC re-checks both under a lock.
    const { data: volunteerRow, error: volunteerError } = await admin
        .from("volunteers")
        .select("user_id, status")
        .eq("id", volunteerId)
        .maybeSingle();
    if (volunteerError) throw new Error(volunteerError.message);
    const volunteer = volunteerRow as { user_id: string | null; status: string } | null;
    if (!volunteer || !volunteer.user_id) {
        throw new BadRequestError("volunteer has no linked user account");
    }
    if (volunteer.status !== "active") {
        throw new BadRequestError(`cannot allocate to a ${volunteer.status} volunteer`);
    }
    const volunteerUserId = volunteer.user_id;

    // Atomic allocation: active-gate + concurrent-limit + pool pull + flip +
    // grant records, all in one locked transaction inside Postgres.
    const { data, error } = await admin.rpc("allocate_pooled_tokens", {
        p_volunteer_id: volunteerId,
        p_count: count,
        p_channel: channel,
    });
    if (error) {
        // The function raises plain exceptions for every business-rule failure
        // (inactive volunteer, over-limit, pool too small); surface them as 400s.
        throw new BadRequestError(error.message);
    }

    const movedIds = ((data ?? []) as { token_id: string }[]).map((r) => r.token_id);

    return { volunteerUserId, movedIds };
}
