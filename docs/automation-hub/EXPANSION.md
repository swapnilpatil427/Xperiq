# Xperiq Actions — 2027–2028 Expansion Vision

**Version:** 1.0
**Owner:** Maya Okonkwo (Product Lead) + Priya Krishnamurthy (Backend Architect)
**Status:** Forward-looking design document — post-Phase 5 roadmap
**Last updated:** 2026-06-29

---

## Vision Summary

Xperiq Actions ships in 2026 as a capable, opinionated workflow automation engine for CX teams. It does one thing well: turn XM signals into organizational responses through a transparent, auditable trigger-condition-action model.

The 2027–2028 expansion vision builds on that foundation in seven directions. Each expansion is technically grounded — not speculative. Each one extends the existing architecture rather than replacing it. The expansions are ordered by dependency: the first three (Branching Logic, Multi-Survey Orchestration, AI-Authored Actions) form the core intelligence tier and must be built in sequence. The remaining four (Marketplace, Self-Healing, Compliance Workflows, Voice Creation) are independent and can be staffed in parallel once the core tier is stable.

The result, by end of 2028, is a platform that does not just act on signals — it reasons about them, coordinates responses across organizational boundaries, writes its own notifications, monitors its own health, and is operated in part through natural language.

---

## Expansion 1: Branching Workflow Logic

### Problem Statement

Every workflow in Phase 1–5 is linear: trigger fires, conditions are checked, actions execute in order, done. This covers the majority of CX automation needs. But it leaves a significant class of problems unhandled.

When an action fails, the chain stops (or continues, depending on `on_failure` config). But there is no way to say "if the Jira action fails, send an email instead." When a Zendesk ticket is created, there is no way to say "if it is not resolved within 48 hours, escalate." When an NPS drop is detected, there is no way to say "if the drop is more than 20 points, page the VP; if it is 5–20 points, notify the team."

The anti-goal in Phase 1–5 was correct: branching in the builder is complex to design, complex to build, and potentially overwhelming for new users. But by the time a team is running 20+ workflows with Jira, Zendesk, and Crystal integrations, linear logic is too limiting. The product needs to grow with its users.

### User Stories

- "If Action 1 (Jira ticket creation) fails due to an API error, fall back to sending an email to the product team lead directly."
- "If NPS drops more than 20 points, send a critical alert to #cx-escalation and email the VP. If it drops 5–20 points, send a standard alert to #cx-alerts only."
- "After creating a Zendesk ticket, wait 48 hours. If the ticket is still open, close the survey and send an escalation email."
- "Run Crystal analysis. If the top theme matches 'onboarding,' open a Jira ticket in the Onboarding project. If it matches 'billing,' open a Jira ticket in the Billing project."

### Technical Design

**Core concept:** A workflow is currently a linear directed graph. Branching extends this to a conditional directed acyclic graph (DAG). Cycles are never permitted.

Each action node gains a `branches` array. Each branch is an `(condition, next_action_id)` pair. When an action completes, the execution engine evaluates the branch conditions in order and follows the first matching branch. If no branch matches, execution stops (or follows a default branch if one is configured).

**New DB schema:**

```sql
-- Extend workflow_actions to support branching

ALTER TABLE workflow_actions
  ADD COLUMN branches JSONB NOT NULL DEFAULT '[]';

-- branches schema:
-- [
--   {
--     "id": "uuid",
--     "condition_type": "on_failure" | "on_success" | "expression",
--     "expression": "{{trigger.nps_score}} < 10",  -- only for condition_type=expression
--     "next_action_id": "uuid | null",             -- null = end of chain
--     "label": "Critical drop"                     -- display label in builder
--   }
-- ]

-- A separate table for time-based branch conditions (48h escalation pattern)
CREATE TABLE workflow_scheduled_branches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id     UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  source_action_id UUID NOT NULL REFERENCES workflow_actions(id) ON DELETE CASCADE,
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  delay_minutes   INTEGER NOT NULL,
  condition       JSONB NOT NULL,
  -- condition example:
  -- { "type": "external_state", "integration": "zendesk",
  --   "check": "ticket_status != 'closed'", "integration_ref": "{{steps.1.zendesk_ticket_id}}" }

  next_action_id  UUID REFERENCES workflow_actions(id),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_wf_scheduled_branches_workflow ON workflow_scheduled_branches(workflow_id);
```

**BullMQ execution model changes:**

The `ActionWorker` currently executes one action per job and then enqueues the next action immediately. With branching, after each action completes, the worker evaluates the action's `branches` array:

1. Evaluate each branch condition in order against the execution context (trigger payload + accumulated step outputs + action result)
2. Follow the first matching branch: enqueue the `next_action_id` action as the next job
3. If no branch matches: execution ends for this path

For `on_failure` branches: the current `on_failure: 'continue'` field is superseded by an explicit failure branch. The branch condition `"condition_type": "on_failure"` is the new canonical way to express fallback behavior.

For time-delayed branches (`workflow_scheduled_branches`): when an action completes and the workflow has a scheduled branch attached to that action, the worker schedules a BullMQ delayed job:

```typescript
await branchCheckQueue.add('check_branch', {
  workflow_id,
  run_id,
  branch_id: scheduledBranch.id,
  check_context: currentExecutionContext,
}, {
  delay: scheduledBranch.delay_minutes * 60 * 1000,
});
```

The `BranchCheckWorker` runs when the delayed job fires, evaluates the branch condition against external state (e.g., Zendesk ticket status), and either enqueues the escalation action or no-ops.

**New LangGraph nodes for `nl_to_workflow`:**

```python
# crystalos/skills/workflow/nl_to_workflow.py — additions

class BranchSpec(BaseModel):
    condition_type: Literal['on_failure', 'on_success', 'expression', 'time_delayed']
    expression: Optional[str]          # for condition_type=expression
    delay_minutes: Optional[int]       # for condition_type=time_delayed
    time_condition: Optional[str]      # for time_delayed: what to check after delay
    next_action: Optional[ActionSpec]  # None = end of branch
    label: str

# New graph node: parse_branch_conditions
# Detects branching intent in NL:
#   "if it fails" -> on_failure branch
#   "otherwise" / "if not" -> on_failure or expression branch
#   "if NPS drops more than X" -> expression branch on trigger value
#   "if not resolved in 48 hours" -> time_delayed branch
#
# The node produces a list of BranchSpec objects attached to the appropriate
# ActionSpec in the workflow.

# New graph node: validate_branch_dag
# Verifies the resulting graph is acyclic before emitting the proposal.
# A workflow with a cycle (A -> B -> A) is rejected with an error message.
```

