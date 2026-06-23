# 🔒 Security Guidelines — Secrets Management

## Critical: Never Commit API Keys to Git

This document outlines how to securely manage Supabase API keys and other secrets.

---

## ✅ Safe Implementation

### 1. Environment Variables Setup

**Create `.env.local` in project root (NEVER commit):**

```env
# Frontend (Safe - exposed to browser)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Backend Only (Secret - NEVER expose)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**`.gitignore` includes:**
```
.env
.env.local
.env.*.local
!.env.example
```

---

### 2. Frontend Code (Safe)

**✅ CORRECT - Use anon key in React components:**

```typescript
// src/services/supabase.ts
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ✅ Safe to use in React components
export function MyComponent() {
  const [data, setData] = useState(null);
  
  useEffect(() => {
    supabase
      .from('tokens')
      .select('*')
      .then(({ data }) => setData(data));
  }, []);
  
  return <div>{JSON.stringify(data)}</div>;
}
```

---

### 3. Backend Code (Protected)

**✅ CORRECT - Use service role key in API routes only:**

```typescript
// src/services/supabase-server.ts
import { createClient } from '@supabase/supabase-js';

// Server-side only! Never import in React components
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Backend only
);

// ✅ Example API route
// pages/api/tokens.ts
export default async function handler(req, res) {
  // ONLY accessible server-side
  const { data } = await supabaseAdmin
    .from('tokens')
    .select('*');
  
  res.status(200).json(data);
}
```

---

## ❌ What NOT to Do

### 1. Never Hardcode Keys

**❌ WRONG:**
```typescript
const supabase = createClient(
  'https://abc123.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' // ❌ Exposed!
);
```

**✅ CORRECT:**
```typescript
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
```

---

### 2. Never Commit `.env.local`

**❌ WRONG:**
```bash
git add .env.local
git commit -m "Add env vars"  # ❌ Keys committed!
```

**✅ CORRECT:**
```bash
# .env.local is in .gitignore
git add .
git commit -m "Add feature"  # ✅ .env.local not included
```

---

### 3. Never Use Service Role in Frontend

**❌ WRONG:**
```typescript
// React component
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY  // ❌ EXPOSED TO BROWSER!
);
```

**✅ CORRECT:**
```typescript
// React component - use anon key
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY  // ✅ Safe
);

// Backend - use service role key
// pages/api/admin.ts
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY  // ✅ Server-side only
);
```

---

## 🚨 If You Accidentally Exposed a Key

### Immediate Actions

1. **Revoke the key immediately** in Supabase Dashboard:
   - Project Settings → API → Regenerate Key

2. **Remove from git history:**
   ```bash
   # Clean git history (coordinate with team)
   git filter-branch --tree-filter 'git rm -f --cached .env' HEAD
   git push origin --force-with-lease
   ```

3. **Update `.env.local` with new keys**

4. **Inform your team** about the rotation

---

## ✅ Verification Checklist

Run these commands to verify security:

```bash
# Check no secrets in git
git log -p | grep -i "service_role\|supabase.*key" | head -5
# Should return: (nothing)

# Verify .env.local in .gitignore
cat .gitignore | grep "env"
# Should show: .env.local

# Check no env files are staged
git status | grep ".env"
# Should return: (nothing)
```

---

## Key Differences

| Setting | Frontend (Anon) | Backend (Service Role) |
|---------|-----------------|------------------------|
| **Where** | React components | API routes, server code |
| **Key** | NEXT_PUBLIC_SUPABASE_ANON_KEY | SUPABASE_SERVICE_ROLE_KEY |
| **Exposed?** | Yes (intentional) | NO (secret) |
| **Permissions** | Limited (user-based) | Admin (full access) |
| **Where kept** | .env.local + .env.example | .env.local only |
| **Import file** | src/services/supabase.ts | src/services/supabase-server.ts |

---

## Resources

- [Supabase Security Best Practices](https://supabase.com/docs/guides/auth)
- [Environment Variables in Next.js](https://nextjs.org/docs/basic-features/environment-variables)
- [GitIgnore Documentation](https://git-scm.com/docs/gitignore)

---

**Last Updated**: 2026-06-22  
**Status**: ✅ Production Ready
