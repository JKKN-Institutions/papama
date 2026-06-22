import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AppUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { UserRole } from "@/lib/types/enums";

/**
 * Audit service — the single writer of the append-only `audit_logs` trail
 * (migration M08; contract §1/§2/§10). Every mutating admin action records one
 * row here. The route guard (lib/api/handler) binds the actor and calls this
 * after a successful mutation, so handlers never construct audit rows by hand.
 *
 * Why the service-role (admin) client:
 *   - `audit_logs` RLS only lets a user INSERT a row where `actor_id = auth.uid()`
 *     (the `audit_logs_insert_self` policy). System/service entries (actor=null)
 *     and the `actor_role` snapshot need to bypass that — the M08 migration says
 *     so explicitly. The append-only trigger still blocks UPDATE/DELETE even for
 *     service-role, so immutability is preserved.
 *   - Audit logging must not be silently dropped by RLS; using the privileged
 *     client guarantees the write is attempted exactly as asked.
 *
 * This module performs DB I/O but NEVER touches Developer-1 tables — it only
 * writes the net-new `audit_logs` table.
 */

type Client = SupabaseClient;

/** Actor of an audited action: the AppUser who acted, or null for system actions. */
export type AuditActor = AppUser | null;

/** One audit entry. `actor` is the only required link; everything else is the target. */
export interface AuditInput {
    /** Who performed the action (null = system / service / automated action). */
    actor: AuditActor;
    /** Dotted action verb, e.g. 'vendor.approve', 'beneficiary.reject', 'settlement.lock'. */
    action: string;
    /** Target entity kind — a table name, e.g. 'vendors', 'beneficiary_registrations'. */
    entity_table: string;
    /** Target row id (text: works for uuid or Dev-1 text keys). Null for bulk/none. */
    entity_id?: string | null;
    /** Human-readable one-line description of what happened. */
    summary?: string | null;
    /** Structured context / before-after diff. Defaults to {}. */
    metadata?: Record<string, unknown>;
}

/** The audit_logs row shape inserted (mirrors M08 columns). */
interface AuditRow {
    actor_id: string | null;
    actor_role: UserRole | null;
    action: string;
    entity_table: string;
    entity_id: string | null;
    summary: string | null;
    metadata: Record<string, unknown>;
}

/** Thrown when the audit row could not be persisted. Map to HTTP 500. */
export class AuditError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "AuditError";
    }
}

function toRow(entry: AuditInput): AuditRow {
    return {
        actor_id: entry.actor?.id ?? null,
        actor_role: entry.actor?.role ?? null, // role snapshot at action time
        action: entry.action,
        entity_table: entry.entity_table,
        entity_id: entry.entity_id ?? null,
        summary: entry.summary ?? null,
        metadata: entry.metadata ?? {},
    };
}

/**
 * Write a single audit_logs row. Throws AuditError on failure so the caller
 * (route guard) is aware the trail did not record — audit is not best-effort.
 *
 * @param client optional client override (tests); defaults to the service-role
 *               admin client, which is required to bypass the insert-self RLS.
 */
export async function writeAuditLog(entry: AuditInput, client?: Client): Promise<void> {
    const supabase = client ?? (createAdminClient() as unknown as Client);

    const { error } = await supabase.from("audit_logs").insert(toRow(entry));

    if (error) {
        throw new AuditError(
            `failed to write audit_logs row for action '${entry.action}': ${error.message}`
        );
    }
}

/**
 * Write several audit rows in one statement (e.g. a bulk approve). Same
 * throw-on-failure contract as writeAuditLog.
 */
export async function writeAuditLogs(entries: AuditInput[], client?: Client): Promise<void> {
    if (entries.length === 0) return;
    const supabase = client ?? (createAdminClient() as unknown as Client);

    const { error } = await supabase.from("audit_logs").insert(entries.map(toRow));

    if (error) {
        throw new AuditError(`failed to write ${entries.length} audit_logs rows: ${error.message}`);
    }
}
