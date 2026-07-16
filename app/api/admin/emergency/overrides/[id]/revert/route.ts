import { defineRoute } from "@/lib/api/handler";
import { revertEmergencyOverride } from "@/lib/services/emergency";

/**
 * POST /api/admin/emergency/overrides/[id]/revert — manual early revert of an
 * active emergency override (addon #9), before its auto-revert window (if
 * any) elapses. Gated by `emergency_disaster_mode/update`, admin only. The
 * service writes its own audit row, so this route does not double-audit.
 */
export const POST = defineRoute<{ id: string }>(
    { feature: "emergency_disaster_mode", action: "update" },
    async ({ user, params }) => {
        const result = await revertEmergencyOverride(params.id, user);
        return { ...result };
    }
);
