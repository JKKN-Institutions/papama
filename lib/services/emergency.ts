import "server-only";

import { randomUUID } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { deriveQrPayload, qrHashOf } from "@/app/api/_lib/tokenQr";
import type { AppUser } from "@/lib/auth";
import { writeAuditLog } from "@/lib/services/audit";
import { createAdminClient } from "@/lib/supabase/admin";
import { getNumber } from "@/lib/system-config";

/**
 * Emergency / disaster-relief service (addon #8).
 *
 * Issues a relief food token during an emergency (flood, cyclone, accident, …):
 * mints a Standard token marked `is_emergency = true`, parks it in the admin pool
 * (`in_admin_pool`, Path B — the existing volunteer-allocation flow then hands it
 * out), records WHO issued it and WHY in `emergency_token_grants`, and writes the
 * audit trail. The RELAXED meal-limit / cooldown behaviour is NOT here — it is
 * already wired into the redemption engine (Wave 1), driven by the
 * `emergency_mode_enabled` config flag.
 *
 * Mirrors the mint discipline of app/api/admin/pool/mint: value comes from the
 * `standard_token_value` config (never invented — throws if unset), expiry from
 * `token_expiry_days` when set, one-time QR stored only as its non-reversible
 * hash (SEC-5). UNLIKE the pool mint, a relief token is NOT funded by deducting
 * donor/guest-pool credit — emergency relief deliberately issues outside the
 * normal funding path. Keep this an admin-only action (the route guards it).
 *
 * OPEN ITEM — DISASTER-AFFECTED PROOF (client Q7): how a beneficiary PROVES they
 * are disaster-affected — and whether a relief token may only be redeemed with
 * such proof — is UNDECIDED. This service does NOT gate on any proof; `reason` is
 * a free-text note only.
 *   TODO(client Q7): once the proof rules are decided, enforce proof capture /
 *   verification before (or at) issuance/redemption of an emergency token.
 */

type Client = SupabaseClient;

export interface IssueEmergencyTokenInput {
    /** Free-text justification recorded on the grant + audit trail. */
    reason?: string | null;
}

export interface IssueEmergencyTokenResult {
    token_id: string;
    serial_number: string;
    value_inr: number;
    grant_id: string;
}

/** PPM-EMG serial so a relief token is recognisable at a glance. */
function emergencySerial(): string {
    const stamp = Date.now().toString(36).toUpperCase();
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `PPM-EMG-${stamp}-${rand}`;
}

/**
 * Mint + record one emergency-relief token. Runs on the service-role client
 * (pass one in for tests; defaults to createAdminClient). The CALLER must have
 * already passed the admin permission check (the route guard does this).
 */
export async function issueEmergencyToken(
    input: IssueEmergencyTokenInput,
    actor: AppUser,
    client?: Client
): Promise<IssueEmergencyTokenResult> {
    const admin = client ?? (createAdminClient() as unknown as Client);

    // Value from config — never invented (throws MissingConfigError → 5xx if unset).
    const value = await getNumber("standard_token_value", admin as never);

    // Expiry from token_expiry_days when configured; open-ended otherwise.
    let expiresAt: string | null = null;
    try {
        const days = await getNumber("token_expiry_days", admin as never);
        expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();
    } catch {
        // token_expiry_days unset — open-ended relief token.
    }

    // 1. Mint the relief token straight into the admin pool, flagged emergency.
    const id = randomUUID();
    const { data: minted, error: mintError } = await admin
        .from("tokens")
        .insert({
            id,
            serial_number: emergencySerial(),
            qr_hash: qrHashOf(deriveQrPayload(id)),
            token_type: "standard",
            value_inr: value,
            status: "in_admin_pool",
            is_emergency: true,
            expires_at: expiresAt,
        })
        .select("id, serial_number")
        .single();
    if (mintError || !minted) {
        throw new Error(mintError?.message ?? "failed to mint emergency token");
    }

    // 2. Record the grant trail. On failure, roll back the just-minted token so a
    //    relief token never exists without its issued-by/reason provenance.
    const { data: grant, error: grantError } = await admin
        .from("emergency_token_grants")
        .insert({
            token_id: minted.id,
            issued_by: actor.id,
            reason: input.reason ?? null,
        })
        .select("id")
        .single();
    if (grantError || !grant) {
        await admin.from("tokens").delete().eq("id", minted.id);
        throw new Error(grantError?.message ?? "failed to record emergency token grant");
    }

    // 3. Audit trail (single audit writer — lib/services/audit).
    await writeAuditLog({
        actor,
        action: "emergency.token.grant",
        entity_table: "tokens",
        entity_id: minted.id,
        summary: `issued emergency relief token ${minted.serial_number} (₹${value}) into the admin pool`,
        metadata: {
            grant_id: grant.id,
            value_inr: value,
            reason: input.reason ?? null,
            is_emergency: true,
        },
    });

    return {
        token_id: minted.id,
        serial_number: minted.serial_number,
        value_inr: value,
        grant_id: grant.id,
    };
}
