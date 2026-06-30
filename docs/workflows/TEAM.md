# Xperiq Actions — Workflow Automation Team

**Feature:** Xperiq Actions (Workflow Automation System)
**Priority:** 2 in build sequence
**Team size:** 9
**Kickoff:** Week 1 (Phase 1 start)

---

## Mission

Build the automation layer that makes Xperiq a system of action, not just a system of record. Every passive insight Xperiq collects must have a path to a triggered response. We are building the first XM platform where a drop in NPS fires before your Monday morning standup.

---

## Team Members

---

### 1. Maya Okonkwo — Product Lead

**Title:** Staff Product Manager, Workflow Automation
**Specialty:** Automation builder products, XM platform triggers, no-code workflow design

**Background:** Maya spent five years at HubSpot as PM for Workflows, shipping the visual sequence builder used by 150,000+ companies. She left to join a Series B CX startup where she redesigned their alerting system from scratch, reducing mean-time-to-respond on critical NPS events from 4.2 days to 38 minutes. She understands deeply that the failure mode of XM platforms isn't bad data — it's data that never reaches the person who can act on it.

**Superpower:** She can map from a real CX manager's Monday morning chaos to the exact workflow configuration that eliminates it, and articulate that in a two-sentence product brief anyone on the team can execute from.

**Mandate:**
- Own the full Xperiq Actions PRD and feature spec
- Define and prioritize trigger types and action types by user pain severity
- Conduct 10 user discovery interviews with CX managers before Phase 2 builder work begins
- Design the pricing model: which features at which tier (Free / Starter / Growth / Enterprise)
- Write Crystal Builder NL prompt corpus (50 test cases across trigger+action combos)
- Sign off on every Phase gate (acceptance criteria review before engineering moves to next phase)
- Own the templates gallery: curate 12 pre-built templates, validated against real user patterns

---

### 2. Rohan Desai — Principal UX Designer

**Title:** Principal Product Designer, Builder Experiences
**Specialty:** No-code/low-code workflow builders, visual programming interfaces, information-dense UIs

**Background:** Rohan designed the visual automation builder at Zapier (2021–2024) where he shipped the multi-step Zap editor used by 6 million users, including the rewrite from a step-list to the current branching canvas. He also consulted on the Figma Auto Layout feature, giving him deep fluency in constraint-based visual systems. He moved to Xperiq to prove that enterprise software could be this joyful.

**Superpower:** He can take a workflow with seven conditions, four action types, and three failure modes, and make it readable at a glance without hiding any information — a skill that is genuinely rare and takes years to develop.

**Mandate:**
- Design all five workflow UI surfaces: list page, visual builder, NL builder, run history, notification center
- Define the component system for trigger/condition/action cards and their configuration panels
- Prototype the animated bezier card connector system for builder canvas
- Design all 12 workflow template cards for the gallery
- Create micro-interaction specs: enable/disable toggle, Crystal fill animation, success pulse, dormant badge
- Produce Figma specs at engineering-handoff quality (auto-layout, variants, annotations) for all surfaces
- Define the empty states for every list and builder state

---

### 3. Priya Krishnamurthy — Backend Architect

**Title:** Principal Engineer, Event-Driven Systems
**Specialty:** Distributed job queues, state machines, event-driven architectures, PostgreSQL at scale

**Background:** Priya spent four years at Stripe as a senior engineer on the Webhooks and Idempotency infrastructure, where she designed the retry/dead-letter system that now processes over a billion delivery attempts per month. Before that, she built the automation execution engine at PagerDuty (incident workflows). She has a pathological obsession with execution auditability — she insists every system action be reconstructible from an immutable log.

**Superpower:** She can spec a distributed state machine that is both simple enough to onboard a junior engineer in 30 minutes and robust enough to handle 100,000 concurrent workflow runs without a single execution lost.

**Mandate:**
- Design and own the full database schema: `workflows`, `workflow_conditions`, `workflow_actions`, `workflow_runs`, `workflow_run_steps`
- Design the BullMQ queue topology: trigger evaluation queue, action execution queue, retry queue, DLQ
- Specify retry logic: exponential backoff constants, max attempts, DLQ routing rules, alerting thresholds
- Define idempotency key strategy across all trigger types
- Own the scheduler tick architecture: 30-second polling loop, efficient diff against last-evaluated state
- Write the backend architecture ADR (Architectural Decision Record)
- Define database indexes for all common query patterns (org workflows, run history, per-survey runs)
- Write migration files for all five Phase 1 tables

