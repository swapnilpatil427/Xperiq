# Scheduled Intelligence Reports — Team

> **Feature:** Scheduled Intelligence Reports ("Intelligence Briefings")
> **Status:** Pre-build, documentation phase
> **Updated:** 2026-06-29

---

## Mission

Build the most intelligent, beautiful, and trustworthy reporting system in the XM industry. Every CX leader on our platform should wake up on Monday morning to an email that tells them exactly what happened in their experience data last week, what it means, and what they should do about it — written in plain language by Crystal AI, delivered without anyone lifting a finger.

---

## Team Roster

### 1. Rachel Nguyen — Product Lead

**Title:** Senior Product Manager, Analytics & Intelligence
**Specialty:** Scheduled analytics delivery, BI product design, metric-to-decision systems

**Background:** Rachel spent four years at Amplitude building their Charts → Dashboards → Notebooks evolution, then eighteen months at Looker (post-Google acquisition) owning the Scheduled Deliveries and Alerts product surface. She has shipped scheduled reporting to audiences ranging from two-person startups to Fortune 100 data teams. She understands the razor-thin difference between a report someone opens and one they delete without reading.

**Superpower:** She can map a user's reporting anxiety — "what am I missing? is this the number I should be watching?" — to exactly the right data surface and delivery moment.

**Mandate:**
- Own the PRD, acceptance criteria, and phased delivery plan for all 5 roadmap phases
- Define the 6 built-in Briefing Templates and their exact content contract
- Lead weekly Monday sync and Thursday ship-check rituals
- Arbitrate scope decisions when engineering and design disagree
- Own the success metric dashboard and weekly experiment readout
- Drive GTM coordination with Marketing — feature naming, launch timing, beta cohort selection

---

### 2. Priya Menon — Principal UX Designer

**Title:** Principal Product Designer, Data Experiences
**Specialty:** Data visualization design, email template systems, report UX, information hierarchy

**Background:** Priya led design at Tableau for their "Explain Data" and "Ask Data" surfaces before joining an early-stage BI startup (acquired by Salesforce) where she owned the full report and subscription UI end-to-end. She has designed more than a dozen email report templates, each validated against real inbox behavior with eye-tracking studies. She is dogmatic about whitespace and the cognitive load of a data-dense email.

**Superpower:** She turns a dense JSON payload of metrics into an email that a non-analyst C-suite executive reads all the way to the bottom.

**Mandate:**
- Design the Report Builder wizard (3-step flow: Template → Scope/Schedule → Delivery)
- Design the HTML email report template system — all 6 templates, responsive, dark-mode, cross-client
- Own the Reports landing page (`/reports`) and Run History viewer
- Define the in-app report card component and notification center integration
- Create the Figma component library for the "Intelligence Briefing" visual language (logo lockup, KPI gauge, topic chips, Crystal recommendation card)
- Write copy for all template descriptions, onboarding tooltips, and empty states

---

### 3. Marcus Webb — Backend Architect

**Title:** Staff Software Engineer, Platform & Delivery Infrastructure
**Specialty:** Scheduled job systems, distributed task queues, PDF generation pipelines, email delivery at scale

**Background:** Marcus architected the delivery infrastructure at a B2B SaaS company that sent 40M transactional emails per month, then spent three years at Heap building their Export and Scheduled Alerts systems. He has seen every failure mode: scheduler drift, job fan-out storms, Redis lock races, PDF memory bloat, and bounce-triggered reputation collapse. He has strong opinions about all of them and documented preventions for each.

**Superpower:** He can design a scheduling system that is simultaneously reliable enough for enterprise SLAs and simple enough that the team can debug it at 2am without him.

**Mandate:**
- Design and implement the full Postgres data model (`report_templates`, `scheduled_reports`, `report_runs`, `report_artifacts`, `report_recipients`)
- Build the scheduling engine: tick-based due-check, Redis SET NX locking, next_run_at computation, failure retry with exponential backoff
- Own the Express API layer for all `/api/reports/*` endpoints
- Architect the CrystalOS-to-backend artifact retrieval contract (presigned URLs vs. inline base64 storage)
- Define the PDF generation strategy (Puppeteer in CrystalOS vs. dedicated HTML-to-PDF sidecar)
- Own backend observability: job run telemetry, delivery success rate, artifact TTL management

