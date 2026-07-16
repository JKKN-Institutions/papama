import { z } from "zod";

import { BadRequestError, defineRoute, parseQuery } from "@/lib/api/handler";
import { getLedgerBalance, getLedgerEntriesForReference, type LedgerName } from "@/lib/services/ledger";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/admin/ledgers — triple-ledger trail (spec §3.1 F-10, addon #18).
 *
 * Gated by `financial_ledgers_reconciliation/read` (admin/compliance: all;
 * vendor: own `vendor_payable` rows only). Runs on the SESSION (RLS) client —
 * NOT the service-role client — so the `ledger_entries_select_vendor_own`
 * policy does the real ownership enforcement; a vendor's query is naturally
 * scoped to their own `vendor_payable` rows without this route hand-rolling
 * that check (and without risk of it drifting from the RLS policy).
 *
 * Two modes:
 *   - `?reference_type=&reference_id=` — trace one transaction end-to-end.
 *   - `?ledger=donation|vendor_payable|revenue` — that ledger's running balance.
 */
const querySchema = z
    .object({
        ledger: z.enum(["donation", "vendor_payable", "revenue"]).optional(),
        reference_type: z.string().min(1).optional(),
        reference_id: z.string().min(1).optional(),
    })
    .refine((q) => q.ledger || (q.reference_type && q.reference_id), {
        message: "pass either 'ledger' or both 'reference_type' and 'reference_id'",
    });

export const GET = defineRoute(
    { feature: "financial_ledgers_reconciliation", action: "read" },
    async ({ req }) => {
        const url = new URL(req.url);
        const q = parseQuery(url.searchParams, querySchema);
        const supabase = await createClient();

        if (q.reference_type && q.reference_id) {
            const entries = await getLedgerEntriesForReference(supabase, q.reference_type, q.reference_id);
            return { entries };
        }

        if (!q.ledger) throw new BadRequestError("pass either 'ledger' or a reference pair");
        const ledger = q.ledger as LedgerName;
        const balance = await getLedgerBalance(supabase, ledger);
        return { ledger, balance };
    }
);
