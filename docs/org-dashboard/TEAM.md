# Org Intelligence Dashboard — Team Charter

> **Document owner:** Product Lead  
> **Last updated:** 2026-06-29  
> **Status:** Active — this is the founding charter for the Command Center pod

---

## Mission Statement

We are building the most important dashboard in the XM industry: a single, intelligent view of an organization's entire experience health — powered by Crystal's synthesis layer, grounded in Xperiq's survey data, and designed for the executives who need confidence walking into Monday morning board rooms.

Every decision we make is evaluated against one question: **does this help a VP of CX understand, at a glance, whether their organization's experience programs are working?**

---

## Team Roster

### 1. Product Lead

**Name:** Priya Rajan  
**Title:** Senior Product Manager, Executive Analytics  
**Specialty:** C-suite BI dashboards, executive-facing analytics products, 0→1 data products at scale

**Background:** Priya spent six years at Tableau building the "Executive Summary" product line, shipping dashboards used by CxOs at Fortune 500 companies. She then led product at a Series B HR analytics startup where she built a real-time workforce health dashboard used by 300+ enterprise HR leaders. She joined Xperiq specifically to apply dimensional intelligence to the experience management problem.

**Superpower:** Priya can sit in a C-suite demo for 20 minutes and come out knowing exactly what three things need to change to turn a "maybe" into a signed contract.

**Mandate / Deliverables:**
- Own the PRD and all feature specifications for Command Center (v1 through v3)
- Drive the ICP definition and validate it with 15 customer discovery interviews before Phase 2 launch
- Define and own the success metrics framework (adoption, engagement, upgrade conversion)
- Serve as the single decision-maker on scope trade-offs within each sprint
- Own the GTM coordination with Marketing — feature narrative, launch timing, pricing placement
- Run weekly stakeholder demo to leadership (CEO, Head of Sales, Head of CS)
- Maintain `docs/org-dashboard/` as the single source of truth for the feature

---

### 2. Principal UX Designer

**Name:** Marcus Osei  
**Title:** Principal Product Designer, Data-Dense Interfaces  
**Specialty:** Command center UI, mission-control aesthetics, real-time data visualization, executive dashboard design patterns

**Background:** Marcus spent four years designing ground control interfaces for a defense contractor, where he learned to display 40+ live data streams in a single coherent view under high cognitive load. He then joined Amplitude as a senior designer and rebuilt their analytics dashboard to reduce time-to-insight by 60%. His design philosophy is rooted in the idea that density and clarity are not opposites — they are achieved together through ruthless hierarchy.

**Superpower:** Marcus can convert a complex multi-dimensional data model into a scannable visual hierarchy in a single whiteboard session.

**Mandate / Deliverables:**
- Own all design artifacts in `docs/org-dashboard/DESIGN.md` — component specs, interaction states, micro-animations, color system
- Produce Figma designs for all 9 sections of Command Center before each phase begins engineering
- Define and document the dark mode / War Room Mode design system
- Own the mobile-responsive layout specification for Phase 5
- Conduct at least 2 usability tests per phase with real users before sign-off
- Maintain design token alignment with Xperiq's Tailwind v4 design system
- Serve as the final approver on any UI shipped under the Command Center surface

---

### 3. Backend Architect

**Name:** Dariusz Kowalski  
**Title:** Principal Software Engineer, Data Platform  
**Specialty:** Data aggregation at scale, materialized views, real-time pub/sub, PostgreSQL query optimization, event-driven architectures

**Background:** Dariusz was a founding engineer at a real-time analytics startup (acquired by Databricks) where he built a pipeline processing 50M events/day on Postgres and Redis before the company migrated to a dedicated OLAP stack. He has deep experience with materialized view refresh strategies, partial index design, and the specific failure modes of aggregation queries under concurrent write load. He joined Xperiq to solve the "data is there, aggregation is the bottleneck" problem that every XM platform hits at scale.

**Superpower:** Dariusz can look at a slow query plan and identify the exact missing index or materialized view that will drop it from 4 seconds to 40ms.

