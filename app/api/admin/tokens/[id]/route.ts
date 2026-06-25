import { defineRoute, NotFoundError } from "@/lib/api/handler";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/admin/tokens/[id] — full lifecycle detail for one token (token-flow §6).
 *
 * Powers the admin token DetailDrawer. Gated by `token_generation/read` (admin,
 * compliance, vendor_manager, volunteer per the matrix). Returns the token row,
 * its hand-off history (token_distribution_records), the redemption + value
 * handling (token_redemptions + forfeited_balances) and the audit trail for this
 * entity, so the drawer can render mint → distribute → redeem/expire/revoke.
 *
 * Reads on the service-role client AFTER the matrix check (one round-trip set,
 * and the joined rows live on *_select_staff RLS tables that an admin could read
 * anyway). The QR is exposed as its non-reversible `qr_hash` ONLY — the live QR
 * payload is never re-derived here.
 */
export const GET = defineRoute<{ id: string }>(
    { feature: "token_generation", action: "read" },
    async ({ params }) => {
        const admin = createAdminClient();
        const tokenId = params.id;

        const { data: token, error: tokenError } = await admin
            .from("tokens")
            .select(
                "id, serial_number, qr_hash, token_type, value_inr, status, donor_id, beneficiary_id, special_instructions, expires_at, minted_at, distributed_at, redeemed_at, expired_at, cancelled_at"
            )
            .eq("id", tokenId)
            .maybeSingle();
        if (tokenError) throw new Error(tokenError.message);
        if (!token) throw new NotFoundError("token not found");

        // Resolve the donor to a readable name (raw donor_id is meaningless to an admin).
        let donorName: string | null = null;
        if (token.donor_id) {
            const { data: d } = await admin
                .from("donors")
                .select("name")
                .eq("id", token.donor_id)
                .maybeSingle();
            donorName = (d?.name as string) ?? null;
        }

        // Hand-off history (oldest first) — every documented channel is auditable.
        const { data: handoffs, error: handoffError } = await admin
            .from("token_distribution_records")
            .select("id, channel, distributed_by, beneficiary_id, distribution_location, notes, distributed_at")
            .eq("token_id", tokenId)
            .order("distributed_at", { ascending: true });
        if (handoffError) throw new Error(handoffError.message);

        // Resolve each hand-off's actor (distributed_by) to a name + role so the
        // timeline reads "Roja (admin)" instead of a raw uuid.
        const actorIds = [
            ...new Set((handoffs ?? []).map((h) => h.distributed_by).filter(Boolean) as string[]),
        ];
        const actorById = new Map<string, { name: string | null; role: string | null }>();
        if (actorIds.length > 0) {
            const { data: us } = await admin
                .from("users")
                .select("id, full_name, role")
                .in("id", actorIds);
            for (const u of (us ?? []) as { id: string; full_name: string | null; role: string | null }[]) {
                actorById.set(u.id, { name: u.full_name, role: u.role });
            }
        }

        // Redemption + value handling (a token redeems at most once in Phase 1).
        const { data: redemption, error: redemptionError } = await admin
            .from("token_redemptions")
            .select(
                "id, vendor_id, token_value_inr, menu_value_inr, difference_paid_inr, co_pay_inr, geo_lat, geo_lng, payment_status, proof_status, redeemed_at"
            )
            .eq("token_id", tokenId)
            .order("redeemed_at", { ascending: false })
            .limit(1)
            .maybeSingle();
        if (redemptionError) throw new Error(redemptionError.message);

        // Forfeited balance (under-value redemption), if any.
        const { data: forfeit, error: forfeitError } = await admin
            .from("forfeited_balances")
            .select("forfeited_inr, created_at")
            .eq("token_id", tokenId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
        if (forfeitError) throw new Error(forfeitError.message);

        // Audit trail for this token (entity_id is text in audit_logs).
        const { data: audit, error: auditError } = await admin
            .from("audit_logs")
            .select("id, action, summary, actor_role, created_at")
            .eq("entity_table", "tokens")
            .eq("entity_id", tokenId)
            .order("created_at", { ascending: false })
            .limit(50);
        if (auditError) throw new Error(auditError.message);

        return {
            token: {
                id: token.id,
                serial_number: token.serial_number,
                qr_hash: token.qr_hash,
                token_type: token.token_type,
                value_inr: token.value_inr,
                status: token.status,
                has_donor: token.donor_id != null,
                donor_name: donorName,
                has_beneficiary: token.beneficiary_id != null,
                special_instructions: token.special_instructions,
                expires_at: token.expires_at,
                minted_at: token.minted_at,
                distributed_at: token.distributed_at,
                redeemed_at: token.redeemed_at,
                expired_at: token.expired_at,
                cancelled_at: token.cancelled_at,
            },
            handoffs: (handoffs ?? []).map((h) => {
                const actor = h.distributed_by ? actorById.get(h.distributed_by as string) : null;
                return {
                    ...h,
                    actor_name: actor?.name ?? null,
                    actor_role: actor?.role ?? null,
                };
            }),
            redemption: redemption ?? null,
            forfeited_inr: forfeit?.forfeited_inr ?? null,
            audit: audit ?? [],
        };
    }
);
