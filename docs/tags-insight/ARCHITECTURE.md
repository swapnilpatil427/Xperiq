# Tags & Group Intelligence — Architecture

> **Design philosophy:** Tags in Xperiq are not decorators — they are the primary
> organizational primitive for dimensional intelligence. Every architectural decision
> must support: (1) fast reads of tag-scoped aggregates at any scale, (2) an incremental
> aggregation pipeline that never fully recomputes, (3) a CrystalOS integration that
> proposes tags and generates cross-survey narratives, and (4) future extension to
> workflows, reports, and MCP skills without schema changes.

---

## Data Model

### `tags` table

The canonical tag registry for an org. One row per unique tag.

```sql
CREATE TABLE tags (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        TEXT          NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name          TEXT          NOT NULL,           -- Display name: "Customer Onboarding"
  slug          TEXT          NOT NULL,           -- URL-safe: "customer-onboarding"
  namespace     TEXT,                             -- Optional prefix: "region", "product", "team"
                                                  -- Full qualified name: "region:apac"
  color         TEXT          NOT NULL DEFAULT '#6366F1',  -- Hex, from the 14-color brand palette
  icon          TEXT,                             -- Emoji or icon key: "🌏" or "globe"
  description   TEXT,                             -- Optional: "All surveys related to APAC region"
  is_locked     BOOLEAN       NOT NULL DEFAULT FALSE, -- If true, only admins can create tags in this namespace
  created_by    TEXT          NOT NULL REFERENCES users(id),
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ,                      -- Soft delete: tag no longer appears in UI, data preserved

  UNIQUE (org_id, slug),
  CONSTRAINT tags_slug_format CHECK (slug ~ '^[a-z0-9-]+$'),
  CONSTRAINT tags_namespace_format CHECK (namespace IS NULL OR namespace ~ '^[a-z0-9-]+$')
);

CREATE INDEX idx_tags_org_id ON tags (org_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_tags_org_namespace ON tags (org_id, namespace) WHERE deleted_at IS NULL;
```

**Why `namespace` is a separate column and not just a slug prefix:** Namespaces need
independent governance (locking, auto-complete, admin-only creation). Storing them
separately means we can query `WHERE namespace = 'product'` without parsing slugs, and
we can enforce namespace lock rules in a single WHERE clause rather than a regex
extraction. The display format `namespace:slug` (e.g., `region:apac`) is constructed
at the API layer.

---

### `survey_tags` join table

```sql
CREATE TABLE survey_tags (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id   UUID          NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  tag_id      UUID          NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  applied_by  TEXT          NOT NULL REFERENCES users(id), -- 'system' for auto-applied by Crystal
  applied_via TEXT          NOT NULL DEFAULT 'manual',     -- 'manual' | 'crystal_auto' | 'crystal_confirmed'
  applied_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  UNIQUE (survey_id, tag_id)
);

CREATE INDEX idx_survey_tags_survey_id ON survey_tags (survey_id);
CREATE INDEX idx_survey_tags_tag_id ON survey_tags (tag_id);
```

**Why track `applied_via`:** This is the feedback signal for auto-tag quality. Tags
applied via `crystal_auto` that get manually removed within 24 hours count as rejections
in the EVALS pipeline. `crystal_confirmed` means Crystal proposed and the user explicitly
accepted — these are the positive training signal.

---

### `tag_insights` materialized view

The rolled-up aggregate for each tag. This is what the Tag Intelligence View reads from.
It is **never computed on-the-fly** — always refreshed by the background pipeline.