**Mandate / Deliverables:**
- Design and implement all Postgres schemas: `org_metrics_daily`, `org_metrics_weekly`, `org_topic_trends`, `org_health_score`, `tag_group_metrics`, `survey_health_summary`, `org_crystal_briefs`
- Define and implement the materialized view refresh strategy (pg_cron schedules, incremental refresh patterns)
- Implement Redis caching layer: what is cached, TTL per endpoint, invalidation triggers
- Own backend performance targets: <500ms initial load, <2s real-time latency at scale (500 surveys, 1M responses)
- Design the WebSocket server architecture and Redis pub/sub channel model
- Review all backend PRs touching the org-dashboard surface
- Produce the performance test plan for Phase 5 load testing

---

### 4. Frontend Engineer

**Name:** Yuki Tanaka  
**Title:** Senior Software Engineer, Data Visualization  
**Specialty:** Advanced charting with D3 and Recharts, real-time WebSocket state management, complex dashboard layout systems, React performance optimization

**Background:** Yuki built the charting engine for a financial trading platform where P50 render latency for live tick data was a hard SLA. She then spent three years at a BI startup implementing complex cross-filter interactions in React using virtualized rendering and incremental state updates. She is the author of a well-regarded open-source React hook library for WebSocket state management with 4k GitHub stars.

**Superpower:** Yuki can implement a live dual-axis chart that updates in real-time at 30fps without dropping a single frame or triggering unnecessary re-renders in adjacent components.

**Mandate / Deliverables:**
- Implement all frontend components in `app/src/components/org-dashboard/` across all 5 phases
- Own the Recharts integration for `NPSTrendChart.tsx` (dual-axis, live data extension, benchmark line)
- Build `useOrgDashboardLive.ts` — the WebSocket hook with debounce, reconnect, and optimistic state
- Own frontend performance: <500ms time-to-first-contentful-paint, smooth live update animations with no layout shift
- Implement all micro-interactions per Marcus's specification (count-up animation, pulse, live counter flash)
- Maintain strict TypeScript types for all API response shapes — no `any`, no `unknown` without a type guard
- Build the `⌘K` command bar integration for Phase 5

---

### 5. AI/ML Engineer

**Name:** Amara Nwosu  
**Title:** Senior AI Engineer, Org Intelligence  
**Specialty:** Org-level anomaly detection, cross-survey signal synthesis, predictive NPS modeling, LangGraph DAG design

**Background:** Amara did her PhD on multi-source anomaly detection in distributed systems at Carnegie Mellon and applied it commercially at a fintech where she built fraud signal synthesis across 12 disparate data streams. She joined Xperiq's CrystalOS team to apply the same cross-signal synthesis approach to experience data — detecting when 3 independent survey programs simultaneously show negative sentiment, which is almost certainly a correlated org-level event rather than independent noise in each program.

**Superpower:** Amara can design a LangGraph DAG that routes org-level signals through the right combination of deterministic aggregation and LLM synthesis to produce Crystal briefs that feel genuinely insightful rather than templated summaries.

**Mandate / Deliverables:**
- Design and implement `crystalos/graphs/org_brief_graph.py` — the full 6-node LangGraph DAG for weekly briefs
- Build `crystalos/skills/org_signal_detector/` — the cross-survey anomaly detection skill with SKILL.md and EVALS.md
- Define the org health score computation logic (NPS 40%, sentiment 30%, response velocity 20%, anomaly-free 10%)
- Write Crystal's voice guidelines for org-level narrative (tone, specificity level, what Crystal never says)
- Build and maintain `EVALS.md` for the org brief skill with at least 10 labeled test cases before Phase 2 ships
- Own the accuracy of Crystal's weekly brief recommendations, measured against user action rate in the outcome funnel
- Define the LLM prompt structure for the `synthesize_narrative` node and iterate based on eval results

---

### 6. Data Engineer

**Name:** Leila Ahmadi  
**Title:** Senior Data Engineer, Experience Analytics  
**Specialty:** Materialized views, incremental aggregation pipelines, cross-survey data joins, pg_cron orchestration

