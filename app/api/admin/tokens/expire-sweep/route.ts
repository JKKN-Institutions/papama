import { defineRoute } from "@/lib/api/handler";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/admin/tokens/expire-sweep — auto-invalidate expired tokens (TOK-6).
 *
 * Flips any still-active token whose `expires_at` has passed to `expired`. Gated
 * by `token_generation/update` (admin). Idempotent and cron-callable (a scheduled
 * job can hit this; for now it's admin-triggered). One audit row per sweep.
 */
const ACTIVE_STATUSES = [
    "generated",
    "live",
    "in_admin_pool",
    "assigned_to_volunteer",
    "distributed",
];

export const POST = defineRoute(
    { feature: "token_generation", action: "update" },
    async ({ audit }) => {
        const admin = createAdminClient();
        const nowIso = new Date().toISOString();

        const { data, error } = await admin
            .from("tokens")
            .update({ status: "expired", expired_at: nowIso })
            .not("expires_at", "is", null)
            .lt("expires_at", nowIso)
            .in("status", ACTIVE_STATUSES)
            .select("id");
        if (error) throw new Error(error.message);

        const ids = (data ?? []).map((t) => t.id as string);
        if (ids.length > 0) {
            await audit({
                action: "token.expire_sweep",
                entity_table: "tokens",
                entity_id: ids[0],
                summary: `auto-invalidated ${ids.length} expired token(s)`,
                metadata: { count: ids.length, token_ids: ids.slice(0, 50) },
            });
        }

        return { expired: ids.length };
    }
);
