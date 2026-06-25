import { z } from 'zod';

export const createContactSchema = z.object({
  external_id:   z.string().max(255).optional(),
  email:         z.string().email().max(255).optional(),
  name:          z.string().max(255).optional(),
  phone:         z.string().max(50).optional(),
  account_id:    z.string().max(255).optional(),
  account_name:  z.string().max(255).optional(),
  segment_attrs: z.record(z.string(), z.unknown()).optional(),
  consent_given: z.boolean().optional().default(false),
  data_region:   z.string().max(20).optional().default('us'),
});

export const updateContactSchema = z.object({
  external_id:   z.string().max(255).optional(),
  email:         z.string().email().max(255).optional(),
  name:          z.string().max(255).optional(),
  phone:         z.string().max(50).optional(),
  account_id:    z.string().max(255).optional(),
  account_name:  z.string().max(255).optional(),
  segment_attrs: z.record(z.string(), z.unknown()).optional(),
  consent_given: z.boolean().optional(),
  data_region:   z.string().max(20).optional(),
}).refine((o) => Object.keys(o).length > 0, { message: 'No fields to update' });

const importContactItemSchema = z.object({
  external_id:   z.string().max(255).optional(),
  email:         z.string().email().max(255).optional(),
  name:          z.string().max(255).optional(),
  phone:         z.string().max(50).optional(),
  account_id:    z.string().max(255).optional(),
  account_name:  z.string().max(255).optional(),
  segment_attrs: z.record(z.string(), z.unknown()).optional(),
  consent_given: z.boolean().optional(),
}).refine(
  (c) => c.external_id !== undefined || c.email !== undefined,
  { message: 'Each contact must have at least one of external_id or email' },
);

export const importContactsSchema = z.object({
  contacts: z.array(importContactItemSchema).min(1).max(1000),
});

export const generateTokensSchema = z.object({
  contact_ids: z.array(z.string().uuid()).min(1).max(500),
  channel:     z.enum(['link', 'email', 'sms']).optional().default('link'),
});

export type CreateContactInput  = z.infer<typeof createContactSchema>;
export type UpdateContactInput  = z.infer<typeof updateContactSchema>;
export type ImportContactsInput = z.infer<typeof importContactsSchema>;
export type GenerateTokensInput = z.infer<typeof generateTokensSchema>;
