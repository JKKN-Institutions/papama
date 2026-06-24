import Link from "next/link";

/**
 * Fallback shown when an email confirmation or password-recovery link is invalid
 * or expired (the `/auth/confirm` route could not verify the token_hash).
 */
export default function AuthCodeErrorPage() {
    return (
        <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
            <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
                <h1 className="text-xl font-semibold tracking-tight text-slate-900">
                    Link expired or invalid
                </h1>
                <p className="mt-2 text-sm text-slate-500">
                    This confirmation or reset link is no longer valid. Request a new one and try
                    again.
                </p>
                <div className="mt-6 flex flex-col gap-2 text-sm">
                    <Link href="/login" className="font-medium text-slate-900 hover:underline">
                        Back to sign in
                    </Link>
                    <Link href="/forgot-password" className="text-slate-500 hover:underline">
                        Resend password reset
                    </Link>
                </div>
            </div>
        </main>
    );
}