**Frontend builder changes:**

The center canvas gains branch connectors. When an action card has a branch, the SVG connector from that card splits into two (or more) paths, each leading to a different downstream card. Branch connectors are visually distinct from linear connectors: dashed lines instead of solid, with a small condition label on the connector path.

Adding a branch: hover over the bottom edge of an action card. The "Add Action" button is joined by an "Add Branch" button. Clicking "Add Branch" opens the right panel with a branch condition editor:

```
ADD BRANCH FROM: "Create Jira Ticket"

Condition type:
  [x] On failure (if this action fails)
  [ ] On success (if this action succeeds)
  [ ] Expression (evaluate a condition)
  [ ] After a delay (time-based check)

Then do:
  [+ Add action to this branch]
```

Expression branches show a condition builder mirroring the existing condition card UI. The `BuilderCanvas` component receives a `branchMode: boolean` prop that switches from linear layout to DAG layout when true.

New components: `BranchConnector.tsx`, `BranchConditionEditor.tsx`, `BranchingCanvas.tsx` (extends `BuilderCanvas` for DAG rendering).

**New API endpoints:**

```
PUT /api/workflows/:id  — already handles action updates; extend to accept `branches` per action
POST /api/workflows/:id/actions/:actionId/branches  — add a branch to an action
DELETE /api/workflows/:id/actions/:actionId/branches/:branchId  — remove a branch
GET /api/workflows/:id/branch-validation  — validate DAG is acyclic before save
```

**Timeline estimate:** 6 weeks.
- Week 1–2: DB schema extension, BullMQ branching execution model, `ActionWorker` branch evaluation
- Week 3: `BranchCheckWorker` for time-delayed branches, `workflow_scheduled_branches` table
- Week 4: LangGraph `parse_branch_conditions` and `validate_branch_dag` nodes
- Week 5–6: Frontend DAG builder, `BranchConnector`, `BranchConditionEditor`, branch visual rendering

**Dependencies and risks:**

- Cyclic graph prevention is critical. The `validate_branch_dag` API endpoint and the corresponding backend validation in `PUT /api/workflows/:id` must both enforce acyclicity. A cycle in a branching workflow would cause infinite looping in the action queue.
- Branch depth limit: cap at 3 levels of branching to prevent runaway graph complexity and to keep the builder UI comprehensible. Enforce at the API level.
- The NL parser will struggle with complex multi-branch descriptions. The Tier 1 degradation path from C-006 must be in place before branching ships — Crystal should partially parse a branching request and flag what it skipped rather than failing silently.

---

## Expansion 2: Multi-Survey Orchestration

### Problem Statement

All Phase 1–5 workflows are scoped to a single survey (or all surveys in an org via tag-group or org scope, but without cross-survey correlation). The business problem this leaves unsolved: "When our Mobile NPS AND our Desktop NPS both drop simultaneously, that indicates a product-level problem, not a channel problem. I want one unified alert for that scenario, not two separate alerts that fire independently."

Cross-survey compound triggers require Crystal to detect correlated signals across survey programs and emit a unified trigger event. This is not a simple threshold check — it requires understanding that two events are causally related and worth treating as a single incident.

### User Stories

- "Fire when both our Mobile App CSAT and our Desktop CSAT drop below 35 in the same 24-hour window."
- "Fire when any three of our five regional NPS surveys show simultaneous drops above 10 points."
- "Alert me when Crystal detects that the same complaint theme appears across both our post-purchase survey and our support survey in the same week."

### Technical Design

**New trigger type: `compound_condition`**

```sql
-- Extend the trigger_type CHECK constraint to include compound_condition
-- (requires a migration to modify the CHECK constraint)

-- trigger_config for compound_condition:
-- {
--   "operator": "all" | "any" | "majority",  -- all must fire, any one must fire, >50% must fire
--   "min_count": 2,                           -- for "any": at minimum N of the conditions
--   "window_minutes": 1440,                   -- all conditions must fire within this window
--   "sub_conditions": [
--     {
--       "survey_id": "uuid",
--       "trigger_type": "nps_threshold",
--       "trigger_config": { "threshold": 35, "direction": "below", "window_hours": 24 }
--     },
--     {
--       "survey_id": "uuid",
--       "trigger_type": "nps_threshold",
--       "trigger_config": { "threshold": 35, "direction": "below", "window_hours": 24 }
--     }
--   ]
-- }

-- New table to track partial compound trigger state
CREATE TABLE workflow_compound_trigger_state (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id       UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  org_id            UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Which sub-conditions have fired and when
  fired_conditions  JSONB NOT NULL DEFAULT '[]',
  -- [{ "sub_condition_index": 0, "fired_at": "ISO8601", "trigger_payload": {...} }]

  window_started_at TIMESTAMPTZ NOT NULL,
  window_expires_at TIMESTAMPTZ NOT NULL,  -- window_started_at + window_minutes

  -- Whether this state record has already produced a workflow run
  -- (prevents double-firing if all conditions fire simultaneously)
  consumed          BOOLEAN NOT NULL DEFAULT false,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_compound_state_workflow ON workflow_compound_trigger_state(workflow_id, consumed)
  WHERE consumed = false;
CREATE INDEX idx_compound_state_expiry ON workflow_compound_trigger_state(window_expires_at)
  WHERE consumed = false;
```

**Execution model for compound triggers:**

When a sub-condition fires (e.g., Mobile CSAT drops below 35), the `TriggerWorker` does not immediately create a `WorkflowRun`. Instead:

1. It upserts a record in `workflow_compound_trigger_state`, recording which sub-condition fired and its payload.
2. It evaluates whether the compound condition is now satisfied (e.g., both sub-conditions have fired within the window).
3. If satisfied: create a `WorkflowRun` with a merged trigger payload containing context from all sub-conditions, mark the state record as `consumed: true`.
4. If not yet satisfied: do nothing. A background job (`CompoundStateExpiryWorker`) runs every 5 minutes to expire state records whose window has passed without all conditions firing, setting `consumed: true` on expired records.

