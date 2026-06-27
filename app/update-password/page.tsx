"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { createClient } from "@/lib/supabase/client";

/**
 * Set a new password. Reached after /auth/confirm has verified a recovery
 * token_hash and established a session for the user. `updateUser` writes the new
 * password against that session; if there is no recovery session it fails and we
 * surface the error.
 */
export default function UpdatePasswordPage() {
    const router = useRouter();

    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    async function onSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);

        if (password !== confirm) {
            setError("Passwords do not match.");
            return;
        }

        setLoading(true);
        const supabase = createClient();
        const { error } = await supabase.auth.updateUser({ password });

        if (error) {
            setError(error.message);
            setLoading(false);
            return;
        }

        router.push("/login");
        router.refresh();
    }

    return (
        <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
            <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
                <div className="mb-6 text-center">
                    <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                        Set a new password
                    </h1>
                    <p className="mt-1 text-sm text-slate-500">Choose a new password to continue.</p>
                </div>

                <form onSubmit={onSubmit} className="space-y-4">
                    <div>
                        <label
                            htmlFor="password"
                            className="mb-1 block text-sm font-medium text-slate-700"
                        >
                            New password
                        </label>
                        <input
                            id="password"
                            type="password"
                            required
                            minLength={6}
                            autoComplete="new-password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
                            placeholder="At least 6 characters"
                        />
                    </div>

                    <div>
                        <label
                            htmlFor="confirm"
                            className="mb-1 block text-sm font-medium text-slate-700"
                        >
                            Confirm new password
                        </label>
                        <input
                            id="confirm"
                            type="password"
                            required
                            minLength={6}
                            autoComplete="new-password"
                            value={confirm}
                            onChange={(e) => setConfirm(e.target.value)}
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
                            placeholder="••••••••"
                        />
                    </div>

                    {error && (
                        <p
                            className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
                            role="alert"
                        >
                            {error}
                        </p>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {loading ? "Updating…" : "Update password"}
                    </button>
                </form>
            </div>
        </main>
    );
}
