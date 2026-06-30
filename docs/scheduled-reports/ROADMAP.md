# Scheduled Intelligence Reports — Delivery Roadmap

> **Feature:** Scheduled Intelligence Reports ("Intelligence Briefings")
> **Roadmap owner:** Rachel Nguyen
> **Updated:** 2026-06-29

---

## Overview

Five phases, seven weeks. Each phase ships a vertical slice: backend, CrystalOS, and frontend all land together so the feature is always in a working state. No phase ends with an in-progress seam.

The irreducible MVP is Phase 2 complete: a user can create a Weekly NPS Digest, trigger it manually, and receive a Crystal-written email. Everything after Phase 2 makes it better, more automated, or more configurable.

```
Phase 1 — Foundation (Wk 1–2)   Schema + CrystalOS graph skeleton + in-app delivery
Phase 2 — Email Delivery (Wk 3) SendGrid + HTML email template + test send
Phase 3 — Scheduling (Wk 4)     Scheduler integration + all 6 templates + reports list
Phase 4 — Full Builder (Wk 5–6) Report Builder wizard + PDF + Slack + run history
Phase 5 — Cross-Feature (Wk 7)  Tag/org scoping + workflow action + MCP skill
```

---

## Phase 1 — Foundation (Weeks 1–2)

### Goal
The data model exists. A report can be created via API. A report can be run manually. Crystal generates the report narrative. The output is delivered in-app only.

### What ships
- Postgres migrations for all 5 tables
- Seeded built-in templates (Weekly NPS Digest only at this stage)
- CrystalOS Report Generation Graph: first 5 nodes (`assemble_scope`, `compute_metrics`, `run_topics`, `detect_changes`, `generate_narrative`)
- Express API: `POST /api/reports`, `POST /api/reports/:id/run-now`, `GET /api/reports/:id/runs/:runId`
- In-app delivery: notification record written to the notification center on run completion
- `report_artifacts` row written with `html_content = null` (in Phase 1 we store only `narrative_text`, `highlights`, `recommendations`, `metric_payload`)

### Files to create

**Migrations** (`supabase/migrations/`):
- `20260701000001_create_report_tables.sql` — all 5 CREATE TABLE statements from ARCHITECTURE.md
- `20260701000002_seed_report_templates.sql` — INSERT rows for all 6 built-in templates (can seed all 6 now even if only Weekly NPS Digest is wired in CrystalOS)

**Backend** (`backend/src/`):
- `routes/reports.ts` — Express router for all `/api/reports/*` routes
- `db/reports.ts` — typed Postgres query functions for reports CRUD
- `db/reportRuns.ts` — query functions for run lifecycle (create, update status, fetch)
- `db/reportArtifacts.ts` — query functions for artifact write/read
- `db/reportRecipients.ts` — query functions for recipient management
- `services/reportScheduler.ts` — `enqueueReportRun(reportId, runId)` function that calls CrystalOS
- `types/reports.ts` — TypeScript types: `ScheduledReport`, `ReportRun`, `ReportArtifact`, `ReportRecipient`, `ReportTemplate`, `ReportMetricPayload`

**CrystalOS** (`crystalos/`):
- `graphs/report_generation.py` — LangGraph `StateGraph` with all 11 nodes defined (Phases 1–5 fill them in progressively); Phase 1 implements: `assemble_scope`, `compute_metrics`, `run_topics`, `detect_changes`, `generate_narrative`
- `graphs/report_state.py` — `ReportGenerationState` TypedDict
- `skills/generate_report/SKILL.md` — skill definition
- `skills/generate_report/EVALS.md` — eval template (to be filled as narratives are generated)
- `prompts/report_narrative/weekly_nps_digest.py` — prompt template for the first template
- `shared/metrics.py` — extracted shared metric computation utilities (NPS calculation, topic frequency aggregation) — extracted from the existing insight pipeline, not copied

