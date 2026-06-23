# How to Apply Database Schema - Step by Step

**Status:** ⚠️ Database schema has NOT been applied yet.

The code is ready, but the database tables don't exist. You must apply the schema before testing.

---

## ✅ Option 1: Via Supabase Dashboard (Easiest)

### Step 1: Open SQL Editor
Go to: https://supabase.com/dashboard/project/qxdxefofeykzvegykitt/sql/new

### Step 2: Open Schema File
The schema file is at: `papama/donor/supabase/schema.sql`

### Step 3: Copy Schema
Open the file and copy **ALL** contents (all 353 lines)

### Step 4: Paste in SQL Editor
Paste the entire schema into the Supabase SQL editor

### Step 5: Run
Click the **"Run"** button (or press Ctrl+Enter)

### Step 6: Wait
The script will create:
- ✅ 12 database tables
- ✅ Row-Level Security policies
- ✅ Test data (1 donor + test records)

Expected time: 10-30 seconds

### Step 7: Verify
Run in terminal:
```bash
node check-db.js
```

Expected output:
```
✅ Anon client test success! Found donors: [...]
✅ Service role client test success! Found donors: [...]
```

---

## ✅ Option 2: Via Supabase CLI

### Prerequisite: Install Supabase CLI
```bash
brew install supabase/tap/supabase  # macOS
# OR
npm install -g supabase              # All platforms
```

### Step 1: Link Project
```bash
cd papama/donor
supabase link --project-ref qxdxefofeykzvegykitt
```

### Step 2: Push Schema
```bash
supabase db push
```

### Step 3: Verify
```bash
node check-db.js
```

---

## ✅ Option 3: Manual SQL Execution

If above options don't work, run this SQL in Supabase dashboard:

### 1. Create Donors Table
```sql
create table if not exists donors (
  id text primary key,
  name text not null,
  email text not null unique,
  avatar_url text,
  credits_balance integer not null default 0,
  total_donated_tokens integer not null default 0,
  impact_score integer not null default 0,
  joined_date date not null default current_date,
  created_at timestamptz not null default now()
);
```

### 2. Create Donations Table
```sql
create table if not exists donations (
  id text primary key,
  donor_id text not null references donors(id) on delete cascade default 'donor_001',
  token_type_id text not null,
  campaign_title text not null,
  token_amount integer not null,
  fiat_amount integer not null,
  status text not null default 'completed',
  timestamp timestamptz not null default now(),
  transaction_hash text
);
```

### 3. Create Tokens Table
```sql
create table if not exists tokens (
  id text primary key,
  serial_number text not null unique,
  donation_id text not null references donations(id) on delete cascade,
  token_type_id text not null,
  campaign_title text not null,
  status text not null default 'unused',
  minted_at timestamptz not null default now(),
  allocated_at timestamptz,
  redeemed_at timestamptz,
  expired_at timestamptz,
  cancelled_at timestamptz,
  beneficiary_name text,
  meal_type text,
  redemption_location text,
  is_special_care boolean not null default false,
  special_instructions text
);
```

### 4. Insert Test Data
```sql
INSERT INTO donors (id, name, email, avatar_url, credits_balance, total_donated_tokens, impact_score, joined_date)
VALUES (
  'donor_001',
  'Darshini Rajan',
  'darshini.rajan@example.com',
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&h=256&q=80',
  45,
  250,
  250,
  '2026-01-15'
) on conflict (id) do nothing;
```

### 5. Enable Row-Level Security
```sql
alter table donors enable row level security;
alter table donations enable row level security;
alter table tokens enable row level security;
```

### 6. Create RLS Policies
```sql
create policy "Allow public read donors" on donors for select using (true);
create policy "Allow public update donors" on donors for update using (true) with check (true);
create policy "Allow public read donations" on donations for select using (true);
create policy "Allow public insert donations" on donations for insert with check (true);
create policy "Allow public read tokens" on tokens for select using (true);
create policy "Allow public insert tokens" on tokens for insert with check (true);
```

---

## Verification After Schema Applied

### Step 1: Test Connection
```bash
node check-db.js
```

Should see:
```
✅ Anon client test success! Found donors: [...]
✅ Service role client test success! Found donors: [...]
```

