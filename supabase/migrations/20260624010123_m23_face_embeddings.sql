-- =============================================================================
-- M23 — face embeddings (face-hash feature, owner §4.6 / §5.2, SEC-1..4, F-5)
-- =============================================================================
-- Replaces the placeholder text `face_hash` identity signal with a real, on-device
-- face EMBEDDING (a fixed-length vector produced by @vladmandic/human in the
-- vendor/registration UI). Identity is then resolved by VECTOR DISTANCE, not text
-- equality — because a photo can never be equality-hashed.
--
-- Two jobs (see redemption verify, a later slice):
--   * registered beneficiaries (Special-Care): 1:1 match live face vs enrolled vector.
--   * anonymous beneficiaries (most Standard redemptions): repeat-detection within
--     the cooldown/meal-limit window (closes the audit's bypassable-cooldown gap).
--
-- PRIVACY (unchanged rule): we store ONLY the embedding (never a raw image); the
-- embedding is computed on the device. `face_hash` text columns are KEPT for
-- back-compat and as a coarse fingerprint; nothing here drops them.
--
-- The pgvector `vector` type is installed into the `extensions` schema (Supabase
-- convention — keeps `public` clean), so the type/operators are schema-qualified.
--
-- DIMENSION: 1024 = the @vladmandic/human `faceres` model embedding length. If you
-- swap the model, change EVERY vector(1024) below AND the index opclass dim.
--
-- Depends on: M05 (beneficiaries, beneficiary_registrations), M17
-- (redemption_cooldown_log), M03 (system_config). Apply AFTER all of them.
-- =============================================================================

begin;

-- --- pgvector ---------------------------------------------------------------
create extension if not exists vector with schema extensions;

-- --- embedding columns (additive; existing face_hash text columns untouched) -
alter table public.beneficiaries
    add column if not exists face_embedding extensions.vector(1024);
comment on column public.beneficiaries.face_embedding is
    'Enrolled face embedding (1024-d, @vladmandic/human). Primary identity vector; matched 1:1 at redemption. On-device only, never a raw image.';

alter table public.beneficiary_registrations
    add column if not exists face_embedding extensions.vector(1024);
comment on column public.beneficiary_registrations.face_embedding is
    'Face embedding captured at registration; copied onto beneficiaries on approval.';

alter table public.redemption_cooldown_log
    add column if not exists face_embedding extensions.vector(1024);
comment on column public.redemption_cooldown_log.face_embedding is
    'Live face embedding captured at this redemption — queried for repeat-detection within the fair-usage window.';

-- --- ANN indexes (HNSW, cosine) ---------------------------------------------
-- Low Phase-1 volume, but HNSW keeps nearest-neighbour lookups sub-10ms as data grows.
create index if not exists beneficiaries_face_embedding_idx
    on public.beneficiaries using hnsw (face_embedding extensions.vector_cosine_ops);
create index if not exists cooldown_face_embedding_idx
    on public.redemption_cooldown_log using hnsw (face_embedding extensions.vector_cosine_ops);

-- =============================================================================
-- Match RPCs — server-only (called by the route handlers via the service-role
-- client). SECURITY DEFINER + pinned search_path; EXECUTE revoked from
-- anon/authenticated so the face-matching surface is never client-callable.
-- Distance = cosine distance (`<=>`): 0 = identical, higher = less similar.
-- =============================================================================

-- 1:1 / identify — nearest ACTIVE registered beneficiary within max_distance.
create or replace function public.match_beneficiary_face(
    query extensions.vector,
    max_distance double precision
)
returns table (beneficiary_id uuid, distance double precision)
language sql
stable
security definer
set search_path = public, extensions
as $$
    select b.id, (b.face_embedding <=> query) as distance
    from public.beneficiaries b
    where b.face_embedding is not null
      and b.status = 'active'
      and (b.face_embedding <=> query) <= max_distance
    order by b.face_embedding <=> query
    limit 1;
$$;

comment on function public.match_beneficiary_face is
    'Nearest active registered beneficiary to a face embedding within max cosine distance. Server-only (face-hash verify).';

-- Repeat-detection — recent redemption captures within `since` that match the face.
create or replace function public.recent_face_matches(
    query extensions.vector,
    max_distance double precision,
    since timestamptz
)
returns table (
    beneficiary_id uuid,
    face_hash text,
    redeemed_at timestamptz,
    distance double precision
)
language sql
stable
security definer
set search_path = public, extensions
as $$
    select l.beneficiary_id, l.face_hash, l.redeemed_at, (l.face_embedding <=> query) as distance
    from public.redemption_cooldown_log l
    where l.face_embedding is not null
      and l.redeemed_at >= since
      and (l.face_embedding <=> query) <= max_distance
    order by l.redeemed_at desc;
$$;

comment on function public.recent_face_matches is
    'Recent redemption face captures (since ts) matching a face embedding within max cosine distance. Server-only (cooldown/meal-limit identity + repeat-detection fraud signal).';

revoke all on function public.match_beneficiary_face(extensions.vector, double precision) from public, anon, authenticated;
revoke all on function public.recent_face_matches(extensions.vector, double precision, timestamptz) from public, anon, authenticated;
grant execute on function public.match_beneficiary_face(extensions.vector, double precision) to service_role;
grant execute on function public.recent_face_matches(extensions.vector, double precision, timestamptz) to service_role;

-- =============================================================================
-- system_config — face thresholds (F-7: every rule is a config row, not a const).
-- NOTE: these are TECHNICAL tuning values (not ASSUMPTIONS open items). Defaults
-- are sensible starting points and MUST be calibrated against real captures.
-- =============================================================================
insert into public.system_config (key, value, value_type, description) values
    ('face_match_threshold', '0.4', 'number',
     'Max cosine distance for two face embeddings to count as the same person (0=identical). Lower = stricter. CALIBRATE.'),
    ('face_liveness_min', '0.5', 'number',
     'Minimum liveness/anti-spoof score (0..1) required for a face capture to be accepted. CALIBRATE.'),
    ('face_dedup_window_hours', '6', 'number',
     'Lookback window (hours) for face repeat-detection at redemption. Defaults to the meal cooldown.')
on conflict (key) do nothing;

commit;

-- =============================================================================
-- DOWN (rollback)
-- =============================================================================
-- begin;
-- delete from public.system_config where key in
--     ('face_match_threshold', 'face_liveness_min', 'face_dedup_window_hours');
-- drop function if exists public.recent_face_matches(extensions.vector, double precision, timestamptz);
-- drop function if exists public.match_beneficiary_face(extensions.vector, double precision);
-- drop index if exists public.cooldown_face_embedding_idx;
-- drop index if exists public.beneficiaries_face_embedding_idx;
-- alter table public.redemption_cooldown_log  drop column if exists face_embedding;
-- alter table public.beneficiary_registrations drop column if exists face_embedding;
-- alter table public.beneficiaries            drop column if exists face_embedding;
-- -- (extension `vector` left installed — other features may rely on it.)
-- commit;
