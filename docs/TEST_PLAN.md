# Manual Test Plan — Experient

> **Scope**: All features added/changed across the last 4 commits that have NOT been manually end-to-end tested.  
> **Branch**: `skill-framework-new-designs` (includes all commits up to `d68c795`)  
> **Date written**: 2026-06-22  
> **Start here**: Complete the Prerequisites section before testing anything else.

---

## Prerequisites — Do This First

### 1. Start all services

```bash
# Terminal 1 — Postgres + Redis + monitoring
docker-compose up -d

# Terminal 2 — Backend API on :3001
cd backend && npm start

# Terminal 3 — Vite dev server on :5173
cd app && npm run dev

# Terminal 4 — CrystalOS agents on :8001
cd crystalos && make run-dev
```

### 2. Run DB migrations (if not already done)

Connect to local Postgres and confirm all migrations in `supabase/migrations/` have been applied. Key ones added on this branch:

| Migration file | What it adds |
|---|---|
| `20260603000001_skill_examples.sql` | `skill_examples` table (few-shot bank for skills) |
| `20260603000002_crystal_org_memory.sql` | Crystal org-level memory |
| `20260603000003_crystal_threads_context_state.sql` | Crystal thread persistence |
| `20260603000004_insights_reasoning_trace.sql` | Reasoning trace on insights |
| `20260603000005_action_recommendations.sql` | Action recommendations |
| `20260603000010_user_directory_core.sql` | Users, departments, orgs core |
| `20260603000011_org_plan_tier.sql` | Plan tiers + seat limits |
| `20260603000012_user_group_permissions.sql` | Groups + permissions |
| `20260603000013_sso_attribute_mappings.sql` | SSO field mappings |
| `20260603000014_notifications_v2.sql` | Notifications v2 |
| `20260603000015_notification_channels.sql` | Email/Slack/push channels |
| `20260603000016_alerts_core.sql` | Alert rules + events |
| `20260603000017_alert_events_system.sql` | Alert event tracking |
| `20260603000018_workflows_v2.sql` | Workflow graph engine |
| `20260603000019_workflow_approvals.sql` | Workflow approval queue |
| `20260603000020_workflow_graph_resume.sql` | Workflow resume-after-failure |

### 3. Seed test data

Make sure you have:
- At least 1 live survey with 10+ responses (for insights to generate)
- At least 1 tag created (for tag filter tests)
- At least 1 user invited (for User Directory tests)

---

## Section 1 — Tag UX (Current Branch — Just Fixed Today)

**Route**: `/app/surveys`  
**What changed**: TagBadge redesigned (no left border, cleaner pill), TagSelector backspace/enter/escape keyboard support, tag filter dropdown wider (`w-64`), tag rows show dot+name (not full badge-in-checkbox), tags now passed to builder via navigation state.

### 1.1 Tag filter dropdown (SurveysListPage)

- [ ] Go to `/app/surveys`
- [ ] Click the **Tags** filter button in the toolbar
- [ ] Confirm the dropdown is wider than Status/Type dropdowns (256px vs 192px)
- [ ] Confirm each tag row shows: blue checkbox + colored dot + full tag name (not a pill inside a checkbox)
- [ ] Confirm long tag names are not cut off at 120px — they truncate cleanly at the dropdown edge
- [ ] Select a tag — confirm the `Tags 1` badge appears on the button
- [ ] Confirm the selected tag chip below the toolbar shows the new pill design: subtle colored background, matching border, no left-border bar
- [ ] Click the ✕ on the chip to clear it — list should reset to all surveys
- [ ] Open the dropdown again and click "Clear selection" — same result

### 1.2 TagBadge new design (everywhere)

- [ ] On the surveys list, look at tag chips on individual survey cards — confirm new rounded pill style (no left bar)
- [ ] Open the tag management sheet (⋮ menu → Manage Tags on a survey) — chips inside the TagSelector input box should show same style
- [ ] Confirm the "Employee Experience" or any tag name is not cut off (max 160px now)

### 1.3 TagSelector keyboard shortcuts

In any TagSelector (survey settings panel or manage tags sheet):
- [ ] Type a partial tag name — confirm autocomplete dropdown shows dot + name rows
- [ ] Press **Enter** on a new name that doesn't exist yet → should trigger "Create" and add the tag
- [ ] With a tag selected, press **Backspace** on an empty input → last tag should be removed
- [ ] Press **Escape** → dropdown should close cleanly
- [ ] Color picker: confirm 8 color swatches are shown (up from 6)

### 1.4 Tags visible in Survey Settings panel (bug fix)

