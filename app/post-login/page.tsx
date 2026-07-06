import { redirect } from "next/navigation";

import { getAppUser } from "@/lib/auth";
import { portalHomeForRole } from "@/lib/auth/portalRedirect";

/**
 * Neutral post-sign-in landing. The unified /login page sends users here (when
 * there's no explicit ?redirect) so their *real* role — resolved server-side via
 * getAppUser(), never the login tab they picked — decides where they land. Each
 * portal layout still enforces its own role check as defense-in-depth.
 */
export const dynamic = "force-dynamic";

export default async function PostLoginPage() {
    const user = await getAppUser();
    redirect(user ? portalHomeForRole(user.role) : "/login");
}