The merged trigger payload for the workflow run:
```json
{
  "compound_trigger": {
    "conditions_fired": 2,
    "conditions_required": 2,
    "sub_results": [
      { "survey_id": "...", "survey_name": "Mobile CSAT", "nps_score": 32 },
      { "survey_id": "...", "survey_name": "Desktop CSAT", "nps_score": 31 }
    ]
  }
}
```

This context is available to action templates as `{{compound.sub_results}}` and `{{compound.conditions_fired}}`.

**CrystalOS: new LangGraph node `correlate_survey_signals`**

```python
# crystalos/skills/workflow/compound_triggers.py

class SurveySignalCorrelation(BaseModel):
    survey_ids: List[str]
    signal_type: str
    correlation_confidence: float   # 0.0 - 1.0
    window_hours: int
    correlated_payloads: List[dict]
    narrative: str  # "Both Mobile and Desktop CSAT dropped simultaneously..."

# Graph node: correlate_survey_signals
# Called after the insight pipeline runs for multiple surveys.
# Checks whether any compound_condition workflows are partially satisfied and
# whether the new signal would satisfy a pending compound state.
# Emits correlation_detected events to the backend for compound trigger evaluation.
```

**Frontend trigger picker changes:**

The compound trigger type is only available on the Growth and Enterprise tiers. In the trigger picker, it appears in a new "CROSS-SURVEY" section:

```
CROSS-SURVEY  (Growth)
  [link icon]   Cross-Survey Compound       compound_condition   [Crystal]
```

Selecting it opens a multi-survey sub-condition builder in the right panel: a list of sub-condition rows, each of which is itself a mini trigger config (survey selector + trigger type + threshold). The visual builder canvas renders compound trigger cards with a split input at the top showing which surveys feed into the compound condition.

**Performance implications:**

Cross-survey compound trigger evaluation requires joining metrics across multiple surveys. This is the most compute-intensive query pattern in the entire workflow system. Mitigations:

1. Compound trigger sub-conditions are evaluated lazily — only when any individual sub-condition fires, not on every scheduler tick across all surveys
2. Maximum 5 sub-conditions per compound trigger (enforced at the API level)
3. Maximum 2 compound_condition workflows per org on Growth tier; 10 on Enterprise
4. The `workflow_compound_trigger_state` index on `(workflow_id, consumed)` keeps state lookups O(1) per workflow per tick

**New API endpoints:**

```
POST /api/workflows/compound-trigger           — create workflow with compound_condition trigger
GET /api/workflows/:id/compound-state          — current partial-fire state for a compound workflow
POST /api/workflows/:id/compound-state/reset   — manually reset a partially-satisfied compound state
```

**Timeline estimate:** 5 weeks.
- Week 1: DB schema (`compound_condition` trigger type, `workflow_compound_trigger_state`), compound state management logic
- Week 2: `TriggerWorker` compound evaluation, `CompoundStateExpiryWorker`, merged trigger payload
- Week 3: CrystalOS `correlate_survey_signals` node, cross-survey signal emission
- Week 4: Frontend compound trigger builder, sub-condition editor, multi-survey canvas card
- Week 5: Integration tests, performance validation with 50+ survey orgs, rate limiting enforcement

**Dependencies and risks:**

- Compound triggers depend on Branching Workflow Logic (Expansion 1) not technically, but they are logically expected together — teams who want compound triggers also want to branch based on which sub-conditions fired.
- The `window_minutes` configuration is user-facing and will be misunderstood. A window that is too short means both surveys must drop in a 5-minute window to satisfy the condition — almost never true for NPS. A window that is too long means unrelated drops hours apart incorrectly satisfy the condition. Default to 1440 minutes (24 hours) and add a tooltip: "Both conditions must fire within this window to count as simultaneous."

---

## Expansion 3: AI-Authored Actions (Crystal-Written Notifications)

### Problem Statement

All current action notifications are template-based. The Slack message says: "NPS Alert: {{survey.name}} dropped to {{trigger.nps_score}}." This is useful, but it is static. It does not tell the CX team which customer segments are affected, what themes drove the drop, whether this is a one-time anomaly or a trend, or what the recommended response is.

Crystal already performs analysis at the request of the `crystal_analysis` action type. AI-Authored Actions takes this further: instead of a CX manager authoring the notification template, Crystal writes the full notification content in context, dynamically, at workflow execution time.

The result is a Slack message that reads: "NPS dropped to 28 on the Mobile App survey (412 responses in the last 24 hours). Crystal identified three contributing themes: checkout friction (+40% frequency vs. prior week), app crashes on iOS 17 (+25%), and unclear pricing on the upgrade screen (+18%). This follows a 3-week trend of declining mobile scores. Recommended action: immediate sync with the iOS team. [View full analysis →]"

This cannot be authored as a template. It must be generated.

### User Stories

- "When NPS drops, send a Slack message that explains why — themes, trends, verbatims — not just the number."
- "When Crystal detects a new theme, write the Jira ticket description automatically with the theme details and supporting quotes."
- "Send the weekly leadership email, but have Crystal write it in context rather than using a fixed template."

### Technical Design

**New CrystalOS skill: `action_content_generator`**

```python
# crystalos/skills/workflow/action_content_generator.py

class ActionContentRequest(BaseModel):
    action_type: Literal['slack_notification', 'send_email', 'create_jira_ticket',
                          'create_zendesk_ticket', 'notify_in_app']
    context: ActionContentContext

class ActionContentContext(BaseModel):
    trigger_payload: dict          # full trigger context at fire time
    survey_summary: SurveySummary  # name, question count, response count, dates
    crystal_analysis: Optional[CrystalAnalysisResult]  # if crystal_analysis ran prior
    org_context: OrgContext        # org name, industry, tone preferences
    delivery_target: str           # channel name, email address, or Jira project key
    max_length_chars: Optional[int]  # channel-specific length guidance

class ActionContentResult(BaseModel):
    content: str                   # the generated notification text
    subject: Optional[str]         # for email only
    crystal_generated: bool        # always True for this skill
    generation_tokens: int         # for cost tracking
    generation_latency_ms: int

# LangGraph node: generate_action_content
# Inputs: ActionContentRequest
# System prompt emphasizes: factual, concise, action-oriented, no hallucination
# Uses only the provided context — no retrieval beyond what is passed in
# Output format varies by action_type:
#   slack: plain text with bold (*) and bullet formatting
#   email: HTML with structured sections
#   jira: Atlassian Document Format (ADF) JSON
#   zendesk: plain text
#   in_app: short (max 240 chars) plain text
```

