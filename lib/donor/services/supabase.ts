import { createClient as createBrowserClient } from "@/lib/supabase/client";

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

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured ? createBrowserClient() : null;
