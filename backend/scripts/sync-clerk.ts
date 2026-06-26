/**
 * Manual Clerk → Experient DB sync (webhook replacement for the free Clerk plan).
 *
 * The Clerk webhook (src/routes/webhooks/clerk.ts) normally keeps org_profiles /
 * org_roles / user_profiles in sync. Free Clerk plans can't send webhooks, so run
 * this after creating an org or adding/removing members:
 *
 *   npm run sync:clerk                 # sync ALL orgs the secret key can see
 *   npm run sync:clerk -- org_123abc   # sync a single organization
 *
 * Seeds built-in roles from the authoritative catalog in src/lib/rbac.ts
 * (BUILTIN_ROLES) — NOT by cloning dev-org. Idempotent + self-healing: re-running
 * refreshes built-in role permissions to match the code catalog.
 *
 * Reads CLERK_SECRET_KEY + DATABASE_URL from backend/.env (via dotenv).
 */
import 'dotenv/config';
import { createClerkClient } from '@clerk/backend';
import { query } from '../src/lib/db';
import { getRoleIdByBuiltinKey, upsertProfileFromClerk } from '../src/lib/userProfiles';
import { BUILTIN_ROLES, clerkRoleToBuiltinKey } from '../src/lib/rbac';

const SECRET = process.env.CLERK_SECRET_KEY;
if (!SECRET) {
  // Demo mode (no Clerk) — nothing to sync. Exit 0 so this never blocks `npm run dev`.
  console.log('[sync-clerk] CLERK_SECRET_KEY not set — skipping (demo mode, nothing to sync).');
  process.exit(0);
}

const clerk = createClerkClient({ secretKey: SECRET });

// Clerk SDK paginates as { data, totalCount }; tolerate a bare array too.
function unwrap<T>(r: unknown): T[] {
  if (Array.isArray(r)) return r as T[];
  const data = (r as { data?: unknown })?.data;
  return Array.isArray(data) ? (data as T[]) : [];
}

/** Seed/refresh the built-in roles for an org from the rbac.ts catalog. */
async function seedBuiltinRoles(orgId: string): Promise<void> {
  for (const r of BUILTIN_ROLES) {
    await query(
      `INSERT INTO org_roles (org_id, name, description, is_builtin, builtin_key, default_permissions, seat_weight)
       VALUES ($1, $2, $3, TRUE, $4, $5::jsonb, $6)
       ON CONFLICT (org_id, builtin_key) DO UPDATE SET
         name                = EXCLUDED.name,
         description         = EXCLUDED.description,
         default_permissions = EXCLUDED.default_permissions,
         seat_weight         = EXCLUDED.seat_weight,
         updated_at          = NOW()`,
      [orgId, r.name, r.description, r.builtinKey, JSON.stringify(r.permissions), r.seatWeight]
    );
  }
}

interface ClerkMembership {
  role: string;
  publicUserData?: {
    userId?: string;
    identifier?: string;
    firstName?: string | null;
    lastName?: string | null;
    imageUrl?: string | null;
  };
}

async function syncOrg(org: { id: string; name?: string | null }): Promise<void> {
  console.log(`[sync-clerk] → ${org.name || '(unnamed)'}  (${org.id})`);

  await query(
    `INSERT INTO org_profiles (org_id, brand_name)
       VALUES ($1, $2)
     ON CONFLICT (org_id) DO UPDATE
       SET brand_name = EXCLUDED.brand_name, updated_at = NOW()`,
    [org.id, org.name ?? null]
  );

  await seedBuiltinRoles(org.id);

  const members = unwrap<ClerkMembership>(
    await clerk.organizations.getOrganizationMembershipList({ organizationId: org.id, limit: 200 })
  );

  for (const m of members) {
    const pud = m.publicUserData ?? {};
    const userId = pud.userId;
    if (!userId) continue;

    const builtinKey = clerkRoleToBuiltinKey(m.role);
    const roleId = await getRoleIdByBuiltinKey(org.id, builtinKey);

    await upsertProfileFromClerk({
      userId,
      orgId: org.id,
      email: pud.identifier ?? `${userId}@unknown.local`,
      firstName: pud.firstName ?? null,
      lastName: pud.lastName ?? null,
      avatarUrl: pud.imageUrl ?? null,
      roleId,
      provisionedBy: 'manual',
    });
    console.log(`[sync-clerk]   • ${pud.identifier ?? userId}  (${m.role} → ${builtinKey})`);
  }
}

async function main(): Promise<void> {
  const onlyOrg = process.argv[2];
  const orgs = unwrap<{ id: string; name?: string }>(
    await clerk.organizations.getOrganizationList({ limit: 200 })
  );

  if (!orgs.length) {
    console.log('[sync-clerk] No organizations found for this Clerk instance.');
    return;
  }

  let synced = 0;
  for (const org of orgs) {
    if (onlyOrg && org.id !== onlyOrg) continue;
    await syncOrg(org);
    synced++;
  }

  if (onlyOrg && synced === 0) console.error(`[sync-clerk] ✗ org ${onlyOrg} not found.`);
  else console.log(`[sync-clerk] ✓ synced ${synced} organization(s).`);
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error(`[sync-clerk] ✗ ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