**New `action_config` field: `content_mode`**

```typescript
// For action types that produce content (slack, email, jira, zendesk, notify_in_app):
{
  content_mode: 'template' | 'crystal_generated';

  // When content_mode = 'template': existing behavior unchanged
  message: "NPS Alert: {{survey.name}} dropped to {{trigger.nps_score}}",

  // When content_mode = 'crystal_generated':
  // The message field is ignored at execution time.
  // Crystal generates the content using ActionContentRequest.
  crystal_content_guidance: string;  // optional user guidance: "focus on mobile themes"
  crystal_max_length: number;        // default: 1000 chars for Slack, 3000 for email
}
```

**Execution flow change in `ActionWorker`:**

When `content_mode: 'crystal_generated'` is set:
1. Gather context: trigger payload, survey summary, any prior `crystal_analysis` step output
2. POST to CrystalOS `/skills/workflow/generate-action-content` (internal API)
3. Wait for response (with `crystal_wait_timeout_ms: 8000` — 8 seconds maximum before fallback)
4. Fallback if timeout: use a minimal template-style message: "Alert: [survey name] — [trigger summary]. Crystal analysis pending."
5. Proceed with the generated content in the rendered action config

**Latency implications:**

Generating content adds 2–5 seconds to the workflow execution time for the affected action step. This is acceptable for most workflows (NPS alerts, Jira ticket creation, weekly digests) where the value of the context outweighs the latency. It is not acceptable for `response_submitted` workflows that fire on every submission.

Hard rule: `content_mode: 'crystal_generated'` is not available for `response_submitted` triggers. The UI enforces this: the Crystal-generated content toggle is disabled with a tooltip: "AI-authored content is not available for per-response triggers due to latency requirements."

**Cost implications:**

Each workflow fire with a `crystal_generated` action = one LLM call. At current OpenRouter costs (~$0.003 per generation at Sonnet 4 pricing), a workflow firing 100 times per month adds approximately $0.30/month in AI costs per crystal-generated action. This is negligible at low volumes but meaningful at enterprise scale (10,000 fires/month = $30/month per crystal action).

Pricing model: include AI-authored action usage in the Growth tier up to 500 crystal-generated actions per month. Above 500, charge $0.01 per generation (cost-plus with margin). Track usage in a new `crystal_action_usage` table per org per billing period.

**New API endpoint:**

```
POST /api/internal/generate-action-content
  Body: ActionContentRequest
  Response: ActionContentResult
  Auth: X-Internal-Key (backend calls CrystalOS, same pattern as workflow-signals)
```

**Frontend changes:**

In the action config right panel for content-supporting action types, add a toggle below the message field:

```
Message content
  [x] Write the message myself (template)
  [ ] Let Crystal write it in context

Crystal will generate this notification using the trigger data, Crystal analysis
output, and your survey context at the moment the workflow fires.

Optional guidance for Crystal:
[ Focus on mobile-specific themes... ]    (text input, max 200 chars)
```

When "crystal generated" is selected, the message textarea is hidden and replaced with the guidance input. The test mode (Safe Run) renders a sample generated message using placeholder context so the user can see what Crystal-authored content looks like before enabling.

**Timeline estimate:** 4 weeks.
- Week 1: CrystalOS `action_content_generator` skill, `generate_action_content` LangGraph node, internal API endpoint
- Week 2: `ActionWorker` content_mode routing, fallback behavior, latency handling
- Week 3: Usage tracking, pricing enforcement in plan middleware
- Week 4: Frontend toggle UI, test mode preview, Slack/email/Jira format variations

**Dependencies:** Crystal Builder (Phase 3) must ship first — the content generator shares the LLM calling infrastructure and CrystalOS context-gathering patterns established in Phase 3.

---

## Expansion 4: Workflow Marketplace

### Problem Statement

Every CX team solves similar problems: NPS drop alerts, weekly digests, Jira backlog feeds, survey launch notifications. Today, each team builds these from scratch. The template gallery (12 pre-built templates) is a start, but it is maintained only by the Xperiq team and covers only the most generic use cases.

A marketplace lets the Xperiq community contribute workflow templates, and lets enterprise customers maintain private internal template libraries. "Most installed: Monthly NPS Digest — 2,847 installs" becomes a social proof signal that this template solves a real problem. An enterprise customer with 50 Xperiq orgs can publish a "corporate standard NPS alert workflow" to an internal marketplace that all 50 orgs can install in one click.

### Technical Design

**New DB tables:**

```sql
CREATE TABLE workflow_marketplace_listings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL REFERENCES organizations(id),  -- publishing org
  created_by        UUID NOT NULL REFERENCES users(id),

  -- Identity
  name              TEXT NOT NULL,
  description       TEXT NOT NULL,
  category          TEXT NOT NULL,  -- 'nps', 'csat', 'response_mgmt', 'compliance', 'reporting'
  tags              TEXT[] NOT NULL DEFAULT '{}',

  -- Template content (the workflow config, scrubbed of org-specific data)
  template_spec     JSONB NOT NULL,
  -- Same shape as CreateWorkflowRequest but with:
  -- - integration_id fields replaced with "{{integration.slack}}" type placeholders
  -- - webhook URLs replaced with placeholders
  -- - org-specific email addresses replaced with "{{org.cx_team_email}}" variables

  -- Visibility
  visibility        TEXT NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('public', 'private', 'enterprise')),
  -- public: visible to all Xperiq users
  -- private: visible only within the publishing org
  -- enterprise: visible to org and all orgs in the same enterprise account

  -- Vetting status (for public listings)
  status            TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'deprecated')),
  reviewed_by       UUID REFERENCES users(id),  -- Xperiq staff reviewer
  review_notes      TEXT,

  -- Metrics
  install_count     INTEGER NOT NULL DEFAULT 0,
  rating_avg        NUMERIC(3, 2),      -- 1.00 to 5.00
  rating_count      INTEGER NOT NULL DEFAULT 0,

  -- Pricing
  price_credits     INTEGER NOT NULL DEFAULT 0,  -- 0 = free
  -- future: premium templates cost credits from the org's credit balance

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);

CREATE INDEX idx_marketplace_status    ON workflow_marketplace_listings(status, visibility);
CREATE INDEX idx_marketplace_category  ON workflow_marketplace_listings(category) WHERE deleted_at IS NULL;
CREATE INDEX idx_marketplace_installs  ON workflow_marketplace_listings(install_count DESC);

CREATE TABLE workflow_installs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id        UUID NOT NULL REFERENCES workflow_marketplace_listings(id),
  org_id            UUID NOT NULL REFERENCES organizations(id),
  installed_by      UUID NOT NULL REFERENCES users(id),
  workflow_id       UUID NOT NULL REFERENCES workflows(id),  -- the created workflow
  installed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (listing_id, org_id)  -- one install per org per listing
);
```

