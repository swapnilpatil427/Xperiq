/**
 * Zod request schemas for Insight Pipeline v2 — Phase 3 manual runs.
 *
 *  - manualRunSchema     — POST /api/insights/:surveyId/runs body
 *  - runPreviewSchema    — POST /api/insights/:surveyId/runs/preview body
 *
 * `mode` selects the run profile (02_ARCHITECTURE.md §2):
 *   refresh → refresh · quick → manual_quick · expert → manual_expert
 *
 * window_start / window_end are optional ISO-8601 datetimes (manual modes scope a
 * time window; refresh uses the configured refresh_lookback_days). They are validated
 * as parseable datetime strings and, when both are present, window_start < window_end.
 */
import { z } from 'zod';

const isoDateTime = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), { message: 'must be an ISO-8601 datetime' });

const windowRefine = (val: { window_start?: string; window_end?: string }, ctx: z.RefinementCtx): void => {
  if (val.window_start != null && val.window_end != null) {
    if (Date.parse(val.window_start) >= Date.parse(val.window_end)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['window_end'],
        message: 'window_end must be after window_start',
      });
    }
  }
};

/** POST /runs body. */
export const manualRunSchema = z
  .object({
    mode:         z.enum(['expert', 'quick', 'refresh']),
    window_start: isoDateTime.optional(),
    window_end:   isoDateTime.optional(),
    label:        z.string().trim().min(1).max(120).optional(),
  })
  .strict()
  .superRefine(windowRefine);

/** POST /runs/preview body — same window inputs, no label (cost estimate only). */
export const runPreviewSchema = z
  .object({
    mode:         z.enum(['expert', 'quick', 'refresh']),
    window_start: isoDateTime.optional(),
    window_end:   isoDateTime.optional(),
  })
  .strict()
  .superRefine(windowRefine);

export type ManualRunInput  = z.infer<typeof manualRunSchema>;
export type RunPreviewInput = z.infer<typeof runPreviewSchema>;
