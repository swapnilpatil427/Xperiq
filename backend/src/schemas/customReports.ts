/**
 * Zod request schemas for Insight Pipeline v2 — Phase 6 Custom Analysis.
 *
 *  - customReportSchema        — POST /api/reports/custom body
 *  - customReportPreviewSchema — POST /api/reports/custom/preview body
 *
 * Custom Analysis is a SEPARATE product surface (its own queue + tables). Results are
 * written to custom_reports / custom_report_insights and NEVER to the insights table
 * (03_DATA_MODEL.md §10/§11, 05_CONFIGURATION.md §D).
 *
 * filter_spec shape (03_DATA_MODEL.md §10):
 *   {
 *     date_from?: ISO8601, date_to?: ISO8601,
 *     segments?: [{ field, op, value }],
 *     topics?: [string],
 *     metric_types?: ["nps"|"csat"|"ces"],
 *     narrative_depth?: "summary" | "detailed"
 *   }
 */
import { z } from 'zod';

const isoDateTime = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), { message: 'must be an ISO-8601 datetime' });

const segmentSchema = z
  .object({
    field: z.string().trim().min(1).max(120),
    op:    z.enum(['eq', 'neq', 'in', 'gt', 'lt', 'gte', 'lte', 'contains']).default('eq'),
    value: z.union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number()]))]),
  })
  .strict();

/** filter_spec — all fields optional; a fully-empty spec analyses the whole corpus. */
export const filterSpecSchema = z
  .object({
    date_from:       isoDateTime.optional(),
    date_to:         isoDateTime.optional(),
    segments:        z.array(segmentSchema).max(20).optional(),
    topics:          z.array(z.string().trim().min(1).max(120)).max(50).optional(),
    metric_types:    z.array(z.enum(['nps', 'csat', 'ces'])).max(3).optional(),
    narrative_depth: z.enum(['summary', 'detailed']).optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (val.date_from != null && val.date_to != null) {
      if (Date.parse(val.date_from) >= Date.parse(val.date_to)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['date_to'],
          message: 'date_to must be after date_from',
        });
      }
    }
  });

/** POST /api/reports/custom body. */
export const customReportSchema = z
  .object({
    survey_id:   z.string().trim().min(1),
    name:        z.string().trim().min(1).max(160),
    filter_spec: filterSpecSchema,
  })
  .strict();

/** POST /api/reports/custom/preview body — no name, no debit. */
export const customReportPreviewSchema = z
  .object({
    survey_id:   z.string().trim().min(1),
    filter_spec: filterSpecSchema,
  })
  .strict();

export type FilterSpecInput          = z.infer<typeof filterSpecSchema>;
export type CustomReportInput        = z.infer<typeof customReportSchema>;
export type CustomReportPreviewInput = z.infer<typeof customReportPreviewSchema>;
