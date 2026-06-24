import Link from "next/link";

/**
 * pApAmA landing page — the public entry point. Routes visitors to the three
 * surfaces of the platform: the no-app donation page, the donor portal, and
 * the admin console (auth-gated). Replaces the create-next-app boilerplate.
 */
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-emerald-50 to-white px-6 py-16 dark:from-zinc-950 dark:to-black">
      <div className="w-full max-w-3xl">
        <header className="mb-12 text-center">
          <h1 className="text-5xl font-bold tracking-tight text-emerald-700 dark:text-emerald-400">
            pApAmA
          </h1>
          <p className="mt-3 text-lg text-zinc-600 dark:text-zinc-400">
            Eliminating hunger with dignity — transparent, token-based food
            donation from donor to meal.
          </p>
        </header>

        <div className="grid gap-5 sm:grid-cols-3">
          <Link
            href="/donate"
            className="group rounded-2xl border border-emerald-200 bg-emerald-600 p-6 text-white shadow-sm transition hover:bg-emerald-700"
          >
            <h2 className="text-xl font-semibold">Donate</h2>
            <p className="mt-2 text-sm text-emerald-50">
              Sponsor a meal in seconds — no app or login needed.
            </p>
            <span className="mt-4 inline-block text-sm font-medium">
              Give now →
            </span>
          </Link>

          <Link
            href="/donor/dashboard"
            className="group rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm transition hover:border-emerald-300 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
              Donor portal
            </h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Track your credit, tokens, impact and redemption history.
            </p>
            <span className="mt-4 inline-block text-sm font-medium text-emerald-700 dark:text-emerald-400">
              Open dashboard →
            </span>
          </Link>

          <Link
            href="/login"
            className="group rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm transition hover:border-emerald-300 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
              Admin console
            </h2>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Vendors, beneficiaries, settlements, fraud and reports.
            </p>
            <span className="mt-4 inline-block text-sm font-medium text-emerald-700 dark:text-emerald-400">
              Sign in →
            </span>
          </Link>
        </div>

        <footer className="mt-12 text-center text-xs text-zinc-400">
          Tokens represent food value only — never cash, never withdrawable.
        </footer>
      </div>
    </main>
  );
}
