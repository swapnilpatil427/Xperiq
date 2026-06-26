# Data Model — Insight Pipeline v2

> Postgres-first. Blobs for large payloads. Immutable automated checkpoints.

---

## 1. Entity relationship

```
orgs
  └── org_insight_defaults (1:1) — org-level setting defaults

surveys
  └── survey_insight_settings (1:1) — inherits from org_insight_defaults via COALESCE
  └── survey_metric_snapshots (1:N, append)
  └── insight_checkpoints_v2 (1:N, linked list, append-only automated)
  └── insight_reports (1:N, manual documents)
  └── insights (1:N, active projection + superseded history)
  └── agent_runs (1:N, audit)
  └── custom_reports (1:N, ISOLATED — never joins with insights)
       └── custom_report_insights (1:N, parallel to insights, never superseded)

insight_checkpoints_v2
  parent → insight_checkpoints_v2 (self-FK)
  run_id → agent_runs
  metric_snapshot_id → survey_metric_snapshots
  report_blob_ref → object storage

insight_reports
  run_id → agent_runs
  checkpoint_id → insight_checkpoints_v2 (optional, for trail)

custom_reports
  run_id → agent_runs
  NOTE: custom_report_insights NEVER appear in insights table
```

---

## 2. `survey_insight_settings`

Per-survey configuration with org-level defaults.

```sql
CREATE TABLE survey_insight_settings (
  survey_id                       UUID PRIMARY KEY REFERENCES surveys(id) ON DELETE CASCADE,
  org_id                          TEXT NOT NULL,

  -- Automated incremental
  automated_insights_enabled              BOOLEAN NOT NULL DEFAULT TRUE,
  automated_report_generation_enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  stream_response_threshold               INT NOT NULL DEFAULT 10,      -- range 5–500
  report_regen_threshold                  INT NOT NULL DEFAULT 25,
  prior_checkpoint_lookback               INT NOT NULL DEFAULT 5,
  prior_checkpoint_max_age_days           INT NOT NULL DEFAULT 90,
  full_checkpoint_response_threshold      INT NOT NULL DEFAULT 200,
  meaningful_delta_nps_points             NUMERIC(4,1) NOT NULL DEFAULT 2.0,
  meaningful_delta_topic_pct              NUMERIC(4,1) NOT NULL DEFAULT 10.0,

  -- Refresh (user-initiated from Intelligence page)
  refresh_lookback_days                   INT NOT NULL DEFAULT 30,
  refresh_min_response_count              INT NOT NULL DEFAULT 25,
  refresh_daily_limit                     INT NOT NULL DEFAULT 5,

  -- Manual
  manual_expert_checkpoint_lookback       INT NOT NULL DEFAULT 3,       -- prior automated checkpoints read as context (not ground truth)
  manual_expert_max_corpus                INT NOT NULL DEFAULT 2000,
  manual_expert_full_corpus_cap           INT NOT NULL DEFAULT 500,
  manual_expert_snapshot_count            INT NOT NULL DEFAULT 5,
  manual_quick_sample_cap                 INT NOT NULL DEFAULT 150,
  manual_quick_snapshot_count             INT NOT NULL DEFAULT 2,
  manual_quick_default_window_days        INT NOT NULL DEFAULT 14,
  manual_daily_run_limit                  INT NOT NULL DEFAULT 10,

  -- Custom Analysis (separate surface)
  custom_analysis_enabled                 BOOLEAN NOT NULL DEFAULT TRUE,
  custom_analysis_daily_limit             INT NOT NULL DEFAULT 3,
  custom_analysis_max_corpus              INT NOT NULL DEFAULT 5000,
  custom_analysis_min_n_for_nps           INT NOT NULL DEFAULT 30,

  -- Credits (per-run cost overrides; NULL = use platform defaults from CREDIT_COSTS)
  credit_cost_automated_checkpoint        INT    CHECK (credit_cost_automated_checkpoint IS NULL OR (credit_cost_automated_checkpoint >= 1 AND credit_cost_automated_checkpoint <= 500)),   -- default: 5
  credit_cost_automated_report            INT    CHECK (credit_cost_automated_report IS NULL OR (credit_cost_automated_report >= 1 AND credit_cost_automated_report <= 500)),   -- default: 15
  credit_cost_refresh                     INT    CHECK (credit_cost_refresh IS NULL OR (credit_cost_refresh >= 1 AND credit_cost_refresh <= 500)),   -- default: 8
  credit_cost_manual_quick                INT    CHECK (credit_cost_manual_quick IS NULL OR (credit_cost_manual_quick >= 1 AND credit_cost_manual_quick <= 500)),   -- default: 15
  credit_cost_manual_expert               INT    CHECK (credit_cost_manual_expert IS NULL OR (credit_cost_manual_expert >= 1 AND credit_cost_manual_expert <= 500)),   -- default: 40

  -- Retention
  automated_checkpoint_retention_days     INT NOT NULL DEFAULT 365,
  manual_report_retention_days            INT NOT NULL DEFAULT 730,
  collapse_similar_checkpoints            BOOLEAN NOT NULL DEFAULT TRUE,

  config_version                          INT NOT NULL DEFAULT 1,
  updated_at                              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by                              TEXT
);

CREATE INDEX idx_insight_settings_org ON survey_insight_settings(org_id);
```

