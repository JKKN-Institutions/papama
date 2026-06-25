import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { deriveQrPayload } from "@/app/api/_lib/tokenQr";

/**
 * Shared "tokens this volunteer currently HOLDS" computation, used by the
 * volunteer tokens listing, the distribute guard, and the admin concurrent-limit
 * check. The schema has no `held_by` column on tokens, so holding is derived:
 *
 *   a token is held by a volunteer-user when its status is
 *   'assigned_to_volunteer' AND its TRUE LATEST distribution record (max
 *   distributed_at, across ALL channels) is a grant to that user — i.e.
 *   distributed_by = userId and channel in (admin_to_volunteer,
 *   volunteer_request_grant).
 *
 * The "true latest across all channels" part is essential: a token can be
 * granted to volunteer A, revoked to the pool (admin_revoke), then re-granted to
 * volunteer B. It is 'assigned_to_volunteer' again, but A's stale grant record
 * must NOT count it as A's — only the most-recent record (B's grant) wins. This
 * matches the allocate_pooled_tokens RPC LATERAL and the distribute route guard.
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
 * For a set of candidate token ids, return each token's TRUE latest distribution
 * record — the row with the max `distributed_at` across ALL channels, not just
 * grant channels. This is the authoritative "what most-recently happened to this
 * token", matching the allocate_pooled_tokens RPC's LATERAL and the distribute
 * route's latest-record check.
 *
 * We MUST consider every channel: a later `admin_revoke` (token reclaimed to the
 * pool) or a re-grant to a DIFFERENT volunteer supersedes an older grant record.
 * Classifying on a stale per-user grant record + status alone mis-attributes a
 * token that has since moved on — the revoke→re-grant phantom-token bug, which
 * also leaked another volunteer's live QR.
 */
async function latestRecordPerToken(
    admin: SupabaseClient,
    tokenIds: string[]
): Promise<Map<string, DistributionRow>> {
    if (tokenIds.length === 0) return new Map();

    const { data, error } = await admin
        .from("token_distribution_records")
        .select("token_id, distributed_by, channel, distributed_at")
        .in("token_id", tokenIds)
        .order("distributed_at", { ascending: false });
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as DistributionRow[];
    const latest = new Map<string, DistributionRow>();
    for (const rec of rows) {
        // Rows are newest-first, so the first seen per token_id is its latest.
        if (!latest.has(rec.token_id)) latest.set(rec.token_id, rec);
    }
    return latest;
}

/**
 * Return the tokens currently held by `userId` (the volunteer's user id),
 * newest-minted first.
 *
 * Strategy: push the per-volunteer filter into SQL rather than loading every
 * 'assigned_to_volunteer' token and filtering in JS (O(N) full scan).
 *
 * Step 1 — pull this user's grant records to build the small candidate set
 *   (tokens this user was EVER granted). Bounded by the volunteer's own grants.
 * Step 2 — fetch those candidate token rows restricted to
 *   status='assigned_to_volunteer'.
 * Step 3 — confirm each candidate's TRUE latest distribution record (max
 *   distributed_at across ALL channels) is a grant to THIS user. Status alone is
 *   not enough: a token revoked and re-granted to another volunteer is again
 *   'assigned_to_volunteer' yet this user's stale grant record must NOT count it
 *   as held. This mirrors the RPC LATERAL exactly.
 */
export async function listHeldTokens(
    admin: SupabaseClient,
    userId: string
): Promise<HeldToken[]> {
    // Candidate set: tokens this volunteer was ever granted (any grant channel).
    // Filter by distributed_by + channel in SQL — no full-table scan.
    const { data: recordData, error: recordError } = await admin
        .from("token_distribution_records")
        .select("token_id, distributed_by, channel, distributed_at")
        .eq("distributed_by", userId)
        .in("channel", [...GRANT_CHANNELS]);

    if (recordError) throw new Error(recordError.message);
    const records = (recordData ?? []) as DistributionRow[];
    if (records.length === 0) return [];

    const candidateIds = [...new Set(records.map((r) => r.token_id))];

    // Fetch the candidate token rows still in the assigned state. This query is
    // bounded by the volunteer's own grant set — not the whole tokens table.
    const { data: tokenData, error: tokenError } = await admin
        .from("tokens")
        .select("id, serial_number, token_type, value_inr, status, minted_at")
        .in("id", candidateIds)
        .eq("status", "assigned_to_volunteer")
        .order("minted_at", { ascending: false });

    if (tokenError) throw new Error(tokenError.message);
    const tokens = (tokenData ?? []) as TokenRow[];
    if (tokens.length === 0) return [];

    // Authoritative classification: keep only tokens whose TRUE latest record
    // (across all channels) is a grant to THIS user — drops tokens revoked or
    // re-granted to someone else even though their status is still assigned.
    const latest = await latestRecordPerToken(
        admin,
        tokens.map((t) => t.id)
    );

    return tokens
        .filter((t) => {
            const rec = latest.get(t.id);
            return (
                rec != null &&
                rec.distributed_by === userId &&
                (GRANT_CHANNELS as readonly string[]).includes(rec.channel)
            );
        })
        .map((t) => ({
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
    // Candidate set: tokens this volunteer ever handed off to a beneficiary.
    const { data: recordData, error: recordError } = await admin
        .from("token_distribution_records")
        .select("token_id, distributed_by, channel, distributed_at")
        .eq("distributed_by", userId)
        .eq("channel", "volunteer_to_beneficiary");

    if (recordError) throw new Error(recordError.message);
    const records = (recordData ?? []) as DistributionRow[];
    if (records.length === 0) return [];

    const candidateIds = [...new Set(records.map((r) => r.token_id))];
    const { data: tokenData, error: tokenError } = await admin
        .from("tokens")
        .select("id, serial_number, token_type, value_inr, status, minted_at")
        .in("id", candidateIds)
        .order("minted_at", { ascending: false });

    if (tokenError) throw new Error(tokenError.message);
    const tokens = (tokenData ?? []) as TokenRow[];
    if (tokens.length === 0) return [];

    // True-latest classification (symmetry with listHeldTokens): show only
    // tokens whose most-recent record across all channels is THIS user's
    // volunteer→beneficiary hand-off, so a token later revoked/re-granted away
    // doesn't linger here.
    const latest = await latestRecordPerToken(
        admin,
        tokens.map((t) => t.id)
    );

    return tokens
        .filter((t) => {
            const rec = latest.get(t.id);
            return (
                rec != null &&
                rec.distributed_by === userId &&
                rec.channel === "volunteer_to_beneficiary"
            );
        })
        .map((t) => ({
        token_id: t.id,
        serial_number: t.serial_number,
        token_type: t.token_type,
        value: t.value_inr,
        status: t.status,
        minted_at: t.minted_at,
        qr_payload: deriveQrPayload(t.id),
    }));
}
