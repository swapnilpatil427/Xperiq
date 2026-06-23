# Survey Groups — Phased Delivery Roadmap

**Version:** 1.0
**Date:** 2026-06-22
**Status:** Pre-Implementation
**Depends on:** `supabase/migrations/20260622000001_survey_groups.sql` (already exists)

---

## Overview

The Survey Groups feature is delivered in 5 phases over 6 weeks. Each phase is independently shippable and adds value without requiring the next phase to be complete.

| Phase | Name | Duration | Owner |
|---|---|---|---|
| 1 | Foundation | Week 1–2 | Backend + Frontend |
| 2 | Crystal Group Intelligence | Week 2–3 | CrystalOS |
| 3 | Group Insight Reports | Week 3–4 | CrystalOS + Frontend |
| 4 | Proactive Intelligence | Week 4–5 | CrystalOS + Frontend |
| 5 | Polish and Scale | Week 5–6 | Full team |

---

## Phase 1 — Foundation (Week 1–2)

**Goal:** Tags exist. Users can create, assign, and filter by tags. No AI yet.

**Exit criteria:** A user can create an org tag, apply it to 3 surveys, filter the surveys list by that tag, and see only those surveys. The TagsSettingsPage is reachable. All tests pass.

### 1.1 Database

- [x] Migration `20260622000001_survey_groups.sql` — already exists
  - `survey_tags` table
  - `survey_tag_mappings` table + 5-tag-limit trigger
  - `group_insight_runs` table
  - `group_insights` table
  - `surveys_with_tags` view

### 1.2 Backend

- [x] `backend/src/routes/tags.js` — already exists
  - `GET /api/tags` — list org tags with survey_count
  - `POST /api/tags` — create tag (requireRole('analyst'))
  - `PUT /api/tags/:id` — update tag
  - `DELETE /api/tags/:id` — delete tag
  - `GET /api/tags/:id/surveys` — surveys with this tag
  - `POST /api/surveys/:surveyId/tags` — add tags
  - `DELETE /api/surveys/:surveyId/tags/:tagId` — remove tag

- [ ] `backend/src/routes/surveys.js` — modify list endpoint
  - Return tags array for each survey (join `surveys_with_tags` view instead of `surveys`)
  - Add `?tag_id=` filter parameter: `WHERE m.tag_id = ANY($1::uuid[])`
  - Ensure `GET /api/surveys/:id` also returns `tags`

- [ ] Mount `tags.js` router in `backend/src/index.js`
  - `app.use('/api/tags', require('./routes/tags'))`
  - Verify `survey-groups.js` is also mounted at `/api/survey-groups`

- [ ] Backend tests for tags routes (`backend/src/__tests__/tags.test.js`)
  - CRUD operations
  - 5-tag limit enforcement (trigger fires correctly via Node)
  - Org isolation (tag from org-A is not accessible from org-B)
  - Slug collision resolution

### 1.3 Frontend — Components

- [ ] `app/src/components/TagBadge.tsx`
  - Props: `tag`, `removable`, `onRemove`, `size`
  - Color derivation: `hexToRgba(tag.color, 0.1)` for background, `tag.color` for left border
  - Unit test: renders badge, fires onRemove

- [ ] `app/src/components/TagSelector.tsx`
  - Combobox: filter existing tags by typed input
  - Create-new option: "Create tag: [name]" when no exact match
  - Disabled state when currentTags.length >= 5
  - Unit tests: tag add, tag remove, tag create, limit enforcement UI

- [ ] `app/src/lib/tags.ts` — API client functions
  - `fetchOrgTags(orgId): Promise<Tag[]>`
  - `createTag(name, color?, description?): Promise<Tag>`
  - `addTagToSurvey(surveyId, tagIds): Promise<void>`
  - `removeTagFromSurvey(surveyId, tagId): Promise<void>`

### 1.4 Frontend — Pages

- [ ] `SurveysListPage` modifications
  - Show `TagBadge[]` for each survey card
  - Tag filter chip in the filter bar: `[Tag ▾]` dropdown listing all org tags
  - When a tag filter is active, show only surveys with that tag
  - "Generate Group Report" button appears when tag filter is active (disabled < 2 surveys)

- [ ] `TagsSettingsPage` — new page at `/settings/tags`
  - Route: add to `app/src/routes.ts` and AppShell nav (Settings section)
  - List all org tags with survey count badges
  - Inline edit: click tag name to rename inline
  - Color picker swatch
  - Delete button with confirmation ("This will remove the tag from N surveys")
  - Create tag form at top

### 1.5 i18n

- [ ] Add all new user-visible strings to `locales/en.js`:
  - `tags.create`, `tags.edit`, `tags.delete`, `tags.limit_reached`
  - `tags.survey_limit_reached`, `tags.apply`, `tags.remove`
  - `groups.generate_report`, `groups.no_surveys_for_tag`
  - `settings.tags.title`, `settings.tags.description`

