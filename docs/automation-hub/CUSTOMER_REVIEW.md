# Xperiq Actions — Customer Experience Review

**Reviewer:** Tom Reyes, CX Operations Manager
**Company type:** 1,200-person enterprise SaaS
**Evaluation context:** Xperiq Actions against current stack (Qualtrics, Medallia, Intercom Series)
**Review date:** 2026-06-29
**Status:** Pre-GA evaluation — findings submitted to product team

---

## Executive Summary

Xperiq Actions is one of the most promising automation tools I have seen built specifically for CX teams. The core proposition is correct: XM platforms should act on signals, not just surface them. The ten-trigger, ten-action model covers more ground than anything I have used before, and Crystal Signals — the AI-detected triggers — are genuinely differentiated. No competitor is doing that at this price point.

But this is not ready for my team to rely on Monday morning. Not yet.

The gaps are concentrated in three areas. First, the product assumes users already think in the system's vocabulary (trigger types, action chains, cooldown periods) when the real job is describing a situation in plain English and getting the right configuration back. Crystal Builder helps, but it has no documented failure behavior when you ask for something it cannot do. Second, the workflow list and card design surfaces fine-grained status information but no health signal — I cannot tell at a glance whether my automation program is working or silently broken. Third, the collaboration model is completely absent. I have a team. Some people should edit workflows, some should only view them, and the person who created a workflow should not be the only one who can fix a broken one at 2 AM.

The fixes are not architectural rewrites. Most are UI additions and one documentation gap in the action output variable system. With the eight changes in the "Must Fix" section addressed, this becomes a product I would put in front of my VP and defend.

---

## Review Methodology

I reviewed the following design documents provided by the Xperiq team:

- `DESIGN.md` — UI/UX specification for all five surfaces
- `ARCHITECTURE.md` — database schema, API design, trigger and action type specifications, execution engine
- `ROADMAP.md` — five-phase build plan over ten weeks
- `GTM.md` — pricing tiers, competitive positioning, target audience definitions

I evaluated the design against:
1. My own day-to-day usage patterns as a CX ops manager
2. Comparable features in Qualtrics, Medallia, and Intercom that my team currently uses
3. Eleven specific issues identified during the review, plus additional gaps surfaced during scenario walkthroughs

I did not have access to a working product. This is a design review, not a usability test. All scenario descriptions are based on how I would expect to use the product given the documented behavior.

---

## Finding Summary Table

| ID | Finding | Priority | Category |
|---|---|---|---|
| C-001 | Trigger picker has no grouping strategy | Must Fix | Onboarding / Discoverability |
| C-002 | Test mode uses hypothetical data only — no historical replay | Must Fix | Testing |
| C-003 | Action output variables not documented for non-Crystal actions | Must Fix | Configuration |
| C-004 | Cooldown UI is completely absent from the design spec | Must Fix | Configuration |
| C-005 | Workflow ownership and RBAC are undefined | Must Fix | Enterprise / Collaboration |
| C-006 | Crystal Builder has no graceful degradation path | Must Fix | AI / Trust |
| C-007 | No workflow health summary on the list page | Must Fix | Observability |
| C-008 | No bulk operations on the workflow list | Should Fix | Efficiency |
| C-009 | No user-facing workflow analytics | Should Fix | Observability |
| C-010 | No "what would fire right now" live trigger preview | Should Fix | Testing |
| C-011 | Action chaining is undocumented as a first-class concept | Should Fix | Configuration |

---

## Must Fix (before GA)

### C-001 — Trigger picker has no grouping strategy

**Priority:** Must Fix

**Description:**
The visual builder's left panel lists triggers as a flat set of ten items. The current design separates the sidebar into "Trigger", "Conditions", and "Actions" sections, but within the trigger section there is no grouping. A new user faces ten options with names like `response_count`, `new_theme_detected`, and `anomaly_detected` and has to understand what each means before selecting one.

**User pain:**
"As a CX manager opening the builder for the first time, I want to set up a workflow for when something goes wrong with my NPS. I do not know whether that is `nps_threshold`, `anomaly_detected`, or `sentiment_spike`. They all sound like they might be what I want. These are system vocabulary terms, not the vocabulary I use to describe my job."

Users do not think in trigger types. They think in situations:
- Something went wrong (NPS dropped, sentiment shifted, an anomaly appeared)
- Something completed (a response count threshold was reached, a survey was closed)
- It is time (a scheduled run, a weekly digest)
- Something specific happened (a response was submitted, a survey was published)

**Specific fix:**
Group the trigger picker into four labeled sections with plain-English labels:

```
TRIGGER PICKER

  ALERTS  (fires when something goes wrong)
    [gauge icon]        NPS Drop or Rise         nps_threshold
    [trend-down icon]   Response Rate Drop        response_rate_drop
    [heart-pulse icon]  Sentiment Shift           sentiment_spike      [Crystal]
    [alert-tri icon]    Statistical Anomaly       anomaly_detected     [Crystal]

  THRESHOLDS  (fires when a number is reached)
    [bar-chart icon]    Response Count            response_count

  AI SIGNALS  (Crystal detects these automatically)
    [sparkle icon]      New Emerging Theme         new_theme_detected   [Crystal]

  SCHEDULED
    [clock icon]        Time-Based Schedule        schedule

  EVENTS  (fires when something happens)
    [inbox icon]        New Response Submitted      response_submitted
    [activity icon]     Survey Status Change        survey_lifecycle
    [cursor icon]       Manual (button trigger)     manual
```

