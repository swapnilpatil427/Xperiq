import { z } from 'zod';

const STATUS = ['draft', 'active', 'paused', 'archived', 'error'] as const;

export const createWorkflowSchema = z.object({
  name: z.string().min(1, 'name is required').max(200),
  condition: z.record(z.string(), z.unknown()).optional(),
  action: z.record(z.string(), z.unknown()).optional(),
  // Graph engine fields (optional — legacy condition/action still supported)
  description: z.string().max(2000).optional(),
  triggerType: z.string().max(64).optional(),
  nodes: z.array(z.record(z.string(), z.unknown())).optional(),
  edges: z.array(z.record(z.string(), z.unknown())).optional(),
  status: z.enum(STATUS).optional(),
});

export const updateWorkflowSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  condition: z.record(z.string(), z.unknown()).optional(),
  action: z.record(z.string(), z.unknown()).optional(),
  description: z.string().max(2000).optional(),
  triggerType: z.string().max(64).optional(),
  nodes: z.array(z.record(z.string(), z.unknown())).optional(),
  edges: z.array(z.record(z.string(), z.unknown())).optional(),
  status: z.enum(STATUS).optional(),
});

export type CreateWorkflowInput = z.infer<typeof createWorkflowSchema>;
export type UpdateWorkflowInput = z.infer<typeof updateWorkflowSchema>;
