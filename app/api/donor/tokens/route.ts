import { defineRoute } from "@/lib/api/handler";
import { createClient } from "@/lib/supabase/server";
import type { TokenResponse } from "@/lib/validation/schemas";

/**
 * GET /api/donor/tokens — the signed-in donor's minted tokens (token-flow §2).
 *
 * Gated by `token_generation/read` (scope own). Read through the session client
 * so RLS (`tokens_select_own`) scopes rows to this donor. `qr_payload` maps the
 * stored `qr_hash`; status uses the live `token_status` enum (no mock values).
 */
export const GET = defineRoute(
    { feature: "token_generation", action: "read", scope: "own" },
    async () => {
        const supabase = await createClient();

        const { data, error } = await supabase
            .from("tokens")
            .select("id, serial_number, token_type, status, value_inr, qr_hash, expires_at, minted_at")
            .order("minted_at", { ascending: false });

        if (error) throw new Error(error.message);

        const tokens: TokenResponse[] = (data ?? []).map((t) => ({
            token_id: t.id as string,
            serial_number: t.serial_number as string,
            token_type: t.token_type as TokenResponse["token_type"],
            status: t.status as TokenResponse["status"],
            value: t.value_inr as number,
            qr_payload: (t.qr_hash as string | null) ?? `PAPAMA:${t.serial_number}`,
            expires_at: (t.expires_at as string | null) ?? null,
        }));

        return { tokens, total: tokens.length };
    }
);
