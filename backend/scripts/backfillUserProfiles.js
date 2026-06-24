#!/usr/bin/env node
// One-time backfill: populate user_profiles from existing Clerk org memberships.
//
//   node backend/scripts/backfillUserProfiles.js
//
// Idempotent (ON CONFLICT DO NOTHING). Resilient when Clerk is not configured
// (e.g. local dev) — it logs and exits 0 rather than failing.
'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config();

const db = require('../src/lib/db');
const { ensureBuiltinRoles, getRoleIdByBuiltinKey, upsertProfileFromClerk } = require('../src/lib/userProfiles');
const { clerkRoleToBuiltinKey } = require('../src/lib/rbac');

async function backfill() {
  if (!process.env.CLERK_SECRET_KEY) {
    console.log('[backfill] CLERK_SECRET_KEY not set — nothing to backfill (local dev uses seeded dev-org profiles).');
    return;
  }

  const { createClerkClient } = require('@clerk/backend');
  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

  const { rows: orgs } = await db.query('SELECT org_id FROM org_profiles');
  console.log(`[backfill] processing ${orgs.length} org(s)…`);

  let created = 0;
  for (const { org_id: orgId } of orgs) {
    await ensureBuiltinRoles(orgId);

    let offset = 0;
    const limit = 100;
    let hasMore = true;
    while (hasMore) {
      const list = await clerk.organizations.getOrganizationMembershipList({
        organizationId: orgId, limit, offset,
      });
      for (const m of list.data) {
        const u = m.publicUserData;
        if (!u?.userId) continue;
        const roleId = await getRoleIdByBuiltinKey(orgId, clerkRoleToBuiltinKey(m.role));
        await upsertProfileFromClerk({
          userId: u.userId,
          orgId,
          email: u.identifier || `${u.userId}@unknown.local`,
          firstName: u.firstName || null,
          lastName: u.lastName || null,
          avatarUrl: u.imageUrl || null,
          roleId,
          provisionedBy: 'invite',
        });
        created++;
      }
      hasMore = list.data.length === limit;
      offset += limit;
    }
    console.log(`[backfill] ✓ ${orgId}`);
  }
  console.log(`[backfill] done — ${created} profile(s) upserted.`);
}

backfill()
  .then(() => process.exit(0))
  .catch((err) => { console.error('[backfill] failed:', err.message); process.exit(1); });
