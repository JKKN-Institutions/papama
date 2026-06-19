import { useEffect, useState } from 'react';
import { DashboardResponse, TokenItem } from '@/src/types/contract';
import { DashboardService } from '@/src/services/dashboardService';
import { TokenService } from '@/src/services/tokenService';
import { FoodToken, TokenStatus } from '@/src/types/token';
import { ApiClient } from '@/src/services/apiClient';

interface UseDashboardReturn {
  dashboard: DashboardResponse | null;
  tokens: TokenItem[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

function mapTokenStatus(status: TokenStatus): TokenItem['status'] {
  const statusMap: Record<TokenStatus, TokenItem['status']> = {
    unused: 'active',
    redeemed: 'redeemed',
    expired: 'expired',
    cancelled: 'invalidated',
  };
  return statusMap[status];
}

function mapFoodTokenToTokenItem(token: FoodToken): TokenItem {
  const issuedAt = token.mintedAt || new Date().toISOString();
  const expiresAt = token.mintedAt
    ? new Date(new Date(token.mintedAt).getTime() + 90 * 24 * 60 * 60 * 1000).toISOString()
    : new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

  return {
    token_id: token.id,
    qr_payload: `PAPAMA:TOKEN:${token.id}:sig`,
    type: token.isSpecialCare ? 'special_care' : 'standard',
    status: mapTokenStatus(token.status),
    value: 50,
    issued_at: issuedAt,
    expires_at: expiresAt,
    redeemed_at: token.redeemedAt || null,
    vendor_name: token.beneficiaryName,
    location: token.redemptionLocation,
    meal_info: token.mealType,
    beneficiary_category: 'patient',
    is_special_care: token.isSpecialCare,
    special_instructions: token.specialInstructions,
  };
}

export function useDashboard(donorId: string = 'donor_001'): UseDashboardReturn {
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [tokens, setTokens] = useState<TokenItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch dashboard data from Supabase
      const dashboardData = await DashboardService.getDashboardData(donorId);
      setDashboard(dashboardData);

      // Fetch tokens from Supabase and map to TokenItem
      const tokensData = await TokenService.getTokens();
      const mappedTokens = tokensData.map(mapFoodTokenToTokenItem);
      setTokens(mappedTokens);
    } catch (err) {
      console.warn('Supabase fetch failed, falling back to API/mock:', err);

      try {
        // Fall back to API client
        const [dashboardData, tokensResponse] = await Promise.all([
          ApiClient.getDashboard(donorId),
          ApiClient.getTokens(),
        ]);

        setDashboard(dashboardData);
        setTokens(tokensResponse.tokens);
      } catch (apiErr) {
        const error = apiErr instanceof Error ? apiErr : new Error('Failed to fetch dashboard');
        setError(error);
        console.error('Failed to fetch dashboard data:', error);
      }
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
  }, [donorId]);

  return {
    dashboard,
    tokens,
    loading,
    error,
    refetch: fetchData,
  };
}
