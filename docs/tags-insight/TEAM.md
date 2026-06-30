# Tags & Group Intelligence — Team

> **Why this team composition matters.** Tags & Group Intelligence is deceptively simple
> on the surface ("just add labels to surveys") and deeply powerful underneath (it becomes
> the dimensional lens through which every insight, workflow, and report in Xperiq is
> organized). Getting it wrong at the data model or UX layer means retrofitting the entire
> platform. This team is assembled to build it right the first time.

---

## Team Roster

---

### 1. Product Lead

**Name:** Priya Nalawade
**Title:** Senior Product Manager, Platform Intelligence

**Background:**
Priya spent five years at Qualtrics building their XM Directory product — the system that
tags contacts, survey programs, and actions into unified account records for B2B CX teams.
Before that, she was a PM at Asana where she owned labels, custom fields, and project
templates. She understands both the deceptively hard taxonomy design problems (how do you
keep a tag system from becoming tag soup?) and the enterprise governance problems (who owns
the namespace, what happens when tags proliferate).

**Superpower:** She has shipped a tagging system at 500+ enterprise customer scale and has
the scar tissue to know exactly what breaks when you don't build namespace governance from
day one.

**Mandate on this feature:**
- Own the PRD end-to-end: data model decisions, API contract sign-off, UX acceptance criteria
- Define the namespace governance model (free tags vs. locked namespaces for admins)
- Own the GTM narrative and pricing tier placement
- Write acceptance criteria for all four phases and drive sprint demos
- Be the single escalation point for any scope/priority trade-off

---

### 2. Principal UX Designer

**Name:** Marcus Osei
**Title:** Principal Product Designer, Data Surfaces

**Background:**
Marcus was the lead designer at Looker before the Google acquisition, where he designed
the Looker Explore interface — a complex multi-dimensional filter and pivot UI used by
data analysts in Fortune 500 companies. After Looker he joined Linear as a senior designer
and contributed to their label system and view filtering architecture. He has a rare skill:
making complex, multi-select, hierarchical filtering feel simple and even delightful.

**Superpower:** He designs filtering systems that data analysts call "the best I've ever
used" — precision without cognitive load, because he encodes the system's model into the
interaction rather than exposing the raw complexity.

**Mandate on this feature:**
- Design all five interaction surfaces: tag creation, tag filtering in survey list,
  Tag Intelligence View dashboard, auto-tag proposal UI, and Tag Universe visualization
- Own the Figma component library for tag primitives (pill, picker, filter bar, node)
- Define the motion design spec for tag animations (proposal → accept, filter apply,
  universe fly-in)
- Conduct two rounds of usability testing with CX leaders before Phase 2 ships
- Maintain the design token contract so tag colors integrate cleanly with Tailwind v4
  theme variables

---

### 3. Backend Architect

**Name:** Dmitri Volkov
**Title:** Staff Engineer, Data Platform

**Background:**
Dmitri spent six years at Segment building their data pipeline and workspace-level label
system, including the schema registry that tracks metadata across thousands of event types.
Before that he was at Heroku working on Postgres extensions and query planning. He has
published papers on hierarchical data modeling in relational databases (the closure table
vs. adjacency list debate) and is the person you call when you need a tagging system that
stays performant at 100M rows.

**Superpower:** He designs Postgres schemas that age well — built for the queries you
haven't written yet, not just the ones you wrote today.

**Mandate on this feature:**
- Own the Postgres schema: `tags`, `survey_tags`, `tag_hierarchies`, `tag_insights`
  materialized view
- Write and own all DB migrations (Supabase migration files)
- Design the incremental aggregation strategy (never recompute the full dataset)
- Set up the 15-minute materialized view refresh cron and monitor drift
- Define the Redis cache strategy for tag lists (key schema, TTL, invalidation hooks)
- Own backend API layer: routes, validation, error handling, integration tests

---

### 4. Frontend Engineer

**Name:** Tanya Krishnamurthy
**Title:** Senior Frontend Engineer, Product UI

**Background:**
Tanya was a senior engineer at Notion for three years where she built their filter and
sort system (used by millions of Notion users daily) and contributed to the database views
feature. She then joined Retool where she owned the multi-select widget and advanced
filtering components. She is a React 19 / Tailwind v4 expert and has strong opinions about
keeping filter state in URLs (so dashboards are always shareable and bookmarkable).

