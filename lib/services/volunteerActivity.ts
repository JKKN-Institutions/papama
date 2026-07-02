import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { VolunteerActivityType } from "@/lib/types/enums";

/**
 * Volunteer field-activity log (addon #13). Records discrete on-ground actions a
 * volunteer takes — distributing a token, assisting a registration — into the
 * append-only volunteer_activity_log, and rolls them up into per-volunteer
 * counts for the admin activity console.
 *
 * Writes go through the service-role client (the calling route has already
 * passed the permission matrix), which bypasses the table's RLS.
 */

export interface VolunteerActivitySummary {
    volunteer_id: string;
    tokens_distributed: number;
    registrations_assisted: number;
    total: number;
    /** Distinct calendar days on which this volunteer logged any activity (addon2 A4). */
    active_days: number;
    /** ISO timestamp of the most recent activity, or null if none. */
    last_active_at: string | null;
}

/**
 * Append one activity row. Best-effort by contract at the call site: callers that
 * log as a side-effect of a primary action (e.g. token distribution) should not
 * let a logging failure roll back the action — wrap accordingly. Throws on DB
 * error so a caller that DOES care can react.
 */
export async function logActivity(
    volunteerId: string,
    type: VolunteerActivityType,
    refId: string | null,
    admin: SupabaseClient
): Promise<void> {
    const { error } = await admin.from("volunteer_activity_log").insert({
        volunteer_id: volunteerId,
        activity_type: type,
        ref_id: refId,
    });
    if (error) throw new Error(error.message);
}

/**
 * Count a volunteer's logged activity by type. Tokens-distributed is ALSO
 * derivable from token_distribution_records.distributed_by, but the activity log
 * is the single, type-tagged source the console reads so both activity kinds
 * (including registration-assist, which has no distribution record) are counted
 * uniformly.
 */
export async function volunteerActivitySummary(
    volunteerId: string,
    admin: SupabaseClient
): Promise<VolunteerActivitySummary> {
    const { data, error } = await admin
        .from("volunteer_activity_log")
        .select("activity_type, created_at")
        .eq("volunteer_id", volunteerId);
    if (error) throw new Error(error.message);

    return summarise(volunteerId, (data ?? []) as ActivityRow[]);
}

/** Build summaries for many volunteers in one query (powers the console list). */
export async function volunteerActivitySummaries(
    volunteerIds: string[],
    admin: SupabaseClient
): Promise<Map<string, VolunteerActivitySummary>> {
    const out = new Map<string, VolunteerActivitySummary>();
    for (const id of volunteerIds) out.set(id, summarise(id, []));
    if (volunteerIds.length === 0) return out;

    const { data, error } = await admin
        .from("volunteer_activity_log")
        .select("volunteer_id, activity_type, created_at")
        .in("volunteer_id", volunteerIds);
    if (error) throw new Error(error.message);

    const byVolunteer = new Map<string, ActivityRow[]>();
    for (const row of (data ?? []) as { volunteer_id: string; activity_type: string; created_at: string }[]) {
        const list = byVolunteer.get(row.volunteer_id) ?? [];
        list.push({ activity_type: row.activity_type, created_at: row.created_at });
        byVolunteer.set(row.volunteer_id, list);
    }
    for (const id of volunteerIds) {
        out.set(id, summarise(id, byVolunteer.get(id) ?? []));
    }
    return out;
}

interface ActivityRow {
    activity_type: string;
    created_at: string;
}

function summarise(volunteerId: string, rows: ActivityRow[]): VolunteerActivitySummary {
    let tokens = 0;
    let regs = 0;
    const days = new Set<string>();
    let lastActive: string | null = null;
    for (const r of rows) {
        if (r.activity_type === "token_distributed") tokens++;
        else if (r.activity_type === "registration_assisted") regs++;
        if (r.created_at) {
            days.add(r.created_at.substring(0, 10)); // YYYY-MM-DD
            if (!lastActive || r.created_at > lastActive) lastActive = r.created_at;
        }
    }
    return {
        volunteer_id: volunteerId,
        tokens_distributed: tokens,
        registrations_assisted: regs,
        total: rows.length,
        active_days: days.size,
        last_active_at: lastActive,
    };
}