**Background:** Leila spent five years at a healthcare analytics company building HIPAA-compliant incremental aggregation pipelines over patient satisfaction survey data at scale. She has built materialized view refresh strategies for schemas with 200M+ rows and knows exactly when to use `REFRESH MATERIALIZED VIEW CONCURRENTLY` versus a manual incremental update pattern that processes only new rows. She joined Xperiq because the cross-survey aggregation problem in XM is a genuinely hard data engineering challenge that most platforms solve badly.

**Superpower:** Leila can write an incremental aggregation query that processes only new rows since the last refresh, handles late-arriving data correctly, and runs in under 5 seconds on a table with 10M rows.

**Mandate / Deliverables:**
- Write all SQL migrations in `supabase/migrations/` for the org-dashboard data model
- Implement pg_cron jobs for scheduled materialized view refreshes at 15-minute, hourly, and daily cadences
- Build the `org_health_score` computation function (called by the scheduler, not computed on-read)
- Implement incremental aggregation for `org_metrics_daily` — avoid full table scans on every refresh
- Own the data freshness SLA: org-level metrics are never stale by more than 15 minutes
- Define and document the backfill strategy for orgs that existed before Command Center launched
- Build monitoring queries that alert the on-call rotation when a materialized view refresh falls behind schedule

---

### 7. Design Systems Engineer

**Name:** Theo Bergmann  
**Title:** Senior Software Engineer, Design Systems  
**Specialty:** Component library architecture, Tailwind v4 theming, executive dark mode design systems, accessibility engineering

**Background:** Theo was the founding design systems engineer at a SaaS company that went from CSS spaghetti to a fully typed component library used across 8 product teams in 18 months. He has particular depth in Tailwind v4's CSS variable theming system and has built dark mode implementations that go beyond color inversion into genuinely redesigned visual hierarchy for data-dense interfaces. He holds a CPACC accessibility certification.

**Superpower:** Theo can translate a designer's dark mode mockup into a Tailwind v4 theme token system that requires zero component-level conditional logic — the entire dark mode is expressed as CSS variable overrides on the root.

**Mandate / Deliverables:**
- Build all reusable primitives in `app/src/components/org-dashboard/`: `HealthPill`, `KPITile`, `SparklineCell`, `SeverityBadge`, `TopicChip`
- Implement the War Room Mode dark theme in Tailwind v4 (CSS variable overrides, no component-level changes required)
- Ensure all Command Center components meet WCAG 2.1 AA: color contrast ratios, keyboard navigation, aria-labels
- Own `WarRoomToggle.tsx` and the CSS transition animation specification
- Establish org-dashboard Storybook stories so each component is independently testable and reviewable
- Define and enforce naming conventions for all org-dashboard CSS custom properties
- Review every UI PR for design system compliance before merge

---

### 8. Marketing Lead

**Name:** Sofia Reyes  
**Title:** Senior Product Marketing Manager, Platform  
**Specialty:** C-suite positioning, "single pane of glass" narratives, enterprise SaaS launch strategy, analyst relations

**Background:** Sofia led product marketing for the launch of a major BI platform's executive summary feature, which became the #1 cited reason for upgrade in customer surveys within two quarters. She has written analyst briefings for Gartner, IDC, and Forrester on the XM market and knows exactly how to position a new analytics surface against entrenched players like Qualtrics and Medallia. Her "Monday morning VP" narrative framework has been used by three enterprise SaaS companies as their canonical launch story format.

**Superpower:** Sofia can write a 60-second LinkedIn video script that makes a VP of CX feel, viscerally, that they are currently flying blind — and that Command Center is the instrument panel they have been missing for years.

**Mandate / Deliverables:**
- Own `docs/org-dashboard/GTM.md` — competitive positioning matrix, ICP profiles, launch phases, pricing rationale
- Write all in-app copy for Command Center: tooltips, empty states, upgrade prompts, onboarding hints — all routed through `locales/en.ts`
- Produce the LinkedIn launch video script and coordinate production with Design
- Write the analyst pitch paragraph for Gartner and Forrester XM market coverage
- Define and own the feature naming vocabulary — what we call things consistently, and what we never call things
- Build the sales enablement deck for Command Center (the "executive sponsor hook" narrative for enterprise deals)
- Measure and report on marketing-influenced upgrade conversions attributed to Command Center feature exposure