- [ ] On the surveys list, find a survey that already has at least 1 tag applied
- [ ] Click the **Edit** (pencil) button on that survey card
- [ ] In the Survey Builder, click the **Settings** panel (gear icon)
- [ ] **Verify**: The tags you added previously are pre-populated in the Tags field
- [ ] (Previously this showed empty — this was the bug)
- [ ] Add a new tag and confirm it saves immediately
- [ ] Remove a tag and confirm it saves immediately
- [ ] Navigate away and come back to Settings — tags should persist

### 1.5 Tag selector "create" flow

- [ ] In the TagSelector (survey settings or manage tags sheet), type a name that doesn't exist yet
- [ ] Confirm the "Create tag" section appears below any matching results
- [ ] Confirm there's a "Create tag" label header, 8 color swatches, and a dot+name preview button
- [ ] Select a different color — the preview button color should update
- [ ] Click the create button → tag appears in the input; dropdown closes
- [ ] Open the dropdown again — new tag appears in the list for future selection

---

## Section 2 — CrystalOS Skill Framework Redesign

**Route**: Crystal panel (slide-in from any page via the crystal button)  
**What changed**: CrystalPanel rebuilt, agents service migrated to `crystalos/`, skill registry with `SKILL.md` catalog, `USE_SKILL_RUNTIME=true` flag.

### 2.1 Crystal panel opens

- [ ] Navigate to any survey intelligence page (e.g. `/app/experience/survey/:id`)
- [ ] Click "Ask Crystal" — panel slides in from the right
- [ ] Confirm panel renders without blank/error state
- [ ] Confirm the crystal orb animation plays in the header

### 2.2 Basic Crystal conversation

- [ ] Type a question: "What is the NPS for this survey?"
- [ ] Confirm Crystal responds (streaming or REST)
- [ ] Confirm response cites source data (citations shown as chips or inline quotes)
- [ ] Type a follow-up: "Why did it drop last week?"
- [ ] Confirm Crystal maintains conversation context (references previous answer)

### 2.3 Skill registry visible in Crystal panel

- [ ] Open Crystal panel
- [ ] Look for a "Skills" or capabilities section in the panel (if exposed in UI)
- [ ] Open browser DevTools → Network tab → filter for `/api/copilot/agents/registry`
- [ ] Confirm response includes both `agents` array (legacy) and `skills` array (new SKILL.md based)
- [ ] Confirm skill objects have: `name`, `version`, `description`, `shared`, `allowed_tools`, `timeout_seconds`

### 2.4 Crystal streaming vs REST

- [ ] With `VITE_CRYSTAL_STREAMING=false` (default): ask Crystal a question, confirm it returns a full response at once
- [ ] Set `VITE_CRYSTAL_STREAMING=true` in `app/.env.local`, restart dev server
- [ ] Ask Crystal a question — confirm text streams in token-by-token
- [ ] Confirm the streaming stops cleanly (no partial text hanging)

### 2.5 Crystal scope — survey-specific

- [ ] On the Experience Hub, click a survey chip
- [ ] Crystal panel should open scoped to that survey
- [ ] Ask "What are the top complaints?" — confirm Crystal focuses on that survey's data only
- [ ] Navigate away from the page — Crystal scope should reset to 'all'

### 2.6 Crystal thread persistence (new migration)

- [ ] Start a Crystal conversation
- [ ] Close the panel
- [ ] Re-open it from the same page
- [ ] Confirm the previous messages are still visible (thread context preserved)

### 2.7 CrystalOS service health

```bash
# In the crystalos terminal, confirm:
curl http://localhost:8001/health
# Should return: { "status": "ok" }

curl http://localhost:8001/api/copilot/agents/registry
# Should return agents[] + skills[] arrays
```

- [ ] `GET /health` returns `{ status: ok }`
- [ ] `GET /api/copilot/agents/registry` returns `agents` and `skills` arrays
- [ ] Skills array is non-empty and includes entries like `crystal-analyst`, `insight-narrator`, `action-recommender`

---

## Section 3 — Experience Hub

**Route**: `/app/experience`  
**What changed**: Crystal narrative card, survey intelligence grid, live KPI strip, portfolio prompts.

### 3.1 Hero section loads

- [ ] Navigate to `/app/experience`
- [ ] Live badge shows: "X active survey · Y total responses" (not loading spinner forever)
- [ ] Portfolio NPS headline renders (or empty state if no data)
- [ ] Crystal opening narrative shows 3-line summary text
- [ ] Survey selector chips (up to 4) appear below the headline

### 3.2 Survey chips