**Publishing flow:**

1. A user with an existing workflow clicks "Publish to Marketplace" from the workflow's context menu (accessible to Owners only).
2. The backend runs a `scrubListingSpec(workflowConfig)` function that:
   - Replaces integration UUIDs with named placeholders (`{{integration.slack}}`)
   - Replaces hardcoded webhook URLs with `{{webhook_url}}` placeholder
   - Replaces specific email addresses with `{{org.cx_team_email}}`
   - Preserves all threshold values, trigger types, and action structure
3. The user completes a publishing form: title, description, category, tags, visibility
4. The listing is created with `status: 'pending'`
5. For `visibility: 'public'`: the listing enters a review queue. Xperiq staff review within 2 business days and set status to `approved` or `rejected` with notes.
6. For `visibility: 'private'` or `'enterprise'`: the listing is immediately active (no review required).

**Installation flow:**

When an org installs a marketplace listing, the backend:
1. Takes the `template_spec` from the listing
2. Renders any `{{integration.X}}` placeholders by looking up the org's configured integrations for that service type
3. If an integration is not configured, the workflow is created with a validation error on the affected action — the user sees an "Integration required" warning and can complete setup before enabling
4. Creates a new `workflow` record and a `workflow_installs` record linking the workflow back to the listing
5. The installed workflow is a full copy — the org owns it and can modify it freely; changes do not affect the listing

**Privacy — what is scrubbed when publishing:**

A `ScrubListingSpec` function in `backend/src/services/marketplaceService.ts` applies these transforms:
- All UUIDs referencing the org's specific integrations → service-type placeholder
- All hardcoded email addresses matching `@{org_domain}` → `{{org.cx_team_email}}`
- All hardcoded webhook URLs → `{{webhook_url_required}}`
- All Jira project keys → preserved (they are configuration, not secrets)
- All NPS thresholds, cooldown values, cron expressions → preserved
- The `scope_survey_id` → removed (the installing org will select their own survey)

**Revenue model:**

Premium templates (price_credits > 0) deduct credits from the org's balance at install time. The Xperiq credit system is a future billing feature; for the initial marketplace launch, all templates are free (`price_credits: 0`). The schema supports paid templates from day one.

**Frontend: Marketplace Page**

New route: `/marketplace`

```
Workflows Marketplace

[Search templates...]   [Category: All ▾]   [Sort: Most installed ▾]

Featured Templates
  [Card]  [Card]  [Card]  [Card]

NPS & CX Alerts
  [Card]  [Card]  [Card]

Reporting & Digests
  [Card]  [Card]
```

Marketplace listing card:
```
┌─────────────────────────────────────────────────┐
│  [gauge icon]  Monthly NPS Digest                │
│  By: Xperiq Team           ★ 4.8 (124 ratings)  │
│                                                  │
│  Sends a Crystal-authored NPS summary to         │
│  leadership every Monday morning.                │
│                                                  │
│  [clock]  [Crystal]  [email]                     │
│                                                  │
│  2,847 installs           FREE                   │
│  [Install →]                                     │
└─────────────────────────────────────────────────┘
```

**Trust and safety:**

Public listings require Xperiq staff review. Review checklist:
- Template spec does not contain hardcoded URLs or API keys (automated check)
- Template produces meaningful output (manual spot-check)
- Template name and description are accurate
- Template does not enable prohibited use cases (data exfiltration via webhook, rate limit abuse)

Flagging system: installed orgs can flag a listing. Three flags from different orgs trigger automatic suspension pending re-review.

**New API endpoints:**

```
GET  /api/marketplace                              — list marketplace listings (paginated, filterable)
GET  /api/marketplace/:listingId                   — get listing detail + template preview
POST /api/marketplace                              — create a listing (publishes from existing workflow)
POST /api/marketplace/:listingId/install           — install a listing into the current org
POST /api/marketplace/:listingId/rate              — submit a 1–5 star rating
GET  /api/marketplace/my-listings                  — listings published by the current org
```

**Timeline estimate:** 5 weeks.
- Week 1: DB tables, scrubListingSpec function, publish flow, listing CRUD API
- Week 2: Installation flow, integration placeholder resolution, workflow creation from template spec
- Week 3: Review queue (simple internal admin page), flagging system
- Week 4: Frontend marketplace page, listing cards, install flow, "My listings" management
- Week 5: Rating system, category/search/filter, private marketplace for Enterprise tier

---

## Expansion 5: Self-Healing Workflows (Crystal Monitors Workflow Health)

### Problem Statement

Workflows break silently. An API token expires. A Slack channel is renamed. A Jira project is archived. The workflow keeps running — or worse, appears to be running — but its actions are silently failing. The only way to discover this today is to check the run history and notice the error rows.

Crystal is already monitoring workflow execution data (it emits signals and analyzes survey data). The natural extension is to have Crystal monitor the health of the automation system itself and proactively alert the CX manager to problems before they become invisible failures.

### Technical Design

**New CrystalOS skill: `workflow_health_monitor`**