The [Crystal] badge on AI triggers signals that these require the Growth tier before the user clicks into them. A tooltip on hover: "Crystal Signals require a Growth plan. [Learn more]."

Add a one-line onboarding prompt at the top of the trigger picker (12px, muted color):
"Pick the situation you want to automate. Not sure where to start? Try NPS Drop or Rise."

---

### C-002 — Test mode uses hypothetical data only

**Priority:** Must Fix

**Description:**
Test mode (called "Safe Run" in the product) accepts a manually entered trigger payload. The user types `NPS score: 27.4`, `Response count: 412`, and the system returns a "would fire" preview. This is useful for structure validation, but it is not useful for establishing trust in the workflow before enabling it.

What a CX manager actually needs before enabling a new NPS alert workflow: "Would this have fired last Thursday when NPS hit 28.1? Let me see the full Slack message it would have sent — with the real survey name, the real Crystal summary from that date, and the Jira ticket description it would have written. If that looks right, I enable it."

The current design has no mechanism for replaying real historical data through a workflow that has not fired yet.

**User pain:**
"As a CX manager setting up a workflow for the first time, I want to test it with real data from my survey — not invented values I type into boxes. I want to see the actual Slack message that would have been sent last week, using the actual survey state from that moment. If it looks right, I trust it. If it looks wrong, I fix it. A test with made-up values does not give me that trust."

**Specific fix:**
Add a "Load from history" option in the Test Mode panel, positioned below the manual input section:

```
SIMULATE TRIGGER CONTEXT

NPS score:        [ 27.4          ]
Response count:   [ 412           ]
Window:           [ 24h ▾         ]

  — or —

[ Load from a real event ▾ ]
  Shows last 10 moments that would have matched this trigger type
  for the selected survey, with timestamps and actual metric values.

  Example options in dropdown:
    "Jun 26 · 4:33 PM  —  NPS was 28.1  (412 responses)"
    "Jun 22 · 9:00 AM  —  NPS was 27.8  (398 responses)"

  Selecting one fills all fields from the real event payload.
```

For Crystal simulation when loading from real history, add a toggle:

```
SIMULATE CRYSTAL
[ ] Use Crystal analysis output from this date (Jun 26 · 4:33 PM)
    — loads the real theme extraction result from that pipeline run
[x] Enter custom summary text below
```

New API endpoint required: `GET /api/surveys/:id/trigger-events?trigger_type=nps_threshold&limit=10`

This is a read-only query returning the last N (timestamp, metric payload) pairs that would have satisfied the specified trigger type for the given survey. No side effects. The backend scheduler evaluators already compute these values on each tick — the endpoint exposes the recent history of those evaluations as structured data.

Button copy change: Add "Load real data" as an alternative entry point alongside "Run Test."

---

### C-003 — Action output variables not documented for non-Crystal actions

**Priority:** Must Fix

**Description:**
The variable chip system shows five groups: Survey, Trigger, Crystal, Org, Run. Crystal output is documented: `{{crystal.summary}}`, `{{crystal.themes}}`, `{{crystal.top_verbatims}}`. But what about the output of a Jira ticket action that ran immediately before a Slack notification in the same chain?

If action 1 creates a Jira ticket (CX-47) and action 2 is a Slack notification that should read "I opened CX-47 for this NPS drop," there is currently no documented variable to reference that ticket key. The architecture shows that `WorkflowRunStep.response_payload` stores the full action response, including:
```json
{ "id": "10001", "key": "CX-42", "self": "https://yourorg.atlassian.net/..." }
```

That data is persisted at execution time. It is simply not exposed as a variable to subsequent actions.

**User pain:**
"As a CX manager whose workflow creates a Jira ticket and then sends a Slack message, I want the Slack message to say 'I created CX-47 for this NPS drop — here is the link.' Without that, my Slack message is disconnected from the ticket it references, and my team has to search for the ticket manually."

**Specific fix:**
Add a "Previous Actions" variable group to the chip autocomplete, populated dynamically based on which action types precede the current one in the chain:

```
Variable chip autocomplete for Action 2 (Slack), when Action 1 is Jira:

  PREVIOUS ACTIONS
    {{steps.1.jira_key}}              CX-47
    {{steps.1.jira_url}}              https://yourorg.atlassian.net/browse/CX-47
    {{steps.1.jira_id}}               10001

For Zendesk preceding action:
    {{steps.1.zendesk_ticket_id}}     123456
    {{steps.1.zendesk_url}}           https://yourorg.zendesk.com/agent/tickets/123456

For email preceding action:
    {{steps.1.email_message_id}}      <abc123@mail.xperiq.com>
    {{steps.1.email_delivered}}       true

For webhook preceding action:
    {{steps.1.webhook_status_code}}   200
    {{steps.1.webhook_response}}      first 500 characters of response body
```

Step numbering is 1-indexed, matching the action card display order shown in the builder. If the Jira action is at position 1, its outputs are accessible to all actions at positions 2 through N.

