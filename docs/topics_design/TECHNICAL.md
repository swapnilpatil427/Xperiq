# Deep Topic Intelligence — Technical Design

## Overview

This document describes the architecture, data model, algorithmic design, and operational characteristics of Experient's Deep Topic Intelligence pipeline. It covers:

1. End-to-end pipeline DAG
2. Incremental clustering algorithm (Welford centroid, ANN assignment, candidate buffer)
3. XM signal fingerprint computation
4. Database schema and migration strategy
5. API contract (backend → frontend)
6. Performance characteristics and scaling model
7. Configuration and environment variables
8. Operational runbook

---

## 1. Pipeline Architecture

The insights pipeline is a LangGraph DAG executed by the Python agents service (`agents/graphs/insights.py`). It runs asynchronously after a trigger from the Node.js backend (via `POST /api/insights/:surveyId/trigger`).

### DAG nodes (in execution order)

```
ingest
  └─► context
        └─► route_specialists
              └─► embed
                    ├─► metrics          (parallel)
                    └─► extract_texts    (parallel)
                          └─► absa
                                └─► cluster
                                      └─► topics
                                            └─► narrate
                                                  └─► verify
                                                        └─► evaluate
                                                              └─► publish
```

| Node | Responsibility |
|---|---|
| `ingest` | Load responses + survey metadata from Postgres |
| `context` | Compute survey-level context (language, domain, question types) |
| `route_specialists` | Select LLM routing based on AGENTS_ENV |
| `embed` | Compute or cache OpenAI embeddings for all open-text answers |
| `metrics` | Compute NPS CI, CSAT, CES, completion rate, response velocity |
| `extract_texts` | Filter responses to ABSA-eligible open texts |
| `absa` | Aspect-Based Sentiment Analysis: LLM assigns aspect, sentiment, emotion, effort per response |
| `cluster` | Bootstrap or incremental topic clustering (see §2) |
| `topics` | LLM-based canonical topic discovery + upsert to `survey_topics` |
| `narrate` | Generate natural-language insight narratives |
| `verify` | QC pass: score insight quality, flag low-trust outputs |
| `evaluate` | Compute trust scores (coverage, consistency, grounding, sample size) |
| `publish` | Write insights, topic signals, and metric snapshots to DB |

### Bootstrap vs. incremental

On the first run for a survey (`node_cluster` checks `topic_registry.has_centroids()`), a full bootstrap clustering is performed:
1. All ABSA-enriched responses are clustered using cosine similarity (threshold 0.72, min cluster size 2)
2. Topic centroids are seeded from cluster means
3. `survey_topic_centroids` rows are inserted

On all subsequent runs:
1. Only responses not seen in prior runs are processed (delta via `responses.submitted_at` window)
2. Each new response is ANN-matched to the nearest existing centroid
3. Matched responses update the centroid via Welford's batch formula
4. Unmatched responses buffer in `topic_candidates`
5. When the candidate buffer reaches the flush threshold, mini-clustering fires on candidates only

---

## 2. Incremental Clustering Algorithm

### 2.1 Welford Online Mean (Batch Form)

Topic centroids are 1536-dimensional vectors (one per topic per survey). When k new responses are assigned to topic T:

```
new_centroid = (old_centroid × n + Σ(new_embeddings)) / (n + k)
new_count    = n + k
```

This is mathematically identical to running the standard scalar Welford formula k times sequentially. The batch form avoids k separate DB round-trips.

**Atomicity**: The `update_centroids_welford_batch` function uses a single cursor to `SELECT ... FOR UPDATE` all affected centroid rows, then `executemany` the updates in the same transaction. The `FOR UPDATE` lock prevents two concurrent pipeline runs from both reading the same stale centroid count and then both writing divergent values.

**Implementation**: `agents/lib/topic_registry.py::update_centroids_welford_batch`

### 2.2 Batch ANN Assignment

The ANN assignment step fetches all topic centroids for the survey once, then computes dot-product cosine similarity in Python for each new response:

```python
similarity = sum(a * b for a, b in zip(embedding, centroid_vec))
```

This is valid because OpenAI `text-embedding-3-small` vectors are L2-normalized: `‖v‖₂ = 1`, so `dot(a, b) = cos(a, b)`.