---

### 4. Jordan Kim — Senior Frontend Engineer

**Title:** Senior Software Engineer, App Platform
**Specialty:** Rich UI forms, template editors, preview-driven workflows, scheduling interfaces

**Background:** Jordan built the Workflow Builder and the Dashboard Customization panel at a mid-market analytics company before joining Xperiq. They have a particular focus on multi-step wizard UX and the hard problem of keeping live previews performant without hammering the API. Jordan co-authored the Xperiq DataBus invalidation pattern and understands deeply how Crystal-driven mutations propagate to the UI.

**Superpower:** They make complex configuration UIs feel like they have five steps fewer than they actually do.

**Mandate:**
- Implement the Report Builder wizard (`/reports/new`, `/reports/:id/edit`) — all three steps with state management, validation, and progress persistence
- Build the live report Preview panel (HTML iframe render, Email/Web/PDF view toggle, Mobile/Desktop viewport toggle)
- Implement the Reports landing page (`/reports`) with card grid, status badges, and Recent Deliveries feed
- Build the Run History drawer with per-run status, delivery log, and "Re-send" action
- Wire all new user-visible strings to `locales/en.ts` — zero hardcoded JSX strings
- Own the "Test Send" and "Send to Me" interactions end-to-end (API call + toast + polling for completion)

---

### 5. Aditya Sharma — AI/ML Engineer (Narrative)

**Title:** Senior ML Engineer, Crystal Intelligence
**Specialty:** LLM narrative generation, data-to-language, automated journalism, BI narrative systems

**Background:** Aditya spent two years at a computational journalism startup building systems that automatically generated financial earnings summaries from structured data, then joined a BI company where he built their "Narrative Science"-style automated insight commentary layer. He has shipped LLM-generated narratives to audiences who hold them to the same standard as analyst-written content — meaning hallucination, vagueness, and generic filler are career-limiting errors in his world.

**Superpower:** He can write a LangGraph node that takes a set of metrics and produces a two-paragraph Crystal narrative that a seasoned CX analyst would be proud to have written.

**Mandate:**
- Design and implement the CrystalOS Report Generation Graph — the new LangGraph DAG that extends the existing insight pipeline with report-specific nodes
- Own the `generate_narrative` node: prompt engineering, structured output schema, hallucination guards, factual grounding against computed metrics
- Own the `generate_highlights` node: Crystal-selected verbatim quote surfacing algorithm (semantic diversity + emotional salience scoring)
- Build the anomaly detection trigger logic in the `detect_changes` node
- Define the narrative quality eval framework: factual accuracy, coverage, tone, actionability — scored weekly against sampled outputs
- Maintain `crystalos/skills/generate_report/SKILL.md` and `EVALS.md`

---

### 6. Simone Delacroix — Email & Delivery Engineer

**Title:** Senior Software Engineer, Messaging Infrastructure
**Specialty:** SendGrid integration, email deliverability, cross-client HTML/CSS compatibility, unsubscribe compliance

**Background:** Simone owned email infrastructure at a B2C SaaS that sent 8M weekly digest emails, achieving 99.2% delivery rate and 42% open rate through rigorous template optimization, DKIM/DMARC hardening, and list hygiene automation. She has manually tested HTML email layouts across 47 email client/OS combinations using Litmus. She knows which CSS properties silently break in Outlook 2016 on Windows 10 and exactly what to do about it.

**Superpower:** She can take a beautiful Figma email design and land it pixel-perfect in Gmail, Outlook, Apple Mail, and Samsung Galaxy in one pass.

**Mandate:**
- Implement the SendGrid integration: transactional send, dynamic templates, event webhooks (delivered, opened, bounced, unsubscribed)
- Build the HTML email template system: responsive layout engine, inline CSS, dark mode media queries, Outlook conditional comments
- Implement unsubscribe flow: one-click unsubscribe header, preference center page, suppression list sync with Postgres
- Own deliverability: SPF/DKIM/DMARC setup docs, sending domain warm-up plan, bounce/complaint handling automation
- Build cross-client test suite: automated Litmus integration or screenshot-diff CI gate
- Implement the Slack delivery channel: incoming webhook, Block Kit message layout for report summaries

