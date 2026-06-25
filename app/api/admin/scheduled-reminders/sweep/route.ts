import { defineRoute } from "@/lib/api/handler";
import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchNotification } from "@/lib/notifications/dispatch";

/**
 * POST /api/admin/scheduled-reminders/sweep — send the 7-day occasion reminder
 * (DIST-6). The application-side twin of the pg_cron job in
 * 20260625000013_schedule_redemption_reminder.sql, so a reminder can also be
 * fired manually (and is testable without the cron extension enabled).
 *
 * For every `scheduled_redemption_dates` row that is still 'scheduled' and whose
 * `scheduled_for` is exactly 7 days out, it dispatches one in-app reminder to the
 * token's donor and flips the row to 'reminded' (so the same occasion is not
 * reminded twice). Gated by `token_distribution/update` (admin). Idempotent.
 */
export const POST = defineRoute(
    { feature: "token_distribution", action: "update" },
    async ({ audit }) => {
        const admin = createAdminClient();

        // The reminder target date = today + 7 days (date-only comparison).
        const target = new Date();
        target.setUTCDate(target.getUTCDate() + 7);
        const targetDate = target.toISOString().slice(0, 10);

        // Pull due schedules joined to their token's donor + value.
        const { data, error } = await admin
            .from("scheduled_redemption_dates")
            .select("id, token_id, scheduled_for, location, tokens(donor_id, value_inr)")
            .eq("status", "scheduled")
            .eq("scheduled_for", targetDate);
        if (error) throw new Error(error.message);

        // PostgREST types an embedded relation as an array; a token has exactly
        // one row, so we read the first element.
        const rows = (data ?? []) as unknown as Array<{
            id: string;
            token_id: string;
            scheduled_for: string;
            location: string | null;
            tokens: { donor_id: string | null; value_inr: number | null }[] | null;
        }>;

        let sent = 0;
        for (const row of rows) {
            const token = row.tokens?.[0] ?? null;
            const donorId = token?.donor_id ?? null;
            if (donorId) {
                await dispatchNotification(admin, {
                    donorId,
                    kind: "redemption_reminder",
                    title: "Your scheduled meal is in 7 days",
                    message: `A ₹${token?.value_inr ?? ""} token you scheduled is set for ${row.scheduled_for}${
                        row.location ? ` at ${row.location}` : ""
                    }. It will be ready to redeem then.`,
                    metadata: {
                        token_id: row.token_id,
                        scheduled_for: row.scheduled_for,
                        location: row.location,
                    },
                    // Add ['in_app','email','sms'] once a provider is configured.
                });
                sent += 1;
            }

            // Mark reminded so the next sweep skips it (idempotent).
            await admin
                .from("scheduled_redemption_dates")
                .update({ status: "reminded" })
                .eq("id", row.id)
                .eq("status", "scheduled");
        }

        if (sent > 0) {
            await audit({
                action: "token.schedule_reminder",
                entity_table: "scheduled_redemption_dates",
                entity_id: rows[0].id,
                summary: `dispatched ${sent} T-7d scheduled-redemption reminder(s)`,
                metadata: { count: sent, target_date: targetDate },
            });
        }

        return { reminded: sent, target_date: targetDate };
    }
);
