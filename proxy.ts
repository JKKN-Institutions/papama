import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge proxy (Next.js 16 — renamed from `middleware`): refreshes the Supabase
 * auth session on each request and guards the authenticated areas. Any
 * unauthenticated hit to a portal is bounced to that portal's login (with a
 * ?redirect back), except each portal's own public auth pages. Per-route
 * authorization (the permission matrix) still runs inside each API route via
 * defineRoute — this is only the coarse "are you signed in at all" gate + token
 * refresh.
 */
export async function proxy(request: NextRequest) {
    let response = NextResponse.next({ request });

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll();
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) =>
                        request.cookies.set(name, value)
                    );
                    response = NextResponse.next({ request });
                    cookiesToSet.forEach(({ name, value, options }) =>
                        response.cookies.set(name, value, options)
                    );
                },
            },
        }
    );

    const {
        data: { user },
    } = await supabase.auth.getUser();

    const { pathname } = request.nextUrl;

    // Admin area: any unauthenticated hit bounces to the admin /login.
    if (!user && pathname.startsWith("/admin")) {
        const url = request.nextUrl.clone();
        url.pathname = "/login";
        url.searchParams.set("redirect", pathname);
        return NextResponse.redirect(url);
    }

    // Donor portal: guarded too, except its own auth pages (avoid redirect loop).
    // The public /donate and /donate/qr pages are NOT under /donor and stay open.
    const donorAuthPages = ["/donor/login", "/donor/signup"];
    if (
        !user &&
        pathname.startsWith("/donor") &&
        !donorAuthPages.includes(pathname)
    ) {
        const url = request.nextUrl.clone();
        url.pathname = "/donor/login";
        url.searchParams.set("redirect", pathname);
        return NextResponse.redirect(url);
    }

    // Vendor portal: guarded too, except its own auth pages — login AND the
    // self-service /vendor/register page must be reachable signed-out.
    const vendorPublicPages = ["/vendor/login", "/vendor/register"];
    if (!user && pathname.startsWith("/vendor") && !vendorPublicPages.includes(pathname)) {
        const url = request.nextUrl.clone();
        url.pathname = "/vendor/login";
        url.searchParams.set("redirect", pathname);
        return NextResponse.redirect(url);
    }

    // Volunteer portal: guarded too, except its public auth pages — login AND the
    // self-service /volunteer/register page must be reachable signed-out (mirrors
    // the vendor rule above).
    const volunteerPublicPages = ["/volunteer/login", "/volunteer/register"];
    if (!user && pathname.startsWith("/volunteer") && !volunteerPublicPages.includes(pathname)) {
        const url = request.nextUrl.clone();
        url.pathname = "/volunteer/login";
        url.searchParams.set("redirect", pathname);
        return NextResponse.redirect(url);
    }

    return response;
}

export const config = {
    matcher: ["/admin/:path*", "/donor/:path*", "/vendor/:path*", "/volunteer/:path*"],
};
