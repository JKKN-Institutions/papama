import { useEffect, useState } from 'react';
import { DashboardResponse, TokenItem } from '@/lib/donor/types/contract';
import { DashboardService } from '@/lib/donor/services/dashboardService';
import { TokenService } from '@/lib/donor/services/tokenService';
import { FoodToken, TokenStatus, STATUS_MAPPING } from '@/lib/donor/types/token';
import { ApiClient } from '@/lib/donor/services/apiClient';
import { getCurrentDonorId } from '@/lib/donor/auth';

interface UseDashboardReturn {
  dashboard: DashboardResponse | null;
  tokens: TokenItem[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

function mapTokenStatus(status: string | TokenStatus): TokenItem['status'] {
  // Map new statuses to contract statuses
  const statusMap: Record<string, TokenItem['status']> = {
    [TokenStatus.GENERATED]: 'generated',
    [TokenStatus.LIVE]: 'live',
    [TokenStatus.IN_ADMIN_POOL]: 'in_admin_pool',
    [TokenStatus.ASSIGNED_TO_VOLUNTEER]: 'assigned_to_volunteer',
    [TokenStatus.DISTRIBUTED]: 'distributed',
    [TokenStatus.REDEEMED]: 'redeemed',
    [TokenStatus.EXPIRED]: 'expired',
    // Legacy status mappings
    'unused': 'live',
    'cancelled': 'expired',
    'active': 'live',
    'invalidated': 'expired',
  };

  return (statusMap[status] || status) as TokenItem['status'];
}

function mapFoodTokenToTokenItem(token: FoodToken): TokenItem {
  const issuedAt = token.mintedAt || new Date().toISOString();
  const expiresAt = token.expiresAt ||
    (token.mintedAt
      ? new Date(new Date(token.mintedAt).getTime() + 90 * 24 * 60 * 60 * 1000).toISOString()
      : new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString());

  // Convert value from paise to INR for display (if available)
  const valueInINR = token.value ? Math.round((token.value / 100) * 100) / 100 : 50;

  return {
    token_id: token.id,
    qr_payload: token.qrPayload || `PAPAMA:TOKEN:${token.id}:sig`,
    type: token.tokenType === 'special_care' || token.isSpecialCare ? 'special_care' : 'standard',
    status: mapTokenStatus(token.status),
    value: valueInINR,
    issued_at: issuedAt,
    expires_at: expiresAt,
    redeemed_at: token.redeemedAt || null,
    vendor_name: token.beneficiaryName,
    location: token.redemptionLocation,
    meal_info: token.mealType,
    beneficiary_category: 'patient',
    is_special_care: token.isSpecialCare,
    special_instructions: token.specialInstructions,
    current_holder_type: token.currentHolderType,
    current_holder_id: token.currentHolderId,
  };
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
      // Signed-in donor → real data from Supabase (RLS-scoped to them).
      if (donorId) {
        try {
          const dashboardData = await DashboardService.getDashboardData(donorId);
          const tokensData = await TokenService.getTokens();
          setDashboard(dashboardData);
          setTokens(tokensData.map(mapFoodTokenToTokenItem));
          return;
        } catch (err) {
          console.warn('Supabase fetch failed, falling back to API/mock:', err);
        }
      }

      // Guest (no donor session) or a Supabase failure → API/mock path. We never
      // pass a non-UUID id to Supabase, so guests no longer trigger 22P02 errors.
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
