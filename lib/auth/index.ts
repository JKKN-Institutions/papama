import type { User } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types/enums";

/**
 * Server-side authentication helpers.
 *
 * The Supabase Auth session is always read server-side with
 * `supabase.auth.getUser()` — NEVER trust a client-sent user id (contract §1).
 */

/** The app user: the auth identity joined to its public.users profile row. */
export interface AppUser {
    id: string;
    email: string | null;
    role: UserRole;
    donor_id: string | null;
}

/** Returns the authenticated Supabase Auth user, or null if not signed in. */
export async function getAuthUser(): Promise<User | null> {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    return user ?? null;
}

/**
 * Returns the full app user (auth identity + role from public.users), or null.
 * Reads through the session-aware (anon) client, so RLS applies: a signed-in
 * user can read their own users row via the `users_select_own` policy.
 */
export async function getAppUser(): Promise<AppUser | null> {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await supabase
        .from("users")
        .select("role, donor_id")
        .eq("id", user.id)
        .single();

    if (error || !data) return null;

    return {
        id: user.id,
        email: user.email ?? null,
        role: data.role as UserRole,
        donor_id: data.donor_id as string | null,
    };
}

/** Like getAppUser but throws when unauthenticated — for use in route handlers. */
export async function requireAppUser(): Promise<AppUser> {
    const appUser = await getAppUser();
    if (!appUser) throw new UnauthorizedError();
    return appUser;
}

/** Thrown when no authenticated app user is present. Map to HTTP 401. */
export class UnauthorizedError extends Error {
    constructor(message = "unauthorized") {
        super(message);
        this.name = "UnauthorizedError";
    }
}
