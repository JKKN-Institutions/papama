import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getNumber } from "@/lib/system-config";
import { dispatchNotification } from "@/lib/notifications/dispatch";

/**
 * Courier dispatch for high-value batches (DIST-7).
 *
 * PRD DIST-7 / system_config.courier_batch_min_value (default ₹5,000) require
 * that a token batch whose total value exceeds the threshold be sent by COURIER
 * rather than handed over digitally. There is currently NO batch-distribution
 * route in the codebase to embed this in (token_batches is a minted-grouping
 * table with no distribution path), so this is a standalone helper that the
 * batch-distribution path should call once it exists. It writes a
 * `courier_dispatches` row (migration 20260625000014_courier_dispatches.sql) and,
 * optionally, notifies the donor.
 *
 * Pass the service-role (admin) client; the caller runs the RBAC matrix check.
 *
 * Threshold semantics (AGENTS.md hard rule): courier_batch_min_value is read from
 * system_config. If it is unset (NULL/missing), we DO NOT invent a default — we
 * treat the threshold as not-configured and return { required: false } so nothing
 * is dispatched until the client sets a value.
 */

export interface CourierEvaluation {
    /** Whether the batch value exceeds the configured threshold. */
    required: boolean;
    /** The threshold read from config, or null when unset. */
    threshold: number | null;
    /** The created courier_dispatches row id, when one was created. */
    dispatchId?: string;
}

export interface CourierBatchInput {
    /** token_batches.id this dispatch covers. */
    batchId: string;
    /** Total INR value of the batch (sum of token value_inr). */
    batchValueInr: number;
    /** Optional delivery address / area for the courier. */
    deliveryAddress?: string | null;
    /** Optional donor to notify (in-app). */
    donorId?: string | null;
}

/**
 * Decide whether a batch needs courier delivery and, if so, record a dispatch.
 *
 * Returns { required:false } (no row written) when:
 *   - courier_batch_min_value is unset (no guessed default), or
 *   - the batch value does not exceed the threshold.
 *
 * When required, inserts a `courier_dispatches` row (status 'pending') and
 * notifies the donor if one was supplied.
 */
export async function evaluateBatchForCourier(
    admin: SupabaseClient,
    input: CourierBatchInput
): Promise<CourierEvaluation> {
    // Read the threshold; if unset, treat courier as not-configured (no default).
    let threshold: number | null = null;
    try {
        threshold = await getNumber("courier_batch_min_value", admin as never);
    } catch {
        // Unset/missing — courier routing is not configured. Do not invent a value.
        return { required: false, threshold: null };
    }

    if (input.batchValueInr <= threshold) {
        return { required: false, threshold };
    }

    // Above threshold — record a pending courier dispatch.
    const { data, error } = await admin
        .from("courier_dispatches")
        .insert({
            batch_id: input.batchId,
            batch_value_inr: input.batchValueInr,
            delivery_address: input.deliveryAddress ?? null,
            status: "pending",
        })
        .select("id")
        .single();
    if (error || !data) {
        throw new Error(error?.message ?? "failed to create courier dispatch");
    }
    const dispatchId = (data as { id: string }).id;

    if (input.donorId) {
        await dispatchNotification(admin, {
            donorId: input.donorId,
            kind: "courier_dispatch",
            title: "Your token batch will be couriered",
            message: `Your batch of ₹${input.batchValueInr} exceeds the ₹${threshold} courier threshold and will be delivered by courier.`,
            metadata: { batch_id: input.batchId, dispatch_id: dispatchId, batch_value_inr: input.batchValueInr },
        });
    }

    return { required: true, threshold, dispatchId };
}
