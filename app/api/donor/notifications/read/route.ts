import { z } from "zod";

import { BadRequestError, defineRoute, parseBody } from "@/lib/api/handler";
import { resolveDonorId } from "@/lib/donor/server-identity";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/donor/notifications/read — the signed-in donor marks ONE of their
 * own notifications read (migration M18: status → 'read').
 *
 * Gated by `donor_donation_credit/update` (scope own). After the matrix check
 * the update runs on the service-role client, but is constrained to
 * `id = body.id AND donor_id = <resolved donor>` so a donor can only flip their
 * own rows. Donor identity is resolved server-side, never trusted from the body.
 */
const markReadSchema = z.object({ id: z.string().uuid() });

export const POST = defineRoute(
    { feature: "donor_donation_credit", action: "update", scope: "own" },
    async ({ req, user, audit }) => {
        const body = await parseBody(req, markReadSchema);

        const admin = createAdminClient();
        const donorId = await resolveDonorId(user, admin);
        if (!donorId) throw new BadRequestError("no donor profile for this account");

        const { error } = await admin
            .from("notifications")
            .update({ status: "read" })
            .eq("id", body.id)
            .eq("donor_id", donorId);
        if (error) throw new Error(error.message);

        await audit({
            action: "notification.read",
            entity_table: "notifications",
            entity_id: body.id,
            summary: "donor marked a notification read",
        });

        return { ok: true, id: body.id };
    }
);
