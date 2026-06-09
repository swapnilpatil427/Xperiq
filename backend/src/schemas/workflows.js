const { z } = require('zod');

const STATUS = ['draft', 'active', 'paused', 'archived', 'error'];

const createWorkflowSchema = z.object({
  name: z.string().min(1, 'name is required').max(200),
  condition: z.record(z.unknown()).optional(),
  action: z.record(z.unknown()).optional(),
  // Graph engine fields (optional — legacy condition/action still supported)
  description: z.string().max(2000).optional(),
  triggerType: z.string().max(64).optional(),
  nodes: z.array(z.record(z.unknown())).optional(),
  edges: z.array(z.record(z.unknown())).optional(),
  status: z.enum(STATUS).optional(),
});

const updateWorkflowSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  condition: z.record(z.unknown()).optional(),
  action: z.record(z.unknown()).optional(),
  description: z.string().max(2000).optional(),
  triggerType: z.string().max(64).optional(),
  nodes: z.array(z.record(z.unknown())).optional(),
  edges: z.array(z.record(z.unknown())).optional(),
  status: z.enum(STATUS).optional(),
});

module.exports = { createWorkflowSchema, updateWorkflowSchema };
