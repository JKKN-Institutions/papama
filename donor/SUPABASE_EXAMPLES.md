# Supabase Integration Examples

## Example 1: Basic Dashboard Usage

### Before (Mock Data Only)
```typescript
// src/app/donor/dashboard/page.tsx
export default function DashboardPage() {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    ApiClient.getDashboard().then(setDashboard).finally(() => setLoading(false));
  }, []);

  return loading ? <Spinner /> : <Dashboard data={dashboard} />;
}
```

### After (Supabase + Mock Fallback)
```typescript
// src/app/donor/dashboard/page.tsx
export default function DashboardPage() {
  const { dashboard, loading, error, refetch } = useDashboard('donor_001');

  return (
    <div>
      {loading && <Spinner />}
      {error && <Error onRetry={refetch} />}
      {dashboard && <Dashboard data={dashboard} />}
    </div>
  );
}
```

**Benefits:**
- ✅ Real data from Supabase when available
- ✅ Automatic fallback to mock data
- ✅ Error handling built-in
- ✅ Retry functionality
- ✅ Less boilerplate code

---

## Example 2: Fetching Dashboard Data Directly

If you want to fetch dashboard data without the hook:

```typescript
import { DashboardService } from '@/src/services/dashboardService';

async function loadDashboard() {
  try {
    const dashboard = await DashboardService.getDashboardData('donor_001');
    console.log('Total donations:', dashboard.total_donations);
    console.log('Meals sponsored:', dashboard.meals_sponsored);
  } catch (err) {
    console.error('Failed to fetch dashboard:', err);
  }
}
```

---

## Example 3: Building on Supabase Data

Create a new component that extends dashboard functionality:

```typescript
// src/components/donor/ImpactMetrics.tsx
import { useDashboard } from '@/src/hooks/useDashboard';

export default function ImpactMetrics() {
  const { dashboard } = useDashboard('donor_001');

  if (!dashboard) return <div>Loading...</div>;

  // Calculate impact metrics from Supabase data
  const mealsPerDonation = dashboard.meals_sponsored / (dashboard.total_donations / 100);
  const impactScore = dashboard.meals_sponsored * 10; // Each meal = 10 points

  return (
    <div>
      <h3>Your Impact</h3>
      <p>Meals Sponsored: {dashboard.meals_sponsored}</p>
      <p>Impact Score: {impactScore}</p>
      <p>Efficiency: {mealsPerDonation.toFixed(2)} meals/₹100</p>
    </div>
  );
}
```

---

## Example 4: Real-Time Data Updates

Add live updates when tokens are redeemed:

```typescript
import { useDashboard } from '@/src/hooks/useDashboard';
import { useEffect } from 'react';
import { supabase } from '@/src/services/supabase';

export default function LiveDashboard() {
  const { dashboard, refetch } = useDashboard('donor_001');

  useEffect(() => {
    if (!supabase) return;

    // Subscribe to token redemptions
    const subscription = supabase
      .from('tokens')
      .on('UPDATE', (payload) => {
        if (payload.new.status === 'redeemed') {
          // Token was redeemed, refresh dashboard
          refetch();
          console.log('Token redeemed, dashboard updated!');
        }
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [refetch]);

  return <div>{dashboard && <Dashboard data={dashboard} />}</div>;
}
```

---

## Example 5: Monthly Statistics from Supabase

Use the monthly summary data to create charts:

```typescript
import { useDashboard } from '@/src/hooks/useDashboard';

export default function MonthlySummary() {
  const { dashboard } = useDashboard('donor_001');

  return (
    <div>
      <h3>Donations by Month</h3>
      {dashboard?.monthly_summary.map((month) => (
        <div key={month.month}>
          <span>{month.month}</span>
          <span>₹{month.donated}</span>
          <span>{month.meals} meals</span>
        </div>
      ))}
    </div>
  );
}
```

---

## Example 6: Redemption History from Supabase

Display where donations were used:

```typescript
import { useDashboard } from '@/src/hooks/useDashboard';

export default function RedemptionHistory() {
  const { dashboard } = useDashboard('donor_001');

  return (
    <div>
      <h3>Where Your Donations Were Used</h3>
      {dashboard?.redemption_history.map((redemption) => (
        <div key={redemption.token_id}>
          <h4>{redemption.vendor_name}</h4>
          <p>📍 {redemption.location}</p>
          <p>🍛 {redemption.meal_info}</p>
          <p>👥 {redemption.beneficiary_category}</p>
          <p>⏰ {new Date(redemption.time).toLocaleDateString()}</p>
        </div>
      ))}
    </div>
  );
}
```

---

## Example 7: Query Dashboard Data Manually

For advanced use cases, query Supabase directly:

