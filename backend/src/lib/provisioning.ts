// Lazy auto-provisioning — the webhook replacement for runtime.
//
// Free Clerk plans can't send webhooks, so a customer who signs up, creates an
// org, or joins a team won't have their org/user rows in the Experient DB. This
// runs on the first authenticated request for a given (org, user) and idempotently
// creates org_profiles + built-in roles + the user's profile from the Clerk token.
//
// Cached per process so it costs nothing after the first request. Best-effort:
// any failure is logged and never blocks the request (the request just proceeds
// with whatever rows already exist).
import { query } from './db';
import { ensureBuiltinRoles, getRoleIdByBuiltinKey, upsertProfileFromClerk } from './userProfiles';
import { clerkRoleToBuiltinKey } from './rbac';
import logger from './logger';

// `${orgId}:${userId}` pairs already provisioned in this process.
const provisioned = new Set<string>();

/** Reset the in-process cache (used by tests). */
export function _resetProvisionCache(): void {
  provisioned.clear();
}

/**
 * Ensure an org + user exist in the directory tables. Call with the Clerk JWT
 * claims after auth. No-ops when there is no real org context.
 */
export async function ensureProvisioned(
  orgId: string | undefined | null,
  userId: string | undefined | null,
  orgRole?: string | null,
): Promise<void> {
  // Skip when there's no active org (orgId falls back to userId when the session
  // isn't org-scoped — nothing org-level to provision in that case).
  if (!orgId || !userId || orgId === userId) return;

  const key = `${orgId}:${userId}`;
  if (provisioned.has(key)) return;
  provisioned.add(key); // optimistic — prevents duplicate work under concurrent requests

  try {
    // 1. org row
    await query(
      `INSERT INTO org_profiles (org_id) VALUES ($1) ON CONFLICT (org_id) DO NOTHING`,
      [orgId],
    );

    // 2. built-in roles for this org (idempotent)
    await ensureBuiltinRoles(orgId);

    // 3. resolve the user's role id from the Clerk role claim
    const builtinKey = clerkRoleToBuiltinKey(orgRole || 'org:member');
    const roleId = await getRoleIdByBuiltinKey(orgId, builtinKey);

    // 4. identity details — best-effort from Clerk (session JWT has no email)
    let email = `${userId}@unknown.local`;
    let firstName: string | null = null;
    let lastName: string | null = null;
    let avatarUrl: string | null = null;
    if (process.env.CLERK_SECRET_KEY) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { createClerkClient } = require('@clerk/backend');
        const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
        const u = await clerk.users.getUser(userId);
        email =
          u?.primaryEmailAddress?.emailAddress ||
          u?.emailAddresses?.[0]?.emailAddress ||
          email;
        firstName = u?.firstName ?? null;
        lastName = u?.lastName ?? null;
        avatarUrl = u?.imageUrl ?? null;
      } catch { /* non-fatal — fall back to placeholder identity */ }
    }

    // 5. upsert the profile
    await upsertProfileFromClerk({
      userId, orgId, email, firstName, lastName, avatarUrl, roleId, provisionedBy: 'manual',
    });
  } catch (err: unknown) {
    provisioned.delete(key); // allow a retry on the next request
    logger.error(
      { event: 'auto_provision_failed', orgId, userId, err: err instanceof Error ? err.message : String(err) },
      'auto-provision failed (non-fatal)',
    );
  }
}
