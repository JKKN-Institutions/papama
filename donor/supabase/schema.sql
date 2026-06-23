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

create table if not exists donor_credits (
  id text primary key,
  donor_id text not null references donors(id) on delete cascade,
  balance integer not null default 0,
  reserved_balance integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists payment_methods (
  id text primary key,
  donor_id text not null references donors(id) on delete cascade,
  provider text not null,
  method_type text not null,
  display_name text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists token_types (
  id text primary key,
  title text not null,
  description text not null,
  target_tokens integer not null,
  raised_tokens integer not null default 0,
  token_price_in_inr integer not null,
  organization_name text not null,
  category text not null check (category in ('School', 'Orphanage', 'Disaster Relief', 'Community Kitchen')),
  location text not null,
  image_url text,
  status text not null default 'active' check (status in ('active', 'completed')),
  created_at timestamptz not null default now()
);

create table if not exists donations (
  id text primary key,
  donor_id text not null references donors(id) on delete cascade default 'donor_001',
  token_type_id text not null references token_types(id) on delete cascade,
  campaign_title text not null,
  token_amount integer not null,
  fiat_amount integer not null,
  status text not null default 'completed' check (status in ('pending', 'completed', 'failed')),
  timestamp timestamptz not null default now(),
  transaction_hash text
);

create table if not exists credit_transactions (
  id text primary key,
  donor_id text not null references donors(id) on delete cascade default 'donor_001',
  amount integer not null,
  type text not null check (type in ('purchase', 'donation')),
  timestamp timestamptz not null default now(),
  description text not null
);

create table if not exists token_batches (
  id text primary key,
  donation_id text not null references donations(id) on delete cascade,
  token_type_id text not null references token_types(id) on delete cascade,
  token_count integer not null,
  status text not null default 'minted' check (status in ('minted', 'distributed', 'cancelled')),
  minted_at timestamptz not null default now()
);

create table if not exists tokens (
  id text primary key,
  serial_number text not null unique,
  batch_id text references token_batches(id) on delete set null,
  donation_id text not null references donations(id) on delete cascade,
  token_type_id text not null references token_types(id) on delete cascade,
  campaign_title text not null,
  status text not null default 'unused' check (status in ('unused', 'redeemed', 'expired', 'cancelled')),
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


create table if not exists token_authorisations (
  id text primary key,
  token_id text not null references tokens(id) on delete cascade,
  authorised_by text not null,
  status text not null default 'authorised' check (status in ('authorised', 'revoked')),
  authorised_at timestamptz not null default now(),
  notes text
);

create table if not exists token_distribution_records (
  id text primary key,
  token_id text not null references tokens(id) on delete cascade,
  beneficiary_name text,
  distributed_by text,
  distribution_location text,
  distributed_at timestamptz not null default now(),
  notes text
);

create table if not exists scheduled_redemption_dates (
  id text primary key,
  token_id text references tokens(id) on delete cascade,
  token_type_id text references token_types(id) on delete cascade,
  scheduled_for date not null,
  location text,
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'cancelled')),
  created_at timestamptz not null default now()
);

create table if not exists notifications (
  id text primary key,
  donor_id text references donors(id) on delete cascade,
  title text not null,
  message text not null,
  status text not null default 'unread' check (status in ('unread', 'read')),
  created_at timestamptz not null default now()
);

alter table donors enable row level security;
alter table donor_credits enable row level security;
alter table credit_transactions enable row level security;
alter table donations enable row level security;
alter table payment_methods enable row level security;
alter table token_types enable row level security;
alter table tokens enable row level security;
alter table token_batches enable row level security;
alter table token_authorisations enable row level security;
alter table token_distribution_records enable row level security;
alter table scheduled_redemption_dates enable row level security;
alter table notifications enable row level security;

drop policy if exists "Allow public read donors" on donors;
drop policy if exists "Allow public update donors" on donors;
drop policy if exists "Allow public read donor credits" on donor_credits;
drop policy if exists "Allow public update donor credits" on donor_credits;
drop policy if exists "Allow public read credit transactions" on credit_transactions;
drop policy if exists "Allow public insert credit transactions" on credit_transactions;
drop policy if exists "Allow public read donations" on donations;
drop policy if exists "Allow public insert donations" on donations;
drop policy if exists "Allow public read payment methods" on payment_methods;
drop policy if exists "Allow public read token types" on token_types;
drop policy if exists "Allow public update token types" on token_types;
drop policy if exists "Allow public read tokens" on tokens;
drop policy if exists "Allow public insert tokens" on tokens;
drop policy if exists "Allow public read token batches" on token_batches;
drop policy if exists "Allow public insert token batches" on token_batches;
drop policy if exists "Allow public read token authorisations" on token_authorisations;
drop policy if exists "Allow public read token distribution records" on token_distribution_records;
drop policy if exists "Allow public read scheduled redemption dates" on scheduled_redemption_dates;
drop policy if exists "Allow public read notifications" on notifications;

create policy "Allow public read donors" on donors for select using (true);
create policy "Allow public update donors" on donors for update using (true) with check (true);
create policy "Allow public read donor credits" on donor_credits for select using (true);
create policy "Allow public update donor credits" on donor_credits for update using (true) with check (true);
create policy "Allow public read credit transactions" on credit_transactions for select using (true);
create policy "Allow public insert credit transactions" on credit_transactions for insert with check (true);
create policy "Allow public read donations" on donations for select using (true);
create policy "Allow public insert donations" on donations for insert with check (true);
create policy "Allow public read payment methods" on payment_methods for select using (true);
create policy "Allow public read token types" on token_types for select using (true);
create policy "Allow public update token types" on token_types for update using (true) with check (true);
create policy "Allow public read tokens" on tokens for select using (true);
create policy "Allow public insert tokens" on tokens for insert with check (true);
create policy "Allow public read token batches" on token_batches for select using (true);
create policy "Allow public insert token batches" on token_batches for insert with check (true);
create policy "Allow public read token authorisations" on token_authorisations for select using (true);
create policy "Allow public read token distribution records" on token_distribution_records for select using (true);
create policy "Allow public read scheduled redemption dates" on scheduled_redemption_dates for select using (true);
create policy "Allow public read notifications" on notifications for select using (true);

insert into donors (
  id,
  name,
  email,
  avatar_url,
  credits_balance,
  total_donated_tokens,
  impact_score,
  joined_date
) values (
  'donor_001',
  'Darshini Rajan',
  'darshini.rajan@example.com',
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=256&h=256&q=80',
  45,
  250,
  250,
  '2026-01-15'
) on conflict (id) do nothing;

insert into donor_credits (id, donor_id, balance)
values ('credits_donor_001', 'donor_001', 45)
on conflict (id) do nothing;

insert into payment_methods (id, donor_id, provider, method_type, display_name, is_default)
values
  ('pm_001', 'donor_001', 'UPI', 'upi', 'darshini@upi', true),
  ('pm_002', 'donor_001', 'Net Banking', 'bank', 'Primary bank account', false)
on conflict (id) do nothing;

insert into token_types (
  id,
  title,
  description,
  target_tokens,
  raised_tokens,
  token_price_in_inr,
  organization_name,
  category,
  location,
  image_url,
  status
) values
  (
    'camp_001',
    'Annapoorna School Breakfast Drive',
    'Providing healthy morning breakfasts to 200 government primary school children in Salem, Tamil Nadu. A nutritious breakfast boosts cognitive function, concentration, and school attendance.',
    5000,
    3240,
    30,
    'Annapoorna Trust',
    'School',
    'Salem, TN',
    'https://images.unsplash.com/photo-1541802645635-11f2286a7482?auto=format&fit=crop&w=800&q=80',
    'active'
  ),
  (
    'camp_002',
    'Mercy Orphanage Nutrition Program',
    'Supporting 80 orphaned children with balanced daily lunches including vegetables, grains, and fruits. Help us secure their nutritional requirements for the next three months.',
    3000,
    1850,
    45,
    'Mercy Foundation',
    'Orphanage',
    'Coimbatore, TN',
    'https://images.unsplash.com/photo-1488521787991-ed7bbaae773c?auto=format&fit=crop&w=800&q=80',
    'active'
  ),
  (
    'camp_003',
    'Elderly Care Shelter Hot Meals',
    'Delivering fresh, soft, nutritious hot meals to 50 abandoned elderly residents. Meals are tailored to their health needs and prepared in hygienic community kitchens.',
    2000,
    1920,
    40,
    'Silver Lining Home',
    'Community Kitchen',
    'Madurai, TN',
    'https://images.unsplash.com/photo-1516627145497-ae6968895b74?auto=format&fit=crop&w=800&q=80',
    'active'
  ),
  (
    'camp_004',
    'Coastal Disaster Relief Kitchen',
    'Setting up emergency kitchen tents to distribute food tokens and warm meals to fishing communities affected by recent heavy storms and flooding.',
    4000,
    1200,
    35,
    'Rapid Response India',
    'Disaster Relief',
    'Cuddalore, TN',
    'https://images.unsplash.com/photo-1593113598332-cd288d649433?auto=format&fit=crop&w=800&q=80',
    'active'
  )
on conflict (id) do nothing;

insert into donations (
  id,
  donor_id,
  token_type_id,
  campaign_title,
  token_amount,
  fiat_amount,
  status,
  timestamp,
  transaction_hash
) values
  ('don_101', 'donor_001', 'camp_001', 'Annapoorna School Breakfast Drive', 150, 4500, 'completed', '2026-06-11T12:30:00Z', '0x8f2c7d9e4a3b1c6d8e2f'),
  ('don_102', 'donor_001', 'camp_002', 'Mercy Orphanage Nutrition Program', 100, 4500, 'completed', '2026-06-14T15:00:00Z', '0x3a9d8c7b6a5e4d3f2c1b')
on conflict (id) do nothing;

insert into credit_transactions (id, donor_id, amount, type, timestamp, description)
values
  ('tx_001', 'donor_001', 1500, 'purchase', '2026-06-10T10:00:00Z', 'Purchased INR 1,500 credits via Net Banking'),
  ('tx_002', 'donor_001', -4500, 'donation', '2026-06-11T12:30:00Z', 'Allocated 150 tokens to Annapoorna School Breakfast Drive'),
  ('tx_003', 'donor_001', 3000, 'purchase', '2026-06-12T09:15:00Z', 'Purchased INR 3,000 credits via UPI'),
  ('tx_004', 'donor_001', -4500, 'donation', '2026-06-14T15:00:00Z', 'Allocated 100 tokens to Mercy Orphanage Nutrition Program')
on conflict (id) do nothing;

insert into token_batches (id, donation_id, token_type_id, token_count, status, minted_at)
values
  ('batch_101', 'don_101', 'camp_001', 150, 'minted', '2026-06-11T12:30:00Z'),
  ('batch_102', 'don_102', 'camp_002', 100, 'minted', '2026-06-14T15:00:00Z')
on conflict (id) do nothing;

insert into tokens (
  id,
  serial_number,
  batch_id,
  donation_id,
  token_type_id,
  campaign_title,
  status,
  minted_at,
  allocated_at,
  redeemed_at,
  expired_at,
  cancelled_at,
  beneficiary_name,
  meal_type,
  redemption_location
) values
  ('tok_001', 'PPM-SLM-9021', 'batch_101', 'don_101', 'camp_001', 'Annapoorna School Breakfast Drive', 'redeemed', '2026-06-11T12:30:00Z', '2026-06-12T07:15:00Z', '2026-06-12T08:00:00Z', null, null, 'Aravind K. (Std V)', 'Hot Rava Pongal & Sambar', 'Govt Primary School, Salem - Canteen A'),
  ('tok_002', 'PPM-SLM-9022', 'batch_101', 'don_101', 'camp_001', 'Annapoorna School Breakfast Drive', 'unused', '2026-06-11T12:30:00Z', null, null, null, null, null, null, null),
  ('tok_003', 'PPM-CBE-8140', 'batch_102', 'don_102', 'camp_002', 'Mercy Orphanage Nutrition Program', 'redeemed', '2026-06-14T15:00:00Z', '2026-06-15T11:45:00Z', '2026-06-15T12:30:00Z', null, null, 'Orphanage Child #104', 'Rice, Dal & Vegetable Poriyal', 'Mercy Home Dining Centre'),
  ('tok_004', 'PPM-CBE-8141', 'batch_102', 'don_102', 'camp_002', 'Mercy Orphanage Nutrition Program', 'expired', '2026-05-01T10:00:00Z', null, null, '2026-06-01T00:00:00Z', null, null, null, null),
  ('tok_005', 'PPM-CBE-8142', 'batch_102', 'don_102', 'camp_002', 'Mercy Orphanage Nutrition Program', 'cancelled', '2026-06-14T15:00:00Z', null, null, null, '2026-06-15T09:00:00Z', null, null, null)
on conflict (id) do nothing;

insert into token_authorisations (id, token_id, authorised_by, status, authorised_at, notes)
values ('auth_001', 'tok_001', 'ops_admin', 'authorised', '2026-06-12T07:00:00Z', 'Authorised for school breakfast redemption')
on conflict (id) do nothing;

insert into token_distribution_records (id, token_id, beneficiary_name, distributed_by, distribution_location, distributed_at, notes)
values ('dist_001', 'tok_001', 'Aravind K. (Std V)', 'field_worker_001', 'Govt Primary School, Salem', '2026-06-12T07:15:00Z', 'Distributed during morning meal service')
on conflict (id) do nothing;

insert into scheduled_redemption_dates (id, token_id, token_type_id, scheduled_for, location, status)
values ('sched_001', 'tok_002', 'camp_001', '2026-06-18', 'Govt Primary School, Salem', 'scheduled')
on conflict (id) do nothing;

insert into notifications (id, donor_id, title, message, status)
values ('notif_001', 'donor_001', 'Tokens minted', 'Your donated meal tokens are ready for distribution.', 'unread')
on conflict (id) do nothing;