```sql
CREATE MATERIALIZED VIEW tag_insights AS
SELECT
  t.id                          AS tag_id,
  t.org_id,
  t.slug,
  t.name,
  t.namespace,
  COUNT(DISTINCT st.survey_id)  AS survey_count,
  SUM(rs.response_count)        AS total_responses,
  -- NPS: standard formula across all responses in the tag group
  ROUND(
    100.0 * SUM(rs.promoter_count) / NULLIF(SUM(rs.nps_eligible_count), 0)
    - 100.0 * SUM(rs.detractor_count) / NULLIF(SUM(rs.nps_eligible_count), 0),
    1
  )                             AS aggregate_nps,
  AVG(rs.avg_sentiment)         AS avg_sentiment,
  -- Response velocity: responses in the last 7 days / 7
  ROUND(
    SUM(rs.responses_last_7d)::NUMERIC / 7,
    1
  )                             AS daily_response_velocity,
  MAX(rs.last_response_at)      AS latest_response_at,
  NOW()                         AS refreshed_at
FROM tags t
JOIN survey_tags st ON st.tag_id = t.id
JOIN survey_response_stats rs ON rs.survey_id = st.survey_id
WHERE t.deleted_at IS NULL
GROUP BY t.id, t.org_id, t.slug, t.name, t.namespace;

CREATE UNIQUE INDEX idx_tag_insights_tag_id ON tag_insights (tag_id);
CREATE INDEX idx_tag_insights_org_id ON tag_insights (org_id);
```

`survey_response_stats` is an existing materialized view that pre-computes per-survey
NPS, sentiment, and response counts. Tags aggregate on top of it — we never touch raw
responses from the tags layer.

---

### `tag_insight_trend` table

Daily snapshots for 90-day rolling trend charts. Written by the pipeline, not a
materialized view (because we want point-in-time history, not just current state).

```sql
CREATE TABLE tag_insight_trend (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tag_id          UUID          NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  org_id          TEXT          NOT NULL,
  snapshot_date   DATE          NOT NULL,
  response_count  INTEGER       NOT NULL DEFAULT 0,
  nps_score       NUMERIC(5,1),
  avg_sentiment   NUMERIC(4,3),
  survey_count    INTEGER       NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  UNIQUE (tag_id, snapshot_date)
);

CREATE INDEX idx_tag_insight_trend_tag_date ON tag_insight_trend (tag_id, snapshot_date DESC);
```

**Retention policy:** Rows older than 90 days are deleted by the pipeline on each run.
This bounds table growth. For customers who need longer history (Enterprise), the pipeline
writes to a separate cold storage bucket.

---

### `tag_hierarchies` table

For nested tag structures (e.g., `region:apac` → `region:apac-japan`). Uses the
**closure table pattern** rather than adjacency list — this allows querying all descendants
of a tag in O(1) joins rather than recursive CTEs, which matters for large hierarchies.

```sql
CREATE TABLE tag_hierarchies (
  ancestor_id   UUID    NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  descendant_id UUID    NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  depth         INTEGER NOT NULL,  -- 0 = self, 1 = direct child, 2 = grandchild, etc.

  PRIMARY KEY (ancestor_id, descendant_id)
);

CREATE INDEX idx_tag_hierarchies_descendant ON tag_hierarchies (descendant_id);
```

**When a tag is created**, the backend inserts one row per ancestor (including the
self-reference at depth 0). This is O(depth) inserts at write time in exchange for O(1)
read time when querying subtrees.

---

### `tag_proposals` table

Tracks auto-tag proposals from Crystal and their outcomes. The primary feedback loop
for ML quality.

```sql
CREATE TABLE tag_proposals (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          TEXT          NOT NULL,
  survey_id       UUID          NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  tag_id          UUID          REFERENCES tags(id),     -- NULL if user dismissed (tag not created)
  proposed_tag    TEXT          NOT NULL,                -- Raw tag name proposed by Crystal
  confidence      NUMERIC(4,3)  NOT NULL,                -- 0.000–1.000
  rationale       TEXT,                                  -- Crystal's one-line reason
  outcome         TEXT,                                  -- 'accepted' | 'dismissed' | 'pending' | 'expired'
  outcome_at      TIMESTAMPTZ,
  proposed_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  skill_version   TEXT          NOT NULL                 -- CrystalOS skill version that generated this
);

CREATE INDEX idx_tag_proposals_survey_id ON tag_proposals (survey_id);
CREATE INDEX idx_tag_proposals_outcome ON tag_proposals (outcome, proposed_at);
```

---

## API Design