A response is assigned to a topic if `max_similarity ≥ ASSIGNMENT_THRESHOLD` (default: `0.72`). Responses below threshold go to the candidate buffer.

**Why Python dot product instead of pgvector ANN?**
- For the typical survey (5–50 topics), loading all centroids and computing similarity in Python is faster than issuing 1 pgvector query per response
- The ANN index (`survey_topic_centroids_hnsw_idx`) is still used for one-off lookups (e.g., the `assign_to_nearest` API that may be added later)
- Single centroid fetch eliminates N database round-trips for N new responses

**Implementation**: `agents/lib/topic_registry.py::assign_batch_to_nearest`

### 2.3 Candidate Buffer and Flush

Responses that don't match any existing topic above threshold are stored in `topic_candidates` (keyed by `(survey_id, response_id)` with `ON CONFLICT DO NOTHING`).

The flush threshold is adaptive:
```python
flush_threshold = max(5, int(total_survey_responses * 0.03))
```

When `candidate_count >= flush_threshold`, the buffer is flushed and mini-clustered. Clusters with `size >= 2` and internal cosine similarity `>= 0.72` become new topics.

### 2.4 HNSW Index

The `survey_topic_centroids` table uses an HNSW index (Hierarchical Navigable Small World):

```sql
CREATE INDEX survey_topic_centroids_hnsw_idx
    ON survey_topic_centroids USING hnsw (centroid vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);
```

**Why HNSW over IVFFlat?**  
IVFFlat with `lists=10` requires at least 390 rows for the index to be effective; below that it degrades to a sequential scan. Surveys have 5–50 topic centroids — far below the IVFFlat threshold. HNSW performs O(log n) at any table size.

---

## 3. XM Signal Fingerprint

`compute_full_topic_signals` (`agents/lib/topic_signals.py`) takes a topic cluster (list of ABSA-enriched response items) and all survey responses, and returns the full XM signal fingerprint:

### Signal computation

| Signal | Computation |
|---|---|
| `avg_sentiment_score` | Mean of ABSA sentiment scores (-1 to +1) across cluster items |
| `net_sentiment` | Alias for avg_sentiment_score |
| `positive_pct` / `negative_pct` / `neutral_pct` | Fraction of items with sentiment > 0.2 / < -0.2 / else |
| `avg_nps` | Mean NPS score of responses in this cluster |
| `nps_impact` | Mean NPS score of in-cluster responses minus mean NPS of out-of-cluster responses |
| `promoter_pct` / `detractor_pct` / `passive_pct` | NPS segment fractions for in-cluster responses |
| `driver_score` | Point-biserial correlation between binary "mentioned this topic" and overall NPS score |
| `avg_csat` | Mean CSAT score of in-cluster responses |
| `csat_impact` | Mean CSAT of in-cluster minus mean CSAT of out-of-cluster responses |
| `urgency_score` | `min(10, abs(sentiment) × 5 × √(vol/max_vol) × (effort/7) × trend_mult)` |
| `confidence_level` | `"high"` if n≥30 and coverage≥0.3, `"low"` if n<5, else `"medium"` |
| `avg_effort_score` | Mean effort score (1–7) computed by the linguistic effort model |
| `emotion_distribution` | Plutchik emotion label → fraction across cluster items |
| `top_verbatims` | Up to 5 representative quotes selected by sentiment extremity and length |
| `response_ids` | List of all response IDs in the cluster (for drill-down) |

### Urgency score formula

```
urgency = min(10,
    abs(avg_sentiment) × 5
    × sqrt(volume / max_topic_volume)
    × (avg_effort / 7)
    × trend_multiplier
)

trend_multiplier:
    trending == "up" and sentiment < 0:  1.5
    trending == "up":                    1.2
    trending == "down":                  0.8
    else:                                1.0
```

### Driver score

Point-biserial correlation between binary topic membership and NPS score:

```python
r_pb = (mean_in - mean_out) / std_all × sqrt(n_in × n_out / n_total²)
```

Clamped to [-1, 1]. Represents how much knowing a response mentions this topic predicts its NPS score direction.

---

## 4. Database Schema

### Core tables

#### `survey_topics`

Primary topic registry. One row per (survey_id, topic_name, time_window).