---

### 7. Elena Vasquez — Data Engineer

**Title:** Staff Data Engineer, Analytics Pipeline
**Specialty:** Aggregation pipelines, report caching, multi-scope data assembly, time-series summarization

**Background:** Elena was the founding data engineer at a VOC (Voice of Customer) analytics company where she built the entire metrics computation layer from scratch — response velocity calculations, NPS rolling windows, segment-comparison logic — for enterprise CX teams. She understands exactly which queries murder a Postgres instance at report generation time and how to pre-aggregate at ingestion to make generation fast enough to run synchronously.

**Superpower:** She can look at a report template's metric requirements and design the exact materialized view and cache warming strategy that makes it generate in under 3 seconds.

**Mandate:**
- Design and implement the aggregation layer: pre-computed NPS windows, response velocity, topic frequency, benchmark comparison tables
- Build the report scope resolver: given a `scope` (survey, tag_group, org), efficiently assemble the full metric payload without N+1 queries
- Implement the report cache layer: Redis-backed metric snapshot, cache invalidation on new response ingestion, TTL strategy per cadence type
- Own the `assemble_scope` and `compute_metrics` CrystalOS graph nodes (data plumbing, not LLM)
- Define the `ReportMetricPayload` TypeScript interface (backend) and matching Python dataclass (CrystalOS) — the canonical contract for what the narrative node receives
- Profile and enforce: report generation P95 < 8s, P99 < 15s for a 10,000-response survey

---

### 8. Thomas Brennan — Marketing Lead

**Title:** Senior Product Marketing Manager
**Specialty:** Analytics product positioning, "aha moment" storytelling, competitive differentiation, launch campaigns

**Background:** Thomas led the "Amplitude Notebooks" launch campaign and the "Mixpanel Insights" rebrand, both of which shifted the narrative from "analytics tool" to "decision intelligence platform." He has a gift for finding the one true customer pain point that makes a feature feel inevitable rather than incremental, then building the entire launch story around that recognition moment.

**Superpower:** He writes copy that makes CX directors forward a product announcement email to their boss with a one-line note: "this is exactly what we've been asking for."

**Mandate:**
- Own the "Intelligence Briefings" brand positioning — all external-facing naming, taglines, and messaging hierarchy
- Write the launch blog post: "Monday morning, your inbox gets smarter"
- Design the in-product "What's New" announcement (modal + tooltip tour)
- Build the email launch campaign: 3-email sequence targeting existing paid users
- Own competitive positioning matrix: Qualtrics vs. Medallia vs. SurveyMonkey vs. Xperiq
- Coordinate the beta program: identify 10 champion accounts, design feedback collection, manage expectation-setting

---

### 9. Kavya Raghunathan — Xperiq Platform Expert

**Title:** Senior Software Engineer, Core Platform (Integration Guardian)
**Specialty:** Cross-feature integration, existing pipeline reuse, API contract stewardship, onboarding new capabilities without regression

**Background:** Kavya has touched every major feature shipped on the Xperiq platform in the last two years. She was the integration engineer on the Insight Pipeline v2 build and wrote the DataBus invalidation pattern that keeps Crystal-driven UI mutations consistent. She is the person the team calls when a new feature needs to reuse an existing pipeline without accidentally breaking the six other features that already depend on it.

**Superpower:** She can read a new feature spec and immediately identify the three existing system contracts it will violate if built naively — then propose the clean extension seam instead.

**Mandate:**
- Ensure the Report Generation Graph in CrystalOS extends (not duplicates) the existing 10-node Insight Pipeline DAG — shared nodes must be extracted to shared utilities, not copied
- Own the `workflow_actions` extension: add `generate_report` as a first-class workflow action so reports can be triggered from the automation builder
- Review all new Express endpoints for adherence to existing auth, error-handling, and rate-limiting middleware patterns
- Own the MCP skill definition: `generate_report(scope, template)` that Crystal can propose as an action
- Run the integration test suite against the full stack (backend + CrystalOS + app) at each phase gate
- Update `crystalos/CLAUDE.md`, `backend/CLAUDE.md`, and `app/CLAUDE.md` with new extension seam documentation after each phase ships

