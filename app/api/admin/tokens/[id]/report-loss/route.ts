import { defineRoute, parseBody } from "@/lib/api/handler";
import { reportTokenLost } from "@/lib/services/token";
import { tokenReportLossRequestSchema } from "@/lib/validation/schemas";

/**
 * POST /api/admin/tokens/[id]/report-loss — admin-initiated lost-token report
 * (spec §3.2 [M2-5], on behalf of a beneficiary/distributor who has no
 * mutating permission cell on token_generation themselves — see ASSUMPTIONS.md
 * for the actor-mapping decision). Gated by `token_generation/update`, admin
 * only, mirroring the existing `revoke` route's shape.
 *
 * Blocks the token instantly and mints a same-value replacement referencing
 * `replacement_for_token_id`. The service writes its own audit row, so this
 * route does not double-audit (see lib/services/token.ts::reportTokenLost).
 */
export const POST = defineRoute<{ id: string }>(
    { feature: "token_generation", action: "update" },
    async ({ req, user, params }) => {
        const body = await parseBody(req, tokenReportLossRequestSchema);

        const result = await reportTokenLost(
            { tokenId: params.id, reason: body.reason ?? null },
            user
        );
        return { ...result };
    }
);