**`config_hash`:** `sha256(canonical_json(settings))` stored on each checkpoint for audit.

---

## 3. Phase 0.5 table: `survey_insight_checkpoints` (existing, Phase 0.5 target)

**Phase 0.5 targets this existing table** — no new table until Phase 1. Key columns confirmed from `supabase/migrations/20240521000000_crystal_checkpoints.sql`:

```sql
-- Existing columns (Phase 0.5 readable/writable)
id                              UUID PRIMARY KEY
survey_id                       UUID NOT NULL
org_id                          TEXT NOT NULL
checkpoint_number               INT NOT NULL
trigger                         TEXT CHECK (trigger IN ('responses','days','manual','stream'))
  -- ↑ Phase 0.5 migration must widen to: IN ('responses','days','manual','stream','scheduler','milestone')
created_by                      TEXT NOT NULL
created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
response_count_at_checkpoint    INT NOT NULL DEFAULT 0
response_high_watermark         TIMESTAMPTZ
nps_at_checkpoint               NUMERIC(5,1)
csat_at_checkpoint              NUMERIC(5,1)
ces_at_checkpoint               NUMERIC(5,1)
topic_fingerprint               TEXT
delta_from_prior                JSONB           -- ✅ EXISTS — node_delta_compute writes here
report_blob_ref                 TEXT
run_id                          UUID REFERENCES agent_runs(id)

-- MISSING in Phase 0.5 (requires ALTER TABLE before node_publish can write it):
-- meaningful_delta BOOLEAN NOT NULL DEFAULT FALSE
-- Phase 0.5 migration: ALTER TABLE survey_insight_checkpoints
--   ADD COLUMN IF NOT EXISTS meaningful_delta BOOLEAN NOT NULL DEFAULT FALSE;
```

**Phase 0.5 impact:** `node_publish` must check whether `meaningful_delta` column exists before writing (or run the migration first as a hard dependency). `credits_debited` does NOT exist on this table — the `InvestigationDrawer` credit cost row shows the configured `credit_cost_automated_checkpoint` setting value (default 5), not a per-checkpoint DB value.

---

## 3a. `insight_checkpoints_v2` (Phase 1+ replacement)

Replaces/extends `survey_insight_checkpoints`. Migration keeps old table read-only. Not available in Phase 0.5.

