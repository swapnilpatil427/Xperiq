const { z } = require('zod');

const createWorkflowSchema = z.object({
  name: z.string().min(1, 'name is required').max(200),
  condition: z.record(z.unknown()).optional(),
  action: z.record(z.unknown()).optional(),
});

const updateWorkflowSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  condition: z.record(z.unknown()).optional(),
  action: z.record(z.unknown()).optional(),
  status: z.enum(['active', 'paused']).optional(),
});

module.exports = { createWorkflowSchema, updateWorkflowSchema };
