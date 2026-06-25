import { randomUUID } from "node:crypto";

import { z } from "zod";

import { BadRequestError, defineRoute, parseBody } from "@/lib/api/handler";
import { createAdminClient } from "@/lib/supabase/admin";
import { getNumber } from "@/lib/system-config";
import { ensureGuestPoolDonor } from "@/lib/donations/guest-pool";
import { deriveQrPayload, qrHashOf } from "@/app/api/_lib/tokenQr";

/**
 * POST /api/admin/pool/mint — convert accumulated Guest-Pool credit into tokens.
 *
 * Anonymous (no-account) donations accumulate on the system Guest Pool donor.
 * This admin action mints that credit into Standard tokens placed straight into
 * `in_admin_pool` (Path B) — from there the existing volunteer-allocation flow
 * takes over. Each token is exactly `standard_token_value` (never invents the
 * value; errors if the config is unset, matching the donor mint floor).
 *
 * Gated by `token_generation/create` at the default `all` scope → admin only
 * (a donor only holds `create:own`). Mirrors the donor convert route's atomic
 * credit-deduct (CAS) + compensating cleanup discipline.
 */
const schema = z.object({ count: z.number().int().positive().max(500) });

function serialNumber(): string {
    const stamp = Date.now().toString(36).toUpperCase();
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `PPM-STD-${stamp}-${rand}`;
}

export const POST = defineRoute(
    { feature: "token_generation", action: "create" },
    async ({ req, audit }) => {
        const { count } = await parseBody(req, schema);
        const admin = createAdminClient();

        const value = await getNumber("standard_token_value", admin as never); // throws if unset → 5xx
        const total = value * count;

        const poolDonorId = await ensureGuestPoolDonor(admin);

        const { data: creditRow } = await admin
            .from("donor_credits")
            .select("balance_inr")
            .eq("donor_id", poolDonorId)
            .maybeSingle();
        const balance = creditRow?.balance_inr ?? 0;

        if (total > balance) {
            throw new BadRequestError(
                `minting ${count} token(s) needs ₹${total} but the guest pool holds only ₹${balance}`
            );
        }

        // 1. Deduct the pool credit FIRST with a compare-and-swap on the read value.
        const newBalance = balance - total;
        const { data: deducted, error: deductError } = await admin
            .from("donor_credits")
            .update({ balance_inr: newBalance, updated_at: new Date().toISOString() })
            .eq("donor_id", poolDonorId)
            .eq("balance_inr", balance)
            .select("donor_id")
            .maybeSingle();
        if (deductError) throw new Error(deductError.message);
        if (!deducted) throw new BadRequestError("guest pool balance just changed — please retry");

        // Expiry from token_expiry_days when configured.
        let expiresAt: string | null = null;
        try {
            const days = await getNumber("token_expiry_days", admin as never);
            expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();
        } catch {
            // token_expiry_days unset — open-ended.
        }

        // 2. Mint N Standard tokens straight into the admin pool. On any failure,
        //    refund the just-deducted credit (compensating CAS).
        const rows = Array.from({ length: count }, () => {
            const id = randomUUID();
            return {
                id,
                serial_number: serialNumber(),
                qr_hash: qrHashOf(deriveQrPayload(id)),
                token_type: "standard",
                value_inr: value,
                status: "in_admin_pool",
                donor_id: poolDonorId,
                expires_at: expiresAt,
            };
        });
        const { data: minted, error: mintError } = await admin
            .from("tokens")
            .insert(rows)
            .select("id");
        if (mintError || !minted || minted.length !== count) {
            await admin
                .from("donor_credits")
                .update({ balance_inr: balance, updated_at: new Date().toISOString() })
                .eq("donor_id", poolDonorId)
                .eq("balance_inr", newBalance);
            throw new Error(mintError?.message ?? "failed to mint pool tokens");
        }

        // 3. Ledger entry — a debit of the pool credit.
        await admin.from("credit_transactions").insert({
            donor_id: poolDonorId,
            amount_inr: -total,
            type: "token_conversion",
            description: `Admin minted ${count} pool token(s) (₹${value} each) into the admin pool`,
        });

        await audit({
            action: "pool.mint",
            entity_table: "tokens",
            entity_id: poolDonorId,
            summary: `minted ${count} guest-pool token(s) (₹${total}) into the admin pool`,
            metadata: { count, value_each: value, total, new_balance: newBalance },
        });

        return { minted: count, value_each: value, total, pool_balance: newBalance };
    }
);
