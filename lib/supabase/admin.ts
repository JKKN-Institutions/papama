import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client — SERVER ONLY. Bypasses RLS, so it must only be
 * used inside server-side route handlers/services AFTER permissions have been
 * checked via lib/permissions. Never import this from a client component.
 *
 * The key is read from SUPABASE_SERVICE_ROLE_KEY (server-only env var, never
 * prefixed NEXT_PUBLIC_). The `server-only` import above makes the build fail
 * if this module is ever pulled into a client bundle.
 */
export function createAdminClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !serviceRoleKey) {
        throw new Error(
            "createAdminClient: missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
        );
    }

    return createClient(url, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
}
