import { z } from 'zod';

export const fieldMappingSchema = z.object({
  source: z.string().min(1).max(100),
  dest: z.enum(['email', 'name', 'phone', 'account_name', 'account_id', 'external_id', 'data_region']),
});

export const createSyncConfigSchema = z.object({
  name: z.string().min(1).max(100),
  provider: z.enum(['hubspot', 'salesforce', 'webhook', 'csv_url']),
  config: z.record(z.string(), z.string()).default({}),
  field_mappings: z.array(fieldMappingSchema).min(1).max(30),
  sync_schedule: z.enum(['manual', 'hourly', 'daily', 'weekly']).optional(),
  is_active: z.boolean().optional(),
});

export const updateSyncConfigSchema = createSyncConfigSchema.partial().refine(
  (d) => Object.keys(d).length > 0,
  { message: 'At least one field required' }
);

export type CreateSyncConfigInput = z.infer<typeof createSyncConfigSchema>;
