import { vi } from "vitest";
import type { createClient } from "@/lib/supabase/server";

/**
 * Fake Supabase client builder for tests.
 *
 * Supports the common chaining patterns used throughout the codebase:
 *   - from().select().order().range()           — paginated list reads
 *   - from().select().eq().single()             — single row reads
 *   - from().select().eq().maybeSingle()        — optional single row
 *   - from().select().in()                      — batch reads
 *   - from().insert()                           — inserts
 *   - from().update().eq()                      — updates
 *   - from().delete().eq()                      — deletes
 *   - from().select().eq().order().range()      — filtered + paginated
 *
 * Each method is a vi.fn() so tests can assert call arguments.
 */

type SupabaseResult<T = unknown> = { data: T; error: null } | { data: null; error: { message: string; code?: string } };
type FakeClient = Awaited<ReturnType<typeof createClient>>;

/** Result builder helpers */
function ok<T>(data: T): SupabaseResult<T> {
    return { data, error: null };
}

function err(message: string, code?: string): SupabaseResult<never> {
    return { data: null, error: { message, code } };
}

/**
 * Build a chainable query mock. Every method returns `this` (the proxy)
 * so chains resolve in any order. Terminal methods (single, maybeSingle, range,
 * then) resolve the configured result.
 */
function buildQueryChain(result: SupabaseResult) {
    const terminal = vi.fn().mockResolvedValue(result);

    const chain: Record<string, ReturnType<typeof vi.fn>> = {};

    // Every non-terminal method returns the chain itself
    const methods = [
        "select", "insert", "update", "upsert", "delete",
        "eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike",
        "is", "in", "not", "or", "filter",
        "order", "limit", "range", "offset",
        "single", "maybeSingle",
        "match", "contains", "containedBy", "overlaps",
        "textSearch",
    ];

    const proxy: Record<string, ReturnType<typeof vi.fn>> = {};

    for (const method of methods) {
        proxy[method] = vi.fn();
    }

    // Terminal methods resolve the result
    proxy.single.mockResolvedValue(result);
    proxy.maybeSingle.mockResolvedValue(result);
    proxy.range.mockResolvedValue(result);

    // Non-terminal methods return the proxy for chaining
    for (const method of methods) {
        if (!["single", "maybeSingle", "range"].includes(method)) {
            proxy[method].mockReturnValue(proxy);
        }
    }

    // Also make the chain itself thenable (for `await supabase.from(...).select(...)`)
    proxy.then = vi.fn().mockImplementation((resolve: (v: unknown) => void) => resolve(result));

    return proxy;
}

/**
 * Create a fake Supabase client that returns `rows` for any query chain.
 *
 * @example
 *   const client = fakeSupabaseClient([{ id: "1", name: "Test" }]);
 *   // client.from("any_table").select("*").order("id").range(0, 9)
 *   //   → { data: [{ id: "1", name: "Test" }], error: null }
 */
export function fakeSupabaseClient(rows: unknown[] = [], error: null | string = null): FakeClient {
    const result = error ? err(error) : ok(rows);
    const queryChain = buildQueryChain(result);

    const from = vi.fn().mockReturnValue(queryChain);
    const rpc = vi.fn().mockResolvedValue(result);

    // Auth mock
    const auth = {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
        getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    };

    return { from, rpc, auth } as unknown as FakeClient;
}

/**
 * Create a fake client that returns a single row (for `.single()` queries).
 */
export function fakeSupabaseSingle(row: unknown, error: null | string = null): FakeClient {
    const result = error ? err(error) : ok(row);
    const queryChain = buildQueryChain(result);
    const from = vi.fn().mockReturnValue(queryChain);
    const rpc = vi.fn().mockResolvedValue(result);
    const auth = {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
        getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    };
    return { from, rpc, auth } as unknown as FakeClient;
}

/**
 * Create a fake client where different tables return different data.
 *
 * @example
 *   const client = fakeSupabaseMultiTable({
 *     vendors: { rows: [{ id: "v1" }] },
 *     system_config: { row: { key: "token_expiry_days", value: "30", value_type: "number" } },
 *     tokens: { error: "not found" },
 *   });
 */
export function fakeSupabaseMultiTable(
    tables: Record<string, { rows?: unknown[]; row?: unknown; error?: string }>
): FakeClient {
    const from = vi.fn().mockImplementation((table: string) => {
        const config = tables[table];
        if (!config) {
            return buildQueryChain(ok([]));
        }
        if (config.error) {
            return buildQueryChain(err(config.error));
        }
        if (config.row !== undefined) {
            return buildQueryChain(ok(config.row));
        }
        return buildQueryChain(ok(config.rows ?? []));
    });

    const rpc = vi.fn().mockResolvedValue(ok(null));
    const auth = {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
        getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    };

    return { from, rpc, auth } as unknown as FakeClient;
}

/**
 * Create a fake client for insert/update/delete operations.
 * Returns the given data on success.
 */
export function fakeSupabaseWrite(returnData: unknown = null, error: null | string = null): FakeClient {
    const result = error ? err(error) : ok(returnData);
    const queryChain = buildQueryChain(result);
    const from = vi.fn().mockReturnValue(queryChain);
    const rpc = vi.fn().mockResolvedValue(result);
    const auth = {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
        getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    };
    return { from, rpc, auth } as unknown as FakeClient;
}