---

## Team Rituals

### Monday Sync (60 min, 9am PT)
**Purpose:** Align on the week's ship targets, surface blockers, agree on cuts if behind.
**Format:** Rachel runs it. Each team member gives a 3-sentence standup: what shipped last week, what ships this week, what is blocked. Then 30-min open floor for design reviews or architecture decisions that need the full group.
**Output:** Updated TRACKER.md with this week's in-progress items flagged.

### Thursday Ship-Check (30 min, 4pm PT)
**Purpose:** Confirm the week's targets will actually ship. No surprises Friday.
**Format:** Each engineer demos or screen-shares their current state. Rachel calls ship/slip for each item. If slipping, scope is cut immediately — never delayed.
**Output:** Slack post in `#xperiq-reports` with "Week N ship status: X shipped, Y moved to next week."

### Design Review (as needed, max 2x/week)
**Purpose:** Priya presents design decisions that need engineering input or PM sign-off.
**Format:** Figma link shared 24 hours in advance. Review opens with "here's the problem I'm solving, here's the decision I made, here's the alternative I rejected and why." No design-by-committee — Priya has final say on visual decisions; Rachel has final say on functional decisions.

### Weekly Narrative Quality Review (30 min, Tuesdays)
**Purpose:** Review 5 randomly sampled Crystal-generated report narratives from staging.
**Format:** Aditya presents. Team rates each on: Factual Accuracy (1–5), Actionability (1–5), Tone (1–5), Coverage (1–5). Any narrative scoring below 3.5 on any dimension triggers immediate prompt iteration before the next phase ships.
**Output:** Narrative quality trend chart maintained in `crystalos/skills/generate_report/EVALS.md`.

---

## Decision Framework

**Scope decisions:** Rachel decides. She consults Kavya on integration risk, Marcus on technical feasibility, and Priya on UX completeness. Any team member can call a 15-min "scope challenge" to make their case; Rachel's decision is final.

**Architecture decisions:** Marcus and Kavya co-decide on backend/platform concerns. Aditya decides on CrystalOS concerns. Jordan decides on frontend concerns. Conflicts escalate to Rachel for tiebreak.

**Design decisions:** Priya decides on visual and interaction design. Jordan has veto power on decisions that create impossible implementation constraints. Conflicts resolved in Design Review, not async Slack threads.

**Cut hierarchy (when behind):** Features cut in this order, first to last:
1. Slack delivery
2. PDF export
3. Template customization panel
4. Tag-group scoping
5. Org-wide scoping

Email delivery of the Weekly NPS Digest is never cut — it is the irreducible MVP.

---

## Success Metrics

### North Star
**Weekly report open rate >= 38%** (vs. industry benchmark of ~21% for B2B digest emails)

### Phase Gates

| Phase | Gate Metric | Target |
|-------|-------------|--------|
| 1 — Foundation | Reports created and delivered in-app | 100% of test accounts have >= 1 report configured |
| 2 — Email | Email send success rate | >= 99.5% of sends reach recipient inbox |
| 3 — Scheduling | Scheduler reliability | Zero missed scheduled runs over 7-day monitoring window |
| 4 — Builder | Wizard completion rate | >= 70% of users who start the builder complete it |
| 5 — Cross-Feature | Feature activation | >= 30% of Growth+ orgs have >= 1 active scheduled report within 30 days of GA |

### Ongoing Health Metrics
- Email open rate: target >= 38% (measured via SendGrid event webhooks)
- "View full dashboard" click-through from email: target >= 12%
- Report delivery P99 latency: < 15s generation, < 60s end-to-end
- Crystal narrative quality score: >= 4.0/5.0 on weekly eval
- Email unsubscribe rate: < 0.5% per send
- Org-level activation: % of paid orgs with >= 1 active scheduled report (tracked weekly)