Implementation: the variable resolver (`variableResolver.ts`) is already called at execution time with access to prior step results in the run. Adding support for `{{steps.N.key}}` requires:
1. Extracting a normalized output map from each `WorkflowRunStep.response_payload` as it completes
2. Merging that map into the resolution context before each subsequent action's template is rendered
3. Exposing the variable list per-workflow via `GET /api/workflows/:id/available-variables` so the frontend chip autocomplete is generated server-side rather than hardcoded

Add a formal section to `ARCHITECTURE.md`: "Action Output Variable Contract" — one table per action type listing every output key, its type, and an example value. This is a documentation commitment, not only a code change.

---

### C-004 — Cooldown UI is completely absent from the design spec

**Priority:** Must Fix

**Description:**
The architecture defines `cooldown_minutes` with a default of 60 minutes. This is a consequential configuration decision. A CX manager setting up an NPS alert workflow for the first time will never see this setting, will not know the default exists, and will be confused when the workflow fires once and then appears to stop working.

The correct cooldown setting varies dramatically by workflow type:
- `schedule` trigger: cooldown is irrelevant — the schedule itself is the throttle
- `response_submitted` trigger opening a Zendesk ticket per detractor: cooldown should be 0 (fire every time)
- `nps_threshold` alert to Slack: probably 4 hours to avoid alert fatigue without missing a sustained drop
- `new_theme_detected` Crystal Signal: maybe 24 hours — theme detection runs at most a few times per day anyway

None of this is reflected in the design. There is no cooldown field visible anywhere in the builder.

**User pain:**
"As a CX manager who set up an NPS alert workflow, I had no idea it had a 60-minute cooldown by default. NPS dropped at 9 AM and then again at 11 AM. Only one Slack message arrived. I spent 20 minutes checking whether the workflow was broken before I found a cooldown field mentioned in an architecture document I was not supposed to read."

**Specific fix:**
Add a "Workflow Settings" section to the builder right panel. This section is visible when no card is selected, which is the default state when the builder first loads:

```
WORKFLOW SETTINGS

Cooldown period
How often can this workflow fire? Leave as "No cooldown" for workflows
that should fire on every matching event.

[ No cooldown — fire every time ]
[ 15 minutes                    ]
[ 30 minutes                    ]
[ 1 hour            (default)   ] ← currently selected
[ 4 hours                       ]
[ 24 hours                      ]
[ Custom: _____ minutes          ]

ⓘ  Suggested defaults by trigger type:
   NPS / Sentiment alerts:     4 hours
   New theme detected:         24 hours
   Response submitted:         No cooldown
   Scheduled:                  Not applicable
```

The recommendation line updates dynamically when the trigger type is changed.

Additionally, make the cooldown status visible on the workflow card during active cooldown. The `⏱ Cooldown` status pill already exists in the design. Extend it to show remaining time: "⏱ Cooldown — resets in 47 min." Clicking the pill opens a small popover:
"This workflow last fired at 2:17 PM. Cooldown is set to 60 minutes. It will be eligible to fire again at 3:17 PM. [Change cooldown →]"

---

### C-005 — Workflow ownership and RBAC are undefined

**Priority:** Must Fix

**Description:**
The architecture scopes all workflows to `org_id`. There is no per-workflow permission model. The design spec does not mention roles, access control, or creator attribution anywhere. For an enterprise CX team where multiple people share an Xperiq org, this is a blocking gap.

Concrete scenarios that are unresolved:
- A director creates a high-stakes NPS alert that emails the VP with specific context. An analyst should be able to see the workflow but should not be able to change the recipient list.
- A junior analyst creates a workflow that posts to #cx-alerts. The team lead wants to edit the Slack message template without routing it through the analyst.
- An org admin needs to audit all enabled workflows before a board presentation and wants to know who owns each one.
- A team member leaves the company. Three of their workflows are still running. No one knows this.

**User pain:**
"As a CX team lead reviewing the workflow list, I cannot tell which workflows I created versus which my teammates created, whether any belong to people who have left the team, or whether I am allowed to edit them. Everything looks the same."

**Specific fix — Phase 1 (ship with GA):**
Add creator attribution. Every workflow card shows the creator's avatar and display name in the footer. The list page filter bar adds "Created by me" as a quick filter.

```
Workflow card footer, revised:
"✓ 14 fires · 100% success · 2h ago  ·  [Avatar] T. Reyes"
                                          ^ small avatar + name
```

**Specific fix — Phase 2 (enterprise tier, post-GA):**
Add a three-level per-workflow permission model:

- **Owner**: Create, edit, delete, enable/disable. Transfer ownership. Defaults to creator.
- **Editor**: Edit and enable/disable. Cannot delete, cannot transfer ownership.
- **Viewer**: Read config and run history. No modifications.

Baseline rules applied automatically:
- Org admin always has Owner access to every workflow in the org.
- Org member defaults to Viewer on workflows created by others, Owner on their own.
- An explicit grant can elevate a member to Editor on a specific workflow.

The workflow detail page gains a "Manage access" button (Owner-only) that opens a sharing modal mirroring the pattern of Google Docs: search for org members, assign role, save. The workflow card in the list view shows a lock icon (viewer-only) or pencil icon (editor or owner) to signal the current user's access level at a glance.

---

### C-006 — Crystal Builder has no graceful degradation path

**Priority:** Must Fix

