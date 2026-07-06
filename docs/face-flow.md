# Face flow (identity + anti-spoof + fair-usage)

Authoritative reference for the "face-hash" feature. Read alongside
`docs/token-flow.md` (redemption) and migration `m23_face_embeddings`.

## Terminology: "face-hash" is a face *embedding*

The spec/owner docs call this "face-hash", but the implementation deliberately
does **not** hash the photo. A photo can never be equality-hashed (two photos of
the same person never produce the same hash), so identity is resolved by **vector
distance** on a **face embedding**:

- **Embedding** — a 1024-d float vector from `@vladmandic/human`'s `faceres`
  model, produced **on-device** by `<FaceCapture>`. The raw image never leaves
  the device; only the vector is sent. Stored in `*.face_embedding`
  (pgvector `vector(1024)`), matched by cosine distance.
- **`face_hash` (legacy text column)** — a SHA-256 fingerprint of the embedding
  (`lib/face/embedding.ts`). It is a coarse presence/equality signal only
  (identical embeddings hash equal; near-duplicates do NOT). **Never** the matcher.

## End-to-end

1. **Capture** — `components/face/FaceCapture.tsx` runs Human in the browser,
   emits `{ embedding, liveness }`. `liveness = min(antispoof.real, liveness.live)`
   in `0..1`. The embedding is **L2-normalized** before emit (see below).
2. **Enrolment** — `POST /api/beneficiary/register` (self), `.../volunteer/beneficiary-registrations`
   (assisted), `.../admin/beneficiary-registrations` (admin). All three call the
   shared **`assertLiveness()`** gate, then store `face_embedding` + derive `face_hash`.
   Creates a PENDING registration only.
3. **Approval** — `admin/beneficiary-registrations/[id]/decide` copies the enrolled
   `face_embedding` onto the `beneficiaries` row (the 1:1 match target).
4. **Redemption verify** — `lib/services/redemption.ts`:
   - liveness gate (fail-safe, see below);
   - **1:1 identity** via `match_beneficiary_face` (nearest active beneficiary within
     `face_match_threshold`), **fail-closed** on a transient RPC error;
   - **fair-usage** (cooldown + meal-limit) over the union of a **face signal**
     (`recent_face_matches`, cross-vendor — catches anonymous repeat-redeemers) and a
     **beneficiary signal** (matched beneficiary's own history). Any read error blocks.
5. **Commit** — `POST /api/vendor/redemptions` records the redemption and writes
   `redemption_cooldown_log` (embedding + fingerprint) **before** burning the token,
   seeding future repeat-detection; raises a `beneficiary_duplicate` fraud flag on a
   cooldown/meal-limit trip.

## Distance metric — decision & caveat

The DB matches with **cosine distance** (`m23` uses `vector_cosine_ops`, `<=>`).
Human's descriptors are **not** unit vectors and the model is designed around
**Euclidean** distance, so Human's own "similarity > 0.5 = match" guidance does
**not** translate directly to a cosine-distance cutoff.

- **What we do now:** keep the cosine index; **L2-normalize embeddings at capture**
  (`lib/face/vector.ts`). Because cosine is scale-invariant this is a no-op for
  current matching (existing non-normalized rows still match), but it makes vectors
  canonical and de-risks a future switch to L2 (on unit vectors L2 ≡ cosine ranking).
- **What still needs doing:** the threshold values are placeholders — **calibrate**
  (below). Normalization is *not* a substitute for calibration.
- **Future option (not done):** switch `m23` to `vector_l2_ops` (`<->`) to match
  Human's native metric. Requires re-normalizing existing rows — a DB migration.

## Config (system_config, seeded by m23 — CALIBRATE)

| key | seed | meaning |
|---|---|---|
| `face_match_threshold` | `0.4` | max cosine distance to count as the same person (lower = stricter) |
| `face_liveness_min` | `0.5` | min anti-spoof/liveness score to accept a capture |
| `face_dedup_window_hours` | `6` | lookback window for face repeat-detection at redemption |

> These are technical tuning values with **placeholder** defaults. Do not ship to
> production untested — see calibration.

## Calibration procedure (needs real device captures — your data)

**Threshold (`face_match_threshold`)**
1. Enrol ~20–50 people via `<FaceCapture>` on the target devices/lighting.
2. Collect **genuine pairs** (same person, different captures) and **impostor
   pairs** (different people). For each pair compute cosine distance:
   `select (a.face_embedding <=> b.face_embedding)` over the pairs.
3. Plot the two distributions. Genuine distances cluster low, impostor high.
4. Set `face_match_threshold` at the separation point (favour a lower/stricter
   value if the distributions overlap — a false accept lets someone redeem as
   another person). Record the false-accept / false-reject rates you accept.

**Liveness (`face_liveness_min`)**
1. Capture genuine live faces and spoof attempts (printed photo, phone screen).
2. Compare the `liveness` scores; set the floor above the spoof cluster and below
   the genuine cluster. Re-test in poor lighting to bound false rejects.

Update both via `admin/system-config` (do not hard-code). Leave `CLIENT_LIVENESS_FLOOR_DEFAULT`
in `<FaceCapture>` aligned with the chosen `face_liveness_min`.

## Fail-safe behaviour (2026-07 fixes)

- **Enrolment liveness** — `assertLiveness()` (`lib/face/liveness.ts`) skips **only**
  when `face_liveness_min` is genuinely unset (`MissingConfigError`); a transient read
  error **throws** (blocks). This replaces the old `.catch(() => 0)`, which set the
  floor to 0 (accept anything) on any error.
- **Redemption liveness** — same distinction: unset → soft-skip; transient error →
  hard-fail (block).
- **Identity + fair-usage reads** — already fail-closed on transient errors.
- **Config-unset soft-skip is by design:** if `face_match_threshold` is blank *and* no
  registered beneficiary matched, fair-usage soft-skips for anonymous redeemers. The
  m23 seed sets the threshold, so this only bites if the row is blanked.

## Deployment

- **Model source** — `<FaceCapture>` loads models from the Human CDN by default. For
  an offline / Play-Store build, copy the model files into `/public/models` and set
  `NEXT_PUBLIC_FACE_MODEL_PATH=/models`. Removes the third-party runtime dependency.
- **Embedding dimension** — `FACE_EMBEDDING_DIM = 1024` must equal the `vector(1024)`
  columns in m23. Changing the model means changing both (and re-enrolling everyone).
- **m23 applied** — confirmed live (columns, RPCs, config present).
