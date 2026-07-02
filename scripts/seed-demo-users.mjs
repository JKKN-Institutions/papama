// =============================================================================
// seed-demo-users.mjs — provision demo accounts for every login portal.
// =============================================================================
// One-time/idempotent seeding for CLIENT TESTING. Creates a Supabase Auth user
// per role (email-confirmed), overrides the role on public.users, and attaches
// the role-specific record (vendor/volunteer/donor/beneficiary) so each portal
// is functional on first login.
//
// WHY a script and not a migration: auth.users stores bcrypt-hashed passwords,
// so accounts must be created through the Auth Admin API, not plain SQL.
//
// RUN (from repo root):
//   node scripts/seed-demo-users.mjs
//
// Requires .env.local with NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
// The service-role key bypasses RLS — never import this file into app code.
//
// Safe to re-run: existing accounts are reused and their role/records re-synced.
// =============================================================================

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { createClient } from "@supabase/supabase-js";

// --- shared demo password ----------------------------------------------------
// Read from .env.local (DEMO_PASSWORD) — never hard-coded/committed. Set a value
// there before running, then share it with reviewers out-of-band (not in git).

// --- the roster: one account per role -----------------------------------------
// `setup` runs after the auth user + role are in place; use it to attach the
// role-specific record the portal needs. Service-role client bypasses RLS.
const ROSTER = [
  {
    email: "admin@papama.test",
    role: "admin",
    full_name: "Demo Admin",
    portal: "/login  →  /admin",
  },
  {
    email: "compliance@papama.test",
    role: "compliance",
    full_name: "Demo Compliance Officer",
    portal: "/login  →  /admin (compliance view)",
  },
  {
    email: "manager@papama.test",
    role: "vendor_manager",
    full_name: "Demo Vendor Manager",
    portal: "/login  →  /admin (vendor management)",
  },
  {
    email: "vendor@papama.test",
    role: "vendor",
    full_name: "Demo Vendor",
    portal: "/vendor/login  →  /vendor",
    setup: async (db, userId) =>
      ensureRow(db, "vendors", { owner_id: userId }, {
        owner_id: userId,
        name: "Demo Kitchen",
        legal_name: "Demo Kitchen Foods Pvt Ltd",
        city: "Erode",
        pincode: "638001",
        phone: "+91 90000 00001",
        email: "vendor@papama.test",
        status: "approved", // so the vendor can operate immediately
        kyc_status: "verified",
        hygiene_rating: 4,
      }),
  },
  {
    email: "volunteer@papama.test",
    role: "volunteer",
    full_name: "Demo Volunteer",
    portal: "/volunteer/login  →  /volunteer",
    setup: async (db, userId) =>
      ensureRow(db, "volunteers", { user_id: userId }, {
        user_id: userId,
        full_name: "Demo Volunteer",
        phone: "+91 90000 00002",
        email: "volunteer@papama.test",
        status: "active",
      }),
  },
  {
    email: "donor@papama.test",
    role: "donor",
    full_name: "Demo Donor",
    portal: "/donor/login  →  /donor",
    setup: async (db, userId) =>
      ensureRow(db, "donors", { user_id: userId }, {
        user_id: userId,
        name: "Demo Donor",
        email: "donor@papama.test",
      }),
  },
  {
    email: "beneficiary@papama.test",
    role: "beneficiary",
    full_name: "Demo Beneficiary",
    portal: "(no dashboard — register flow only)",
    setup: async (db, userId) =>
      ensureRow(db, "beneficiaries", { user_id: userId }, {
        user_id: userId,
        full_name: "Demo Beneficiary",
        category: "patient",
        eligibility_status: "verified",
        status: "active",
      }),
  },
];

// --- minimal .env.local loader (no dotenv dependency) -------------------------
function loadEnv() {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  let raw = "";
  try {
    raw = readFileSync(join(root, ".env.local"), "utf8");
  } catch {
    raw = readFileSync(join(root, ".env"), "utf8"); // fallback
  }
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith("#")) continue;
    let val = m[2].trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    env[m[1]] = val;
  }
  return env;
}

// --- idempotent helper: insert a row only if a matching one doesn't exist ------
async function ensureRow(db, table, matchOn, values) {
  let q = db.from(table).select("id");
  for (const [k, v] of Object.entries(matchOn)) q = q.eq(k, v);
  const { data: existing, error: selErr } = await q.maybeSingle();
  if (selErr) throw new Error(`${table} lookup: ${selErr.message}`);

  if (existing) {
    const { error } = await db.from(table).update(values).eq("id", existing.id);
    if (error) throw new Error(`${table} update: ${error.message}`);
    return "updated";
  }
  const { error } = await db.from(table).insert(values);
  if (error) throw new Error(`${table} insert: ${error.message}`);
  return "inserted";
}

// --- find an existing auth user by email (Admin API has no getByEmail) ---------
async function findAuthUserByEmail(db, email) {
  // Demo roster is tiny; first page is plenty.
  const { data, error } = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) throw new Error(`listUsers: ${error.message}`);
  return data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase()) ?? null;
}

async function main() {
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const DEMO_PASSWORD = env.DEMO_PASSWORD;
  if (!url || !serviceKey) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local"
    );
    process.exit(1);
  }
  if (!DEMO_PASSWORD) {
    console.error("Missing DEMO_PASSWORD in .env.local (set a demo password there).");
    process.exit(1);
  }

  const db = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`\nSeeding ${ROSTER.length} demo accounts → ${url}\n`);

  for (const acct of ROSTER) {
    try {
      // 1) create (or reuse) the auth user, email pre-confirmed
      let userId;
      const { data: created, error: createErr } = await db.auth.admin.createUser({
        email: acct.email,
        password: DEMO_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: acct.full_name },
      });

      if (createErr) {
        const existing = await findAuthUserByEmail(db, acct.email);
        if (!existing) throw new Error(`createUser: ${createErr.message}`);
        userId = existing.id;
        // reset password so the shared credential always works
        await db.auth.admin.updateUserById(userId, {
          password: DEMO_PASSWORD,
          email_confirm: true,
        });
      } else {
        userId = created.user.id;
      }

      // 2) override role on the auto-provisioned public.users row
      const { error: roleErr } = await db
        .from("users")
        .update({ role: acct.role, full_name: acct.full_name, email: acct.email })
        .eq("id", userId);
      if (roleErr) throw new Error(`users.role: ${roleErr.message}`);

      // 3) attach the role-specific record the portal needs
      if (acct.setup) await acct.setup(db, userId);

      console.log(
        `  ✓ ${acct.role.padEnd(15)} ${acct.email.padEnd(26)} ${acct.portal}`
      );
    } catch (err) {
      console.error(`  ✗ ${acct.role.padEnd(15)} ${acct.email} — ${err.message}`);
    }
  }

  console.log(`\nDone. Shared password for every account: ${DEMO_PASSWORD}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
