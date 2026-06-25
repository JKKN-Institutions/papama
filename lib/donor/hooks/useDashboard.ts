import { useEffect, useState } from 'react';
import { DashboardResponse, TokenItem } from '@/lib/donor/types/contract';
import { ApiClient } from '@/lib/donor/services/apiClient';
import { getCurrentDonorId } from '@/lib/donor/auth';

interface UseDashboardReturn {
  dashboard: DashboardResponse | null;
  tokens: TokenItem[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useDashboard(): UseDashboardReturn {
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [tokens, setTokens] = useState<TokenItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);

    // Identity from the Supabase Auth session; null when browsing as a guest.
    const donorId = await getCurrentDonorId();

    try {
      // Always go through ApiClient. For a signed-in donor it hits the governed
      // same-origin routes (GET /api/donor/dashboard + /api/donor/tokens), which
      // return REAL vendor/meal/location/category and the at-rest HMAC QR — RLS
      // scopes every row to this donor server-side. ApiClient keeps the Supabase
      // DashboardService only as its own last-resort fallback, and serves the
      // in-browser mock DB when NEXT_PUBLIC_USE_MOCK_API==='true'. (We no longer
      // prefer the legacy stub here, which mislabeled redemptions as
      // vendor_name:'Vendor' / beneficiary_category:'patient'.)
      const [dashboardData, tokensResponse] = await Promise.all([
        ApiClient.getDashboard(donorId ?? undefined),
        ApiClient.getTokens(),
      ]);
      setDashboard(dashboardData);
      setTokens(tokensResponse.tokens);
    } catch (apiErr) {
      const error = apiErr instanceof Error ? apiErr : new Error('Failed to fetch dashboard');
      setError(error);
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    // Listen for data updates from other components
    const handleDataUpdate = () => {
      fetchData();
    };

    window.addEventListener('papama_data_update', handleDataUpdate);
    return () => {
      window.removeEventListener('papama_data_update', handleDataUpdate);
    };
  }, []);

  return {
    dashboard,
    tokens,
    loading,
    error,
    refetch: fetchData,
  };
}