```sql
CREATE TYPE insight_run_mode AS ENUM (
  'automated_incremental',
  'manual_expert',
  'manual_quick'
);

CREATE TYPE insight_lane AS ENUM ('automated', 'manual');

CREATE TABLE insight_checkpoints_v2 (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id                       UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  org_id                          TEXT NOT NULL,

  -- Linked list
  checkpoint_number               INT NOT NULL,
  parent_checkpoint_id            UUID REFERENCES insight_checkpoints_v2(id),
  lane                            insight_lane NOT NULL,

  -- Run identity
  run_id                          UUID NOT NULL REFERENCES agent_runs(id),
  run_mode                        insight_run_mode NOT NULL,
  trigger                         TEXT NOT NULL CHECK (trigger IN (
    'stream', 'scheduler', 'manual', 'milestone', 'api', 'days', 'responses'
  )),

  -- Actor
  created_by                      TEXT NOT NULL,  -- system:stream | system:scheduler | user:{id}
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Watermarks (automated)
  response_count_at_checkpoint    INT NOT NULL DEFAULT 0,
  response_high_watermark         TIMESTAMPTZ,     -- max(created_at) of included responses
  new_response_count              INT NOT NULL DEFAULT 0,

  -- Metrics at checkpoint (denormalized for list UI)
  nps_at_checkpoint               NUMERIC(5,1),
  csat_at_checkpoint              NUMERIC(5,1),
  ces_at_checkpoint               NUMERIC(5,1),
  topic_fingerprint               TEXT,

  -- Delta (code-computed)
  delta_from_prior                JSONB,           -- output of compute_delta()
  meaningful_delta                BOOLEAN NOT NULL DEFAULT FALSE,

  -- Lineage
  lineage_json                    JSONB NOT NULL DEFAULT '{}',
  /*
    lineage_json schema:
    {
      "config_hash": "abc...",
      "pipeline_version": "2.1.0",
      "prior_checkpoint_refs": ["uuid", ...],      // up to lookback
      "new_response_ids": ["uuid", ...],           // capped in row; full list in manifest
      "metric_snapshot_ids": ["uuid", ...],
      "insight_report_id": "uuid|null",
      "sample_stats": {
        "corpus_size": 1200,
        "sampled": 150,
        "window_start": "...",
        "window_end": "..."
      },
      "tool_versions": { "absa": "1.2", "embed": "text-embedding-3-small@..." }
    }
  */

  -- Credits
  credits_debited                 INT NOT NULL DEFAULT 0,    -- credits charged for this checkpoint
  credit_ledger_tx_id             TEXT,                      -- FK ref to creditLedger transaction

  -- Storage
  report_blob_ref                 TEXT,            -- opaque ref to checkpoint_store
  citations_manifest_ref          TEXT,            -- optional separate blob
  schema_version                  INT NOT NULL DEFAULT 2,

  -- Manual window (nullable for automated)
  window_start                    TIMESTAMPTZ,
  window_end                      TIMESTAMPTZ,
  report_label                    TEXT,            -- user label for manual runs

  UNIQUE (survey_id, org_id, checkpoint_number)
);

CREATE INDEX idx_ckpt_v2_survey_lane_num
  ON insight_checkpoints_v2 (survey_id, org_id, lane, checkpoint_number DESC);

CREATE INDEX idx_ckpt_v2_parent
  ON insight_checkpoints_v2 (parent_checkpoint_id);

CREATE INDEX idx_ckpt_v2_survey_created
  ON insight_checkpoints_v2 (survey_id, org_id, created_at DESC);
```

### Linked list invariants

1. **Automated lane:** exactly one head; `parent_checkpoint_id` of checkpoint N = id of N-1 in automated lane.
2. **Manual lane:** `parent_checkpoint_id` may point to latest automated for trail graph, but **automated children never point to manual parents**.
3. **Append-only:** no UPDATE on automated rows except `report_blob_ref` if async write completes (single allowed patch).
4. **`checkpoint_number`:** monotonic per `(survey_id, lane)` — not global across lanes.

