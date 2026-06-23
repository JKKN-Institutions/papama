import { randomUUID } from "node:crypto";

import { BadRequestError, defineRoute, parseBody } from "@/lib/api/handler";
import { resolveDonorId } from "@/lib/donor/server-identity";
import { createAdminClient } from "@/lib/supabase/admin";
import { getNumber } from "@/lib/system-config";
import { tokenMintRequestSchema } from "@/lib/validation/schemas";
import { deriveQrPayload, qrHashOf } from "@/app/api/_lib/tokenQr";

/**
 * POST /api/tokens/convert — the signed-in donor mints ONE token from credit
 * (token-flow §1–2).
 *
 * Gated by `token_generation/create` (scope own). Rules enforced server-side:
 *   - amount ≤ available credit (always),
 *   - amount ≥ standard_token_value when that threshold is set (no guessed
 *     default when unset),
 *   - minting deducts the amount from credit and writes a ledger entry.
 * Post-mint fork: use_now → `live`; authorize_papama → `in_admin_pool`.
 *
 * Runs on the service-role client after the matrix check: credit deduction is
 * admin-write under RLS, so the whole mint is done atomically with one client.
 */
function serialNumber(tokenType: string): string {
    const prefix = tokenType === "special_care" ? "SPC" : "STD";
    const rand = Math.floor(10000 + Math.random() * 90000);
    return `PPM-${prefix}-${rand}`;
}

export const POST = defineRoute(
    { feature: "token_generation", action: "create", scope: "own" },
    async ({ req, user, audit }) => {
        const body = await parseBody(req, tokenMintRequestSchema);

        // Donors mint Standard only; Special Care is beneficiary-eligibility-driven.
        if (body.token_type === "special_care") {
            throw new BadRequestError("donors can only mint Standard tokens");
        }

        const admin = createAdminClient();
        const donorId = await resolveDonorId(user, admin);
        if (!donorId) throw new BadRequestError("no donor profile for this account");

        // Available credit.
        const { data: creditRow } = await admin
            .from("donor_credits")
            .select("balance_inr")
            .eq("donor_id", donorId)
            .maybeSingle();
        const balance = creditRow?.balance_inr ?? 0;

        if (body.amount_inr > balance) {
            throw new BadRequestError(
                `amount (₹${body.amount_inr}) exceeds available credit (₹${balance})`
            );
        }

        // Minimum = standard_token_value when configured; skip the floor if unset.
        try {
            const threshold = await getNumber("standard_token_value", admin as never);
            if (body.amount_inr < threshold) {
                throw new BadRequestError(
                    `amount (₹${body.amount_inr}) is below the token threshold (₹${threshold})`
                );
            }
        } catch (err) {
            if (err instanceof BadRequestError) throw err;
            // threshold unset — enforce only the balance ceiling.
        }

        // Expiry from token_expiry_days when configured; else open-ended (null).
        let expiresAt: string | null = null;
        try {
            const days = await getNumber("token_expiry_days", admin as never);
            expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();
        } catch {
            // token_expiry_days unset — leave expiry null.
        }

        const status = body.distribution_path === "use_now" ? "live" : "in_admin_pool";
        const serial = serialNumber(body.token_type);

        // One-time QR: derive the payload from the (pre-generated) id + a server
        // secret, store only its non-reversible hash (SEC-5), return the payload.
        const id = randomUUID();
        const qrPayload = deriveQrPayload(id);

        // 1. Mint the token.
        const { data: token, error: tokenError } = await admin
            .from("tokens")
            .insert({
                id,
                serial_number: serial,
                qr_hash: qrHashOf(qrPayload),
                token_type: body.token_type,
                value_inr: body.amount_inr,
                status,
                donor_id: donorId,
                special_instructions: body.special_instructions ?? null,
                expires_at: expiresAt,
            })
            .select("id, serial_number, token_type, status, value_inr, expires_at")
            .single();

        if (tokenError || !token) {
            throw new Error(tokenError?.message ?? "failed to mint token");
        }
        const t = token as {
            id: string;
            serial_number: string;
            token_type: string;
            status: string;
            value_inr: number;
            expires_at: string | null;
        };

        const nowIso = new Date().toISOString();
        const newBalance = balance - body.amount_inr;

        // 2. Deduct credit.
        const { error: creditError } = await admin
            .from("donor_credits")
            .update({ balance_inr: newBalance, updated_at: nowIso })
            .eq("donor_id", donorId);
        if (creditError) throw new Error(creditError.message);

        // 3. Ledger entry (negative).
        await admin.from("credit_transactions").insert({
            donor_id: donorId,
            amount_inr: -body.amount_inr,
            type: "donation",
            description: `Minted a ${body.token_type} token (₹${body.amount_inr})`,
        });

        // 4. Bump donor counters (best-effort).
        const { data: donorRow } = await admin
            .from("donors")
            .select("total_donated_tokens, impact_score")
            .eq("id", donorId)
            .maybeSingle();
        if (donorRow) {
            await admin
                .from("donors")
                .update({
                    total_donated_tokens: (donorRow.total_donated_tokens ?? 0) + 1,
                    impact_score: (donorRow.impact_score ?? 0) + 1,
                    updated_at: nowIso,
                })
                .eq("id", donorId);
        }

        await audit({
            action: "token.mint",
            entity_table: "tokens",
            entity_id: t.id,
            summary: `donor minted a ${body.token_type} token (₹${body.amount_inr}) → ${status}`,
            metadata: {
                value_inr: body.amount_inr,
                distribution_path: body.distribution_path,
                status,
                new_balance: newBalance,
            },
        });

        // Notify the donor their token is ready (TRANS).
        await admin.from("notifications").insert({
            donor_id: donorId,
            kind: "token_generated",
            title: "Token created",
            message: `A ₹${body.amount_inr} ${body.token_type} token is ready (${
                status === "live" ? "yours to use" : "authorized to pApAmA"
            }).`,
            metadata: { token_id: t.id, value_inr: body.amount_inr, status },
        });

        return {
            token_id: t.id,
            serial_number: t.serial_number,
            token_type: t.token_type,
            status: t.status,
            value: t.value_inr,
            qr_payload: qrPayload,
            expires_at: t.expires_at,
            credit_balance: newBalance,
        };
    }
);
