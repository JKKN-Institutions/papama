import { NextRequest } from "next/server";

/**
 * Helpers for testing Next.js App Router route handlers.
 *
 * Route handlers in this project have the signature:
 *   (req: NextRequest, segment?: { params?: Promise<P> | P }) => Promise<NextResponse>
 */

type RouteHandler = (req: NextRequest, segment?: { params?: Promise<Record<string, string>> }) => Promise<Response>;

/**
 * Build a NextRequest for testing a route handler.
 *
 * @param url  — Full URL string (e.g. "http://localhost/api/admin/vendors")
 * @param options — RequestInit options (method, body, headers)
 */
export function makeRequest(
    url: string,
    options?: {
        method?: string;
        body?: Record<string, unknown>;
        searchParams?: Record<string, string>;
    }
): NextRequest {
    const urlObj = new URL(url);
    if (options?.searchParams) {
        for (const [key, value] of Object.entries(options.searchParams)) {
            urlObj.searchParams.set(key, value);
        }
    }

    const init: RequestInit = { method: options?.method ?? "GET" };

    if (options?.body) {
        init.method = options.method ?? "POST";
        init.body = JSON.stringify(options.body);
        init.headers = { "Content-Type": "application/json" };
    }

    return new NextRequest(urlObj, init);
}

/**
 * Call a route handler and return the parsed response.
 *
 * @example
 *   const { status, body } = await callRoute(GET, "/api/admin/vendors");
 *   expect(status).toBe(200);
 *   expect(body.vendors).toHaveLength(1);
 */
export async function callRoute(
    handler: RouteHandler,
    url: string,
    options?: {
        method?: string;
        body?: Record<string, unknown>;
        searchParams?: Record<string, string>;
        params?: Record<string, string>;
    }
): Promise<{ status: number; body: Record<string, unknown> }> {
    const req = makeRequest(url, options);
    const segment = options?.params ? { params: Promise.resolve(options.params) } : undefined;
    const res = await handler(req, segment);

    let body: Record<string, unknown>;
    try {
        body = await res.json();
    } catch {
        body = {};
    }

    return { status: res.status, body };
}

/**
 * Shortcut: call a GET route.
 */
export async function callGet(
    handler: RouteHandler,
    url: string,
    searchParams?: Record<string, string>
): Promise<{ status: number; body: Record<string, unknown> }> {
    return callRoute(handler, url, { method: "GET", searchParams });
}

/**
 * Shortcut: call a POST route with a JSON body.
 */
export async function callPost(
    handler: RouteHandler,
    url: string,
    body: Record<string, unknown>,
    params?: Record<string, string>
): Promise<{ status: number; body: Record<string, unknown> }> {
    return callRoute(handler, url, { method: "POST", body, params });
}

/**
 * Shortcut: call a PATCH route with a JSON body.
 */
export async function callPatch(
    handler: RouteHandler,
    url: string,
    body: Record<string, unknown>,
    params?: Record<string, string>
): Promise<{ status: number; body: Record<string, unknown> }> {
    return callRoute(handler, url, { method: "PATCH", body, params });
}