**Description:**
The Crystal Builder placeholder text reads: "Describe what you want to automate in plain English." This sets an expectation of unlimited capability. Users will immediately test the edges: "When Survey A NPS drops AND Survey B NPS drops simultaneously, open a Jira ticket, and if it is not resolved in 48 hours, close both surveys."

This request asks for three capabilities that are explicitly anti-goals for Phase 1–5: multi-survey compound triggers, branching logic, and time-based escalation. What does Crystal say when the user submits this? The design spec is silent. There is no documented fallback.

Additionally: if Crystal cannot parse the request, can the user continue in Visual Builder without losing their description? This transition path is not described.

**User pain:**
"As a CX manager who typed a complex multi-survey request into Crystal Builder, I received... nothing. Or an error. I do not know if my request was too complex, if I phrased it wrong, or if the feature is broken. I closed the tab."

**Specific fix — three degradation tiers:**

**Tier 1 — Partial parse (Crystal builds most of the workflow but skips unsupported parts):**
```
Crystal annotation card:
  Crystal built most of this workflow.

  One part of your request was skipped:
    You asked for: "if the Jira ticket is not resolved in 48 hours, close the survey"
    Why it was skipped: Conditional logic and time-based escalation are not supported yet.
    What I built instead: NPS drop trigger + Jira ticket creation.

  Review the configuration below, then hit Enable — or Edit to adjust.

  [Continue in Visual Builder →]   [Start over]
```

**Tier 2 — No parse possible (the entire request is out of scope):**
```
Crystal annotation card:
  Crystal could not build this workflow.

  Your request requires: triggers across multiple surveys simultaneously.
  This is not available in Xperiq Actions today.

  What you can do instead:
    Create one workflow per survey — takes about 2 minutes each.
    [Build a workflow for Survey A →]

  Or describe something different:
  [Try a different description]
```

**Tier 3 — Ambiguous input (Crystal needs clarification before building):**
```
Crystal annotation card:
  Before I build this, I have a couple of questions:

  1. Which survey should this watch?
     [Select survey ▾]

  2. You said "drops below 30" — did you mean the rolling 24-hour NPS
     average or the most recent individual score?
     [Rolling 24h average ▾]

  [Answer and build →]
```

Update the Crystal Builder placeholder copy to set accurate scope expectations:
Replace "Describe what you want to automate in plain English"
with "Tell Crystal a situation and what to do. Crystal builds one trigger and one or more actions."

The `NlToWorkflowState` already has an `ambiguities` list and a `clarification_needed` flag in the architecture. The frontend needs to render degradation cards based on those fields rather than showing a blank state.

---

### C-007 — No workflow health summary on the list page

**Priority:** Must Fix

**Description:**
The workflow card currently shows: trigger summary, action icons, status pill, last fired timestamp, and total fire count. This communicates current state but not health trend.

On Monday morning with eight workflows, the question is not "is this workflow enabled?" — it is "is this workflow working?" Those are different questions. A workflow can be Enabled and fire 14 times while failing 12 of those runs. The card shows `● Enabled` and "14 total fires." Nothing signals that the workflow is functionally broken.

**User pain:**
"As a CX manager reviewing the workflow list every Monday, I need a health signal, not just a status. 'Enabled' does not mean working. I want to see '14 fires, 100% success' or '3 errors in the last 7 days' without having to click into each workflow one at a time."

**Specific fix:**
Replace the current footer ("Last fired: 2 hours ago · 14 total fires") with a health summary line that conveys both recency and success rate:

```
Healthy:   "✓ 14 fires · 100% success · last run 2h ago"
Warning:   "⚠ 3 errors / 14 fires this week · last run 2h ago"
Critical:  "✕ Last 3 runs failed · last run 2h ago"
```

Visual treatment:
- Healthy: muted grey text (no color signal needed — healthy is quiet)
- Warning: amber text with amber triangle icon
- Critical: red text with red X icon. The status pill is already red for Error; the footer adds the count.

New computed field added to `GET /api/workflows` response payload:

```typescript
health_summary: {
  fires_last_7_days: number;
  success_rate_last_7_days: number;  // 0.0 to 1.0
  last_run_status: 'completed' | 'failed' | 'partial_failure' | null;
  consecutive_failures: number;      // 0 if the last run succeeded
}
```

This is computed from existing `workflow_runs` and `workflow_run_steps` data — no new data collection required. It can be a subquery in the list endpoint or a materialized view refreshed every five minutes for orgs with large run histories. The frontend derives the display variant from `consecutive_failures` and `success_rate_last_7_days`.

---

## Should Fix (post-GA, within 3 months)

### C-008 — No bulk operations on the workflow list

**Priority:** Should Fix

**Description:**
The current design provides individual hover-actions per workflow card: Enable/Disable, Edit, View Runs, Duplicate, and a context menu. There is no way to select multiple workflows and act on them simultaneously.

**User pain:**
"As a CX manager going on a two-week vacation, I want to disable all five workflows that create Jira tickets so the backlog does not fill up while I am out. With the current design, I have to open each card, click Disable, and wait for the toggle. Five separate interactions for something that should be one."

Common bulk needs: disable all before a product incident, enable all after a maintenance window, delete all archived workflows at year-end, duplicate a set of workflows for a new survey program.

