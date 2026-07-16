import { BadRequestError, defineRoute, parseBody } from "@/lib/api/handler";
import { resolveDonorId } from "@/lib/donor/server-identity";
import { reportTokenLost } from "@/lib/services/token";
import { createAdminClient } from "@/lib/supabase/admin";
import { tokenReportLossRequestSchema } from "@/lib/validation/schemas";

/**
 * POST /api/donor/tokens/[id]/report-loss — donor self-service lost-token
 * report for their own Path-A token (spec §3.2 [M2-5]). Gated by
 * `token_generation/update` scope own (the donor's existing CRU-own cell).
 *
 * `expectedDonorId` makes the service ownership-check the token — a mismatch
 * reads as "not found" so a donor can't probe another donor's token ids. The
 * service writes its own audit row, so this route does not double-audit (see
 * lib/services/token.ts::reportTokenLost).
 */
export const POST = defineRoute<{ id: string }>(
    { feature: "token_generation", action: "update", scope: "own" },
    async ({ req, user, params }) => {
        const body = await parseBody(req, tokenReportLossRequestSchema);

        const admin = createAdminClient();
        const donorId = await resolveDonorId(user, admin);
        if (!donorId) throw new BadRequestError("no donor profile for this account");

        const result = await reportTokenLost(
            { tokenId: params.id, reason: body.reason ?? null, expectedDonorId: donorId },
            user,
            admin
        );
        return { ...result };
    }
);