---

## 4. Checkpoint blob schema (v2)

Stored via `checkpoint_store.py` — `schema_version: 2`.

```json
{
  "schema_version": 2,
  "checkpoint_id": "uuid",
  "survey_id": "uuid",
  "run_mode": "automated_incremental",
  "generated_at": "ISO8601",

  "executive_summary": "...",
  "themes": [ { "name": "...", "sentiment": 0.2, "volume_share": 0.15, "lifecycle": "growing" } ],

  "insights": [
    {
      "layer": "diagnostic",
      "category": "voice.topic",
      "headline": "...",
      "narrative": "... [rabc]",
      "metric_json": {},
      "citations_json": [ { "response_id": "...", "quote": "..." } ],
      "trust_score": 82
    }
  ],

  "delta_summary": {
    "nps_delta": -3.2,
    "topics_emerged": ["Billing confusion"],
    "topics_declining": ["Slow login"],
    "topics_new": ["AI features"],
    "topics_resolved": []
  },

  "prior_checkpoint_summaries": [
    { "checkpoint_id": "...", "checkpoint_number": 11, "nps": 42, "headline_digest": "..." }
  ],

  "citations_manifest": {
    "response_ids": ["..."],
    "snapshot_ids": ["..."],
    "prior_checkpoint_ids": ["..."],
    "total_citations": 47
  }
}
```

**PII note:** quotes in blob are required for report replay; access controlled by org RBAC. Manifest enables “show all sources” without parsing narrative.

---

## 5. `insight_reports` (manual documents)

```sql
CREATE TABLE insight_reports (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id         UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  org_id            TEXT NOT NULL,
  run_id            UUID NOT NULL REFERENCES agent_runs(id),

  run_mode          insight_run_mode NOT NULL CHECK (run_mode IN ('manual_expert', 'manual_quick')),
  label             TEXT,
  window_start      TIMESTAMPTZ NOT NULL,
  window_end        TIMESTAMPTZ NOT NULL,

  created_by        TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  status            TEXT NOT NULL DEFAULT 'generating'
                    CHECK (status IN ('generating', 'ready', 'failed')),
  blob_ref          TEXT,
  citations_manifest_ref TEXT,

  summary_headline  TEXT,          -- for trail list
  trust_score_avg   NUMERIC(4,1),

  checkpoint_id     UUID REFERENCES insight_checkpoints_v2(id),

  UNIQUE (run_id)
);

CREATE INDEX idx_insight_reports_survey
  ON insight_reports (survey_id, org_id, created_at DESC);
```

**URL pattern:** `/experience/surveys/:surveyId/intelligence/reports/:reportId`

---

## 6. `insights` table extensions

Add columns (migration):

```sql
ALTER TABLE insights ADD COLUMN IF NOT EXISTS
  projection_source_checkpoint_id UUID REFERENCES insight_checkpoints_v2(id);

ALTER TABLE insights ADD COLUMN IF NOT EXISTS
  lane insight_lane NOT NULL DEFAULT 'automated';

ALTER TABLE insights ADD COLUMN IF NOT EXISTS
  insight_report_id UUID REFERENCES insight_reports(id);
```

**Semantics:**
- Active automated cards: `lane=automated`, `superseded_at IS NULL`, `projection_source_checkpoint_id = latest automated head`
- Pinned manual insight: `lane=manual`, user pin in `user_state_json`

Existing `audit_json` fields preserved; extend:

```json
{
  "prior_insight_refs": ["checkpoint_id:..."],
  "new_response_refs": ["response_id:..."],
  "prior_checkpoint_refs": ["uuid"],
  "delta_facts": { "nps_delta": -3.2 },
  "run_mode": "automated_incremental"
}
```

---

## 7. `delta_from_prior` JSON schema

Output of `compute_delta()` — stored in the `delta_from_prior JSONB` column on the checkpoint row.

