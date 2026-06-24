import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Shared "tokens this volunteer currently HOLDS" computation, used by the
 * volunteer tokens listing, the distribute guard, and the admin concurrent-limit
 * check. The schema has no `held_by` column on tokens, so holding is derived:
 *
 *   a token is held by a volunteer-user when its status is
 *   'assigned_to_volunteer' AND its LATEST distribution record (by
 *   distributed_at) was a grant to that user — i.e. distributed_by = userId and
 *   channel in (admin_to_volunteer, volunteer_request_grant).
 *
 * Once the volunteer distributes the token onward, status flips to 'distributed'
 * and a 'volunteer_to_beneficiary' record is appended (newer distributed_at), so
 * the token drops out of the held set and frees concurrent-limit headroom.
 *
 * Pass the service-role (admin) client; we scope to the volunteer's user id
 * manually (the matrix check runs in the route before this is called).
 */

/** Grant channels that put a token into a volunteer's hands. */
export const GRANT_CHANNELS = ["admin_to_volunteer", "volunteer_request_grant"] as const;

export interface HeldToken {
    token_id: string;
    serial_number: string;
    token_type: string;
    value: number;
    status: string;
    minted_at: string;
}

interface TokenRow {
    id: string;
    serial_number: string;
    token_type: string;
    value_inr: number;
    status: string;
    minted_at: string;
}

interface DistributionRow {
    token_id: string;
    distributed_by: string | null;
    channel: string;
    distributed_at: string;
}

/**
 * Return the tokens currently held by `userId` (the volunteer's user id),
 * newest-minted first. Two passes on the admin client (no embeds): pull every
 * 'assigned_to_volunteer' token, then confirm each one's latest distribution
 * record is a grant to this user.
 */
export async function listHeldTokens(
    admin: SupabaseClient,
    userId: string
): Promise<HeldToken[]> {
    const { data: tokenData, error: tokenError } = await admin
        .from("tokens")
        .select("id, serial_number, token_type, value_inr, status, minted_at")
        .eq("status", "assigned_to_volunteer")
        .order("minted_at", { ascending: false });

    if (tokenError) throw new Error(tokenError.message);
    const tokens = (tokenData ?? []) as TokenRow[];
    if (tokens.length === 0) return [];

    // Pull the distribution records for exactly these tokens, then keep a token
    // only when its latest record is a grant to this user.
    const tokenIds = tokens.map((t) => t.id);
    const { data: recordData, error: recordError } = await admin
        .from("token_distribution_records")
        .select("token_id, distributed_by, channel, distributed_at")
        .in("token_id", tokenIds)
        .order("distributed_at", { ascending: false });

    if (recordError) throw new Error(recordError.message);
    const records = (recordData ?? []) as DistributionRow[];

    // First (newest) record seen per token wins, since records are sorted desc.
    const latestByToken = new Map<string, DistributionRow>();
    for (const rec of records) {
        if (!latestByToken.has(rec.token_id)) latestByToken.set(rec.token_id, rec);
    }

    const held: HeldToken[] = [];
    for (const t of tokens) {
        const latest = latestByToken.get(t.id);
        if (
            latest &&
            latest.distributed_by === userId &&
            (GRANT_CHANNELS as readonly string[]).includes(latest.channel)
        ) {
            held.push({
                token_id: t.id,
                serial_number: t.serial_number,
                token_type: t.token_type,
                value: t.value_inr,
                status: t.status,
                minted_at: t.minted_at,
            });
        }
    }
    return held;
}

/** Count of tokens currently held by `userId` (concurrent-limit headroom check). */
export async function countHeldTokens(
    admin: SupabaseClient,
    userId: string
): Promise<number> {
    const held = await listHeldTokens(admin, userId);
    return held.length;
}
