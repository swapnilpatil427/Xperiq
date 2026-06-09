const { z } = require('zod');
const { PERMISSION_ACTIONS, PERMISSION_SCOPES } = require('../lib/rbac');

// A permissions map: only known actions, only known scopes.
const permissionsSchema = z
  .record(z.string(), z.enum(PERMISSION_SCOPES))
  .refine(
    (perms) => Object.keys(perms).every((k) => PERMISSION_ACTIONS.includes(k)),
    { message: `Unknown permission action (allowed: ${PERMISSION_ACTIONS.join(', ')})` }
  );

const createRoleSchema = z.object({
  name:        z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  permissions: permissionsSchema,
  seatWeight:  z.number().min(0).max(9.9).optional(),
  color:       z.string().max(16).optional(),
});

const updateRoleSchema = z.object({
  name:        z.string().min(1).max(120).optional(),
  description: z.string().max(500).nullish(),
  permissions: permissionsSchema.optional(),
  seatWeight:  z.number().min(0).max(9.9).optional(),
  color:       z.string().max(16).nullish(),
}).refine((obj) => Object.keys(obj).length > 0, { message: 'No fields to update' });

module.exports = { createRoleSchema, updateRoleSchema };