- [ ] Click a survey chip in the hero — Crystal panel opens scoped to that survey
- [ ] Chip shows: live indicator (if active), response count, NPS (if present)

### 3.3 Portfolio prompt chips

- [ ] 4 fixed prompt chips appear: Churn risk, Common themes, Action priorities, Anomalies
- [ ] Click one — Crystal opens with that query pre-filled and submits automatically

### 3.4 KPI strip

- [ ] 4 KPI tiles animate in after data loads: NPS, CSAT, Active Surveys, Total Responses
- [ ] NPS tile shows: value (color-coded green/yellow/red), ±CI, CI bar, sample size
- [ ] CSAT tile shows value + bar chart
- [ ] Total Responses tile shows velocity unit (responses/day)

### 3.5 Live Intelligence Feed

- [ ] If insights exist: insight cards appear with layer icon, headline, citation quote, action badge
- [ ] If no insights: empty state with "Generate Insights" CTA
- [ ] Loading state: 3 skeleton cards while data loads

### 3.6 Survey Intelligence Grid

- [ ] Survey cards appear in a 3-column grid (desktop)
- [ ] Each card: title + status badge, NPS + sparkline, top insight preview
- [ ] Click a card → navigates to `/app/experience/survey/:id`
- [ ] "New Survey" button → navigates to `/app/surveys/create`

---

## Section 4 — Survey Intelligence Page

**Route**: `/app/experience/survey/:surveyId`  
**What changed**: New agentic insight pipeline, anomaly detection, featured insight card, trust scores, audit drawer, Crystal integration.

### 4.1 Page structure loads

- [ ] Navigate to a survey intelligence page
- [ ] Sticky command strip loads: back link, survey title, KPI chips (NPS, responses), sub-nav links
- [ ] Sub-nav: Intelligence | Topics | Advanced | Trends | Report

### 4.2 Insight generation

- [ ] If no insights yet: Crystal Hero empty state shows with CTA
- [ ] Click "Generate Insights" (or Regenerate button) 
- [ ] Confirm the pipeline animation appears: 10-node progress animation
- [ ] Wait for generation to complete (may take 20-60 seconds)
- [ ] Confirm insights appear after generation

### 4.3 Insight cards (after generation)

- [ ] Featured insight card appears at top (gradient bg, "Featured" badge)
- [ ] Layer/filter pills appear: Descriptive | Diagnostic | Predictive | Prescriptive
- [ ] 2-column grid of insight cards appears
- [ ] Each card has: layer badge, reliability badge, headline, narrative excerpt, citation quotes
- [ ] Confirm "Ask Crystal" button on each card opens Crystal with that insight as context

### 4.4 Trust & audit

- [ ] Each insight card has a reliability badge: "Reliable" (green ≥80), "Indicative" (amber 60-79), "Low-signal" (muted <60)
- [ ] Click the audit icon on an insight → Audit drawer slides in
- [ ] Audit drawer shows: model label, trust metrics (citation coverage, consistency, grounding, sample size), trust score bar
- [ ] Close drawer cleanly

### 4.5 Feedback interactions

- [ ] Click thumbs-up on an insight — should toggle (outline → filled)
- [ ] Click thumbs-down — should toggle
- [ ] Click Pin icon — insight should move or get pinned badge
- [ ] All interactions should persist after page refresh

### 4.6 Anomaly alerts

- [ ] If anomalies detected (rising negative topics): warning rows appear below metric tiles
- [ ] Each row: warning icon, topic name, volume/sentiment/effort metrics, "Ask Crystal" + dismiss
- [ ] Click "Ask Crystal" on an anomaly → Crystal opens with that topic focused
- [ ] Click dismiss ✕ → row disappears (stays hidden after refresh)

### 4.7 Industry nudge

- [ ] If org industry not set: yellow alert box appears prompting to configure industry
- [ ] Click "Configure industry" link → navigates to brand settings
- [ ] Click ✕ dismiss → box disappears; does not reappear after page refresh

### 4.8 Metric tiles (NPS / CSAT / Top Action)

- [ ] NPS tile: gauge value (color-coded), ±CI, CI bar, sparkline, velocity label
- [ ] CSAT tile: value + bar chart (or "no CSAT questions" message)
- [ ] Top Action tile: confidence chip, headline, projected impact, "Create Ticket" button
- [ ] "Create Ticket" click — should open external link or trigger action (note expected behavior)

---

## Section 5 — Survey Report Page

**Route**: `/app/experience/survey/:surveyId/report`  
**What changed**: New tiered report structure with executive summary, priority actions, detailed themes, cross-theme patterns.