Key columns:

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `survey_id` | UUID FK surveys | |
| `org_id` | TEXT | |
| `run_id` | UUID FK agent_runs | |
| `time_window` | TEXT | `'all_time'`, `'30d'`, `'7d'`, etc. |
| `name` | TEXT | Canonical topic name (LLM-assigned) |
| `aliases` | TEXT[] | Alternate phrasings |
| `is_new` | BOOLEAN | True on first appearance |
| `volume` | INT | Response count in this topic |
| `sentiment_score` | FLOAT | -1 to +1 |
| `dominant_emotion` | TEXT | Plutchik primary emotion |
| `effort_score` | FLOAT | 1–7 linguistic effort |
| `trending` | TEXT | `up\|down\|stable\|new` |
| `sentiment_momentum` | TEXT | `improving\|worsening\|stable` |
| `urgency_score` | FLOAT | 0–10 composite |
| `volume_delta` | INT | Change in volume since prior run |
| `volume_delta_pct` | NUMERIC | % change since prior run |
| `chronic` | BOOLEAN | True after 3+ consecutive negative runs |
| `negative_run_streak` | INT | Current streak counter |
| `health_label` | TEXT | `emerging\|growing\|worsening\|fading\|stable` |
| `velocity_pct` | FLOAT | WoW weekly submission % change |
| `net_sentiment` | FLOAT | Alias for avg_sentiment |
| `nps_avg` | FLOAT | Mean NPS of in-topic responses |
| `nps_impact` | FLOAT | In-topic NPS minus out-of-topic NPS |
| `promoter_pct` | FLOAT | % of in-topic responses from promoters |
| `detractor_pct` | FLOAT | % of in-topic responses from detractors |
| `passive_pct` | FLOAT | % of in-topic responses from passives |
| `driver_score` | FLOAT | Point-biserial correlation |
| `urgency_score` | FLOAT | Composite 0–10 |
| `avg_csat` | FLOAT | |
| `csat_impact` | FLOAT | |
| `avg_effort_score` | FLOAT | |
| `confidence_level` | TEXT | `high\|medium\|low` |
| `top_verbatims` | JSONB | `[{text, sentiment_score, response_id}]` |
| `emotion_distribution` | JSONB | `{"joy": 0.3, "anger": 0.1, ...}` |
| `sample_response_ids` | JSONB | Response IDs for detail view |

**Unique constraint**: `(survey_id, name, time_window)` — used by `ON CONFLICT DO UPDATE` upsert.

#### `survey_topic_centroids`

Running-mean centroid per topic per survey.

| Column | Type | Notes |
|---|---|---|
| `survey_id` | UUID FK | |
| `topic_name` | TEXT | Matches `survey_topics.name` |
| `centroid` | vector(1536) | Welford running mean |
| `response_count` | INT | Responses folded into this centroid |
| `topic_id` | UUID FK survey_topics | Linked after LLM naming |

**Index**: HNSW on `centroid` with `m=16, ef_construction=64`.
**Unique**: `(survey_id, topic_name)`.

#### `topic_candidates`

Buffer of unassigned response embeddings.

| Column | Type | Notes |
|---|---|---|
| `survey_id` | UUID FK | |
| `response_id` | UUID FK responses | |
| `embedding` | vector(1536) | |

**Unique**: `(survey_id, response_id)` — prevents duplicates if the pipeline retries.

#### `topic_windows`

Weekly health snapshots per topic. One row per (topic_id, window_start).

| Column | Type | Notes |
|---|---|---|
| `topic_id` | UUID FK survey_topics | |
| `window_start` | TIMESTAMPTZ | Monday 00:00 UTC |
| `window_end` | TIMESTAMPTZ | Sunday 23:59:59 UTC |
| `response_count` | INT | Weekly submission count from `responses.ai_topics` GIN lookup |
| `avg_sentiment_score` | FLOAT | |
| `health_label` | TEXT | Computed from WoW delta |
| `velocity_pct` | FLOAT | WoW % change in weekly submissions |
| `net_sentiment` | FLOAT | |
| `nps_impact` | FLOAT | |
| `emotion_distribution` | JSONB | |
| `top_verbatims` | JSONB | |
| (+ all other XM signal columns) | | |

**Unique**: `(topic_id, window_start)`.

#### `survey_metric_snapshots`

Per-pipeline-run KPI history for the metric-history chart.

