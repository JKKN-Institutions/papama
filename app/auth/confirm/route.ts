import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Email confirmation / recovery callback — the @supabase/ssr `token_hash` flow.
 *
 * Supabase email links must point at THIS route, e.g. the confirm-signup template
 * becomes:
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/
 * and the recovery template:
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/update-password
 *
 * The DEFAULT hosted templates use `{{ .ConfirmationURL }}` (the implicit flow,
 * tokens in the URL hash) which never hits this server route — update them in
 * Dashboard → Authentication → Email Templates for confirmation to work here.
 *
 * On success `verifyOtp` sets the session cookies (route handlers may write
 * cookies) and we redirect to `next`; otherwise we send the user to the
 * auth-error page.
 */
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const token_hash = searchParams.get("token_hash");
    const type = searchParams.get("type") as EmailOtpType | null;
    const next = searchParams.get("next") ?? "/";

    // Redirect on the same origin, stripping the one-time auth params so they
    // never leak into application URLs.
    const redirectTo = request.nextUrl.clone();
    redirectTo.searchParams.delete("token_hash");
    redirectTo.searchParams.delete("type");
    redirectTo.searchParams.delete("next");

    if (token_hash && type) {
        const supabase = await createClient();
        const { error } = await supabase.auth.verifyOtp({ type, token_hash });
        if (!error) {
            redirectTo.pathname = next;
            return NextResponse.redirect(redirectTo);
        }
    }

    redirectTo.pathname = "/auth/auth-code-error";
    return NextResponse.redirect(redirectTo);
}
