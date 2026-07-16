import { defineRoute } from "@/lib/api/handler";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/admin/emergency/sweep — auto-revert emergency overrides past
 * `emergency_mode_max_duration_days` (addon #9). Mirrors the SQL
 * `revert_emergency_overrides()` pg_cron job (same dual cron/manual-trigger
 * shape as `token expire-sweep`) — this route calls the RPC directly rather
 * than reimplementing the per-row CAS-restore loop in TypeScript, since the
 * operation is a multi-step transaction better kept in one place. The RPC
 * writes its own system audit_logs row (actor_id=null) when it reverts
 * anything, so this route does NOT double-audit. Gated by
 * `emergency_disaster_mode/update`, admin only.
 */
export const POST = defineRoute(
    { feature: "emergency_disaster_mode", action: "update" },
    async () => {
        const admin = createAdminClient();
        const { data, error } = await admin.rpc("revert_emergency_overrides");
        if (error) throw new Error(error.message);

        return { reverted: (data as number | null) ?? 0 };
    }
);
