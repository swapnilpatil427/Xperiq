import { z } from 'zod';

export const submitResponseSchema = z.object({
  answers:    z.array(z.record(z.unknown())).min(1, 'answers array is required'),
  publishToken: z.string().min(1, 'publishToken is required'),
  started_at: z.string().optional(),   // ISO timestamp when respondent opened the survey
});

export type SubmitResponseInput = z.infer<typeof submitResponseSchema>;
