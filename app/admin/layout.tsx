import type { ReactNode } from "react";

import Link from "next/link";
import { redirect } from "next/navigation";

import { AppUserProvider } from "@/components/auth/AppUserProvider";
import { BugReporterWrapper } from "@/components/bug-reporter-wrapper";
import { getAppUser } from "@/lib/auth";
import { isAdminConsoleRole } from "@/lib/permissions";

import { AdminHeader } from "./AdminHeader";
import { ToastHost } from "./_ui";

/**
 * Shell for every /admin page. Server-side gate (defense beyond middleware,
 * which only checks "signed in?"):
 *   - not signed in        → redirect to /login
 *   - signed in, non-staff → Access Denied (no admin chrome leaked)
 *   - staff                → render the console, seeding AppUserProvider with the
 *     already-resolved user so client pages can gate actions via useCan().
 * Per-feature authorization still runs in each API route and in RLS.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
    const user = await getAppUser();

    if (!user) {
        redirect("/login?redirect=/admin");
    }

    if (!isAdminConsoleRole(user.role)) {
        return <AccessDenied role={user.role} />;
    }

    return (
        <AppUserProvider user={user}>
            <BugReporterWrapper>
                <div className="min-h-screen bg-slate-50">
                    <AdminHeader />
                    {/* Mounted once here so every admin page's useToast() works
                        without a per-page <ToastHost> wrapper. */}
                    <ToastHost>
                        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
                    </ToastHost>
                </div>
            </BugReporterWrapper>
        </AppUserProvider>
    );
}

function AccessDenied({ role }: { role: string }) {
    return (
        <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
            <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
                <h1 className="text-xl font-semibold text-slate-900">Access denied</h1>
                <p className="mt-2 text-sm text-slate-500">
                    The admin console is restricted to staff accounts. Your role
                    (<span className="font-medium text-slate-700">{role}</span>) does not
                    have access.
                </p>
                <Link
                    href="/"
                    className="mt-6 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
                >
                    Go home
                </Link>
            </div>
        </main>
    );
}