### 5.1 Page loads

- [ ] Navigate from the survey intelligence page → click "Report" in the sub-nav
- [ ] If no report: empty state shows "No report available yet"
- [ ] If report exists: sections appear

### 5.2 Executive summary

- [ ] Executive Summary card appears at top
- [ ] Shows: overview narrative, key metrics, cross-theme patterns (if present in data)

### 5.3 Priority Actions

- [ ] "Priority Actions" section appears (if present)
- [ ] Each action card: priority badge (colored), time horizon (Immediate/Short-term/Long-term), headline, impact estimate

### 5.4 Detailed Themes

- [ ] Theme cards appear in a grid sorted by priority
- [ ] Each card (collapsed): sentiment-colored accent bar, badges (New Finding, Confirmed, Improving/Declining), headline, frequency, sentiment label, 2 verbatim quotes
- [ ] Click to expand: business impact section, root cause hypothesis, recommended action box (lightbulb icon, impact, time horizon)
- [ ] "Ask Crystal" button → Crystal panel opens focused on that theme/topic
- [ ] "Explore topic" link → navigates to topics view with that topic pre-selected

---

## Section 6 — Dashboard

**Route**: `/app/dashboard`  
**What changed**: New tabs (Executive/Analyst/Operations/Insights/Custom), Crystal narrative card, KPI tiles, NPS trend chart with forecast + anomalies, CustomLayout drag-resize.

### 6.1 Executive tab (default)

- [ ] Navigate to `/app/dashboard`
- [ ] Crystal Narrative Card loads: headline + paragraph text, left-border color based on sentiment, "Ask Crystal" button
- [ ] "Ask Crystal" opens Crystal panel — confirm it works
- [ ] KPI tiles (4-column): NPS, CSAT, Responses, Active Surveys — all show values or loading state
- [ ] NPS Trend chart: area chart with forecast dashed line, anomaly markers
- [ ] Date range selector: switch between 30 / 90 / 180 days — chart and KPIs update
- [ ] Loading state: text message appears while fetching

### 6.2 Analyst tab

- [ ] Click "Analyst" tab
- [ ] Table appears: Metric | Current | Change columns
- [ ] Change column shows colored up/down/neutral indicators

### 6.3 Operations tab

- [ ] Click "Operations" tab
- [ ] Two-column grid: Health Matrix (left) + Anomalies (right)
- [ ] Health Matrix: survey list with freshness dots, response counts, NPS values
- [ ] Anomalies: severity badges, titles

### 6.4 Insights tab

- [ ] Click "Insights" tab
- [ ] Action Board (left): action items — clicking should navigate to Alerts
- [ ] Activity (right): recent discoveries with dates

### 6.5 Custom tab (drag-resize layout)

- [ ] Click "Custom" tab
- [ ] CustomLayout component loads
- [ ] Drag a widget to reposition it — position should persist after re-opening the tab
- [ ] Resize a widget — size should persist

---

## Section 7 — User Directory

**Route**: `/app/settings/users`  
**What changed**: Full new page — user table, invite modal, user detail drawer, search, role filter.

### 7.1 Page access control

- [ ] Sign in as admin → page loads normally
- [ ] Sign in as non-admin → "Access Denied" message appears (do not test non-admin CRUD)

### 7.2 User table

- [ ] User list loads: Name (avatar + display name + email), Role, Department, Status badge, Manage button
- [ ] Loading state: "Loading…" text shown while fetching
- [ ] Empty state: "No users found" if search yields nothing

### 7.3 Search

- [ ] Type a name in the search box — list filters (debounced ~250ms, server-side)
- [ ] Clear search — full list returns
- [ ] Search by email — confirm it works

### 7.4 Role filter

- [ ] Use the role dropdown to filter by a specific role
- [ ] Confirm the count "Active X of Y" updates accordingly

### 7.5 Invite user

- [ ] Click "+ Invite User"
- [ ] InviteUserModal opens: email input, role select
- [ ] Try submitting with empty email → validation error appears
- [ ] Fill in a valid email and role → click Invite → confirm success toast/message
- [ ] New user appears in the list (may need Clerk to process invite)

### 7.6 User detail drawer

- [ ] Click any user row or "Manage" button → UserDetailDrawer slides in from right
- [ ] Drawer shows: avatar, name, email, role select, department select
- [ ] Change the role → save → confirm the change persists in the table
- [ ] Change the department → save
- [ ] Deactivate user → status badge in table changes to "inactive"
- [ ] Close drawer with ✕ or clicking outside

### 7.7 SettingsUsersNav

