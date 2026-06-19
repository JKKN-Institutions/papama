import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser (anon-key) Supabase client — the DEFAULT client for client components.
 * Uses the public anon key and is subject to RLS. Never put the service-role
 * key here; this code ships to the browser.
 */
export function createClient() {
    return createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
}
