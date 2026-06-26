# Experient Support System — Technical Architecture
## Systems, Data Flows, and Infrastructure

**Status:** Design  
**Owner:** Engineering (CrystalOS + Backend)  
**Companion to:** [DESIGN.md](./DESIGN.md)

---

## Overview

The support system is three interconnected sub-systems built on top of Experient's existing infrastructure:

```
┌──────────────────────────────────────────────────────────────────────┐
│                     SUPPORT SYSTEM                                   │
│                                                                      │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │  Content Engine   │  │  Crystal Support  │  │  Support Site    │  │
│  │  (docs pipeline)  │  │  (AI resolution)  │  │  (public UI)     │  │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘  │
│           │                     │                      │             │
│           └─────────────────────┼──────────────────────┘             │
│                                 │                                    │
│                    ┌────────────▼────────────┐                       │
│                    │   Support Data Store     │                       │
│                    │   (Postgres + Redis)     │                       │
│                    └─────────────────────────┘                       │
└──────────────────────────────────────────────────────────────────────┘
```

Each sub-system is independently deployable and operates on stable internal contracts.

---

## Sub-System 1: Content Engine

Turns code artifacts into living documentation automatically.

### Data Flows

```
git push to main
        │
        ▼
┌───────────────────────────────────────────────┐
│  CI Pipeline (GitHub Actions)                  │
│                                               │
│  1. Extract changed artifacts                  │
│     - Route files (backend/src/routes/)        │
│     - Schema files (backend/src/schemas/)      │
│     - Skill files (crystalos/skills/*/SKILL.md)│
│     - TRACKER.md (any change)                  │
│     - Changelog (git log since last deploy)    │
│                                               │
│  2. For each changed artifact → POST           │
│     /api/internal/support/refresh-doc          │
└───────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────┐
│  Backend: /api/internal/support/refresh-doc   │
│  (X-Internal-Key authenticated)               │
│                                               │
│  1. Parse artifact type                       │
│  2. Extract: endpoint/skill name, schema,     │
│     current status from TRACKER.md            │
│  3. POST /agents/support-doc-writer           │
│     (CrystalOS: doc-writer skill)             │
│  4. Quality eval (crystal-eval skill)         │
│  5. If passes: upsert support_docs table      │
│  6. If fails: create doc_gap issue +          │
│     flag for human annotation                 │
└───────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────┐
│  support_docs Postgres table                  │
│  (see schema below)                           │
│                                               │
│  Indexed by: doc_key, category, tags          │
│  Vector indexed (pgvector): embedding column  │
└───────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────┐
│  Support Site (static + SSR)                  │
│  Rendered from support_docs via REST API      │
│  Revalidated on every doc update (ISR)        │
└───────────────────────────────────────────────┘
```

### Database Schema

