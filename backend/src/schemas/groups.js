const { z } = require('zod');
const { OPERATORS, FIELD_MAP } = require('../lib/dynamicGroups');

const ruleSchema = z.object({
  field: z.string().refine(
    (f) => FIELD_MAP[f] || /^custom_attributes\.[a-zA-Z0-9_]+$/.test(f),
    { message: 'Unsupported rule field' }
  ),
  op: z.enum([...OPERATORS]),
  value: z.any(),
});

const dynamicRulesSchema = z.object({
  operator: z.enum(['AND', 'OR']).default('AND'),
  rules: z.array(ruleSchema).max(20),
});

const createGroupSchema = z.object({
  name:         z.string().min(1).max(200),
  description:  z.string().max(1000).nullish(),
  groupType:    z.enum(['static', 'dynamic', 'scim_synced']).default('static'),
  dynamicRules: dynamicRulesSchema.optional(),
}).refine(
  (g) => g.groupType !== 'dynamic' || !!g.dynamicRules,
  { message: 'Dynamic groups require dynamicRules' }
);

const updateGroupSchema = z.object({
  name:         z.string().min(1).max(200).optional(),
  description:  z.string().max(1000).nullish(),
  dynamicRules: dynamicRulesSchema.optional(),
  isActive:     z.boolean().optional(),
}).refine((o) => Object.keys(o).length > 0, { message: 'No fields to update' });

const addMemberSchema = z.object({
  userId: z.string().min(1).max(200),
});

module.exports = { createGroupSchema, updateGroupSchema, addMemberSchema };
