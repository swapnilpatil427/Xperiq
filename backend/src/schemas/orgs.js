const { z } = require('zod');

const createOrgSchema = z.object({
  name: z.string().max(200).optional(),
});

const updateOrgSchema = z.object({
  name:    z.string().max(200).optional(),
  logoUrl: z.string().max(2000).optional(),
});

const inviteMemberSchema = z.object({
  email: z.string().email(),
  role:  z.string().max(100).optional(),
});

const updateRoleSchema = z.object({
  role: z.string().max(100),
});

module.exports = { createOrgSchema, updateOrgSchema, inviteMemberSchema, updateRoleSchema };
