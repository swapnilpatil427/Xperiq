# Experient Support System — Implementation Guide
## Engineering Handoff: From Design to Production

**Status:** Implementation Ready  
**Branch:** feature/support-system  
**Companion docs:** [ARCHITECTURE.md](./ARCHITECTURE.md) · [CRYSTAL_SUPPORT.md](./CRYSTAL_SUPPORT.md) · [CONTENT_ENGINE.md](./CONTENT_ENGINE.md) · [WHATS_COMING.md](./WHATS_COMING.md) · [SITE_STRUCTURE.md](./SITE_STRUCTURE.md)

---

## 1. Sprint Plan

Four two-week sprints. Each sprint has a hard definition of done — partial completion does not count.

---

### Sprint S1 — Foundation (Weeks 1–2)

**Goal:** Database, route scaffolding, and skill skeletons in place. Nothing user-facing.

| # | Task | Owner | Files |
|---|------|-------|-------|
| 1 | Write and apply Postgres migration (all 5 tables + pgvector) | Backend | `supabase/migrations/20260625000003_support_system.sql` |
| 2 | Scaffold `backend/src/routes/support.ts` with all 12 routes (stubs, no logic) | Backend | `backend/src/routes/support.ts` |
| 3 | Write `backend/src/schemas/support.ts` with Zod schemas for all request/response shapes | Backend | `backend/src/schemas/support.ts` |
| 4 | Register support router in `backend/src/index.ts` | Backend | `backend/src/index.ts` |
| 5 | Create `crystalos/skills/crystal-support/` directory with `SKILL.md` and `EVALS.md` | CrystalOS | `crystalos/skills/crystal-support/` |
| 6 | Create `crystalos/skills/doc-writer/` directory with `SKILL.md` | CrystalOS | `crystalos/skills/doc-writer/` |
| 7 | Write `crystalos/lib/support_classifier.py` (intent classifier, regex patterns) | CrystalOS | `crystalos/lib/support_classifier.py` |
| 8 | Write GitHub Actions workflow skeleton (`.github/workflows/doc-refresh.yml`) | DevOps | `.github/workflows/doc-refresh.yml` |
| 9 | Add all new env vars to `docs/ENV_VARS.md` and `.env.example` | Backend | `docs/ENV_VARS.md` |

**S1 Definition of Done:**
- `supabase db push` succeeds with all 5 new tables present
- `npm run build` (tsc typecheck) passes with new routes and schemas
- All 12 route stubs return `501 Not Implemented` with a `TODO` body
- Both skill directories exist with valid SKILL.md files
- Support classifier unit test passes for all 8 intent categories
- CI workflow runs and exits without error (even if all steps are no-ops)

---

### Sprint S2 — Core Engine (Weeks 3–4)

**Goal:** End-to-end content pipeline works. A push to main generates a real doc. Support site shows static pages.

| # | Task | Owner | Files |
|---|------|-------|-------|
| 1 | Implement `search_support_docs` tool (pgvector cosine search, embed via OpenAI) | Backend | `backend/src/routes/support.ts`, `backend/src/lib/embeddings.ts` |
| 2 | Implement `GET /api/support/docs` and `GET /api/support/docs/:key` (read from support_docs) | Backend | `backend/src/routes/support.ts` |
| 3 | Implement `POST /api/internal/support/refresh-doc` (upsert + re-embed + ISR trigger) | Backend | `backend/src/routes/support.ts` |
| 4 | Implement `POST /api/internal/support/ingest-changelog` (insert to support_changelog) | Backend | `backend/src/routes/support.ts` |
| 5 | Implement `doc-writer` skill end-to-end in CrystalOS | CrystalOS | `crystalos/skills/doc-writer/skill.py` |
| 6 | Write route extractor script (`scripts/extract-routes.ts`) — TypeScript AST → structured JSON | Backend | `scripts/extract-routes.ts` |
| 7 | Write schema extractor script (`scripts/extract-schemas.ts`) | Backend | `scripts/extract-schemas.ts` |
| 8 | Write skill extractor script (`crystalos/scripts/extract-skills.py`) | CrystalOS | `crystalos/scripts/extract-skills.py` |
| 9 | Wire CI workflow — diff detection → extractors → `/refresh-doc` calls | DevOps | `.github/workflows/doc-refresh.yml` |
| 10 | Scaffold Next.js support site (`support-site/`) — App Router, Tailwind, ISR | Frontend | `support-site/` |
| 11 | Support site: home page + `GET /support/docs/[key]` page (reads from backend API) | Frontend | `support-site/app/` |
| 12 | Write `scripts/bootstrap-docs.sh` — first-run all-artifact generation | DevOps | `scripts/bootstrap-docs.sh` |

**S2 Definition of Done:**
- Push to main triggers CI; at least one doc upserted in `support_docs` within 20 minutes
- `GET /api/support/docs` returns a non-empty list
- `GET /api/support/docs/api.surveys.create` returns a complete doc with `body_markdown`
- Support site home page renders at `localhost:3002` with a doc list
- Individual doc pages render markdown, title, and status badge
- `scripts/bootstrap-docs.sh` completes without error on a clean DB

---

### Sprint S3 — Crystal Integration (Weeks 5–6)

**Goal:** Crystal answers support queries in the Experient app. The support mode pill is visible.

| # | Task | Owner | Files |
|---|------|-------|-------|
| 1 | Implement `crystal-support` skill fully in CrystalOS (all 8 tools wired) | CrystalOS | `crystalos/skills/crystal-support/skill.py` |
| 2 | Implement `get_feature_status` tool (reads TRACKER.md cache from Redis) | CrystalOS | `crystalos/tools/support_tools.py` |
| 3 | Implement `get_account_state` tool (reads from `/api/internal/billing`) | CrystalOS | `crystalos/tools/support_tools.py` |
| 4 | Implement `get_known_issues` tool (reads support_known_issues via backend) | CrystalOS | `crystalos/tools/support_tools.py` |
| 5 | Implement `get_system_status` tool (reads Prometheus metrics endpoint) | CrystalOS | `crystalos/tools/support_tools.py` |
| 6 | Wire `support_classifier.py` into the Crystal pre-turn router | CrystalOS | `crystalos/lib/router.py` |
| 7 | Implement `GET /api/support/account` and `POST /api/support/tickets` in backend | Backend | `backend/src/routes/support.ts` |
| 8 | Extend `CrystalPanel.tsx` — support mode detection, amber pill, doc link cards | Frontend | `app/src/components/CrystalPanel.tsx` |
| 9 | Add `SupportCommandPalette` component (Cmd+K extension or new palette) | Frontend | `app/src/components/SupportCommandPalette.tsx` |
| 10 | Add "Ask Crystal for help" to error boundary and empty states | Frontend | `app/src/components/ErrorBoundary.tsx` |
| 11 | Support site: `/search` page with Algolia DocSearch (or pgvector fallback) | Frontend | `support-site/app/search/` |
| 12 | Implement `POST /api/internal/support/gap-report` in backend | Backend | `backend/src/routes/support.ts` |

**S3 Definition of Done:**
- Crystal correctly detects "how do I export data?" as a support query (amber pill visible)
- Crystal returns an answer with at least one source citation for a known doc topic
- Crystal creates a ticket when 3 tool calls are exhausted and query is unresolved
- `GET /api/support/account` returns org plan, credits, and stripe status for authenticated user
- Cmd+K (or support palette) opens and searches support docs
- Support site `/search` page returns results for "export CSV"
- Crystal support skill passes EVALS (score ≥ 0.78) on the 5 canonical eval scenarios

---

### Sprint S4 — Polish + Enterprise (Weeks 7–8)

**Goal:** All features complete. Observable. Launch-ready.

