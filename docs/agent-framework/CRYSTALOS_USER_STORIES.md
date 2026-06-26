# CrystalOS — User Stories, Capability Catalog & Developer Velocity

**Based on:** `ENTERPRISE_CRYSTALOS_REDESIGN.md`  
**Covers:** Every persona, every user story, every function, and an honest answer on build speed.

---

## Section 1 — Persona Map

Six distinct personas interact with CrystalOS. Understanding who does what is the foundation for every story below.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                          WHO USES CRYSTALOS                                  │
│                                                                              │
│  ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────────────┐   │
│  │   END USER      │   │  BRAND ADMIN    │   │   BRAND DEVELOPER       │   │
│  │                 │   │                 │   │                         │   │
│  │ Survey analyst  │   │ Marriott IT or  │   │ Marriott eng team       │   │
│  │ CX researcher   │   │ product team    │   │ building domain skills  │   │
│  │ People manager  │   │ managing their  │   │ for their Crystal       │   │
│  │ C-suite exec    │   │ Crystal tenant  │   │ integration             │   │
│  └────────┬────────┘   └────────┬────────┘   └───────────┬─────────────┘   │
│           │                     │                        │                  │
│           │ uses Crystal        │ manages signals        │ contributes      │
│           │ to get answers      │ and config             │ SKILL.md files   │
│           ▼                     ▼                        ▼                  │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                       CrystalOS Platform                            │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│           ▲                     ▲                        ▲                  │
│           │ monitors quality    │ ships features         │ monitors ops     │
│           │ and demand          │ faster                 │ and health       │
│  ┌────────┴────────┐   ┌────────┴────────┐   ┌──────────┴─────────────┐   │
│  │  EXPERIENT PM   │   │  EXPERIENT ENG  │   │  EXPERIENT OPS          │   │
│  │                 │   │                 │   │                         │   │
│  │ Product manager │   │ Platform eng    │   │ On-call engineer        │   │
│  │ tracking demand │   │ building new    │   │ maintaining reliability │   │
│  │ and quality     │   │ features fast   │   │ and debugging           │   │
│  └─────────────────┘   └─────────────────┘   └─────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Section 2 — End User Stories

### 2.1 Conversational Intelligence

These are the core reasons a user opens Crystal.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  US-01  Ask anything about a survey in plain language                       │
│                                                                             │
│  "What's driving my NPS score down this quarter?"                           │
│                                                                             │
│  Crystal calls: analyze_key_drivers → analyze_trends_over_time              │
│  Returns: grounded answer with specific driver names and percentages        │
│  Result: no data analyst required for standard insight queries              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  US-02  Multi-turn conversation with memory                                 │
│                                                                             │
│  Turn 1: "What are the top themes in the negative responses?"               │
│  Turn 2: "For the second theme — which segment is most affected?"           │
│  Turn 3: "What would I do to fix it?"                                       │
│                                                                             │
│  Crystal maintains thread context across turns (7-day TTL, per-brand)      │
│  Each follow-up builds on what was already discussed                        │
│  Result: feels like talking to a colleague who remembers the conversation   │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  US-03  Segment-level breakdown                                             │
│                                                                             │
│  "How does satisfaction differ between enterprise and SMB customers?"       │
│                                                                             │
│  Crystal calls: analyze_segments with segment=customer_type                 │
│  Returns: side-by-side breakdown, statistical significance noted            │
│  Result: no pivot tables, no filtering, no manual comparison               │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  US-04  Trend detection with confidence                                     │
│                                                                             │
│  "Is our NPS improving or is this a one-off spike?"                         │
│                                                                             │
│  Crystal calls: analyze_trends_over_time, computes confidence level         │
│  Returns: HIGH/MEDIUM/LOW confidence on trend direction with reasoning      │
│  Result: Crystal says "improving" with evidence, not just a number          │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  US-05  Open-text theme extraction                                          │
│                                                                             │
│  "What are people saying about our onboarding experience?"                  │
│                                                                             │
│  Crystal calls: summarize_themes with topic_filter=onboarding               │
│  Returns: top themes, representative quotes, sentiment per theme            │
│  Result: qualitative analysis that used to take hours in 30 seconds        │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  US-06  Cross-survey exploration                                            │
│                                                                             │
│  "Which of my surveys has the worst employee experience trend right now?"   │
│                                                                             │
│  Crystal calls: get_survey_insights across scope=org                        │
│  Returns: ranked list with scores, one-line summary each                   │
│  Result: portfolio-level awareness without opening every dashboard          │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  US-07  Benchmark comparison                                                │
│                                                                             │
│  "How does our CSAT compare to industry peers in SaaS?"                     │
│                                                                             │
│  Crystal calls: get_benchmark with industry=saas, metric=csat               │
│  Returns: our score vs. p25/p50/p75 benchmarks with percentile position    │
│  Result: immediately know if you're above or below market                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Action and Navigation

