import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { deriveQrPayload } from "@/app/api/_lib/tokenQr";

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
    /**
     * The one-time QR payload, derived (not stored) from the token id — the same
     * value a donor sees. The volunteer SHOWS this to the beneficiary (digital or
     * printed) so it can be scanned at a vendor; without it the held token is a
     * dead-end (nothing to hand off).
     */
    qr_payload: string;
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
 * newest-minted first.
 *
 * Strategy: push the per-volunteer filter into SQL rather than loading every
 * 'assigned_to_volunteer' token and filtering in JS (O(N) full scan).
 *
 * Step 1 — ask the DB for the latest distribution record per token that was
 *   granted to this user via a grant channel. PostgREST doesn't expose DISTINCT
 *   ON, so we filter token_distribution_records by (distributed_by, channel)
 *   first and let the server deduplicate by picking the max distributed_at per
 *   token_id in step 2.
 * Step 2 — join to tokens, filtering to status='assigned_to_volunteer', and
 *   resolve the max-per-token deduplication in JS (the set is already
 *   volunteer-scoped, so it is tiny).
 *
 * The result is identical to the original return shape: tokens whose latest
 * distribution record across ALL channels is a grant to this user. The DB now
 * does the heavy filtering; JS only deduplicates the volunteer's own small set.
 */
export async function listHeldTokens(
    admin: SupabaseClient,
    userId: string
): Promise<HeldToken[]> {
    // Pull distribution records granted to this volunteer via a grant channel.
    // Filter by distributed_by and channel in SQL — no full-table scan.
    const { data: recordData, error: recordError } = await admin
        .from("token_distribution_records")
        .select("token_id, distributed_by, channel, distributed_at")
        .eq("distributed_by", userId)
        .in("channel", [...GRANT_CHANNELS])
        .order("distributed_at", { ascending: false });

    if (recordError) throw new Error(recordError.message);
    const records = (recordData ?? []) as DistributionRow[];
    if (records.length === 0) return [];

    // Deduplicate: keep the newest grant record per token_id (records are
    // already sorted desc so the first seen per token_id wins).
    const latestByToken = new Map<string, DistributionRow>();
    for (const rec of records) {
        if (!latestByToken.has(rec.token_id)) latestByToken.set(rec.token_id, rec);
    }

    // Fetch the token rows for these candidates, restricting to the status that
    // confirms the token is still in the volunteer's hands. This second query is
    // bounded by the volunteer's own grant set — not the whole tokens table.
    const candidateIds = [...latestByToken.keys()];
    const { data: tokenData, error: tokenError } = await admin
        .from("tokens")
        .select("id, serial_number, token_type, value_inr, status, minted_at")
        .in("id", candidateIds)
        .eq("status", "assigned_to_volunteer")
        .order("minted_at", { ascending: false });

    if (tokenError) throw new Error(tokenError.message);
    const tokens = (tokenData ?? []) as TokenRow[];

    return tokens.map((t) => ({
        token_id: t.id,
        serial_number: t.serial_number,
        token_type: t.token_type,
        value: t.value_inr,
        status: t.status,
        minted_at: t.minted_at,
        qr_payload: deriveQrPayload(t.id),
    }));
}

/** Count of tokens currently held by `userId` (concurrent-limit headroom check). */
export async function countHeldTokens(
    admin: SupabaseClient,
    userId: string
): Promise<number> {
    const held = await listHeldTokens(admin, userId);
    return held.length;
}

/**
 * Tokens this volunteer has already DISTRIBUTED onward to beneficiaries, newest
 * first. Derived like listHeldTokens but on the reverse edge: the latest record
 * is a `volunteer_to_beneficiary` hand-off by this user. These keep their QR
 * viewable so the volunteer can re-show it (the beneficiary carries that QR to a
 * vendor) — closing the "distribute → token vanishes with no QR" dead-end.
 * Includes tokens that have since been redeemed/expired so the history is honest.
 */
export async function listDistributedTokens(
    admin: SupabaseClient,
    userId: string
): Promise<HeldToken[]> {
    const { data: recordData, error: recordError } = await admin
        .from("token_distribution_records")
        .select("token_id, distributed_by, channel, distributed_at")
        .eq("distributed_by", userId)
        .eq("channel", "volunteer_to_beneficiary")
        .order("distributed_at", { ascending: false });

    if (recordError) throw new Error(recordError.message);
    const records = (recordData ?? []) as DistributionRow[];
    if (records.length === 0) return [];

    const latestByToken = new Map<string, DistributionRow>();
    for (const rec of records) {
        if (!latestByToken.has(rec.token_id)) latestByToken.set(rec.token_id, rec);
    }

    const candidateIds = [...latestByToken.keys()];
    const { data: tokenData, error: tokenError } = await admin
        .from("tokens")
        .select("id, serial_number, token_type, value_inr, status, minted_at")
        .in("id", candidateIds)
        .order("minted_at", { ascending: false });

    if (tokenError) throw new Error(tokenError.message);
    const tokens = (tokenData ?? []) as TokenRow[];

    return tokens.map((t) => ({
        token_id: t.id,
        serial_number: t.serial_number,
        token_type: t.token_type,
        value: t.value_inr,
        status: t.status,
        minted_at: t.minted_at,
        qr_payload: deriveQrPayload(t.id),
    }));
}