- [ ] Confirm the sub-nav bar appears at the top of the settings users area
- [ ] Links: Users | Groups | Departments | Roles | Seats | Provisioning | Audit Log
- [ ] Each link navigates to its correct page

---

## Section 8 — Groups

**Route**: `/app/settings/users/groups`  
**What changed**: Full new page — group cards, static/dynamic groups, create modal.

### 8.1 Groups list

- [ ] Groups appear as cards in a 1/2/3-column grid
- [ ] Each card: group name, description (if any), type badge (Static/Dynamic), member count
- [ ] Hover over a card → delete button (✕) appears

### 8.2 Create static group

- [ ] Click "+ Create Group"
- [ ] Dialog opens: Name input, Type select
- [ ] Select "Static" type
- [ ] Enter a name → Save
- [ ] New group appears in the list

### 8.3 Create dynamic group

- [ ] Click "+ Create Group"
- [ ] Select "Dynamic" type
- [ ] Confirm: conditional rule builder appears (field / operator / value rows)
- [ ] Add a rule: e.g. "department equals Engineering"
- [ ] Add another rule with "+ Add Rule"
- [ ] Save → group appears with "Dynamic" badge

### 8.4 Delete group

- [ ] Hover over a group card → delete button appears
- [ ] Click delete → confirm group disappears from list

---

## Section 9 — Departments

**Route**: `/app/settings/users/departments`  
**What changed**: Full new page — hierarchical department tree, create modal with parent selection.

### 9.1 Department tree

- [ ] Departments appear as a hierarchical indented list
- [ ] Each row: colored dot, name, member count, head name (if assigned)
- [ ] Sub-departments indented under parent

### 9.2 Create top-level department

- [ ] Click "+ Add Department"
- [ ] Dialog: Name input, Parent select (optional)
- [ ] Leave Parent blank → save
- [ ] New department appears at top level

### 9.3 Create child department

- [ ] Click "+ Add Department"
- [ ] Enter a name + select a parent department
- [ ] Save → new department appears indented under the parent

### 9.4 Delete department

- [ ] Hover over a department → delete button appears
- [ ] Click delete → department (and its children?) disappear

---

## Section 10 — Roles

**Route**: `/app/settings/users/roles`  
**What changed**: Full new page — role cards showing builtin + custom roles, custom role creator.

### 10.1 Roles grid

- [ ] Cards appear in a 2-column grid
- [ ] Built-in roles (Admin, Editor, Viewer, etc.) show "builtin" badge
- [ ] No delete button on built-in roles
- [ ] Permission badges list per role (e.g. "surveys:write", "insights:read")

### 10.2 Create custom role

- [ ] Click "+ Create Custom Role"
- [ ] CreateCustomRoleModal opens
- [ ] Enter a name and description
- [ ] Select permissions (checkboxes or toggles per action)
- [ ] Save → new role card appears with "custom" badge
- [ ] Role appears in dropdowns elsewhere (User Directory role filter)

### 10.3 Delete custom role

- [ ] Click delete on a custom role card
- [ ] Confirm the card disappears
- [ ] Confirm you cannot delete built-in roles (no delete button)

---

## Section 11 — Seats

**Route**: `/app/settings/users/seats`  
**What changed**: Full new page — plan tier card, seat usage bar, role breakdown.

### 11.1 Plan tier card

- [ ] Page loads (admin only)
- [ ] Plan tier label shown (e.g. "Enterprise", "Growth")
- [ ] Used / total seats shown (e.g. "3 / 25")
- [ ] Progress bar fills proportionally
- [ ] If unlimited: "Unlimited" badge shown instead of progress bar
- [ ] If in grace period: yellow warning shown

### 11.2 By Role breakdown

- [ ] Second card: "By Role" list
- [ ] Each row: Role name | Seat weight | Active users | Billable seats
- [ ] Numbers add up to total used seats

---

## Section 12 — Provisioning (SCIM + SSO)

**Route**: `/app/settings/users/provisioning`  
**What changed**: Full new page — SCIM endpoint display, token management, SSO attribute mappings.

### 12.1 SCIM endpoint

- [ ] SCIM endpoint URL displayed in a code block
- [ ] Copy button copies the URL to clipboard

### 12.2 Create SCIM token

- [ ] Click "+ Create Token"
- [ ] Dialog: name input, provider select (e.g. Okta, Azure AD)
- [ ] Create → dialog shows the token ONE TIME in a code block with copy button
- [ ] Close dialog → token row appears in the list (showing only prefix + `•••`)
- [ ] Token shows: name, provider, "Active" badge

### 12.3 Revoke SCIM token

