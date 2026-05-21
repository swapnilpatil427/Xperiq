const express = require('express');
const { serverError } = require('../lib/httpError');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');
const { validate }    = require('../lib/validate');
const { inviteMemberSchema, updateRoleSchema } = require('../schemas/orgs');
const router = express.Router();

// GET /api/orgs/me/members
router.get('/members', requireAuth, async (req, res) => {
  if (process.env.SKIP_AUTH === 'true') {
    return res.json({ members: [], total: 0 });
  }
  try {
    const { createClerkClient } = require('@clerk/backend');
    const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
    const list = await clerk.organizations.getOrganizationMembershipList({
      organizationId: req.orgId,
      limit: 100,
    });
    const members = list.data.map((m) => ({
      userId:     m.publicUserData?.userId,
      identifier: m.publicUserData?.identifier,
      firstName:  m.publicUserData?.firstName,
      lastName:   m.publicUserData?.lastName,
      role:       m.role,
      joinedAt:   m.createdAt,
    }));
    res.json({ members, total: members.length });
  } catch (err) {
    serverError(res, err);
  }
});

// POST /api/orgs/me/invitations
router.post('/invitations', requireAuth, requireRole('admin'), validate(inviteMemberSchema), async (req, res) => {
  if (process.env.SKIP_AUTH === 'true') {
    return res.json({ success: true });
  }
  try {
    const { email, role } = req.body;
    const { createClerkClient } = require('@clerk/backend');
    const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
    const invitation = await clerk.organizations.createOrganizationInvitation({
      organizationId: req.orgId,
      emailAddress:   email,
      role:           role || 'org:member',
      inviterUserId:  req.userId,
      redirectUrl:    process.env.APP_URL || 'http://localhost:5173',
    });
    res.json({
      success: true,
      invitation: { id: invitation.id, emailAddress: invitation.emailAddress, status: invitation.status },
    });
  } catch (err) {
    serverError(res, err);
  }
});

// DELETE /api/orgs/me/members/:userId
router.delete('/members/:userId', requireAuth, requireRole('admin'), async (req, res) => {
  if (process.env.SKIP_AUTH === 'true') {
    return res.json({ success: true });
  }
  try {
    const { createClerkClient } = require('@clerk/backend');
    const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
    await clerk.organizations.deleteOrganizationMembership({
      organizationId: req.orgId,
      userId: req.params.userId,
    });
    res.json({ success: true });
  } catch (err) {
    serverError(res, err);
  }
});

// PUT /api/orgs/me/members/:userId/role
router.put('/members/:userId/role', requireAuth, requireRole('admin'), validate(updateRoleSchema), async (req, res) => {
  if (process.env.SKIP_AUTH === 'true') {
    return res.json({ success: true });
  }
  try {
    const { createClerkClient } = require('@clerk/backend');
    const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
    await clerk.organizations.updateOrganizationMembership({
      organizationId: req.orgId,
      userId: req.params.userId,
      role: req.body.role,
    });
    res.json({ success: true });
  } catch (err) {
    serverError(res, err);
  }
});

module.exports = router;