**Specific fix:**
Add a multi-select mode triggered by hovering over the checkbox zone (top-left corner of each card):

```
List page top bar in selection mode:
[ ☑ 3 selected ]  [ Enable ]  [ Disable ]  [ Duplicate ]  [ Delete ]  [ Cancel ]
```

Checking one card reveals checkboxes on all cards (progressive disclosure). The top bar transitions to the bulk action bar. Bulk enable and disable call the existing per-workflow endpoints in parallel. Bulk delete shows a confirmation modal ("Delete 3 workflows? Their run history will be preserved but workflows will no longer be accessible.") before executing.

---

### C-009 — No user-facing workflow analytics

**Priority:** Should Fix

**Description:**
The Grafana execution health dashboard exists for engineers. CX managers have no in-product analytics. There is no way to answer "How many times did this workflow fire this month?" or "What is the Slack delivery rate over the last 90 days?" without engineering access.

**User pain:**
"As a CX manager who reports to a VP of CX, I need to demonstrate that our automation program is delivering value. I cannot screenshot a Grafana dashboard. I need a page in the product that I can include in my quarterly review."

**Specific fix:**
Add an "Analytics" tab to the workflow detail page, alongside the existing Run History tab:

```
Workflow Analytics — NPS Drop Alert
[Last 30 days]  [Last 90 days]  [Custom range]  [Export CSV]

Summary
  Total fires:           47
  Success rate:          97.9%   (46 of 47 runs completed)
  Avg execution time:    2.4 seconds
  Most frequent window:  NPS in the 27–29 range

By action type:
  Slack #cx-alerts       47 fires · 100% delivered · avg 382ms
  Create Jira ticket     47 fires · 97.9% success · avg 1.2s
  Crystal Analysis       46 fires · 100% success · avg 803ms
  (1 run skipped Crystal due to prior action failure)

Fire frequency by week:
  [bar chart, 12-week view]
```

All data is derivable from existing `workflow_runs` and `workflow_run_steps` tables. No new instrumentation required — only new aggregation queries and a new frontend component.

---

### C-010 — No live trigger preview ("would this fire right now?")

**Priority:** Should Fix

**Description:**
After a CX manager enables a workflow, there is no signal that the trigger evaluation is operating correctly. Test mode validates a manually entered payload. But the question "if my survey's current state were evaluated right now, would this fire?" has no answer available in the product.

This is distinct from Test Mode — it evaluates the trigger against the live, actual current state of the survey without accepting hypothetical inputs and without executing any actions.

**User pain:**
"As a CX manager who just enabled a new NPS alert workflow, I want confirmation that the system understands my configuration. Tell me: right now, with the survey at NPS 31.2, would this workflow fire? No. Good. If NPS drops below 30, it will fire. I understand the configuration."

**Specific fix:**
Add a "Current trigger status" indicator to the workflow detail page header, visible when the workflow is enabled:

```
NPS Drop Alert   ● Enabled

Current trigger evaluation:
  NPS (rolling 24h): 31.2  —  Threshold: below 30  —  [Would NOT fire]

Last evaluated: 18 seconds ago  (re-evaluates every 30s)
```

New lightweight endpoint: `GET /api/workflows/:id/trigger-preview`

This endpoint runs the same evaluator logic used by the scheduler — computing current metric state and testing it against the trigger config — but returns a structured result without enqueuing anything:

```typescript
{
  would_fire: boolean;
  current_values: Record<string, number | string>;
  threshold_values: Record<string, number | string>;
  reason: string;           // "NPS (31.2) is above the threshold (30)"
  evaluated_at: string;     // ISO 8601
}
```

For AI triggers (Crystal Signals), the response reflects the last signal check rather than live evaluation:
```typescript
{
  would_fire: false,
  reason: "No sentiment_spike detected in the current 48-hour window.",
  last_signal_check: "2026-06-29T12:00:00Z"
}
```

The endpoint is read-only, uses the same evaluator instances already loaded by the scheduler, and adds negligible load. It can be polled at 30-second intervals from the workflow detail page.

---

### C-011 — Action chaining is not treated as a first-class design concept

**Priority:** Should Fix

**Description:**
The ability for one action's output to inform a subsequent action's configuration is one of the most powerful features of an action chain system. The current design mentions it only as a footnote under the `crystal_analysis` action type in `ARCHITECTURE.md`: "the result is available in subsequent action templates as `{{crystal.summary}}`."

This is not enough. Action chaining needs to be a named, documented, visually represented concept. If I am a CX manager who does not know that the Jira ticket key from Action 1 can appear in the Slack message of Action 3, I will never attempt to use it. The feature effectively does not exist from my perspective.

**User pain:**
"As a CX manager building a three-step workflow, I want the Slack notification to include the Jira ticket number that was just created. I typed `{{steps.1.jira_key}}` on a guess and it worked. But I had no idea that was a valid variable until I guessed. There is no documentation, no UI hint, no guide."

**Specific fix:**
Combine with the C-003 resolution (the `{{steps.N.key}}` variable system). Additionally:

1. In the builder, when an action card is being configured and a prior action in the chain produces outputs, show a contextual hint in the right panel: "Action 1 (Jira) creates a ticket you can reference in this message. Type `{{` to see available variables."

