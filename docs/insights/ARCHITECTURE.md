# Experient AI Insights — Engineering Architecture

> The scalable, distributed, global insight pipeline. Designed by senior platform engineers against the [INSIGHT_TAXONOMY.md](INSIGHT_TAXONOMY.md) contract and the scientific requirements in [RESEARCH.md](RESEARCH.md). Aligned with the four-stage cloud strategy in `docs/PRODUCT_PLAN.md` (GCP-first, Firebase → Cloud Run → multi-region).

---

## 1. Design principles (non-negotiable)

1. **LLMs narrate, code computes.** Every number on screen comes from deterministic Python/SQL. The LLM writes prose around it.
2. **Vector-first data model.** Every response is embedded at ingest. Topics, drivers, citations all derive from the vector store. No fixed taxonomy.
3. **Streaming by default.** The user sees insights as they generate. Like our existing survey-creator agent (SSE-based), insight generation is event-driven.
4. **Reuse, don't rebuild.** We already have LangGraph + `agent_runs` + Postgres + Redis + the agents microservice. Insight generation is a *new run_type*, not a new system.
5. **Tenant-isolated, region-aware.** Every read/write is `WHERE org_id = …`. Multi-region uses Cloud SQL read replicas per region.
6. **Cheap by default, lavish on demand.** Free tier runs on Gemini Flash 2.0; enterprise can opt to a stronger model. Costs visible to the user per insight.
7. **Reproducible.** Temperature 0, pinned model versions, audit log per insight. Same inputs → same outputs is a CI test.
8. **No bespoke ML pipelines for v1.** Embeddings + HDBSCAN + LLM + Postgres covers 80% of the taxonomy. Add XGBoost, Prophet, Shapley as discrete callable tools, not full pipelines.

---

