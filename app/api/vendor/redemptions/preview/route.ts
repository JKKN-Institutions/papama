import { z } from "zod";

import { BadRequestError, defineRoute, parseBody } from "@/lib/api/handler";
import { resolveVendorId } from "@/lib/vendor/server-identity";
import { createAdminClient } from "@/lib/supabase/admin";
import { validateRedemption } from "@/lib/services/redemption";
import { faceCaptureSchema } from "@/lib/validation/schemas";

/**
 * POST /api/vendor/redemptions/preview — dry-run a redemption (RED-1..7).
 *
 * Gated by `token_redemption/read` (scope own). The vendor scans a token QR and
 * picks a menu item; this returns the ordered validation checks and the money
 * split WITHOUT writing anything, so the till can confirm before committing.
 * Vendor identity is resolved server-side from the session — never trusted from
 * the body.
 */
const previewSchema = z.object({
    qr_payload: z.string().min(1),
    menu_item_id: z.string().uuid(),
    geo: z.object({ lat: z.number(), lng: z.number() }).optional(),
    // Optional in preview (the real redeem requires it) so the till can see the
    // value split before capturing the face.
    face_capture: faceCaptureSchema.optional(),
    co_pay: z.number().int().min(0).optional(),
});

export const POST = defineRoute(
    { feature: "token_redemption", action: "read", scope: "own" },
    async ({ req, user }) => {
        const body = await parseBody(req, previewSchema);

        const admin = createAdminClient();
        const vendorId = await resolveVendorId(user, admin);
        if (!vendorId) throw new BadRequestError("no vendor profile for this account");

        const result = await validateRedemption(
            {
                qr_payload: body.qr_payload,
                vendor_id: vendorId,
                menu_item_id: body.menu_item_id,
                geo: body.geo,
                face: body.face_capture,
                co_pay: body.co_pay,
            },
            admin
        );

        return {
            ok: result.ok,
            checks: result.checks,
            token: result.token
                ? {
                      id: result.token.id,
                      status: result.token.status,
                      token_type: result.token.token_type,
                      value_inr: result.token.value_inr,
                      expires_at: result.token.expires_at,
                  }
                : null,
            menu_item: result.menuItem
                ? {
                      id: result.menuItem.id,
                      item_name: result.menuItem.item_name,
                      price: Math.round(result.menuItem.price),
                  }
                : null,
            value: result.value,
        };
    }
);
