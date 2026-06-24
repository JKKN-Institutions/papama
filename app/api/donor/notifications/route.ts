import { defineRoute } from "@/lib/api/handler";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/donor/notifications — the signed-in donor's in-app alerts, newest
 * first (credit-threshold, token, redemption, thank-you — see migration M18).
 *
 * Gated by `donor_donation_credit/read` (scope own). Read through the session
 * client so RLS (`notifications_select_own`) scopes rows to this donor. Maps the
 * stored columns to the donor UI's NotificationItem shape: `kind`→`type`,
 * `message`→`body`, `status==='read'`→`read`, `metadata`→`meta`.
 */
export const GET = defineRoute(
    { feature: "donor_donation_credit", action: "read", scope: "own" },
    async () => {
        const supabase = await createClient();

        const { data, error } = await supabase
            .from("notifications")
            .select("id, kind, title, message, status, metadata, created_at")
            .order("created_at", { ascending: false });

        if (error) throw new Error(error.message);

        const notifications = (data ?? []).map((n) => ({
            id: n.id as string,
            type: n.kind as string,
            title: (n.title as string) ?? "",
            body: (n.message as string) ?? "",
            read: (n.status as string) === "read",
            created_at: n.created_at as string,
            meta: (n.metadata as Record<string, unknown> | null) ?? null,
        }));

        return { notifications };
    }
);
