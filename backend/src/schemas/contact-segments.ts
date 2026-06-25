import { z } from 'zod';

const OPERATORS = ['eq', 'neq', 'contains', 'starts_with', 'ends_with', 'in', 'before', 'after', 'within_days'] as const;

export const filterConditionSchema = z.object({
  field: z.string().min(1).max(100),  // supports 'segment_attrs.plan_tier' dot notation
  operator: z.enum(OPERATORS),
  value: z.string().max(500),
});

export const filterDefSchema = z.object({
  logic: z.enum(['AND', 'OR']).default('AND'),
  conditions: z.array(filterConditionSchema).max(20),
});

export const createSegmentSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  is_dynamic: z.boolean().optional(),
  filter_def: filterDefSchema,
});

export const updateSegmentSchema = createSegmentSchema.partial().refine(
  (d) => Object.keys(d).length > 0,
  { message: 'At least one field required' }
);

export const addMemberSchema = z.object({
  contact_id: z.string().uuid(),
});

export type FilterDef = z.infer<typeof filterDefSchema>;
export type CreateSegmentInput = z.infer<typeof createSegmentSchema>;
