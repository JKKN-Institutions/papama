// Test stub for the `server-only` import guard. In the Next.js runtime that
// package throws if pulled into a client bundle; under vitest (node) we alias it
// to this no-op so server modules (handler, audit, supabase/admin) can be imported.
export {};
