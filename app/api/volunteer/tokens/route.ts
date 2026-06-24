import { defineRoute, BadRequestError } from "@/lib/api/handler";
import { resolveVolunteerId } from "@/lib/volunteer/server-identity";
import { listHeldTokens } from "@/lib/volunteer/holdings";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/volunteer/tokens — the tokens this volunteer currently HOLDS, i.e.
 * tokens granted to them and not yet distributed onward (token-flow Path-B).
 *
 * Gated by `token_generation/read` (scope own). "Held" is derived, not stored:
 * status='assigned_to_volunteer' AND the latest distribution record is a grant
 * (admin_to_volunteer | volunteer_request_grant) with distributed_by = user.id.
 * See lib/volunteer/holdings for the full derivation. We use the service-role
 * client and scope to the volunteer's user_id manually (matrix check already
 * passed), because the held set spans tokens not owned by the volunteer's RLS.
 */
export const GET = defineRoute(
    { feature: "token_generation", action: "read", scope: "own" },
    async ({ user }) => {
        const admin = createAdminClient();
        const volunteerId = await resolveVolunteerId(user, admin);
        if (!volunteerId) {
            throw new BadRequestError("no volunteer profile for this account");
        }

        const tokens = await listHeldTokens(admin, user.id);

        return { tokens, total: tokens.length };
    }
);