**Phase 0.5 note:** `delta_from_prior` uses topic name-sets only (emerged = topic name in current but not in N-1; resolved = in N-1 but not in current). Share-weighted lifecycle fields (`growing`, `declining` with volume deltas) are added in Phase 2 by `compute_topic_lifecycle()`.

**`compute_delta()` actual output schema** (`crystalos/tools/delta.py`):

```json
{
  "nps_delta": -3.2,
  "csat_delta": -0.1,
  "ces_delta": null,
  "response_count_delta": 87,
  "topic_changes": {
    "emerged":   ["Billing confusion", "AI features"],
    "resolved":  ["Slow login"],
    "persisted": ["Wait Time", "Onboarding"]
  },
  "trend_direction":   "down",
  "trend_persistence": "first_occurrence"
}
```

Key facts about the `compute_delta()` output:
- `topic_changes.emerged` / `.resolved` / `.persisted` — name strings only, no volume share (Phase 0.5)
- `trend_direction` uses a hardcoded ±2 NPS display threshold — this is display classification only, not the write-gate
- `trend_direction` values: `"up"`, `"down"`, `"stable"` (confirmed from `crystalos/tools/delta.py`)
- `trend_persistence` values: `"first_occurrence"`, `"second_occurrence"`, `"confirmed"` (confirmed from `crystalos/tools/delta.py`)
- There is NO `fingerprint_changed` field in Phase 0.5 (`compute_topic_fingerprint()` is not called)
- There is NO `declining` sub-key on `topic_changes` — the Phase 0.5 schema uses `emerged` / `resolved` / `persisted`

**Phase 2 extended schema** (after `compute_topic_lifecycle()` is implemented):

```json
{
  "nps_delta": -3.2,
  "csat_delta": -0.1,
  "ces_delta": null,
  "response_count_delta": 87,
  "topic_changes": {
    "emerged":   [{ "name": "Billing confusion", "volume_share": 0.08 }],
    "resolved":  [{ "name": "Slow login", "prior_volume_share": 0.06 }],
    "persisted": ["Wait Time", "Onboarding"],
    "growing":   [{ "name": "AI features", "volume_share_delta": 0.07 }],
    "declining": [{ "name": "Pricing", "volume_share_delta": -0.05 }]
  },
  "fingerprint_changed": true,
  "trend_direction":   "down",
  "trend_persistence": "second_occurrence"
}
```

**`meaningful_delta` field:** This key is added by `evaluate_meaningful_delta()` in `node_delta_compute` BEFORE the dict is stored. The column stores the combined output. `meaningful_delta_reasons` is optional metadata (not required in Phase 0.5):

```json
{
  "nps_delta": -3.2,
  "topic_changes": { "emerged": ["Billing confusion"], "resolved": [], "persisted": [] },
  "trend_direction": "down",
  "trend_persistence": "first_occurrence",
  "meaningful_delta": true
}
```

---

## 8. Topic lifecycle classification

**Phase 0.5 (implemented — name-set only):** `compute_delta()` computes lifecycle from topic name intersection:

| State | Rule |
|-------|------|
| `emerged` | Name present in current topic set, absent in N-1 topic set |
| `resolved` | Name present in N-1 topic set, absent in current topic set |
| `persisted` | Name present in both topic sets |

No volume-share data is carried in Phase 0.5 topic_changes — only name strings.

**Phase 2 extension (requires `compute_topic_lifecycle()` — not yet implemented):**

Computed in `compute_topic_lifecycle(parent_topics, current_topics, parent_metrics)`:

| State | Rule |
|-------|------|
| `emerged` | In current, not in parent fingerprint; volume_share ≥ 3% |
| `growing` | In both; volume_share delta ≥ +5pp |
| `stable` | In both; \|volume_share delta\| < 5pp |
| `declining` | In both; volume_share delta ≤ -5pp |
| `resolved` | In parent, absent from current; was ≥ 3% share |

