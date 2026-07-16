import { defineRoute } from "@/lib/api/handler";
import { reconcileLedgers } from "@/lib/services/ledger";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/admin/ledgers/reconcile — checks the triple-ledger invariant
 * `donation == vendor_payable + revenue` (spec §3.1 F-10, addon #18). Gated
 * by `financial_ledgers_reconciliation/read` — vendor's `read:"own"` scope
 * cannot see the reconciliation-wide totals, so this effectively resolves to
 * admin/compliance only (matches the matrix intent: reconciliation is a
 * staff-only view of the whole system, not a per-vendor slice).
 */
export const GET = defineRoute(
    { feature: "financial_ledgers_reconciliation", action: "read" },
    async () => ({ ...(await reconcileLedgers(createAdminClient())) })
);