```python
# crystalos/skills/workflow/workflow_health_monitor.py

class WorkflowHealthIssue(BaseModel):
    workflow_id: str
    workflow_name: str
    issue_type: Literal[
        'integration_auth_failure',    # 401/403 errors from an integration
        'integration_timeout',         # consistent timeouts on a specific action
        'high_failure_rate',           # >20% of recent runs failed
        'dormant_enabled',             # enabled but no fires in 30+ days with active survey
        'cooldown_misconfiguration',   # workflow fires then immediately cooldowns, pattern suggests wrong cooldown
        'crystal_signal_silent',       # AI trigger enabled but no signals emitted in 14+ days
    ]
    severity: Literal['warning', 'error', 'info']
    description: str             # human-readable explanation of the issue
    suggested_fix: str           # actionable resolution (Crystal's recommendation)
    action_proposal: Optional[dict]  # if Crystal can auto-fix, an action_proposal JSON

# New LangGraph subgraph: analyze_workflow_failures
# Inputs: workflow run history (last 30 days), integration health signals
# Outputs: List[WorkflowHealthIssue]
#
# Nodes:
#   1. fetch_run_summary: aggregate run_steps by action_type, error_code, org_id
#   2. detect_auth_failures: group 401/403 error codes by integration type
#   3. detect_timeout_patterns: identify actions with p95 duration > timeout threshold
#   4. detect_dormancy: enabled workflows with zero fires vs. active surveys
#   5. emit_health_proposals: format each issue as action_proposal type 'fix_workflow_integration'
```

**New backend job: `WorkflowHealthScanJob`**

Runs on a weekly cron (every Monday at 6 AM UTC, before CX managers arrive):

```typescript
// backend/src/scheduler/WorkflowHealthScanJob.ts

class WorkflowHealthScanJob {
  async run(): Promise<void> {
    const orgs = await this.getOrgsWithActiveWorkflows();

    for (const org of orgs) {
      const runHistory = await this.workflowRunRepository.getHealthSummary({
        orgId: org.id,
        lookbackDays: 30,
      });

      const healthIssues = await this.crystalOsClient.analyzeWorkflowHealth({
        orgId: org.id,
        runHistory,
      });

      for (const issue of healthIssues) {
        await this.createHealthProposal(org.id, issue);
      }
    }
  }

  private async createHealthProposal(orgId: string, issue: WorkflowHealthIssue) {
    // Writes an action_proposal of type 'fix_workflow_integration' to the proposals table.
    // This is picked up by the Crystal notification system and delivered to org admins
    // via the existing notify_in_app action mechanism.
  }
}
```

**New action_proposal type: `fix_workflow_integration`**

```typescript
// Extends the existing action_proposal system used by Crystal Builder

{
  proposal_type: 'fix_workflow_integration',
  workflow_id: string,
  issue_type: WorkflowHealthIssueType,
  title: string,         // "Your Jira integration is returning auth errors"
  description: string,   // "3 of 5 workflows using Jira have failed since Jun 25. Your Jira
                         //  API token may have expired. Here is how to regenerate it."
  suggested_actions: [
    {
      label: 'Go to Jira integration settings',
      url: '/settings/integrations/jira'
    }
  ],
  auto_fixable: false    // true for issues Crystal can resolve without user input (future)
}
```

**New frontend surface: Crystal Health Insights panel**

On the workflow detail page, a new collapsible panel below the workflow config (visible when there are active health issues):

```
Crystal Health Insights  [×]

⚠  Jira integration authentication failure
   3 of your last 5 runs that included a Jira action have returned
   401 errors. Your Jira API token likely expired.

   Detected: Jun 26, 2026 · affected runs: 3
   [Go to Jira Settings →]   [Dismiss]

ⓘ  This workflow has been dormant for 31 days.
   Your CSAT Q3 survey has 847 active responses but this workflow
   has not fired. Check that the survey scope matches the correct survey.
   [Review scope config →]   [Dismiss]
```

The panel is also surfaced as a notification in the Notification Center, using the existing `notify_in_app` infrastructure.

**Integration with DLQ and run history:**

The `WorkflowHealthScanJob` queries the `dead_letter_items` table (already created in Phase 1) and the `workflow_run_steps` table with error_code aggregation:

```sql
-- Sample query used by the health scanner
SELECT
  w.id, w.name, wa.action_type,
  wrs.error_code,
  COUNT(*) as error_count,
  MAX(wrs.created_at) as last_error_at
FROM workflow_run_steps wrs
JOIN workflow_runs wr ON wr.id = wrs.run_id
JOIN workflow_actions wa ON wa.id = wrs.action_id
JOIN workflows w ON w.id = wr.workflow_id
WHERE wr.org_id = $orgId
  AND wrs.status = 'failed'
  AND wrs.created_at > now() - interval '30 days'
GROUP BY w.id, w.name, wa.action_type, wrs.error_code
HAVING COUNT(*) >= 3
ORDER BY error_count DESC;
```

**New API endpoints:**

```
GET  /api/workflows/:id/health-insights       — current health issues for a workflow
POST /api/workflows/:id/health-insights/dismiss  — dismiss a specific issue
GET  /api/org/health-insights                 — org-wide health summary (for the org overview page)
```

**Timeline estimate:** 4 weeks.
- Week 1: CrystalOS `workflow_health_monitor` skill, `analyze_workflow_failures` LangGraph subgraph
- Week 2: `WorkflowHealthScanJob`, `fix_workflow_integration` proposal type, DLQ/run history integration
- Week 3: Frontend Crystal Health Insights panel, notification delivery
- Week 4: Org-wide health dashboard, dismissal persistence, severity-based alert routing

---

## Expansion 6: Compliance Workflows (GDPR/CCPA Automation)

### Problem Statement

Enterprise customers operating in the EU and California need to respond to data subject requests (DSRs) — specifically deletion requests (GDPR Article 17, CCPA), data export requests (GDPR Article 15), and opt-out requests (CCPA). Today, these are manual processes. A compliance officer receives a deletion request, manually identifies all surveys the person responded to, submits a deletion ticket, and tracks the 30-day response deadline.

Xperiq is the system of record for response data. It should also be the system that handles compliance automation for that data.

### Technical Design

**New trigger type: `data_subject_request`**