2. Add a "Variable Chaining" section to the product's in-app help center with a concrete example: "How to include a Jira ticket link in your Slack notification."

3. In `ARCHITECTURE.md`, add a standalone section titled "Action Output Variables" that is not buried inside a single action type's documentation.

---

## Nice to Have (roadmap consideration)

**N-001 — Workflow import and export:**
Allow exporting a workflow definition as a JSON file and importing it into another org or survey. Useful for enterprise teams with multiple Xperiq orgs (e.g., separate APAC and EMEA instances) or for CX consultants who build standard workflows for multiple clients. The template gallery covers some of this for internal reuse, but cross-org portability requires explicit export/import.

**N-002 — Conditional message formatting within a single action:**
Slack and email action configs use a single message template. For NPS alerts, the urgency level should vary: an NPS of 28 warrants a warning, an NPS of 15 warrants paging the VP immediately. A lightweight template expression syntax — `{{if trigger.nps_score < 20}}@channel CRITICAL: {{else}}Alert: {{/if}}` — would cover this without requiring full branching workflow logic. Scoped to message content, not to action selection.

**N-003 — Workflow run replay vs. retry distinction:**
The design spec shows a "Replay this run" button in the run detail view and a `POST /api/workflows/:id/runs/:runId/retry` endpoint in the API spec. These are semantically different operations: retry re-executes a failed run from the failure point; replay re-executes a successful run to reproduce its output (e.g., to re-send a Crystal analysis email to a new stakeholder). The current API design conflates them. Define replay as a separate endpoint with explicit intent: no idempotency key reuse, always creates a new run record.

**N-004 — Dormant workflow diagnosis from Crystal:**
Workflows in the "Dormant" state (no fires in 30+ days) currently show a badge and nothing else. A more valuable behavior: Crystal reviews dormant workflows periodically and explains why they have not fired, with a specific recommendation. "This NPS alert has not fired in 32 days. Your NPS has been stable at 35–38. Consider raising the threshold to 33 to catch smaller drops — or disable this workflow if the program has ended."

---

## 5 Customer Journey Scenarios

### Scenario 1 — The Monday Morning NPS Crisis

**Background:**
Tom comes in Monday morning and discovers NPS dropped to 27 last Thursday. Nobody noticed until now. The weekly digest email mentioned the NPS briefly in paragraph three, and it went unread. Tom resolves to set up a real-time alert that would have caught this.

**Setup:**
Tom opens Xperiq Actions and clicks "New Workflow." He selects Crystal Builder and types:
"When our CSAT Q3 survey NPS drops below 30, send a Slack message to #cx-alerts and open a Jira ticket in the CX project."

Crystal interprets the request correctly: `nps_threshold < 30`, 24-hour rolling window, Slack notification to #cx-alerts, Jira ticket in CX project. Crystal's annotation card notes that it defaulted to a 24-hour window since Tom did not specify one.

**What works:**
The Crystal Builder translation is accurate. Tom does not have to know what `nps_threshold` means or where to find the rolling window setting. The confirm-card is clear. Enabling the workflow takes one click.

**What breaks without the fixes:**
Tom wants to set a 4-hour cooldown — he does not want Slack messages every 60 minutes if NPS stays below 30 all week. There is no cooldown field visible anywhere in the builder (C-004). He enables the workflow without realizing the 60-minute default exists.

Three hours later, a second Slack message arrives. His team asks why there are two alerts. He goes back to the workflow, cannot find a cooldown setting, and files a bug report. The issue is not a bug — it is a missing UI.

**With C-004 fix applied:**
The Workflow Settings panel shows a cooldown picker when the builder first loads, before Tom touches any other configuration. Crystal's annotation card proactively notes: "I set the cooldown to 60 minutes by default. For NPS alerts, 4 hours is typical. [Change it now →]." Tom sets it to 4 hours before enabling. One alert per sustained drop, as intended.

---

### Scenario 2 — The New Analyst Building an Inherited Process

**Background:**
Priya joins Tom's team and is asked to set up the quarterly Crystal analysis report workflow. Brief: "Send a Crystal deep-dive analysis to the leadership email group every first Monday of the month." She has never used Xperiq before.

**Setup:**
Priya opens the workflow list and sees eight existing workflows with names like "CSAT Response Rate Monitor" and "Mobile NPS Alert." She has no idea who built them, whether they are still relevant, or whether she is allowed to edit them (C-005 gap). She creates a new workflow and uses Visual Builder.

She selects the `schedule` trigger. The config panel shows a text field labeled "Cron expression (e.g., 0 9 * * 1)." She does not know cron syntax.

**What breaks:**
Priya enters `0 9 1 * *` (the 1st day of every month) instead of `0 9 * * 1` (every Monday). The first Monday of the month and the first day of the month are different dates. The workflow fires on the 1st of July — a Wednesday — and everyone receives the monthly report on the wrong day. The mismatch is not discovered until the second month.

**Additional fix required (beyond the eleven findings):**
Add a cron preview line below the cron input in the schedule trigger config panel:

```
Cron expression:  [ 0 9 1 * * ]
Fires:            1st of every month at 9:00 AM
Next scheduled:   Jul 1, 2026 · 9:00 AM (Wednesday)
```

If Priya enters `0 9 * * 1` instead:
```
Fires:            Every Monday at 9:00 AM
Next scheduled:   Jun 30, 2026 · 9:00 AM
```

