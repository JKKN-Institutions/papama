import "server-only";

import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { deriveQrPayload, qrHashOf } from "@/app/api/_lib/tokenQr";
import { BadRequestError, NotFoundError } from "@/lib/api/handler";
import type { AppUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/services/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBoolean, getNumber } from "@/lib/system-config";

/**
 * Lost-token + revalidation service (spec §3.2 Token rules [M2-5] — moved from
 * Phase 2 into Phase 1). Mirrors the mint/rollback discipline of
 * lib/services/emergency.ts::issueEmergencyToken.
 */

type Client = SupabaseClient;

const REDEEMABLE_STATUSES = ["live", "distributed"];

interface TokenRow {
    id: string;
    status: string;
    serial_number: string;
    value_inr: number;
    token_type: string;
    donor_id: string | null;
    beneficiary_id: string | null;
    campaign_id: string | null;
    is_emergency: boolean;
    expires_at: string | null;
}

const TOKEN_SELECT =
    "id, status, serial_number, value_inr, token_type, donor_id, beneficiary_id, campaign_id, is_emergency, expires_at";

// ---------------------------------------------------------------------------
// #17 — Lost-token workflow
// ---------------------------------------------------------------------------

export interface ReportTokenLostInput {
    tokenId: string;
    reason?: string | null;
    /** Ownership check for the donor self-service route — admin callers omit it. */
    expectedDonorId?: string | null;
}

export interface ReportTokenLostResult {
    old_token_id: string;
    new_token_id: string;
    new_serial: string;
    value_inr: number;
}

/**
 * Report a token lost: block it instantly (status -> 'blocked'), then mint a
 * same-value replacement referencing `replacement_for_token_id`. Only a
 * `live`/`distributed` token can be reported lost. Rolls back the block if
 * minting the replacement fails, so a lost-token report never strands a token
 * in limbo without a replacement.
 */
export async function reportTokenLost(
    input: ReportTokenLostInput,
    actor: AppUser,
    client?: Client
): Promise<ReportTokenLostResult> {
    const admin = client ?? (createAdminClient() as unknown as Client);

    const { data: tokenRow, error: fetchError } = await admin
        .from("tokens")
        .select(TOKEN_SELECT)
        .eq("id", input.tokenId)
        .maybeSingle();
    if (fetchError) throw new Error(fetchError.message);
    if (!tokenRow) throw new NotFoundError("token not found");
    const token = tokenRow as TokenRow;

    // Ownership check (donor self-service route) — a mismatch reads as "not
    // found" rather than 403 so a donor can't probe another donor's token ids.
    if (input.expectedDonorId && token.donor_id !== input.expectedDonorId) {
        throw new NotFoundError("token not found");
    }

    if (!REDEEMABLE_STATUSES.includes(token.status)) {
        throw new BadRequestError(
            `only a live/distributed token can be reported lost (status is '${token.status}')`
        );
    }

    // 1. Block the old token — CAS on its still-current status so a concurrent
    //    redemption/report-loss race resolves to one winner.
    const nowIso = new Date().toISOString();
    const { data: blocked, error: blockError } = await admin
        .from("tokens")
        .update({ status: "blocked", cancelled_at: nowIso })
        .eq("id", token.id)
        .eq("status", token.status)
        .select("id");
    if (blockError) throw new Error(blockError.message);
    if (!blocked || blocked.length === 0) {
        throw new BadRequestError("token status changed concurrently — retry");
    }

    // 2. Mint the replacement — same value/type/holder/expiry, a continuation
    //    of the original grant, not a new one.
    const newId = randomUUID();
    const { data: minted, error: mintError } = await admin
        .from("tokens")
        .insert({
            id: newId,
            serial_number: `PPM-RPL-${Date.now().toString(36).toUpperCase()}`,
            qr_hash: qrHashOf(deriveQrPayload(newId)),
            token_type: token.token_type,
            value_inr: token.value_inr,
            status: token.status,
            donor_id: token.donor_id,
            beneficiary_id: token.beneficiary_id,
            campaign_id: token.campaign_id,
            is_emergency: token.is_emergency,
            expires_at: token.expires_at,
            replacement_for_token_id: token.id,
        })
        .select("id, serial_number")
        .single();
    if (mintError || !minted) {
        // Compensate: un-block the old token so a failed replacement never
        // strands it in 'blocked' with nothing to redeem.
        await admin
            .from("tokens")
            .update({ status: token.status, cancelled_at: null })
            .eq("id", token.id);
        throw new Error(mintError?.message ?? "failed to mint replacement token");
    }

    await writeAuditLog(
        {
            actor,
            action: "token.report_lost",
            entity_table: "tokens",
            entity_id: token.id,
            summary: `token ${token.serial_number} reported lost; blocked and replaced by ${minted.serial_number}`,
            metadata: {
                new_token_id: minted.id,
                new_serial: minted.serial_number,
                reason: input.reason ?? null,
            },
        },
        admin
    );

    return {
        old_token_id: token.id,
        new_token_id: minted.id,
        new_serial: minted.serial_number,
        value_inr: token.value_inr,
    };
}