### Step 2: Check Supabase Dashboard
Go to: https://supabase.com/dashboard/project/qxdxefofeykzvegykitt/editor

Should show tables:
- ✅ donors
- ✅ donations
- ✅ tokens
- ✅ token_types
- ✅ credit_transactions
- ✅ notifications
- ... (and others)

### Step 3: View Test Data
In Supabase dashboard, open "donors" table:
- Should see 1 donor: "Darshini Rajan"
- credits_balance: 45
- total_donated_tokens: 250

### Step 4: Start Dev Server
```bash
npm run dev
```

### Step 5: Test Dashboard
Visit: http://localhost:3000/donor/dashboard

Should show:
- Loading spinner briefly
- Dashboard with real data:
  - Total Credits: ₹45
  - Total Donated: (calculated)
  - Meals Sponsored: (calculated)
  - Monthly Summary
  - Donation History
  - Redemption History

---

## Troubleshooting

### Schema Application Failed

**Error:** "Could not find the function public.exec_sql"
- **Cause:** RPC function not available
- **Solution:** Use Option 1 (Supabase Dashboard) instead

**Error:** "Permission denied"
- **Cause:** Wrong credentials
- **Solution:** Verify SERVICE_ROLE_KEY is correct in .env.local

**Error:** "Table already exists"
- **Cause:** Schema was partially applied
- **Solution:** 
  1. Drop existing tables: `DROP TABLE IF EXISTS tokens, donations, donors CASCADE;`
  2. Re-apply full schema

### Connection Test Failed

**Error:** "Could not find the table 'public.donors'"
- **Cause:** Schema hasn't been applied yet
- **Solution:** Follow steps above to apply schema

**Error:** "Authentication failed"
- **Cause:** Invalid credentials
- **Solution:** Verify SUPABASE_URL and keys in .env.local

---

## What Gets Created

When you apply `supabase/schema.sql`, it creates:

### Tables (12 total)
1. **donors** - Donor profiles
2. **donor_credits** - Credit tracking
3. **payment_methods** - Payment options
4. **token_types** - Campaigns
5. **donations** - Donation records
6. **credit_transactions** - Transaction history
7. **token_batches** - Token grouping
8. **tokens** - Individual food tokens
9. **token_authorisations** - Authorization records
10. **token_distribution_records** - Distribution history
11. **scheduled_redemption_dates** - Planned redemptions
12. **notifications** - Donor notifications

### Policies (RLS)
- Public read on all tables (for development)
- Public write on most tables (for development)
- Note: In production, implement proper RLS

### Test Data
- 1 Donor: "Darshini Rajan"
- 2 Campaigns: "Annapoorna School", "Mercy Orphanage"
- 2 Donations
- 5 Tokens
- Transaction history
- Redemption records

---

## After Schema is Applied

Then you can:

1. ✅ Start dev server: `npm run dev`
2. ✅ Visit dashboard: `http://localhost:3000/donor/dashboard`
3. ✅ See real Supabase data
4. ✅ Test error handling
5. ✅ Test retry functionality
6. ✅ Add more test data
7. ✅ Deploy to production

---

## Quick Checklist

- [ ] Open `supabase/schema.sql`
- [ ] Copy all contents
- [ ] Go to Supabase dashboard SQL editor
- [ ] Paste schema
- [ ] Click "Run"
- [ ] Wait for completion
- [ ] Run `node check-db.js`
- [ ] Verify output shows success
- [ ] Run `npm run dev`
- [ ] Visit dashboard
- [ ] See real data

---

## Commands Reference

```bash
# Verify connection after schema applied
node check-db.js

# Start dev server
npm run dev

# Start dev server (alternate)
npm run dev

# Build project
npm run build

# View database schema
# Go to: https://supabase.com/dashboard/project/qxdxefofeykzvegykitt/editor
```

---

## Need Help?

If schema application fails:

1. Check `.env.local` has correct credentials
2. Verify Supabase project is ACTIVE_HEALTHY
3. Try copying `supabase/schema.sql` line by line
4. Check Supabase dashboard for error messages
5. Contact Supabase support if tables won't create

**Expected Time to Complete:** 10-15 minutes

---

## Status After This

✅ Schema Applied → Ready to test dashboard with real data!
