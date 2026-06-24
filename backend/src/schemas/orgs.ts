import { z } from 'zod';

export const createOrgSchema = z.object({
  name: z.string().max(200).optional(),
});

export const updateOrgSchema = z.object({
  name:    z.string().max(200).optional(),
  logoUrl: z.string().max(2000).optional(),
});

export const inviteMemberSchema = z.object({
  email: z.string().email(),
  role:  z.string().max(100).optional(),
});

export const updateRoleSchema = z.object({
  role: z.string().max(100),
});

export type CreateOrgInput = z.infer<typeof createOrgSchema>;
export type UpdateOrgInput = z.infer<typeof updateOrgSchema>;
export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
