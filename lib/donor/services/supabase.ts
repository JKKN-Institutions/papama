import { createClient as createBrowserClient } from "@/lib/supabase/client";

import { isMockMode } from "./mock-mode";

/**
 * Session-aware Supabase client for the donor portal (browser).
 *
 * Uses the shared SSR browser client (`@/lib/supabase/client`) so it carries the
 * Supabase Auth cookie session — RLS policies keyed on auth.uid() (donors,
 * donor_credits, tokens, notifications) apply to these queries. Replaces the
 * donor module's standalone, session-less supabase-js client.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

// Forcing mock mode (offline demo) makes every service that gates on this flag
// fall back to the in-browser mock DB, even when Supabase env vars are present.
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey) && !isMockMode();

export const supabase = isSupabaseConfigured ? createBrowserClient() : null;