// ---------------------------------------------------------------------------
// #22 — Token revalidation
// ---------------------------------------------------------------------------

export interface RevalidateTokenResult {
    token_id: string;
    old_expires_at: string | null;
    new_expires_at: string;
    restored_status: "live" | "distributed";
}

/**
 * Revalidate (extend) an expired token — admin-only, audited (spec §3.2/§7).
 * Gated by `token_revalidation_allowed`; only an `expired` token is eligible.
 * Restores `distributed` if the token has a distribution record, else `live`.
 */
export async function revalidateToken(
    tokenId: string,
    actor: AppUser,
    client?: Client
): Promise<RevalidateTokenResult> {
    const admin = client ?? (createAdminClient() as unknown as Client);

    const allowed = await getBoolean("token_revalidation_allowed", admin as never);
    if (!allowed) throw new BadRequestError("token revalidation is disabled");

    const { data: tokenRow, error: fetchError } = await admin
        .from("tokens")
        .select("id, status, expires_at")
        .eq("id", tokenId)
        .maybeSingle();
    if (fetchError) throw new Error(fetchError.message);
    if (!tokenRow) throw new NotFoundError("token not found");
    const token = tokenRow as { id: string; status: string; expires_at: string | null };

    if (token.status !== "expired") {
        throw new BadRequestError(
            `only an expired token can be revalidated (status is '${token.status}')`
        );
    }

    const days = await getNumber("token_expiry_days", admin as never);
    const newExpiresAt = new Date(Date.now() + days * 86_400_000).toISOString();

    const { count, error: countError } = await admin
        .from("token_distribution_records")
        .select("id", { count: "exact", head: true })
        .eq("token_id", tokenId);
    if (countError) throw new Error(countError.message);
    const restoredStatus: "live" | "distributed" = (count ?? 0) > 0 ? "distributed" : "live";

    const { data: updated, error: updateError } = await admin
        .from("tokens")
        .update({ status: restoredStatus, expires_at: newExpiresAt, expired_at: null })
        .eq("id", tokenId)
        .eq("status", "expired")
        .select("id");
    if (updateError) throw new Error(updateError.message);
    if (!updated || updated.length === 0) {
        throw new BadRequestError("token status changed concurrently — retry");
    }

    await writeAuditLog(
        {
            actor,
            action: "token.revalidate",
            entity_table: "tokens",
            entity_id: tokenId,
            summary: `token revalidated: expired → ${restoredStatus}, new expiry ${newExpiresAt}`,
            metadata: {
                old_expires_at: token.expires_at,
                new_expires_at: newExpiresAt,
                restored_status: restoredStatus,
            },
        },
        admin
    );

    return {
        token_id: tokenId,
        old_expires_at: token.expires_at,
        new_expires_at: newExpiresAt,
        restored_status: restoredStatus,
    };
}