Thresholds configurable via `survey_insight_settings`. `compute_topic_lifecycle` does not exist in Phase 0.5 — implement in Phase 2.

---

## 9. Migration from `survey_insight_checkpoints`

| Old | New |
|-----|-----|
| `survey_insight_checkpoints` | `insight_checkpoints_v2` with `parent_checkpoint_id` inferred from `checkpoint_number` order |
| `trigger='schedule'` rows | Map to `trigger='scheduler'` |
| Missing `run_id` | Synthetic `agent_runs` or `run_id` nullable in backfill |
| `report_url` | `report_blob_ref` |

Backfill script walks checkpoints ordered by `checkpoint_number`, sets `parent_checkpoint_id` to previous row, `lane=automated`, `run_mode=automated_incremental`.

---

## 10. `custom_reports` (Custom Analysis — fully isolated)

Custom Analysis is architecturally separate from the main insight pipeline. Rows here
**never appear in the `insights` table** and never trigger `superseded_at` on live dashboard insights.

```sql
CREATE TABLE custom_reports (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           TEXT        NOT NULL,
  survey_id        UUID        NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  created_by       TEXT        NOT NULL,   -- user:{clerk_id}
  name             TEXT        NOT NULL,   -- user-supplied label

  -- Filter spec: the exact parameters that produced this analysis
  filter_spec      JSONB       NOT NULL,
  /*
    filter_spec schema:
    {
      "date_from": "ISO8601 | null",
      "date_to":   "ISO8601 | null",
      "segments":  [{"field": "...", "op": "eq", "value": "..."}],
      "topics":    ["topic name"],
      "metric_types": ["nps", "csat", "ces"],
      "narrative_depth": "summary | detailed"
    }
  */

  status           TEXT        NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  run_id           UUID        REFERENCES agent_runs(id),

  -- Output
  blob_ref         TEXT,                  -- checkpoint_store ref for report blob
  output_url       TEXT,                  -- signed/public URL for download
  slug             TEXT        UNIQUE,    -- permalink: /reports/custom/{slug}

  -- Quality metadata
  credit_cost      INT         NOT NULL DEFAULT 0,
  corpus_coverage_pct NUMERIC(5,2),      -- pct of matching responses included in analysis
  sample_size      INT,                   -- actual rows analyzed
  trust_score_avg  NUMERIC(4,1),

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at     TIMESTAMPTZ,
  expires_at       TIMESTAMPTZ            -- NULL = no expiry (org admin controls)
);

CREATE INDEX idx_custom_reports_org_survey
  ON custom_reports (org_id, survey_id, created_at DESC);

CREATE INDEX idx_custom_reports_run
  ON custom_reports (run_id);
```

---

## 11. `custom_report_insights` (Custom Analysis — isolated insight rows)

Parallel to the `insights` table but scoped to a `custom_report_id`. Topic centroids
are **read-only** — filtered analyses are never allowed to update `survey_topics` centroids.

```sql
CREATE TABLE custom_report_insights (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  custom_report_id UUID        NOT NULL REFERENCES custom_reports(id) ON DELETE CASCADE,
  org_id           TEXT        NOT NULL,
  survey_id        UUID        NOT NULL,

  -- Same schema as insights table (mirrors layer/category/headline contract)
  layer            TEXT        NOT NULL CHECK (layer IN ('descriptive','diagnostic','predictive','prescriptive')),
  category         TEXT        NOT NULL,
  headline         TEXT        NOT NULL,
  narrative        TEXT,
  metric_json      JSONB       NOT NULL DEFAULT '{}',
  citations_json   JSONB       NOT NULL DEFAULT '[]',
  trust_score      INT         NOT NULL DEFAULT 50,
  trust_json       JSONB       NOT NULL DEFAULT '{}',
  priority         NUMERIC(4,3),

  -- Filter context (always label insights with the filter that produced them)
  filter_label     TEXT,   -- e.g. "Enterprise segment / Q3 2026"

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
  -- NOTE: no superseded_at — custom report insights are immutable snapshots
);

CREATE INDEX idx_custom_report_insights_report
  ON custom_report_insights (custom_report_id, priority DESC NULLS LAST);
```