All routes are under the Express backend at `backend/src/routes/tags.ts`. Auth via
Clerk JWT middleware (or dev-user fallback). Org scoping is always enforced by
`req.orgId` from the auth middleware — no client-supplied org_id is trusted.

---

### `GET /api/tags`

List all active tags for the authenticated org. Used by the tag picker popover and the
tag filter bar in the survey list.

**Query params:**
- `namespace?: string` — filter by namespace (e.g., `?namespace=product`)
- `search?: string` — prefix search on name (for autocomplete)
- `include_counts?: boolean` — default true; join with survey_count from tag_insights

**Response:**
```json
{
  "tags": [
    {
      "id": "uuid",
      "name": "Customer Onboarding",
      "slug": "customer-onboarding",
      "namespace": null,
      "color": "#6366F1",
      "icon": "🚀",
      "description": "All surveys related to customer onboarding journeys",
      "survey_count": 12,
      "total_responses": 4230,
      "is_locked": false,
      "created_at": "2026-03-15T09:00:00Z"
    }
  ],
  "namespaces": [
    { "name": "product", "tag_count": 8, "is_locked": true },
    { "name": "region", "tag_count": 5, "is_locked": false }
  ],
  "total": 23
}
```

**Performance:** Redis cache with key `tag_list:{org_id}:{namespace}:{search}`, TTL 5
minutes. Cache is busted on any create/update/delete for that org.

---

### `POST /api/tags`

Create a new tag. If the namespace is locked, requires admin role.

**Request:**
```json
{
  "name": "APAC Region",
  "namespace": "region",
  "color": "#10B981",
  "icon": "🌏",
  "description": "Surveys deployed to APAC markets"
}
```

**Response:** `201 Created` with the full tag object.

**Side effects:**
- Inserts self-reference row in `tag_hierarchies` (depth=0)
- Busts `tag_list:{org_id}:*` Redis keys
- Emits `tag.created` event to the analytics pipeline

**Validation:**
- `name` max 64 chars
- `slug` auto-generated from name (lowercased, spaces → hyphens, special chars stripped)
- Slug uniqueness enforced at DB level (returns 409 on conflict)
- Namespace lock check: if `is_locked=true` for the namespace, require `role=admin`

---

### `PUT /api/tags/:id`

Update tag metadata. Slug is immutable after creation (it's used in URLs and pipeline
references). Name, color, icon, description are mutable.

**Request:**
```json
{
  "name": "APAC Region (Updated)",
  "color": "#059669",
  "description": "Surveys deployed to APAC markets including Australia and NZ"
}
```

**Response:** `200 OK` with updated tag object.

