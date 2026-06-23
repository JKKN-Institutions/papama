import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge middleware: refreshes the Supabase auth session on each request and
 * guards the admin area. Any unauthenticated hit to /admin/** is bounced to
 * /login (with a ?redirect back). Per-route authorization (the permission
 * matrix) still runs inside each API route via defineRoute — this is only the
 * coarse "are you signed in at all" gate plus token refresh.
 */
export async function middleware(request: NextRequest) {
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

    return response;
}

export const config = {
    matcher: ["/admin/:path*", "/donor/:path*"],
};
