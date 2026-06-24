import express from 'express';
import type { Request, Response } from 'express';
import { serverError } from '../lib/httpError';
import { requireAuth } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import { validate } from '../lib/validate';
import { inviteMemberSchema, updateRoleSchema } from '../schemas/orgs';

const router = express.Router();

// GET /api/orgs/me/members
router.get('/members', requireAuth, async (req: Request, res: Response): Promise<void> => {
  if (process.env.SKIP_AUTH === 'true') {
    res.json({ members: [], total: 0 });
    return;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createClerkClient } = require('@clerk/backend');
    const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
    const list = await clerk.organizations.getOrganizationMembershipList({
      organizationId: req.orgId,
      limit: 100,
    });
    const members = list.data.map((m: Record<string, unknown>) => {
      const pub = m.publicUserData as Record<string, unknown> | undefined;
      return {
        userId:     pub?.userId,
        identifier: pub?.identifier,
        firstName:  pub?.firstName,
        lastName:   pub?.lastName,
        role:       m.role,
        joinedAt:   m.createdAt,
      };
    });
    res.json({ members, total: members.length });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// POST /api/orgs/me/invitations
router.post('/invitations', requireAuth, requireRole('admin'), validate(inviteMemberSchema), async (req: Request, res: Response): Promise<void> => {
  if (process.env.SKIP_AUTH === 'true') {
    res.json({ success: true });
    return;
  }
  try {
    const { email, role } = req.body;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createClerkClient } = require('@clerk/backend');
    const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
    const invitation = await clerk.organizations.createOrganizationInvitation({
      organizationId: req.orgId,
      emailAddress:   email,
      role:           role || 'org:member',
      inviterUserId:  req.userId,
      redirectUrl:    process.env.APP_URL ?? 'http://localhost:5173',
    });
    res.json({
      success: true,
      invitation: { id: invitation.id, emailAddress: invitation.emailAddress, status: invitation.status },
    });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// DELETE /api/orgs/me/members/:userId
router.delete('/members/:userId', requireAuth, requireRole('admin'), async (req: Request, res: Response): Promise<void> => {
  if (process.env.SKIP_AUTH === 'true') {
    res.json({ success: true });
    return;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createClerkClient } = require('@clerk/backend');
    const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
    await clerk.organizations.deleteOrganizationMembership({
      organizationId: req.orgId,
      userId: req.params.userId,
    });
    res.json({ success: true });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

// PUT /api/orgs/me/members/:userId/role
router.put('/members/:userId/role', requireAuth, requireRole('admin'), validate(updateRoleSchema), async (req: Request, res: Response): Promise<void> => {
  if (process.env.SKIP_AUTH === 'true') {
    res.json({ success: true });
    return;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createClerkClient } = require('@clerk/backend');
    const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
    await clerk.organizations.updateOrganizationMembership({
      organizationId: req.orgId,
      userId: req.params.userId,
      role: req.body.role,
    });
    res.json({ success: true });
  } catch (err: unknown) {
    serverError(res, err instanceof Error ? err : new Error(String(err)));
  }
});

export default router;
