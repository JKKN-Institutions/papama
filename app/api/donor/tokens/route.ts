import { defineRoute } from "@/lib/api/handler";
import { createClient } from "@/lib/supabase/server";
import { deriveQrPayload } from "@/app/api/_lib/tokenQr";

/**
 * GET /api/donor/tokens — the signed-in donor's minted tokens (token-flow §2).
 *
 * Gated by `token_generation/read` (scope own). Read through the session client
 * so RLS (`tokens_select_own`) scopes rows to this donor. `qr_payload` maps the
 * stored `qr_hash`; status uses the live `token_status` enum (no mock values).
 * Includes `issued_at`/`redeemed_at` so the donor token UI can render timelines.
 */
export const GET = defineRoute(
    { feature: "token_generation", action: "read", scope: "own" },
    async () => {
        const supabase = await createClient();

        const { data, error } = await supabase
            .from("tokens")
            .select(
                "id, serial_number, token_type, status, value_inr, expires_at, minted_at, redeemed_at, special_instructions, area_lock"
            )
            .order("minted_at", { ascending: false });

        if (error) throw new Error(error.message);

        const tokens = (data ?? []).map((t) => ({
            token_id: t.id as string,
            serial_number: t.serial_number as string,
            token_type: t.token_type as string,
            status: t.status as string,
            value: t.value_inr as number,
            qr_payload: deriveQrPayload(t.id as string),
            issued_at: t.minted_at as string,
            expires_at: (t.expires_at as string | null) ?? null,
            redeemed_at: (t.redeemed_at as string | null) ?? null,
            is_special_care: (t.token_type as string) === "special_care",
            special_instructions: (t.special_instructions as string | null) ?? undefined,
            area_lock: (t.area_lock as string | null) ?? undefined,
        }));

        return { tokens, total: tokens.length };
    }
);
