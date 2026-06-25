import { defineRoute } from "@/lib/api/handler";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { GUEST_POOL_EMAIL, getGuestPoolBalance } from "@/lib/donations/guest-pool";

/**
 * GET /api/admin/donations — every donation (attributed + anonymous Guest Pool)
 * with the donor resolved to a readable name, plus the current Guest Pool credit
 * balance so an admin can convert it into pool tokens.
 *
 * Gated by `donor_donation_credit/read` (admin + compliance at scope all). Reads
 * the rows through the session client (RLS); name resolution + the pool balance
 * use the service-role client (a readable label / a userless system donor).
 */
export const GET = defineRoute({ feature: "donor_donation_credit", action: "read" }, async () => {
    const supabase = await createClient();
    const admin = createAdminClient();

    const { data, error } = await supabase
        .from("donations")
        .select("id, donor_id, amount_inr, token_amount, status, payment_ref, financial_year, created_at")
        .order("created_at", { ascending: false })
        .limit(500);
    if (error) throw new Error(error.message);

    // Resolve donor names in one batch (guest pool vs attributed donor).
    const donorIds = [...new Set((data ?? []).map((d) => d.donor_id).filter(Boolean) as string[])];
    const nameById = new Map<string, { name: string | null; email: string | null }>();
    if (donorIds.length > 0) {
        const { data: donors } = await admin
            .from("donors")
            .select("id, name, email")
            .in("id", donorIds);
        for (const d of (donors ?? []) as { id: string; name: string | null; email: string | null }[]) {
            nameById.set(d.id, { name: d.name, email: d.email });
        }
    }

    const donations = (data ?? []).map((d) => {
        const donor = d.donor_id ? nameById.get(d.donor_id as string) : null;
        const isPool = donor?.email === GUEST_POOL_EMAIL;
        return {
            id: d.id,
            amount_inr: d.amount_inr,
            status: d.status,
            payment_ref: d.payment_ref,
            financial_year: d.financial_year,
            created_at: d.created_at,
            donor_label: isPool ? "Guest pool (anonymous)" : (donor?.name ?? "Unattributed"),
            is_guest: !d.donor_id || isPool,
        };
    });

    const pool = await getGuestPoolBalance(admin);

    return { donations, total: donations.length, pool_balance: pool.balance };
});