**Frontend** (`app/src/`):
- `pages/reports/index.tsx` — minimal reports page (empty state + "Create Report" button stub; no card grid yet, that's Phase 3)
- `lib/api/reports.ts` — typed API client functions for the reports endpoints

**Locales** (`locales/en.ts`):
- Add all new user-visible strings under a `reports:` namespace

### Acceptance criteria
- `POST /api/reports` with `templateId`, `scopeType: 'survey'`, `scopeId`, `cadence: 'weekly'`, `timezone` returns 201 with a valid `scheduled_report` row in Postgres
- `POST /api/reports/:id/run-now` enqueues a CrystalOS run and returns `{ runId }`
- `GET /api/reports/:id/runs/:runId` returns the run status; polls to `success` within 30 seconds against a test org with < 100 responses
- On run success: `report_runs.status = 'success'`, `report_artifacts` row exists with `narrative_text` populated, notification record exists in the notification center for the triggering user
- Crystal narrative is factually grounded: every number mentioned in the narrative appears in the `metric_payload`
- Zero hardcoded strings in JSX (all in `locales/en.ts`)

---

## Phase 2 — Email Delivery (Week 3)

### Goal
The report's HTML is rendered. The email is beautiful. A user can trigger a run and receive it in their actual email inbox. They can send a test report to themselves.

### What ships
- HTML email template system (Jinja2 base template + section partials)
- `render_html` node in CrystalOS Report Generation Graph
- SendGrid integration in the backend
- `deliver` node in CrystalOS (email delivery only at this stage)
- In-app preview: `GET /api/reports/:id/runs/:runId/preview` returns `html`
- "Send to me" button on the report preview page (frontend)
- Test send: `POST /api/reports/:id/run-now` with `test=true` delivers only to the triggering user

### Files to create / modify

**CrystalOS** (`crystalos/`):
- `templates/email/base.html.j2` — responsive email HTML base template implementing the full layout spec from DESIGN.md (header, Crystal summary card, KPI row, sections, footer, unsubscribe link)
- `templates/email/sections/kpi_row.html.j2`
- `templates/email/sections/narrative.html.j2`
- `templates/email/sections/topic_list.html.j2`
- `templates/email/sections/quote_block.html.j2`
- `templates/email/sections/recommendation.html.j2`
- `templates/email/sections/alert_header.html.j2`
- `graphs/report_generation.py` — add `render_html` node, update `deliver` node with email delivery via backend API call
- `shared/email_renderer.py` — HTML rendering utility using Jinja2 + premailer CSS inliner

**Backend** (`backend/src/`):
- `services/emailDelivery.ts` — SendGrid client wrapper: `sendReportEmail(artifact, recipient)` function
- `routes/reports.ts` — add preview endpoint; add `test` param handling on run-now
- Update `.env.example` and `docs/ENV_VARS.md` with: `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`, `SENDGRID_FROM_NAME`

**Frontend** (`app/src/`):
- `pages/reports/[id].tsx` — report detail page with preview iframe, "Send to me" button, and run history link
- Add `reports.preview.sendToMe`, `reports.preview.generating` strings to `locales/en.ts`

### Environment variables added (must appear in `.env.example` AND `docs/ENV_VARS.md`):
- `SENDGRID_API_KEY` — SendGrid API key for transactional email delivery
- `SENDGRID_FROM_EMAIL` — Verified sending email address (e.g. `briefings@xperiq.com`)
- `SENDGRID_FROM_NAME` — Display name for sender (e.g. `Xperiq Intelligence`)

### Acceptance criteria
- Triggering a run on a real org's survey produces a complete HTML artifact
- HTML passes inline CSS validation (no external stylesheets)
- Email renders correctly in: Gmail (web), Gmail (mobile), Apple Mail (macOS), Outlook 2021 (Windows)
- Email includes `List-Unsubscribe` headers
- "Send to me" delivers to the current user's Clerk email within 60 seconds
- Preview iframe renders the full HTML report in the in-app detail page
- All Jinja2 templates handle missing/null metric values gracefully (no Python exceptions on sparse data)

---

## Phase 3 — Scheduling (Week 4)

### Goal
Reports run automatically on their configured schedule. The scheduler tick is wired. All 6 built-in templates are fully implemented in CrystalOS. The Reports list page is live.

### What ships
- Scheduler tick integration in CrystalOS: `report_scheduler.py` activated on the existing scheduler loop
- `next_run_at` computation on report creation and after each run
- Redis SET NX locking per run (prevents double-execution on multi-instance deployments)
- All 6 prompt templates in `crystalos/prompts/report_narrative/`
- All 6 template sections wired in the CrystalOS graph (anomaly alert trigger logic, closeout event trigger)
- Reports list page at `/reports` (card grid with status badges, Recent Deliveries feed)
- Backend event listener for survey `status -> closed` triggers `survey_closeout` report if one is configured

### Files to create / modify

**CrystalOS** (`crystalos/`):
- `scheduler/report_scheduler.py` — full scheduler tick implementation (from ARCHITECTURE.md Scheduling Engine section)
- `prompts/report_narrative/monthly_executive_summary.py`
- `prompts/report_narrative/survey_closeout.py`
- `prompts/report_narrative/tag_group_weekly.py`
- `prompts/report_narrative/anomaly_alert.py`
- `prompts/report_narrative/qbr_pack.py`
- `graphs/report_generation.py` — add `generate_highlights` node (was stub in Phase 1); wire all 6 template section renderers

**Backend** (`backend/src/`):
- `services/reportScheduler.ts` — `computeNextRunAt(cronExpression, timezone)` utility using `node-cron` or direct cron computation
- `routes/surveys.ts` (existing) — add event emission when `survey.status` changes to `closed`; backend calls `enqueueReportRun` for any `scheduled_reports` with `template_slug = 'survey_closeout'` scoped to that survey

**Frontend** (`app/src/`):
- `pages/reports/index.tsx` — replace stub with full card grid: fetches `GET /api/reports`, renders `ReportCard` components, "Recent Deliveries" feed via `GET /api/reports/recent-deliveries` (new endpoint)
- `components/reports/ReportCard.tsx` — card component with status badge, countdown, three-dot menu
- `components/reports/RecentDeliveriesFeed.tsx`
- Add all report list page strings to `locales/en.ts`

**Migrations** (`supabase/migrations/`):
- `20260715000001_add_report_indexes.sql` — any additional indexes identified during Phase 2 performance testing

### Acceptance criteria
- A report with `cadence: 'weekly'` and `next_run_at` set to "2 minutes from now" executes automatically and produces a delivered artifact without manual trigger
- After a run, `next_run_at` is updated to the next occurrence (e.g. +7 days for weekly)
- Redis lock prevents two concurrent runs of the same report when the scheduler ticks twice in quick succession (simulate with a manual test)
- Closing a survey triggers a `survey_closeout` report run for any active closeout reports scoped to that survey (manual test via API)
- All 6 prompt templates produce narratives scoring >= 3.5/5.0 on factual accuracy in the weekly narrative quality review
- Reports list page loads in < 1.5s for an org with 20 active reports

---

## Phase 4 — Full Builder (Weeks 5–6)

### Goal
The full 3-step Report Builder wizard is live. Users can configure any template with any scope, schedule, and recipients entirely through the UI. PDF export works. Slack delivery works. Run history is accessible.

### What ships
- 3-step Report Builder wizard: `/reports/new` and `/reports/:id/edit`
- Live report preview panel (Email/Web views; PDF toggle if enabled)
- PDF generation via Playwright in CrystalOS (`render_pdf` node)
- Slack delivery in CrystalOS `deliver` node
- Run History drawer on the report detail page
- Recipient management: add/remove recipients, "Add me" shortcut, external email support
- Template customization panel (section show/hide, tone selector)
- `GET /api/report-templates` endpoint (returns all built-in templates with section definitions)
- `POST /api/reports/:id/recipients` and `DELETE /api/reports/:id/recipients/:recipientId` endpoints

### Files to create / modify

**Frontend** (`app/src/`):
- `pages/reports/new.tsx` — Report Builder (new report)
- `pages/reports/[id]/edit.tsx` — Report Builder (edit existing)
- `components/reports/builder/StepTemplate.tsx` — Step 1: template selection grid + customization panel
- `components/reports/builder/StepScope.tsx` — Step 2: scope + schedule + timezone
- `components/reports/builder/StepDelivery.tsx` — Step 3: recipients + Slack + webhook + test send
- `components/reports/builder/BuilderHeader.tsx` — step progress indicator
- `components/reports/PreviewPanel.tsx` — preview iframe + view toggle + viewport toggle
- `components/reports/RunHistoryDrawer.tsx` — slide-over run history
- `components/reports/RecipientList.tsx` — recipient management UI
- `hooks/useReportBuilder.ts` — wizard state management (multi-step form with localStorage persistence)
- `hooks/useReportPreview.ts` — preview fetch with debounce and loading state

**Backend** (`backend/src/`):
- `routes/reports.ts` — add `GET /api/report-templates`, `POST/DELETE /api/reports/:id/recipients`, `GET /api/reports/:id/runs` (paginated), `GET /api/reports/:id/runs/:runId/preview`
- `services/pdfDelivery.ts` — optional: if PDF generation is done outside CrystalOS, a PDF render service call; otherwise CrystalOS handles it via `render_pdf` node
- Update `.env.example` and `docs/ENV_VARS.md` with Slack webhook env vars if any org-level default is configured

**CrystalOS** (`crystalos/`):
- `graphs/report_generation.py` — add `render_pdf` node (Playwright-based), update `deliver` node with Slack Block Kit delivery
- `shared/pdf_renderer.py` — Playwright PDF generation utility
- `shared/slack_delivery.py` — Slack incoming webhook delivery utility

**Locales** (`locales/en.ts`):
- All builder wizard copy: step labels, template descriptions, field placeholders, error messages, loading states, success messages
- All run history drawer copy
- All recipient management copy

### Acceptance criteria
- A non-technical user can configure a Weekly NPS Digest for a real survey, set a weekly Monday schedule, add 3 recipients, and activate the report in < 3 minutes without reading documentation
- The builder preserves state if the user navigates away and returns within 24 hours (localStorage persistence)
- Live data preview generates and renders within 15 seconds for a 1,000-response survey
- PDF export produces a printable document that passes a visual check in Preview (macOS) and Chrome print preview
- Slack delivery posts a correctly formatted Block Kit message with report summary and "View full report" link
- Run History drawer shows the last 20 runs with status, trigger type, and duration
- All new strings are in `locales/en.ts`; zero hardcoded English in JSX

---

## Phase 5 — Cross-Feature Integration (Week 7)

### Goal
Intelligence Briefings are first-class citizens of the Xperiq platform. They can be triggered from the workflow automation builder. Crystal can propose a report as an action. Tag-group and org-wide scoping are fully supported.

### What ships
- Tag-group scoped reports: `scope_type = 'tag_group'` fully wired in `assemble_scope` (fetches responses by tag group membership)
- Org-wide scoped reports: `scope_type = 'org'` fully wired in `assemble_scope` (aggregates across all surveys in the org)
- Workflow action: `generate_report` added as a first-class action in the automation builder
- MCP skill: `generate_report(scope, template)` that Crystal can propose as an action
- `crystalos/CLAUDE.md`, `backend/CLAUDE.md`, and `app/CLAUDE.md` updated with new extension seam documentation
- All Phase 1–5 acceptance criteria re-verified in full integration test run

### Files to create / modify

**CrystalOS** (`crystalos/`):
- `graphs/report_generation.py` — finalize `assemble_scope` node: add tag_group and org-wide scope resolution branches (both were stubs in Phase 1)
- `skills/generate_report/SKILL.md` — full skill definition including `generate_report(scope, template)` MCP tool schema
- `skills/generate_report/EVALS.md` — completed eval dataset with >= 10 examples (from beta program and staging runs)
- `mcp/tools/generate_report.py` — MCP tool handler for `generate_report`

**Backend** (`backend/src/`):
- `routes/workflows.ts` (existing) — add `generate_report` to the list of available workflow actions; handler calls `enqueueReportRun` with `triggered_by: 'api'`
- `types/workflowActions.ts` (existing) — add `GenerateReportAction` type

**Frontend** (`app/src/`):
- `components/workflow/actions/GenerateReportAction.tsx` — action configuration card in the workflow builder: report selector (picks from existing scheduled_reports) or "Create new report" inline shortcut
- Update workflow action registry to include `generate_report`

**Documentation**:
- `crystalos/CLAUDE.md` — add section: "Report Generation Graph: extends insight pipeline; see docs/scheduled-reports/ARCHITECTURE.md"
- `backend/CLAUDE.md` — add section: "Reports API: /api/reports/* — see docs/scheduled-reports/ARCHITECTURE.md"
- `app/CLAUDE.md` — add section: "Intelligence Briefings: /reports/* — Report Builder wizard, preview, run history"

### Tag-group scope implementation detail

`assemble_scope` for `scope_type = 'tag_group'`:
```python
# Fetch all survey_ids that have the tag group applied
survey_ids = await db.fetch(
    "SELECT survey_id FROM survey_tag_groups WHERE tag_group_id = $1",
    scope_id
)
# Then fetch responses for those survey_ids within the time range
# (same query as single-survey scope, but with survey_id IN (...))
```

Tag-group Weekly template's `comparison` section requires the org-wide metric payload too — `assemble_scope` fetches org-wide metrics in a second pass and adds them as `comparison_metrics` in the state.

### Org-wide scope implementation detail

`assemble_scope` for `scope_type = 'org'`:
- Fetches all active survey_ids for the org
- Aggregates response data across all surveys
- NPS is computed as a single weighted NPS across all responses (not an average of per-survey NPS scores)
- Topic extraction runs on the combined corpus — topics that appear across multiple surveys are ranked higher
- The `Monthly Executive Summary` and `QBR Pack` templates are the primary consumers of org-wide scope

### Workflow action `generate_report`

```typescript
// Workflow action definition (backend/src/types/workflowActions.ts)
interface GenerateReportAction {
  type: 'generate_report';
  config: {
    scheduledReportId: string;  // reference to an existing scheduled_report
    // OR inline config for one-shot generation:
    templateSlug?: string;
    scopeType?: 'survey' | 'tag_group' | 'org';
    scopeId?: string;
  };
}
```

When a workflow fires the `generate_report` action, the backend calls `POST /api/reports/:id/run-now` with `triggered_by: 'api'`. If the workflow uses inline config (no existing report ID), the backend creates an ephemeral `scheduled_reports` row with `enabled = false` (run-once, no scheduling), runs it, then deletes it on completion.

### MCP skill `generate_report`

```python
# crystalos/mcp/tools/generate_report.py

@mcp_tool(name="generate_report")
async def generate_report(
    scope: Annotated[str, "Scope string: 'survey:{id}', 'tag_group:{id}', or 'org'"],
    template: Annotated[str, "Template slug: 'weekly_nps_digest', 'monthly_executive_summary', etc."],
    deliver_to: Annotated[Optional[str], "Email address to deliver to. Defaults to triggering user."] = None
) -> ActionProposal:
    """
    Generates an Intelligence Briefing using Crystal for the given scope and template.
    Returns an action_proposal that the frontend will render as a confirm-card.
    The user must confirm before the report is generated and delivered.
    """
    return ActionProposal(
        type="generate_report",
        title=f"Generate {template_name} for {scope_label}",
        description="Crystal will generate a full Intelligence Briefing and deliver it to your inbox.",
        metadata={ "scope": scope, "template": template, "deliver_to": deliver_to }
    )
```

The MCP skill follows the CrystalOS proposal pattern: it returns a proposal, not a mutation. The frontend renders a confirm-card, the user confirms, and the backend executes the run. This maintains the "CrystalOS proposes, app executes" architectural invariant.

### Acceptance criteria
- Tag-group scoped reports generate correctly for an org with >= 3 tag groups; tag-group NPS is distinct from org-wide NPS
- Org-wide scoped reports aggregate across all active surveys; topic list shows cross-survey themes ranked by frequency
- A workflow trigger fires a `generate_report` action and delivers the report to the configured recipient within 60 seconds
- Crystal can propose `generate_report` as an action in the conversation interface; the confirm-card renders correctly; confirming triggers the run
- All `CLAUDE.md` files updated with cross-reference links to this documentation
- Full integration test pass: create report — configure schedule — run — verify delivery — verify artifact — verify notification

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Crystal narrative quality below bar on real customer data | Medium | High | Weekly narrative review ritual from Day 1; beta program with real data before GA; guard rails in `generate_narrative` node |
| Scheduler drift on multi-instance CrystalOS deployments | Low | High | Redis SET NX lock per run; `next_run_at` updated immediately on pickup before run starts |
| Email deliverability issues (spam filtering, DMARC failures) | Medium | High | Domain warm-up plan; SPF/DKIM/DMARC setup before any production sends; Simone owns this |
| PDF generation memory bloat with large reports (QBR Pack) | Low | Medium | Playwright page.pdf() has memory limits; QBR Pack PDF deferred to async job if > 5 pages |
| Report generation timeout for org-wide scope on large orgs (>50k responses) | Medium | Medium | Materialized view pre-computation; metric cache; async generation with in-app notification on completion |
| Template customization creates too many edge cases for Crystal narrative | Low | Medium | Customization scope limited in v1 (section show/hide and tone only); no structural changes to template sections |

---

## Dependencies

| Dependency | Status | Owner |
|------------|--------|-------|
| Existing 10-node Insight Pipeline DAG (topic extraction reuse) | Done | Kavya (extraction to `shared/metrics.py`) |
| CrystalOS scheduler tick infrastructure | Done | Marcus (hook new tick handler in) |
| Notification center in-app (write notification on run complete) | Done | Jordan (add new notification type) |
| SendGrid account + verified sending domain | To do | Simone (Week 2) |
| DataBus invalidation for report list on run complete | To do | Jordan (Phase 2) |
| Survey `status` change event emission from backend | Partial | Marcus (survey close event exists; needs `generate_report` hook) |
