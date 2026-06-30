# Xperiq Actions — Engineering Roadmap

**Version:** 1.0
**Owner:** Maya Okonkwo (Product Lead) + Priya Krishnamurthy (Backend Architect)
**Status:** Approved — Phase 1 begins next sprint
**Last updated:** 2026-06-29

---

## Overview

Five phases across 10 weeks. Each phase has a hard Definition of Done gate — engineering does not proceed to the next phase until the gate is passed. The gate owner is listed per phase.

```
Week 1–3:   Phase 1 — Core Engine
Week 4–5:   Phase 2 — Builder UI
Week 6–7:   Phase 3 — AI Triggers
Week 8–9:   Phase 4 — Integration Depth
Week 10:    Phase 5 — MCP Skill
```

---

## Phase 1 — Core Engine
**Duration:** Weeks 1–3
**Gate owner:** Priya Krishnamurthy
**Goal:** A working workflow execution engine. No UI. Trigger-to-action loop runs end-to-end for threshold triggers, verifiable via API.

---

### Week 1: Database + Queue Foundation

#### Files to create

**Migrations** (`supabase/migrations/`):

```
YYYYMMDD_create_workflows.sql
YYYYMMDD_create_workflow_conditions.sql
YYYYMMDD_create_workflow_actions.sql
YYYYMMDD_create_workflow_runs.sql
YYYYMMDD_create_workflow_run_steps.sql
```

Each migration file creates one table with all columns, constraints, and indexes as specified in `ARCHITECTURE.md`. Apply in order. Do not combine into one file — each is independently rollbackable.

**Backend queue setup** (`backend/src/queue/`):

```
backend/src/queue/index.ts           — Redis connection + queue factory
backend/src/queue/triggerQueue.ts    — BullMQ Queue for 'workflow-triggers'
backend/src/queue/actionQueue.ts     — BullMQ Queue for 'workflow-actions'
backend/src/queue/workers/
  triggerWorker.ts                   — Evaluates conditions, creates WorkflowRun, enqueues actions
  actionWorker.ts                    — Executes one action per job
backend/src/queue/dlqMonitor.ts      — Polls failed jobs, writes to dead_letter_items table (new table, simple: id, queue_name, job_id, payload, failed_at)
```

**Scheduler** (`backend/src/scheduler/`):

```
backend/src/scheduler/WorkflowScheduler.ts    — setInterval at 30s; fetches enabled workflows; evaluates threshold triggers
backend/src/scheduler/evaluators/
  responseCountEvaluator.ts
  responseRateDropEvaluator.ts
  npsThresholdEvaluator.ts
  scheduleEvaluator.ts
```

Each evaluator exports a function `evaluate(workflow: Workflow, context: EvalContext): Promise<TriggerResult | null>`. Returns `TriggerResult` (with `trigger_payload`) if the workflow should fire, `null` if not. The scheduler calls each evaluator and enqueues a job if it returns non-null.

**Environment variables** (add to `backend/.env.example` and `docs/ENV_VARS.md`):

```bash
INTERNAL_API_KEY=              # CrystalOS → backend workflow signals auth
INTEGRATION_SECRET_KEY=        # AES-256 for integration credential encryption
WORKFLOW_EMAIL_FROM=noreply@xperiq.com
SENDGRID_API_KEY=              # for send_email action
```

#### Acceptance criteria — Week 1
- [ ] All five migration files apply cleanly on a fresh local DB (`supabase db reset` succeeds)
- [ ] BullMQ queues connect to Redis and accept jobs (verified in unit test)
- [ ] WorkflowScheduler initializes without error on `npm start`
- [ ] All four evaluators have unit tests with mock workflow objects

---

### Week 2: CRUD API + Threshold Trigger Execution

#### Files to create

**Repository layer** (`backend/src/repositories/`):

