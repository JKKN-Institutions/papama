# Supabase Dashboard Integration Guide

This guide explains how the donor dashboard is now connected to Supabase with graceful fallback to mock data.

## Architecture Overview

```
Dashboard Page (page.tsx)
    ↓
useDashboard Hook
    ├── Try Supabase First
    │   ├── DashboardService
    │   └── TokenService
    └── Fallback to API/Mock
        └── ApiClient
```

## Components

### 1. **DashboardService** (`src/services/dashboardService.ts`)
Core service that fetches data directly from Supabase tables.

**Key Methods:**
- `getDashboardData(donorId)` - Fetches aggregated dashboard data from Supabase

**Data Flow:**
```typescript
// Fetch from Supabase tables
const donor = await supabase.from('donors').select('*').eq('id', donorId).single()
const donations = await supabase.from('donations').select('*').eq('donor_id', donorId)
const tokens = await supabase.from('tokens').select('*').eq('donation_id', [...])

// Aggregate into DashboardResponse
return {
  total_credit: donor.credits_balance,
  total_donations: sum(donations.fiat_amount),
  total_tokens: donor.total_donated_tokens,
  meals_sponsored: count(redeemed tokens),
  monthly_summary: buildMonthlySummary(donations, tokens),
  donation_history: donations,
  redemption_history: redeemed_tokens,
}
```

### 2. **useDashboard Hook** (`src/hooks/useDashboard.ts`)
Custom React hook for fetching dashboard data with error handling and loading states.

**Features:**
- Tries Supabase first
- Falls back to API/mock on failure
- Handles loading and error states
- Auto-refetch on data updates
- Manual refetch capability

**Usage:**
```typescript
const { dashboard, tokens, loading, error, refetch } = useDashboard('donor_001');

if (loading) return <LoadingSpinner />;
if (error) return <ErrorComponent error={error} onRetry={refetch} />;
return <Dashboard data={dashboard} tokens={tokens} />;
```

### 3. **Updated ApiClient** (`src/services/apiClient.ts`)
Modified to use Supabase when available.

```typescript
async getDashboard(donorId: string = 'donor_001'): Promise<DashboardResponse> {
  // Try Supabase first
  try {
    return await DashboardService.getDashboardData(donorId);
  } catch (err) {
    // Fall back to API request (which uses mock data)
    return apiRequest<DashboardResponse>('/api/donor/dashboard', { method: 'GET' });
  }
}
```

### 4. **Updated Dashboard Page** (`src/app/donor/dashboard/page.tsx`)
Simplified to use the new hook.

```typescript
export default function DashboardPage() {
  const { dashboard, tokens, loading, error, refetch } = useDashboard('donor_001');
  
  return (
    <div>
      {loading && <LoadingSpinner />}
      {error && <ErrorMessage error={error} onRetry={refetch} />}
      {dashboard && <DashboardOverview dashboard={dashboard} tokens={tokens} />}
    </div>
  );
}
```

## Data Flow Example

### Scenario 1: Supabase Connected
```
User visits /donor/dashboard
    ↓
useDashboard('donor_001') hook initializes
    ↓
DashboardService.getDashboardData('donor_001')
    ↓
Supabase queries:
  1. SELECT * FROM donors WHERE id = 'donor_001'
  2. SELECT * FROM donations WHERE donor_id = 'donor_001'
  3. SELECT * FROM tokens WHERE donation_id IN (...)
    ↓
Data aggregated into DashboardResponse
    ↓
Dashboard rendered with real data
```

### Scenario 2: Supabase Unavailable
```
User visits /donor/dashboard
    ↓
useDashboard('donor_001') hook initializes
    ↓
DashboardService.getDashboardData() throws error
    ↓
Fallback to ApiClient.getDashboard()
    ↓
Mock data returned from localStorage
    ↓
Dashboard rendered with mock data
```

## Database Tables Queried

The dashboard service queries these tables:

