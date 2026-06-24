"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { createClient } from "@/lib/supabase/client";

/** Admin top bar with a sign-out action. Client component (uses the browser client). */
export function AdminHeader() {
    const router = useRouter();
    const [signingOut, setSigningOut] = useState(false);

    async function signOut() {
        setSigningOut(true);
        await createClient().auth.signOut();
        router.push("/login");
        router.refresh();
    }

    return (
        <header className="border-b border-slate-200 bg-white">
            <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
                <Link href="/admin" className="flex items-baseline gap-3 transition hover:opacity-80">
                    <span className="text-lg font-semibold tracking-tight text-slate-900">
                        pApAmA
                    </span>
                    <span className="text-sm text-slate-400">Admin</span>
                </Link>
                <button
                    onClick={signOut}
                    disabled={signingOut}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                >
                    {signingOut ? "Signing out…" : "Sign out"}
                </button>
            </div>
        </header>
    );
}
