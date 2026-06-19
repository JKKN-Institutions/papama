# Supabase Dashboard Integration - Quick Start

## 🚀 What's New

Your donor dashboard now fetches **real data from Supabase** with automatic fallback to mock data!

## 📋 Files Changed

| File | Change | Type |
|------|--------|------|
| `src/services/dashboardService.ts` | Fetch data from Supabase | **NEW** |
| `src/hooks/useDashboard.ts` | React hook for dashboard data | **NEW** |
| `src/services/apiClient.ts` | Use Supabase first | MODIFIED |
| `src/app/donor/dashboard/page.tsx` | Use new hook | MODIFIED |

## 🔄 Data Flow

```
User visits /donor/dashboard
            ↓
      useDashboard Hook
            ↓
   Try DashboardService (Supabase)
       ├─ donors table
       ├─ donations table
       └─ tokens table
            ↓
      Aggregate data
            ↓
   If Supabase fails → Use ApiClient (mock data)
            ↓
    Display Dashboard
```

## 💻 Usage

### Old Way
```typescript
const [dashboard, setDashboard] = useState(null);
useEffect(() => {
  ApiClient.getDashboard().then(setDashboard);
}, []);
```

### New Way
```typescript
const { dashboard, loading, error, refetch } = useDashboard('donor_001');
```

## ✨ Features

✅ **Real Supabase Data** - Queries actual database when available
✅ **Smart Fallback** - Uses mock data if Supabase unavailable
✅ **Error Handling** - Built-in error state with retry button
✅ **Loading States** - Spinner while fetching data
✅ **Type Safe** - Full TypeScript support
✅ **No Extra Dependencies** - Uses existing packages
✅ **Backward Compatible** - All existing code still works

## 🔧 Testing

### 1. Start Development Server
```bash
cd papama/donor
npm run dev
```

### 2. Visit Dashboard
```
http://localhost:3000/donor/dashboard
```

### 3. Check Browser Console
Should show dashboard data being fetched from Supabase.

### 4. Verify Supabase Connection
```bash
node check-db.js
```

## 📊 What Gets Displayed

The dashboard now shows:
- **Total Credits** - Available credits (₹)
- **Total Donations** - Total amount donated (₹)
- **Total Tokens** - Tokens generated
- **Meals Sponsored** - Number of meals funded
- **Monthly Summary** - Donations & meals by month
- **Donation History** - All donations made
- **Redemption History** - Where donations were used

## 🎯 Key Components

### DashboardService
**Location:** `src/services/dashboardService.ts`

Fetches aggregated data from Supabase:
```typescript
const dashboard = await DashboardService.getDashboardData('donor_001');
```

### useDashboard Hook
**Location:** `src/hooks/useDashboard.ts`

React hook that manages data fetching:
```typescript
const { dashboard, tokens, loading, error, refetch } = useDashboard('donor_001');
```

### Dashboard Page
**Location:** `src/app/donor/dashboard/page.tsx`

Uses the hook to display dashboard:
```typescript
const { dashboard, loading, error } = useDashboard('donor_001');
return loading ? <Spinner /> : <Dashboard data={dashboard} />;
```

## 🗄️ Database Tables Queried

1. **donors** - Gets: credits_balance, total_donated_tokens, impact_score
2. **donations** - Gets: all donations ordered by date
3. **tokens** - Gets: redeemed tokens for redemption history

## 📱 Error Handling

If something fails:
1. Error message displays
2. "Try Again" button appears
3. User can retry manually
4. Automatically falls back to mock data

```typescript
{error && (
  <div>
    <p>Error: {error.message}</p>
    <button onClick={refetch}>Try Again</button>
  </div>
)}
```

## 🔐 Security

- Uses Supabase Row-Level Security
- Anonymous key (public read only)
- Credentials not exposed in frontend
- Graceful fallback on auth failure

## 🌐 Configuration

Uses existing environment variables:
```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

If not set, automatically uses mock data.

## 📚 Documentation

- **SUPABASE_DASHBOARD_GUIDE.md** - Detailed architecture (recommended read)
- **SUPABASE_EXAMPLES.md** - 10+ code examples
- **SUPABASE_INTEGRATION_SUMMARY.md** - Complete overview
- **CHANGES_MADE.md** - Detailed change log

## ⚡ Performance

- Direct database queries (fast)
- Queries use indexed columns (donor_id, id, timestamp)
- Parallel queries (donations + tokens fetched together)
- Graceful fallback if network slow

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| Dashboard won't load | Check `.env.local` has Supabase URL |
| Showing mock data | Verify Supabase credentials are correct |
| Slow loading | Check Supabase project status |
| Error on page | Click "Try Again" or check console |

## ✅ Verification Checklist

- [ ] Dashboard page loads without errors
- [ ] Data displays (real or mock)
- [ ] Loading spinner shows while fetching
- [ ] Error state works with retry button
- [ ] No console errors
- [ ] `node check-db.js` succeeds

## 🎓 Next Steps

1. **Test it** - Visit `/donor/dashboard` and verify it loads
2. **Read guide** - Check `SUPABASE_DASHBOARD_GUIDE.md` for details
3. **Add features** - See `SUPABASE_EXAMPLES.md` for advanced usage
4. **Monitor** - Check Supabase dashboard for query performance

## 💡 Tips

- Dashboard auto-refreshes on data update events
- Can manually refetch with `refetch()` button
- Supports multiple donors if you change donorId
- Monthly summary automatically calculated from data

## 🚦 Status

✅ **Integration Complete**

The dashboard is now fully integrated with Supabase. Ready to use!

---

**Need Help?** Check the documentation files:
- Quick reference? → `SUPABASE_INTEGRATION_SUMMARY.md`
- Code examples? → `SUPABASE_EXAMPLES.md`
- How it works? → `SUPABASE_DASHBOARD_GUIDE.md`
- What changed? → `CHANGES_MADE.md`