```typescript
import { supabase } from '@/src/services/supabase';

async function getHighValueDonations() {
  const { data, error } = await supabase
    .from('donations')
    .select('*')
    .eq('donor_id', 'donor_001')
    .gte('fiat_amount', 1000) // > ₹1000
    .order('fiat_amount', { ascending: false });

  if (error) {
    console.error('Query failed:', error);
    return [];
  }

  return data;
}

// Usage
const bigDonations = await getHighValueDonations();
console.log(`Made ${bigDonations.length} donations over ₹1000`);
```

---

## Example 8: Handle Supabase & Mock Data Gracefully

```typescript
import { DashboardService } from '@/src/services/dashboardService';
import { ApiClient } from '@/src/services/apiClient';

async function fetchDashboardSafely() {
  // Try Supabase first
  try {
    return await DashboardService.getDashboardData('donor_001');
  } catch (supabaseErr) {
    console.log('Supabase unavailable, using fallback');

    // Fall back to API/mock
    try {
      return await ApiClient.getDashboard('donor_001');
    } catch (apiErr) {
      console.error('All data sources failed:', apiErr);
      throw new Error('Failed to load dashboard data');
    }
  }
}

// Usage
const dashboard = await fetchDashboardSafely();
```

---

## Example 9: Multi-Donor Dashboard Admin View

Fetch dashboard for multiple donors:

```typescript
import { DashboardService } from '@/src/services/dashboardService';

async function getMultipleDonorDashboards(donorIds: string[]) {
  const dashboards = await Promise.all(
    donorIds.map((id) => 
      DashboardService.getDashboardData(id).catch(() => null)
    )
  );

  return dashboards.filter(Boolean);
}

// Usage
const adminView = await getMultipleDonorDashboards([
  'donor_001',
  'donor_002',
  'donor_003'
]);

console.log(`${adminView.length} donors loaded`);
```

---

## Example 10: Aggregate Dashboard Data

Combine data from multiple donors for insights:

```typescript
import { DashboardService } from '@/src/services/dashboardService';

async function getSystemwideStats() {
  const donor = await DashboardService.getDashboardData('donor_001');

  return {
    totalDonated: donor.total_donations,
    totalMeals: donor.meals_sponsored,
    averageDonationValue: donor.total_donations / donor.total_tokens,
    topMonth: donor.monthly_summary.reduce((max, current) =>
      current.donated > max.donated ? current : max
    ),
  };
}

// Usage
const stats = await getSystemwideStats();
console.log(`System-wide: ${stats.totalMeals} meals from ₹${stats.totalDonated}`);
```

---

## Data Structure Reference

### Dashboard Object from Supabase
```typescript
{
  total_credit: 150,
  total_donations: 1200,
  total_tokens: 12,
  meals_sponsored: 12,
  monthly_summary: [
    { month: '2026-05', donated: 400, meals: 4 },
    { month: '2026-06', donated: 800, meals: 8 }
  ],
  donation_history: [
    { id: 'don_101', amount: 600, at: '2026-06-11T12:30:00Z' },
    { id: 'don_102', amount: 600, at: '2026-06-14T15:00:00Z' }
  ],
  redemption_history: [
    {
      token_id: 'tok_001',
      vendor_name: 'Anna Canteen',
      location: 'T. Nagar, Chennai',
      time: '2026-06-17T13:00:00Z',
      meal_info: 'Lunch — Veg Thali',
      beneficiary_category: 'pregnant_women'
    }
  ]
}
```

---

## Testing Examples

### Test 1: Verify Supabase Connection
```bash
cd papama/donor
node check-db.js
```

### Test 2: Debug Dashboard Data
```typescript
import { useDashboard } from '@/src/hooks/useDashboard';

export default function DebugDashboard() {
  const { dashboard, loading, error } = useDashboard('donor_001');

  return (
    <pre>
      Loading: {loading.toString()}
      Error: {error?.message}
      Data: {JSON.stringify(dashboard, null, 2)}
    </pre>
  );
}
```

### Test 3: Check Fallback
```typescript
// Temporarily disable Supabase
const DashboardService = {
  getDashboardData: async () => {
    throw new Error('Simulated Supabase failure');
  }
};

// Should automatically fall back to mock data
```

---

## Performance Tips

1. **Cache Results**: Save dashboard data in state to avoid refetching
2. **Use Filters**: Query only needed date ranges
3. **Pagination**: Limit donation history to last N items
4. **Indexes**: Ensure `donor_id`, `id`, `timestamp` are indexed
5. **RLS Policies**: Keep Row-Level Security policies tight

---

## Troubleshooting Checklist

- [ ] `.env.local` has valid Supabase URL and key
- [ ] Donor with ID 'donor_001' exists in database
- [ ] Donations and tokens exist for this donor
- [ ] `check-db.js` runs successfully
- [ ] Network tab shows successful Supabase requests
- [ ] No CORS errors in browser console
- [ ] RLS policies allow public read access