---

### 4. Elias Park — Frontend Engineer

**Title:** Senior Engineer, Interactive Builder UIs
**Specialty:** React flow diagrams, drag-and-drop interfaces, real-time state management, canvas-based UIs

**Background:** Elias shipped React Flow-based editors at two companies — a no-code data pipeline builder (Airbyte's visual transformation feature) and a BPMN process modeler at a German enterprise automation startup. He is unusually good at bridging the gap between "it feels right" in design and "it is correct" in state management, having authored a pattern he calls "visual-first state machines" that drives every builder he builds.

**Superpower:** He makes drag-and-drop interactions feel native on the first try — not after three iterations of jank — because he designs the state machine before touching CSS.

**Mandate:**
- Build all React components for the workflow builder: canvas, trigger cards, condition cards, action cards
- Implement animated bezier curve connectors between cards using SVG + Framer Motion
- Build the drag-to-reorder action list with optimistic UI
- Implement the Crystal fill animation (cards animate in one-by-one from NL parse result)
- Build the workflow list page: card grid, status pills, hover quick-actions
- Build the run history timeline component with expandable run detail
- Build the in-app notification center: bell icon, notification cards, unread count badge
- Own integration with all backend API endpoints via typed client hooks

---

### 5. Amara Osei — AI/ML Engineer

**Title:** Staff ML Engineer, Agentic Triggers and NL Interfaces
**Specialty:** LLM-based signal detection, NLP over survey responses, structured output extraction from natural language

**Background:** Amara was an ML engineer at Qualtrics (2020–2023) on the iQ AI team, where she built the "text iQ" sentiment and topic detection pipeline that runs over 2 billion response-text tokens per month. She left because she saw that Qualtrics would never expose these signals as programmable triggers — they were trapped in dashboards. At Xperiq, she can build the connective tissue between what Crystal detects and what the system does about it.

**Superpower:** She can translate a fuzzy product concept like "detect a new emerging negative theme" into a precise LLM evaluation pipeline with clear confidence thresholds, latency budgets, and failure modes — in a single whiteboard session.

**Mandate:**
- Design and implement the three AI trigger types in CrystalOS: `sentiment_spike`, `new_theme_detected`, `anomaly_detected`
- Define confidence thresholds and hysteresis rules for each AI trigger (to prevent false-positive spam)
- Build the Crystal Builder NL parsing pipeline: user description → structured `WorkflowSpec` JSON
- Write the LangGraph subgraph for workflow NL parsing with structured output validation
- Build the confirm-card proposal format for Crystal-created workflows
- Define the CrystalOS `workflow_signal` event type emitted after each insight pipeline run
- Write SKILL.md and EVALS.md for the Workflow Skill (Phase 5)
- Maintain a test corpus of 50 NL→workflow parse cases with expected structured output

---

### 6. David Mensah — Integration Engineer

**Title:** Senior Engineer, Platform Integrations
**Specialty:** Webhooks, third-party API integrations, authentication flows for enterprise tools

**Background:** David spent three years at Zapier on the app integrations team, shipping 40+ app connectors. He then joined Segment where he built the webhook delivery system — including the signed-payload spec that became an informal industry standard. He has delivered integrations for Slack, Zendesk, Jira, Salesforce, HubSpot, and 30+ others and can predict exactly where each one will fail before writing a line of code.

**Superpower:** He knows every OAuth edge case, every Slack block kit quirk, and every Zendesk rate limit by memory — which means integrations he ships never need a hotfix.

**Mandate:**
- Implement all action types: `send_email`, `slack_notification`, `webhook`, `create_jira_ticket`, `create_zendesk_ticket`
- Build the integration credentials vault (encrypted storage of per-org API keys/tokens for third-party services)
- Implement Slack Block Kit message templates with dynamic variable substitution (`{survey_name}`, `{nps_score}`, etc.)
- Build Jira ticket creation with field mapping config (project, issue type, priority, assignee)
- Build Zendesk ticket creation with tag injection and requester mapping
- Implement signed webhook payload (HMAC-SHA256) for `webhook` action type
- Build the integration settings page under org settings for credential management
- Write integration test suite covering auth failure, rate limit, and payload validation paths

---

### 7. Kenji Watanabe — QA/Reliability Engineer

**Title:** Staff Engineer, Workflow Reliability and Testing
**Specialty:** Distributed system testing, queue reliability, dead-letter queues, chaos engineering

**Background:** Kenji was a site reliability engineer at Twilio, where he owned reliability for the task queue that powers SMS delivery — a system that cannot lose a message. He then moved to a Series C HR automation startup where he built the QA framework for their workflow engine from scratch, including a chaos testing harness that deliberately introduces Redis failures, third-party timeouts, and duplicate trigger events to verify the system handles each correctly.

**Superpower:** He can describe a workflow run's failure mode in more detail than the engineer who wrote the code — and has a runbook ready for each one before the system ships.

**Mandate:**
- Design and own the retry + dead-letter queue strategy: backoff constants, max retries, DLQ routing, alerting
- Build the workflow test mode: dry-run execution that evaluates conditions and renders "would-fire" action preview without side effects
- Write reliability test suite: duplicate trigger deduplication, partial action failure recovery, concurrent execution safety
- Define monitoring dashboards (Grafana): queue depth, execution latency p50/p95/p99, DLQ depth, action error rate by type
- Write runbooks for all known failure modes: third-party timeout, Redis outage, Postgres write failure
- Own the workflow execution SLO: 99.5% of workflow runs complete within 30 seconds of trigger event
- Define alerting rules for DLQ depth > 10, execution latency p95 > 10s, action error rate > 5%

---

### 8. Simone Dufour — Marketing Lead

**Title:** Senior Product Marketing Manager, Automation and AI Features
**Specialty:** Developer-adjacent product marketing, "zero dead data" narrative, competitive displacement campaigns

**Background:** Simone led product marketing at Intercom for their "Series" automation feature (2019–2022), writing the positioning that displaced Marketo for a segment of mid-market SaaS companies. She later ran GTM for a CX automation startup where she coined the phrase "your data shouldn't just sit there" — a line that is now used by two competitors who hired from her former team. She understands intimately that buying decisions in the XM space hinge on one question: "Can this replace a manual process my team currently owns?"

**Superpower:** She can compress any feature's value proposition into seven words that a VP of CX will tattoo on their whiteboard — and she does it by starting with the customer's pain, not the feature's functionality.

**Mandate:**
- Write and own the "Xperiq Actions" positioning document (one-pager, competitive matrix, objection handling)
- Write the "zero dead data" narrative and all launch copy: headline, subhead, three supporting bullets
- Produce the competitive teardown: Qualtrics action planning vs. Medallia alert rules vs. Xperiq Actions
- Plan and execute the ProductHunt launch for Xperiq Actions (title, tagline, thumbnail, video description, comment strategy)
- Write "5 automations every CX team should have running" blog post (800 words, real use cases, template links)
- Manage Slack/Zendesk/Jira integration partner listings and co-marketing collateral
- Script and oversee production of the 90-second demo video (NPS drop → Slack → Jira → Crystal analysis, fully automated)

---

### 9. Nina Reeves — Xperiq Platform Expert

**Title:** Senior Engineer, Platform Integration and Architectural Integrity
**Specialty:** Full-stack integration across all Xperiq layers, Crystal AI contracts, data model continuity

**Background:** Nina is one of the founding engineers of Xperiq's backend and CrystalOS layers. She wrote the original insight pipeline, the `agentsClient` typed connector between backend and CrystalOS, and the DataBus invalidation pattern. She is the single person who knows where every seam is between the survey data model, the backend API, and the CrystalOS skill runtime — and she guards those seams against inconsistency.

**Superpower:** She can read a new feature spec and immediately identify the three places it will break the existing architecture — and propose a fix for each before the planning meeting ends.

**Mandate:**
- Review all workflow API designs for consistency with existing backend patterns (auth middleware, org scoping, soft-delete conventions)
- Own integration between workflow triggers and the survey data model (e.g., `response_submitted` trigger hookpoint, `nps_threshold` derived from response aggregates)
- Define the `workflow_signal` contract between CrystalOS insight pipeline output and the backend trigger evaluator
- Ensure DataBus invalidation is wired after all workflow mutations (list page, run history)
- Guard the Crystal confirm-card contract: workflow proposals from Crystal must conform to the existing `action_proposals` proposal type format
- Review all new env vars for correct placement in `.env.example` and `docs/ENV_VARS.md`
- Act as integration owner for Phase 3 (AI triggers) — sign off before CrystalOS → backend seam ships
- Own the MCP skill contract for the Workflow Skill (Phase 5)

---

## Team Rituals

### Weekly Sync — Monday 10:00 AM (60 min)
Owner: Maya (Product Lead)
Attendees: Full team
Agenda:
1. Prior week shipping review: what shipped, what's blocked, what's in DLQ (10 min)
2. Phase gate check: acceptance criteria review for current phase (15 min)
3. Design review: Rohan presents latest builder iteration, team gives structured feedback (15 min)
4. Architecture/integration flags: Nina and Priya surface any cross-layer risks (10 min)
5. Next week commitments: each person states one ship-it by Friday (10 min)

### Design Review — Wednesday 2:00 PM (45 min)
Owner: Rohan (UX Designer)
Attendees: Maya, Elias, Nina, +1 rotating (Priya or Amara)
Format: Figma walkthrough → structured critique → explicit sign-off or revision list
Gate: No component moves to engineering until Rohan marks it "handoff ready" in Figma

### AI Trigger Sync — Thursday 3:00 PM (30 min, Phases 3 onward)
Owner: Amara (AI/ML)
Attendees: Nina, Priya, Maya
Purpose: Review CrystalOS trigger evaluation results from the prior week's data, tune thresholds, catch false positives before they reach production

### Weekly Reliability Review — Friday 4:00 PM (30 min)
Owner: Kenji (QA/Reliability)
Attendees: Priya, David, Nina
Purpose: Review Grafana dashboard: queue depth trend, DLQ items, action error rate by integration. Any DLQ item that survived more than 24 hours gets a named owner and a root cause.

---

## Decision Framework

**Speed decisions (any individual can make unilaterally):**
- Variable naming, file structure, minor UI copy
- Retry constant tuning (within defined bounds)
- Test case additions

**Team decisions (requires Maya + the relevant engineer):**
- New trigger or action type added to a phase
- Threshold defaults (e.g., NPS < 30 as the default warning level)
- Integration credential storage approach

**Architecture decisions (requires Priya + Nina sign-off):**
- New queue topology change
- Any change to the `workflow_signal` contract between CrystalOS and backend
- Schema changes after Phase 1 migration is cut

**Product decisions (requires Maya + leadership sign-off):**
- Pricing tier assignment for a feature
- Template gallery content
- Feature naming (user-facing brand names like "Crystal Signals")

**Escalation path:** Individual → Maya → Nina (for platform issues) → Engineering leadership. Escalation must carry a written recommendation, not just a problem statement.

---

## Success Metrics

### Phase 1 (Engine)
- All five DB tables migrated and tested locally
- Bull queue processes 100 concurrent workflow trigger evaluations in < 5 seconds
- Zero failed test runs for threshold triggers across 20 test cases

### Phase 2 (Builder)
- 90% of users in usability test can create a complete NPS threshold → Slack workflow in < 3 minutes without assistance
- Workflow builder Lighthouse performance score >= 85 on first paint
- Zero console errors in the builder during a complete workflow create → enable → view-run cycle

### Phase 3 (AI Triggers)
- `sentiment_spike` trigger fires with >= 90% precision on the 50-case Crystal signal test corpus
- Crystal Builder correctly parses >= 44 of 50 NL test cases to a valid `WorkflowSpec` structure
- End-to-end latency from CrystalOS insight pipeline completion to workflow action execution < 45 seconds

### Phase 4 (Integrations)
- Slack delivery success rate >= 99.5% across 1,000 test runs
- Jira ticket creation works for all three Jira Cloud authentication methods (API token, OAuth 2.0, service account)
- Test mode dry run completes in < 3 seconds for any workflow with up to 5 actions

### Launch (GA)
- 100 organizations with at least 1 active workflow in first 30 days post-launch
- Median time to first workflow creation < 10 minutes from org signup
- Action email open rate >= 35% (benchmark: legacy XM alert emails average 12%)
- Zero P1 incidents (missed workflow execution) in first 30 days

---

## Anti-Goals

We will NOT build in Phase 1-5:
- Branching logic (if action A fails, do action B) — that is Phase 6
- Multi-survey workflow triggers (trigger fires when Survey A AND Survey B both hit a threshold) — Phase 6
- Custom action code execution (user-provided JavaScript) — never in Growth tier
- Real-time response-by-response evaluation for NPS threshold (we evaluate on rolling window, not per-response for performance reasons)
- Workflow marketplace (sharing workflows across orgs) — post-launch

These are documented here so the team does not gold-plate Phase 1-5 toward them.
