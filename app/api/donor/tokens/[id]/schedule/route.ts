import { z } from "zod";

import { BadRequestError, NotFoundError, defineRoute, parseBody } from "@/lib/api/handler";
import { resolveDonorId } from "@/lib/donor/server-identity";
import { createAdminClient } from "@/lib/supabase/admin";
import {
    cancelSchedule,
    getActiveSchedule,
    setSchedule,
} from "@/lib/scheduling/scheduled-redemption";

/**
 * Donor "schedule for an occasion" route (DIST-6) — wires the previously dead
 * `scheduled_redemption_dates` table.
 *
 *   GET    /api/donor/tokens/[id]/schedule — read the token's active schedule.
 *   POST   /api/donor/tokens/[id]/schedule — set/replace the schedule
 *            { scheduled_for: 'YYYY-MM-DD', location?: string }.
 *   DELETE /api/donor/tokens/[id]/schedule — clear the schedule.
 *
 * Gated by `token_distribution` (donor scope own — matches the matrix cell that
 * already covers the donor's Path-A self-distribution). The donor identity is
 * resolved server-side and we confirm the token belongs to THIS donor before
 * touching the schedule, so a donor can never schedule someone else's token.
 *
 * A separate sweep (app/api/admin/scheduled-reminders/sweep + the pg_cron job in
 * 20260625000013_schedule_redemption_reminder.sql) dispatches the T-7d reminder.
 */
const scheduleSchema = z.object({
    // Calendar date (YYYY-MM-DD). The reminder sweep fires 7 days before this.
    scheduled_for: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "scheduled_for must be a YYYY-MM-DD date"),
    location: z.string().trim().min(1).optional(),
});

/** Resolve the donor and confirm the token is theirs; throws otherwise. */
async function requireOwnedToken(
    user: Parameters<Parameters<typeof defineRoute>[1]>[0]["user"],
    admin: ReturnType<typeof createAdminClient>,
    tokenId: string
): Promise<void> {
    const donorId = await resolveDonorId(user, admin);
    if (!donorId) throw new BadRequestError("no donor profile for this account");

    const { data: tokenRow, error } = await admin
        .from("tokens")
        .select("id, donor_id, status")
        .eq("id", tokenId)
        .maybeSingle();
    if (error) throw new Error(error.message);
    if (!tokenRow) throw new NotFoundError("token not found");
    const token = tokenRow as { donor_id: string | null; status: string };
    if (token.donor_id !== donorId) {
        throw new NotFoundError("token not found");
    }
    // Only a token still in the donor's hands (not redeemed/expired) is schedulable.
    if (!["live", "in_admin_pool"].includes(token.status)) {
        throw new BadRequestError(
            `a ${token.status} token cannot be scheduled (only live or pooled tokens)`
        );
    }
}

export const GET = defineRoute<{ id: string }>(
    { feature: "token_distribution", action: "read", scope: "own" },
    async ({ user, params }) => {
        const admin = createAdminClient();
        await requireOwnedToken(user, admin, params.id);
        const schedule = await getActiveSchedule(admin, params.id);
        return { schedule };
    }
);

export const POST = defineRoute<{ id: string }>(
    { feature: "token_distribution", action: "update", scope: "own" },
    async ({ req, user, params, audit }) => {
        const body = await parseBody(req, scheduleSchema);

        // Reject a past date — the reminder (and the occasion) must be in the future.
        const today = new Date().toISOString().slice(0, 10);
        if (body.scheduled_for < today) {
            throw new BadRequestError("scheduled_for cannot be in the past");
        }

        const admin = createAdminClient();
        await requireOwnedToken(user, admin, params.id);

        const schedule = await setSchedule(
            admin,
            params.id,
            body.scheduled_for,
            body.location ?? null
        );

        await audit({
            action: "token.schedule",
            entity_table: "scheduled_redemption_dates",
            entity_id: schedule.id,
            summary: `donor scheduled token ${params.id} for ${body.scheduled_for}`,
            metadata: {
                token_id: params.id,
                scheduled_for: body.scheduled_for,
                location: body.location ?? null,
            },
        });

        return { schedule };
    }
);

export const DELETE = defineRoute<{ id: string }>(
    { feature: "token_distribution", action: "update", scope: "own" },
    async ({ user, params, audit }) => {
        const admin = createAdminClient();
        await requireOwnedToken(user, admin, params.id);
        await cancelSchedule(admin, params.id);

        await audit({
            action: "token.schedule_cancel",
            entity_table: "scheduled_redemption_dates",
            entity_id: params.id,
            summary: `donor cleared the schedule for token ${params.id}`,
            metadata: { token_id: params.id },
        });

        return { ok: true, token_id: params.id };
    }
);
