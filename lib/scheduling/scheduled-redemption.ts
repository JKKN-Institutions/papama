import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Scheduled-occasion service (DIST-6) — the read/write seam for the
 * `scheduled_redemption_dates` table (token-flow: a donor may schedule a token
 * to be redeemed on a future occasion, and gets a 7-day-out reminder).
 *
 * The table was previously dead schema. This module is the ONLY place app code
 * touches it, mirroring how lib/volunteer/* wraps the distribution tables.
 *
 * Columns (db-schema-snapshot.md):
 *   id, token_id, campaign_id, scheduled_for (date), location (text),
 *   status (text, default 'scheduled'), created_at.
 *
 * Status values used here:
 *   'scheduled' — set when a donor schedules / reschedules the occasion,
 *   'reminded'  — set by the T-7d reminder sweep once the notice goes out,
 *   'cancelled' — set when the donor clears the schedule.
 *
 * Pass the service-role (admin) client; the route runs the RBAC matrix check
 * first (token_distribution/update, scope own) and confirms token ownership.
 */

export interface ScheduledRedemption {
    id: string;
    token_id: string;
    scheduled_for: string; // ISO date (YYYY-MM-DD)
    location: string | null;
    status: string;
    created_at: string;
}

interface ScheduledRow {
    id: string;
    token_id: string;
    scheduled_for: string;
    location: string | null;
    status: string;
    created_at: string;
}

const SELECT_COLS = "id, token_id, scheduled_for, location, status, created_at";

/** Map a raw row to the public shape. */
function toScheduled(row: ScheduledRow): ScheduledRedemption {
    return {
        id: row.id,
        token_id: row.token_id,
        scheduled_for: row.scheduled_for,
        location: row.location ?? null,
        status: row.status,
        created_at: row.created_at,
    };
}

/**
 * Return the latest active (status='scheduled') schedule for a token, or null.
 * "Latest" by created_at so a reschedule supersedes an older row in the read.
 */
export async function getActiveSchedule(
    admin: SupabaseClient,
    tokenId: string
): Promise<ScheduledRedemption | null> {
    const { data, error } = await admin
        .from("scheduled_redemption_dates")
        .select(SELECT_COLS)
        .eq("token_id", tokenId)
        .eq("status", "scheduled")
        .order("created_at", { ascending: false })
        .limit(1);
    if (error) throw new Error(error.message);
    const row = (data ?? [])[0] as ScheduledRow | undefined;
    return row ? toScheduled(row) : null;
}

/**
 * Create or replace the schedule for a token. We cancel any existing
 * 'scheduled' rows for the token first (so a token has at most one active
 * schedule), then insert the new one. Two statements rather than an upsert
 * because the table has no unique key on token_id.
 */
export async function setSchedule(
    admin: SupabaseClient,
    tokenId: string,
    scheduledFor: string,
    location: string | null
): Promise<ScheduledRedemption> {
    // Supersede any prior active schedule for this token.
    const { error: cancelError } = await admin
        .from("scheduled_redemption_dates")
        .update({ status: "cancelled" })
        .eq("token_id", tokenId)
        .eq("status", "scheduled");
    if (cancelError) throw new Error(cancelError.message);

    const { data, error } = await admin
        .from("scheduled_redemption_dates")
        .insert({
            token_id: tokenId,
            scheduled_for: scheduledFor,
            location,
            status: "scheduled",
        })
        .select(SELECT_COLS)
        .single();
    if (error || !data) throw new Error(error?.message ?? "failed to schedule");
    return toScheduled(data as ScheduledRow);
}

/** Cancel any active schedule for a token (donor cleared the occasion). */
export async function cancelSchedule(
    admin: SupabaseClient,
    tokenId: string
): Promise<void> {
    const { error } = await admin
        .from("scheduled_redemption_dates")
        .update({ status: "cancelled" })
        .eq("token_id", tokenId)
        .eq("status", "scheduled");
    if (error) throw new Error(error.message);
}