Crystal doesn't just analyze — it tells you what to do and takes you there.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  US-08  Clickable navigation recommendations                                │
│                                                                             │
│  Crystal: "Your NPS drops sharply after the onboarding survey.              │
│  [→ View Onboarding Survey Insights]  [→ Set Up Score Alert]"              │
│                                                                             │
│  These are rendered as buttons by the frontend, not text.                  │
│  Crystal emits: {"type":"navigation","route":"/app/surveys/abc/responses"} │
│  User clicks → navigates directly. No copy-pasting paths.                  │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  US-09  Workflow setup guidance                                             │
│                                                                             │
│  "Tell me when NPS drops below 30"                                          │
│                                                                             │
│  Crystal (for admin/editor role): "I can set that up — here's a workflow   │
│  that will alert you via email when NPS drops below 30."                   │
│  [→ Open Workflows]   or   [Configure now] (if workflow:write permitted)   │
│                                                                             │
│  Crystal only offers this to users with workflow:write in effective_perms  │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  US-10  Actionable recommendations with context                             │
│                                                                             │
│  Crystal: "The main driver of low scores is response time. Companies that  │
│  improved this saw +12 NPS on average. You could address this by:          │
│  1. Reviewing your SLA commitments (→ Survey settings)                     │
│  2. Adding a follow-up question to track resolution time"                  │
│                                                                             │
│  Actions are tied to actual app pages — not generic advice                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Brand Experience

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  US-11  Branded Crystal identity                                            │
│                                                                             │
│  Marriott user opens Crystal:                                               │
│  "Hello, I'm Marriott Insights, your AI intelligence layer for Marriott    │
│  Hotels. I can analyze your CSAT scores, guest experience themes, and      │
│  RevPAR correlation data. What would you like to explore?"                 │
│                                                                             │
│  Not: "Hello, I'm Crystal..."                                               │
│  Set via: brand.brand_persona = "Marriott Insights"                        │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  US-12  Permission-appropriate experience (no errors, no confusion)         │
│                                                                             │
│  Viewer-role user asks: "Can you set up an alert for me?"                  │
│                                                                             │
│  Crystal (viewer): "Alerts require editor access. You can ask your admin   │
│  to set one up, or [→ Request access] via settings."                       │
│                                                                             │
│  Crystal never attempts configure_alerts for a viewer — the tool isn't     │
│  even in the system prompt. No error. Smooth handling.                     │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  US-13  Transparent errors (Crystal is honest when it can't help)          │
│                                                                             │
│  Crystal: "I was able to get the theme breakdown and NPS scores. However,  │
│  the trend data tool timed out — I'll show what I have. For trends,        │
│  try again in a moment or [→ View the trends chart directly]."             │
│                                                                             │
│  Old behavior: Crystal generated a hallucinated answer with no grounding   │
│  New behavior: structured error context injected, Crystal is honest        │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.4 Feedback

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  US-14  One-click feedback on any Crystal response                          │
│                                                                             │
│  Every Crystal message renders: 👍  👎                                      │
│  Thumbs down opens: "What went wrong?"                                     │
│    ○ Wrong data                                                             │
│    ○ Not actionable                                                         │
│    ○ Off topic                                                              │
│    ○ Other                                                                  │
│                                                                             │
│  This data flows into crystal_feedback → nightly quality aggregation       │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  US-15  Bug reporting from natural conversation                             │
│                                                                             │
│  User: "The NPS score it's showing is wrong — it says 42 but it should     │
│  be around 67 based on the last report I pulled."                          │
│                                                                             │
│  Crystal: [answers the question]                                            │
│  And silently: FeedbackDetector classifies as "bug", severity=high,        │
│  affects_feature=nps_score_calculation                                     │
│  Shows: "I've noted this — it's been logged for our team to review."       │
│  If Marriott has support_ticket_url: also shows [→ Open Marriott ticket]   │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  US-16  Feature requesting from conversation                                │
│                                                                             │
│  User: "I wish I could filter this by region — it would make my life       │
│  so much easier"                                                            │
│                                                                             │
│  Crystal: [answers the question]                                            │
│  Shows: "I've noted that request. If 5 other users ask for the same thing, │
│  it moves to the top of our roadmap."                                       │
│  If already logged by others: "This is a popular request — already voted   │
│  on by 8 other teams."                                                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Section 3 — Brand Admin Stories

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  US-17  View all user signals from your org                                 │
│                                                                             │
│  GET /api/brands/{brand_id}/signals                                         │
│                                                                             │
│  Returns: paginated list of bugs, feature requests, complaints, praise      │
│  Filtered to: only this brand's signals (no cross-brand visibility)        │
│  Sorted by: vote_count DESC, severity DESC                                  │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  US-18  Signal deduplication across your users                              │
│                                                                             │
│  If 12 different Marriott users all say "I wish I could export to Excel",   │
│  this creates ONE signal with vote_count=12 (not 12 separate tickets)      │
│                                                                             │
│  semantic_hash: SHA256 of (title + affects_feature)                        │
│  Duplicate: vote_count++ on existing row                                   │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  US-19  Configure Crystal for your brand                                    │
│                                                                             │
│  Brand admin sets in Experient admin panel:                                 │
│  - Crystal persona name: "Marriott Insights"                                │
│  - Custom instructions: "Always reference RevPAR when discussing revenue"  │
│  - Support ticket URL: "https://jira.marriott.com/crystal-bugs"            │
│  - Feature request URL: "https://feedback.marriott.com"                    │
│  - Data region: eu  (ensures no EU data leaves EU infra)                   │
│  - Thread TTL: 30 days  (their analysts need longer memory)                │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  US-20  Monitor Crystal quality for your brand                              │
│                                                                             │
│  GET /api/brands/{brand_id}/crystal/quality                                 │
│                                                                             │
│  Returns:                                                                   │
│  - thumbs_up_rate: 87%                                                     │
│  - avg_eval_score: 0.81                                                    │
│  - top_tools_used: [analyze_key_drivers, summarize_themes, ...]            │
│  - low_quality_skills: []  (or list of skills needing attention)           │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  US-21  Manage signal lifecycle                                              │
│                                                                             │
│  POST /api/brands/{brand_id}/signals/{id}/status                            │
│  body: {"status": "in_progress", "note": "Working on this in Q3 sprint"}   │
│                                                                             │
│  Brand admin can mark signals: open → in_progress → resolved               │
│  Resolved signals stop collecting new votes                                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Section 4 — Brand Developer Stories

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  US-22  Build a brand-specific skill with zero code                         │
│                                                                             │
│  1. Create: /crystalos/skills/brands/marriott/hcahps/SKILL.md              │
│  2. Write the SKILL.md with model, prompt, use_cases, evals                │
│  3. That's it. Crystal picks it up within 30s in dev, 5min in prod.        │
│                                                                             │
│  No API changes. No routing tables. No prompt edits. No PR review for      │
│  adding a new skill — SKILL.md is the contract.                            │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  US-23  Write quality gates in natural language                             │
│                                                                             │
│  In EVALS.md:                                                               │
│  | must_pass | Response must reference specific HCAHPS domain names | 1.0 | │
│  | scored    | Recommendations should cite response count           | 0.8 | │
│  | scored    | Output should be in valid JSON                       | 1.0 | │
│                                                                             │
│  Structural criteria (JSON, word count) → deterministic code check         │
│  Semantic criteria (HCAHPS domain names) → LLM judge (Haiku, ~$0.001)     │
│                                                                             │
│  Before: "actionable" criterion returned 0.8 if output > 50 chars          │
│  After: LLM judge actually checks if it's actionable                       │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  US-24  Override global skills for your brand                               │
│                                                                             │
│  Marriott writes: /brands/marriott/nps-advisor/SKILL.md                    │
│  This overrides the global nps-advisor for all Marriott users.             │
│  Global nps-advisor remains unchanged for all other brands.                │
│                                                                             │
│  Brand skills take precedence over global skills with the same name.       │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  US-25  Skills improve automatically from good runs                         │
│                                                                             │
│  When a skill run passes EVALS.md with score >= 0.75:                      │
│  → input + output written to skill_examples table                          │
│  → diversity check: max 20% from any single org                            │
│  → dedup check: embedding similarity < 0.15 distance                       │
│                                                                             │
│  Next time the skill runs, it gets few-shot examples from the bank.        │
│  Brand developer doesn't have to do anything — skill self-improves.        │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Section 5 — Experient Engineer Stories

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  US-26  New feature is Crystal-aware on deploy                              │
│                                                                             │
│  Engineer adds Workflows feature:                                           │
│  1. In frontend: call registerCrystalCapability("workflows", {...})         │
│  2. CrystalOS picks up the capability on next context refresh               │
│  3. Crystal can now guide users to workflows, explain the feature,          │
│     and recommend it when relevant                                          │
│                                                                             │
│  No: manual prompt updates, no YAML changes, no routing additions          │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  US-27  New skill ships with quality guarantee                              │
│                                                                             │
│  Engineer writes SKILL.md + EVALS.md                                       │
│  CI runs: .venv/bin/pytest tests/test_skill_runtime.py                     │
│  Skill must pass EVALS.md criteria before merge                            │
│  In production: USE_SKILL_RUNTIME=True enforces gates on every execution   │
│                                                                             │
│  A skill that degrades in quality will start failing evals → auto-alert    │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  US-28  Semantic routing tested before shipping                             │
│                                                                             │
│  Engineer: "Does my new skill get found for these queries?"                │
│  Test:                                                                      │
│    registry = SkillRegistry(); await registry.warm_router()                 │
│    results = await registry.find("what's causing score drops", top_k=3)    │
│    assert results[0][0].name == "analyze_key_drivers"                       │
│                                                                             │
│  Find() returns (SkillManifest, similarity_score) — testable.              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  US-29  Full turn-level debugging data                                      │
│                                                                             │
│  Engineer investigating a quality regression:                               │
│  SELECT * FROM crystal_turn_events                                          │
│  WHERE org_id = 'acme-corp'                                                 │
│    AND quality_signal = 'negative'                                          │
│    AND created_at > NOW() - INTERVAL '7 days'                               │
│  ORDER BY created_at DESC;                                                  │
│                                                                             │
│  Result: exact queries, tools called, latencies, eval scores, errors       │
│  Root cause findable in minutes, not hours                                  │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  US-30  Skill hot-reload in development                                     │
│                                                                             │
│  Engineer edits SKILL.md → within 30s, Crystal uses the new version        │
│  No restart. No cache flush. mtime watcher picks it up.                    │
│                                                                             │
│  In prod: 300s reload window. Skills deploy ahead of app deploys.          │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Section 6 — Experient PM Stories

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  US-31  Real feature demand from conversations                              │
│                                                                             │
│  SELECT title, affects_feature,                                             │
│         SUM(vote_count) as total_votes,                                     │
│         COUNT(DISTINCT org_id) as requesting_orgs                           │
│  FROM crystal_product_signals                                               │
│  WHERE signal_type='feature_request' AND routing='platform'                │
│    AND created_at > NOW() - INTERVAL '30 days'                             │
│  GROUP BY title, affects_feature                                            │
│  ORDER BY total_votes DESC;                                                 │
│                                                                             │
│  This is the Q4 roadmap input — sourced directly from conversations        │
│  No separate feedback survey. No NPS-about-NPS.                            │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  US-32  Quality regression caught before customer escalation               │
│                                                                             │
│  Nightly job flags: skill "nps-action-advisor" has avg_eval_score=0.54     │
│  Alert fires: skill_quality_alert logged, on-call notified                 │
│  PM checks: this skill regressed 3 weeks ago after a model change          │
│                                                                             │
│  Old path: customer files support ticket → PM reads in weekly digest       │
│  New path: auto-alert fires night of regression                            │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  US-33  Gap tracking (what Crystal can't answer)                            │
│                                                                             │
│  When Crystal exhausts tools and still can't answer → gap logged           │
│  PM dashboard: queries Crystal fails on, ranked by frequency               │
│                                                                             │
│  "Customers asked 'what's the ROI of improving CSAT by 10 points'          │
│  94 times last month and Crystal couldn't answer any of them."             │
│  → this becomes a new skill on the roadmap                                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Section 7 — Experient Operations Stories

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  US-34  DLQ monitoring and replay                                           │
│                                                                             │
│  GET /api/admin/crystal/dlq                                                 │
│  Returns: failed progressive tier events with survey_id, tier, failed_at   │
│                                                                             │
│  POST /api/admin/crystal/dlq/replay                                         │
│  Replays events — backend was down, now it's back, insights get triggered  │
│                                                                             │
│  Old path: event silently dropped, no insights for that survey tier        │
│  New path: event in DLQ, replayable when issue resolves                    │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  US-35  Budget errors don't trip the circuit                                │
│                                                                             │
│  Old: org runs 3 expensive analyses → BudgetExceededError × 3              │
│       → circuit opens → ALL calls for that org blocked                      │
│                                                                             │
│  New: BudgetExceededError excluded from circuit counter                    │
│       → circuit stays closed → cheap follow-up questions still work        │
│       → user gets "you've reached your analysis limit" message, not error  │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  US-36  Brand-safe Redis inspection                                         │
│                                                                             │
│  Ops needs to clear Marriott's semantic cache after a data incident:        │
│  redis-cli KEYS "brand:marriott-001:semantic_cache:*"                       │
│  → only Marriott keys returned, zero risk of touching Hilton data           │
│                                                                             │
│  Before: all semantic_cache keys shared namespace, dangerous to flush       │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Section 8 — Full Function Catalog

### 8.1 Crystal Agent Functions (What Crystal Can Do)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      CRYSTAL TOOL CATALOG                                   │
│                                                                             │
│  ANALYSIS TOOLS (no permission required)                                    │
│  ─────────────────────────────────────────────────────────────────          │
│  get_survey_insights       → fetch processed insights for a survey          │
│  analyze_trends_over_time  → compare scores across time periods             │
│  analyze_segments          → break down by segment (role, region, type)    │
│  analyze_key_drivers       → what's driving the score up or down           │
│  summarize_themes          → open-text theme extraction                     │
│  get_nps_breakdown         → promoters / passives / detractors              │
│  get_csat_breakdown        → satisfaction score distribution                │
│  search_responses          → full-text search across response corpus        │
│  get_benchmark             → compare vs industry benchmarks                 │
│                                                                             │
│  PERMISSION-GATED TOOLS                                                     │
│  ─────────────────────────────────────────────────────────────────          │
│  export_responses          → requires: data:export                          │
│  view_respondent_pii       → requires: data:pii                             │
│  configure_alerts          → requires: workflow:write                       │
│  manage_survey             → requires: survey:write                         │
│                                                                             │
│  UPCOMING (via Crystal Protocol)                                            │
│  ─────────────────────────────────────────────────────────────────          │
│  search_docs               → RAG search over support documentation (14th)  │
│  Any new feature that calls registerCrystalCapability()                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Skill Runtime Functions

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SKILL RUNTIME FUNCTION CHAIN                             │
│                                                                             │
│  Query arrives                                                              │
│       │                                                                     │
│       ▼                                                                     │
│  SemanticRouter.find(query, top_k=3)                                       │
│  → embeddings scored via cosine similarity                                  │
│  → returns [(SkillManifest, 0.81), (SkillManifest, 0.64), ...]             │
│       │                                                                     │
│       ▼                                                                     │
│  SkillRuntime.execute(skill, input, ctx)                                    │
│  → load few-shot examples from diversity bank                               │
│  → build prompt: system + examples + input                                  │
│  → call LLM                                                                 │
│       │                                                                     │
│       ▼                                                                     │
│  EVALS.md quality gate                                                      │
│  → structural criteria: deterministic code                                  │
│  → semantic criteria: LLM judge (Haiku)                                     │
│  → weighted score computed                                                  │
│       │                                                                     │
│       ├── score >= 0.75 → pass → write example to bank → return output     │
│       │                                                                     │
│       └── score < 0.75 → retry with correction context (max 2 retries)     │
│            → if still failing: fail with structured error                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.3 Domain Specialist Functions

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SPECIALIST ROUTING                                        │
│                                                                             │
│  SpecialistRegistry.match(org_ctx, survey_ctx)                             │
│  One function, consistent routing everywhere in the pipeline.              │
│                                                                             │
│  Scoring per specialist (max 120 pts):                                     │
│  ├── industry match     50 pts  (healthcare, retail, finserv, etc.)        │
│  ├── use case match     30 pts  (NPS, CES, CSAT, eNPS, etc.)              │
│  ├── survey type match  20 pts  (employee, cx, brand, etc.)                │
│  ├── sub-vertical       10 pts  (enterprise_software, hospitals, etc.)     │
│  └── audience match     10 pts  (employees, customers, patients, etc.)     │
│                                                                             │
│  Returns: primary specialist + any scoring >= 70 (cross-cutting overlays)  │
│  Fallback: research_generic (always available)                              │
│                                                                             │
│  Available specialists:                                                     │
│  ┌────────────────────┬───────────────────────────────────────────────┐    │
│  │ nps_specialist      │ NPS driver analysis, zone scoring            │    │
│  │ ces_specialist      │ Customer Effort Score, effort reduction       │    │
│  │ csat_specialist     │ CSAT drivers, satisfaction recovery           │    │
│  │ employee_ex         │ eNPS, engagement, retention risk              │    │
│  │ healthcare_cx       │ HCAHPS, CMS stars, press ganey               │    │
│  │ retail_cx           │ retail NPS, return rate correlation           │    │
│  │ finserv_cx          │ CSAT in banking/insurance context             │    │
│  │ education_cx        │ student/parent/staff experience               │    │
│  │ saas_cx             │ product NPS, churn prediction                 │    │
│  │ research_generic    │ fallback — works for anything                 │    │
│  └────────────────────┴───────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.4 Tenant + Permission Functions

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                 PERMISSION RESOLUTION FLOW                                   │
│                                                                             │
│  Request arrives with: org_id, user_id, user_role                          │
│       │                                                                     │
│       ▼                                                                     │
│  DB: SELECT brand FROM brand_org_memberships WHERE org_id=$1               │
│  → BrandContext{permitted_features, restricted_features, plan_tier, ...}   │
│       │                                                                     │
│       ▼                                                                     │
│  _resolve_permissions(brand, user_role):                                    │
│  → ROLE_PERMISSIONS[user_role] = {data:read, survey:read, ...}             │
│  → effective_perms = brand.permitted_features ∩ role_permissions           │
│                                                                             │
│  CrystalContext.effective_perms is set once. Never recomputed.             │
│       │                                                                     │
│       ▼                                                                     │
│  _build_filtered_tool_list(ctx):                                            │
│  → tools not in TOOL_PERMISSION_MAP: always included                       │
│  → tools in TOOL_PERMISSION_MAP: included only if perm in effective_perms  │
│  → brand.restricted_features: excluded regardless                          │
│                                                                             │
│  Result: Crystal's system prompt only lists tools the user can use.        │
└─────────────────────────────────────────────────────────────────────────────┘

Permission matrix by role:
┌─────────────────────┬────────────┬────────────┬────────────┬──────────────┐
│ Permission          │  viewer    │  editor    │  admin     │ brand_admin  │
├─────────────────────┼────────────┼────────────┼────────────┼──────────────┤
│ data:read           │    ✓       │    ✓       │    ✓       │     ✓        │
│ data:export         │    ✗       │    ✓       │    ✓       │     ✓        │
│ data:pii            │    ✗       │    ✗       │    ✓       │     ✓        │
│ survey:write        │    ✗       │    ✓       │    ✓       │     ✓        │
│ workflow:write      │    ✗       │    ✓       │    ✓       │     ✓        │
│ brand:configure     │    ✗       │    ✗       │    ✗       │     ✓        │
└─────────────────────┴────────────┴────────────┴────────────┴──────────────┘
```

### 8.5 Telemetry Functions

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      DATA FLOW: EVERY TURN                                  │
│                                                                             │
│  Crystal generates response                                                 │
│         │                                                                   │
│         ├──▶ SSE stream → user sees response                                │
│         │                                                                   │
│         ├──▶ asyncio.create_task(publish_turn_event(...))                   │
│         │    → writes crystal_turn_events (non-blocking)                    │
│         │                                                                   │
│         ├──▶ detect_quality_signal(next_user_query)                         │
│         │    → updates previous turn event with quality_signal             │
│         │                                                                   │
│         └──▶ detect_and_route_signal(query, ctx)                            │
│              → if bug/feature detected: persist_signal(...)                 │
│              → SSE: feedback_captured event → frontend shows card          │
│                                                                             │
│  Nightly scheduler:                                                         │
│  → _aggregate_skill_quality()  → skill_quality_metrics upserted           │
│  → _flag_low_quality_skills()  → alerts for skill_name with neg_rate > 30% │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.6 API Surface (Complete)

```
Crystal Endpoints (via Node.js → CrystalOS):
POST   /api/insights/{survey_id}/crystal          conversational turn (SSE)
POST   /api/crystal/feedback                       thumbs up/down on a turn
POST   /api/crystal/gap                            log a capability gap

Brand Admin Endpoints:
GET    /api/brands/{brand_id}/signals              list product signals
GET    /api/brands/{brand_id}/signals/summary      counts by type/severity
POST   /api/brands/{brand_id}/signals/{id}/status  update signal status
GET    /api/brands/{brand_id}/crystal/quality      quality metrics for brand

Platform Admin Endpoints:
GET    /api/admin/crystal/dlq                      dead-letter queue contents
POST   /api/admin/crystal/dlq/replay               replay failed tier events
GET    /api/admin/signals/top-features             cross-brand feature ranking
GET    /api/admin/skills/quality                   all skill quality metrics
```

---

## Section 9 — Interaction Flows (Key Scenarios)

### Flow A: Standard Insight Query

```
User                  Frontend              CrystalOS              Postgres/Redis
─────                 ────────              ──────────              ──────────────
"What's driving      ──▶ POST /crystal  ──▶ BrandContext load ──▶  DB: brands table
 my NPS drops?"           (SSE stream)      ↓
                                            permission resolution
                                            ↓
                                            _select_relevant_context(query)
                                            ↓ embedding similarity
                                         ──▶ top-5 NPS-relevant insights
                                            ↓
                                            ReAct loop turn 1:
                                            LLM → calls analyze_key_drivers
                                            ↓
                                         ──▶ tool executes → DB query
                                         ◀── result: {drivers: [...]}
                                            ↓
                                            ReAct loop turn 2:
                                            LLM → enough data → synthesize
                                            ↓
 ◀── SSE: thinking    ◀── SSE stream        SSE: type=thinking
 ◀── SSE: answer                            SSE: type=text_delta
 ◀── SSE: navigation  ◀── navigation chip   SSE: type=navigation
 ◀── 👍 👎 buttons                          publish_turn_event() [async]
```

### Flow B: Bug Report Detected

```
User                  Crystal              FeedbackDetector        DB
─────                 ───────              ────────────────        ──
"The score is        ──▶ answers           _quick_classify()
 wrong, it should        the question   ──▶ → "bug" detected
 be 67 not 42"           normally          LLM extract:
                                           title: "NPS Score Incorrect"
                                           severity: "high"
                                           affects_feature: "nps_calculation"
                                           ↓
                                           _determine_routing(ctx):
                                           brand has support_ticket_url?
                                           → yes: routing="brand"
                                           ↓
                                        ──▶ INSERT crystal_product_signals
                                           ↓
 ◀── "I've noted      ◀── feedback_captured SSE event
      this — also          {action_url: "https://jira.marriott.com"}
      [→ Open ticket]"
```

### Flow C: Feature Request with Dedup

```
User A (org1)         User B (org2)         User C (org1)         DB
─────────────         ─────────────         ─────────────         ──
"I wish I could       "Would be great       "Can you add          
 filter by            to filter these       region filtering
 region"              by geography"         to this?"             
      │                      │                    │
      ▼                      ▼                    ▼
  hash("Excel                                hash("Excel          ◀── INSERT (new row,
   region filter:            hash("region       region filter:        vote_count=1)
   analyze_segments")         filter: ...")      analyze_segments")
      │                          │                    │
      │                          │                 same hash as User A's row
      │                          │                    ▼
      │                          │               ◀── UPDATE vote_count = 2
      ▼                          ▼
  new row                    new row (different
  vote_count=1               hash — slightly
                             different phrasing)

PM dashboard:
  "Region filtering in segment analysis" — 2 votes, 2 orgs
  "Geographic breakdown" — 1 vote, 1 org
  → PM decides to merge these manually if they look like the same ask
```

### Flow D: New Feature → Crystal Knows About It

```
Engineer              Frontend Code         Crystal              
────────              ─────────────         ───────              
adds                  registerCrystal       GET /api/crystal/context
Workflows             Capability(           returns new context
feature               "workflows", {        including workflows
                        description:        capability
                        "...",              ↓
                        route:              Crystal can now:
                        ROUTES.WORKFLOWS,   - explain workflows
                        permissions:        - recommend it
                        ["workflow:read"]   - navigate user to it
                      })                    - suggest setup

No Crystal code changed. No prompt updated. No YAML edited.
```

---

## Section 10 — Does the Current Design Make It Easier to Build Faster?

**Short answer:** Yes, but there's a missing layer.

### What speeds things up

**1. Skills require zero code changes**

A new analysis capability is a SKILL.md file. Hot-reload picks it up in 30 seconds in dev. The semantic router finds it automatically for relevant queries. No API changes, no if/elif additions, no routing tables. An engineer who understands the domain but not the CrystalOS internals can ship a new capability in a day.

**2. Features self-register to Crystal**

`registerCrystalCapability()` means a frontend engineer adding a new page can make Crystal aware of it without touching CrystalOS at all. Crystal learns about new features at runtime, not at deploy time.

**3. Quality gates are human-readable**

EVALS.md criteria are written in English. Product can write quality requirements, not just engineers. "Output must reference the survey name" is a valid criterion. An LLM judge scores it — no code needed for new eval criteria.

**4. Brand skills are isolated from platform skills**

A brand can iterate on their own SKILL.md files independently. They don't need a PR in the Experient repo to customize Crystal behavior for their use case.

**5. Telemetry is automatic**

Every turn emits structured events with zero extra code. Debugging a quality regression means running a SQL query, not grepping logs.

### What's still missing (the gaps that slow things down)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    MISSING: CRYSTAL DEVELOPMENT KIT (CDX)                   │
│                                                                             │
│  Today: engineer writes SKILL.md manually, no scaffolding                  │
│                                                                             │
│  Missing:                                                                   │
│  $ npx experient-cdx scaffold --type=skill --name=roi-calculator            │
│    ✓ Created skills/roi-calculator/SKILL.md (template)                     │
│    ✓ Created skills/roi-calculator/EVALS.md (with 3 example criteria)      │
│    ✓ Created tests/test_roi_calculator.py (with eval test harness)         │
│                                                                             │
│  $ npx experient-cdx test "what's the ROI of improving CSAT by 10 points"  │
│    Running semantic search...                                               │
│    → roi-calculator found (similarity: 0.82)                               │
│    Running skill...                                                         │
│    Running EVALS.md...                                                      │
│    Pass: 4/5 criteria (score: 0.81)                                        │
│    Fail: "output must cite response count" (score: 0.40)                   │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                  MISSING: SKILL BROWSER UI                                   │
│                                                                             │
│  Today: skill catalog is a markdown doc (SKILLS_CATALOG.md)                │
│                                                                             │
│  Missing: a UI at /admin/crystal/skills showing:                           │
│  ┌─────────────────┬──────────┬──────────┬────────────┬───────────────┐   │
│  │ Skill           │ Queries  │ Avg Score│ Neg Rate   │ Source        │   │
│  ├─────────────────┼──────────┼──────────┼────────────┼───────────────┤   │
│  │ nps-advisor     │ 2,341    │ 0.84     │ 8%         │ global        │   │
│  │ ces-analyzer    │ 891      │ 0.79     │ 12%        │ global        │   │
│  │ hcahps-scorer   │ 234      │ 0.91     │ 3%         │ marriott      │   │
│  └─────────────────┴──────────┴──────────┴────────────┴───────────────┘   │
│                                                                             │
│  Engineers know what's working before looking at logs                      │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│               MISSING: CRYSTAL ROUTING DEBUGGER                             │
│                                                                             │
│  Today: no way to see why Crystal chose the tools it did                   │
│                                                                             │
│  Missing: every Crystal response has an optional "explain" mode:           │
│  POST /crystal?debug=true                                                   │
│  Response includes:                                                         │
│  {                                                                          │
│    "routing_trace": {                                                       │
│      "specialist_scores": {"nps_specialist": 90, "employee_ex": 20},      │
│      "skills_considered": [                                                 │
│        {"name": "analyze_key_drivers", "sim": 0.81},                      │
│        {"name": "nps-advisor", "sim": 0.74}                               │
│      ],                                                                     │
│      "tools_called": ["analyze_key_drivers", "analyze_segments"],          │
│      "eval_scores": {"turn_1": 0.88}                                       │
│    }                                                                        │
│  }                                                                          │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│               MISSING: A/B TESTING FOR SKILLS                               │
│                                                                             │
│  Today: can't compare skill v1 vs v2 on real traffic                       │
│                                                                             │
│  Missing:                                                                   │
│  SKILL.md can declare: variant: "nps-advisor-v2"                           │
│  SkillRegistry loads both v1 and v2                                         │
│  10% of traffic goes to v2, 90% to v1                                      │
│  skill_quality_metrics tracks them separately                              │
│  PM can compare: v2 has 4% lower negative signal rate → graduate to 100%  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Summary: Build Speed Assessment

```
┌──────────────────────────────────────┬──────────────────┬──────────────────┐
│ Task                                 │ Today (current)  │ After Redesign   │
├──────────────────────────────────────┼──────────────────┼──────────────────┤
│ Add new skill capability             │ ~3 days          │ ~4 hours         │
│  (analysis type Crystal can run)     │ code + tests +   │ SKILL.md + evals │
│                                      │ routing updates  │                  │
├──────────────────────────────────────┼──────────────────┼──────────────────┤
│ Make Crystal aware of new app page   │ ~2 days          │ ~30 minutes      │
│  (so it can navigate users there)    │ prompt + YAML    │ registerCapab()  │
├──────────────────────────────────────┼──────────────────┼──────────────────┤
│ Add new enterprise brand             │ ~2 weeks         │ ~1 day           │
│  (new Crystal tenant)                │ custom deploy    │ DB row + SKILL.md│
├──────────────────────────────────────┼──────────────────┼──────────────────┤
│ Debug a quality regression           │ ~4 hours         │ ~20 minutes      │
│  (customer said Crystal was wrong)   │ grep logs        │ SQL on turn_evts │
├──────────────────────────────────────┼──────────────────┼──────────────────┤
│ Write quality gate for new skill     │ ~2 hours         │ ~10 minutes      │
│  (ensure output meets the bar)       │ code + tests     │ EVALS.md row     │
├──────────────────────────────────────┼──────────────────┼──────────────────┤
│ Route bug to brand's own Jira        │ not possible     │ config only      │
│  (from Crystal conversation)         │                  │ support_ticket_url│
├──────────────────────────────────────┼──────────────────┼──────────────────┤
│ Test semantic routing for a skill    │ not possible     │ ~5 minutes       │
│  (will Crystal find my skill?)       │                  │ registry.find()  │
└──────────────────────────────────────┴──────────────────┴──────────────────┘
```

**The biggest unlock:** the current system requires engineering involvement to add or change anything Crystal knows about. The redesign moves configuration to data (SKILL.md, EVALS.md, BrandContext, registerCapability) — which means product teams, brand teams, and non-Crystal engineers can all extend the system without touching the core.

The missing pieces (CDX scaffolding, Skill Browser UI, Routing Debugger, A/B testing) are the next layer. They're not in the redesign because they don't affect correctness — but they're what will push build speed from "fast" to "instant."
