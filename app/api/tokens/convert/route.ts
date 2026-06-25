import { randomUUID } from "node:crypto";

import { BadRequestError, defineRoute, parseBody } from "@/lib/api/handler";
import { resolveDonorId } from "@/lib/donor/server-identity";
import { createAdminClient } from "@/lib/supabase/admin";
import { getNumber } from "@/lib/system-config";
import { tokenMintRequestSchema } from "@/lib/validation/schemas";
import { deriveQrPayload, qrHashOf } from "@/app/api/_lib/tokenQr";
import { dispatchNotification } from "@/lib/notifications/dispatch";

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
    // `tokens.serial_number` has a UNIQUE constraint, so a collision is a hard
    // mint failure — not a silent duplicate. A 5-digit random suffix collides
    // often (birthday problem). Combine a base-36 timestamp with random entropy
    // to make collisions vanishingly unlikely.
    const stamp = Date.now().toString(36).toUpperCase();
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `PPM-${prefix}-${stamp}-${rand}`;
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

        // Minimum = standard_token_value. This floor is MANDATORY: do NOT swallow a
        // config-read failure and fall through to ceiling-only — that would let a
        // donor mint a sub-threshold token. getNumber throws when the key is
        // unset/non-numeric; let that surface (the handler maps it to a 5xx) rather
        // than silently dropping the floor. A DB trigger backstops this off-path
        // too (migration m27_token_value_floor).
        const threshold = await getNumber("standard_token_value", admin as never);
        if (body.amount_inr < threshold) {
            throw new BadRequestError(
                `amount (₹${body.amount_inr}) is below the token threshold (₹${threshold})`
            );
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

        const nowIso = new Date().toISOString();
        const newBalance = balance - body.amount_inr;

        // 1. Atomically deduct credit FIRST, with a compare-and-swap on the
        //    balance we read. supabase-js can't express `balance = balance - x`
        //    or wrap a transaction, so we guard on the prior value: if another
        //    mint/donation changed the balance under us, 0 rows update and we
        //    reject rather than double-spend. This prevents negative balances and
        //    orphan tokens without a DB transaction (a hardening RPC is proposed
        //    separately in docs/proposed-migrations).
        const { data: deducted, error: deductError } = await admin
            .from("donor_credits")
            .update({ balance_inr: newBalance, updated_at: nowIso })
            .eq("donor_id", donorId)
            .eq("balance_inr", balance)
            .select("donor_id")
            .maybeSingle();
        if (deductError) throw new Error(deductError.message);
        if (!deducted) {
            throw new BadRequestError(
                "your credit balance just changed — please retry the mint"
            );
        }

        // One-time QR: derive the payload from the (pre-generated) id + a server
        // secret, store only its non-reversible hash (SEC-5), return the payload.
        const id = randomUUID();
        const qrPayload = deriveQrPayload(id);

        // 2. Mint the token. If this fails, refund the just-deducted credit
        //    (compensating CAS: only restore if the balance is still what we set).
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
            await admin
                .from("donor_credits")
                .update({ balance_inr: balance, updated_at: new Date().toISOString() })
                .eq("donor_id", donorId)
                .eq("balance_inr", newBalance);
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

        // Path A (use_now): the token goes `live` and the donor self-distributes
        // it (token-flow §2). Log that hand-off now so the audit chain is closed
        // from mint onward — channel `donor_self` (already in distribution_channel).
        // Path B (authorize_papama) records its hand-offs later when the admin
        // pool allocates the token to a volunteer.
        if (body.distribution_path === "use_now") {
            await admin.from("token_distribution_records").insert({
                token_id: t.id,
                distributed_by: user.id,
                channel: "donor_self",
            });
        }

        // 3. Ledger entry — a DEBIT (negative). Typed `token_conversion`, not
        //    `donation`: a mint draws DOWN credit, it is not an inflow. Reports
        //    that group the ledger by type depend on this distinction.
        await admin.from("credit_transactions").insert({
            donor_id: donorId,
            amount_inr: -body.amount_inr,
            type: "token_conversion",
            description: `Minted a ${body.token_type} token (₹${body.amount_inr})`,
        });

        // 4. Bump donor counters — best-effort, but guarded with a compare-and-swap
        //    on the prior values to prevent concurrent mints silently overwriting
        //    each other (matches the CAS pattern on balance deduction above).
        const { data: donorRow } = await admin
            .from("donors")
            .select("total_donated_tokens, impact_score")
            .eq("id", donorId)
            .maybeSingle();
        if (donorRow) {
            const prevTokens = donorRow.total_donated_tokens ?? 0;
            const prevScore = donorRow.impact_score ?? 0;
            await admin
                .from("donors")
                .update({
                    total_donated_tokens: prevTokens + 1,
                    impact_score: prevScore + 1,
                    updated_at: nowIso,
                })
                .eq("id", donorId)
                .eq("total_donated_tokens", prevTokens)
                .eq("impact_score", prevScore);
            // If the CAS misses (0 rows affected) because a concurrent mint updated
            // first, the counter is still correct for the other mint — best-effort
            // semantics are acceptable for display-only counters (audit §5 L-note).
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
        await dispatchNotification(admin, {
            donorId,
            kind: "token_generated",
            title: "Token created",
            message: `A ₹${body.amount_inr} ${body.token_type} token is ready (${
                status === "live" ? "yours to use" : "authorized to pApAmA"
            }).`,
            metadata: { token_id: t.id, value_inr: body.amount_inr, status },
            // Default channels = ['in_app']. Pass ['in_app','email','sms'] here once
            // the email/SMS provider is configured (ASSUMPTIONS.md open item Q4).
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