---

### 9. Xperiq Platform Expert

**Name:** Jordan Whitfield  
**Title:** Staff Engineer, Platform Integration  
**Specialty:** Cross-feature integration, drill-down navigation architecture, Xperiq data contracts, integration testing

**Background:** Jordan has been at Xperiq since the founding and has a complete mental model of every data contract, every page navigation path, and every edge case in the existing survey and insights system. They have prevented at least 4 major integration failures by catching contract mismatches during design review before implementation began. Jordan's job on this team is to ensure Command Center is deeply woven into the platform — not bolted on as a separate surface that goes stale.

**Superpower:** Jordan can read a new API spec and immediately identify the 3 ways it will conflict with existing codebase assumptions, before a single line of implementation is written.

**Mandate / Deliverables:**
- Own the drill-down path architecture: Org Dashboard → Tag Intelligence View → Survey Detail → Insights — every path must land somewhere meaningful with no dead ends and no stale data
- Audit every new API endpoint against existing Xperiq contracts for naming conventions, auth patterns, and error response format consistency
- Own the `locales/en.ts` integration — all Command Center user-facing strings go through Jordan's review before merge
- Maintain the integration test suite at `backend/tests/org-dashboard/` — at minimum, happy-path + auth failure + empty-org cases per endpoint
- Define the DataBus invalidation strategy: which Command Center mutations trigger invalidation of which existing views
- Attend every architecture design session as the integration veto voice
- Write and maintain `INTEGRATION_GUIDE.md` for connecting Command Center drill-down paths to the existing survey and insights navigation

---

## Team Rituals

### Daily Standup — 9:00 AM PT (25 minutes, hard stop)

**Format:** Async-first, sync-when-blocked.

Each team member posts in Slack by 8:45 AM:
```
Yesterday: [one sentence — what shipped or was decided]
Today:     [one sentence — what I am building or deciding]
Blocked:   [YES or NO — if YES, one sentence on exactly what you need]
```

The synchronous standup at 9:00 AM is exclusively for unblocking. If nobody is blocked, the meeting does not happen. The facilitator role rotates weekly and is responsible for calling the cancel.

**Anti-patterns the team does not tolerate:**
- Status updates longer than 2 sentences
- "Working on the dashboard feature" — must name a specific file, component, or decision
- Omitting the Blocked field

---

### Weekly Demo — Fridays, 3:00 PM PT (45 minutes)

**Structure:**
- 5 min: Priya presents the week's shipping summary against the phase plan in ROADMAP.md
- 25 min: Engineers demo what shipped (live in staging, not in slides or localhost)
- 10 min: Marcus walks any new design decisions and collects team input
- 5 min: Priya calls the go/no-go for the following week's scope

**Rules:**
- Demo must run in the staging environment. If it is not deployed to staging by Thursday EOD, it is not demoed Friday.
- Every demo item must show its acceptance criteria on screen (from ROADMAP.md). We demo against the spec, not the vibe.
- Decisions made during the demo are captured in the Decision Log within 24 hours.

---

### Decision Log

Maintained as a running append-only file at `docs/org-dashboard/DECISIONS.md` (created when the first decision is recorded).

**Entry format:**
```
## Decision [number]: [title]
Date: YYYY-MM-DD
Decision-maker: [name]
Context: [1-2 sentences on what problem prompted this]
Decision: [the actual choice made]
Alternatives considered: [brief list]
Rationale: [why this choice over alternatives]
Reversibility: [easy / hard / irreversible]
```

Decisions are escalated to Priya when they affect scope across more than one phase, require a schema change after Phase 1 has shipped to production, or introduce a new external dependency not already in the codebase.

---

### Architecture Review — Bi-weekly, Tuesdays before Phase Transitions

**Attendees:** Dariusz, Leila, Yuki, Amara, Jordan (mandatory). Priya and Marcus (optional but strongly encouraged).