| Column | Notes |
|---|---|
| `captured_at` | Timestamp of the run |
| `response_count` | Total responses at time of run |
| `nps`, `nps_ci_low`, `nps_ci_high` | NPS with Wilson CI |
| `promoter_pct`, `detractor_pct`, `passive_pct` | |
| `csat`, `completion_rate`, `effort_score` | |
| `response_velocity_7d` | Responses in last 7 days |
| `anomaly_flag` | True if NPS or velocity is statistically anomalous |

### DDL strategy

Schema is maintained in two places:
1. **`supabase/migrations/`** — for Supabase-managed deployments, applied in order
2. **`agents/lib/db.py::ensure_schema()`** — idempotent `ALTER TABLE IF NOT EXISTS` DDL applied at agent startup

The agents service runs `ensure_schema()` before any pipeline execution so the schema is always current even if the Supabase migration hasn't been applied.

---

## 5. API Contract

### Backend → Frontend

#### `GET /api/insights/:surveyId/topics?window=all_time&sort=urgency`

Returns the current topic list for display in the Topics tab.

Response:
```json
{
  "topics": [
    {
      "id": "...",
      "name": "Checkout friction",
      "volume": 142,
      "sentiment_score": -0.62,
      "dominant_emotion": "frustration",
      "effort_score": 5.3,
      "trending": "up",
      "sentiment_momentum": "worsening",
      "urgency_score": 7.8,
      "volume_delta": 23,
      "volume_delta_pct": 19.3,
      "chronic": true,
      "nps_avg": 3.2,
      "positive_pct": 12.1,
      "negative_pct": 71.4
    }
  ],
  "run_status": "completed",
  "window": "all_time"
}
```

#### `GET /api/insights/:surveyId/topic-trends?window=30d`

Returns weekly window snapshots for all topics (used by the trend sparklines and the detailed trend chart).

Response:
```json
{
  "trends": [
    {
      "topic_id": "...",
      "topic_name": "Checkout friction",
      "windows": [
        {
          "window_start": "2026-05-12T00:00:00Z",
          "response_count": 38,
          "avg_sentiment_score": -0.71,
          "health_label": "growing",
          "velocity_pct": 22.4,
          "emotion_distribution": {"anger": 0.4, "disgust": 0.3, "fear": 0.2, "sadness": 0.1}
        }
      ]
    }
  ]
}
```

#### `GET /api/insights/:surveyId/metric-history?days=30`

Returns the time-series KPI snapshots for the metric history chart.

Response:
```json
{
  "history": [
    {
      "captured_at": "2026-05-19T10:22:00Z",
      "response_count": 340,
      "nps": 42.1,
      "nps_ci_low": 38.2,
      "nps_ci_high": 46.0,
      "csat": 4.1,
      "completion_rate": 0.83,
      "anomaly_flag": false
    }
  ],
  "days": 30,
  "survey_id": "..."
}
```

---

## 6. Performance Characteristics

### Per-run cost model

| Phase | Dominant cost | Scale factor |
|---|---|---|
| Embedding | OpenAI API call | O(new_responses) |
| ANN assignment | Python dot product | O(new_responses × n_topics) |
| Welford update | 1 SELECT FOR UPDATE + 1 executemany UPDATE | O(n_assigned_topics) |
| Candidate insert | 1 executemany INSERT | O(n_unassigned) |
| ABSA | LLM API calls (batched) | O(new_responses / batch_size) |
| Topic discovery | 1–3 LLM calls | O(1) |
| Narration | 1 LLM call per insight | O(n_insights) |

For a survey receiving 100 new responses per day with 20 existing topics:
- Embedding: ~100 API calls (cached for re-runs)
- ANN assignment: 100 × 20 = 2,000 dot products in Python (<1ms total)
- ABSA: ~4 LLM batch calls (batch_size=25 in dev-paid)
- Total wall-clock time: ~8–15 seconds

### Connection pool

`agents/lib/db.py` pools: `min_size=4, max_size=20`. Supports up to 20 concurrent pipeline runs sharing the pool. Each run holds at most 2 connections for brief periods (incremental path: 1 for centroid lock + 1 for candidate count).

### Embedding cache

`response_embeddings` table stores all computed embeddings. On re-runs or retries, embeddings are fetched from cache rather than recomputed. Cache hit rate is typically >95% for incremental runs (only the delta responses miss).

---

## 7. Configuration

