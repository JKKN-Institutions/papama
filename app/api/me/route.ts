import { NextResponse } from "next/server";

import { getAppUser } from "@/lib/auth";

/**
 * GET /api/me — the current authenticated app user (id, email, role, donor_id),
 * or 401 if not signed in. Powers the client-side AppUserProvider so the UI can
 * show only the actions the caller's role permits. No matrix feature gate: any
 * signed-in user may read their own identity (RLS still scopes the users row).
 */
export async function GET() {
    const user = await getAppUser();
    if (!user) {
        return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ user });
}