```sql
-- Core doc storage
CREATE TABLE support_docs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID,                    -- NULL = public doc, set = org-specific
  doc_key       TEXT UNIQUE NOT NULL,    -- 'api.surveys.create', 'skill.crystal-analyst', etc.
  category      TEXT NOT NULL,           -- 'api', 'skill', 'feature', 'guide', 'changelog'
  title         TEXT NOT NULL,
  body_markdown TEXT NOT NULL,
  body_html     TEXT NOT NULL,
  status_tag    TEXT NOT NULL DEFAULT 'stable', -- 'stable','beta','building','planned'
  source_file   TEXT,                    -- e.g. 'backend/src/routes/experience.ts'
  source_hash   TEXT,                    -- SHA of source at last generate
  tags          TEXT[],
  embedding     vector(1536),            -- pgvector embedding for semantic search
  crystal_draft BOOLEAN DEFAULT true,    -- true = AI generated, false = human written
  quality_score FLOAT,                   -- 0.0-1.0 from eval pass
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Changelog (auto-generated from git)
CREATE TABLE support_changelog (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version       TEXT,                    -- semantic version or sprint label
  release_date  DATE NOT NULL,
  category      TEXT NOT NULL,           -- 'feature','fix','improvement','breaking'
  title         TEXT NOT NULL,
  body_markdown TEXT NOT NULL,
  feature_tags  TEXT[],
  is_public     BOOLEAN DEFAULT true,
  commit_sha    TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Known issues register
CREATE TABLE support_known_issues (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_key     TEXT UNIQUE,             -- 'csv-export-timeout', 'saml-azure-edge-case'
  title         TEXT NOT NULL,
  description   TEXT NOT NULL,
  severity      TEXT,                    -- 'critical','high','medium','low'
  status        TEXT DEFAULT 'open',     -- 'open','mitigated','resolved'
  workaround    TEXT,
  eta_text      TEXT,                    -- 'Expected fix: Sprint 14'
  affected_tags TEXT[],
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  resolved_at   TIMESTAMPTZ
);

-- Support ticket register (created by Crystal on escalation)
CREATE TABLE support_tickets (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID NOT NULL,
  user_id        TEXT NOT NULL,
  title          TEXT NOT NULL,
  crystal_summary TEXT,                  -- what Crystal investigated
  crystal_tools_called JSONB,           -- tool call log
  category       TEXT,                   -- 'data-question','billing','api','export','auth'
  tier           INTEGER DEFAULT 1,      -- 1=crystal-resolved, 2=doc-resolved, 3=human
  status         TEXT DEFAULT 'open',    -- 'open','in_progress','resolved','closed'
  resolution     TEXT,
  resolved_by    TEXT,                   -- 'crystal', 'doc', 'human:email'
  feedback_score INTEGER,               -- 1-5 post-resolution CSAT
  doc_gap_created BOOLEAN DEFAULT false,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  resolved_at    TIMESTAMPTZ
);

-- Doc gaps (created when Crystal can't resolve)
CREATE TABLE support_doc_gaps (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id      UUID REFERENCES support_tickets(id),
  query_text     TEXT NOT NULL,
  gap_category   TEXT,                   -- 'missing-doc','unclear-doc','missing-feature','known-bug'
  suggested_doc_key TEXT,
  suggested_title TEXT,
  status         TEXT DEFAULT 'open',    -- 'open','in_progress','resolved'
  auto_created   BOOLEAN DEFAULT true,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Sub-System 2: Crystal Support

The AI resolution engine. See [CRYSTAL_SUPPORT.md](./CRYSTAL_SUPPORT.md) for full skill spec.

### Integration Point

Crystal Support is a CrystalOS skill (`crystal-support`) exposed via the existing agents endpoint:

```
POST /agents/crystal-support
Headers: X-Internal-Key: {key}
Body: {
  query: string,
  org_id: string,
  user_id: string,
  context: {
    current_page?: string,
    active_survey_id?: string,
    recent_crystal_sessions?: string[],
    crystal_conversation_history?: Message[]
  }
}
```

The backend proxies this from the frontend's Crystal panel. When Crystal detects support intent, it routes to this endpoint instead of `crystal-analyst`.

### Tool Layer

New tools registered in CrystalOS for support mode:

| Tool | Source | Purpose |
|------|--------|---------|
| `search_support_docs` | support_docs (pgvector) | Semantic search over all docs |
| `get_doc_by_key` | support_docs | Fetch a specific doc page |
| `get_feature_status` | support_docs + TRACKER cache | Is this feature live, beta, building? |
| `get_account_state` | backend /api/internal/billing | Credits, plan, recent charges |
| `get_known_issues` | support_known_issues | Active known issues matching query |
| `get_changelog_recent` | support_changelog | Last 20 changelog entries |
| `create_support_ticket` | support_tickets | Escalate with pre-populated context |
| `get_system_status` | status feed (Prometheus + external) | Is the platform healthy? |

---

## Sub-System 3: Support Site

A public-facing site served at `support.experient.ai` (or `/support` on the main domain).

### Technology Stack

The support site is **not** embedded in the main React app. It is a separate Next.js application:
- **Framework:** Next.js 14 (App Router)
- **Rendering:** ISR (Incremental Static Regeneration) — pages are static but revalidate when docs update
- **Search:** Algolia DocSearch (indexed from support_docs) — fallback to local pgvector search
- **Authentication:** Shared Clerk session for personalized content (account state, org-specific docs)
- **Crystal integration:** Embedded Crystal panel via iframe or React component from shared package

### API Endpoints (Backend)

New routes on the Express backend:

```typescript
// Public — no auth
GET  /api/support/docs                    // list all public docs
GET  /api/support/docs/:doc_key           // get specific doc
GET  /api/support/changelog               // list changelog entries
GET  /api/support/known-issues            // list active known issues
GET  /api/support/roadmap                 // rendered TRACKER.md (public items only)
GET  /api/support/status                  // system health feed

// Authenticated — Clerk session
GET  /api/support/account                 // org's account state for Crystal context
POST /api/support/tickets                 // create support ticket (via Crystal)
GET  /api/support/tickets                 // list org's tickets
POST /api/support/feedback                // submit resolution feedback

// Internal — X-Internal-Key
POST /api/internal/support/refresh-doc   // CI trigger: regenerate doc from source
POST /api/internal/support/ingest-changelog  // CI trigger: ingest new changelog entries
POST /api/internal/support/gap-report    // Crystal trigger: report a doc gap
```

---

## Failure Modes and Mitigations

| Failure | Detection | Mitigation |
|---------|-----------|------------|
| Doc generation fails | CI step exits non-zero | Retry x3; on 3rd fail, flag existing doc as stale |
| Crystal support skill unavailable | Health check on CrystalOS | Fall back to doc search without Crystal; show banner |
| pgvector search returns poor results | CSRR drops below threshold | Increase reranking, add doc to gap register |
| Support site unreachable | UptimeRobot | CDN fallback to last cached version |
| Known issue not surfaced | Customer escalates existing known issue | Auto-detect: if ticket text matches known issue, link and close |

---

## Observability

All support metrics flow to the existing Prometheus/Grafana stack:

```
support_crystal_resolution_rate          (gauge, by category)
support_doc_freshness_lag_seconds        (histogram)
support_ticket_created_total             (counter, by tier)
support_ticket_resolved_total            (counter, by resolved_by)
support_csat_score                       (gauge, by tier)
support_doc_gap_open_total               (gauge)
support_known_issue_active_total         (gauge)
```

Alerting rules:
- `support_crystal_resolution_rate < 0.70` for 30 minutes → page oncall
- `support_doc_freshness_lag_seconds > 3600` → Slack alert to doc-eng channel
- `support_doc_gap_open_total > 20` → weekly digest to product team

---

## Deployment

Support system components deploy alongside the main platform:

| Component | Deploy target | Trigger |
|-----------|--------------|---------|
| Backend support routes | Fly.io / OCI (with main backend) | `main` push |
| CrystalOS `crystal-support` skill | Fly.io (with CrystalOS) | `main` push |
| Content engine (CI scripts) | GitHub Actions | `main` push |
| Support site (Next.js) | Fly.io (separate service) | `main` push or doc update |

Schema migrations run via `supabase/migrations/` — support tables added as a versioned migration.
