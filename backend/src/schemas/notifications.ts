import { z } from 'zod';

const preferenceSchema = z.object({
  notificationType: z.string().min(1).max(64),
  inAppEnabled: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
  slackEnabled: z.boolean().optional(),
  thresholdConfig: z.record(z.string(), z.any()).optional(),
});

export const updatePreferencesSchema = z.object({
  preferences: z.array(preferenceSchema).min(1).max(100),
});

export type UpdatePreferencesInput = z.infer<typeof updatePreferencesSchema>;
