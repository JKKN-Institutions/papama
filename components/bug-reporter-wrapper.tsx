"use client";

import { BugReporterProvider } from "@boobalan_jkkn/bug-reporter-sdk";
import type { User } from "@supabase/supabase-js";
import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";

/**
 * Bug Boundary (JKKN Bug Reporter SDK) wrapper, wired to Supabase auth.
 *
 * Placement: this is mounted inside the AUTHENTICATED portal layouts
 * (donor / vendor / admin / volunteer), never in the public root layout, so the
 * floating bug widget only appears for signed-in role users — not on the public
 * donate flow, login/signup, or the public beneficiary self-registration page.
 *
 * The widget is enabled only when BOTH:
 *   1. a Supabase user is present (auth-only visibility), and
 *   2. NEXT_PUBLIC_BUG_REPORTER_API_KEY is configured.
 * Until the API key is set in .env.local the SDK stays dormant — no widget, no
 * runtime errors — and it activates automatically once the key is provided.
 * (The key is an external credential from the JKKN Bug Reporter platform; it is
 * intentionally not invented here — see .env.example.)
 */
export function BugReporterWrapper({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    let active = true;

    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (active) setUser(data.user);
      })
      .catch(() => {
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  const apiKey = process.env.NEXT_PUBLIC_BUG_REPORTER_API_KEY;
  const apiUrl = process.env.NEXT_PUBLIC_BUG_REPORTER_API_URL;

  // Dormant until auth resolves and the key is configured.
  if (isLoading || !user || !apiKey || !apiUrl) {
    return <>{children}</>;
  }

  return (
    <BugReporterProvider
      apiKey={apiKey}
      apiUrl={apiUrl}
      enabled={true}
      debug={process.env.NODE_ENV === "development"}
      networkCapture={true}
      // Don't capture our own Supabase/SDK traffic in the network buffer.
      networkExcludePatterns={[/supabase\.co/, /\/auth\//]}
      userContext={{
        userId: user.id,
        name:
          user.user_metadata?.full_name ||
          user.email?.split("@")[0] ||
          "Anonymous",
        email: user.email || undefined,
      }}
    >
      {children}
    </BugReporterProvider>
  );
}