**Agenda:**
1. Review the ARCHITECTURE.md diff since the last meeting
2. Walk new schemas and API contracts before they are implemented
3. Jordan's integration audit: new breakage vectors, contract conflicts
4. Performance budget check: are we on track for <500ms initial load and <2s real-time latency

---

## Decision Framework

### Density vs. Clarity

We always resolve in favor of clarity at the P75 user — a VP of CX who is not a data analyst. Maximum information density is not a goal. Minimum cognitive load to answer "are my programs healthy?" is the goal.

**Tiebreaker:** Marcus has final say on visual design decisions. If there is a disagreement between an engineer's implementation and Marcus's spec, the spec wins unless the engineer can demonstrate a concrete technical constraint that makes the spec impossible to implement.

**Exception:** Amara has unilateral authority to reduce the verbosity of Crystal's narrative output. If a brief feels templated, Amara can ship a new prompt version without the standard PR review cycle, but must still run an eval pass against EVALS.md before deploying.

---

### Real-time Cost vs. Latency

We do not add real-time complexity without a measured user need. The decision tree is:

1. Is data being stale by 15 minutes acceptable for this metric? Use materialized view refresh. Do not add WebSocket infrastructure.
2. Is stale-by-2-minutes acceptable? Use 2-minute frontend polling. No WebSocket.
3. Does the user need to see a number change while they are actively looking at it? Use WebSocket. Accept the full real-time stack cost.

Currently, only the KPI response counters and anomaly alerts qualify for real-time. Everything else is materialized view plus polling. To add a new metric to the real-time category, Priya must approve a written justification recorded in the Decision Log.

---

### Build vs. Reuse

We do not build what already exists in Xperiq. Jordan audits every new component against the existing component library and API surface before implementation begins. If something already exists that covers 80% or more of the need, we extend the existing implementation rather than create a parallel one.

**Exception:** If the existing implementation has a documented performance problem at org-dashboard scale (for example, a component designed for fewer than 10 items that must handle 500 surveys), we build a new specialized version and explicitly document the divergence and the reason in DECISIONS.md.

---

### Scope Additions Mid-Phase

Scope additions mid-phase require Priya's written approval recorded in the Decision Log. "Let's just add this while we're in here" is not a valid process. The ROADMAP.md phase plan is a contract with the rest of the organization. If something important emerges mid-phase, it either goes into the next phase or it displaces a lower-priority item in the current phase with an explicit recorded trade-off.

---

## Team Health Metrics

Measured every two weeks. Priya reports to leadership quarterly.

### Ship Velocity
- **Target:** 100% of phase acceptance criteria shipped by phase end date
- **Measurement:** Count of completed AC items / total AC items per phase
- **Red threshold:** Below 80% triggers a retrospective and scope renegotiation

### Code Quality
- **Target:** Zero P0 or P1 bugs shipped to production from Command Center
- **Measurement:** Production bug count by severity, tracked per phase
- **Leading indicator:** Test coverage for new org-dashboard backend routes above 85%

### Design Fidelity
- **Target:** Fewer than 5% of shipped UI components require a design revision after Marcus's post-ship review
- **Measurement:** Count of "design debt" tickets opened versus total components shipped per phase

### Team Wellbeing
- **Target:** No engineer reports more than 2 unplanned weekend hours per month caused by Command Center
- **Measurement:** Self-reported in the bi-weekly retrospective
- **Red threshold:** Any engineer reports burnout signals — scope is reduced immediately, no exceptions

### Integration Stability
- **Target:** Zero regressions in existing Xperiq survey and insights pages caused by Command Center changes
- **Measurement:** Jordan's integration test pass rate in CI, plus a manual regression check before each phase ships
- **Red threshold:** Any integration test failure blocks the phase from shipping

### Crystal Brief Quality
- **Target:** More than 70% of Crystal's recommended actions are taken by users within 7 days of the brief appearing
- **Measurement:** Action proposal to user action to outcome funnel via existing CrystalOS telemetry
- **Red threshold:** Below 40% action rate triggers a prompt redesign sprint before the next phase begins

---

*This charter is a living document. It is reviewed and updated at the start of each new phase. Priya owns the update. Any team member can propose a change via pull request.*