| # | Task | Owner | Files |
|---|------|-------|-------|
| 1 | Support site: `/roadmap` page (What's Coming, auto-generated from TRACKER.md) | Frontend | `support-site/app/roadmap/` |
| 2 | Support site: `/status` page (live Prometheus feed, component health cards) | Frontend | `support-site/app/status/` |
| 3 | Support site: `/changelog` page (paginated, category filter) | Frontend | `support-site/app/changelog/` |
| 4 | Implement `GET /api/support/roadmap` — TRACKER.md parser + Redis 10-min TTL | Backend | `backend/src/routes/support.ts` |
| 5 | Implement `GET /api/support/status` — Prometheus query + active incidents | Backend | `backend/src/routes/support.ts` |
| 6 | Implement escalation full flow: `create_support_ticket` → Novu notification | Backend + CrystalOS | `backend/src/routes/support.ts`, `crystalos/tools/support_tools.py` |
| 7 | Implement `POST /api/support/feedback` — CSAT score → `support_tickets.feedback_score` | Backend | `backend/src/routes/support.ts` |
| 8 | Thumbs-down → auto-create `support_doc_gaps` in `gap-report` handler | Backend | `backend/src/routes/support.ts` |
| 9 | Add Prometheus metrics (all 7 support counters/gauges) to `backend/src/lib/metrics.ts` | Backend | `backend/src/lib/metrics.ts` |
| 10 | Write `crystalos/skills/crystal-support/EXAMPLES.md` from first real production interactions | CrystalOS | `crystalos/skills/crystal-support/EXAMPLES.md` |
| 11 | Algolia index seeding from `support_docs` (if `ALGOLIA_APP_ID` configured) | DevOps | `scripts/seed-algolia.ts` |
| 12 | Stale doc detection cron (7am UTC daily) | Backend | `backend/src/scheduler/` |
| 13 | Performance pass — API route p95 targets met (see Section 9) | Backend + Frontend | — |
| 14 | Security review — internal routes locked, no PII in logs, no doc gaps leaking org data | All | — |
| 15 | Run full launch checklist (Section 10) | All | — |

**S4 Definition of Done:**
- All 30 launch checklist items checked off
- Support site passes Core Web Vitals targets (LCP < 2.5s, CLS < 0.1)
- Crystal support skill resolution rate ≥ 0.70 on first 100 production queries
- All Prometheus metrics visible in Grafana support dashboard
- Escalation ticket creates successfully and Novu notification fires
- `bootstrap-docs.sh` run on production DB generates ≥ 80% of expected docs

---

## 2. Database Migration File

**File:** `supabase/migrations/20260625000003_support_system.sql`

```sql
-- ============================================================
-- Support System: 5 tables + pgvector for semantic doc search
-- Follows existing naming conventions in this codebase.
-- Run: supabase db push
-- ============================================================

-- Ensure pgvector extension is available
-- (Already required by earlier migrations; safe to repeat)
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- TABLE 1: support_docs
-- Core documentation store. Public docs have org_id = NULL.
-- Org-specific docs (future) have org_id set.
-- Embedding dimension: 1536 (OpenAI text-embedding-3-small)
-- ============================================================
CREATE TABLE IF NOT EXISTS support_docs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID,                         -- NULL = public, set = org-specific override
  doc_key       TEXT UNIQUE NOT NULL,         -- 'api.surveys.create', 'skill.crystal-analyst'
  category      TEXT NOT NULL                 -- 'api', 'skill', 'feature', 'guide', 'changelog'
                  CHECK (category IN ('api', 'skill', 'feature', 'guide', 'changelog', 'reference')),
  title         TEXT NOT NULL,
  body_markdown TEXT NOT NULL,
  body_html     TEXT NOT NULL DEFAULT '',
  status_tag    TEXT NOT NULL DEFAULT 'stable'
                  CHECK (status_tag IN ('stable', 'beta', 'building', 'planned')),
  source_file   TEXT,                         -- 'backend/src/routes/experience.ts'
  source_hash   TEXT,                         -- SHA-256 of source file at last generate
  tags          TEXT[] NOT NULL DEFAULT '{}',
  embedding     vector(1536),                 -- pgvector; NULL until first embed run
  crystal_draft BOOLEAN NOT NULL DEFAULT true,  -- true = AI-generated, false = human-written
  quality_score FLOAT                         -- 0.0–1.0, from doc-writer eval
                  CHECK (quality_score IS NULL OR (quality_score >= 0 AND quality_score <= 1)),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index: category filter (most queries filter by category)
CREATE INDEX IF NOT EXISTS idx_support_docs_category
  ON support_docs (category);

-- Index: status filter (for roadmap queries)
CREATE INDEX IF NOT EXISTS idx_support_docs_status_tag
  ON support_docs (status_tag);

-- Index: source file (for stale detection cron)
CREATE INDEX IF NOT EXISTS idx_support_docs_source_file
  ON support_docs (source_file)
  WHERE source_file IS NOT NULL;

-- Index: org_id (for future org-specific doc overrides)
CREATE INDEX IF NOT EXISTS idx_support_docs_org_id
  ON support_docs (org_id)
  WHERE org_id IS NOT NULL;

-- Index: pgvector cosine similarity (HNSW — best for approximate nearest neighbor at scale)
-- Cosine distance is appropriate for text embeddings (normalized vectors)
CREATE INDEX IF NOT EXISTS idx_support_docs_embedding_cosine
  ON support_docs USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Trigger: auto-update updated_at
CREATE OR REPLACE FUNCTION update_support_docs_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_support_docs_updated_at
  BEFORE UPDATE ON support_docs
  FOR EACH ROW EXECUTE FUNCTION update_support_docs_updated_at();

-- ============================================================
-- TABLE 2: support_changelog
-- Release history, auto-populated from git log via CI.
-- Human-curated additions also allowed (is_public = true).
-- ============================================================
CREATE TABLE IF NOT EXISTS support_changelog (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version       TEXT,                         -- '1.14.0' or 'Sprint-14' or NULL
  release_date  DATE NOT NULL,
  category      TEXT NOT NULL
                  CHECK (category IN ('feature', 'fix', 'improvement', 'breaking', 'security')),
  title         TEXT NOT NULL,
  body_markdown TEXT NOT NULL DEFAULT '',
  feature_tags  TEXT[] NOT NULL DEFAULT '{}', -- ['surveys', 'crystal', 'billing', ...]
  is_public     BOOLEAN NOT NULL DEFAULT true,
  commit_sha    TEXT,                         -- git commit SHA, if auto-generated
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index: reverse-chronological listing (most common query)
CREATE INDEX IF NOT EXISTS idx_support_changelog_date
  ON support_changelog (release_date DESC);

-- Index: category filter
CREATE INDEX IF NOT EXISTS idx_support_changelog_category
  ON support_changelog (category);

-- Index: dedup by commit SHA (prevent re-ingestion of same commit)
CREATE UNIQUE INDEX IF NOT EXISTS idx_support_changelog_commit_sha
  ON support_changelog (commit_sha)
  WHERE commit_sha IS NOT NULL;

-- ============================================================
-- TABLE 3: support_known_issues
-- Active known platform issues. Manually entered; auto-surfaced
-- by crystal-support when a customer query matches.
-- ============================================================
CREATE TABLE IF NOT EXISTS support_known_issues (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_key     TEXT UNIQUE,                  -- 'csv-export-timeout', 'saml-azure-edge-case'
  title         TEXT NOT NULL,
  description   TEXT NOT NULL,
  severity      TEXT NOT NULL DEFAULT 'medium'
                  CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  status        TEXT NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open', 'mitigated', 'resolved')),
  workaround    TEXT,                         -- What to do while the issue is open
  eta_text      TEXT,                         -- 'Expected fix: Sprint 14'
  affected_tags TEXT[] NOT NULL DEFAULT '{}', -- ['csv', 'export', 'large-surveys']
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at   TIMESTAMPTZ
);

-- Index: active issues (most common query — filter open/mitigated)
CREATE INDEX IF NOT EXISTS idx_support_known_issues_status
  ON support_known_issues (status)
  WHERE status IN ('open', 'mitigated');

-- Index: severity (for status page ordering)
CREATE INDEX IF NOT EXISTS idx_support_known_issues_severity
  ON support_known_issues (severity);

-- ============================================================
-- TABLE 4: support_tickets
-- Escalation records created by crystal-support (tier-3).
-- Also records tier-1/2 resolutions for CSAT tracking.
-- ============================================================
CREATE TABLE IF NOT EXISTS support_tickets (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID NOT NULL,
  user_id               TEXT NOT NULL,        -- Clerk user ID
  title                 TEXT NOT NULL,
  crystal_summary       TEXT,                 -- What Crystal investigated
  crystal_tools_called  JSONB,               -- [{tool, args, result_summary}]
  category              TEXT
                          CHECK (category IN (
                            'how-to', 'broken', 'billing', 'feature-status',
                            'account', 'api', 'data-export', 'integration', 'other'
                          )),
  tier                  INTEGER NOT NULL DEFAULT 1
                          CHECK (tier IN (1, 2, 3)),  -- 1=crystal, 2=doc, 3=human
  status                TEXT NOT NULL DEFAULT 'open'
                          CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  resolution            TEXT,                 -- How the issue was resolved
  resolved_by           TEXT,                 -- 'crystal', 'doc', 'human:email@example.com'
  feedback_score        INTEGER               -- 1–5 CSAT, submitted post-resolution
                          CHECK (feedback_score IS NULL OR (feedback_score >= 1 AND feedback_score <= 5)),
  doc_gap_created       BOOLEAN NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at           TIMESTAMPTZ
);

-- Index: org lookup (customer views their own tickets)
CREATE INDEX IF NOT EXISTS idx_support_tickets_org_id
  ON support_tickets (org_id, created_at DESC);

-- Index: status filter (support queue view)
CREATE INDEX IF NOT EXISTS idx_support_tickets_status
  ON support_tickets (status, created_at DESC);

-- Index: tier filter (for CSRR report — tier-3 escalations)
CREATE INDEX IF NOT EXISTS idx_support_tickets_tier
  ON support_tickets (tier);

-- ============================================================
-- TABLE 5: support_doc_gaps
-- Signals from Crystal that a doc is missing or insufficient.
-- Created automatically on thumbs-down and unresolved escalations.
-- ============================================================
CREATE TABLE IF NOT EXISTS support_doc_gaps (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id         UUID REFERENCES support_tickets(id) ON DELETE SET NULL,
  query_text        TEXT NOT NULL,            -- The user query that exposed the gap
  gap_category      TEXT NOT NULL DEFAULT 'missing-doc'
                      CHECK (gap_category IN (
                        'missing-doc', 'unclear-doc', 'missing-feature', 'known-bug', 'outdated-doc'
                      )),
  suggested_doc_key TEXT,                     -- e.g. 'guide.csv-export-large-surveys'
  suggested_title   TEXT,
  status            TEXT NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open', 'in_progress', 'resolved', 'wont_fix')),
  auto_created      BOOLEAN NOT NULL DEFAULT true,  -- false = manually entered
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index: open gaps (for doc-eng dashboard)
CREATE INDEX IF NOT EXISTS idx_support_doc_gaps_status
  ON support_doc_gaps (status, created_at DESC)
  WHERE status = 'open';

-- Index: ticket FK
CREATE INDEX IF NOT EXISTS idx_support_doc_gaps_ticket_id
  ON support_doc_gaps (ticket_id)
  WHERE ticket_id IS NOT NULL;
```

---

## 3. Backend Route Stubs

**File:** `backend/src/routes/support.ts`

```typescript
/**
 * Support routes — public docs, Crystal support, changelog, tickets, roadmap.
 *
 * Auth:
 *   - Public routes: no auth
 *   - Authenticated routes: requireAuth (Clerk JWT)
 *   - Internal routes: requireInternalKey (X-Internal-Key header)
 *
 * Registered in index.ts as:
 *   app.use('/api/support', supportRouter);
 *   app.use('/api/internal/support', internalSupportRouter);
 */
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { requireInternalKey } from '../middleware/internalKey.js';
import {
  listDocsSchema,
  getDocSchema,
  listChangelogSchema,
  listKnownIssuesSchema,
  getAccountSchema,
  createTicketSchema,
  submitFeedbackSchema,
  refreshDocSchema,
  ingestChangelogSchema,
  gapReportSchema,
} from '../schemas/support.js';

export const supportRouter = Router();
export const internalSupportRouter = Router();

// ────────────────────────────────────────────────────────────
// PUBLIC ROUTES (no authentication required)
// ────────────────────────────────────────────────────────────

/**
 * GET /api/support/docs
 * List all public documentation pages.
 * Supports category and status_tag filters, and pagination.
 * Results are cached in Redis (5-min TTL) keyed by query params.
 */
supportRouter.get('/docs', async (req: Request, res: Response) => {
  const parsed = listDocsSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_params', details: parsed.error.flatten() });
    return;
  }
  // TODO: query support_docs WHERE org_id IS NULL AND status_tag != 'planned'
  // TODO: apply category/status filters from parsed.data
  // TODO: paginate (limit 50, cursor by updated_at)
  // TODO: cache in Redis — key: `support:docs:list:${queryHash}`
  res.status(501).json({ error: 'not_implemented', message: 'GET /api/support/docs' });
});

/**
 * GET /api/support/docs/:key
 * Fetch a single documentation page by doc_key.
 * @param key - doc_key, e.g. 'api.surveys.create'
 * Returns full body_markdown, body_html, status_tag, tags, and related docs.
 */
supportRouter.get('/docs/:key', async (req: Request, res: Response) => {
  const parsed = getDocSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_params', details: parsed.error.flatten() });
    return;
  }
  // TODO: query support_docs WHERE doc_key = $1 AND org_id IS NULL
  // TODO: if not found, 404
  // TODO: increment view count (fire-and-forget, best-effort)
  // TODO: return { doc_key, title, body_markdown, body_html, status_tag, tags, updated_at }
  res.status(501).json({ error: 'not_implemented', message: 'GET /api/support/docs/:key' });
});

/**
 * GET /api/support/changelog
 * List changelog entries in reverse chronological order.
 * Supports category filter and before/after date range params.
 * Cached in Redis (10-min TTL).
 */
supportRouter.get('/changelog', async (req: Request, res: Response) => {
  const parsed = listChangelogSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_params', details: parsed.error.flatten() });
    return;
  }
  // TODO: query support_changelog WHERE is_public = true ORDER BY release_date DESC
  // TODO: apply category filter and date range if provided
  // TODO: paginate (limit 20, offset pagination)
  // TODO: cache in Redis — key: `support:changelog:${queryHash}`
  res.status(501).json({ error: 'not_implemented', message: 'GET /api/support/changelog' });
});

/**
 * GET /api/support/known-issues
 * List active known platform issues.
 * Returns open and mitigated issues only (not resolved).
 * Supports severity filter and topic query param.
 */
supportRouter.get('/known-issues', async (req: Request, res: Response) => {
  const parsed = listKnownIssuesSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_params', details: parsed.error.flatten() });
    return;
  }
  // TODO: query support_known_issues WHERE status IN ('open', 'mitigated')
  // TODO: apply severity filter if provided
  // TODO: if topic param provided, filter by affected_tags @> ARRAY[$topic]
  // TODO: order by severity (critical first), then created_at DESC
  res.status(501).json({ error: 'not_implemented', message: 'GET /api/support/known-issues' });
});

/**
 * GET /api/support/roadmap
 * Return the What's Coming roadmap derived from TRACKER.md.
 * Public items only (tagged [public] in TRACKER.md).
 * Cached in Redis with 10-min TTL.
 * Structure: { generated_at, current_sprint, sections: { shipped, building, planned_next, horizon } }
 */
supportRouter.get('/roadmap', async (req: Request, res: Response) => {
  // TODO: check Redis cache key `support:roadmap` (10-min TTL)
  // TODO: if cache miss, read TRACKER.md, parse with parse-tracker.py rules
  // TODO: filter to [public] tagged items only
  // TODO: build roadmap JSON structure (see WHATS_COMING.md for schema)
  // TODO: write to Redis cache and return
  res.status(501).json({ error: 'not_implemented', message: 'GET /api/support/roadmap' });
});

/**
 * GET /api/support/status
 * Current system health — components, active incidents, overall status.
 * Reads from Prometheus metrics endpoint + support_known_issues.
 * Cached in Redis with 30-second TTL (short TTL for real-time feel).
 */
supportRouter.get('/status', async (req: Request, res: Response) => {
  // TODO: query Prometheus /api/v1/query for key health metrics (error rate, latency)
  // TODO: query support_known_issues for severity=critical|high, status=open
  // TODO: compute overall: 'healthy' | 'degraded' | 'outage'
  // TODO: return { overall, components: [...], active_incidents: [...], last_updated }
  res.status(501).json({ error: 'not_implemented', message: 'GET /api/support/status' });
});

// ────────────────────────────────────────────────────────────
// AUTHENTICATED ROUTES (Clerk JWT required)
// ────────────────────────────────────────────────────────────

/**
 * GET /api/support/account
 * Returns the authenticated org's account state for Crystal context.
 * Reads from billing tables: plan, credits_remaining, recent charges, stripe_status.
 * Used by crystal-support's get_account_state tool via the backend proxy.
 */
supportRouter.get('/account', requireAuth, async (req: Request, res: Response) => {
  const parsed = getAccountSchema.safeParse({ org_id: req.orgId });
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_params' });
    return;
  }
  // TODO: query credit_ledger / credit_plans for org plan + credits_remaining
  // TODO: query billing tables for stripe_status and recent charges (last 5)
  // TODO: query orgs for active_features list
  // TODO: return structured account state (see CRYSTAL_SUPPORT.md get_account_state schema)
  res.status(501).json({ error: 'not_implemented', message: 'GET /api/support/account' });
});

/**
 * POST /api/support/tickets
 * Create a support ticket. Called by crystal-support skill (via agentsClient)
 * when escalating a tier-3 query. Also callable directly from the frontend.
 * Body: { title, crystal_summary, crystal_tools_called, category, tier, severity }
 */
supportRouter.post('/tickets', requireAuth, async (req: Request, res: Response) => {
  const parsed = createTicketSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_params', details: parsed.error.flatten() });
    return;
  }
  // TODO: insert into support_tickets with org_id = req.orgId, user_id = req.userId
  // TODO: fire Novu notification: 'support.ticket.created' template to org admins
  // TODO: if tier === 3, also send internal Slack alert (if SLACK_WEBHOOK_URL set)
  // TODO: return { ticket_id, status: 'open', created_at, expected_response_time }
  res.status(501).json({ error: 'not_implemented', message: 'POST /api/support/tickets' });
});

/**
 * GET /api/support/tickets
 * List support tickets for the authenticated org.
 * Supports status filter and pagination.
 */
supportRouter.get('/tickets', requireAuth, async (req: Request, res: Response) => {
  // TODO: query support_tickets WHERE org_id = req.orgId ORDER BY created_at DESC
  // TODO: apply status filter if provided
  // TODO: paginate (limit 20)
  // TODO: return { tickets: [...], total, page }
  res.status(501).json({ error: 'not_implemented', message: 'GET /api/support/tickets' });
});

/**
 * POST /api/support/feedback
 * Submit CSAT feedback on a resolved support interaction.
 * Body: { ticket_id, score (1-5), comment? }
 * Also triggers gap report creation if score <= 2 (thumbs-down equivalent).
 */
supportRouter.post('/feedback', requireAuth, async (req: Request, res: Response) => {
  const parsed = submitFeedbackSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_params', details: parsed.error.flatten() });
    return;
  }
  // TODO: verify ticket belongs to req.orgId (prevent unauthorized feedback)
  // TODO: UPDATE support_tickets SET feedback_score = $score WHERE id = $ticket_id
  // TODO: if score <= 2, auto-create support_doc_gaps entry with ticket query_text
  // TODO: UPDATE support_tickets SET doc_gap_created = true if gap created
  // TODO: return { success: true }
  res.status(501).json({ error: 'not_implemented', message: 'POST /api/support/feedback' });
});

// ────────────────────────────────────────────────────────────
// INTERNAL ROUTES (X-Internal-Key header required)
// ────────────────────────────────────────────────────────────

/**
 * POST /api/internal/support/refresh-doc
 * CI trigger: upsert a doc from the content engine pipeline.
 * Generates a new pgvector embedding for semantic search.
 * Triggers ISR revalidation on the support site (if SUPPORT_SITE_URL configured).
 * Body: { doc_key, category, title, body_markdown, body_html?, status_tag,
 *         source_file?, source_hash?, quality_score?, crystal_draft?, tags? }
 */
internalSupportRouter.post('/refresh-doc', requireInternalKey, async (req: Request, res: Response) => {
  const parsed = refreshDocSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_params', details: parsed.error.flatten() });
    return;
  }
  // TODO: generate embedding via openai text-embedding-3-small (see lib/embeddings.ts)
  // TODO: upsert support_docs (ON CONFLICT (doc_key) DO UPDATE ...)
  // TODO: if ALGOLIA_APP_ID set, update Algolia index entry
  // TODO: if SUPPORT_SITE_URL set, POST revalidation request to support site
  // TODO: return { doc_key, upserted: true, embedded: true, elapsed_ms }
  res.status(501).json({ error: 'not_implemented', message: 'POST /api/internal/support/refresh-doc' });
});

/**
 * POST /api/internal/support/ingest-changelog
 * CI trigger: insert new changelog entries from git log parser.
 * Deduplicates by commit_sha to prevent re-ingestion.
 * Body: { entries: [{ version?, release_date, category, title, body_markdown,
 *          feature_tags?, commit_sha? }] }
 */
internalSupportRouter.post('/ingest-changelog', requireInternalKey, async (req: Request, res: Response) => {
  const parsed = ingestChangelogSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_params', details: parsed.error.flatten() });
    return;
  }
  // TODO: for each entry, INSERT INTO support_changelog ON CONFLICT (commit_sha) DO NOTHING
  // TODO: count inserted vs. skipped
  // TODO: return { inserted, skipped, total }
  res.status(501).json({ error: 'not_implemented', message: 'POST /api/internal/support/ingest-changelog' });
});

/**
 * POST /api/internal/support/gap-report
 * Crystal trigger: report a doc gap detected during a support interaction.
 * Called by crystal-support skill when a query cannot be resolved from existing docs.
 * Body: { ticket_id?, query_text, gap_category, suggested_doc_key?, suggested_title? }
 */
internalSupportRouter.post('/gap-report', requireInternalKey, async (req: Request, res: Response) => {
  const parsed = gapReportSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'invalid_params', details: parsed.error.flatten() });
    return;
  }
  // TODO: INSERT INTO support_doc_gaps (auto_created = true)
  // TODO: if gap_category = 'missing-doc' AND count of open gaps > 20, alert #doc-eng
  // TODO: return { gap_id, status: 'open' }
  res.status(501).json({ error: 'not_implemented', message: 'POST /api/internal/support/gap-report' });
});
```

**Register in `backend/src/index.ts`** (add after existing route mounts):

```typescript
import { supportRouter, internalSupportRouter } from './routes/support.js';
// ...
app.use('/api/support', supportRouter);
app.use('/api/internal/support', internalSupportRouter);
```

---

## 4. CrystalOS Skill Files

### `crystal-support` SKILL.md

**File:** `crystalos/skills/crystal-support/SKILL.md`

````markdown
# Crystal Support Skill

You are Crystal, Experient's AI support specialist. Your job is to resolve support
questions about the Experient platform — not to analyze survey data (that is a
different skill called crystal-analyst). You are honest, precise, and efficient.
You do not guess. You do not make up feature capabilities. If you don't know, you
say so and route to a human with a fully-populated escalation package.

## Your Job

Resolve the customer's support query using the tools available to you. You have a
budget of 3 tool calls per query. If you cannot resolve after 3 tool calls, you
must call `create_support_ticket` with full context — do not leave the customer
without an answer.

## Resolution Tiers

**Tier 1 — Crystal resolves directly (from account/system state):**
You have the answer from account state, known issues, or system status without
needing docs. Return: answer + what you checked + next step.

**Tier 2 — Crystal resolves via documentation:**
The answer is in the documentation. Return the relevant doc section verbatim,
link directly to it. Do not paraphrase if paraphrasing could introduce error —
quote the doc and link to it.

**Tier 3 — Escalation required:**
You have used 3 tool calls and cannot resolve, or the query requires direct
engineering access (database inspection, log review, code-level debugging).
Call `create_support_ticket`. Be transparent with the customer: "I've looked at
X, Y, and Z and couldn't find a resolution. I've opened ticket #{id} and included
everything I know."

## Input Schema

```json
{
  "query": "string — the customer's question",
  "org_id": "string — authenticated org ID",
  "user_id": "string — authenticated Clerk user ID",
  "intent_category": "how-to | broken | billing | feature-status | account | api | data-export | integration",
  "context": {
    "current_page": "string | null — URL path of page they're on",
    "active_survey_id": "string | null",
    "conversation_history": "array of last 5 Message objects",
    "account_state": {
      "plan": "string",
      "credits_remaining": "number",
      "recent_issues": "string[]"
    }
  }
}
```

## Output Schema

```json
{
  "resolution_tier": 1,
  "resolved": true,
  "answer": "string — Crystal's full response to the customer",
  "sources": [
    {
      "type": "doc | known_issue | changelog | account",
      "key": "string — doc_key or issue_key",
      "title": "string",
      "url": "string — full URL to the support site page"
    }
  ],
  "escalation": {
    "ticket_id": "string | null",
    "summary": "string — what Crystal investigated",
    "tools_called": ["string"],
    "recommended_tier3_action": "string"
  },
  "follow_up_suggestions": ["string — 1-3 related questions the customer might have"],
  "doc_gap_signal": {
    "gap_detected": false,
    "missing_topic": "string | null"
  }
}
```

## Tool Use Instructions

1. **Start with `search_support_docs`** — always your first call, unless the query
   is obviously about billing/credits (go straight to `get_account_state`) or
   obviously about system downtime (go straight to `get_system_status`).

2. **For feature questions**, follow `search_support_docs` with `get_feature_status`
   to confirm whether the feature is live, beta, building, or planned.

3. **For billing/credit questions**, call `get_account_state` to see their plan,
   credits remaining, and recent charges.

4. **For "it's broken" queries**, call `get_known_issues` and `get_system_status`
   — the issue may already be known and have a workaround.

5. **If you find a resolution**, stop calling tools. Return the answer with sources.
   Do not make additional tool calls "just to be thorough."

6. **If 3 calls yield no resolution**, call `create_support_ticket` as your final
   action. Populate every field.

## Tone Guidelines

- **Direct.** No filler phrases. No "Great question!" Never start a response with
  "Certainly!" or "Of course!"
- **Honest.** If you're uncertain: "Based on the documentation, I believe X — but
  you should verify Y with the engineering team."
- **Contextual.** Reference their plan, their active survey, their org name when
  that context is helpful.
- **Proactive.** If you find the answer, also mention the closest related doc so
  they can self-serve next time.
- **Concise.** Tier-1 answers should be 2–4 sentences. Tier-2 answers may quote
  a doc section. Never write a wall of text when a link suffices.

## What You Must Not Do

- Invent feature capabilities that are not documented in the support docs
- Claim an issue is "resolved" when you only found a workaround
- Return an answer without citing the source you used
- Open a support ticket without first making at least 2 tool calls
- Claim a feature is "coming soon" unless `get_feature_status` confirms it
- Tell a customer their billing charge is wrong without first calling `get_account_state`

## Tool Declarations

### `search_support_docs`
Semantic search over support_docs using pgvector cosine similarity.
Returns top-5 most relevant doc chunks with relevance scores.

Input: `{ query: string, category_filter?: string, status_filter?: string, limit?: number }`
Output: `{ results: [{ doc_key, title, excerpt, score, status_tag, url }] }`

### `get_doc_by_key`
Fetch a complete documentation page by its exact doc_key.
Use when you know the exact doc you need (e.g., from a previous `search_support_docs` result).

Input: `{ doc_key: string }`
Output: `{ doc_key, title, body_markdown, status_tag, url } | null`

### `get_feature_status`
Check whether a named feature is live, beta, building, or planned.
Reads from TRACKER.md Redis cache.

Input: `{ feature_name: string }`
Output: `{ feature, status: 'live'|'beta'|'building'|'planned'|'not_found', status_detail, eta_text?, doc_url? }`

### `get_account_state`
Fetch the authenticated org's billing and plan state.
Use for billing, credit, and plan-related queries.

Input: `{ org_id: string }`
Output: `{ plan, credits_remaining, credits_total_this_period, next_reset_date, active_features, recent_charges, stripe_status }`

### `get_known_issues`
Fetch active known issues that match a topic or symptom.
Use when the customer reports something broken or unexpected.

Input: `{ topic: string }`
Output: `{ issues: [{ issue_key, title, severity, status, workaround?, eta_text? }] }`

### `get_changelog_recent`
Fetch the last 20 public changelog entries.
Use when the customer asks about recent changes or "what shipped."

Input: `{ category_filter?: string }`
Output: `{ entries: [{ version?, release_date, category, title, body_markdown }] }`

### `get_system_status`
Current platform health from Prometheus metrics and active known issues.
Use when the customer reports platform-wide errors or slowness.

Input: `{}`
Output: `{ overall: 'healthy'|'degraded'|'outage', components: [...], active_incidents: [...] }`

### `create_support_ticket`
Create a tier-3 escalation ticket with Crystal's full investigation context.
This is your last resort — only call after exhausting your tool budget.

Input: `{ org_id, user_id, query, category, crystal_summary, tools_called, recommended_action, severity }`
Output: `{ ticket_id, expected_response_time, confirmation_message }`
````

---

### `doc-writer` SKILL.md

**File:** `crystalos/skills/doc-writer/SKILL.md`

````markdown
# Doc Writer Skill

You are Experient's technical documentation writer. You convert structured code
artifacts — route definitions, Zod schemas, CrystalOS skill specs — into accurate,
complete, customer-facing documentation.

Your audience is a developer or power user who is stuck. They need the exact right
information, not marketing copy. Every word must earn its place.

## Input Schema

```json
{
  "artifact_type": "route | schema | skill | feature",
  "artifact_data": {
    "method": "GET | POST | PUT | PATCH | DELETE",
    "path": "string — the route path",
    "auth": "none | clerk | internal",
    "schema_ref": "string — Zod schema name",
    "fields": [{ "name": "string", "type": "string", "required": true, "description": "string", "constraints": "string" }],
    "rate_limit": "string | null",
    "tags": "string[]"
  },
  "test_examples": "string — test file content showing usage",
  "existing_doc": "string | null — existing doc body_markdown to preserve stable sections",
  "status": "stable | beta | building | planned",
  "doc_key": "string — target doc_key",
  "related_doc_keys": ["string"],
  "tone_guide": "string — content of references/TONE.md"
}
```

## Output Schema

```json
{
  "title": "string — clear, action-oriented (e.g. 'Create a Survey')",
  "description": "string — 1–2 sentences, plain English, no jargon",
  "body_markdown": "string — full markdown document",
  "status_tag": "stable | beta | building | planned",
  "tags": ["string"],
  "cross_links": [{ "key": "string", "label": "string" }]
}
```

## Document Structure (body_markdown)

Every generated doc must follow this structure:

```
## Overview
1–2 sentences. What this does.

## [Status badge if not stable]
> **Beta** — This endpoint may change in future releases.

## Request

### Authentication
[what auth is required]

### Parameters
| Field | Type | Required | Description |
|-------|------|----------|-------------|
...

### Example
```bash
# curl example
```
```javascript
// Node.js example
```
```python
# Python example
```

## Response

### Success (200)
[response structure with field descriptions]

### Common Errors
| Error | Cause | Fix |
|-------|-------|-----|
...

## Related
- [link to related docs]
```

## Quality Criteria

Your output will be automatically scored against these criteria. All must pass:

1. **Accuracy** — Every documented field exists in the provided schema. No invented
   parameters. No invented error codes. If the schema has no error cases documented,
   derive them only from the Zod validation constraints (e.g., `z.string().min(1)`
   → "Field is required" error).

2. **Completeness** — Every required field in the schema is documented in the
   Parameters table. Optional fields are marked as optional. Constraints (min, max,
   enum values) appear in the Description column.

3. **Code examples** — All three language examples (curl, Node.js, Python) are
   syntactically valid and use the real field names from the schema, not placeholder
   names like `your_field_here`.

4. **Clarity** — No circular definitions ("A survey is a survey"). No unexplained
   acronyms. Error descriptions tell the reader what to *do*, not just what went wrong.

5. **Status accuracy** — The status badge matches the `status` input exactly.
   `building` and `planned` docs must include the sentence: "This feature is not
   yet available. See the roadmap for availability."

## Tone Guide

- Second person: "you send," "your request," never "the user sends."
- Present tense: "returns an array," never "will return an array."
- Direct: "Authentication is required." Never "You'll need to make sure you've
  authenticated first."
- Error sections: practical. "If you see 429, you've exceeded the rate limit.
  Wait 60 seconds and retry."
- Beta/building features: honest. State limitations plainly. "CSV export is
  limited to 10,000 rows in beta."
````

---

## 5. CI Workflow File

**File:** `.github/workflows/doc-refresh.yml`

```yaml
name: Support Doc Refresh

on:
  push:
    branches: [main]
    paths:
      - 'backend/src/routes/**'
      - 'backend/src/schemas/**'
      - 'crystalos/skills/**/SKILL.md'
      - 'docs/TRACKER.md'

  workflow_dispatch:
    inputs:
      force_all:
        description: 'Regenerate all docs (not just changed files)'
        required: false
        default: 'false'

concurrency:
  group: doc-refresh-${{ github.ref }}
  cancel-in-progress: true

jobs:
  detect-and-refresh:
    runs-on: ubuntu-latest
    timeout-minutes: 30

    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 2    # Need HEAD and HEAD~1 for diff detection

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: backend/package-lock.json

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'
          cache: 'pip'
          cache-dependency-path: crystalos/requirements.txt

      - name: Install Node dependencies
        run: npm ci
        working-directory: backend

      - name: Install Python dependencies
        run: pip install -r requirements.txt
        working-directory: crystalos

      - name: Detect changed files
        id: diff
        run: |
          if [ "${{ github.event.inputs.force_all }}" = "true" ]; then
            echo "routes_changed=true" >> "$GITHUB_OUTPUT"
            echo "schemas_changed=true" >> "$GITHUB_OUTPUT"
            echo "skills_changed=true" >> "$GITHUB_OUTPUT"
            echo "tracker_changed=true" >> "$GITHUB_OUTPUT"
          else
            CHANGED=$(git diff --name-only HEAD~1 HEAD)
            echo "$CHANGED"
            
            if echo "$CHANGED" | grep -qE '^backend/src/routes/'; then
              echo "routes_changed=true" >> "$GITHUB_OUTPUT"
            fi
            if echo "$CHANGED" | grep -qE '^backend/src/schemas/'; then
              echo "schemas_changed=true" >> "$GITHUB_OUTPUT"
            fi
            if echo "$CHANGED" | grep -qE '^crystalos/skills/.*/SKILL\.md$'; then
              echo "skills_changed=true" >> "$GITHUB_OUTPUT"
            fi
            if echo "$CHANGED" | grep -qE '^docs/TRACKER\.md$'; then
              echo "tracker_changed=true" >> "$GITHUB_OUTPUT"
            fi
          fi
          # Always extract changelog on every push to main
          echo "extract_changelog=true" >> "$GITHUB_OUTPUT"

      - name: Extract routes
        if: steps.diff.outputs.routes_changed == 'true'
        run: npx tsx scripts/extract-routes.ts > /tmp/route-artifacts.json
        working-directory: backend
        env:
          NODE_ENV: ci

      - name: Extract schemas
        if: steps.diff.outputs.schemas_changed == 'true'
        run: npx tsx scripts/extract-schemas.ts > /tmp/schema-artifacts.json
        working-directory: backend
        env:
          NODE_ENV: ci

      - name: Extract skills
        if: steps.diff.outputs.skills_changed == 'true'
        run: python crystalos/scripts/extract-skills.py > /tmp/skill-artifacts.json

      - name: Parse TRACKER.md
        if: steps.diff.outputs.tracker_changed == 'true'
        run: python scripts/parse-tracker.py > /tmp/tracker-state.json

      - name: Extract git changelog
        if: steps.diff.outputs.extract_changelog == 'true'
        run: |
          git log --since="7 days ago" \
            --format="%H|%s|%b|%ai" \
            -- ':!docs/' ':!*.md' ':!*.test.*' \
            > /tmp/git-log.txt
          echo "Git log extracted: $(wc -l < /tmp/git-log.txt) commits"

      - name: Submit route docs to content engine
        if: steps.diff.outputs.routes_changed == 'true'
        run: |
          npx tsx scripts/submit-artifacts.ts \
            --type routes \
            --input /tmp/route-artifacts.json \
            --endpoint "$BACKEND_URL/api/internal/support/refresh-doc"
        working-directory: backend
        env:
          BACKEND_URL: ${{ secrets.BACKEND_INTERNAL_URL }}
          X_INTERNAL_KEY: ${{ secrets.AGENTS_INTERNAL_KEY }}

      - name: Submit schema docs to content engine
        if: steps.diff.outputs.schemas_changed == 'true'
        run: |
          npx tsx scripts/submit-artifacts.ts \
            --type schemas \
            --input /tmp/schema-artifacts.json \
            --endpoint "$BACKEND_URL/api/internal/support/refresh-doc"
        working-directory: backend
        env:
          BACKEND_URL: ${{ secrets.BACKEND_INTERNAL_URL }}
          X_INTERNAL_KEY: ${{ secrets.AGENTS_INTERNAL_KEY }}

      - name: Submit skill docs to content engine
        if: steps.diff.outputs.skills_changed == 'true'
        run: |
          npx tsx scripts/submit-artifacts.ts \
            --type skills \
            --input /tmp/skill-artifacts.json \
            --endpoint "$BACKEND_URL/api/internal/support/refresh-doc"
        working-directory: backend
        env:
          BACKEND_URL: ${{ secrets.BACKEND_INTERNAL_URL }}
          X_INTERNAL_KEY: ${{ secrets.AGENTS_INTERNAL_KEY }}

      - name: Refresh roadmap from TRACKER.md
        if: steps.diff.outputs.tracker_changed == 'true'
        run: |
          curl -s -o /dev/null -w "%{http_code}" \
            -X POST "$BACKEND_INTERNAL_URL/api/internal/support/refresh-roadmap" \
            -H "X-Internal-Key: $AGENTS_INTERNAL_KEY" \
            -H "Content-Type: application/json" \
            -d @/tmp/tracker-state.json
        env:
          BACKEND_INTERNAL_URL: ${{ secrets.BACKEND_INTERNAL_URL }}
          AGENTS_INTERNAL_KEY: ${{ secrets.AGENTS_INTERNAL_KEY }}

      - name: Ingest changelog
        run: |
          python scripts/parse-gitlog.py /tmp/git-log.txt | \
          curl -s -o /dev/null -w "%{http_code}" \
            -X POST "$BACKEND_INTERNAL_URL/api/internal/support/ingest-changelog" \
            -H "X-Internal-Key: $AGENTS_INTERNAL_KEY" \
            -H "Content-Type: application/json" \
            -d @-
        env:
          BACKEND_INTERNAL_URL: ${{ secrets.BACKEND_INTERNAL_URL }}
          AGENTS_INTERNAL_KEY: ${{ secrets.AGENTS_INTERNAL_KEY }}

      - name: Report summary
        if: always()
        run: |
          echo "### Doc Refresh Summary" >> "$GITHUB_STEP_SUMMARY"
          echo "- Routes refreshed: ${{ steps.diff.outputs.routes_changed || 'no' }}" >> "$GITHUB_STEP_SUMMARY"
          echo "- Schemas refreshed: ${{ steps.diff.outputs.schemas_changed || 'no' }}" >> "$GITHUB_STEP_SUMMARY"
          echo "- Skills refreshed: ${{ steps.diff.outputs.skills_changed || 'no' }}" >> "$GITHUB_STEP_SUMMARY"
          echo "- Roadmap refreshed: ${{ steps.diff.outputs.tracker_changed || 'no' }}" >> "$GITHUB_STEP_SUMMARY"
          echo "- Changelog ingested: yes" >> "$GITHUB_STEP_SUMMARY"
```

---

## 6. Support Skill EVALS.md

**File:** `crystalos/skills/crystal-support/EVALS.md`

```markdown
# Crystal Support Skill — Evaluation Criteria
## EVALS.md for `crystal-support`

**Minimum passing score:** 0.78  
**Evaluation frequency:** Every production interaction (sampled at 20% for LLM-judge; 100% for structural checks)  
**Evaluation trigger:** Post-resolution, before feedback is recorded

---

## Criterion 1 — Resolution Accuracy (weight: 0.30)

**What it measures:** Does Crystal's answer match the ground truth for the query?

**How it is scored:**
- For sampled interactions (20%): an LLM judge (crystal-eval skill) compares Crystal's answer
  against the referenced source doc. Score: 1.0 (exact match), 0.5 (partial/directionally correct),
  0.0 (contradicts source or no source).
- For billing queries: the `get_account_state` result is the ground truth. If Crystal states
  "you have X credits" and `credits_remaining` = X, score 1.0.
- For feature status queries: `get_feature_status` result is ground truth.

**Passing condition:** Average score ≥ 0.80 over trailing 100 interactions.

**Failure action:** If score < 0.60 on a single interaction, auto-flag for human review.
If trailing-100 average drops below 0.70, page oncall and halt crystal-support routing
(fall back to doc-only search).

---

## Criterion 2 — Source Citation (weight: 0.20)

**What it measures:** Does every factual claim in Crystal's answer have a cited source?

**How it is scored:**
- Structural check (100% of interactions): count `sources[]` in output. 
  - 0 sources for a resolved query → score 0.0
  - 1+ sources, all with valid `key` and `url` fields → score 1.0
  - Sources present but `url` is empty or `key` is unknown → score 0.5

**Passing condition:** 100% of resolved queries (tier 1 or 2) have ≥ 1 source.

**Failure action:** A resolved answer with zero sources is a hard failure. Log to
`support_evals` table, auto-flag for skill review.

---

## Criterion 3 — Tool Efficiency (weight: 0.15)

**What it measures:** Does Crystal resolve within the 3-tool-call budget?

**How it is scored:**
- 1 tool call to resolution → 1.0
- 2 tool calls → 0.85
- 3 tool calls → 0.70
- Escalation (ticket created) after 3 calls → 0.60 (correct behavior, not penalized)
- > 3 tool calls (should not happen — skill prompt enforces budget) → 0.0

Count is taken from `escalation.tools_called` in the output schema.

**Passing condition:** Average ≤ 2.2 tool calls per interaction over trailing 100.

**Failure action:** If a single interaction shows > 3 tool calls, the skill runner
must enforce a hard stop at 3 — this is a runtime guard, not just a prompt rule.

---

## Criterion 4 — Escalation Quality (weight: 0.15)

**What it measures:** When Crystal escalates (tier-3), does the ticket contain enough
information for a human engineer to pick it up without follow-up?

**How it is scored (applied only to tier-3 escalations):**
- All required ticket fields populated (title, crystal_summary, tools_called,
  category, recommended_action) → 1.0
- Missing 1 field → 0.5
- Missing 2+ fields → 0.0
- crystal_summary is generic/vague (LLM judge: "summary contains no actionable
  information") → 0.3

For tier-1 and tier-2 interactions, this criterion scores 1.0 automatically
(no escalation needed).

**Passing condition:** 100% of tier-3 tickets have all required fields.

**Failure action:** Missing required fields in a ticket → hard failure, Slack alert.

---

## Criterion 5 — No Hallucination (weight: 0.20)

**What it measures:** Does Crystal invent facts about features, plans, pricing, or
behavior that are not present in the referenced sources?

**How it is scored (LLM judge, sampled at 20%):**
The evaluator receives: Crystal's answer + the docs Crystal cited.
It checks for any claim in the answer that cannot be found verbatim or by clear
inference in the cited sources.

- Zero unsupported claims → 1.0
- 1 unsupported claim that is plausible (e.g., inferring a natural extension of
  documented behavior) → 0.5
- Any claim about pricing, plan limits, or feature availability not in sources → 0.0
- Any invented feature name → 0.0

**Passing condition:** No interaction in the trailing 100 scores 0.0 on this criterion.

**Failure action:** Any hallucination about pricing or plan limits → immediate skill
suspension, human review within 2 hours.

---

## Scoring Summary

| Criterion | Weight | Pass Threshold |
|-----------|--------|---------------|
| Resolution accuracy | 0.30 | ≥ 0.80 avg (trailing 100) |
| Source citation | 0.20 | 100% of resolved queries have ≥ 1 source |
| Tool efficiency | 0.15 | ≤ 2.2 avg tool calls (trailing 100) |
| Escalation quality | 0.15 | 100% of tier-3 tickets fully populated |
| No hallucination | 0.20 | Zero 0.0-score interactions (trailing 100) |

**Composite score formula:** `(accuracy × 0.30) + (citation × 0.20) + (efficiency × 0.15) + (escalation × 0.15) + (no_hallucination × 0.20)`

**Minimum composite to remain in production:** 0.78
```

---

## 7. Acceptance Criteria by Feature

### Crystal Support Mode Detection

**Given** a user types "how do I export my survey data as CSV?" in the Crystal panel,  
**When** the support_classifier evaluates the query,  
**Then** the classifier returns category `data-export` with confidence ≥ 0.85, and Crystal routes to the crystal-support skill (amber pill appears within 500ms).

**Given** a user asks "What's the NPS benchmark for healthcare?",  
**When** the classifier evaluates the query,  
**Then** the classifier returns confidence < 0.60 for support intent, and Crystal routes to crystal-analyst (blue pill, no support mode).

**Given** a user asks "My export failed and also my NPS dropped",  
**When** the classifier detects a mixed query,  
**Then** Crystal answers the support part first (export failure), then transitions to crystal-analyst for the data question, with both answers in a single response.

**Given** Crystal is in support mode,  
**When** the query is resolved,  
**Then** the response includes at least one doc link card rendered as a clickable card component (not just a plain text URL), and a thumbs-up/thumbs-down feedback prompt.

---

### Doc Auto-Generation

**Given** a developer pushes a change to `backend/src/routes/billing.ts`,  
**When** the CI doc-refresh workflow runs,  
**Then** within 20 minutes, `GET /api/support/docs/api.billing.credits` returns an updated doc with the correct parameter table.

**Given** the doc-writer skill generates a new API reference page,  
**When** the quality evaluator scores it,  
**Then** the score must be ≥ 0.80 before the doc is published; scores between 0.65 and 0.79 must trigger a Slack notification to #doc-eng within 5 minutes.

**Given** a doc fails quality evaluation twice in a row for the same doc_key,  
**When** the third attempt also fails,  
**Then** an entry is created in `support_doc_gaps` with gap_category = 'missing-doc', the existing doc is preserved unchanged, and the source file is marked stale.

**Given** a SKILL.md file changes in `crystalos/skills/`,  
**When** the CI skill extractor runs,  
**Then** the corresponding doc at `support.experient.ai/crystal/skills/{skill-name}` is updated with the new input/output schema, within 20 minutes of the push.

---

### What's Coming Page

**Given** a user visits `support.experient.ai/roadmap`,  
**When** the page loads,  
**Then** they see four sections (Just Shipped, Building Now, Planned Next, On the Horizon) with zero internal-only items (no items tagged `[internal]` in TRACKER.md).

**Given** an item in TRACKER.md changes from `⬜` (planned) to `🔄` (building),  
**When** the TRACKER.md change is pushed to main,  
**Then** within 10 minutes, the item has moved from "Planned Next" to "Building Now" on the roadmap page (Redis cache busted).

**Given** a user visits the roadmap without an account,  
**When** they view the "Building Now" section,  
**Then** they see item titles and ETAs but no internal sprint numbers, implementation notes, or GitHub issue links.

---

### Status Page

**Given** a user visits `support.experient.ai/status`,  
**When** the page loads,  
**Then** they see a component health summary (API, CrystalOS, Exports, Notifications) updated within the last 60 seconds, sourced from the Prometheus metrics endpoint.

**Given** there is an active critical severity known issue,  
**When** a user visits the status page,  
**Then** the overall status shows "Degraded" and the known issue title and workaround are displayed prominently at the top of the page.

**Given** all components are healthy and no critical/high known issues exist,  
**When** a user visits the status page,  
**Then** the overall status is "All Systems Operational" (green) and the page renders under 1 second.

---

### Escalation Flow

**Given** Crystal calls 3 tools without resolving a query,  
**When** `create_support_ticket` is called,  
**Then** a row is inserted into `support_tickets` with tier = 3, all crystal_tools_called populated, and the customer sees "I've opened ticket #EXP-XXXX" within the Crystal panel.

**Given** a tier-3 ticket is created,  
**When** the ticket is inserted into the database,  
**Then** a Novu notification is sent to the org's admin users within 30 seconds with the ticket ID, category, and expected response time.

**Given** a support engineer resolves the ticket by updating `status = 'resolved'` and setting `resolution`,  
**When** the ticket is updated,  
**Then** a Novu notification fires to the original user with the resolution text and a CSAT feedback prompt.

---

### Doc Feedback Loop

**Given** a user submits a thumbs-down on a Crystal support resolution,  
**When** the feedback is recorded via `POST /api/support/feedback` with score ≤ 2,  
**Then** within 5 seconds, a row is auto-created in `support_doc_gaps` with the original query text, gap_category = 'missing-doc' (default), and auto_created = true.

**Given** more than 20 open entries exist in `support_doc_gaps`,  
**When** the 21st entry is inserted,  
**Then** a Slack alert fires to #doc-eng with the count and a link to the doc-health dashboard.

**Given** a Crystal interaction results in thumbs-up and a composite eval score ≥ 0.85,  
**When** the feedback is recorded,  
**Then** the full interaction (query + tools called + answer + sources) is written to `skill_examples` for the `crystal-support` skill.

---

## 8. Environment Variables

All new variables must be added to `docs/ENV_VARS.md` and `.env.example` in the same PR that introduces the code that uses them.

### Backend (`backend/.env.example`)

```bash
# Support system

# URL of the support site (Next.js). Used to trigger ISR revalidation
# after a doc is upserted. Optional — omit to skip revalidation.
SUPPORT_SITE_URL=https://support.experient.ai

# Secret token for ISR revalidation calls to the support site.
# Must match NEXT_PUBLIC_REVALIDATE_TOKEN in the support site.
SUPPORT_SITE_REVALIDATE_TOKEN=change-me-in-prod

# Algolia (optional — enables Algolia index sync alongside pgvector search).
# If not set, search falls back to pgvector only.
ALGOLIA_APP_ID=
ALGOLIA_API_KEY=                # Write API key (not search-only)
ALGOLIA_INDEX_NAME=experient_support_docs

# OpenAI API key for text-embedding-3-small (pgvector embeddings).
# Separate from OPENROUTER_API_KEY — embeddings are called directly via OpenAI.
OPENAI_API_KEY=

# Prometheus internal URL (for /api/support/status health polling).
# Typically the Prometheus container within the same Docker network.
PROMETHEUS_URL=http://prometheus:9090

# Slack webhook for #doc-eng alerts (doc gap threshold, human annotation queue).
# Optional — omit to disable Slack alerts.
SLACK_DOC_ENG_WEBHOOK_URL=
```

### CrystalOS (`crystalos/.env.example`)

```bash
# Support system

# Backend internal URL — used by support tools to call /api/internal endpoints.
# Must match AGENTS_INTERNAL_KEY on the backend side.
BACKEND_INTERNAL_URL=http://backend:3001

# Same key as backend's AGENTS_INTERNAL_KEY — shared secret for tool→backend calls.
AGENTS_INTERNAL_KEY=dev-internal-key-change-in-prod

# Redis TTL (seconds) for TRACKER.md roadmap cache. Default: 600 (10 minutes).
TRACKER_CACHE_TTL=600
```

### GitHub Actions Secrets (required for CI workflow)

```
BACKEND_INTERNAL_URL   — internal URL for CI → backend calls (not public URL)
AGENTS_INTERNAL_KEY    — must match backend's AGENTS_INTERNAL_KEY
```

### Support Site (`support-site/.env.example`)

```bash
# Backend public API URL
NEXT_PUBLIC_API_URL=https://api.experient.ai

# Revalidation token (must match backend's SUPPORT_SITE_REVALIDATE_TOKEN)
REVALIDATE_TOKEN=change-me-in-prod

# Algolia (read-only search key — safe to expose)
NEXT_PUBLIC_ALGOLIA_APP_ID=
NEXT_PUBLIC_ALGOLIA_SEARCH_KEY=   # Search-only key (not write key)
NEXT_PUBLIC_ALGOLIA_INDEX_NAME=experient_support_docs

# Clerk publishable key (for authenticated support site pages)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
```

---

## 9. Performance Budgets

These are hard targets, not aspirational. If a route or skill misses its p95 target in production for 5 consecutive minutes, a Prometheus alert must fire.

### Backend API Routes

| Route | p50 | p95 | Notes |
|-------|-----|-----|-------|
| `GET /api/support/docs` | < 50ms | < 200ms | Redis-cached; p95 is cache-miss path |
| `GET /api/support/docs/:key` | < 30ms | < 100ms | Single row lookup + Redis cache |
| `GET /api/support/changelog` | < 40ms | < 150ms | Redis-cached list |
| `GET /api/support/known-issues` | < 40ms | < 150ms | Small table, no vector search |
| `GET /api/support/roadmap` | < 50ms | < 200ms | Redis 10-min TTL; cold path parses TRACKER.md |
| `GET /api/support/status` | < 100ms | < 500ms | Prometheus query + known issues join |
| `GET /api/support/account` | < 80ms | < 300ms | Billing table join + plan lookup |
| `POST /api/support/tickets` | < 100ms | < 400ms | DB write + Novu async (non-blocking) |
| `POST /api/internal/support/refresh-doc` | < 2000ms | < 8000ms | Includes OpenAI embedding call |
| `POST /api/internal/support/ingest-changelog` | < 200ms | < 800ms | Bulk insert, batch up to 50 entries |

### CrystalOS — crystal-support Skill

| Scenario | p50 | p95 |
|----------|-----|-----|
| Tier-1 resolution (1 tool call) | < 3s | < 6s |
| Tier-2 resolution (2 tool calls) | < 5s | < 10s |
| Tier-3 escalation (3 tool calls + ticket) | < 8s | < 15s |
| Intent classification (pre-turn) | < 50ms | < 150ms |

### CrystalOS — doc-writer Skill

| Scenario | p50 | p95 |
|----------|-----|-----|
| API route doc generation | < 15s | < 30s |
| Skill SKILL.md doc generation | < 20s | < 40s |
| Full bootstrap run (all docs) | < 4 hours | — |

### Support Site (Core Web Vitals)

| Metric | Target | Measured on |
|--------|--------|-------------|
| LCP (Largest Contentful Paint) | < 2.5s | Home page, doc pages |
| CLS (Cumulative Layout Shift) | < 0.10 | All pages |
| INP (Interaction to Next Paint) | < 200ms | Search, Crystal panel |
| TTFB (Time to First Byte) | < 800ms | ISR pages (cached) |
| Search result latency | < 500ms | `/search` page (Algolia or pgvector) |

### Freshness SLA (from CONTENT_ENGINE.md)

| Source Change | Target Lag |
|--------------|-----------|
| Route/schema change | < 20 minutes |
| Skill SKILL.md change | < 20 minutes |
| TRACKER.md change | < 10 minutes |
| Git log ingestion | < 30 minutes |

---

## 10. Launch Checklist

Organized by category. Every item must be checked before declaring the support system production-ready.

### Infrastructure (7 items)

- [ ] **INF-1** — Postgres migration `20260625000003_support_system.sql` applied to production database. Verify all 5 tables exist: `support_docs`, `support_changelog`, `support_known_issues`, `support_tickets`, `support_doc_gaps`.
- [ ] **INF-2** — pgvector `hnsw` index on `support_docs.embedding` created. Run `\d support_docs` to confirm `idx_support_docs_embedding_cosine` exists.
- [ ] **INF-3** — All new env vars set in production (backend + CrystalOS + support site). Verify via startup health check that no required var is defaulting to placeholder value.
- [ ] **INF-4** — Support site (Next.js) deployed to Fly.io. `curl https://support.experient.ai` returns 200.
- [ ] **INF-5** — `SUPPORT_SITE_URL` and `SUPPORT_SITE_REVALIDATE_TOKEN` set on backend. Test ISR revalidation by calling `/api/internal/support/refresh-doc` and verifying the support site page updates.
- [ ] **INF-6** — Redis connection verified from backend. Run `GET support:docs:list:*` to confirm cache is populated after first doc refresh.
- [ ] **INF-7** — GitHub Actions secrets `BACKEND_INTERNAL_URL` and `AGENTS_INTERNAL_KEY` set. Trigger doc-refresh workflow manually (`workflow_dispatch`) and verify all steps pass.

### Data (5 items)

- [ ] **DATA-1** — Bootstrap script `scripts/bootstrap-docs.sh` run successfully in production. Verify ≥ 80% of expected doc keys are present in `support_docs` (`SELECT COUNT(*), category FROM support_docs GROUP BY category`).
- [ ] **DATA-2** — pgvector embeddings generated for all docs. Verify: `SELECT COUNT(*) FROM support_docs WHERE embedding IS NULL` returns 0.
- [ ] **DATA-3** — TRACKER.md reviewed and `[public]` tags added to all roadmap items appropriate for external visibility. At minimum 10 items tagged `[public]`.
- [ ] **DATA-4** — At least 5 known issues entered manually in `support_known_issues` for most common historic support topics (CSV export timeout, SAML setup, webhook delay, etc.).
- [ ] **DATA-5** — Changelog seeded with last 90 days of git history. Verify `GET /api/support/changelog` returns ≥ 20 entries.

### Crystal (5 items)

- [ ] **CRYS-1** — `crystal-support` skill deployed to CrystalOS production. Verify `POST /agents/crystal-support` with a test query returns a valid structured output.
- [ ] **CRYS-2** — Support classifier correctly routes 8 intent categories. Run the 8 canonical test queries (one per category) and verify each routes to crystal-support with confidence ≥ 0.85.
- [ ] **CRYS-3** — All 8 support tools registered and callable. Run a tool smoke test: call each tool with a minimal valid input and verify a non-error response.
- [ ] **CRYS-4** — Crystal support skill passes EVALS on the 5 canonical eval scenarios (defined in EVALS.md) with composite score ≥ 0.78.
- [ ] **CRYS-5** — `doc-writer` skill deployed and generating passing-quality docs (score ≥ 0.80) for at least 3 known routes as an integration test.

### Frontend (5 items)

- [ ] **FE-1** — Crystal panel support mode amber pill renders correctly when crystal-support skill is active. Test in staging with a known support query.
- [ ] **FE-2** — Doc link cards render in Crystal panel for tier-2 resolutions. Verify cards have title, excerpt, and a working link to the support site.
- [ ] **FE-3** — Thumbs-down feedback correctly calls `POST /api/support/feedback` and auto-creates a `support_doc_gaps` entry. Verify in staging.
- [ ] **FE-4** — "Ask Crystal for help" button renders in error boundary and empty states. Click it to confirm it opens Crystal in support mode.
- [ ] **FE-5** — Support site home page renders on mobile (375px viewport). Crystal panel is accessible, search bar is usable, navigation is not broken.

### Monitoring (4 items)

- [ ] **MON-1** — All 7 Prometheus support metrics visible in Grafana. Create a "Support System" dashboard with: resolution rate, doc freshness, ticket volume, CSAT, doc gap count.
- [ ] **MON-2** — Alerting rules configured and tested: `support_crystal_resolution_rate < 0.70` for 30 minutes fires a page; `support_doc_freshness_lag_seconds > 3600` sends Slack alert to #doc-eng.
- [ ] **MON-3** — `support_doc_gap_open_total > 20` alert configured and tested.
- [ ] **MON-4** — UptimeRobot (or equivalent) monitoring `https://support.experient.ai` with 1-minute check interval and PagerDuty escalation on 5-minute downtime.

### Security (4 items)

- [ ] **SEC-1** — Internal routes (`/api/internal/support/*`) inaccessible without `X-Internal-Key`. Verify: `curl /api/internal/support/refresh-doc` without the header returns 401.
- [ ] **SEC-2** — Authenticated routes (`/api/support/account`, `/api/support/tickets`) inaccessible without a valid Clerk JWT. Verify 401 response on unauthenticated calls.
- [ ] **SEC-3** — Ticket listing enforces org scoping. Verify user from org A cannot retrieve org B's tickets (return empty list, not 403 — do not leak org existence).
- [ ] **SEC-4** — No PII in support doc gap records. The `query_text` field must not contain org names, user emails, or survey response data. Review the first 20 production gap entries post-launch.

---

*End of Implementation Guide. For questions, see companion docs listed at the top of this file. This guide is authoritative for Sprint S1–S4 implementation.*
