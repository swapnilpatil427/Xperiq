import { z } from 'zod';

export const createDepartmentSchema = z.object({
  name:               z.string().min(1).max(200),
  description:        z.string().max(1000).nullish(),
  parentDepartmentId: z.string().uuid().nullish(),
  headUserId:         z.string().max(200).nullish(),
  color:              z.string().max(16).nullish(),
  sortOrder:          z.number().int().optional(),
});

export const updateDepartmentSchema = z.object({
  name:               z.string().min(1).max(200).optional(),
  description:        z.string().max(1000).nullish(),
  parentDepartmentId: z.string().uuid().nullish(),
  headUserId:         z.string().max(200).nullish(),
  color:              z.string().max(16).nullish(),
  sortOrder:          z.number().int().optional(),
  isActive:           z.boolean().optional(),
}).refine((o) => Object.keys(o).length > 0, { message: 'No fields to update' });

export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;
export type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>;