### **donors**
```sql
SELECT id, credits_balance, total_donated_tokens, impact_score
FROM donors
WHERE id = $1;
```

### **donations**
```sql
SELECT id, token_amount, fiat_amount, timestamp
FROM donations
WHERE donor_id = $1
ORDER BY timestamp DESC;
```

### **tokens**
```sql
SELECT id, status, redeemed_at, beneficiary_name, meal_type, redemption_location, campaign_title
FROM tokens
WHERE donation_id IN (SELECT id FROM donations WHERE donor_id = $1)
ORDER BY minted_at DESC;
```

## Type Definitions

### DashboardResponse (from `src/types/contract.ts`)
```typescript
interface DashboardResponse {
  total_credit: number;              // Available credits (INR)
  total_donations: number;           // Total donated (INR)
  total_tokens: number;              // Total tokens generated
  meals_sponsored: number;           // Redeemed tokens count
  monthly_summary: MonthlySummaryItem[];
  donation_history: DashboardDonationHistoryItem[];
  redemption_history: RedemptionHistoryItem[];
}

interface MonthlySummaryItem {
  month: string;                     // "YYYY-MM"
  donated: number;                   // Amount donated that month
  meals: number;                     // Meals redeemed that month
}

interface DashboardDonationHistoryItem {
  id: string;
  amount: number;                    // Fiat amount (INR)
  at: string;                        // Timestamp
}

interface RedemptionHistoryItem {
  token_id: string;
  vendor_name: string;
  location: string;
  time: string;                      // Redemption timestamp
  meal_info: string;                 // e.g., "Hot Rava Pongal & Sambar"
  beneficiary_category: string;
}
```

## Error Handling

The system handles errors gracefully:

1. **Supabase Connection Error** → Falls back to API/mock
2. **Missing Environment Variables** → Uses mock data
3. **Row-Level Security Violation** → Falls back to mock
4. **Network Error** → Retryable with `refetch()` button

## Testing

### Test with Supabase
```typescript
// Set environment variables
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

// Should fetch real data from database
```

### Test with Mock Data
```typescript
// Unset environment variables or set to empty strings
// Should fallback to mock data

// Or use the mock API
NEXT_PUBLIC_USE_MOCK_API=true
```

## Adding More Dashboard Data

To add more data to the dashboard:

1. **Add query to `DashboardService.getDashboardData()`:**
```typescript
const { data: customData } = await supabase
  .from('custom_table')
  .select('*')
  .eq('donor_id', donorId);
```

2. **Extend `DashboardResponse` type** in `src/types/contract.ts`

3. **Update aggregation logic** in `buildMonthlySummary()` or add new methods

4. **Component automatically re-renders** with new data

## Performance Considerations

1. **Parallel Queries** - Donations and tokens are fetched in parallel (if possible)
2. **Indexed Queries** - Queries use indexed columns (donor_id, id, timestamp)
3. **Row-Level Security** - Built-in at database level
4. **Lazy Loading** - Data fetched on-demand, not preloaded

## Environment Setup

Ensure these variables are set in `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://qxdxefofeykzvegykitt.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

Verify connection with:
```bash
node check-db.js
```

## Next Steps

1. ✅ Dashboard now uses Supabase when available
2. Test with real data in your Supabase instance
3. Monitor query performance in Supabase dashboard
4. Add RLS policies if needed for multi-user support
5. Consider caching for frequently accessed data

## Troubleshooting

### Dashboard shows "Failed to load"
1. Check `.env.local` has correct Supabase credentials
2. Verify donor with ID 'donor_001' exists in database
3. Check browser console for error details
4. Run `node check-db.js` to verify connection

### Mock data showing instead of Supabase data
1. Verify Supabase is configured in environment
2. Check network tab in browser dev tools
3. Confirm Supabase tables have data
4. Check Row-Level Security policies

### Slow dashboard load
1. Check Supabase query performance in dashboard
2. Add database indexes if needed
3. Consider pagination for large datasets
4. Monitor network requests
