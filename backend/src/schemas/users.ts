import { z } from 'zod';

// Invite a user into the org directory (also triggers a Clerk invitation).
export const inviteUserSchema = z.object({
  email:  z.string().email(),
  roleId: z.string().uuid().optional(),       // org_roles.id; defaults to org:member
  jobTitle: z.string().max(200).optional(),
  departmentId: z.string().uuid().nullish(),
});

// Partial profile update (PATCH /api/users/:id).
export const updateUserSchema = z.object({
  firstName:    z.string().max(200).nullish(),
  lastName:     z.string().max(200).nullish(),
  displayName:  z.string().max(400).nullish(),
  jobTitle:     z.string().max(200).nullish(),
  employeeId:   z.string().max(200).nullish(),
  phone:        z.string().max(50).nullish(),
  costCenter:   z.string().max(200).nullish(),
  location:     z.string().max(200).nullish(),
  timezone:     z.string().max(64).optional(),
  locale:       z.string().max(16).optional(),
  departmentId: z.string().uuid().nullish(),
  managerUserId: z.string().max(200).nullish(),
  roleId:       z.string().uuid().nullish(),
  isActive:     z.boolean().optional(),
  customAttributes: z.record(z.string(), z.any()).optional(),
  surveySegments:   z.array(z.string().max(100)).optional(),
}).refine((obj) => Object.keys(obj).length > 0, { message: 'No fields to update' });

export type InviteUserInput = z.infer<typeof inviteUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