```sql
-- trigger_config for data_subject_request:
-- {
--   "request_type": "deletion" | "export" | "opt_out",
--   "source": "api" | "in_product_form",
--   "require_identity_verification": true,
--   "hold_period_days": 30  -- for deletion: data is held N days before permanent removal
-- }

CREATE TABLE data_subject_requests (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Subject identification
  respondent_email      TEXT NOT NULL,
  respondent_id         UUID,   -- if the respondent has a Xperiq account

  -- Request details
  request_type          TEXT NOT NULL CHECK (request_type IN ('deletion', 'export', 'opt_out')),
  request_source        TEXT NOT NULL,  -- 'api', 'in_product_form', 'email_intake'
  legal_basis_verified  BOOLEAN NOT NULL DEFAULT false,
  identity_verified_at  TIMESTAMPTZ,

  -- Processing state
  status                TEXT NOT NULL DEFAULT 'received' CHECK (status IN (
    'received',
    'identity_verification_pending',
    'processing',
    'hold_period',          -- deletion requests: data identified, awaiting hold period
    'completed',
    'rejected',
    'error'
  )),
  hold_period_expires_at TIMESTAMPTZ,   -- for deletion requests

  -- Audit trail (GDPR Article 30 requirement)
  processing_log        JSONB NOT NULL DEFAULT '[]',
  -- [{ "timestamp": "ISO8601", "action": "...", "actor": "system|user_id", "detail": "..." }]

  -- Output
  export_url            TEXT,           -- for export requests: signed URL to download
  export_expires_at     TIMESTAMPTZ,

  -- Linked workflow run
  workflow_run_id       UUID REFERENCES workflow_runs(id),

  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at          TIMESTAMPTZ,
  deleted_at            TIMESTAMPTZ     -- soft delete only; DSRs are never hard-deleted
);

CREATE INDEX idx_dsr_org_status ON data_subject_requests(org_id, status);
CREATE INDEX idx_dsr_hold_expiry ON data_subject_requests(hold_period_expires_at)
  WHERE status = 'hold_period';
```

**New action types:**

```sql
-- The workflow_actions.action_type CHECK constraint adds:
'export_respondent_data',
'queue_respondent_deletion',
'pause_survey_for_respondent',
'notify_dsr_completion'
```

Action config examples:

```json
// export_respondent_data
{
  "scope": "all_surveys" | "specific_surveys",
  "survey_ids": [],           // empty = all surveys
  "format": "json" | "csv",
  "deliver_to": "{{dsr.requester_email}}",
  "encryption": "pgp",        // optional PGP encryption of the export
  "expiry_hours": 72          // signed URL expiry
}

// queue_respondent_deletion
{
  "scope": "all_surveys" | "specific_surveys",
  "survey_ids": [],
  "hold_period_days": 30,     // GDPR allows up to 30 days to complete deletion
  "anonymize_vs_delete": "delete",
  "confirm_deletion_email": "{{dsr.requester_email}}"
}

// pause_survey_for_respondent
{
  "survey_ids": [],           // specific surveys to pause enrollment for this respondent
  "reason": "Data subject opt-out — request ID {{dsr.request_id}}"
}
```

**Compliance audit trail (GDPR Article 30):**

Every action in a compliance workflow appends an entry to `data_subject_requests.processing_log`. The log is append-only (no deletes, no updates to existing entries). The Xperiq admin interface provides an exportable compliance report for a given DSR showing the complete audit trail: when the request was received, when identity was verified, when each action executed, when the deletion hold period started, and when deletion completed.

**Legal review gate:**

Before a `queue_respondent_deletion` action executes, the workflow pauses and sends a notification to the configured legal review contact with a 48-hour window to object. This is implemented as a time-delayed branch (Expansion 1): the deletion action is preceded by a `notify_in_app` action with a "Confirm deletion" button. If no confirmation arrives within 48 hours AND no objection is raised, the deletion proceeds automatically.

The legal gate is optional (configured in the DSR trigger config: `require_legal_gate: true | false`) and defaults to true for Enterprise tier.

**New API endpoints:**

```
POST /api/data-subject-requests          — submit a DSR (customer-facing intake)
GET  /api/data-subject-requests          — list DSRs for the org (admin)
GET  /api/data-subject-requests/:id      — get DSR detail + audit log
POST /api/data-subject-requests/:id/verify-identity  — mark identity as verified
GET  /api/data-subject-requests/:id/export            — get export download URL
POST /api/admin/data-subject-requests/:id/confirm-deletion  — confirm the deletion (legal gate)
```

**Timeline estimate:** 6 weeks.
- Week 1–2: `data_subject_requests` table, DSR intake API, identity verification flow
- Week 3: New action types (export, deletion, opt-out), action executors, hold period logic
- Week 4: Legal review gate (time-delayed branch, requires Expansion 1 to be complete)
- Week 5: Compliance audit trail, GDPR Article 30 report export
- Week 6: Frontend DSR management page, admin review interface

**Dependencies:** Requires Branching Workflow Logic (Expansion 1) for the legal review gate time-delayed branch pattern.

---

## Expansion 7: Conversational Workflow Creation via Voice (2027)

### Problem Statement

The Crystal Builder already reduces workflow creation to plain English. The natural endpoint of this direction is eliminating the keyboard entirely. In 2027, a CX manager on their phone between meetings should be able to say "Hey Crystal, alert my team when mobile NPS drops below 30" and have a workflow live in under 15 seconds.

This is not a novelty feature. It removes the last remaining friction in the most important moment of a CX manager's day: when they have just seen a bad number and want immediate action, before they are back at their desk.

### Technical Design

**Speech-to-text pipeline:**

Xperiq mobile app (iOS/Android) handles voice input natively:

1. User long-presses the Crystal microphone button in the app nav
2. iOS/Android native speech recognition converts audio to text in real time (Apple Speech framework / Android SpeechRecognizer)
3. Transcript streams to the Xperiq mobile client as text
4. On release, the full transcript is sent to the existing `POST /api/workflows/crystal-build` endpoint (same endpoint used by the Crystal Builder in the web app — no new backend required)

Native ASR is preferred over OpenAI Whisper for two reasons: zero additional latency (on-device processing) and zero additional cost. Whisper is the fallback for languages with poor native ASR support. The mobile client detects ASR quality (confidence score) and falls back to Whisper via `POST /api/internal/transcribe` if confidence < 0.85.

**Voice confirmation UX:**

After Crystal builds the workflow from the voice transcript, the standard confirm-card is displayed visually on the mobile screen. But Crystal also reads the workflow back aloud using the device's text-to-speech:

```
Crystal (spoken):
  "I'll create a workflow called 'Mobile NPS Alert.'
   When NPS on your Mobile App survey drops below 30,
   I'll send a Slack message to #cx-alerts.
   Should I enable it now?"
```

