import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { BadRequestError } from "@/lib/api/handler";
import type { AppUser } from "@/lib/auth";

/**
 * Institution service (addon #11) — partner-institution bulk allocation +
 * per-institution redemption reporting.
 *
 * The bulk draw runs inside the atomic Postgres function
 * `allocate_pooled_tokens_to_institution`
 * (supabase/migrations/20260630000007_institution.sql), modelled on
 * allocate_pooled_tokens. In one locked transaction it cap-checks against
 * system_config.institution_bulk_allocation_max (soft-skips when unset), pulls N
 * oldest pooled tokens, flips them to `distributed`, logs one distribution record
 * each, and writes the institution_token_allocations summary row. This module
 * calls that function on the service-role client (the route already ran the RBAC
 * matrix) and leaves the audit_logs write to the route.
 *
 * Net-new application code: writes only addon tables + the existing token spine
 * through the RPC.
 */

type Admin = SupabaseClient;

export interface InstitutionAllocationResult {
    /** The new institution_token_allocations row id. */
    allocationId: string;
    /** Tokens actually drawn from the pool toward the institution. */
    movedCount: number;
}

/**
 * Bulk-allocate `count` pooled tokens toward a partner institution. Atomic via
 * the RPC; throws BadRequestError on cap/pool/institution-status failures (the
 * function raises plain exceptions for every business-rule failure).
 *
 * The caller (admin route) is responsible for the audit_logs entry.
 */
export async function bulkAllocateToInstitution(
    admin: Admin,
    ngoPartnerId: string,
    count: number,
    actor: AppUser,
    notes?: string | null
): Promise<InstitutionAllocationResult> {
    if (!Number.isInteger(count) || count <= 0) {
        throw new BadRequestError("count must be a positive integer");
    }

    const { data, error } = await admin.rpc("allocate_pooled_tokens_to_institution", {
        p_ngo_partner_id: ngoPartnerId,
        p_count: count,
        p_allocated_by: actor.id,
        p_notes: notes ?? null,
    });
    if (error) throw new BadRequestError(error.message);

    const row = ((data ?? []) as { allocation_id: string; moved_count: number }[])[0];
    if (!row) throw new BadRequestError("allocation produced no result");

    return { allocationId: row.allocation_id, movedCount: row.moved_count };
}

export interface InstitutionRedemptionRange {
    /** Inclusive YYYY-MM-DD lower bound (optional). */
    start?: string | null;
    /** Inclusive YYYY-MM-DD upper bound (optional). */
    end?: string | null;
}

export interface InstitutionRedemptionReport {
    ngo_partner_id: string;
    period_start: string | null;
    period_end: string | null;
    /** Meals served = redemptions by beneficiaries linked to this institution. */
    meals_served: number;
    /** Sum of token_value_inr over those redemptions. */
    token_value_inr: number;
    /** Distinct beneficiaries of this institution who redeemed in the window. */
    beneficiaries: number;
}

/**
 * Count meals served per institution by joining token_redemptions to
 * beneficiaries on beneficiaries.institution_id (addon #11). A "meal" is one
 * redemption by a beneficiary belonging to the institution.
 */
export async function institutionRedemptionReport(
    admin: Admin,
    ngoPartnerId: string,
    range: InstitutionRedemptionRange,
    _actor: AppUser
): Promise<InstitutionRedemptionReport> {
    const startTs = range.start ? `${range.start}T00:00:00.000Z` : null;
    const endTs = range.end ? `${range.end}T23:59:59.999Z` : null;

    // Embed the beneficiary (inner join) and filter on its institution_id. The
    // token_redemptions.beneficiary_id → beneficiaries.id FK powers the embed.
    let q = admin
        .from("token_redemptions")
        .select("id, token_value_inr, redeemed_at, beneficiary_id, beneficiaries!inner(institution_id)")
        .eq("beneficiaries.institution_id", ngoPartnerId);
    if (startTs) q = q.gte("redeemed_at", startTs);
    if (endTs) q = q.lte("redeemed_at", endTs);

    const { data, error } = await q.returns<
        { id: string; token_value_inr: number | null; beneficiary_id: string | null }[]
    >();
    if (error) throw new Error(error.message);

    const rows = data ?? [];
    const beneficiarySet = new Set<string>();
    let tokenValue = 0;
    for (const r of rows) {
        if (r.beneficiary_id) beneficiarySet.add(r.beneficiary_id);
        tokenValue += Number(r.token_value_inr) || 0;
    }

    return {
        ngo_partner_id: ngoPartnerId,
        period_start: range.start ?? null,
        period_end: range.end ?? null,
        meals_served: rows.length,
        token_value_inr: tokenValue,
        beneficiaries: beneficiarySet.size,
    };
}
