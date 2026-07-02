"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { createClient } from "@/lib/supabase/client";
import { clearDonorCache } from "@/lib/donor/auth";

/**
 * Donor sign-up (Supabase Auth). The M19 trigger provisions the donors +
 * donor_credits rows automatically on auth signup. full_name is passed as user
 * metadata so the trigger can seed donors.name. If the project requires email
 * confirmation, we show a "check your email" state instead of redirecting.
 */
export default function DonorSignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Data-privacy consent is required before an account is created (addon2 A7).
    if (!consent) {
      setError("Please accept the data privacy policy to continue.");
      return;
    }
    setLoading(true);

    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      // Stamp the consent intent on auth metadata as a durable record even on the
      // email-confirmation path (the donor row is created on confirm).
      options: { data: { full_name: fullName, consent_data_privacy: true } },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // If a session is returned, confirmation is off → record consent, then portal.
    if (data.session) {
      // Best-effort: RLS records it against this donor. A failure must not block
      // the signup (the auth-metadata flag above preserves the intent).
      try {
        await fetch("/api/donor/consent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ consent_type: "data_privacy" }),
        });
      } catch {
        // ignore — consent can be re-recorded from the donor account later
      }
      clearDonorCache();
      router.push("/donor/dashboard");
      router.refresh();
      return;
    }

    // Otherwise the user must confirm via email first.
    setConfirmSent(true);
    setLoading(false);
  }

  if (confirmSent) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-emerald-50 px-4 dark:bg-zinc-950">
        <div className="w-full max-w-sm rounded-2xl border border-emerald-100 bg-white p-8 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h1 className="text-xl font-semibold text-emerald-700 dark:text-emerald-400">Check your email</h1>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            We sent a confirmation link to <span className="font-medium">{email}</span>. Confirm it, then sign in.
          </p>
          <Link
            href="/donor/login"
            className="mt-6 inline-block rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-500/60 focus-visible:ring-offset-1 active:scale-[.98]"
          >
            Go to sign in
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-emerald-50 px-4 dark:bg-zinc-950">
      <div className="w-full max-w-sm rounded-2xl border border-emerald-100 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-emerald-700 dark:text-emerald-400">
            Become a donor
          </h1>
          <p className="mt-1 text-sm text-zinc-500">Create your pApAmA account</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label htmlFor="fullName" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Full name
            </label>
            <input
              id="fullName"
              type="text"
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
              placeholder="Your name"
            />
          </div>

          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
              placeholder="At least 6 characters"
            />
          </div>

          <label className="flex items-start gap-2 text-xs text-zinc-600 dark:text-zinc-400">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-emerald-600 focus:ring-emerald-500"
            />
            <span>
              I agree to the pApAmA data privacy policy and consent to my data being
              processed to run donations and meal transparency.
            </span>
          </label>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-500/60 focus-visible:ring-offset-1 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Creating account…" : "Sign up"}
          </button>

          <p className="text-center text-sm text-zinc-500">
            Already a donor?{" "}
            <Link href="/donor/login" className="font-medium text-emerald-700 hover:underline dark:text-emerald-400">
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}
