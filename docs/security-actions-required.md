# Security Actions Required — Operator Checklist

**Audience:** project owner / whoever manages the Supabase dashboard and deployment env.  
**Scope:** items that are NOT fixable by code or migration alone — they require dashboard
toggles, environment provisioning, or manual verification. None of these are in the
automated migration set.

---

## 1. Provision `TOKEN_QR_SECRET`

**Why this matters (HIGH — provision before first live QR scan):**  
`TOKEN_QR_SECRET` is unset in `.env.local`. When it is absent, the QR-signing code falls
back to the Supabase service-role key to HMAC-sign token QR payloads. This causes two
problems:

- **Rotation lock-in:** rotating the service-role key (which Supabase recommends on any
  suspected compromise) immediately invalidates every QR code ever issued. A beneficiary
  holding a printed token cannot redeem it until a new QR is generated.
- **Key sprawl:** the service-role key is the master credential for the database; using it
  as a signing secret widens its exposure surface.

**What to do:**

1. Generate a strong secret (min 32 bytes of entropy):
   ```
   openssl rand -hex 32
   ```
2. In your deployment environment (Vercel / Railway / etc.), set:
   ```
   TOKEN_QR_SECRET=<value from step 1>
   ```
   Dashboard path (Vercel): Project → Settings → Environment Variables → Add Variable.
3. In `.env.local` (local dev, already git-ignored):
   ```
   TOKEN_QR_SECRET=<same value or a separate dev-only value>
   ```
4. Do NOT put this in any repo file. Confirm `.env.local` stays in `.gitignore`.
5. After provisioning, all NEW QR codes are signed with this secret. Pre-existing QR
   codes signed with the service-role key will fail verification until you either:
   - Re-issue them (recommended for production launch), or
   - Accept a one-time re-scan burden if going live with existing test tokens.

---

## 2. Enable Leaked-Password Protection

**Why this matters (M):**  
Supabase Auth can check new passwords against the HaveIBeenPwned database during
signup/password-reset. Without it, users can register with passwords from known breach
dumps, making credential-stuffing attacks easier.

**Dashboard path:**
```
Supabase Dashboard
  → Authentication
  → Providers
  → Email
  → "Protect against leaked passwords" toggle → ON
```

No code change required. This applies to all new signups and password updates immediately.

---

## 3. Raise Minimum Password Length to 12

**Why this matters (L → M before production):**  
The current minimum is 6 characters (Supabase default). Six-character passwords are
trivially brute-forced offline if the `auth.users` table were ever exported (e.g., in a
backup leak). The spec does not define a minimum; 12 characters is a reasonable baseline
aligned with NIST 800-63B.

**Dashboard path:**
```
Supabase Dashboard
  → Authentication
  → Providers
  → Email
  → "Minimum password length" field → change to 12
```

This affects new signups and password-reset flows. Existing users with short passwords
are NOT locked out — the check fires only on credential changes.

---

## 4. Verify `.env.local` is Untracked + Rotate Keys Before Production

**Why this matters (M — gate before any public launch):**  
`.env.local` is confirmed git-ignored (verified: file is not in the tracked tree). However:

- **Rotate all credentials before production.** Keys used during development (Supabase
  `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) should be treated as
  potentially compromised once the project goes live, since they were used in local dev
  environments, possibly CI, and shared with collaborators or mentors.
- **Rotate the Supabase service-role key:**
  ```
  Supabase Dashboard → Settings → API → Service Role Key → Generate new key
  ```
  Update `.env.local` and all deployment environment variables immediately after.
- **Rotate the anon key** if it was ever embedded in any public artifact (screenshot,
  Figma file, shared doc, etc.):
  ```
  Supabase Dashboard → Settings → API → anon public key → Generate new key
  ```
  Then update `NEXT_PUBLIC_SUPABASE_ANON_KEY` everywhere.
- **Confirm secrets are not in git history:**
  ```
  git log --all --full-history -- .env.local
  git grep -i "service_role_key" -- "*.ts" "*.tsx" "*.js" "*.json"
  ```
  If found, the key must be rotated even if the file was later deleted.

**Deployment environment variable checklist:**
```
NEXT_PUBLIC_SUPABASE_URL          ← public, safe in env
NEXT_PUBLIC_SUPABASE_ANON_KEY     ← public, but rotate before production
SUPABASE_SERVICE_ROLE_KEY         ← server-only, NEVER in NEXT_PUBLIC_ vars, rotate before production
TOKEN_QR_SECRET                   ← see item 1 above, must be provisioned
```

---

## Status summary

| Item | Risk | Requires code? | Requires migration? | Requires dashboard/env action? | Done? |
|---|---|---|---|---|---|
| Provision TOKEN\_QR\_SECRET | H | No | No | Yes (env var) | No |
| Enable leaked-password protection | M | No | No | Yes (dashboard toggle) | No |
| Raise password min-length to 12 | M | No | No | Yes (dashboard field) | No |
| Verify .env.local untracked | M | No | No | Yes (git check + key rotation) | Partially (untracked confirmed; rotation pending) |
