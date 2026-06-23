# Experient Platform Guide — Architecture, Flows & Scenarios

**Version:** 2.0 · **Updated:** 2026-06-03  
**Audience:** Engineers, PMs, and anyone who wants to understand how the platform works end-to-end.  
**Canonical location:** [`docs/platform/PLATFORM_GUIDE.md`](../../docs/platform/PLATFORM_GUIDE.md)

---

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [Survey Creation Flow](#2-survey-creation-flow)
3. [Publish & Response Collection](#3-publish--response-collection)
4. [Insight Pipeline — 12-Node DAG](#4-insight-pipeline--12-node-dag)
5. [Crystal Q&A — Streaming AI Analyst](#5-crystal-qa--streaming-ai-analyst)
6. [Crystal Action Tools](#6-crystal-action-tools)
7. [Action Recommendations System](#7-action-recommendations-system)
8. [Copilot Chat Editing](#8-copilot-chat-editing)
9. [Templates & Workflows](#9-templates--workflows)
10. [CrystalOS Skill Framework](#10-crystalos-skill-framework)
11. [Memory & Context Management](#11-memory--context-management)
12. [Data Model Overview](#12-data-model-overview)

---

## 1. System Architecture

The platform has three layers. The frontend never talks to CrystalOS directly — everything goes through the backend, which acts as auth gatekeeper and data layer.

```
┌──────────────────────────────────────────────────────────────────┐
│                      REACT APP  :5173                            │
│                                                                  │
│  Survey Builder  ·  Insights Page  ·  Crystal Panel             │
│  Template Library  ·  Workflow Studio  ·  Analytics             │
│                                                                  │
│  api.ts — Clerk JWT auto-injected on every request              │
└──────────────────────────┬───────────────────────────────────────┘
                           │  REST + SSE
                           │  Authorization: Bearer <JWT>
┌──────────────────────────▼───────────────────────────────────────┐
│                   NODE.JS BACKEND  :3001                         │
│                                                                  │
│  Auth     · Clerk JWT verify  · org/user extraction             │
│  Data     · Postgres pool     · Redis rate limiter              │
│  Proxy    · agentsClient.js   · X-Internal-Key                  │
│                                                                  │
│  Routes: surveys · responses · insights · copilot · experience  │
└──────────────────────────┬───────────────────────────────────────┘
                           │  HTTP  X-Internal-Key
                           │  (never exposed to browser)
┌──────────────────────────▼───────────────────────────────────────┐
│                    CRYSTALOS  :8001                              │
│                                                                  │
│  LangGraph DAG (12 nodes)    ←  insight pipeline               │
│  Crystal ReAct loop          ←  Q&A + action tools             │
│  Skill Registry + Runtime    ←  26 SKILL.md skills             │
│  12 XM Specialist Advisors   ←  action recommendations         │
│                                                                  │
│  Memory  L0 cache · L1 Redis · L2 compression · L3 facts · L4  │
│  Observe  tracer · hallucination_scorer · pii_scrubber          │
└──────────────────────────────────────────────────────────────────┘
          │               │               │
     Postgres          Redis          OpenRouter
   (insights,        (cache,          (LLM API)
   responses,        streams,
   threads)          rate-limit)
```

```mermaid
graph TB
    subgraph Browser["Browser / React App :5173"]
        UI[Survey Builder]
        IP[Insights Page]
        CP[Crystal Panel]
        TL[Templates & Workflows]
    end

    subgraph Backend["Node.js Backend :3001"]
        AUTH[Auth Middleware<br/>Clerk JWT]
        SURVEY[surveys.js]
        INSIGHTS[insights.js]
        COPILOT[copilot.js]
        EXPERIENCE[experience.js]
        AC[agentsClient.js]
    end

    subgraph CrystalOS["CrystalOS :8001"]
        PIPELINE[Insight Pipeline<br/>12-node LangGraph]
        CRYSTAL[Crystal ReAct Loop<br/>13 tools]
        SKILLS[Skill Registry<br/>26 Skills]
        ADVISORS[12 XM Advisors<br/>Parallel execution]
    end

    subgraph Data["Data Layer"]
        PG[(Postgres)]
        REDIS[(Redis)]
        LLM[OpenRouter<br/>LLM Gateway]
    end

    Browser -->|REST + SSE<br/>Bearer JWT| Backend
    Backend -->|X-Internal-Key<br/>HTTP| CrystalOS
    CrystalOS --> Data
    Backend --> PG
    Backend --> REDIS

    style CrystalOS fill:#1e1b4b,color:#e0e7ff
    style Backend fill:#164e63,color:#e0f2fe
    style Browser fill:#14532d,color:#dcfce7
    style Data fill:#292524,color:#fef3c7
```

---

## 2. Survey Creation Flow

**Real-life scenario:** Rachel (VP of CX) types an intent — "I want to measure how likely enterprise customers are to recommend us after 90-day onboarding" — and gets a complete, QC-approved survey in ~15 seconds.

```mermaid
sequenceDiagram
    actor Rachel
    participant App as React App
    participant Backend as Node.js :3001
    participant COS as CrystalOS :8001
    participant LLM as OpenRouter

    Rachel->>App: Types intent + clicks Create
    App->>Backend: POST /api/copilot/orchestrate<br/>{intent, surveyTypeId, orgContext}
    Backend->>Backend: Verify Clerk JWT<br/>Extract orgId, userId
    Backend->>COS: POST /orchestrate<br/>{intent, org_id, user_id}
    COS->>COS: Create agent_run record
    COS-->>Backend: 202 {run_id: "abc-123", status: "running"}
    Backend-->>App: {run_id, status}

    Note over App,COS: LangGraph DAG runs in background

    loop Poll every 2s
        App->>Backend: GET /api/copilot/runs/abc-123/status
        Backend->>COS: GET /orchestrate/abc-123/status
        COS-->>Backend: {status, stream_events, questions: []}
        Backend-->>App: Current state
    end

    COS->>LLM: Creator agent — generate questions
    LLM-->>COS: 8 questions JSON
    COS->>LLM: QC agent (cross-vendor) — review
    LLM-->>COS: {qc_score: 87, issues: [], improvements: []}
    COS->>LLM: Recommender — suggest enhancements
    LLM-->>COS: 3 action recommendations

    COS-->>Backend: {status: "completed", questions, qc_score, recommendations}
    Backend-->>App: Full run result
    App-->>Rachel: Survey editor + QC score + 3 action cards
```

**What CrystalOS runs (in order):**

```
orchestrate/
  1. survey_creator_agent    → generates initial questions from intent
  2. quality_control_agent   → cross-vendor QC (creator=DeepSeek → QC=Gemini)
  3. compliance_agent        → GDPR data minimization, accessibility check
  4. recommender_agent       → 3 improvement action suggestions
```

**Key behaviors:**
- Cross-vendor QC prevents model self-confirmation bias (creator and QC always use different vendors)
- `USE_SKILL_RUNTIME=true` → creator step delegates to `survey-creator` CrystalOS skill
- QC score ≥ 70 = passes; below triggers automatic fix suggestions
- Run result stays alive in `agent_runs` table for copilot editing (next scenario)

---

## 3. Publish & Response Collection

**Real-life scenario:** Rachel publishes the survey. 847 enterprise customers fill it out over 3 months, triggering progressive insight tiers automatically.

```mermaid
sequenceDiagram
    actor Rachel
    actor Customer
    participant App
    participant Backend
    participant Redis
    participant COS as CrystalOS

    Rachel->>App: Clicks Publish
    App->>Backend: POST /api/surveys/{id}/publish
    Backend->>Backend: Generate publish_token<br/>Set status = active
    Backend-->>App: {publish_token, public_url}
    App-->>Rachel: Share link: app.experient.ai/s/xyz789

    Note over Customer,COS: Customer fills survey (no auth)

    Customer->>Backend: GET /api/public/surveys/xyz789
    Backend-->>Customer: Survey questions (no auth required)
    Customer->>Backend: POST /api/surveys/{id}/responses<br/>{answers, publishToken}
    Backend->>Backend: Validate token<br/>Insert response row
    Backend->>Redis: XADD response:created {surveyId, count}

    Note over Redis,COS: Progressive tier system

    COS->>Redis: XREAD response:created (listening)
    Redis-->>COS: New response event
    COS->>COS: Check count vs thresholds<br/>10 → first_voices<br/>40 → early_signals<br/>100 → full_report
    COS->>COS: Redis dedup key tier:{id}:{tier}<br/>30-day TTL prevents re-trigger
    COS->>Backend: POST /api/insights/{id}/generate<br/>trigger=stream
```

**Tier thresholds** (configurable in `constants.py`):

| Responses | Tier | What runs |
|-----------|------|-----------|
| 10 | `first_voices` | Topic discovery only, no narrative |
| 40 | `early_signals` | Topics + basic metrics |
| 100 | `full_report` | Full 12-node pipeline |
| 250 | `growing_picture` | Full pipeline + trend analysis |

---

## 4. Insight Pipeline — 12-Node DAG

**Real-life scenario:** After 150 responses, Rachel clicks "Generate Insights". The pipeline runs in ~45 seconds and produces 8 insight cards with trust scores, citations, and recommended actions.

```mermaid
flowchart TD
    START([Trigger: manual / schedule / stream]) --> LOCK

    LOCK[node_ingest\nAdvisory lock — no concurrent runs\nLoad responses with stratified sampling\n Bootstrap vs. incremental detection]

    LOCK --> EMBED[node_embed\nVectorize open-text verbatims\nOpenRouter embeddings API]

    EMBED --> PAR{Parallel}

    PAR --> MET[node_metrics\nNPS confidence intervals ±4pts\nCSAT / CES / completion rate\nResponse velocity + trend]

    PAR --> EXT[node_extract_texts\nClean verbatim extraction\nFilter noise + duplicates]

    MET --> ABSA
    EXT --> ABSA

    ABSA[node_absa\nAspect-Based Sentiment Analysis\nLLM batches — 25 verbatims each\nassign aspect + sentiment per verbatim]

    ABSA --> CLUSTER[node_cluster\nK-means on embeddings\nGroup similar responses\nCompute cluster centroids]

    CLUSTER --> TOPICS[node_topics\nLLM: canonical topic names from clusters\nVolume · sentiment · urgency · trending\nUpsert to survey_topics table]

    TOPICS --> NARRATE[node_narrate\nSpecialist agents run in parallel:\nnps_expert · topic_expert · trend_forecaster\nprescriptive_advisor\nIF USE_SKILL_RUNTIME: insight-narrator skill]

    NARRATE --> EVALUATE[node_evaluate\nHolistic quality audit:\nCoverage · Balance · Actionability\nDrop redundant insights]

    EVALUATE --> VERIFY[node_verify\nHallucination scoring:\nDeterministic citation check\nOptional LLM judge if score < 0.80]

    VERIFY --> PUBLISH[node_publish\nUpsert insights to DB\nWrite reasoning_trace audit trail\nWarm L3 Redis survey facts cache\nInvalidate stale Crystal cache]

    PUBLISH --> ASYNC([Async: _generate_action_recommendations\n12 specialist advisors in parallel\nOrchestratorassembles final action plan])

    style LOCK fill:#7f1d1d,color:#fef2f2
    style NARRATE fill:#1e3a5f,color:#dbeafe
    style PUBLISH fill:#14532d,color:#dcfce7
    style ASYNC fill:#4a1d96,color:#ede9fe
    style VERIFY fill:#78350f,color:#fef3c7
```

**What each insight looks like** in the DB (and on screen):

```json
{
  "layer": "diagnostic",
  "category": "voice.diagnostic",
  "headline": "Onboarding friction drives 61% of detractors — setup complexity is the #1 pain point",
  "narrative": "43% of detractors mention 'setup complexity' or 'took too long' with sentiment -0.72 — the lowest of any topic. Verbatims show frustration concentrated in the account configuration step.",
  "trust_score": 84,
  "trust_json": {
    "statistical": 88,
    "coverage": 82,
    "consistency": 79,
    "grounding": 100,
    "sample_size": 150
  },
  "citations_json": [
    {"quote": "Took 3 weeks just to set up the basic integrations"},
    {"quote": "The configuration guide was outdated and confusing"}
  ],
  "reasoning_trace": {
    "hallucination_score": 0.94,
    "eval_score": 0.87,
    "model": "google/gemini-2.5-flash",
    "schema_version": 1
  }
}
```

**Trust score thresholds:**
- ≥ 80 → **Reliable** (emerald badge) — statistically strong, grounded, consistent
- 60–79 → **Indicative** (amber badge) — directional, worth acting on
- < 60 → **Low-signal** (gray badge) — flag for more data

---

## 5. Crystal Q&A — Streaming AI Analyst

**Real-life scenario:** Rachel asks "Why did NPS drop 8 points last month?" and watches Crystal think in real time, calling tools to look up the answer before synthesizing.

```mermaid
sequenceDiagram
    actor Rachel
    participant App as CrystalPanel.tsx
    participant Backend as experience.js
    participant COS as Crystal ReAct Loop
    participant DB as Postgres
    participant LLM as OpenRouter

    Rachel->>App: Types question
    App->>Backend: POST /api/experience/survey/crystal/stream<br/>{message, insights, topics, survey_id}
    Backend->>Backend: Load Crystal context:\ninsights, topics, metrics, survey metadata\nBuild citation map (id → headline)
    Backend->>COS: POST /insights/crystal/stream<br/>Forward with org_id, user_id

    Note over Backend: req.on('close', abort)<br/>If Rachel closes tab → COS stops immediately

    COS-->>App: SSE: {"type":"thinking","tool":"get_metric_history"}
    COS->>DB: SELECT nps FROM survey_metric_snapshots<br/>WHERE survey_id=? ORDER BY captured_at DESC
    DB-->>COS: 90-day NPS time series
    COS-->>App: SSE: {"type":"observation","summary":"Found 90-day NPS history: drop from 50→42 on May 1"}

    COS-->>App: SSE: {"type":"thinking","tool":"get_topic_details","message":"Checking Onboarding..."}
    COS->>DB: SELECT verbatims, sentiment<br/>FROM survey_topics WHERE name='Onboarding'
    DB-->>COS: 234 verbatims, sentiment -0.72, trending=down
    COS-->>App: SSE: {"type":"observation","summary":"Onboarding: 234 responses, sentiment worsened -0.3 in 30 days"}

    COS-->>App: SSE: {"type":"synthesizing"}
    COS->>LLM: System prompt + all tool results + question
    LLM-->>COS: answer + citations + suggestions + eval_score=88

    Note over Backend: Inject citation_context event\nbefore [DONE] so frontend renders rich source cards

    Backend-->>App: SSE: {"type":"citation_context","map":{"topic:Onboarding":{"headline":"...","survey_title":"..."}}}
    Backend-->>App: SSE: {"type":"answer","answer":"...","citations":["topic:Onboarding Speed"],"suggestions":[...]}
    Backend-->>App: SSE: data: [DONE]

    App-->>Rachel: Streaming answer with highlighted citations + 3 follow-up chips
```

**The 13 Crystal tools** (all read-only, `crystalos/crystal/registry.py`):

```
Data tools:
  get_survey_overview     → response count, NPS/CSAT scores, top topics
  get_topic_details       → verbatims + sentiment breakdown for one topic
  get_metric_history      → NPS/CSAT/CES time series (90-day default)
  get_insights_list       → AI insights filtered by layer/window
  get_verbatims           → raw verbatims by topic + sentiment
  get_benchmark_comparison → vs Satmetrix industry benchmarks
  get_driver_analysis     → NPS/CSAT drivers ranked by impact (-100 to +100)
  get_segment_breakdown   → responses broken down by question answer
  get_checkpoint_history  → snapshot history, metric changes over time
  compare_surveys         → side-by-side metric + theme comparison
  get_org_portfolio       → all surveys in org with aggregate metrics
  get_cross_survey_themes → themes appearing across multiple surveys
  get_anomaly_events      → flagged metric drops across surveys

Action proposal tools:
  recommend_next_actions  → calls action-recommender skill (12 specialists)
  propose_survey_creation → structured survey creation proposal
  propose_survey_edit     → question addition/modification proposal
  propose_distribution    → targeted distribution campaign proposal
  propose_workflow        → automation workflow proposal
  list_relevant_templates → template library search
```

**Memory system** keeps Crystal efficient across turns:

```
Before Crystal responds — context assembled:
  L4 Org memory   → "This user always wants bullet points" (pgvector)
  L2 Thread state → compressed decisions from earlier in conversation (~200 tokens)
  Raw turns       → last 2 messages verbatim
  L3 Survey facts → NPS=42, top 5 topics, response_count=150 (Redis, warmed at publish)
  Current message → Rachel's question

Token budget: ~2,000 (vs 5,000+ without memory layer) — 60% reduction
```

---

## 6. Crystal Action Tools

**Real-life scenario:** Rachel asks "What are my top 3 action items this week?" Crystal calls `recommend_next_actions`, which triggers all 12 XM specialist advisors in parallel, then proposes confirmed actions as interactive cards.

```mermaid
sequenceDiagram
    actor Rachel
    participant App as CrystalPanel
    participant COS as CrystalOS
    participant REG as Skill Registry
    participant ADV as 12 Advisors (parallel)
    participant ORC as Orchestrator
    participant Backend as Backend API

    Rachel->>App: "What are my top 3 action items?"
    App->>COS: POST /insights/crystal/stream

    Note over COS: LLM classifies intent = ACT
    COS-->>App: SSE: thinking: recommend_next_actions

    COS->>REG: execute("action-recommender", survey_context)
    REG->>ADV: asyncio.gather() — all relevant advisors in parallel

    par Parallel advisor calls
        ADV->>ADV: nps-action-advisor → detractor recovery workflow
        ADV->>ADV: close-the-loop-advisor → CSM alert (CRITICAL)
        ADV->>ADV: survey-improvement-advisor → question coverage gap
        ADV->>ADV: distribution-strategist → in-app re-survey
        ADV->>ADV: benchmark-strategist → above industry median
        ADV->>ADV: journey-advisor → onboarding touchpoint focus
        ADV->>ADV: predictive-action-advisor → pre-churn signals
    end

    ADV-->>ORC: 7 specialist outputs (15-30 actions total)
    ORC->>ORC: De-duplicate overlapping actions\nRe-rank by unified priority\nAssign owner teams\nSelect top 5

    COS-->>App: SSE: action_proposals [{3 action cards}]
    COS-->>App: SSE: answer "I'm proposing 3 actions..."

    Note over App,Rachel: User sees action cards below Crystal answer

    Rachel->>App: Clicks "Create Workflow" on card #1
    App->>Backend: POST /api/workflows<br/>{name, trigger, action_type}
    Backend-->>App: {workflow_id, status: "active"}
    App-->>Rachel: ✓ Workflow created

    Rachel->>App: Clicks "Create Survey" on card #2
    App->>Backend: POST /api/copilot/orchestrate<br/>{intent: "Follow up with NPS 0-6..."}
    Backend-->>App: {run_id} → survey creation flow starts
```

**Safety guarantee:** Crystal **never** executes write operations autonomously. Every action tool returns a **proposal** that requires explicit user confirmation. The `requires_confirmation: true` flag is always set.

```
Action proposal types → what the frontend calls:
  create_followup_survey  → api.startRun({ intent, surveyTypeId })
  edit_survey_questions   → api.copilotRefine(runId, { message })
  distribute_to_segment   → navigate to /surveys/{id}/build?tab=distribute
  create_workflow         → api.createWorkflow({ name, trigger, ... })
  schedule_rerun          → api.triggerInsightGeneration(surveyId)
  view_template           → navigate to /templates
```

---

## 7. Action Recommendations System

**Real-life scenario:** After the pipeline publishes insights, 12 specialist advisors run in parallel without Rachel doing anything. She sees a prioritized action panel on the insights page the next time she opens it.

```mermaid
flowchart LR
    PUBLISH[node_publish\ncompletes] -->|asyncio.create_task| ASYNC

    subgraph ASYNC["Action Recommendations (async, non-blocking)"]
        direction TB
        CTX[Build survey context\nNPS/CSAT/CES metrics\nTop 8 themes\nKey insights]

        CTX --> GATHER["asyncio.gather() — 12 advisors in parallel"]

        subgraph METRIC["Metric Advisors"]
            NPS[nps-action-advisor\nDetector recovery\nPassive conversion\nPromoter amplification]
            CES[ces-action-advisor\nFriction elimination\nProcess redesign\nChannel optimization]
            CSAT[csat-action-advisor\nTop-box optimization\nDissatisfier elimination]
            ENPS[enps-action-advisor\nManager coaching\nRetention programs\nCulture audit]
        end

        subgraph ACTION["Action Execution Advisors"]
            CTL[close-the-loop-advisor\nWho to contact\nWhat to say\nWhen to escalate]
            PRED[predictive-action-advisor\nPre-churn signals\nLeading indicators\nProactive intervention]
        end

        subgraph PROGRAM["Program Design Advisors"]
            SI[survey-improvement-advisor\nCoverage gaps\nSkip logic opportunities\nQuestion quality]
            DS[distribution-strategist\nChannel selection\nSegment targeting\nTiming optimization]
        end

        subgraph STRATEGIC["Strategic Advisors"]
            BENCH[benchmark-strategist\nCompetitive positioning\nInvestment priority]
            VOC[voc-program-advisor\nListening post coverage\nProgram maturity]
            SEG[segment-action-advisor\nEnterprise vs SMB\nNew vs tenured]
            JRN[journey-advisor\nTouchpoint interventions\nMoment-of-truth focus]
        end

        GATHER --> METRIC
        GATHER --> ACTION
        GATHER --> PROGRAM
        GATHER --> STRATEGIC

        METRIC --> ORC
        ACTION --> ORC
        PROGRAM --> ORC
        STRATEGIC --> ORC

        ORC[action-recommender v2\nOrchestrator\nDe-duplicate\nRe-rank unified priority\nAssign owners\nTop 5 actions]
    end

    ORC -->|INSERT ... ON CONFLICT DO UPDATE| DB[(action_recommendations\ntable)]
    DB -->|GET /api/insights/{id}/actions| UI[Insights Page\nAction Panel]

    style ASYNC fill:#1e1b4b,color:#e0e7ff
    style ORC fill:#7f1d1d,color:#fef2f2
    style DB fill:#14532d,color:#dcfce7
```

**Priority color coding in the UI:**
- 🔴 **Critical** — act within 24h (explicit churn signals, NPS < 0)
- 🟡 **High** — act this week (declining metric, missing close-the-loop)
- 🔵 **Medium** — act this month (survey quality gaps, distribution improvements)
- ⚪ **Low** — strategic (program maturity, benchmark positioning)

---

## 8. Copilot Chat Editing

**Real-life scenario:** Rachel types "Make the NPS question shorter" or "Add skip logic — only show the support question if they contacted support."

```mermaid
sequenceDiagram
    actor Rachel
    participant App
    participant Backend
    participant COS as CrystalOS

    Rachel->>App: Types edit in chat: "Add skip logic — only show Q5 if Q4='I contacted support'"
    App->>Backend: POST /api/copilot/runs/{runId}/refine<br/>{message, questions, orgContext}
    Backend->>COS: POST /orchestrate/{runId}/refine<br/>{message, questions, org_id}

    COS->>COS: Load current questions from run
    COS->>COS: copilot_agent detects mode:\n'edit' | 'answer' | 'recommendations'
    Note over COS: Mode = 'edit' — apply changes

    COS->>COS: LLM applies change to questions array\nReturns: questions[] + explanation + changes[]
    COS->>COS: recommender_agent generates fresh suggestions
    COS-->>Backend: {questions, explanation, changes, recommendations}
    Backend-->>App: Updated state

    App-->>Rachel: Questions updated\nChange diff highlighted\n"Added skip logic: Q5 visible only if Q4 answer includes 'support'"
    App-->>Rachel: 3 fresh recommendation cards
```

**What the copilot can do in a single message:**
- Rephrase any question (preserves type and intent)
- Add questions (positioned correctly, right type chosen)
- Remove questions (cleans up skip logic references)
- Reorder (full array reordered)
- Add/modify skip logic (plain English → structured condition)
- Change question type (open text → scale → multiple choice)
- Add answer options

---

## 9. Templates & Workflows

```mermaid
flowchart LR
    subgraph Templates["Template Library"]
        direction TB
        A[Admin creates template\nPOST /api/templates\nTitle + questions + metadata] --> B[(templates table)]
        B --> C[User browses\nGET /api/templates]
        C --> D[Clone → new survey\nPOST /api/templates/{id}/clone\nCreates draft copy]
    end

    subgraph Workflows["Workflow Automation"]
        direction TB
        E[User creates rule\nPOST /api/workflows\nTrigger + condition + action] --> F[(workflows table)]
        F --> G{Trigger type}
        G -->|response_count| H[Stream consumer\nCrystalOS watches Redis\nTier thresholds: 10/40/100/250]
        G -->|score_threshold| I[Backend check\nOn each response insert:\nif NPS < 5 → fire workflow]
        G -->|schedule| J[Scheduler\nCron job in crystalos/scheduler.py\nMonday 8am insight regeneration]
        H --> K[Action: POST /insights/generate]
        I --> L[Action: Slack / Email alert\nor trigger CrystalOS endpoint]
        J --> K
    end

    style Templates fill:#164e63,color:#e0f2fe
    style Workflows fill:#4a1d96,color:#ede9fe
```

**Three workflow trigger types:**

| Trigger | How it works | Common use |
|---------|-------------|------------|
| Response count | CrystalOS Redis stream consumer watches `response:created` events | Auto-generate insights at 10/40/100 responses |
| Score threshold | Backend checks on every response insert | Alert CSM when NPS < 5 |
| Schedule | `scheduler.py` cron job runs in CrystalOS | Weekly insight refresh every Monday |

---

## 10. CrystalOS Skill Framework

**The architecture that lets you add a new AI capability in one file.**

```mermaid
flowchart TB
    subgraph SkillFramework["CrystalOS Skill Framework"]
        direction TB

        ORCHS[Orchestrators\ngraphs/insights.py\nagents/crystal.py] -->|skill_registry.execute| REG

        subgraph REG["Skill Registry"]
            SCAN[Scan skills/ recursively\nParse SKILL.md frontmatter\nIndex by description]
            FIND[find query → best match\ntoken-overlap difflib]
            EXEC[execute name, input, ctx]
            RELOAD[Hot reload\nevery 30s in dev\nevery 5min in prod]
        end

        REG --> RT

        subgraph RT["Skill Runtime"]
            LOAD[Load SKILL.md body\n+ references/ files]
            EXAMPLES[Fetch top-3 examples\nfrom skill_examples DB\n few-shot injection]
            LLM_CALL[call_agent\nmodel from models.py\ntimeout_seconds enforced]
            EVALS[Check EVALS.md criteria\nstruct + quality scoring]
            RETRY{eval_score < threshold?}
            WRITE[Write passing example\nto skill_examples async]
        end

        LOAD --> EXAMPLES --> LLM_CALL --> EVALS --> RETRY
        RETRY -->|yes, max 1 retry| LLM_CALL
        RETRY -->|no| WRITE

        subgraph SKILLS["26 CrystalOS Skills"]
            NARR[insight-narrator]
            QC[survey-qc]
            NPS_S[specialist-nps]
            CES_S[specialist-ces]
            CRYST[crystal-analyst]
            COPIL[copilot-analyst]
            AR[action-recommender v2\nOrchestrator]
            ADV2[nps-action-advisor\nces-action-advisor\nenps-action-advisor\ncsat-action-advisor\nclose-the-loop-advisor\npredictive-action-advisor\nsurvey-improvement-advisor\ndistribution-strategist\nbenchmark-strategist\nvoc-program-advisor\nsegment-action-advisor\njourney-advisor]
        end

        REG -.->|discovers| SKILLS
    end

    NEWSKILL["Adding a new skill:\n1. Create skills/my-skill/SKILL.md\n2. Write EVALS.md\n3. Add to plugin.json\n4. Done — no Python required"] -.->|hot-reload picks it up| REG

    style SkillFramework fill:#1e1b4b,color:#e0e7ff
    style NEWSKILL fill:#14532d,color:#dcfce7
```

**SKILL.md structure** — the complete definition of one AI capability:

```
agents/skills/insight-narrator/
  SKILL.md           ← frontmatter (name, version, timeout, tools) + prompt body
  EVALS.md           ← quality criteria table (ID | Criterion | Weight | Threshold)
  EXAMPLES.md        ← human-readable view of DB examples (auto-generated)
  references/
    xm-best-practices.md  ← injected into system prompt automatically
```

**How a skill executes:**

```
1. Registry.execute("insight-narrator", input_data, ctx)
   ↓
2. Runtime: load SKILL.md body + references/ + top-3 few-shot examples from DB
   ↓
3. call_agent(system=assembled_prompt, user=json.dumps(input_data))
   ↓
4. Parse output as JSON
   ↓
5. Check EVALS.md: E1 (valid JSON) must pass · E3 (3-5 findings) >= 0.80 · ...
   ↓
6. eval_score >= 0.75? → write to skill_examples table (async)
   eval_score < 0.75? → retry once with failure context injected
   ↓
7. Return SkillResult {output, eval_score, eval_passed, retried, latency_ms}
```

---

## 11. Memory & Context Management

**Why this matters:** Without memory management, Crystal sends 5,000+ tokens of raw conversation history on every turn. With the 4-layer system, it sends ~1,200 tokens — 62% reduction with equal or better quality.

```mermaid
flowchart TB
    subgraph Memory["CrystalOS 4-Layer Memory System"]
        direction TB

        L0["L0 — Tool Memoization\nin-memory dict per session\nSame tool + params → return cached\nno Redis, no DB, ~0ms"]

        L1["L1 — Semantic Cache\nRedis · key: semantic_cache:{org}:{survey}:{hash16}\nCaches Crystal answers to factual questions\n24-hour TTL · invalidated at publish"]

        L2["L2 — Thread Compression\nPostgres crystal_threads.context_state\n10 raw turns (~5k tokens) → structured JSON (~200 tokens)\nDecision supersession: later decision marks earlier as superseded\nTriggers: turn 5, then every 3 turns"]

        L3["L3 — Survey Facts\nRedis · key: survey_facts:{survey_id}\nPre-computed: NPS score, top 5 topics, response count\nWarmed at node_publish · cold-start warm from Crystal tool results"]

        L4["L4 — Org Memory\nPostgres crystal_org_memory · pgvector\nUser-scoped: 'this user wants bullet points'\nOrg-scoped: 'Q2 focus was onboarding'\nPersists across sessions · written by 5-min background sweep"]
    end

    subgraph Injection["Context injection order — G23 fix"]
        direction LR
        ORG_MEM[Org memory\nlow attention]
        CTX_ST[Context state\ncompressed]
        RAW[Last 2 raw turns]
        FACTS[Survey facts\nhigh attention\nCLOSEST to user msg]
        USER_MSG[User message]

        ORG_MEM --> CTX_ST --> RAW --> FACTS --> USER_MSG
    end

    L4 -.->|pgvector ANN search| Injection
    L2 -.->|context_state JSON| Injection
    L3 -.->|Redis GET| Injection

    subgraph Budget["Context budget per Crystal call"]
        B1[System prompt · 300 tokens]
        B2[Org memory · 200 tokens]
        B3[Context state · 200 tokens]
        B4[Last 2 raw turns · 400 tokens]
        B5[Survey facts · 400 tokens]
        B6[Tool results · 800-2400 tokens]
        B7[User message · 100 tokens]
    end

    style Memory fill:#1e1b4b,color:#e0e7ff
    style Injection fill:#14532d,color:#dcfce7
    style Budget fill:#78350f,color:#fef3c7
```

---

## 12. Data Model Overview

**The key tables and how they connect:**

```mermaid
erDiagram
    ORGS {
        uuid id PK
        string name
        string plan
        jsonb brand_config
    }

    SURVEYS {
        uuid id PK
        uuid org_id FK
        string title
        string status
        jsonb questions
        string publish_token
        timestamptz published_at
        timestamptz deleted_at
    }

    RESPONSES {
        uuid id PK
        uuid survey_id FK
        uuid org_id FK
        jsonb answers
        float nps_score
        float csat_score
        string ai_sentiment
        timestamptz submitted_at
    }

    AGENT_RUNS {
        uuid id PK
        uuid survey_id FK
        uuid org_id FK
        string status
        string run_type
        string trigger
        timestamptz heartbeat_at
        jsonb stream_events
    }

    INSIGHTS {
        uuid id PK
        uuid survey_id FK
        uuid org_id FK
        string layer
        string category
        string headline
        text narrative
        float trust_score
        jsonb trust_json
        jsonb citations_json
        jsonb reasoning_trace
        timestamptz superseded_at
    }

    SURVEY_TOPICS {
        uuid id PK
        uuid survey_id FK
        uuid org_id FK
        string name
        float sentiment_score
        int volume
        float urgency_score
        string trending
    }

    CRYSTAL_THREADS {
        uuid id PK
        uuid org_id FK
        uuid survey_id FK
        jsonb messages
        jsonb context_state
        int turn_count
        timestamptz last_active_at
    }

    SKILL_EXAMPLES {
        uuid id PK
        string skill_name
        float eval_score
        jsonb input_json
        jsonb output_json
        vector input_embedding
        string embedding_model
    }

    CRYSTAL_ORG_MEMORY {
        uuid id PK
        uuid org_id FK
        uuid user_id
        string scope
        string memory_type
        text fact
        vector embedding
        float confidence
    }

    ACTION_RECOMMENDATIONS {
        uuid id PK
        uuid survey_id FK
        uuid org_id FK
        jsonb actions_json
        string urgency_level
        text summary
        timestamptz generated_at
    }

    ORGS ||--o{ SURVEYS : "owns"
    SURVEYS ||--o{ RESPONSES : "collects"
    SURVEYS ||--o{ INSIGHTS : "generates"
    SURVEYS ||--o{ SURVEY_TOPICS : "has"
    SURVEYS ||--o{ AGENT_RUNS : "tracked by"
    SURVEYS ||--o{ ACTION_RECOMMENDATIONS : "has"
    ORGS ||--o{ CRYSTAL_THREADS : "has"
    ORGS ||--o{ CRYSTAL_ORG_MEMORY : "has"
```

---

## Complete User Journey — Rachel's Day

Here's how all 8 flows connect in a single use case:

```mermaid
journey
    title Rachel's CX Analytics Day
    section Morning
      Opens Experient: 5: Rachel
      Sees "150 new responses": 5: App
      Clicks Generate Insights: 4: Rachel
      Pipeline runs 12 nodes: 3: CrystalOS
      8 insight cards appear: 5: Rachel
    section Mid-Morning
      Opens Crystal panel: 5: Rachel
      Asks "Why did NPS drop?": 5: Rachel
      Crystal calls 2 tools: 3: CrystalOS
      Gets streaming answer: 5: Rachel
      Asks "What should I do?": 5: Rachel
      12 advisors run in parallel: 3: CrystalOS
      3 action cards appear: 5: Rachel
    section Late Morning
      Creates CSM alert workflow: 5: Rachel
      Creates detractor survey: 4: Rachel
      Edits a question via chat: 4: Rachel
    section Afternoon
      New survey goes live: 5: Rachel
      First 10 responses arrive: 3: Customers
      Auto-insights triggered: 3: CrystalOS
      Rachel gets Slack alert: 5: Rachel
```

---

## Quick Reference — What Calls What

| User action | Frontend call | Backend route | CrystalOS endpoint | Key module |
|---|---|---|---|---|
| Create survey | `api.startRun()` | `POST /copilot/orchestrate` | `POST /orchestrate` | `creator_agent` |
| Edit via chat | `api.copilotRefine()` | `POST /copilot/runs/:id/refine` | `POST /orchestrate/:id/refine` | `copilot_agent` |
| Apply recommendation | `api.applyRecommendation()` | `POST /copilot/runs/:id/apply-recommendation/:actionId` | `POST /orchestrate/:id/apply-recommendation/:id` | `skip_logic_agent` etc. |
| Publish survey | `api.publishSurvey()` | `POST /surveys/:id/publish` | *(none)* | `surveys.js` |
| Submit response | *(public, no auth)* | `POST /surveys/:id/responses` | *(Redis stream → tier trigger)* | `responses.js` |
| Generate insights | `api.triggerInsightGeneration()` | `POST /insights/:id/generate` | `POST /insights/generate` | `graphs/insights.py` |
| Ask Crystal (REST) | `api.crystalChat2()` | `POST /experience/crystal` | `POST /insights/crystal` | `agents/crystal.py` |
| Ask Crystal (SSE) | *(fetch + ReadableStream)* | `POST /experience/:scope/crystal/stream` | `POST /insights/crystal/stream` | `agents/crystal.py` |
| Get action recs | `api.getActionRecommendations()` | `GET /insights/:id/actions` | *(async post-publish)* | `_generate_action_recommendations()` |
| Dismiss action | `api.dismissAction()` | `POST /insights/:id/actions/:actionId/dismiss` | *(none)* | `insights.js` |
| List templates | `api.listTemplates()` | `GET /templates` | *(none)* | `templates.js` |
| Create workflow | `api.createWorkflow()` | `POST /workflows` | *(none)* | `workflows.js` |

---

## Environment — Running Locally

```bash
# 1. Data layer
docker-compose up -d postgres redis

# 2. CrystalOS (AI service)
cd crystalos
cp env.example .env          # fill in OPENROUTER_API_KEY, DATABASE_URL, REDIS_URL
make run-dev                 # starts on :8001 with hot reload

# 3. Backend
cd backend
cp .env.example .env
npm start                    # starts on :3001

# 4. Frontend
cd app
npm run dev                  # starts on :5173

# 5. CrystalOS tests
cd crystalos
.venv/bin/pytest tests/ -q   # 612 tests, ~33 seconds
```

**Key environment variables:**

| Variable | Where | Purpose |
|---|---|---|
| `OPENROUTER_API_KEY` | `crystalos/.env` | LLM API access (required) |
| `DATABASE_URL` | both | Postgres connection |
| `REDIS_URL` | both | Redis (optional in dev, falls back gracefully) |
| `AGENTS_INTERNAL_KEY` | both | Backend ↔ CrystalOS auth (must match) |
| `AGENTS_ENV` | `crystalos/.env` | `dev` / `dev-paid` / `staging` / `prod` |
| `USE_SKILL_RUNTIME` | `crystalos/.env` | Enable CrystalOS skill framework (default: false) |
| `VITE_CRYSTAL_STREAMING` | `app/.env` | Enable SSE streaming for Crystal (default: false) |
| `SKIP_AUTH` | `backend/.env` | Bypass Clerk auth in local dev |

---

*Generated 2026-06-03 · CrystalOS v2.0 · 612 tests passing*
