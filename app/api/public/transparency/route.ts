import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getBoolean } from "@/lib/system-config";
import { getTransparencyStats } from "@/lib/services/transparency";

/**
 * GET /api/public/transparency — UNAUTHENTICATED public transparency stats
 * (addon #14). This route deliberately does NOT use defineRoute (which requires a
 * signed-in app user); it is a plain handler that returns aggregate-only numbers.
 *
 * Gated by system_config `transparency_dashboard_enabled`: when off (or unset),
 * the dashboard is not published, so we return 404. The data itself comes from
 * the SECURITY DEFINER function public.public_transparency_stats() (no PII, no
 * base-table anon SELECT widened).
 *
 * We use the service-role client only to (a) read the feature flag — system_config
 * is not anon-readable — and (b) call the aggregate function. No row-level or
 * personal data is ever returned.
 */
export const dynamic = "force-dynamic";

export async function GET() {
    const admin = createAdminClient();

    let enabled = false;
    try {
        enabled = await getBoolean("transparency_dashboard_enabled", admin as never);
    } catch {
        enabled = false; // unset/missing → treat as not published
    }

    if (!enabled) {
        return NextResponse.json({ error: "not found" }, { status: 404 });
    }

    try {
        const stats = await getTransparencyStats(admin);
        return NextResponse.json({ stats });
    } catch (e) {
        console.error("[public/transparency] failed:", e);
        return NextResponse.json({ error: "internal error" }, { status: 500 });
    }
}