```
backend/src/repositories/workflowRepository.ts
  — CRUD: findByOrg, findById, create, update (creates version), softDelete
  — findEligibleForScheduler(triggerTypes: string[]): returns enabled, non-deleted workflows with cooldown_until < now()

backend/src/repositories/workflowRunRepository.ts
  — create, findByWorkflow (paginated), findById, updateStatus
  — insertOrIgnoreIdempotent(run: WorkflowRunInsert): handles UNIQUE constraint on idempotency_key
```

**Route handlers** (`backend/src/routes/`):

```
backend/src/routes/workflows.ts
  — GET    /api/workflows
  — POST   /api/workflows
  — GET    /api/workflows/:id
  — PUT    /api/workflows/:id
  — DELETE /api/workflows/:id
  — POST   /api/workflows/:id/enable
  — POST   /api/workflows/:id/disable
  — GET    /api/workflows/:id/runs
  — GET    /api/workflows/:id/runs/:runId
```

**Route middleware** (`backend/src/middleware/`):

```
backend/src/middleware/workflowPlanLimits.ts
  — Enforces per-tier limits (max active workflows, max actions per workflow)
  — Reads org plan from existing plan/tier system
```

**Action executors** (`backend/src/queue/executors/`):

```
backend/src/queue/executors/sendEmailExecutor.ts       — SendGrid/Resend API call
backend/src/queue/executors/slackNotificationExecutor.ts — Slack webhook POST
backend/src/queue/executors/notifyInAppExecutor.ts      — Write to notifications table + SSE push
```

**Variable resolver** (`backend/src/queue/`):

```
backend/src/queue/variableResolver.ts
  — resolveTemplate(template: string, context: WorkflowContext): string
  — Replaces {{survey.name}}, {{trigger.nps_score}}, etc. with resolved values
  — Returns original placeholder in brackets if variable not found (never throws)
```

**Types** (`backend/src/types/`):

```
backend/src/types/workflow.ts
  — WorkflowRow, WorkflowSummary, WorkflowDetail
  — WorkflowRunRow, WorkflowRunSummary, WorkflowRunDetail
  — WorkflowRunStepRow
  — TriggerConfig (discriminated union by trigger_type)
  — ActionConfig (discriminated union by action_type)
  — WorkflowContext (data available to variable resolver)
  — TriggerResult
  — CreateWorkflowRequest, UpdateWorkflowRequest
```

#### Files to modify

```
backend/src/routes/index.ts         — mount workflowsRouter at /api/workflows
backend/src/server.ts               — initialize WorkflowScheduler on startup
```

#### Acceptance criteria — Week 2
- [ ] `POST /api/workflows` creates a workflow with valid trigger + action config
- [ ] `POST /api/workflows` returns 400 on invalid trigger_config (validated against per-type schema)
- [ ] `GET /api/workflows` returns only workflows for the authenticated org
- [ ] `PUT /api/workflows/:id` increments version and stores prior version in version_history
- [ ] WorkflowScheduler evaluates an NPS threshold workflow and enqueues a trigger job when threshold is crossed
- [ ] TriggerWorker evaluates conditions, creates a WorkflowRun, and enqueues action jobs
- [ ] ActionWorker executes `send_email` action via SendGrid (verified in integration test with real SendGrid sandbox)
- [ ] ActionWorker executes `slack_notification` action via webhook (verified with a test Slack workspace)
- [ ] Idempotency: triggering the same workflow with the same event fingerprint twice creates only one WorkflowRun

---

### Week 3: response_submitted Hook + enable/disable + Basic Tests

#### Files to create

```
backend/src/queue/executors/webhookExecutor.ts         — signed webhook POST
backend/src/routes/workflowSignals.ts                  — POST /api/internal/workflow-signals (X-Internal-Key)
```

#### Files to modify

```
backend/src/routes/responses.ts    — add response_submitted trigger hook after response INSERT
backend/src/routes/surveys.ts      — add survey_lifecycle trigger hook after survey status UPDATE
```

The hook pattern for `response_submitted`:

```typescript
// After successful response INSERT in POST /api/surveys/:id/responses:
await workflowTriggerService.fireResponseSubmittedHook({
  surveyId,
  orgId,
  responseId: newResponse.id,
  embeddedData: newResponse.embedded_data,
  npsScore: newResponse.nps_score,
});
// This call is fire-and-forget (non-blocking). It enqueues to BullMQ — never delays the response submission.
```

#### Test suite additions

```
backend/tests/workflows/
  workflowCrud.test.ts       — CRUD API, version history, soft delete
  workflowTriggers.test.ts   — Evaluator unit tests for all 4 threshold types
  workflowExecution.test.ts  — End-to-end: create workflow → simulate trigger → verify WorkflowRun + steps
  workflowIdempotency.test.ts — Duplicate trigger events produce one run
  workflowPlanLimits.test.ts — Tier enforcement (max workflows, max actions)
```

#### Acceptance criteria — Phase 1 Gate
- [ ] All five DB tables created, indexed, with no breaking migration
- [ ] All CRUD endpoints pass tests with org isolation (cannot read/write another org's workflows)
- [ ] `response_submitted` trigger fires correctly (end-to-end test: submit a response → workflow fires → run created)
- [ ] `survey_lifecycle` trigger fires on publish and close
- [ ] `send_email`, `slack_notification`, `notify_in_app`, `webhook` executors all work in integration tests
- [ ] Retry logic works: ActionWorker retries 3x with exponential backoff on 5xx response from action target
- [ ] DLQ: after 3 failed retries, job is in Bull failed set and DLQ monitor creates a dead_letter_items row
- [ ] WorkflowScheduler does not fire a workflow in cooldown (verified: fire once, verify second fire is blocked for cooldown_minutes)
- [ ] TypeScript: `tsc --noEmit` passes with zero errors
- [ ] Test suite: `npm test` passes with >= 60 new test cases across all workflow test files

---

## Phase 2 — Builder UI
**Duration:** Weeks 4–5
**Gate owner:** Rohan Desai (design sign-off) + Elias Park (implementation)
**Goal:** Full visual workflow builder. Users can create, edit, enable, and view runs for any workflow type that Phase 1 supports. Crystal Builder is excluded (Phase 3).

---

### Week 4: List Page + Builder Shell

#### Files to create

```
app/src/pages/workflows/
  WorkflowsPage.tsx                   — list page layout
  WorkflowBuilderPage.tsx             — builder shell with mode toggle

app/src/components/workflows/
  WorkflowCard.tsx                    — card with status pill, trigger/action icons, hover actions
  WorkflowStatusPill.tsx              — status chip (Enabled/Disabled/Cooldown/Error/Dormant)
  WorkflowGrid.tsx                    — responsive card grid
  WorkflowEmptyState.tsx              — empty state with Crystal prompt input

app/src/components/workflows/builder/
  WorkflowBuilder.tsx                 — builder layout (left panel / canvas / right panel)
  BuilderCanvas.tsx                   — center canvas: trigger card, condition cards, action cards, connectors
  BuilderLeftPanel.tsx                — searchable trigger/action selector
  BuilderRightPanel.tsx               — configuration panel for selected card
  TriggerCard.tsx
  ConditionCard.tsx
  ActionCard.tsx
  BezierConnector.tsx                 — SVG path between cards with draw animation
  LivePreviewStrip.tsx                — human-readable summary strip at bottom

app/src/hooks/workflows/
  useWorkflows.ts                     — GET /api/workflows with filters
  useWorkflow.ts                      — GET /api/workflows/:id
  useCreateWorkflow.ts                — POST /api/workflows
  useUpdateWorkflow.ts                — PUT /api/workflows/:id
  useDeleteWorkflow.ts                — DELETE /api/workflows/:id
  useToggleWorkflow.ts                — POST /api/workflows/:id/enable|disable

app/src/types/workflow.ts             — frontend-side workflow types (mirroring backend types)
```

#### Files to modify

```
app/src/routes.tsx             — add /workflows and /workflows/new and /workflows/:id/edit routes
app/src/locales/en.ts          — add workflows namespace strings (full set from DESIGN.md)
app/src/components/nav/Sidebar.tsx  — add Workflows nav item (icon: zap)
```

#### Acceptance criteria — Week 4
- [ ] Workflow list page renders cards for all org workflows
- [ ] Card shows correct status pill, trigger icon, action icons
- [ ] Card hover shows quick-actions: Enable/Disable, Edit, View Runs, Duplicate
- [ ] Empty state renders and shows Crystal prompt input (not yet functional — placeholder)
- [ ] Builder page layout renders with left/center/right panels
- [ ] Builder canvas renders TriggerCard, ConditionCard(s), and ActionCard(s) from workflow data
- [ ] BezierConnector renders SVG path between cards (static, no animation yet)
- [ ] Left panel selector is searchable and categorized

---

### Week 5: Builder Interactions + Run History + Test Mode

#### Files to create

```
app/src/components/workflows/builder/
  DraggableActionList.tsx             — drag-to-reorder action cards (Framer Motion layout)
  config/
    TriggerConfigPanel.tsx            — all trigger types have config forms
    ActionConfigPanel.tsx             — all action types have config forms
    VariableChipInput.tsx             — {{var}} autocomplete input component

app/src/pages/workflows/
  WorkflowRunHistoryPage.tsx          — /workflows/:id/runs

app/src/components/workflows/
  RunHistoryList.tsx
  RunRow.tsx                          — expandable run detail
  TestModePanel.tsx                   — slide-in panel with dry-run form
  TemplateGallery.tsx                 — modal with 12 template cards

app/src/hooks/workflows/
  useWorkflowRuns.ts                  — GET /api/workflows/:id/runs
  useWorkflowRun.ts                   — GET /api/workflows/:id/runs/:runId
  useTestWorkflow.ts                  — POST /api/workflows/:id/test
  useRetryRun.ts                      — POST /api/workflows/:id/runs/:runId/retry
```

#### Files to modify

```
app/src/components/workflows/builder/BuilderCanvas.tsx
  — wire drag-to-reorder
  — animate bezier connectors (pathLength draw-in)
  — animate add-condition and add-action transitions
  — live preview strip binding

app/src/routes.tsx
  — add /workflows/:id/runs route
```

#### Acceptance criteria — Phase 2 Gate
- [ ] Create a complete NPS threshold → Slack workflow via Visual Builder in < 3 minutes (usability test with 3 internal users)
- [ ] Drag-to-reorder actions works (updated display_order persists on Save)
- [ ] BezierConnector animates in (pathLength from 0 to 1) when a card is added
- [ ] All 10 trigger types have config forms with all fields
- [ ] All 10 action types have config forms with variable chip support
- [ ] Live preview strip updates in real-time as config changes
- [ ] Run history page shows all runs for a workflow, newest first
- [ ] RunRow expands to show trigger context + per-action step results
- [ ] Test mode (Safe Run) executes dry run and shows "would fire" preview for all actions
- [ ] Template gallery modal opens, shows 12 templates, clicking one populates the builder
- [ ] Enable/disable toggle shows toast with micro-animation
- [ ] `tsc --noEmit` passes (zero errors)
- [ ] Storybook stories for: WorkflowCard, TriggerCard, ActionCard, BezierConnector, RunRow, TestModePanel

---

## Phase 3 — AI Triggers
**Duration:** Weeks 6–7
**Gate owner:** Amara Osei (AI/ML) + Nina Reeves (platform integration)
**Goal:** All three Crystal Signal trigger types working end-to-end. Crystal Builder (NL workflow creation) working with >= 44/50 test cases.

---

### Week 6: CrystalOS Signal Pipeline + Crystal Builder NL Parsing

#### Files to create

**CrystalOS** (`crystalos/`):

```
crystalos/skills/workflow/
  __init__.py
  nl_to_workflow.py               — LangGraph subgraph: nl text → WorkflowSpec
  workflow_signals.py             — sentiment_spike, new_theme_detected, anomaly_detected evaluators
  signal_emitter.py               — POST /api/internal/workflow-signals after insight pipeline run
  models.py                       — WorkflowSpec, TriggerSpec, ActionSpec, ConditionSpec Pydantic models
  SKILL.md                        — skill definition (used for Phase 5 MCP publishing)
  EVALS.md                        — evaluation criteria for NL parsing + signal detection accuracy

crystalos/tests/workflow/
  test_nl_to_workflow.py          — 50 NL → WorkflowSpec test cases
  test_signal_detection.py        — signal threshold and confidence tests
```

**Backend** (`backend/`):

```
backend/src/routes/workflowSignals.ts    — POST /api/internal/workflow-signals (already in Phase 1 Week 3)
  — extend to handle all three AI trigger types
  — match signals to enabled org workflows with AI trigger types
  — enqueue trigger evaluation jobs for matching workflows

backend/src/queue/evaluators/
  sentimentSpikeEvaluator.ts
  newThemeDetectedEvaluator.ts
  anomalyDetectedEvaluator.ts
```

**App** (`app/`):

```
app/src/components/workflows/builder/
  CrystalBuilderInput.tsx              — NL input, Build with Crystal button, thinking animation
  CrystalBuilderAnnotation.tsx         — Crystal's annotation card explaining decisions
  CrystalFillAnimation.tsx             — coordinates staggered card appearance + typewriter effect
```

#### Files to modify

```
crystalos/pipeline/insight_pipeline.py    — add signal evaluation + emission step at end of pipeline run
app/src/components/workflows/builder/WorkflowBuilder.tsx
  — wire Crystal Builder tab to CrystalBuilderInput
  — handle crystal_workflow_proposal action_proposal type from backend
  — render confirm-card for Crystal-created workflows
```

#### API additions (backend)

```
POST /api/workflows/crystal-build
  — Body: { description: string, org_id: string }
  — Calls CrystalOS nl_to_workflow subgraph
  — Returns: WorkflowSpec + action_proposal (confirm-card data) or { ambiguities: string[] }
```

#### Acceptance criteria — Week 6
- [ ] `nl_to_workflow.py` subgraph correctly parses >= 44/50 test cases in the test corpus
- [ ] Crystal Builder UI: user types description → "Build with Crystal" → cards animate in one-by-one
- [ ] Crystal annotation card shows with decisions Crystal made (e.g., "I set window to 24h")
- [ ] Crystal Builder handles ambiguities: if Slack channel not found, shows inline warning on action card
- [ ] "Edit in Visual Builder" transition works smoothly after Crystal fills the builder
- [ ] POST /api/internal/workflow-signals processes all three AI trigger types and enqueues correctly

---

### Week 7: AI Trigger Integration + Hysteresis + End-to-End Tests

#### Files to create

```
crystalos/skills/workflow/hysteresis.py
  — ThemeRegistry class: maintains per-survey theme list across pipeline runs
  — SentimentHistory class: rolling sentiment distribution per survey
  — StatisticsStore class: rolling mean/stddev per metric per survey

backend/src/queue/evaluators/aiTriggerEvaluator.ts
  — Unified evaluator for all AI trigger types from workflow-signals endpoint

backend/tests/workflows/
  aiTriggers.test.ts           — end-to-end: emit signal → workflow fires → run created
  crystalBuilder.test.ts       — API test for POST /api/workflows/crystal-build
```

#### Acceptance criteria — Phase 3 Gate
- [ ] `sentiment_spike` trigger fires with >= 90% precision on test corpus
- [ ] `new_theme_detected` trigger fires correctly on theme novelty threshold test cases
- [ ] `anomaly_detected` trigger fires correctly on z-score test cases
- [ ] Hysteresis: `nps_threshold` workflow does not re-fire until NPS recovers by 5+ points
- [ ] Hysteresis: `sentiment_spike` does not re-fire until sentiment returns to baseline for at least 12 hours
- [ ] End-to-end: CrystalOS insight pipeline run → signal emitted → workflow fires → Slack message sent (integration test)
- [ ] Crystal Builder: 50-case test corpus, >= 44 pass
- [ ] Crystal Builder confirm-card renders correctly in the frontend
- [ ] User can confirm Crystal Builder proposal → workflow created via POST /api/workflows
- [ ] All new CrystalOS code is typed (mypy passes with zero errors)
- [ ] `tsc --noEmit` passes (zero errors on backend)

---

## Phase 4 — Integration Depth
**Duration:** Weeks 8–9
**Gate owner:** David Mensah (integrations) + Kenji Watanabe (reliability)
**Goal:** All 10 action types working. Test mode complete. Retry/DLQ fully operational. Workflow versioning complete. Integration credential vault built.

---

### Week 8: Remaining Action Types + Integration Credential Vault

#### Files to create

```
backend/src/queue/executors/
  createJiraTicketExecutor.ts
  createZendeskTicketExecutor.ts
  generateReportExecutor.ts
  pauseSurveyExecutor.ts
  closeSurveyExecutor.ts
  crystalAnalysisExecutor.ts

backend/src/services/
  integrationVault.ts             — AES-256 encrypt/decrypt for stored credentials
  jiraClient.ts                   — Jira REST API v3 client
  zendeskClient.ts                — Zendesk Support API client

backend/src/routes/
  integrations.ts                 — GET/POST/DELETE /api/integrations (org-scoped credential management)

supabase/migrations/
  YYYYMMDD_create_integrations.sql — integrations table: id, org_id, service_name, credentials_encrypted, created_at

app/src/pages/settings/
  IntegrationsSettingsPage.tsx    — /settings/integrations (Slack, Jira, Zendesk connect/disconnect)
```

#### Files to modify

```
backend/src/queue/executors/slackNotificationExecutor.ts
  — extend to support bot token auth (not just webhook URL)
  — add Block Kit template support

backend/src/queue/actionWorker.ts
  — route to new executor types

backend/tests/workflows/integrations.test.ts
  — tests for Jira, Zendesk executors (using test credentials in CI)
```

#### Acceptance criteria — Week 8
- [ ] All 10 action types have executors
- [ ] `createJiraTicketExecutor` creates a real Jira issue (tested against Jira Cloud sandbox)
- [ ] `createZendeskTicketExecutor` creates a real Zendesk ticket (tested against Zendesk sandbox)
- [ ] Integration vault: credentials stored AES-256 encrypted, decrypted only at execution time
- [ ] `integrations` table and API: org admin can connect and disconnect Slack, Jira, Zendesk
- [ ] IntegrationsSettingsPage renders connection status for each integration
- [ ] `generateReportExecutor` triggers report and delivers via email (uses existing report generation service)
- [ ] `pauseSurveyExecutor` and `closeSurveyExecutor` mutate survey status and record workflow run ID as initiator

---

### Week 9: Test Mode Complete + Retry/DLQ + Versioning + Run Retry API

#### Files to create

```
backend/src/routes/workflowRunRetry.ts     — POST /api/workflows/:id/runs/:runId/retry

backend/src/services/
  dryRunEngine.ts                          — executes full trigger + condition + action evaluation without side effects
                                             — returns DryRunResult: { conditions_passed, actions_would_fire, rendered_configs }

backend/tests/workflows/
  dryRun.test.ts
  retryRun.test.ts
  dlq.test.ts                              — verifies DLQ routing after 3 failed retries
  versioning.test.ts                       — verifies version_history accumulates on PUT
```

#### Files to modify

```
app/src/components/workflows/TestModePanel.tsx
  — connect to POST /api/workflows/:id/test
  — render dry run results (conditions passed, would-fire actions with rendered configs)
  — "Crystal simulate" textarea: passes to POST body as simulate_crystal field

app/src/components/workflows/RunRow.tsx
  — wire "Replay this run" button to POST /api/workflows/:id/runs/:runId/retry
```

#### Acceptance criteria — Phase 4 Gate
- [ ] Test mode (Safe Run) works for all 10 trigger types and all 10 action types
- [ ] Test mode renders rendered variable configs (all `{{vars}}` resolved with sample data)
- [ ] Test mode with `simulate_crystal` field overrides Crystal variables in action config previews
- [ ] Run retry creates a new run with `attempt_count = original + 1`
- [ ] Retry of a partially failed run (only some actions failed) re-executes from the first failed step, not from the beginning
- [ ] DLQ: after 3 failed retries, job appears in `dead_letter_items` table and triggers Prometheus counter increment
- [ ] Grafana dashboard "Xperiq Actions — Execution Health" has all 6 panels defined and receiving data
- [ ] Workflow versioning: PUT creates new version, old config stored in version_history, runs link to version
- [ ] Slack delivery success rate >= 99.5% across 1,000 test runs (Kenji's load test script)
- [ ] All integration tests pass in CI (using Jira/Zendesk sandbox credentials in CI env)
- [ ] `tsc --noEmit` passes, `mypy crystalos/` passes

---

## Phase 5 — MCP Skill
**Duration:** Week 10
**Gate owner:** Nina Reeves (platform integration) + Amara Osei (AI/ML)
**Goal:** Workflow Skill published as an MCP tool, callable from any Claude agent (or any MCP-compatible client).

---

### Week 10: MCP Workflow Skill

#### Files to create

```
crystalos/skills/workflow/SKILL.md
  — Full skill definition (already authored in Week 6, now finalized)
  — Exactly 5 operations the skill can perform
  — Input schema for each operation
  — Output schema
  — Credit cost per operation
  — Failure handling contract

crystalos/skills/workflow/EVALS.md
  — Evaluation corpus: 20 scenarios × (input, expected_output, pass_criteria)
  — Include NL → workflow creation, trigger fire, run retrieval

crystalos/mcp/workflow_tool.py
  — MCP tool definition: tools/workflow
  — Operations: create_workflow, list_workflows, enable_workflow, disable_workflow, get_run_history
  — All operations call backend API via internal client

crystalos/tests/mcp/
  test_workflow_tool.py           — 20 MCP operation test cases
```

#### Workflow Skill Operations (exactly 5):

| Operation | Description | Minimum input | Output |
|---|---|---|---|
| `create_workflow` | Create a workflow from NL description or structured spec | `description` (NL) or `spec` (structured) | `WorkflowConfirmCard` action_proposal |
| `list_workflows` | List workflows for an org, optionally filtered | `org_id`, optional: `survey_id`, `status` | `WorkflowSummary[]` |
| `enable_workflow` | Enable a workflow by ID | `workflow_id` | `{ enabled: true, workflow_name }` |
| `disable_workflow` | Disable a workflow by ID | `workflow_id` | `{ disabled: true, workflow_name }` |
| `get_run_history` | Get recent execution history for a workflow | `workflow_id`, optional: `limit` (default 10) | `WorkflowRun[]` with step summaries |

#### Files to modify

```
crystalos/mcp/server.py           — register workflow_tool in MCP tool list
crystalos/CLAUDE.md               — add Workflow Skill section
docs/ENV_VARS.md                  — verify all new vars are documented
```

#### Acceptance criteria — Phase 5 Gate (Definition of Done for all of Xperiq Actions)
- [ ] Workflow Skill registered and callable from the CrystalOS MCP server
- [ ] `create_workflow` operation correctly routes to `nl_to_workflow` for NL input and returns a confirm-card action_proposal
- [ ] `list_workflows`, `enable_workflow`, `disable_workflow`, `get_run_history` all work end-to-end
- [ ] 20 MCP test cases pass
- [ ] SKILL.md and EVALS.md complete and reviewed by Maya and Nina
- [ ] From Claude (via MCP config): `"Create a workflow: when NPS drops below 30, send Slack to #cx-alerts"` produces a correct confirm-card in < 5 seconds
- [ ] All docs updated: `crystalos/CLAUDE.md`, `docs/ENV_VARS.md`
- [ ] Zero new TypeScript errors, zero mypy errors
- [ ] Full test suite (all phases) passes in CI

---

## Cross-Phase Requirements

These are not optional — they apply to every phase:

### No Hardcoded Strings
All user-visible strings go in `app/src/locales/en.ts` under the `workflows` namespace. Engineering must not merge a PR with hardcoded string literals in JSX.

### Org Isolation
Every SQL query in the workflow system must include `org_id = $orgId` in the WHERE clause. The route middleware (`requireOrgMembership`) is already applied to `/api/workflows` by mounting it under the authenticated router. All repository functions take `orgId` as an explicit parameter and apply it.

### Soft Deletes
`workflows` table uses `deleted_at`. No `DELETE FROM workflows`. All queries filter `WHERE deleted_at IS NULL`. WorkflowRuns are never deleted (they are the audit trail).

### New Env Vars
Every `process.env.X`, `import.meta.env.VITE_X`, or `os.getenv("X")` introduced by any phase must be added to the relevant `.env.example` file AND `docs/ENV_VARS.md` in the same PR. Nina Reeves reviews these before merge.

### tsc Zero Errors
No phase ships with TypeScript errors. The pre-commit hook enforces this. Do not `// @ts-ignore` to work around type issues — fix them.

### Migration Safety
All SQL migrations must be tested with `supabase db reset` and `supabase db push` before opening a PR. Migrations must be additive-only in Phase 1–4 (no DROP COLUMN, no NOT NULL addition on existing rows without a default). Phase 5 has no migrations.

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| CrystalOS NL parsing accuracy < 90% for Crystal Builder | Medium | High | 50-case test corpus maintained in Week 6; Maya runs a manual review before Phase 3 gate; fallback is always available (Visual Builder) |
| Slack/Jira API rate limits causing action failures | Low | Medium | Implement per-integration rate limiter in executors; exponential backoff already covers retries |
| BullMQ Redis connection flap causing scheduler to miss a tick | Low | High | Scheduler is idempotent; a missed tick at T+30s catches the same state at T+60s. No missed fires from short Redis flaps |
| `response_submitted` trigger causing action storms on high-volume surveys | Medium | High | Rate limit: max 1 `response_submitted` workflow per survey; enforced at POST /api/workflows validation |
| Phase 1 schema changes required in Phase 2+ | Medium | Medium | Schema is designed with headroom (JSONB configs, indexed lookup patterns). Additive migrations only. |
| Integration credential vault key rotation | Low | High | Document key rotation runbook in Phase 4. `INTEGRATION_SECRET_KEY` rotation requires re-encrypting all stored credentials — build the rotation script in Phase 4, not later. |

---

## Sprint Handoff Checklist (per phase)

Before the gate owner approves a phase and engineering starts the next:

- [ ] All acceptance criteria checked off (not self-reported — verified by gate owner or a second engineer)
- [ ] `tsc --noEmit` clean
- [ ] `npm test` passes with all new tests
- [ ] `mypy crystalos/` passes (Phases 3, 5)
- [ ] New env vars documented in `.env.example` + `docs/ENV_VARS.md`
- [ ] No hardcoded user-visible strings in JSX
- [ ] PR description includes: "What shipped", "How to test", "Known gaps"
- [ ] Grafana/monitoring: any new metrics emitted are visible in the dashboard
- [ ] Gate owner signs off in the phase PR comment: "Phase N gate: PASSED"