---

## Phase 2 — Crystal Group Intelligence (Week 2–3)

**Goal:** Crystal can reason over a group of surveys. Group Crystal chat is functional.

**Exit criteria:** A user with an active tag filter can open Crystal and ask "What are the main themes across all my CX surveys?" and receive a coherent answer citing multiple surveys. All new Crystal tools have unit tests.

### 2.1 CrystalOS — New Tools

Following the pattern in `crystalos/CLAUDE.md` section "Adding a new Crystal tool":

- [ ] `crystalos/crystal/registry.py` — add 6 group tool definitions
  - `get_group_surveys` — see DESIGN.md §4.2
  - `get_group_metrics`
  - `get_group_topics`
  - `analyze_group_coverage`
  - `detect_data_gaps`
  - `suggest_new_survey`

- [ ] `crystalos/crystal/tools.py` — add 6 executor functions
  - `execute_get_group_surveys(tag_ids, org_id, include_archived=False)`
  - `execute_get_group_metrics(survey_ids, metric='all', days=90)`
  - `execute_get_group_topics(survey_ids, limit=20, min_frequency=3)`
  - `execute_analyze_group_coverage(survey_ids, program_type='auto')`
  - `execute_detect_data_gaps(survey_ids, tag_ids, program_type='auto')`
  - `execute_suggest_new_survey(gap_description, gap_type, existing_survey_ids, tag_ids)`
  - Add dispatch cases in `dispatch_tool()`

### 2.2 CrystalOS — Context and Thread Updates

- [ ] `crystalos/crystal/context.py` — extend `CrystalContext`
  - Add `scope: Literal['survey', 'group']`
  - Add `group_tag_ids: list[str] | None`
  - Add `group_survey_ids: list[str] | None`
  - Resolve `group_survey_ids` from DB when `scope == 'group'` and context is created

- [ ] `crystalos/agents/crystal.py` — handle group scope
  - When `scope == 'group'`: disable survey-scoped tools, enable group tools
  - Thread key: `group:{sorted_tag_ids}:{org_id}` (see DESIGN.md §4.5)
  - System prompt addendum: inform Crystal it is analyzing a group, list member surveys

- [ ] `crystalos/main.py` — add group Crystal endpoint
  - `POST /groups/crystal` — accepts `{ tag_ids, org_id, user_id, message, conversation_history }`
  - Validates tag ownership via DB
  - Creates group-scoped CrystalContext
  - Returns `{ answer, suggestions, insight_refs, citations }`

### 2.3 Tests

- [ ] `crystalos/tests/test_crystal_group.py` — new test file
  - Unit tests for each of the 6 tool executors (mock DB responses)
  - Test group thread key generation
  - Test that group scope disables survey tools
  - Integration smoke test: mock 3 surveys, call `detect_data_gaps`, verify signal structure

---

## Phase 3 — Group Insight Reports (Week 3–4)

**Goal:** Automated group insight reports can be generated and viewed. Streaming works.

**Exit criteria:** A user can click "Generate Group Report," watch a streaming progress view, and see a completed 4-section report with themes, metrics, and gaps.

### 3.1 CrystalOS — Group Insight Pipeline

- [ ] `crystalos/graphs/group_insights.py` — new LangGraph pipeline
  - Nodes (in order):
    1. `load_surveys` — fetch survey metadata + sample responses (up to 2000 total)
    2. `compute_metrics` — aggregate NPS/CSAT/CES across surveys, compute trends
    3. `extract_topics` — get cross-survey topics via `execute_get_group_topics`
    4. `detect_gaps` — run all 5 gap detection passes via `execute_detect_data_gaps`
    5. `generate_themes` — cluster cross-survey themes (LLM call)
    6. `narrate` — generate executive summary + theme narratives (LLM call)
    7. `suggest_surveys` — for each gap, call `execute_suggest_new_survey` (LLM call)
    8. `write_insights` — persist `group_insights` records to DB
    9. `publish` — set run status to 'completed', emit completion stream event
  - Each node emits a `progress` stream event via `event_publisher.py`
  - Heartbeat update every 30 seconds

- [ ] `crystalos/main.py` — add group insight generation endpoint
  - `POST /groups/insights/generate` — accepts `{ run_id, tag_ids, survey_ids, org_id }`
  - Internal endpoint (requires `X-Internal-Key` header)
  - Kicks off `run_group_insight_generation()` as a background task

- [ ] `crystalos/lib/agentsClient.js` (backend) — add `generateGroupInsights`
  - Already exists as a call in `survey-groups.js`; ensure the function is implemented

### 3.2 Frontend — GroupReportPage