This is a one-line UI addition to `TriggerConfigPanel.tsx` using a cron-parser npm package. It costs approximately two hours of engineering time and eliminates the most common schedule misconfiguration.

---

### Scenario 3 — The Silent Integration Failure

**Background:**
Tom returns from a week out of office. He opens the workflow list. "NPS Drop Alert" shows `● Enabled`. But NPS was at 27 for four days while he was gone and he received zero Slack messages and zero Jira tickets.

**Investigation:**
Tom clicks into the workflow. Run history shows one "Completed" run from the Monday before he left. Nothing since. Five days of silence during an active NPS depression.

He checks the workflow configuration — everything looks correct. He navigates to the Jira integration settings. The Jira API token expired last Tuesday.

**What the design should do:**
Without C-007 (health summary), the workflow card shows `● Enabled` and "1 fire this week · last run Monday." This looks healthy. The card should show something like "⚠ Jira integration error — last successful Jira action was 6 days ago."

Without C-010 (live trigger preview), Tom cannot ask "given that NPS is currently 27, why is this not firing?" He would see: "NPS (27.0) is below threshold (30) — workflow fired this crossing on Jun 23. Next fire after NPS recovers above 35 and drops again." This is the hysteresis behavior working correctly, but Tom cannot see it.

**Root cause clarification:**
The hysteresis rule for `nps_threshold` prevents re-firing until NPS rises 5 points above the threshold and then drops again. If NPS has been 27 for five days, the workflow correctly fires only once for that crossing. Tom expected a daily alert — this is a design expectation mismatch, not a malfunction.

The correct CX manager mental model is: "this fires when NPS crosses the threshold, not every time the threshold condition is true." The product currently does not communicate this distinction anywhere in the builder UI.

**Additional fix required:**
Add a tooltip to the NPS trigger config panel explaining the hysteresis behavior:
"This workflow fires once when NPS crosses below 30. It will not fire again until NPS rises above 35 and then drops below 30 again. This prevents repeated alerts during a sustained NPS depression. For a daily digest of a low NPS period, use a scheduled workflow instead."

This is a copy change. No code change required.

---

### Scenario 4 — The Survey Launch Notification

**Background:**
Tom's team manages twelve active surveys. Every time any survey in their org is published, the VP and the product team lead need a Slack notification with the survey name and a direct link to the response form.

**Setup:**
Tom uses Crystal Builder: "When any survey in our org is published, send a Slack message to #product-team with the survey name and a link to take the survey."

Crystal correctly identifies `survey_lifecycle: published` as the trigger and org-level scope, meaning the workflow will catch all future survey publications without needing a new workflow per survey.

**What works:**
This is a clean use case the product handles well. Org-level scope is the right design here.

**What breaks:**
Tom wants to include the survey's public response URL in the Slack message — the link that external respondents click to take the survey. He types `{{` in the Slack message template to see available variables. The Survey group shows: `{{survey.name}}`, `{{survey.id}}`, `{{survey.status}}`. No response URL variable.

He tries `{{survey.response_url}}` manually — it works (the variable resolver has access to the survey record), but the field is not documented and does not appear in the chip autocomplete. He only found it by guessing.

**Fix:**
Expand the Survey variable group in the chip autocomplete to include:

```
{{survey.response_url}}              public respondent-facing URL
{{survey.internal_url}}              Xperiq platform URL for the survey
{{survey.created_by_name}}           display name of the publishing user
{{survey.question_count}}            number of questions
```

The variable resolver already has access to the full survey record. This is a documentation and chip-list update, not an architectural change. The complete set of available survey fields should be an explicit contract maintained alongside the survey data model.

---

### Scenario 5 — The High-Volume Product Launch Response

**Background:**
Tom's team is running a post-launch survey for a major product release. They expect 2,000 responses in the first 48 hours. Three workflows are needed:
1. Fire when the first 100 responses arrive — launch velocity confirmed
2. Fire if response rate drops by more than 40% — catches distribution failures in real time
3. Run a Crystal analysis every 500 responses and email it to the product team

**Building the workflows:**
Tom builds all three using Visual Builder. The first two are straightforward: `response_count >= 100` and `response_rate_drop > 40%`.

The third use case — fire at every multiple of 500 — reveals a limitation. The `response_count` trigger fires once when the count crosses a threshold. To get fires at 500, 1000, and 1500, Tom needs three separate workflows with three separate thresholds. There is no "fire at every N responses" configuration. This is a valid gap for high-volume survey programs but is acceptable for Phase 1 as a known limitation — three workflows is manageable.

**What breaks during the launch:**
The launch runs for four hours. A Crystal analysis action times out after 90 seconds (the survey has 600 responses with long verbatim text — Crystal is slower than usual). The workflow transitions to `partial_failure`. The Slack notification and Jira ticket (Actions 1 and 2) succeeded. Only Crystal (Action 3) failed.

Tom is in back-to-back meetings. From his phone, he finds the failed run in the run history and clicks "Retry step" under the Crystal Analysis step. He expects only Action 3 to re-run.

The architecture states: "Retry of a partially failed run re-executes from the first failed step." This is the correct behavior — only Action 3 retries. But the UI copy "Retry step" is ambiguous. Tom does not know whether clicking it will re-send the Slack message and re-create the Jira ticket.