The user responds verbally ("Yes" / "Enable it" / "No") or taps the Confirm or Cancel button. Voice command recognition for the confirmation step is limited to a binary yes/no intent classifier running on-device — no LLM call required for this step.

**Crystal reads back config changes:**

If the user says "Wait, make it 25, not 30" after Crystal has already read the config, the mobile client sends a refinement request to the existing `nl_to_workflow` subgraph with the original spec plus the refinement instruction:

```python
# Refinement handled in nl_to_workflow as a "patch" request:
class NlToWorkflowRefinement(BaseModel):
    original_spec: WorkflowSpec
    refinement_instruction: str  # "change the threshold to 25"
    # The graph re-runs from parse_intent with the original spec as context
    # and applies the refinement as a diff
```

The refined spec is spoken back again: "Updated. The threshold is now 25. Should I enable it?"

**Mobile-specific workflow management UI:**

The mobile app does not attempt to replicate the full visual builder — that stays on desktop. The mobile workflow management surface is limited to:

- Voice creation via Crystal (the primary mobile surface)
- Workflow list: card view, enable/disable toggle, view run history
- Run history: simplified list view with per-run status (no expanded step detail)
- Quick disable: long-press a workflow card to immediately disable it without navigating into detail

New React Native screens:
- `MobileWorkflowsScreen` — list view, optimized for one-hand use
- `MobileWorkflowDetailScreen` — status, enable/disable, run count
- `MobileRunHistoryScreen` — simple timeline of recent runs
- `VoiceCrystalSheet` — bottom sheet that appears during voice recording

**New API endpoint:**

```
POST /api/internal/transcribe          — Whisper transcription fallback
  Body: { audio_base64: string, language: string }
  Response: { transcript: string, confidence: number }
  Auth: Bearer JWT (mobile client, same auth as web)
```

The `POST /api/workflows/crystal-build` endpoint already handles structured `description` input. The voice pipeline simply provides the transcript as the description. No new workflow creation endpoint is required.

**Timeline estimate:** 5 weeks.
- Week 1: iOS Speech framework integration, audio recording UI in mobile app
- Week 2: Voice confirmation UX, text-to-speech Crystal readback, yes/no intent classifier
- Week 3: Whisper fallback endpoint, language detection, confidence threshold routing
- Week 4: Refinement request handling in `nl_to_workflow`, multi-turn voice conversation support
- Week 5: Mobile workflow management screens, end-to-end testing across device types and accents

**Dependencies:** Requires Phase 3 (Crystal Builder) to be stable and the `POST /api/workflows/crystal-build` endpoint to have a low p95 latency (target: under 4 seconds from transcript to confirm-card). If Phase 3 latency exceeds this target, the voice experience will feel broken.

---

## Implementation Roadmap

The seven expansions have the following dependency structure:

```
Phase 5 (GA) — the foundation all expansions build on
        │
        ├── Expansion 1: Branching Logic (6 weeks)
        │       │
        │       ├── Expansion 2: Multi-Survey Orchestration (5 weeks, depends on E1 for rich branching)
        │       │
        │       └── Expansion 6: Compliance Workflows (6 weeks, depends on E1 for legal gate)
        │
        ├── Expansion 3: AI-Authored Actions (4 weeks, depends on Phase 3 Crystal stability)
        │
        ├── Expansion 4: Workflow Marketplace (5 weeks, independent)
        │
        ├── Expansion 5: Self-Healing Workflows (4 weeks, independent)
        │
        └── Expansion 7: Voice Creation (5 weeks, depends on Phase 3 Crystal stability + mobile app)
```

**Recommended sequencing for a two-person backend team + one frontend engineer:**

Quarter 1 post-GA (Q4 2026):
- Expansion 1: Branching Logic — this is the unlock for E2 and E6; ship it first
- Expansion 5: Self-Healing Workflows — highest trust impact, lowest scope; parallelize with E1

Quarter 2 (Q1 2027):
- Expansion 3: AI-Authored Actions — differentiator, drives Growth tier upgrades
- Expansion 2: Multi-Survey Orchestration — requires E1 complete

Quarter 3 (Q2 2027):
- Expansion 4: Workflow Marketplace — community flywheel; begin building while E3 stabilizes
- Expansion 6: Compliance Workflows — enterprise sales requirement; can parallel-staff

Quarter 4 (Q3 2027):
- Expansion 7: Voice Creation — the 2027 flagship feature; mobile app prerequisite must be ready

---

## What Makes Xperiq Actions Defensibly Different in 2027

The seven expansions collectively constitute a competitive moat that is extremely difficult to replicate without the same underlying architecture.

The first dimension of the moat is the integration of AI as a native participant in every layer of the automation system, not as a feature bolted on after the fact. Crystal does not just trigger workflows — it writes the content of the notifications they send, monitors the health of the automation program, creates new workflows from a sentence of natural language or a spoken phrase, and proposes compliance remediation steps based on failure patterns. No other XM platform has this. Qualtrics and Medallia have automation with static rules and email alerts. Xperiq in 2027 has a system that reasons about its own behavior and improves over time. That is a fundamentally different product category.

The second dimension is the combination of compliance automation with CX automation in the same workflow engine. By 2027, data privacy regulation will have tightened further across the EU, US, and APAC. An enterprise CX team will not want to manage two separate automation systems — one for CX signals and one for GDPR compliance. Xperiq Actions handles both using the same trigger-condition-action model, the same audit trail, and the same builder interface. The compliance workflow triggers receive the same Crystal intelligence as the CX signal triggers. When Crystal detects an emerging complaint theme that intersects with a data subject request, the same workflow engine handles both the alert to the CX team and the compliance response to the affected respondent.

The third dimension is the marketplace flywheel. Once a critical mass of CX teams is sharing workflow templates, two things happen. First, the marginal cost of setting up a new CX program on Xperiq drops toward zero — the standard workflows exist, they have thousands of installs, they are rated, they are maintained. Second, the marketplace creates lock-in that is qualitatively different from data lock-in. An org with 50 installed marketplace workflows has operational infrastructure built on Xperiq. Migrating away means rebuilding 50 workflows from scratch in a tool that does not have them. Data can be exported. Automation programs are rebuilt. The marketplace converts Xperiq from a data tool into an operational platform, and operational platforms have structurally higher retention than data tools.