**Superpower:** She builds filter UIs that encode state in the URL and hydrate perfectly
on page load — no lost context, no broken back-button, always shareable.

**Mandate on this feature:**
- Build all tag UI components: `<TagPill>`, `<TagPicker>`, `<TagFilterBar>`,
  `<TagColorPicker>`, `<TagUniverseGraph>` (D3-based force-directed)
- Build the `/tag-insights/:slug` route and all its sub-components (KPI row, trend chart,
  topic heatmap, survey breakdown table)
- Implement URL-based filter state for tag filtering in survey list
- Own all frontend tests (Vitest unit tests for components, at least 80% coverage)
- Build the auto-tag proposal confirm-card component following Xperiq's existing
  confirm-card pattern

---

### 5. AI/ML Engineer

**Name:** Leila Hosseini
**Title:** Senior ML Engineer, Crystal AI

**Background:**
Leila has a PhD in NLP from Stanford where she focused on semantic clustering and
taxonomy induction from unstructured text. She spent three years at Pinterest building
their interest taxonomy system — a semi-automated pipeline that clusters user signals into
coherent topic categories at scale. More recently at Cohere she built embedding-based
document clustering features for enterprise search. She knows the full stack from
fine-tuning embedding models to shipping production inference APIs.

**Superpower:** She can take a raw corpus of survey questions, run embedding-based
clustering, and produce a coherent tag taxonomy that mirrors how CX teams actually think
about their programs — not just keyword matching.

**Mandate on this feature:**
- Design and build the auto-tagging skill in CrystalOS: input is survey title + questions,
  output is ranked tag proposals with confidence scores
- Build the embedding similarity service: given a new survey, find its k-nearest neighbor
  tag groups from org history
- Own the `tag_insight_pipeline` LangGraph graph (fetch → aggregate → compute →
  narrative → publish)
- Write SKILL.md and EVALS.md for the auto-tagging skill following CrystalOS conventions
- Track auto-tag accept rate as the primary quality signal and tune prompts to hit >60%
  acceptance

---

### 6. Data Engineer

**Name:** Reuben Adeyemi
**Title:** Senior Data Engineer, Analytics Platform

**Background:**
Reuben spent four years at Amplitude building their behavioral cohort pipeline —
specifically the system that aggregates raw event streams into materialized cohort
membership tables, refreshed incrementally every 10 minutes. Before that he was at
Fivetran building connectors for large-scale data warehouse ingestion. He has deep
expertise in incremental aggregation patterns (specifically: how to materialize rolled-up
aggregates without recomputing the full dataset on every refresh).

**Superpower:** He designs pipelines that stay fast as data grows — not just for the first
thousand surveys, but for the enterprise customer with 50,000 surveys across 20 years.

**Mandate on this feature:**
- Own the `tag_insights` materialized view design: response_count, NPS rollup,
  avg_sentiment, response_velocity
- Build the incremental refresh logic: query only surveys with new responses since
  `last_refresh_at`, merge into materialized state
- Set up the Postgres `pg_cron` or backend cron job for 15-minute refresh cadence
- Own the trend data pipeline: `tag_insight_trend` table, daily snapshots for 90-day
  rolling window
- Define and document query patterns for tag-scoped reports so the frontend never does
  N+1 queries across surveys

---

### 7. Marketing Lead

**Name:** Cassandra Weil
**Title:** Director of Product Marketing

**Background:**
Cassandra spent five years at Medallia as a product marketer focused on competitive
positioning against Qualtrics. She knows the XM category better than almost anyone outside
of the two giants — their pricing psychology, their sales motions, their customer
frustrations. She then joined a Series B HR tech company (Leapsome) where she ran PLG
growth for their goal-tracking and engagement features, growing self-serve signups 3x in
18 months through in-app onboarding and content.

**Superpower:** She can frame a technical product capability as a business outcome that
makes a CX VP say "I need that today" — no jargon, just the pain point and the
before/after.

**Mandate on this feature:**
- Own feature naming: "Intelligence Groups" vs. "Tags" in all user-facing copy
- Write the launch narrative, blog post, and LinkedIn content plan
- Own Product Hunt launch copy and submission
- Design the in-app onboarding moment: first survey creation → Crystal tag suggestion
  prompt
