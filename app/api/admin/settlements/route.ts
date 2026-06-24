import { BadRequestError, NotFoundError, defineRoute, parseBody } from "@/lib/api/handler";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { SettlementStatus } from "@/lib/types/enums";
import {
    settlementActionRequestSchema,
    type SettlementResponse,
} from "@/lib/validation/schemas";

/**
 * GET /api/admin/settlements — vendor settlement headers (contract §8).
 *
 * Gated by `vendor_settlement/read` (admin, compliance, vendor_manager). These
 * are HEADER-ONLY records (M10): `amount`/`line_items` stay 0 until the
 * settlement_line_items work lands (Section-A-blocked). `amount` is numeric in
 * the DB, returned as a JS number. Newest period first.
 */
export const GET = defineRoute({ feature: "vendor_settlement", action: "read" }, async () => {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from("vendor_settlements")
        .select("id, vendor_id, period, amount, status, on_hold, line_item_count, settled_at, created_at")
        .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    const settlements: SettlementResponse[] = (data ?? []).map((s) => ({
        settlement_id: s.id,
        vendor_id: s.vendor_id,
        period: s.period,
        amount: Number(s.amount),
        status: s.status,
        on_hold: s.on_hold ?? false,
        line_items: s.line_item_count,
        settled_at: s.settled_at,
    }));

    return { settlements, total: settlements.length };
});

/**
 * PATCH /api/admin/settlements — admin settlement lifecycle (contract §8).
 *
 * Gated by `vendor_settlement/update` — admin only (matches the
 * `vendor_settlements_update_admin` RLS policy; admin also holds the matrix
 * `override` capability). Forward cycle lock → reconcile → pay; `unlock` is the
 * override returning a locked row to pending. `pay` stamps `settled_at`. Illegal
 * transition → 400, missing → 404. Audited.
 */
type SettlementActionRule = {
    to: SettlementStatus;
    from: ReadonlyArray<SettlementStatus>;
    verb: string;
    stampsSettledAt?: boolean;
};

const SETTLEMENT_ACTION_RULES: Record<string, SettlementActionRule> = {
    lock: { to: "locked", from: ["pending"], verb: "settlement.lock" },
    unlock: { to: "pending", from: ["locked"], verb: "settlement.unlock" },
    reconcile: { to: "reconciled", from: ["locked"], verb: "settlement.reconcile" },
    pay: { to: "paid", from: ["reconciled"], verb: "settlement.pay", stampsSettledAt: true },
};

export const PATCH = defineRoute(
    { feature: "vendor_settlement", action: "update" },
    async ({ req, audit }) => {
        const body = await parseBody(req, settlementActionRequestSchema);

        const admin = createAdminClient();

        const { data, error: fetchError } = await admin
            .from("vendor_settlements")
            .select("id, status, on_hold")
            .eq("id", body.settlement_id)
            .single();

        if (fetchError || !data) throw new NotFoundError("settlement not found");
        const settlement = data as {
            id: string;
            status: SettlementStatus;
            on_hold: boolean;
        };
        const nowIso = new Date().toISOString();

        // HOLD / RELEASE — admin override (owner §4.8). Orthogonal to the lifecycle:
        // toggles on_hold without changing status. Hold is allowed on any non-paid
        // settlement; release lifts an existing hold.
        if (body.action === "hold" || body.action === "release") {
            if (body.action === "hold" && settlement.status === "paid") {
                throw new BadRequestError("cannot hold a settlement that is already paid");
            }
            const onHold = body.action === "hold";
            const { error: holdError } = await admin
                .from("vendor_settlements")
                .update({ on_hold: onHold, hold_note: body.note ?? null, updated_at: nowIso })
                .eq("id", body.settlement_id);
            if (holdError) throw new Error(holdError.message);

            await audit({
                action: `settlement.${body.action}`,
                entity_table: "vendor_settlements",
                entity_id: body.settlement_id,
                summary: `settlement ${onHold ? "held" : "released"}${body.note ? ` (${body.note})` : ""}`,
                metadata: { on_hold: onHold, status: settlement.status, note: body.note ?? null },
            });

            return { ok: true, id: body.settlement_id, status: settlement.status, on_hold: onHold };
        }

        // LIFECYCLE — lock / unlock / reconcile / pay (status transitions).
        const rule = SETTLEMENT_ACTION_RULES[body.action];
        if (!rule.from.includes(settlement.status)) {
            throw new BadRequestError(
                `cannot '${body.action}' a settlement whose status is '${settlement.status}'`
            );
        }
        // A held settlement cannot be paid until released (the override's whole point).
        if (body.action === "pay" && settlement.on_hold) {
            throw new BadRequestError("settlement is on hold — release it before paying");
        }

        const update: Record<string, unknown> = { status: rule.to, updated_at: nowIso };
        if (rule.stampsSettledAt) update.settled_at = nowIso;

        const { error: updateError } = await admin
            .from("vendor_settlements")
            .update(update)
            .eq("id", body.settlement_id);

        if (updateError) throw new Error(updateError.message);

        await audit({
            action: rule.verb,
            entity_table: "vendor_settlements",
            entity_id: body.settlement_id,
            summary: `settlement: ${settlement.status} → ${rule.to}${
                body.note ? ` (${body.note})` : ""
            }`,
            metadata: { from: settlement.status, to: rule.to, note: body.note ?? null },
        });

        return { ok: true, id: body.settlement_id, status: rule.to };
    }
);