## 2. Logical architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                              CLIENT (React)                              │
│  InsightsPage  →  SSE stream  →  React Query  →  InsightCard components  │
└──────────────────────────────────────────────────────────────────────────┘
                                    │ HTTPS / SSE
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                       EXPRESS API (Cloud Run / Functions)                │
│  /api/insights/:surveyId   GET    list/stream insights                   │
│  /api/insights/:surveyId/regenerate  POST  trigger new run               │
│  /api/insights/:id         GET    fetch one (with audit drawer)          │
│  /api/insights/:id/feedback POST  thumbs / dismiss / pin                 │
│  /api/insights/ask         POST   NLQ over survey corpus (Sprint 6)      │
└──────────────────────────────────────────────────────────────────────────┘
                                    │ HMAC-signed internal
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                AGENTS MICROSERVICE — Insight Generation                  │
│                    (Python FastAPI + LangGraph)                          │
│                                                                          │
│   ┌──────────────────────────────────────────────────────────────────┐   │
│   │                    INSIGHT DAG (LangGraph)                       │   │
│   │                                                                  │   │
│   │  ingest → embed → metrics → cluster → ABSA → drivers → trends →  │   │
│   │  anomalies → predict → narrate → cite → verify → publish         │   │
│   └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│   Tool calls (NOT LLM math):                                             │
│   • compute_nps_ci          • run_bertopic                               │
│   • compute_csat            • run_shapley_kda                            │
│   • compute_ces             • run_prophet                                │
│   • run_goemotions          • detect_changepoint                         │
│   • run_absa                • predict_churn (XGBoost)                    │
│   • retrieve_quotes (RAG)   • compute_uplift                             │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                     DATA PLANE (per-region)                              │
│                                                                          │
│   Postgres (Cloud SQL)             Redis (Memorystore)                   │
│   • surveys, responses             • LangGraph checkpoints (hot)         │
│   • insights (materialized)        • LLM response cache (24h TTL)        │
│   • agent_runs (run lineage)       • Rate-limit counters                 │
│   • response_embeddings (pgvector) • SSE pub/sub                         │
│   • insight_audit_log              • Idempotency keys                    │
│                                                                          │
│   Object storage (GCS):                                                  │
│   • Long-form audit blobs (prompt + full context)                        │
│   • Exported reports (PDF, CSV)                                          │
└──────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│              EXTERNAL — Model Plane (via OpenRouter)                     │
│   Gemini 2.0 Flash (default)  • Claude Haiku 4.5 (enterprise narrator)   │
│   text-embedding-3-large       • Gemini 2.5 Pro (premium tier)           │
└──────────────────────────────────────────────────────────────────────────┘
```

### Mapping to existing codebase

| New / changed | What it is | File / location |
|---|---|---|
| `Insight` schema | DB table + TypeScript type | `supabase/migrations/<new>.sql`, `app/src/types/index.ts` |
| `agent_runs.run_type = 'insight_generation'` | Reuse existing table | Migration adds enum value |
| Insight DAG | LangGraph state machine | `agents/graphs/insights.py` (new, parallel to `agents/graph.py`) |
| Tool functions | Python functions wrapped by FastAPI | `agents/tools/*.py` (new) |
| pgvector | Embedding store | `supabase/migrations/<new>.sql` adds `vector` extension + `response_embeddings` table |
| `/api/insights/*` | Express routes | `backend/src/routes/local/insights.js` (extend existing) |
| `InsightsPage` | React rewrite | `app/src/pages/InsightsDashboardPage.tsx` (rewrite) |
| Cost ledger | Reuse existing | `agent_runs.credit_log`, `agent_runs.cost_usd` |
| Streaming | Reuse existing | `stream_events` JSONB column, SSE endpoint pattern |

**Migration cost:** modest. We have ~80% of the infrastructure already.

---

## 3. Data model — concrete additions

### 3.1 Embeddings (new)

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE response_embeddings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id UUID NOT NULL REFERENCES responses(id) ON DELETE CASCADE,
  survey_id   UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  org_id      TEXT NOT NULL,
  question_id TEXT NOT NULL,           -- which question's answer
  text        TEXT NOT NULL,           -- the verbatim (denormalized for retrieval)
  embedding   vector(1536),            -- text-embedding-3-large
  language    TEXT NOT NULL,           -- detected ISO 639-1
  emotion     TEXT,                    -- GoEmotions label (precomputed)
  aspect      TEXT,                    -- ABSA aspect (nullable, precomputed)
  sentiment   NUMERIC(3,2),            -- -1.0 to 1.0, precomputed
  model       TEXT NOT NULL,           -- e.g. "text-embedding-3-large@2025-12"
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX response_embeddings_embedding_idx
  ON response_embeddings USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
CREATE INDEX response_embeddings_org_survey_idx
  ON response_embeddings(org_id, survey_id);
CREATE INDEX response_embeddings_emotion_idx
  ON response_embeddings(org_id, emotion) WHERE emotion IS NOT NULL;
```

**Why pgvector vs Pinecone/Weaviate/Qdrant:** we already run Postgres; one less system to operate; pgvector at ivfflat scales to 10M+ vectors per index comfortably (Stage 2 of the cloud strategy). HNSW upgrade path is available when we hit 100M+ (Stage 3).

### 3.2 Insights table (new — replaces today's basic `insights` table)

```sql
DROP TABLE IF EXISTS insights;  -- migrate any existing rows first

CREATE TABLE insights (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id    UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  org_id       TEXT NOT NULL,
  run_id       UUID NOT NULL REFERENCES agent_runs(id),

  -- Classification
  layer        TEXT NOT NULL CHECK (layer IN ('descriptive','diagnostic','predictive','prescriptive')),
  category     TEXT NOT NULL,                      -- e.g. 'driver.key', 'voice.topic'
  question_type TEXT,                              -- nullable for cross-question
  segment_json JSONB,                              -- nullable; selector for segment

  -- The claim
  headline     TEXT NOT NULL,
  narrative    TEXT NOT NULL,                      -- with [r123] citations inline
  recommended_action JSONB,                        -- nullable; L4 only

  -- The numbers
  metric_json  JSONB,                              -- nullable; {name,value,ci_low,ci_high,...}

  -- Grounding
  citations_json JSONB NOT NULL DEFAULT '[]',      -- [{response_id, quote, sentiment, relevance}]

  -- Trust
  trust_score  INT NOT NULL CHECK (trust_score BETWEEN 0 AND 100),
  trust_json   JSONB NOT NULL,                     -- components + sample_size + below_minimum_sample
  priority     NUMERIC(5,4),                       -- 0..1, recomputed per fetch

  -- Reproducibility / audit
  insight_hash TEXT NOT NULL,                      -- sha256 of canonicalized output
  audit_json   JSONB NOT NULL,                     -- prompt_hash, model, embedding_model, temperature, seed

  -- Lifecycle
  user_state_json JSONB NOT NULL DEFAULT '{}',     -- {pinned, dismissed, thumbs, notes, ...}
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  superseded_by UUID REFERENCES insights(id),      -- when regenerated, point to new
  superseded_at TIMESTAMPTZ
);

CREATE INDEX insights_survey_active_idx
  ON insights(survey_id, generated_at DESC)
  WHERE superseded_at IS NULL;
CREATE INDEX insights_org_priority_idx
  ON insights(org_id, priority DESC)
  WHERE superseded_at IS NULL;
CREATE INDEX insights_category_idx
  ON insights(org_id, category)
  WHERE superseded_at IS NULL;
CREATE UNIQUE INDEX insights_hash_idx
  ON insights(survey_id, insight_hash);            -- idempotency
```

**Key design choices:**

- **Soft-supersede, not delete.** Old insights are kept for audit. UI filters `WHERE superseded_at IS NULL`.
- **`insight_hash` for idempotency.** Re-running the pipeline with same inputs → same hash → no duplicate row. Update timestamps only.
- **JSONB for variant payloads.** `metric_json`, `citations_json`, `audit_json` are flexible per category but always present.

### 3.3 Audit log (new — long-form, slow tier)

```sql
CREATE TABLE insight_audit_log (
  insight_id   UUID PRIMARY KEY REFERENCES insights(id) ON DELETE CASCADE,
  prompt_text  TEXT NOT NULL,                       -- full templated prompt
  retrieved_context JSONB NOT NULL,                 -- the quotes/responses passed to LLM
  llm_samples JSONB NOT NULL,                       -- n=3 raw outputs for consistency check
  verifier_pass BOOLEAN NOT NULL,                   -- did verifier model accept?
  verifier_notes TEXT,
  generated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Why separate table:** keeps the hot `insights` table small; audit blobs can be GBs per org. Cold-storage candidate (GCS Nearline) after 90 days.

### 3.4 `agent_runs` extension

Add `'insight_generation'` to the `run_type` enum. No schema change beyond that — existing columns (`credit_log`, `total_tokens`, `stream_events`, `status`) work as-is.

---

## 4. The insight DAG (LangGraph)

The pipeline that turns responses into a batch of `Insight` rows.

```python
# agents/graphs/insights.py

class InsightState(TypedDict):
    survey_id: str
    org_id: str
    run_id: str
    trigger: Literal["new_response", "regenerate", "schedule", "stream"]

    # Loaded
    survey: Survey
    responses: List[Response]
    embeddings: List[Embedding]      # may be partial; the ingest node fills gaps

    # Computed
    metrics: Dict[str, MetricResult]          # nps, csat, ces, distributions, completion
    clusters: List[Cluster]                   # BERTopic output with LLM labels
    drivers: List[Driver]                     # Shapley key driver analysis
    aspect_sentiments: List[AspectSentiment]  # ABSA
    trends: List[Trend]                       # Prophet / STL
    anomalies: List[Anomaly]                  # Prophet outliers + Bayesian changepoint
    predictions: List[Prediction]             # forecast + churn
    actions: List[Action]                     # uplift-derived recommendations

    # Emitted
    insights: List[Insight]
    errors: List[ErrorEntry]
```

**Node graph (parallel where independent):**

```
                ┌──→ metrics (compute_nps_ci, csat, distribution)─┐
ingest → embed ─┼──→ cluster (bertopic + llm_label)──────────────┼──→ narrate ─→ cite ─→ verify ─→ publish
                ├──→ absa (run_absa)─────────────────────────────┤
                ├──→ drivers (run_shapley_kda) ──────────────────┤
                ├──→ trends (run_prophet) ───────────────────────┤
                ├──→ anomalies (detect_changepoint)──────────────┤
                ├──→ predict (predict_churn, forecast)───────────┤
                └──→ actions (compute_uplift)────────────────────┘
```

**Node responsibilities:**

| Node | Owns | LLM? |
|---|---|---|
| `ingest` | Load survey + responses; identify new vs cached | No |
| `embed` | Embed unembedded responses; precompute emotion + ABSA per row | Yes (embedding model only) |
| `metrics` | Compute NPS, CSAT, CES, distributions, completion, with CIs | No — pure code |
| `cluster` | BERTopic on response embeddings; LLM-label each cluster with citations | Yes (label only) |
| `absa` | ABSA via prompted LLM with strict JSON schema, per response | Yes |
| `drivers` | Shapley regression with bootstrap CIs | No |
| `trends` | Prophet on metric time-series | No |
| `anomalies` | Prophet outlier + Bayesian changepoint | No |
| `predict` | XGBoost churn (when features available), Prophet forecast | No |
| `actions` | Match high-impact friction → action template; uplift estimate | Half (template selection only) |
| `narrate` | For each generated finding, write `headline` + `narrative` with citation markers | Yes |
| `cite` | Validate every claim has ≥2 `[rXXX]` citations; reject uncited | No (validator) |
| `verify` | Verifier LLM pass: "is each claim supported by quoted text?" | Yes |
| `publish` | Insert `Insight` rows; supersede prior; emit stream events | No |

**Streaming semantics:**

The DAG emits `stream_event` writes after each node, just like the existing survey-creation graph (see `agents/graph.py` for the pattern). The frontend subscribes via SSE and re-renders cards as they arrive. **A user sees the descriptive insights at t≈5s, diagnostics at t≈15s, predictive/prescriptive at t≈30s — never a blank loading state.**

### 4.1 Pseudo-code for the citation validator

```python
def cite(state: InsightState) -> InsightState:
    valid, rejected = [], []
    citation_re = re.compile(r"\[r([a-f0-9-]+)\]")
    for insight in state["insights"]:
        ids = citation_re.findall(insight.narrative)
        if len(ids) < 2 and not insight.trust["below_minimum_sample"]:
            rejected.append((insight, "fewer than 2 citations"))
            continue
        # Every cited id must exist in retrieved_context
        if not all(id in state["retrieved_context_ids"] for id in ids):
            rejected.append((insight, "ghost citation"))
            continue
        valid.append(insight)
    state["insights"] = valid
    state["errors"].extend(rejected)
    return state
```

### 4.2 Pseudo-code for the verifier

```python
def verify(state: InsightState) -> InsightState:
    for insight in state["insights"]:
        ctx = "\n".join(c["quote"] for c in insight.citations)
        ok = llm_classify(
            prompt=VERIFIER_PROMPT,
            inputs={"claim": insight.narrative, "context": ctx},
            output_schema={"supported": "boolean", "reason": "string"},
            model=VERIFIER_MODEL,
            temperature=0,
        )
        insight.audit["verifier_pass"] = ok["supported"]
        if not ok["supported"]:
            # Demote, don't delete — surface as "exploratory"
            insight.trust["score"] = min(insight.trust["score"], 55)
    return state
```

---

## 5. Model routing & cost

### 5.1 Per-node model assignment

| Node | Default (free/paid) | Enterprise | Why |
|---|---|---|---|
| `embed` | text-embedding-3-large | same | one model only; cache aggressively |
| `cluster` LLM labeling | Gemini 2.0 Flash | Gemini 2.0 Flash | structured output; cheap |
| `absa` | Gemini 2.0 Flash | Gemini 2.5 Pro | enterprise gets richer aspect taxonomy |
| `narrate` | Gemini 2.0 Flash | Claude Haiku 4.5 | narrative quality matters; Haiku has the best prose-with-citation discipline |
| `verify` | Gemini 2.0 Flash | Claude Haiku 4.5 | second opinion; same family as narrator → catches narrator hallucinations |

### 5.2 Cost target

| Tier | Per insight (descriptive) | Per insight (diagnostic) | Per full-survey regenerate |
|---|---|---|---|
| Free | <$0.001 | <$0.005 | <$0.05 |
| Pro | <$0.002 | <$0.01 | <$0.10 |
| Enterprise | <$0.01 | <$0.05 | <$0.50 |

These are token-budget targets. Concretely on Gemini 2.0 Flash (~$0.075/1M input, $0.30/1M output):

- A descriptive insight is ~200 tokens output × $0.30/1M = $0.00006 LLM cost + embedding amortized
- A 500-response full regenerate at full LLM load ≈ 50K output tokens = $0.015

Compared to Qualtrics' ~$5/response, even at maximum LLM load we are **>100× cheaper per response analyzed**. This is the "cheaper" leg of the wedge.

### 5.3 Caching strategy

| Layer | Key | TTL | Storage |
|---|---|---|---|
| Embedding cache | sha256(text + model) | 30 days | Postgres (`response_embeddings` is itself the cache) |
| LLM response cache | sha256(prompt + model + temp) | 24h | Redis |
| BERTopic cluster cache | sha256(embedding_ids) | invalidate on ≥10% corpus growth | Postgres `cluster_runs` table |
| Insight cache | `insight_hash` UNIQUE in DB | superseded by next gen | Postgres |
| KDA result cache | sha256(survey_id + question_set + response_window) | 1h | Redis |

**Idempotency** is built into the schema: the same input set → same `insight_hash` → upsert, not insert.

---

## 6. Real-time vs batch

### 6.1 Three tiers of latency

| Mode | Trigger | Latency | When |
|---|---|---|---|
| **Real-time stream** | Response submitted | <5s before partial dashboard updates | Enterprise; "live" surveys (events, kiosk) |
| **Incremental** | Response submitted | 10–60s for L1/L2 refresh | Default for paid tiers; queued in Redis with 30s batch window |
| **Periodic** | Scheduled (hourly free, every 5min paid) | 1–5min | Free tier; large stable surveys |

The "real-time" mode does not redo the whole DAG per response. It runs:

1. embed → emotion → ABSA on the new response (sub-second)
2. update aggregate metrics (NPS, CSAT) atomically (~10ms)
3. update topic cluster membership if response is far from existing centroids (probabilistic; deferred otherwise)
4. emit SSE event with the updated metric — UI re-renders just that card

Full L3/L4 (predictive + prescriptive) regeneration is **always batched** — at the 5-minute or hourly tick — because the math (Prophet, Shapley) is O(n) on the corpus, not per-response.

### 6.2 Backpressure

Redis sorted set acts as the work queue. The agents service polls; if backlog grows, the **per-org rate limit kicks in** (config: 1 full regen / 2 min for free, 1 / 30s for pro, 1 / 10s for enterprise). The free tier's "incremental" mode silently downgrades to "periodic" on heavy load.

### 6.3 Idempotency under retry

Every job in the queue carries an `idempotency_key = sha256(survey_id + window_start + window_end + trigger)`. Workers `SETNX` in Redis before starting; if another worker already has the key, this one no-ops. On crash, the key expires after 5min and the next worker retries cleanly.

---

## 7. Multi-region & global

Aligns with `docs/PRODUCT_PLAN.md` cloud strategy stages.

### 7.1 Stage 1 — Firebase (now → 10K users)

- Single region (us-central1)
- Firestore + Functions; the agents service lives in Cloud Run (us-central1 only)
- Insight latency: 2–4s p95 from anywhere

### 7.2 Stage 2 — Cloud Run + Cloud SQL (10K → 100K users)

- us-central1 (primary)
- Cloud SQL with **logical replication** to a EU read replica (europe-west1) for data residency
- Insights computed in the primary region, replicated to the read replica
- EU customers' surveys can opt into **EU-only**: writes go directly to EU primary instance (one DB per region for those customers)

### 7.3 Stage 3 — Multi-region active-active (100K+ users)

```
                              Cloudflare anycast
                                     │
              ┌──────────────────────┼──────────────────────┐
              ▼                      ▼                      ▼
         us-central1              europe-west1          asia-northeast1
         Cloud Run                Cloud Run             Cloud Run
         Cloud SQL primary        Cloud SQL primary     Cloud SQL primary
         pgvector index           pgvector index        pgvector index
```

- Org's home region pinned at creation; cross-region reads via federated query for global rollups
- LLM calls go through OpenRouter (already multi-region) — no per-region model deployment
- Each region has its own embedding cache; cross-region embedding sharing only on explicit cross-region rollup

### 7.4 Data residency

- Org-level flag `data_residency: "us" | "eu" | "apac"`
- All response, embedding, insight rows pinned to a region database
- Audit logs **cannot leave the home region**; cross-region only sees aggregate metrics
- Pre-built compliance reporting for SOC 2 / GDPR / DPDP

---

## 8. Streaming protocol (SSE)

The frontend opens an SSE connection to `/api/insights/:surveyId/stream`. Events follow the pattern already used by the survey-creation agent (see `agent_runs.stream_events`).

```
event: insight.started
data: {"run_id":"...", "survey_id":"...", "trigger":"regenerate", "expected_categories":["score.nps","driver.key",...]}

event: insight.node_completed
data: {"node":"metrics", "elapsed_ms":420, "insights_added":3}

event: insight.added
data: {"insight": {...full Insight object...}}

event: insight.superseded
data: {"insight_id":"...", "superseded_by":"..."}

event: insight.error
data: {"node":"absa", "message":"...", "recoverable":true}

event: insight.completed
data: {"run_id":"...", "total_insights":18, "total_tokens":12483, "cost_usd":0.038}
```

The frontend renders cards as they arrive; a "regenerating" pill stays visible at the top until `insight.completed`. **No blocking spinner.**

---

## 9. Skill layer integration

The Phase 2A "Dashboard & Tools Skill" exposes five MCP/skill actions. Wire them as follows:

| Skill action | Backed by |
|---|---|
| `get_insights(survey_id, layer?, category?, segment?)` | `GET /api/insights/:surveyId` with query params |
| `ask(survey_id, question)` | `POST /api/insights/ask` — RAG pipeline that retrieves relevant insights + raw quotes, LLM answers with citations |
| `compare(survey_a_id, survey_b_id)` | `POST /api/insights/compare` — embedding-similarity + metric-delta computation |
| `summarize(survey_id, audience: "exec"|"team"|"action_list")` | `POST /api/insights/summarize` — narrator over existing insights, audience-tuned |
| `generate_report(survey_id, format: "pdf"|"slack"|"slides")` | `POST /api/insights/report` — composes pinned + top-priority insights into the requested format |

The skill executor (`agents/skills/dashboard.py`) is a thin orchestrator that calls these endpoints. The MCP server (Sprint 15A) re-exports them as MCP tools.

---

## 10. Observability

Reuse existing Prometheus + Sentry + Loki stack.

### 10.1 Metrics

```
insight_dag_duration_seconds{node, status}     # histogram
insight_generated_total{layer, category, model, status}
insight_cost_usd{org_id, model, node}          # gauge
insight_token_count{model, direction}          # input/output
insight_citation_rate{layer}                   # avg citations per insight
insight_validation_rejected_total{reason}      # citation_missing, ghost_citation, verifier_fail
insight_user_action_total{action}              # thumbs_up, dismissed, pinned, converted
embedding_cache_hit_ratio
llm_cache_hit_ratio
queue_depth{tier}
```

### 10.2 SLOs

| SLO | Target | Burn-rate alert |
|---|---|---|
| Time to first descriptive insight after response submit | p95 < 5s | fast burn at 14× over 1h |
| Full regenerate end-to-end | p95 < 30s @ ≤1000 responses | fast burn at 14× over 1h |
| Citation validity rate | > 99.5% | page on <99% sustained 15min |
| Verifier pass rate | > 95% | page on <90% sustained 15min |
| LLM cache hit rate | > 40% | warn on <20% sustained 1h |
| pgvector index recall@10 | > 0.95 | alert on <0.90 weekly check |

### 10.3 Per-insight audit trail

Every insight stores a sha256 hash of its prompt + retrieved context. A `/api/insights/:id/audit` endpoint (auth-gated to org admins) returns the full trail — prompt, context, raw LLM samples, verifier output, validator output. This is **both a debugging tool and a compliance feature**.

---

## 11. Failure modes & defenses

| Failure | Defense |
|---|---|
| LLM hallucinates a number | All numbers from code; LLM gets numbers as inputs, never outputs |
| LLM cites a non-existent response | Citation validator rejects ghost IDs; integration test on every PR |
| Insight contradicts source | Verifier LLM pass; trust score capped if disagreement |
| Sample too small | `below_minimum_sample` flag; UI renders as "exploratory" not "insight" |
| Topic cluster includes one outlier | HDBSCAN noise label `-1` excluded from labeling pass |
| Positivity bias in summary | Stratified retrieval — equal positive/negative quotes in context; post-hoc sentiment distribution audit |
| OpenRouter outage | Fallback model tier: Gemini 2.0 Flash → Gemini 1.5 Flash → GPT-4o-mini → "insights unavailable, raw data accessible" |
| Cloud SQL primary fails | Read replica auto-promotes (Cloud SQL HA); writes pause for ~60s |
| pgvector index corruption | Daily reindex job; full rebuild can run in <1h at Stage 2 scale |
| Cost runaway | Per-org daily budget cap; circuit breaker when org credit balance hits 0 |
| Adversarial responses (prompt injection in verbatim) | Strict prompt template separation; verbatims wrapped in `<response id="...">…</response>` tags; no system-prompt fields exposed |

---

## 12. Phased delivery

Aligns with `docs/TRACKER.md` Phase 2.

### Phase 2.A — Foundations (replaces existing Sprint 4 + part of 5)

1. **Migrations** — pgvector, `response_embeddings`, redesigned `insights` table, `insight_audit_log`
2. **Tools library** — Python implementations of `compute_nps_ci`, `compute_csat`, `compute_ces`, `run_goemotions`, `run_absa`, `retrieve_quotes`
3. **Embedding job** — backfill all historical responses; new responses embedded on submit (Postgres trigger → Redis queue → agents worker)
4. **L1 insights only** — `score.*` + `voice.topic` + `voice.aspect_sentiment` end-to-end with citations
5. **Streaming API + simple UI** — `InsightsPage` shows L1 cards live, supersedes mock

### Phase 2.B — Diagnostic & predictive (replaces Sprint 5)

6. **KDA tool** — `run_shapley_kda` with bootstrap CIs
7. **Prophet tool** — `run_prophet`, `detect_changepoint`
8. **Anomaly + trend insights** — `anomaly.*`, `trend.*`
9. **Predictive insights** — `predict.metric_forecast` first; `predict.churn_risk` once behavioral integration exists

### Phase 2.C — Prescriptive + NLQ (replaces Sprint 6)

10. **Action templates + uplift** — `action.fix_friction`, `action.target_segment`
11. **NLQ over corpus** — `/api/insights/ask` with RAG over insights + raw quotes
12. **Executive summary** — `/api/insights/summarize?audience=exec`

### Phase 2.D — Multi-region + skill publishing (overlaps Sprint 7A / 15A)

13. **EU primary** — Stage-2 multi-region
14. **MCP exposure** — Dashboard & Tools Skill published

---

## 13. Open questions to resolve before Phase 2.A

These deserve explicit alignment with PM / leadership before tickets are cut:

1. **Embedding model lock-in.** `text-embedding-3-large` (1536d) vs Google `gemini-embedding-001` (768d). The latter is cheaper and same-vendor as our default narrator; the former is the open industry default. **Recommended:** Gemini embedding for cost; benchmark both on a labeled set before final lock-in.
2. **Behavioral signal source.** Churn predictions need login/usage data. Without an integration, churn risk is verbal only ("12 respondents used churn-intent language"). **Recommended:** ship L3.predictive without churn-XGBoost in v1; add when product analytics integration lands.
3. **Insight Audit UI exposure.** Should the audit drawer be visible to all users or only admins? **Recommended:** all users see citations + confidence breakdown; only admins see the full prompt + LLM samples. Differentiation feature.
4. **Free-tier rate limits.** 1 full regen / 2min may be too generous if user-LLM cost is the constraint, or too tight if it's the trust-building moment. **Recommended:** start at 1/2min and instrument; tune in Sprint 5.
5. **Cross-survey insights.** `meta.cross_survey` requires org-wide indexes that grow O(orgs × surveys × responses). **Recommended:** v1.0 ships within-survey only; cross-survey lands in v1.1 with an org-level embedding rollup table.
6. **Synthetic data for demos.** Per [RESEARCH.md §8.3](RESEARCH.md), synthetic respondents are dangerous for production decisioning. **Recommended:** explicit "demo data" flag on surveys created from templates; insights generated from demo data have a `DEMO` watermark on the card and a tooltip linking to the policy.
