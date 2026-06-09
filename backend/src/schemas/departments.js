const { z } = require('zod');

const createDepartmentSchema = z.object({
  name:               z.string().min(1).max(200),
  description:        z.string().max(1000).nullish(),
  parentDepartmentId: z.string().uuid().nullish(),
  headUserId:         z.string().max(200).nullish(),
  color:              z.string().max(16).nullish(),
  sortOrder:          z.number().int().optional(),
});

const updateDepartmentSchema = z.object({
  name:               z.string().min(1).max(200).optional(),
  description:        z.string().max(1000).nullish(),
  parentDepartmentId: z.string().uuid().nullish(),
  headUserId:         z.string().max(200).nullish(),
  color:              z.string().max(16).nullish(),
  sortOrder:          z.number().int().optional(),
  isActive:           z.boolean().optional(),
}).refine((o) => Object.keys(o).length > 0, { message: 'No fields to update' });

module.exports = { createDepartmentSchema, updateDepartmentSchema };