### Environment variables

| Variable | Default | Notes |
|---|---|---|
| `AGENTS_ENV` | `dev` | Controls model routing: dev / dev-paid / staging / prod |
| `OPENROUTER_API_KEY` | — | Required for all LLM calls |
| `OPENAI_API_KEY` | — | Optional — enables real embeddings; BoW fallback if absent |
| `ANTHROPIC_API_KEY` | — | Required for staging + prod (Anthropic SDK) |
| `AGENTS_DB_DSN` | `postgresql://postgres:...` | Postgres connection string |
| `AGENTS_INTERNAL_KEY` | `dev-internal-key-change-in-prod` | Shared secret for Node→agents HTTP calls |
| `AGENTS_URL` | `http://localhost:8001` | Used by scheduler to reach the agents service |
| `AGENTS_PORT` | `8001` | Port for the FastAPI service |
| `CHECKPOINT_LOCAL_PATH` | `/tmp/checkpoints` | LangGraph state checkpoints (local dev) |

### Model routing

Model selection is controlled by `AGENTS_ENV` via `agents/lib/models.py`:

| Env | Creator | ABSA / Narrate | Cost/run |
|---|---|---|---|
| `dev` | `deepseek/deepseek-chat:free` | `meta-llama/llama-3.1-8b:free` | ~$0 |
| `dev-paid` | `openai/gpt-4o` | `openai/gpt-4o-mini` | ~$0.03–0.05 |
| `staging` | `anthropic/claude-3-5-sonnet` | `google/gemini-flash-1.5` | ~$0.01 |
| `prod` | `anthropic/claude-opus-4` | `anthropic/claude-3-5-haiku` | ~$0.05–0.10 |

---

## 8. Operational Runbook

### Starting the pipeline locally

```bash
# 1. Start infrastructure
docker-compose up -d          # Postgres + Redis + monitoring

# 2. Start the backend (applies Node ensureTopicsTables DDL at startup)
cd backend && npm start        # :3001

# 3. Start the agents service (applies ensure_schema DDL at startup)
cd agents && python main.py    # :8001

# 4. Start the frontend
cd app && npm run dev          # :5173
```

### Triggering a pipeline run

Via the UI: Navigate to a survey with responses → Insights tab → "Generate Insights".

Via curl (local dev):
```bash
curl -X POST http://localhost:3001/api/insights/SURVEY_ID/trigger \
     -H "Authorization: Bearer YOUR_TOKEN"
```

### Checking run status

```bash
# List recent runs
curl http://localhost:3001/api/runs?surveyId=SURVEY_ID \
     -H "Authorization: Bearer YOUR_TOKEN"

# Stream events from a run
curl http://localhost:3001/api/runs/RUN_ID/events \
     -H "Authorization: Bearer YOUR_TOKEN"
```

### Resetting topic state (for testing)

To force a full re-bootstrap of topics for a survey:
```sql
DELETE FROM survey_topic_centroids WHERE survey_id = 'YOUR_SURVEY_ID';
DELETE FROM topic_candidates WHERE survey_id = 'YOUR_SURVEY_ID';
DELETE FROM topic_windows WHERE survey_id = 'YOUR_SURVEY_ID';
DELETE FROM survey_topics WHERE survey_id = 'YOUR_SURVEY_ID';
```

The next pipeline run will treat it as a bootstrap run.

### Schema migrations

When adding new columns to `survey_topics` or related tables:
1. Add the column to the appropriate `supabase/migrations/` SQL file
2. Add a corresponding `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` to `ensure_schema()` in `agents/lib/db.py`
3. Update the `ensureTopicsTables()` function in `backend/src/routes/insights.js`

The three DDL locations ensure the schema is consistent whether the database was initialized from migrations, from the backend startup, or from the agents startup.

### Monitoring

Prometheus metrics are exposed at `http://localhost:8001/metrics` (agents) and `http://localhost:3001/metrics` (backend).

Key metrics to watch:
- `topic_pipeline_duration_seconds` — per-run latency
- `topic_centroid_assignments_total` — ratio of assigned vs. buffered responses
- `llm_call_duration_seconds{node="absa"}` — ABSA is typically the slowest node
- `db_pool_checkout_wait_seconds` — connection pool pressure

Grafana dashboard: `docker/grafana/dashboards/agents.json`