**Key invariants:**
1. Rows here are immutable once written — no supersede, no update.
2. `survey_topics` centroids are never modified by custom analysis graph.
3. `trust_score` capped at 55 when `filter_spec` results in n < 30 (statistical minimum).
4. No predictive layer insights in custom reports (population continuity not guaranteed for filtered subsets).

---

## 12. Retention & compaction

**Policy (automated lane only):**
- Keep all checkpoints with `meaningful_delta=true` for retention period
- Collapse runs where `meaningful_delta=false` into **rollup marker** (UI groups, DB may delete blob after 30d)

**Manual reports:** never auto-deleted; org admin may purge per compliance settings.

**Custom reports:** expire per `expires_at` (NULL = no expiry); admin can manually delete.

---

## 13. `org_insight_defaults` (org-level configuration fallback)

Stores org-wide defaults that `survey_insight_settings` inherits via `COALESCE` at query time.
All fields are NULLABLE — NULL means "use platform constant from `constants.py`."

```sql
CREATE TABLE org_insight_defaults (
  org_id                          TEXT PRIMARY KEY REFERENCES orgs(id) ON DELETE CASCADE,

  -- Automated
  automated_insights_enabled              BOOLEAN,
  automated_report_generation_enabled     BOOLEAN,
  stream_response_threshold               INT,
  prior_checkpoint_lookback               INT,

  -- Refresh
  refresh_lookback_days                   INT,
  refresh_min_response_count              INT,
  refresh_daily_limit                     INT,

  -- Manual
  manual_daily_run_limit                  INT,
  manual_expert_checkpoint_lookback       INT,
  manual_expert_full_corpus_cap           INT,
  manual_expert_max_corpus                INT,

  -- Custom Analysis
  custom_analysis_enabled                 BOOLEAN,
  custom_analysis_daily_limit             INT,

  -- Credit costs (per-org billing overrides)
  credit_cost_automated_checkpoint        INT    CHECK (credit_cost_automated_checkpoint IS NULL OR (credit_cost_automated_checkpoint >= 1 AND credit_cost_automated_checkpoint <= 500)),
  credit_cost_automated_report            INT    CHECK (credit_cost_automated_report IS NULL OR (credit_cost_automated_report >= 1 AND credit_cost_automated_report <= 500)),
  credit_cost_refresh                     INT    CHECK (credit_cost_refresh IS NULL OR (credit_cost_refresh >= 1 AND credit_cost_refresh <= 500)),
  credit_cost_manual_quick                INT    CHECK (credit_cost_manual_quick IS NULL OR (credit_cost_manual_quick >= 1 AND credit_cost_manual_quick <= 500)),
  credit_cost_manual_expert               INT    CHECK (credit_cost_manual_expert IS NULL OR (credit_cost_manual_expert >= 1 AND credit_cost_manual_expert <= 500)),

  updated_at                              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by                              TEXT
);
```

**Three-level merge at run time:**
```sql
COALESCE(survey_insight_settings.stream_response_threshold,
         org_insight_defaults.stream_response_threshold,
         10 /* platform constant */)
```

---

## 14. Indexes for Crystal tools

```sql
-- get_checkpoint_chain(survey_id, lookback=5)
-- uses idx_ckpt_v2_survey_lane_num

-- get_insight_report(report_id)
-- PK on insight_reports

-- responses since watermark
CREATE INDEX IF NOT EXISTS idx_responses_survey_created
  ON responses (survey_id, created_at)
  WHERE deleted_at IS NULL;
```