- Track and report on GTM metrics: tag adoption rate, time-to-group, PLG conversion
  from free (10 tags) to paid (Intelligence Groups)

---

### 8. Xperiq Platform Expert

**Name:** Jordan Castillo
**Title:** Senior Engineer, Platform Integration

**Background:**
Jordan has been building Xperiq from near the beginning and is the person who most
deeply understands how surveys, responses, insights, and the Crystal AI pipeline are
wired together. They wrote the current `useInsightPipeline` hook, the backend insight
aggregation routes, and the CrystalOS skill runtime. When a new feature touches multiple
existing systems — as Tags & Group Intelligence does — Jordan is the integration guardian
who spots the implicit contract breakages before they ship.

**Superpower:** Jordan can read a proposed data model and immediately name the three
existing code paths that will silently break — because they wrote most of them.

**Mandate on this feature:**
- Review all data model and API design decisions for compatibility with existing
  surveys/insights architecture
- Own the integration contract between tag filters and the existing response dashboard
  (`ResponseDashboardPage`) so tag-scoped filtering doesn't require a full rewrite
- Ensure the CrystalOS tag insight pipeline follows the same patterns as the existing
  insight pipeline (skill runtime, SKILL.md, EVALS.md)
- Pair with Dmitri on Postgres schema review before any migration is written
- Be the gatekeeper on the Phase 4 workflow integration: tag-scoped workflow triggers
  must not break any existing workflow logic

---

## Team Rituals

### Weekly Cadence

| Ritual | When | Who | Purpose |
|---|---|---|---|
| **Phase kickoff** | Monday 9am (each new phase) | Full team | Review spec, assign owners, surface blockers |
| **Build sync** | Wednesday 10am | Engineers only (Dmitri, Tanya, Reuben, Leila, Jordan) | Unblock cross-layer dependencies; max 30 min |
| **Design review** | Thursday 2pm | Marcus + Priya + Tanya | Review Figma against acceptance criteria |
| **Phase demo** | End of each 2-week phase | Full team + stakeholders | Ship demo, decide what moves to next phase |
| **GTM sync** | Every other Friday | Priya + Cassandra | Align on messaging, pricing, and launch timing |

### Async norms
- All decisions are documented in the relevant doc section under a `## Decision Log` header
- Blockers are posted in `#tags-intelligence` Slack channel with `[BLOCKED]` prefix
- PRs require one approval from Jordan (integration review) plus one from the domain owner
- No design → engineering handoff happens without a written acceptance criteria table

---

## Decision Framework

| Decision Type | Owner | Must Consult | Can Escalate To |
|---|---|---|---|
| Data model shape | Dmitri | Jordan, Reuben | Priya |
| API contract (request/response shape) | Dmitri | Tanya, Jordan | Priya |
| UX interaction pattern | Marcus | Tanya, Priya | Priya |
| Pricing tier placement | Priya | Cassandra | VP Product |
| Auto-tag quality threshold | Leila | Priya | Priya |
| Phase scope in/out | Priya | Full team | VP Product |
| Feature naming (user-facing) | Cassandra | Priya | VP Marketing |
| Integration boundary (existing code) | Jordan | Dmitri, Tanya | Priya |

**The 48-hour rule:** Any unresolved disagreement escalates to the owner's manager after
48 hours. Velocity over perfection.

---

## Success Metrics Owned by Team

| Metric | Target | Owner | Measurement |
|---|---|---|---|
| Tag adoption rate (% surveys with ≥1 tag, 30 days post-launch) | ≥40% | Priya + Cassandra | Backend analytics |
| Tag Intelligence View sessions/user/week | ≥2.0 | Priya | Frontend event tracking |
| Auto-tag accept rate | ≥60% | Leila | `tag_proposals` outcome table |
| Time-to-first-group (new user) | ≤5 minutes | Marcus + Tanya | Session analytics |
| Tag list query p95 latency | ≤80ms | Dmitri + Reuben | Prometheus |
| Tag Intelligence View load time (p95) | ≤1.2s | Tanya + Reuben | Lighthouse + RUM |
| Materialized view refresh lag | ≤20 minutes | Reuben | pg_cron monitoring |
| Auto-tag skill EVALS pass rate | ≥90% | Leila | CrystalOS EVALS runner |
| Phase 1 shipped on schedule | Week 2 | Priya | Sprint demo |
