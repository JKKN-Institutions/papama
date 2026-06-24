import { z } from "zod";

import { BadRequestError, defineRoute, parseBody } from "@/lib/api/handler";
import { resolveVendorId } from "@/lib/vendor/server-identity";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { validateRedemption } from "@/lib/services/redemption";

/**
 * POST /api/vendor/redemptions — commit a redemption (RED-1..7, PROOF-4).
 *
 * Gated by `token_redemption/create` (scope own). Re-runs the full validation
 * engine (so the preview's result can't be replayed past a state change); on the
 * first HARD failure it 400s. On success it writes, on the service-role client:
 *   1. the token_redemptions row (value split, geo, beneficiary if matched,
 *      face_hash_checked, payment_status defaults to 'locked'),
 *   2. flips the token to 'redeemed' — guarded on the still-redeemable status so
 *      a concurrent double-scan can't redeem twice,
 *   3. appends a redemption_cooldown_log entry (fair-usage signal), and
 *   4. a forfeited_balances row when token value > menu value (owner §4.4).
 * Vendor identity is resolved server-side. Payment stays LOCKED until proof is
 * submitted via the [id]/proof route.
 *
 * GET /api/vendor/redemptions — list this vendor's redemptions, newest first,
 * through the session (RLS) client.
 */
const createSchema = z.object({
    qr_payload: z.string().min(1),
    menu_item_id: z.string().uuid(),
    geo: z.object({ lat: z.number(), lng: z.number() }).optional(),
    face_hash: z.string().min(1).optional(),
    co_pay: z.number().int().min(0).optional(),
});

export const POST = defineRoute(
    { feature: "token_redemption", action: "create", scope: "own" },
    async ({ req, user, audit }) => {
        const body = await parseBody(req, createSchema);

        const admin = createAdminClient();
        const vendorId = await resolveVendorId(user, admin);
        if (!vendorId) throw new BadRequestError("no vendor profile for this account");

        const result = await validateRedemption(
            {
                qr_payload: body.qr_payload,
                vendor_id: vendorId,
                menu_item_id: body.menu_item_id,
                geo: body.geo,
                face_hash: body.face_hash,
                co_pay: body.co_pay,
            },
            admin
        );

        if (!result.ok || !result.token || !result.menuItem) {
            const failed = result.checks.find((c) => c.hard && !c.pass);
            throw new BadRequestError(
                failed ? `${failed.name}: ${failed.detail}` : "redemption failed validation"
            );
        }

        const token = result.token;
        const value = result.value;
        const beneficiaryId = result.beneficiary?.id ?? null;
        const nowIso = new Date().toISOString();

        // 1. Insert the redemption (payment_status defaults to 'locked').
        const { data: redemptionRow, error: redemptionError } = await admin
            .from("token_redemptions")
            .insert({
                token_id: token.id,
                beneficiary_id: beneficiaryId,
                vendor_id: vendorId,
                token_value_inr: value.token_value,
                menu_value_inr: value.menu_value,
                difference_paid_inr: value.difference_paid,
                co_pay_inr: value.co_pay,
                geo_lat: body.geo?.lat ?? null,
                geo_lng: body.geo?.lng ?? null,
                face_hash_checked: !!body.face_hash,
            })
            .select("id, payment_status")
            .single();

        if (redemptionError || !redemptionRow) {
            throw new Error(redemptionError?.message ?? "failed to record redemption");
        }
        const redemption = redemptionRow as { id: string; payment_status: string };

        // 2. Burn the token — guarded on the still-redeemable status (double-scan safe).
        const { data: burned, error: burnError } = await admin
            .from("tokens")
            .update({ status: "redeemed", redeemed_at: nowIso })
            .eq("id", token.id)
            .in("status", ["live", "distributed"])
            .select("id");
        if (burnError) throw new Error(burnError.message);
        if (!burned || burned.length === 0) {
            // Lost the race: another scan redeemed it first. Roll back our row.
            await admin.from("token_redemptions").delete().eq("id", redemption.id);
            throw new BadRequestError("token was already redeemed");
        }

        // 3. Fair-usage cooldown log (identity signal for cross-vendor limits).
        await admin.from("redemption_cooldown_log").insert({
            beneficiary_id: beneficiaryId,
            face_hash: body.face_hash ?? null,
            token_id: token.id,
            vendor_id: vendorId,
        });

        // 4. Forfeited remainder when token value > menu value (owner §4.4).
        if (value.forfeited > 0) {
            await admin.from("forfeited_balances").insert({
                token_id: token.id,
                redemption_id: redemption.id,
                forfeited_inr: value.forfeited,
            });
        }

        await audit({
            action: "redemption.create",
            entity_table: "token_redemptions",
            entity_id: redemption.id,
            summary: `redeemed token ${token.id} for ₹${value.menu_value} (payment locked)`,
            metadata: {
                token_id: token.id,
                vendor_id: vendorId,
                beneficiary_id: beneficiaryId,
                value,
            },
        });

        return {
            redemption_id: redemption.id,
            payment_status: redemption.payment_status,
            value,
        };
    }
);

export const GET = defineRoute(
    { feature: "token_redemption", action: "read", scope: "own" },
    async () => {
        const supabase = await createClient();

        const { data, error } = await supabase
            .from("token_redemptions")
            .select(
                "id, token_id, token_value_inr, menu_value_inr, difference_paid_inr, co_pay_inr, payment_status, proof_uploaded_at, redeemed_at, created_at"
            )
            .order("redeemed_at", { ascending: false });

        if (error) throw new Error(error.message);

        return { redemptions: data ?? [], total: (data ?? []).length };
    }
);
