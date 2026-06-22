import { defineRoute } from "@/lib/api/handler";
import { createClient } from "@/lib/supabase/server";
import type { SystemConfigRow } from "@/lib/validation/schemas";

/**
 * GET /api/admin/system-config — all tunable config rows (contract §1).
 *
 * `system_config` has no dedicated matrix feature, so the read is gated under
 * `audit_reports/read` (admin + compliance). Values are returned as raw text +
 * `value_type` (the contract shape); callers coerce via lib/system-config. An
 * unset row keeps a null `value` — never substitute a guessed default.
 */
export const GET = defineRoute({ feature: "audit_reports", action: "read" }, async () => {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from("system_config")
        .select("key, value, value_type, description, updated_at")
        .order("key", { ascending: true });

    if (error) throw new Error(error.message);

    const config: SystemConfigRow[] = (data ?? []).map((r) => ({
        key: r.key,
        value: r.value,
        value_type: r.value_type as SystemConfigRow["value_type"],
        description: r.description ?? undefined,
        updated_at: r.updated_at,
    }));

    return { config };
});
