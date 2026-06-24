import { defineRoute, BadRequestError } from "@/lib/api/handler";
import { resolveVolunteerId } from "@/lib/volunteer/server-identity";
import { countHeldTokens } from "@/lib/volunteer/holdings";
import { createAdminClient } from "@/lib/supabase/admin";
import { getConfig } from "@/lib/system-config";

/**
 * GET /api/volunteer/allocation — the volunteer's concurrent-holding headroom,
 * so the request form can show how many more tokens they may hold.
 *
 * `max_tokens_per_volunteer` is a CONCURRENT limit (held, not-yet-distributed).
 * It is an intentionally-nullable config key (pending mentor input): when unset
 * we return `limit: null` / `remaining: null` and the UI shows "no limit set" —
 * we never invent a default (AGENTS.md hard rule). Gated by
 * `token_distribution/read` (scope own); held count is derived server-side.
 */
export const GET = defineRoute(
    { feature: "token_distribution", action: "read", scope: "own" },
    async ({ user }) => {
        const admin = createAdminClient();
        const volunteerId = await resolveVolunteerId(user, admin);
        if (!volunteerId) {
            throw new BadRequestError("no volunteer profile for this account");
        }

        const heldCount = await countHeldTokens(admin, user.id);

        // The key is seeded but may be NULL (unset). Treat missing/unset as "no limit".
        let limit: number | null = null;
        try {
            const value = await getConfig("max_tokens_per_volunteer", admin);
            limit = typeof value === "number" && !Number.isNaN(value) ? value : null;
        } catch {
            limit = null;
        }

        const remaining = limit == null ? null : Math.max(0, limit - heldCount);

        return { allocation: { limit, held_count: heldCount, remaining } };
    }
);
