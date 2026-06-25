import { z } from 'zod';

const SEVERITY      = ['low', 'medium', 'high', 'critical'] as const;
const CASE_CATEGORY = ['cx', 'esat', 'product', 'compliance'] as const;
const CASE_STATUS   = ['open', 'in_progress', 'escalated', 'resolved', 'closed'] as const;
const MATCH_TYPE    = ['exact', 'prefix', 'contains', 'regex'] as const;
const DIMENSION     = ['segment', 'account', 'touchpoint', 'driver', 'survey'] as const;

export const createCaseSchema = z.object({
  contact_id:     z.string().uuid().optional(),
  response_id:    z.string().uuid().optional(),
  survey_id:      z.string().uuid().optional(),
  insight_id:     z.string().uuid().optional(),
  title:          z.string().min(1).max(200),
  description:    z.string().max(5000).optional(),
  category:       z.enum(CASE_CATEGORY).optional().default('cx'),
  severity:       z.enum(SEVERITY).optional().default('medium'),
  driver_ref:     z.string().max(200).optional(),
  proposal_id:    z.string().uuid().optional(),
  owner_user_id:  z.string().max(255).optional(),
  owner_label:    z.string().max(255).optional(),
});

export const updateCaseSchema = z.object({
  status:        z.enum(CASE_STATUS).optional(),
  severity:      z.enum(SEVERITY).optional(),
  owner_user_id: z.string().max(255).optional(),
  owner_label:   z.string().max(255).optional(),
  description:   z.string().max(5000).optional(),
  note:          z.string().max(1000).optional(),
}).refine((o) => Object.keys(o).length > 0, { message: 'No fields to update' });

export const appendEventSchema = z.object({
  action: z.string().min(1).max(100),
  note:   z.string().max(2000).optional(),
});

export const upsertSlaConfigsSchema = z.object({
  configs: z.array(
    z.object({
      category:         z.string().max(50),
      severity:         z.enum(SEVERITY),
      ack_sla_hrs:      z.number().int().positive(),
      resolve_sla_hrs:  z.number().int().positive().nullish(),
    }),
  ).min(1).max(20),
});

export const createOwnershipRouteSchema = z.object({
  dimension:           z.enum(DIMENSION),
  match_value:         z.string().min(1).max(500),
  match_type:          z.enum(MATCH_TYPE).optional().default('exact'),
  owner_user_id:       z.string().min(1).max(255),
  owner_label:         z.string().max(255).optional(),
  owner_email:         z.string().email().max(255).optional(),
  escalation_user_id:  z.string().max(255).optional(),
  escalation_label:    z.string().max(255).optional(),
  priority:            z.number().int().min(0).max(9999).optional().default(0),
  role_label:          z.string().max(255).optional(),
});

export const updateOwnershipRouteSchema = z.object({
  dimension:           z.enum(DIMENSION).optional(),
  match_value:         z.string().min(1).max(500).optional(),
  match_type:          z.enum(MATCH_TYPE).optional(),
  owner_user_id:       z.string().min(1).max(255).optional(),
  owner_label:         z.string().max(255).optional(),
  owner_email:         z.string().email().max(255).optional(),
  escalation_user_id:  z.string().max(255).optional(),
  escalation_label:    z.string().max(255).optional(),
  priority:            z.number().int().min(0).max(9999).optional(),
  role_label:          z.string().max(255).optional(),
}).refine((o) => Object.keys(o).length > 0, { message: 'No fields to update' });

export type CreateCaseInput            = z.infer<typeof createCaseSchema>;
export type UpdateCaseInput            = z.infer<typeof updateCaseSchema>;
export type AppendEventInput           = z.infer<typeof appendEventSchema>;
export type UpsertSlaConfigsInput      = z.infer<typeof upsertSlaConfigsSchema>;
export type CreateOwnershipRouteInput  = z.infer<typeof createOwnershipRouteSchema>;
export type UpdateOwnershipRouteInput  = z.infer<typeof updateOwnershipRouteSchema>;