**Side effects:** Busts tag list cache. Does NOT invalidate tag_insights (name change
doesn't affect aggregates).

---

### `DELETE /api/tags/:id`

Soft-delete a tag. Sets `deleted_at` timestamp. The tag disappears from all UIs and
auto-complete but historical `tag_insights` data is preserved.

**Why soft delete:** A CX leader may have 90-day trend reports referencing a deleted tag.
Hard-deleting destroys their historical view. The tag_insight_trend rows are retained.
The tag can be restored by an admin.

**Response:** `204 No Content`

**Side effects:**
- Sets `tags.deleted_at = NOW()`
- Does NOT delete `survey_tags` rows (preserved for historical audit)
- Busts tag list cache
- Emits `tag.deleted` event

---

### `POST /api/surveys/:id/tags`

Apply one or more tags to a survey. Idempotent — applying an already-applied tag is
a no-op (returns 200, not 409).

**Request:**
```json
{
  "tag_ids": ["uuid-1", "uuid-2"],
  "applied_via": "manual"
}
```

**Response:**
```json
{
  "applied": ["uuid-1", "uuid-2"],
  "skipped": [],
  "survey_id": "uuid"
}
```

**Side effects:**
- Inserts rows into `survey_tags`
- Marks the tag's `survey_response_stats` record as stale for the next pipeline run
- Busts tag list cache (survey_count changes)

---

### `DELETE /api/surveys/:id/tags/:tagId`

Remove a tag from a survey.

**Response:** `204 No Content`

**Side effects:** Same cache bust as above. If the tag was applied via Crystal
(`applied_via = 'crystal_auto'` or `'crystal_confirmed'`) and is removed within 24 hours,
the pipeline records this as a negative outcome in `tag_proposals`.

---

### `GET /api/tag-insights/:tagSlug`

Return the full aggregate intelligence report for a tag group. This is the data source
for the Tag Intelligence View page (`/tag-insights/:slug`).

**Response:**
```json
{
  "tag": {
    "id": "uuid",
    "name": "Customer Onboarding",
    "slug": "customer-onboarding",
    "namespace": null,
    "color": "#6366F1",
    "icon": "🚀"
  },
  "aggregate": {
    "survey_count": 12,
    "total_responses": 4230,
    "aggregate_nps": 42.0,
    "avg_sentiment": 0.72,
    "daily_response_velocity": 18.4,
    "latest_response_at": "2026-06-29T14:22:00Z",
    "refreshed_at": "2026-06-29T14:15:00Z"
  },
  "surveys": [
    {
      "survey_id": "uuid",
      "title": "Onboarding CSAT Q2 2026",
      "nps_score": 48.0,
      "response_count": 312,
      "avg_sentiment": 0.78,
      "last_response_at": "2026-06-29T14:00:00Z",
      "status": "active"
    }
  ],
  "top_topics": [
    { "topic": "ease of setup", "frequency": 0.41, "sentiment": 0.82 },
    { "topic": "documentation quality", "frequency": 0.29, "sentiment": 0.54 },
    { "topic": "time to first value", "frequency": 0.23, "sentiment": 0.61 }
  ],
  "crystal_narrative": "Your Customer Onboarding surveys show consistent NPS improvement over the past 30 days (+8 points), driven primarily by improvements in ease-of-setup satisfaction. However, documentation quality themes are emerging with neutral-to-negative sentiment across 3 surveys — worth investigating before your next release.",
  "narrative_generated_at": "2026-06-29T14:15:00Z"
}
```

**Performance:** This endpoint reads from `tag_insights` materialized view (fast) and
the pre-computed `top_topics` JSON column in `tag_insights` (written by CrystalOS
pipeline). Page load target: p95 ≤ 1.2s.

---

### `GET /api/tag-insights/:tagSlug/trend`

Return daily NPS, response count, and sentiment for the past N days.

**Query params:**
- `days?: number` — default 30, max 90
- `metric?: 'nps' | 'responses' | 'sentiment'` — default returns all three

**Response:**
```json
{
  "tag_slug": "customer-onboarding",
  "days": 30,
  "trend": [
    {
      "date": "2026-05-30",
      "nps_score": 34.0,
      "response_count": 89,
      "avg_sentiment": 0.61
    }
  ]
}
```

---

### `GET /api/tag-insights/:tagSlug/universe`

Return the tag graph data for the Tag Universe visualization. Returns all tags in the org,
their NPS, survey counts, and which tags co-occur on the same surveys (edges).

**Response:**
```json
{
  "nodes": [
    {
      "tag_id": "uuid",
      "slug": "customer-onboarding",
      "name": "Customer Onboarding",
      "color": "#6366F1",
      "survey_count": 12,
      "aggregate_nps": 42.0
    }
  ],
  "edges": [
    {
      "source_tag_id": "uuid-1",
      "target_tag_id": "uuid-2",
      "shared_survey_count": 4
    }
  ]
}
```

---

## Auto-Tagging Intelligence (CrystalOS Integration)

### Trigger

When a survey is created or its title/questions are significantly updated, the backend
emits a `survey.created` or `survey.questions_updated` event. The CrystalOS
`auto_tag_skill` is triggered via the internal proxy (`POST /api/admin/agents/auto-tag`
with `X-Internal-Key` header).

### Skill: `auto_tag` in CrystalOS

**Input:**
```python
class AutoTagInput(BaseModel):
    survey_id: str
    org_id: str
    survey_title: str
    question_texts: list[str]     # First 10 questions, question text only
    existing_org_tags: list[dict] # [{slug, name, namespace, description, survey_count}]
    top_k: int = 5               # Max proposals to return
```

**Processing pipeline:**
1. **Embed the survey**: Concatenate title + question_texts, generate embedding via
   the org's embedding model (default: `text-embedding-3-small` via OpenRouter).
2. **Find nearest-neighbor tags**: Embed each existing tag's `name + description +
   [sample question texts from its surveys]`. Compute cosine similarity. Return top-k
   tags with similarity > 0.65 threshold.
3. **LLM refinement pass**: Feed the top-k candidates to an LLM with the prompt:
   "Given this survey's content, which of these tags are genuinely relevant vs. superficially
   similar? Rank them and explain why. Also suggest any new tags not in the list."
4. **Deduplicate and rank**: Merge embedding-ranked and LLM-suggested tags, score by
   `(0.6 * embedding_sim + 0.4 * llm_confidence)`.
5. **Return proposals**: Top-k tags with confidence score and rationale.

**Output:**
```python
class AutoTagOutput(BaseModel):
    proposals: list[TagProposal]
    skill_version: str

class TagProposal(BaseModel):
    proposed_tag_name: str
    matched_tag_id: Optional[str]  # None if it's a net-new tag suggestion
    confidence: float              # 0.0–1.0
    rationale: str                 # One sentence
    is_new_tag: bool
```

### Proposal → Confirm → Execute flow

1. CrystalOS returns proposals → backend stores them in `tag_proposals` with
   `outcome='pending'`
2. Backend includes `{ tag_proposals: [...] }` in the survey creation response
3. Frontend renders proposals as confirm-cards in the survey edit page
4. User accepts (✓): frontend calls `POST /api/surveys/:id/tags` with
   `applied_via='crystal_confirmed'` → backend updates `tag_proposals.outcome='accepted'`
5. User dismisses (✗): frontend calls `PATCH /api/tag-proposals/:id` with
   `outcome='dismissed'`
6. Proposals expire after 7 days if not acted on: backend cron sets
   `outcome='expired'`

---

## Tag Insight Pipeline (CrystalOS LangGraph Graph)

This graph runs every 15 minutes (triggered by the backend cron). It computes the
rolled-up intelligence for every tag that has new response data since the last run.

### Graph: `tag_insight_pipeline`

```
fetch_stale_tags
      ↓
  [for each stale tag, in parallel]
      ↓
fetch_survey_responses
      ↓
aggregate_nps_sentiment
      ↓
extract_topics
      ↓
generate_narrative
      ↓
publish_to_db
```

**Node: `fetch_stale_tags`**
- Query: tags where any member survey has new responses since the tag's last refresh
- Returns list of `tag_id`s that need refresh. Empty list → pipeline exits early.

**Node: `fetch_survey_responses`** (per tag, parallel)
- For each tag, fetch the pre-computed `survey_response_stats` rows for all surveys
  with this tag. No raw response access from this node — always via the stats view.

**Node: `aggregate_nps_sentiment`**
- Standard NPS formula across all NPS-eligible responses in the tag group.
- Weighted average sentiment (weighted by response_count per survey).
- Computes response velocity (new responses in past 7 days / 7).

**Node: `extract_topics`**
- Takes a sample of open-text responses (max 200 per tag, most recent) from the
  `response_topics` table (pre-computed by the main insight pipeline).
- Aggregates topic frequencies across all surveys in the tag group.
- Returns top-10 topics with aggregate frequency and sentiment.

**Node: `generate_narrative`**
- LLM prompt (GPT-4o-mini via OpenRouter, ~500 tokens) generating a 2-3 sentence
  intelligence summary focused on what's improving, what's concerning, any anomalies.
- The narrative is stored in `tag_insights.crystal_narrative` and surfaced in the UI.

**Node: `publish_to_db`**
- Upserts into `tag_insights` materialized view backing table
- Inserts a row into `tag_insight_trend` for today's date (upsert on conflict)
- Updates `tag_insights.refreshed_at`
- Emits a `tag_insight.refreshed` event consumed by Redis pub/sub to invalidate any
  active Tag Intelligence View pages

**Trust score:**
Each pipeline run stores a `trust_score` (0.0–1.0). Trust is reduced when: sample
size is small (<30 responses), sentiment model confidence is low, or NPS calculation
has insufficient eligible responses. The UI shows a trust indicator badge when trust < 0.70.

---

## Namespace System

### Design rationale

Namespaces solve tag proliferation. Without them, organizations end up with tags like
`US`, `United States`, `usa`, `North America` all meaning the same thing. Namespaces
impose structure: `region:us`, `region:emea`, `region:apac` — the `:` prefix enforces
consistent vocabulary within a dimension.

### Namespace governance rules

| Rule | Behavior |
|---|---|
| Any user can create a tag with no namespace | Free tagging always available |
| Any user can create tags in unlocked namespaces | Org-level collaboration |
| Only admins can create tags in locked namespaces | Governance for `product:*`, `team:*` |
| Only admins can lock/unlock a namespace | Via `/settings/tags` → namespace settings |
| Namespaces are inferred from `tags.namespace`, never stored as a separate table | Simplicity |

---

## Performance Architecture

### Read path (tag list)

```
Client → GET /api/tags
       → Redis check: tag_list:{org_id}
           HIT  → return cached JSON (sub-5ms)
           MISS → Postgres query (idx_tags_org_id) → cache result 5min → return
```

### Read path (Tag Intelligence View)

```
Client → GET /api/tag-insights/:slug
       → Redis check: tag_insights:{org_id}:{slug}
           HIT  → return cached JSON
           MISS → read tag_insights materialized view (single row) → cache result 15min
```

The cache TTL for tag insights is 15 minutes (aligned with pipeline refresh cadence).
When the pipeline publishes new data, it explicitly busts `tag_insights:{org_id}:{slug}`.

### Incremental aggregation (pipeline efficiency)

The pipeline never runs a full recompute. The `fetch_stale_tags` node checks which
surveys have new responses since the tag's last refresh. For a tag with 50 surveys where
only 3 received responses in the past 15 minutes, only those 3 surveys are pulled
into the aggregation step. The result is merged with the existing aggregate.

This ensures the pipeline stays under 10 seconds for any org, regardless of survey count.

---

## Integration Points

### Workflows (Phase 4)

New trigger type: `tag_nps_threshold` — fires when a tag group's NPS crosses a threshold.
Checks `tag_insight_trend` on each pipeline run. No schema changes to existing workflow
tables — the trigger config is a new type in the existing JSONB config column.

### Scheduled Reports (Phase 4)

Reports accept an optional `tag_filter: string[]` parameter. When present, the report
scopes all survey data to surveys in those tag groups via a WHERE clause join through
`survey_tags` — no new tables needed.

### Crystal AI Chat

The Crystal chat skill gains awareness of the tag system via a new tool call:
`get_tag_insights(tag_slug)`. Handles queries like:
- "Show me insights for our mobile product surveys"
- "Which tag group has the worst NPS this month?"
- "Compare Customer Onboarding and Checkout Experience tag groups"

### MCP skill: `get_tag_insights`

```python
@skill(name="get_tag_insights")
async def get_tag_insights(tag_slug: str, org_id: str) -> TagInsightReport:
    """
    Returns aggregated intelligence for an Xperiq Intelligence Group.
    Use this when asked about a category of surveys.
    """
```

---

## Database Migration Plan

### Migration 1: Core schema (Phase 1)
File: `supabase/migrations/20260701_tags_core.sql`
- Create `tags`, `survey_tags`, `tag_proposals` tables
- Create indexes
- Add `tag_hierarchies` closure table

### Migration 2: Insight tables (Phase 2)
File: `supabase/migrations/20260715_tag_insights.sql`
- Create `tag_insight_trend` table
- Create `tag_insights` materialized view (backed by `survey_response_stats`)
- Create refresh function with `CONCURRENTLY` support

### Migration 3: Namespace lock (Phase 3)
File: `supabase/migrations/20260729_tag_namespace_lock.sql`
- Add `is_locked` column to `tags` (backfill `false`)
- Add namespace-level lock lookup view
