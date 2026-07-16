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

export interface InstitutionAllocationReport {
    ngo_partner_id: string;
    /** sum(institution_token_allocations.token_count) where status = 'allocated'. */
    tokens_allocated: number;
    /** Of the tokens traced via token_distribution_records.ngo_partner_id: */
    tokens_redeemed: number;
    tokens_pending: number;
    tokens_expired: number;
    tokens_blocked: number;
    /** Meals served broken down by beneficiary category (addon #15). */
    meals_by_category: Record<string, number>;
}

const REDEEMED = "redeemed";
const EXPIRED = "expired";
const BLOCKED = "blocked";

/**
 * Per-institution bulk-allocation report (spec §3.1 F-12 [M1-11], addon #15).
 *
 * `tokens_allocated` reads the institution_token_allocations summary ledger
 * (header counts). `tokens_redeemed`/`pending`/`expired`/`blocked` are traced
 * precisely via `token_distribution_records.ngo_partner_id` (added addon #15)
 * joined to the current `tokens.status` — this is INDEPENDENT of
 * `meals_by_category`, which comes from `beneficiaries.institution_id` (a
 * beneficiary registered under this institution can be fed by a token NOT
 * drawn from this institution's bulk batch, so the two figures can
 * legitimately diverge; do not conflate them).
 */
export async function institutionAllocationReport(
    admin: Admin,
    ngoPartnerId: string
): Promise<InstitutionAllocationReport> {
    const { data: allocRows, error: allocError } = await admin
        .from("institution_token_allocations")
        .select("token_count")
        .eq("ngo_partner_id", ngoPartnerId)
        .eq("status", "allocated");
    if (allocError) throw new Error(allocError.message);
    const tokensAllocated = ((allocRows ?? []) as { token_count: number }[]).reduce(
        (sum, r) => sum + (Number(r.token_count) || 0),
        0
    );

    const { data: tdrRows, error: tdrError } = await admin
        .from("token_distribution_records")
        .select("token_id")
        .eq("ngo_partner_id", ngoPartnerId);
    if (tdrError) throw new Error(tdrError.message);
    const tokenIds = [
        ...new Set(((tdrRows ?? []) as { token_id: string }[]).map((r) => r.token_id)),
    ];

    let tokensRedeemed = 0;
    let tokensPending = 0;
    let tokensExpired = 0;
    let tokensBlocked = 0;

    if (tokenIds.length > 0) {
        const { data: tokenRows, error: tokenError } = await admin
            .from("tokens")
            .select("status")
            .in("id", tokenIds);
        if (tokenError) throw new Error(tokenError.message);
        for (const t of (tokenRows ?? []) as { status: string }[]) {
            if (t.status === REDEEMED) tokensRedeemed++;
            else if (t.status === EXPIRED) tokensExpired++;
            else if (t.status === BLOCKED) tokensBlocked++;
            else tokensPending++;
        }
    }

    // Meals served broken down by category — same join pattern as
    // institutionRedemptionReport, grouped by beneficiaries.category instead
    // of just counted.
    const { data: mealRows, error: mealError } = await admin
        .from("token_redemptions")
        .select("beneficiaries!inner(institution_id, category)")
        .eq("beneficiaries.institution_id", ngoPartnerId)
        .returns<{ beneficiaries: { category: string | null } }[]>();
    if (mealError) throw new Error(mealError.message);

    const mealsByCategory: Record<string, number> = {};
    for (const r of mealRows ?? []) {
        const category = r.beneficiaries?.category ?? "unknown";
        mealsByCategory[category] = (mealsByCategory[category] ?? 0) + 1;
    }

    return {
        ngo_partner_id: ngoPartnerId,
        tokens_allocated: tokensAllocated,
        tokens_redeemed: tokensRedeemed,
        tokens_pending: tokensPending,
        tokens_expired: tokensExpired,
        tokens_blocked: tokensBlocked,
        meals_by_category: mealsByCategory,
    };
}