- [ ] Click Revoke on an active token
- [ ] Token row updates to "Revoked" badge
- [ ] Revoked token no longer usable (test by noting the bearer won't auth)

### 12.4 SSO attribute mappings

- [ ] Attribute mapping section shows input pairs: SAML attribute → Experient field
- [ ] Add a new mapping with "+ Add Mapping" → new input row appears
- [ ] Remove a mapping → row disappears
- [ ] Click Save → "Saved" feedback appears temporarily

---

## Section 13 — Audit Log

**Route**: `/app/settings/users/audit`  
**What changed**: Full new page — event log table, event type filter, CSV export.

### 13.1 Audit log table

- [ ] Table loads: Time | Event (badge) | Actor | Target
- [ ] Events are real audit entries from the backend (invite_user, update_role, etc.)
- [ ] Loading state: "Loading…" shown while fetching

### 13.2 Event type filter

- [ ] Type in the event type filter → table updates (debounced ~250ms)
- [ ] Filter by "invite" → only invite-related events shown
- [ ] Clear filter → full log returns

### 13.3 CSV export

- [ ] Click "Export CSV"
- [ ] File downloads with audit log data
- [ ] Confirm the CSV has sensible columns: timestamp, event_type, actor_id, target

---

## Section 14 — Notification Preferences

**Route**: `/app/settings/notifications`  
**What changed**: New NotificationPreferencesPage with per-type per-channel toggles + digest summary.

### 14.1 Preferences table

- [ ] Table loads: rows for each notification type (survey_complete, insight_ready, alert_triggered, etc.)
- [ ] Columns: In-App | Email | Slack toggles per row
- [ ] Loading state shown initially

### 14.2 Toggle and save

- [ ] Toggle one In-App switch OFF for a notification type
- [ ] Click Save → success message / toast
- [ ] Refresh the page → confirm the change persisted

### 14.3 Digest card

- [ ] If weekly digest has data: card appears at top showing priority breakdown (critical/warning/info counts)
- [ ] If no digest data: card is hidden (not an error)

---

## Section 15 — Alerts

**Route**: `/app/alerts`  
**What changed**: Full new page with Events / Rules / Subscriptions tabs.

### 15.1 Events tab

- [ ] Navigate to `/app/alerts`
- [ ] Events tab is active by default
- [ ] If alert events exist: cards show severity badge, title, description, timestamp
- [ ] Acknowledge button → event moves to acknowledged state (badge changes)
- [ ] Snooze button → snoozes for 24h (badge shows "Snoozed")
- [ ] Resolve button → event resolves (removed from active list or shows resolved)
- [ ] Empty state shows "No active alerts" if no events

### 15.2 Rules tab

- [ ] Click "Rules" tab
- [ ] Existing rules shown: severity badge, name, alert type
- [ ] Click "+ Create Rule"
- [ ] CreateRuleDialog opens: alert type select (grouped by category), name, severity (Critical/Warning/Info)
- [ ] Select alert type "S-01" (NPS Drop) → confirm a "Min drop %" field appears
- [ ] Other alert types should NOT show the min drop field
- [ ] Fill in name + severity → Save
- [ ] New rule appears in the list

### 15.3 Delete alert rule

- [ ] Click delete on a rule → rule disappears from list

### 15.4 Subscriptions tab

- [ ] Click "Subscriptions" tab
- [ ] Table shows: alert type rows × In-App / Email / Slack columns with toggles
- [ ] Toggle a switch → change should save automatically (or with a save button)
- [ ] Refresh → confirm toggle persisted

---

## Section 16 — Chart Studio (Visual AI)

**Route**: `/app/visual`  
**What changed**: Full new page — natural language chart generation using org analytics data.

### 16.1 Page loads

- [ ] Navigate to `/app/visual`
- [ ] Input card appears: gem icon, text field, Submit button
- [ ] 4 example pills shown below input

### 16.2 Example pills

- [ ] Click an example pill (e.g. "NPS trend over 90 days")
- [ ] Input field auto-fills with that text AND auto-submits
- [ ] Chart card appears with: title, chart type badge, AI rationale text, chart render

### 16.3 Generate a custom chart

- [ ] Type: "Show me CSAT scores by department this quarter"
- [ ] Click Submit
- [ ] Loading state appears
- [ ] Chart card renders with a Recharts chart (bar/line/area/pie depending on AI response)
- [ ] Chart type badge matches the rendered chart type

### 16.4 Chart types

Test these natural language queries and confirm appropriate chart types render:
- [ ] "NPS trend" → Line or Area chart
- [ ] "Survey response distribution" → Bar chart
- [ ] "Sentiment breakdown by category" → Pie chart

---

## Section 17 — Workflows

**Route**: `/app/workflows`  
**What changed**: Workflows v2 — list page with templates + approvals, linear builder, React Flow canvas builder.

### 17.1 Workflows list page

- [ ] Navigate to `/app/workflows`
- [ ] Stats row shows: Active count, Triggers Today, Paused count (all show 0 if no workflows)
- [ ] Empty state shows "Get Started" button if no workflows exist
- [ ] "Pre-built Templates" section appears (if templates loaded from API)
- [ ] "Pending Approvals" section appears (if any approval queued)

### 17.2 Create workflow via modal (from list page)

- [ ] Click "+ New Workflow"
- [ ] Modal opens: name input, trigger select, action select, live preview pane
- [ ] Enter a name, select a trigger (e.g. "NPS drops below threshold")
- [ ] Select an action (e.g. "Create alert")
- [ ] Click Create → workflow appears in the list
- [ ] Workflow card shows: name, trigger, condition/action formula, status badge

### 17.3 Workflow card actions

- [ ] Pause a workflow → status changes to "Paused", button changes to "Resume"
- [ ] Resume a paused workflow → status changes to "Active"
- [ ] Delete a workflow → card disappears from list
- [ ] Edit button → navigates to builder page (if implemented)

### 17.4 Pre-built templates

- [ ] Templates section loads (if backend returns templates)
- [ ] Each template card: name, description, "Use Template" button
- [ ] Click "Use Template" → workflow created from template, appears in list

### 17.5 Pending Approvals

- [ ] If approval exists: approval cards appear with Approve / Reject buttons
- [ ] Click Approve → approval processes, workflow resumes
- [ ] Click Reject → approval rejected, workflow stops

### 17.6 Linear Workflow Builder

- [ ] Click "Build Visually" on the Workflows page
- [ ] Navigates to `/app/workflows/build`
- [ ] Page shows 3 step cards: Trigger (blue), Conditions (orange), Actions (green)
- [ ] Enter a workflow name
- [ ] Step 1 (Trigger): Select a trigger type from dropdown (populated from registry API)
- [ ] Step 2 (Conditions): Click "+ Add Condition" → row appears with field/operator/value inputs
- [ ] Edit condition row (select field, operator, enter value)
- [ ] Click delete on a condition row → row removed
- [ ] Step 3 (Actions): Click "+ Add Action" → numbered badge + action select appears
- [ ] Select an action type
- [ ] Click Save:
  - [ ] If name or trigger missing → error banner appears
  - [ ] If valid → saves and navigates back to `/app/workflows`
- [ ] New workflow appears in the list

### 17.7 Canvas Workflow Builder (React Flow)

- [ ] Click "Build on Canvas" on the Workflows page
- [ ] Navigates to `/app/workflows/canvas`
- [ ] React Flow canvas renders at ~70vh height with a TriggerNode already placed
- [ ] MiniMap visible in bottom-right corner
- [ ] Controls (zoom +/-) visible

- [ ] Click "+ Condition" button → ConditionNode appears on canvas (orange header)
- [ ] Click "+ Action" button → ActionNode appears on canvas (green header)
- [ ] Drag nodes to reposition
- [ ] Connect an edge from TriggerNode to ConditionNode by dragging the handle
- [ ] Confirm edge animates with direction arrow
- [ ] Condition node should show "true" / "false" handle labels at bottom
- [ ] Connect "true" edge from ConditionNode to ActionNode
- [ ] Edit node data inline: select trigger type in TriggerNode, fill condition fields in ConditionNode, select action in ActionNode
- [ ] Delete a node using its ✕ button
- [ ] Enter workflow name at top
- [ ] Click Save:
  - [ ] Invalid (no trigger type or action) → error banner
  - [ ] Valid → saves and navigates to `/app/workflows`

---

## Section 18 — Report Export

**Route**: Survey Intelligence page sub-nav → Report  
**What changed**: `ReportExportMenu` component added to survey pages.

### 18.1 Export menu appears

- [ ] Navigate to a survey with report data (`/app/experience/survey/:id/report`)
- [ ] Look for an "Export" button or dropdown in the page header / top-right
- [ ] Click Export → dropdown opens with options: PDF, PPTX, HTML

### 18.2 HTML export (always available)

- [ ] Click "Export HTML" → file downloads as `.html`
- [ ] Open the file — report renders correctly in browser

### 18.3 PDF export

- [ ] Click "Export PDF" → confirm download starts (may require puppeteer to be installed in backend)
- [ ] If puppeteer not installed: confirm it falls back to HTML with a toast/note

### 18.4 PPTX export

- [ ] Click "Export PPTX" → confirm download starts (requires pptxgenjs in backend)
- [ ] Confirm downloaded `.pptx` opens in PowerPoint/Keynote

---

## Section 19 — Group Reports (Surveys List → Tagged Groups)

**Route**: `/app/surveys` → filter by tag → generate report → `/app/groups/:tagId/report/:runId`  
**What changed**: Tag-based group insight generation and report page.

### 19.1 Generate group report

- [ ] Go to `/app/surveys`
- [ ] Apply a Tag filter (select at least 1 tag)
- [ ] A "Generate Group Report" button appears (or similar — check the toolbar)
- [ ] Click it → loading spinner while report generates
- [ ] On completion → navigates to `/app/groups/:tagId/report/:runId`

### 19.2 Group Report page

- [ ] Report page loads with grouped insights across all tagged surveys
- [ ] Ask Crystal in the context of this group report
- [ ] Navigate back to surveys list

---

## Section 20 — Sample Responses (Regression Check)

**Route**: `/app/surveys/:id/sample`  
**What changed**: Backend migration to crystalos may have affected sample response generation.

### 20.1 Generate sample responses

- [ ] Open a survey in the builder
- [ ] Navigate to or trigger sample response generation
- [ ] Confirm responses are generated (crystalos service handles this)
- [ ] Confirm the responses appear in the survey's response dashboard

---

## Section 21 — Regression — Core Survey Flows

Confirm these core flows still work after all the recent changes:

### 21.1 Create survey (manual)

- [ ] `/app/surveys/create` → choose "Build manually"
- [ ] Add 3 questions (multiple choice, rating scale, open text)
- [ ] Save draft → confirm saved
- [ ] Publish → confirm live status

### 21.2 Create survey (AI)

- [ ] `/app/surveys/create` → describe a survey topic
- [ ] AI generates questions → review
- [ ] Edit a question
- [ ] Publish

### 21.3 Survey builder — settings panel

- [ ] Open a survey in the builder
- [ ] Click Settings gear
- [ ] Tags: add/remove tags (section 1.4 above — the main bug fix)
- [ ] Description: update and confirm saves
- [ ] Intent: update and confirm saves
- [ ] Thank-you message: update and confirm saves
- [ ] Template info: if from template, shows read-only template block

### 21.4 Survey fill (respondent view)

- [ ] Visit `/s/:token` for a live survey
- [ ] Complete the survey
- [ ] Submit → confirmation page
- [ ] Check response appears in `/app/surveys/:id/responses`

### 21.5 Navigation — all sidebar links

- [ ] Surveys, Data, Insights, Respondents, Workflows, Templates, Dashboard, Settings — all navigate without crash
- [ ] Settings sub-nav: all 7 users/* pages load

---

## Known Not-Yet-Verified (Track Separately)

These items are called out in commit messages as explicitly unverified:

| Area | Status |
|---|---|
| Redis streaming (SSE) for Crystal | Not verified |
| Insight pipeline: topic centroid/signal calculations | Not verified |
| Crystal follow-ups and thread flows | Not verified |
| SCIM 2.0 actual provisioning with Okta/Azure | Not verified |
| Clerk webhook user sync (live Clerk needed) | Not verified |
| Notification email/Slack/push channel delivery | Not verified (requires channel config) |
| Workflow execution: trigger, run, retry, failure | Not verified (requires event triggers) |
| Alert engine event evaluation in real-time | Not verified |
| Dashboard CustomLayout persist across sessions | Not verified |
| Report PDF export (requires puppeteer in backend) | Not verified (dep not installed) |
| Report PPTX export (requires pptxgenjs) | Not verified (dep not installed) |
| Cron scheduling helpers in backend | Not verified |

---

## Quick Smoke Test (10 minutes)

If you're short on time, run just these to confirm nothing is catastrophically broken:

1. `/app/surveys` — list loads, tag filter dropdown works, tag badge design looks correct
2. Edit a tagged survey → builder settings panel → tags pre-populated ✓ (today's fix)
3. `/app/experience` — hub loads with KPIs
4. `/app/experience/survey/:id` — intelligence page loads, no crash
5. `/app/alerts` — page loads, tabs switch
6. `/app/settings/users` — user list loads
7. `/app/workflows` — page loads, create a simple workflow
8. `/app/dashboard` — all 4 tabs load, date range switch works
9. Crystal panel — opens, sends a message, gets a response
10. `/app/settings/notifications` — preferences table loads, save works
