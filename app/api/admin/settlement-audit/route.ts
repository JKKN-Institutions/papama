import { z } from "zod";

import { BadRequestError, NotFoundError, defineRoute, parseBody } from "@/lib/api/handler";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Settlement audit queue (addon #10).
 *
 * GET — list the queue (random-sampled + duplicate-proof-flagged settlements
 * awaiting review). Gated by `vendor_settlement/read` (admin, compliance,
 * vendor_manager); the settlement_audit_queue RLS further restricts rows to
 * admin/compliance. Joins each row's settlement header (+ vendor name) so the
 * console shows what is being audited, not a bare id.
 *
 * PATCH — clear or flag a queue entry. Gated by `vendor_settlement/update`
 * (admin). `clear` marks it reviewed-OK and RELEASES any hold on the settlement;
 * `flag` marks it suspicious and HOLDS the settlement so the payout cannot be
 * paid until an admin releases it. Audited.
 */

interface QueueRow {
    id: string;
    settlement_id: string;
    reason: string | null;
    status: string;
    selected_at: string | null;
    reviewed_at: string | null;
}

export const GET = defineRoute({ feature: "vendor_settlement", action: "read" }, async () => {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from("settlement_audit_queue")
        .select("id, settlement_id, reason, status, selected_at, reviewed_at")
        .order("selected_at", { ascending: false });
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as QueueRow[];

    // Resolve each settlement header + vendor name in two batched queries.
    const settlementIds = [...new Set(rows.map((r) => r.settlement_id))];
    const settlementById = new Map<
        string,
        { vendor_id: string; amount: number; status: string; on_hold: boolean }
    >();
    if (settlementIds.length > 0) {
        const { data: sRows } = await supabase
            .from("vendor_settlements")
            .select("id, vendor_id, amount, status, on_hold")
            .in("id", settlementIds);
        for (const s of (sRows ?? []) as {
            id: string;
            vendor_id: string;
            amount: number;
            status: string;
            on_hold: boolean;
        }[]) {
            settlementById.set(s.id, {
                vendor_id: s.vendor_id,
                amount: Number(s.amount),
                status: s.status,
                on_hold: s.on_hold ?? false,
            });
        }
    }

    const vendorIds = [...new Set([...settlementById.values()].map((s) => s.vendor_id))];
    const nameByVendor = new Map<string, string>();
    if (vendorIds.length > 0) {
        const { data: vRows } = await supabase
            .from("vendors")
            .select("id, name")
            .in("id", vendorIds);
        for (const v of (vRows ?? []) as { id: string; name: string }[]) {
            nameByVendor.set(v.id, v.name);
        }
    }

    const queue = rows.map((r) => {
        const s = settlementById.get(r.settlement_id);
        return {
            id: r.id,
            settlement_id: r.settlement_id,
            reason: r.reason,
            status: r.status,
            selected_at: r.selected_at,
            reviewed_at: r.reviewed_at,
            vendor_id: s?.vendor_id ?? null,
            vendor_name: s ? nameByVendor.get(s.vendor_id) ?? null : null,
            amount: s?.amount ?? null,
            settlement_status: s?.status ?? null,
            on_hold: s?.on_hold ?? false,
        };
    });

    return { queue, total: queue.length };
});

const patchSchema = z.object({
    id: z.string().uuid(),
    action: z.enum(["clear", "flag"]),
    note: z.string().max(500).optional(),
});

export const PATCH = defineRoute({ feature: "vendor_settlement", action: "update" }, async ({ req, user, audit }) => {
    const body = await parseBody(req, patchSchema);
    const admin = createAdminClient();

    const { data: existing, error: fetchErr } = await admin
        .from("settlement_audit_queue")
        .select("id, settlement_id, status")
        .eq("id", body.id)
        .maybeSingle();
    if (fetchErr) throw new Error(fetchErr.message);
    const entry = existing as { id: string; settlement_id: string; status: string } | null;
    if (!entry) throw new NotFoundError("audit entry not found");
    if (entry.status !== "pending") {
        throw new BadRequestError(`audit entry already '${entry.status}'`);
    }

    const nowIso = new Date().toISOString();
    const newStatus = body.action === "clear" ? "cleared" : "flagged";

    const { error: updErr } = await admin
        .from("settlement_audit_queue")
        .update({ status: newStatus, reviewed_by: user.id, reviewed_at: nowIso })
        .eq("id", body.id)
        .eq("status", "pending");
    if (updErr) throw new Error(updErr.message);

    // Flag → hold the settlement (block payout); clear → release any hold.
    const onHold = body.action === "flag";
    const { error: holdErr } = await admin
        .from("vendor_settlements")
        .update({
            on_hold: onHold,
            hold_note: onHold ? `audit flagged${body.note ? `: ${body.note}` : ""}` : null,
            updated_at: nowIso,
        })
        .eq("id", entry.settlement_id)
        // Never un-hold a settlement that is already paid.
        .neq("status", "paid");
    if (holdErr) throw new Error(holdErr.message);

    await audit({
        action: `settlement_audit.${body.action}`,
        entity_table: "settlement_audit_queue",
        entity_id: body.id,
        summary: `settlement audit ${newStatus} for settlement ${entry.settlement_id}${
            body.note ? ` (${body.note})` : ""
        }`,
        metadata: { settlement_id: entry.settlement_id, on_hold: onHold, note: body.note ?? null },
    });

    return { ok: true, id: body.id, status: newStatus, on_hold: onHold };
});
