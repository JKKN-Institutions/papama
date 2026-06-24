/**
 * Offline demo / mock-mode flag.
 *
 * When `NEXT_PUBLIC_USE_MOCK_API=true`, the donor portal runs entirely on the
 * in-browser mock database (lib/donor/services/apiClient.ts) and never touches
 * Supabase — so the app can be demoed with no database or network. This is the
 * single source of truth for that flag; both the API client and the donor
 * Supabase services honour it. See README → "Offline demo (mock mode)".
 */
export function isMockMode(): boolean {
    return process.env.NEXT_PUBLIC_USE_MOCK_API === "true";
}
