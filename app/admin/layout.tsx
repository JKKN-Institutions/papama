import type { ReactNode } from "react";

import { AdminHeader } from "./AdminHeader";

/** Shell for every /admin page: shared header + a constrained content column. */
export default function AdminLayout({ children }: { children: ReactNode }) {
    return (
        <div className="min-h-screen bg-slate-50">
            <AdminHeader />
            <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
        </div>
    );
}