**Fix:**
Change the button label in the failed step UI from "Retry step" to "Retry from here (step 3 only)." Add a note directly below the button:
"Steps 1 (Slack) and 2 (Jira) succeeded and will not run again. Only step 3 (Crystal Analysis) will be retried."

This is a copy change to `RunRow.tsx`. No logic change required. It eliminates genuine uncertainty in a high-stress moment.

---

## Missing Enterprise Workflow Features

The following features are absent from the current design. They are not critiques of Phase 1–5 scope — they are gaps that enterprise CX teams will surface during procurement evaluation and that should be on the roadmap with explicit timeline expectations.

**Workflow change audit log:**
The `version_history` field on the workflows table captures config snapshots. It does not capture who made the change or when, only what changed. An enterprise security team will ask: "Can you show us the complete history of who changed this workflow configuration and when?" The answer must be yes. Add `updated_by_user_id`, `updated_by_display_name`, and `updated_at` to every entry in `version_history`. This is a minor schema addition but a major compliance requirement.

**Emergency pause for all workflows:**
During a production incident, a CX manager needs to stop all workflow fires immediately to prevent Slack floods, spurious Jira tickets, and automated survey mutations. The current design requires individually disabling each workflow. An org-level "Pause all automations" toggle in org settings, reversible with one more click, is a standard safety mechanism in any automation product used in production.

**Notification routing by role, not by user ID:**
The `notify_in_app` and `send_email` action configs accept specific user IDs or email addresses. Enterprise teams change membership frequently. Hardcoded user IDs become stale when team members leave or join. Role-based routing ("notify all users with the cx_manager role") is the enterprise-grade pattern. This requires either a role variable (`{{org.role.cx_manager_emails}}`) or a role selector in the action config UI. Either approach is straightforward given the existing Clerk auth integration.

**Multi-channel escalation with time delay:**
Many enterprise CX workflows use escalation sequences: first notify the primary Slack channel, then if no acknowledgment arrives within 2 hours, escalate by emailing the VP directly. This is distinct from branching logic — it does not require conditional evaluation of whether the first action succeeded. It only requires a `delay_minutes` field on an action config that says "execute this action N minutes after the preceding action completes." A `delay_minutes: 120` on the email action enables time-delayed escalation without requiring the full branching architecture planned for Phase 6.

**Survey distribution event triggers:**
Qualtrics and Medallia support workflow triggers on distribution events: email survey link bounced, invitation opened but survey not started, survey started but abandoned. Xperiq Actions has `response_submitted` but has no awareness of the distribution lifecycle that precedes a response. Enterprise programs that rely on email distribution will eventually want these triggers. This is a significant engineering investment but should be named on the roadmap so procurement teams know it is planned.

**Opinionated Crystal configurations in templates:**
The twelve pre-built Action Playbook templates are valuable, but none of them pre-configure the `crystal_analysis` action with specific analysis types, question scope, or confidence thresholds. A template named "New Complaint Theme — Jira Backlog Feed" should arrive with a pre-configured Crystal theme extraction set to run on all open-text questions with `min_response_count: 5` and `confidence_threshold: 0.85`. Templates that ship with opinionated Crystal configurations are meaningfully more useful than templates that leave the Crystal action blank and expect the user to configure it.

---

## Recommended Quick Wins

The following changes have high impact relative to implementation effort. All can be shipped within a single engineering sprint without architectural changes.

**Quick Win 1 — Trigger grouping (C-001)**
Four labeled sections in the trigger picker with plain-English group names. Approximately 30 minutes of frontend work. Immediately reduces confusion for first-time users. The single change most likely to improve first-session workflow completion rates.

**Quick Win 2 — Cron expression preview in schedule trigger config**
One line below the cron input: "Fires: Every Monday at 9:00 AM. Next scheduled fire: Jun 30 at 9:00 AM." Uses a client-side cron parsing library. Eliminates the most frequent schedule workflow misconfiguration. Approximately 2 hours of frontend work including the package addition.

**Quick Win 3 — Cooldown configuration in Workflow Settings (C-004)**
A dropdown with preset options, a "Custom" input, and per-trigger-type recommendations. Zero backend changes — the API already accepts `cooldown_minutes` in the create and update request bodies. Approximately 2 hours of frontend work. Without this, the 60-minute default will generate a steady stream of "is the workflow broken?" support tickets post-launch.

**Quick Win 4 — Workflow card health summary (C-007)**
Replace "14 total fires" in the card footer with "14 fires · 100% success" or "3 errors / 14 fires this week." The data already exists in the database. Requires one aggregation subquery added to the `GET /api/workflows` endpoint and a conditional CSS class in `WorkflowCard.tsx`. Approximately 3 hours total across backend and frontend.

**Quick Win 5 — Crystal Builder degradation copy (C-006)**
Write the three degradation tier response templates (partial parse, no parse, ambiguous input). The `NlToWorkflowState` already has `ambiguities` and `clarification_needed` fields. The changes are: (a) frontend renders a degradation card when those fields are populated, (b) CrystalOS formats the degradation explanation in the annotation output, and (c) the Crystal Builder placeholder copy is updated. Approximately half a day of work split between frontend and CrystalOS.