- [ ] `app/src/pages/GroupReportPage.tsx` — new page at `/groups/:tagId/report`
  - Route param: `tagId` — loads tag metadata + latest completed run via `GET /api/survey-groups/tags/:tagId/report/latest`
  - If no completed run: show "No report yet. Generate one." with the generate button
  - If run is in progress: show streaming progress view (SSE connect to `GET /api/survey-groups/insights/:runId/stream`)
  - If run is completed: render 4-section report layout

- [ ] Streaming progress component
  - Connect to SSE endpoint on mount
  - Render step list with check/spinner icons
  - Animated progress bar based on step count
  - "Crystal is thinking..." collapsible for `thinking` events

- [ ] Report section components
  - `GroupExecutiveSummary` — metrics snapshot + narrative
  - `GroupThemesSection` — `group.theme` insight cards
  - `GroupGapsSection` — `group.gap` insight cards with "Create Survey" CTA
  - `GroupSuggestionsSection` — `group.suggest` insight cards

- [ ] "Create Survey from Gap" flow
  - Clicking "Create Survey" on a gap card pre-populates the survey creation modal with `suggested_survey_json`
  - Pre-fills: title, survey type, question stubs from `questions_hint`, and applies the group's tags automatically

### 3.3 Tests

- [ ] `crystalos/tests/test_group_insights_pipeline.py`
  - Mock surveys + responses; run full pipeline
  - Verify `group_insights` records written with correct categories and layers
  - Verify `data_gap_signals` structure and all 5 gap types represented when applicable
- [ ] `app/src/__tests__/GroupReportPage.test.tsx`
  - Renders loading state when run is pending
  - Renders progress view when run is in progress (mock SSE events)
  - Renders report sections when run is completed

---

## Phase 4 — Proactive Intelligence (Week 4–5)

**Goal:** Crystal proactively surfaces group intelligence without being asked. Gap signals appear in single-survey reports.

**Exit criteria:** After Crystal generates insights for a survey that belongs to a group, a "Your Employee Experience group is missing Q4 data" card appears in the survey insight report. Crystal can suggest tags for untagged surveys.

### 4.1 AI-Suggested Tags

- [ ] `crystalos/skills/tag-suggester/SKILL.md` — new skill
  - Input: survey metadata (title, type, topics, response count)
  - Input: existing org tags (name, description, program_config, member_survey_titles)
  - Output: `suggested_tags: [{ tag_id, tag_name, confidence, rationale }]`
  - Only suggests tags with confidence > 0.7

- [ ] Wire into single-survey insight pipeline (`graphs/insights.py`)
  - After `topics` node: if org has tags and survey is untagged, call tag-suggester skill
  - Add `suggested_tags` to the insight state; persist as an `insights` record with `category = 'tag_suggestion'`

- [ ] Frontend: show tag suggestion card in `InsightsDashboardPage`
  - "Crystal suggests adding this survey to [Tag Name]" with Accept/Dismiss buttons
  - Accept button calls `POST /api/surveys/:id/tags`

### 4.2 Gap Signals in Single-Survey Reports

- [ ] `crystalos/graphs/insights.py` — add gap cross-reference node
  - After `publish` node: if survey belongs to a group, run lightweight gap check on the group
  - If gaps are found that involve this survey: create a `group.gap` insight linked to the single-survey insights page
  - This is a read-only signal — it does not trigger a full group report run

- [ ] Frontend: cross-group gap banner in `InsightsDashboardPage`
  - Dismissible banner: "Your Customer Experience group hasn't received pulse data in 47 days. [View Group Report]"
  - Links to `GroupReportPage`

### 4.3 Program Blueprint Tier

- [ ] `PUT /api/tags/:id` — allow updating `program_config`
  - This already exists in `tags.js` — verify the `program_config` update path works end to end

- [ ] `TagsSettingsPage` — "Upgrade to Program" flow
  - Button on each tag: "Promote to Program"
  - Drawer opens with program config fields:
    - Program type (employee_experience / customer_experience / custom)
    - Expected survey types (multi-select from SurveyType enum)
    - Cadence (monthly / quarterly / biannual / annual)
    - Review cycle (months)
  - Saves via `PUT /api/tags/:id` with `program_config` body

### 4.4 Workflow Triggers on Tag Events

- [ ] `backend/src/routes/tags.js` — emit events after tag mutations
  - After successful tag add (`POST /api/surveys/:surveyId/tags`): emit `survey.tagged` event
  - After successful tag remove: emit `survey.untagged` event
  - Events go to the workflow engine event bus

- [ ] `workflows.js` / workflow engine — handle `survey.tagged` trigger
  - New trigger type: `survey_tagged` with condition `{ tag_id: uuid }`
  - Enables: "When a survey is tagged with [CX Program], notify the program owner"

