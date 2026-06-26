/**
 * Zod schemas for the Support System API.
 */
import { z } from 'zod';

// ── Public / user-facing ──────────────────────────────────────────────────────

const PublicContactSchema = z.object({
  name:     z.string().max(200).optional().default('Anonymous'),
  email:    z.string().email().max(500).optional().default('unknown@support'),
  subject:  z.string().min(1).max(300),
  body:     z.string().min(1).max(10_000),
  severity: z.enum(['critical', 'high', 'medium', 'low']).default('medium'),
});

const PublicDocFeedbackSchema = z.object({
  doc_key: z.string().min(1).max(500),
  type:    z.string().min(1).max(100),
  comment: z.string().max(2000).optional(),
});

const CreateTicketSchema = z.object({
  subject:        z.string().min(1).max(300),
  body:           z.string().min(1).max(10_000),
  crystalContext: z.record(z.string(), z.unknown()).optional(),
  severity:       z.enum(['critical', 'high', 'medium', 'low']).default('medium'),
});

const DocFeedbackSchema = z.object({
  doc_key: z.string().min(1).max(500),
  type:    z.string().min(1).max(100),
  comment: z.string().max(2000).optional(),
});

const SearchDocsQuerySchema = z.object({
  q:        z.string().min(1).max(500),
  category: z.string().min(1).max(100).optional(),
  limit:    z.coerce.number().int().min(1).max(20).default(10),
  page:     z.coerce.number().int().min(1).default(1),
});

// ── Internal (service-to-service) ────────────────────────────────────────────

const InternalRefreshDocSchema = z.object({
  key:             z.string().min(1).max(500),
  title:           z.string().min(1).max(500),
  content:         z.string().min(1).optional(),
  contentHtml:     z.string().optional(),
  category:        z.string().min(1).max(100).default('guide'),
  sourceType:      z.string().max(100).optional(),
  sourceRef:       z.string().max(500).optional(),
  qualityScore:    z.number().min(0).max(1).optional(),
  pipeline_status: z.string().optional(),
});

const InternalIngestChangelogSchema = z.object({
  version:    z.string().min(1).max(100),
  title:      z.string().min(1).max(500),
  body:       z.string().max(10_000).optional(),
  releasedAt: z.string().optional(),  // ISO 8601
  summary:    z.string().max(2000).optional(),
  changes:    z.array(z.object({
    type:        z.string(),
    title:       z.string(),
    description: z.string().optional(),
  })).default([]),
  sourceSha: z.string().max(200).optional(),
});

// ── Admin ─────────────────────────────────────────────────────────────────────

const AdminApproveSchema = z.object({
  docId: z.string().uuid(),
});

const AdminRejectSchema = z.object({
  docId:  z.string().uuid(),
  reason: z.string().min(1).max(2000),
});

const AdminEditSectionsSchema = z.object({
  docId: z.string().uuid(),
  sections: z.array(z.object({
    sectionKey: z.string().min(1).max(200),
    content:    z.string().min(1),
    lock:       z.boolean().default(false),
  })).min(1),
});

export {
  PublicContactSchema,
  PublicDocFeedbackSchema,
  CreateTicketSchema,
  DocFeedbackSchema,
  SearchDocsQuerySchema,
  InternalRefreshDocSchema,
  InternalIngestChangelogSchema,
  AdminApproveSchema,
  AdminRejectSchema,
  AdminEditSectionsSchema,
};
