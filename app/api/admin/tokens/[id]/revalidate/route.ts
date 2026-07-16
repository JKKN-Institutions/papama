import { defineRoute } from "@/lib/api/handler";
import { revalidateToken } from "@/lib/services/token";

/**
 * POST /api/admin/tokens/[id]/revalidate — admin revalidates/extends an
 * expired token (spec §3.2/§7 [M2-5]), audited. Gated by `token_generation/
 * update`, admin only. Blocked entirely when `token_revalidation_allowed` is
 * off. The service writes its own audit row, so this route does not
 * double-audit (see lib/services/token.ts::revalidateToken).
 */
export const POST = defineRoute<{ id: string }>(
    { feature: "token_generation", action: "update" },
    async ({ user, params }) => {
        const result = await revalidateToken(params.id, user);
        return { ...result };
    }
);