---

## Phase 5 — Polish and Scale (Week 5–6)

**Goal:** Export-ready reports, tier limits enforced, performance validated, full test coverage.

**Exit criteria:** A group report can be exported as PDF. Tag limits are enforced by plan tier. Group queries on 10+ surveys complete in < 10 seconds. Test coverage > 80% on new code.

### 5.1 Group Report Export

- [ ] `GroupReportPage` — "Export Report" button
  - Reuse existing report download infrastructure (check `docs/implementation/` for existing PDF/PPTX export)
  - Pass `group_insights` records to the export renderer
  - Output: PDF with 4 sections, org logo, tag name as title, generation date

- [ ] Backend: `GET /api/survey-groups/insights/:runId/export`
  - Returns a signed URL to the generated PDF in Firebase Storage (or equivalent)
  - Delegates to existing export pipeline

### 5.2 Tier-Based Tag Limits

- [ ] `backend/src/routes/tags.js` — replace static `ORG_TAG_LIMIT = 50` with tier lookup
  - Query org plan tier from `orgs` table
  - Apply: Free=5, Pro=25, Enterprise=200
  - Return 402 with upgrade prompt when limit reached for current tier

- [ ] Frontend: upgrade prompt when tag limit reached
  - `TagSelector` shows "Upgrade to add more tags" when at limit and on Free/Pro

### 5.3 Performance

- [ ] Index audit for group queries
  - Verify `idx_gir_tag_ids GIN` is used for `tag_ids @> $2::jsonb` query in `/tags/:tagId/report/latest`
  - Add index on `group_insights (org_id, superseded_at)` if query planner is not using `idx_gi_active`
  - Benchmark: 10-survey group query at 5000 responses total, target < 8 seconds end-to-end

- [ ] Response sampling in pipeline — verify cap is working
  - `LIMIT 2000` across surveys is enforced in `load_surveys` node
  - Sampling is even: `ROUND(2000.0 / num_surveys)` per survey, min 50

### 5.4 Test Coverage

- [ ] Backend — integration tests for full group flow
  - `backend/src/__tests__/survey-groups.test.js`
  - Create 3 surveys, tag them, generate group insight run, verify status/stream endpoints

- [ ] CrystalOS — gap detection unit tests (all 5 passes)
  - `crystalos/tests/test_gap_detection.py`
  - Each pass tested with a crafted scenario that triggers the expected gap type
  - Edge cases: empty group (0 surveys), single survey, all surveys of same type

- [ ] Frontend — E2E test (Playwright)
  - `app/tests/e2e/group-report.spec.ts`
  - Flow: create tag, tag 2 surveys, generate report, wait for completion, verify sections render

### 5.5 Documentation

- [ ] Update `crystalos/CLAUDE.md` — document 6 new group tools
- [ ] Update `crystalos/docs/SKILLS_CATALOG.md` — add `gap-analyst` and `tag-suggester` skills
- [ ] Update `docs/TRACKER.md` — add Survey Groups tasks to Phase 2 (AI Engine)
- [ ] Add `GET /api/tags/:id/surveys` and all survey-groups endpoints to backend API reference

---

## Dependencies and Sequencing Notes

- **Phase 1 must complete before Phase 2.** The DB schema must exist before the Crystal tools can query it. The backend routes must exist before CrystalOS can proxy through the backend's agentsClient.

- **Phase 2 and Phase 3 can partially overlap.** The Crystal group tools (Phase 2) are prerequisites for the group insight pipeline (Phase 3 LangGraph nodes). But the frontend GroupReportPage (Phase 3) can be scaffolded while Phase 2 is in progress.

- **Phase 4 depends on Phase 3.** Proactive gap signals require the gap detection algorithm (Phase 3) to be running and producing `group_insights` records.

- **Phase 5 is purely additive.** It does not block any other phase. Performance tuning and tier enforcement can be done in parallel with Phase 4 work.

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Group insight pipeline times out for large groups | Medium | High | 2000-response cap + 120s SSE timeout + zombie sweep |
| LLM hallucination in theme synthesis | Medium | Medium | Trust score gate (existing hallucination_scorer.py); `trust_score < 0.6` suppresses insight display |
| Gap detection produces too many low-value signals | Medium | Medium | Severity threshold: only surface `medium` and above by default; `low` visible on demand |
| 5-tag trigger breaks existing survey save flows | Low | High | Trigger is BEFORE INSERT only; no existing code path inserts more than 5 tags; unit test covers the limit |
| SSE polling creates DB connection pressure at scale | Low | Medium | 3s poll interval; MAX_POLLS=40; SSE connections are short-lived; Postgres pool is sized for this |

---

*See RESEARCH.md for the strategic rationale and DESIGN.md for the complete technical specification.*
