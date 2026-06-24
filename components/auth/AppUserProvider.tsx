"use client";

import {
    createContext,
    useContext,
    useEffect,
    useState,
    type ReactNode,
} from "react";

import type { AppUser } from "@/lib/auth";
import { can, type Action, type Feature } from "@/lib/permissions";

/**
 * Client-side current-user context. Mirrors the server permission matrix to the
 * UI so components can show only the actions the caller's role allows — the
 * companion to server-side `assertCan`/`defineRoute` (never a replacement: the
 * server is always the real gate).
 *
 * Two ways to seed it:
 *  - Pass `user` (e.g. an admin server layout already resolved `getAppUser()`),
 *    so there is no client fetch.
 *  - Pass `fetchOnMount` to have it call GET /api/me itself (donor portal).
 *
 * Safe for the client bundle: it only imports the pure `can()` matrix helper and
 * the (type-only, erased) AppUser type — no server-only code is pulled in.
 */

interface AppUserContextValue {
    user: AppUser | null;
    loading: boolean;
}

const AppUserContext = createContext<AppUserContextValue>({
    user: null,
    loading: false,
});

export function AppUserProvider({
    user: initialUser = null,
    fetchOnMount = false,
    children,
}: {
    user?: AppUser | null;
    fetchOnMount?: boolean;
    children: ReactNode;
}) {
    const [user, setUser] = useState<AppUser | null>(initialUser);
    const [loading, setLoading] = useState(fetchOnMount && initialUser === null);

    useEffect(() => {
        if (!fetchOnMount || initialUser !== null) return;
        let active = true;

        (async () => {
            try {
                const res = await fetch("/api/me", { cache: "no-store" });
                if (!active) return;
                if (res.ok) {
                    const body = (await res.json()) as { user: AppUser };
                    setUser(body.user ?? null);
                } else {
                    setUser(null);
                }
            } catch {
                if (active) setUser(null);
            } finally {
                if (active) setLoading(false);
            }
        })();

        return () => {
            active = false;
        };
    }, [fetchOnMount, initialUser]);

    return (
        <AppUserContext.Provider value={{ user, loading }}>
            {children}
        </AppUserContext.Provider>
    );
}

/** The current app user (+ loading flag) from context. */
export function useAppUser(): AppUserContextValue {
    return useContext(AppUserContext);
}

/** UI-side permission check mirroring the server matrix. False when signed out. */
export function useCan(
    feature: Feature,
    action: Action,
    scope: "all" | "own" = "all"
): boolean {
    const { user } = useContext(AppUserContext);
    return user ? can(user.role, feature, action, scope) : false;
}
