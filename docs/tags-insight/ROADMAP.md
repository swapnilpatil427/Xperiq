# Tags & Group Intelligence — Build Roadmap

> **Sequencing philosophy:** The tag system is infrastructure. Phase 1 ships the
> plumbing (data model, APIs, basic UI) with zero AI. Phase 2 adds the first
> intelligent surface (Group Intelligence Report). Phase 3 closes the intelligence
> loop (auto-tagging, namespace governance). Phase 4 integrates tags into the rest of
> the platform (workflows, reports, MCP). Each phase is independently shippable and
> delivers real user value — no phase is a "behind the scenes" sprint.

---

## Phase 1 — Foundation (Weeks 1–2)

**Goal:** Tags exist. Users can create, apply, and filter by them. No intelligence yet.
Ship this in the first two weeks so CX teams can start organizing their survey libraries
immediately — even before the intelligence layer is ready.

### What ships

- Tags CRUD (create, read, update, soft-delete)
- Apply tags to surveys (inline picker, bulk apply)
- Tag filter bar in survey list (OR and AND modes, URL state)
- "Group by tag" swim-lane view
- `/settings/tags` management page
- Tag pills on survey cards with hover tooltips

### What does NOT ship

- No tag aggregation or intelligence views
- No Crystal involvement
- No namespace governance enforcement in Phase 1
- No tag_insights materialized view

---

### Phase 1: Database migrations

**File:** `supabase/migrations/20260701_tags_core.sql`

```sql
-- 1. tags table (full schema in ARCHITECTURE.md)
CREATE TABLE tags ( ... );

-- 2. survey_tags join table
CREATE TABLE survey_tags ( ... );

-- 3. tag_proposals table (for future Crystal integration)
CREATE TABLE tag_proposals ( ... );

-- 4. tag_hierarchies closure table
CREATE TABLE tag_hierarchies ( ... );

-- 5. All indexes as specified in ARCHITECTURE.md
```

### Phase 1: New files to create

**Backend:**
- `backend/src/routes/tags.ts` — all CRUD routes
- `backend/src/middleware/tagAuth.ts` — namespace lock check middleware
- `backend/src/lib/tagCache.ts` — Redis cache helpers
- `backend/src/types/tags.ts` — TypeScript types

**Frontend:**
- `app/src/components/tags/TagPill.tsx`
- `app/src/components/tags/TagPicker.tsx`
- `app/src/components/tags/TagFilterBar.tsx`
- `app/src/components/tags/TagColorPicker.tsx`
- `app/src/hooks/useTags.ts`
- `app/src/hooks/useSurveyTags.ts`
- `app/src/pages/settings/TagsSettingsPage.tsx`

### Phase 1: Files to modify

- `app/src/pages/SurveyListPage.tsx` — add TagFilterBar, tag pills, "Group by tag" view
- `app/src/components/SurveyCard.tsx` — add tag pill row + `T` keyboard shortcut
- `app/src/AppRouter.tsx` — add `/settings/tags` route
- `app/src/locales/en.ts` — add all tag-related strings
- `backend/src/routes/index.ts` — mount `tagsRouter`
- `docs/TRACKER.md` — add Phase 1 tasks

### Phase 1: API endpoints to build

- `GET /api/tags` (with search + namespace params + Redis cache)
- `POST /api/tags`
- `PUT /api/tags/:id`
- `DELETE /api/tags/:id` (soft delete)
- `POST /api/surveys/:id/tags`
- `DELETE /api/surveys/:id/tags/:tagId`
- `GET /api/tag-insights/:tagSlug` — **stub only** in Phase 1

### Phase 1: Acceptance criteria

| # | Criterion | How to verify |
|---|---|---|
| P1-1 | User can create a tag with name, color, icon from the survey card tag picker | Manual test: create survey, press T, create new tag |
| P1-2 | Tag persists across page reload | Check DB: `SELECT * FROM tags`, reload page |
| P1-3 | Tag filter bar filters survey list; URL contains `?tags=slug` | Check URL, check list shows only matching surveys |
| P1-4 | "Match all" AND mode works correctly | Apply 2 tags, switch to AND, verify only surveys with both appear |
| P1-5 | "Group by tag" view renders swim lanes with correct surveys | Visual check + count verification |
| P1-6 | `/settings/tags` shows all org tags, allows rename/color change/delete | Manual CRUD test |
| P1-7 | Soft delete: deleted tag disappears from UI but `deleted_at` set in DB | Check DB after delete |
| P1-8 | Tag list API returns in ≤80ms (p95) with 50 tags | Load test or manual timing |
| P1-9 | All tag strings use `t('key')` — no hardcoded strings in JSX | `grep -r '"Tag"' app/src/` |
| P1-10 | Frontend tests: TagPill, TagPicker, TagFilterBar at ≥80% coverage | `npm test -- --coverage` |
| P1-11 | Backend tests: all tag route handlers including auth | `npm test` in backend |

---

## Phase 2 — Group Intelligence (Weeks 3–4)

**Goal:** The Group Intelligence Report is live. CrystalOS aggregates cross-survey
insights for each tag group. Crystal generates AI narrative briefs.

### What ships

- `tag_insights` materialized view (Postgres)
- `tag_insight_trend` table (daily snapshots)
- `GET /api/tag-insights/:tagSlug` — full aggregate response
- `GET /api/tag-insights/:tagSlug/trend` — trend data
- `/tag-insights/:slug` route and full page
- CrystalOS `tag_insight_pipeline` LangGraph graph
- 15-minute pipeline cron job

---

### Phase 2: Database migrations

**File:** `supabase/migrations/20260715_tag_insights.sql`

```sql
CREATE TABLE tag_insight_trend ( ... );
CREATE MATERIALIZED VIEW tag_insights AS ( ... );
CREATE UNIQUE INDEX idx_tag_insights_tag_id ON tag_insights (tag_id);

-- CONCURRENTLY refresh requires the unique index — never blocks reads
CREATE OR REPLACE FUNCTION refresh_tag_insights()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY tag_insights;
END;
$$ LANGUAGE plpgsql;
```

### Phase 2: New files to create

**Backend:**
- `backend/src/routes/tagInsights.ts`
- `backend/src/jobs/tagInsightRefresh.ts`
- `backend/src/lib/tagInsightsCache.ts`

**Frontend:**
- `app/src/pages/TagInsightPage.tsx`
- `app/src/components/tags/TagKpiRow.tsx`
- `app/src/components/tags/TagNpsTrendChart.tsx`
- `app/src/components/tags/TagTopicHeatmap.tsx`
- `app/src/components/tags/TagSurveyBreakdownTable.tsx`
- `app/src/components/tags/CrystalNarrativePanel.tsx`
- `app/src/hooks/useTagInsight.ts`

**CrystalOS:**
- `crystalos/skills/tag_insight_pipeline/SKILL.md`
- `crystalos/skills/tag_insight_pipeline/skill.py`
- `crystalos/skills/tag_insight_pipeline/EVALS.md`

### Phase 2: Acceptance criteria

| # | Criterion | How to verify |
|---|---|---|
| P2-1 | `tag_insights` materialized view contains one row per active tag with correct aggregate_nps | SQL: `SELECT * FROM tag_insights LIMIT 5` |
| P2-2 | Pipeline runs and updates `tag_insights.refreshed_at` | Check timestamp after manual trigger |
| P2-3 | `/tag-insights/:slug` page loads in ≤1.2s (p95) | Lighthouse + manual timing |
| P2-4 | KPI row shows correct aggregate NPS matching SQL calculation | Cross-check vs. `SELECT` from materialized view |
| P2-5 | Trend chart shows 30-day data points; "60 days" toggle works | Visual check |
| P2-6 | Crystal narrative is non-empty and coherent for any tag with ≥10 responses | Spot-check 3 tags |
| P2-7 | Trust score banner appears when response count < 30 | Create tag with <30 responses |
| P2-8 | "Data may be stale" amber banner appears if pipeline has not run in >20 min | Pause cron, wait 21 min |
| P2-9 | Survey breakdown table sorts by NPS descending by default | Visual check |
| P2-10 | CrystalOS EVALS pass rate ≥90% | Run `make evals` in crystalos |

---

## Phase 3 — Auto-Intelligence (Weeks 5–6)

**Goal:** Crystal suggests Intelligence Groups when surveys are created. Namespace
governance is enforced. Tag Universe is available for Enterprise users.

### What ships

- CrystalOS `auto_tag` skill (embedding + LLM tag proposal)
- Auto-tag proposal UI (confirm-cards on survey creation/edit)
- `tag_proposals` outcomes tracking
- Namespace lock enforcement
- `GET /api/tag-insights/:tagSlug/universe` endpoint
- Tag Universe force-directed graph (`<TagUniverseGraph>`)
- `/tag-insights/universe` route (gated to Enterprise)

---

### Phase 3: New files to create

**Backend:**
- `backend/src/routes/tagUniverse.ts`
- `backend/src/lib/tagProposals.ts`

**Frontend:**
- `app/src/components/tags/TagUniverseGraph.tsx` (D3 force-directed)
- `app/src/components/tags/AutoTagProposalCard.tsx`
- `app/src/pages/TagUniversePage.tsx`
- `app/src/hooks/useAutoTagProposals.ts`

**CrystalOS:**
- `crystalos/skills/auto_tag/SKILL.md`
- `crystalos/skills/auto_tag/skill.py`
- `crystalos/skills/auto_tag/EVALS.md`

### Phase 3: Acceptance criteria

| # | Criterion | How to verify |
|---|---|---|
| P3-1 | Creating a survey triggers Crystal auto-tag skill and shows proposal card | Create survey, observe proposal UI |
| P3-2 | Accepting a proposal applies the tag and records `outcome='accepted'` | Check DB after accepting |
| P3-3 | Dismissing records `outcome='dismissed'` | Check DB after dismissing |
| P3-4 | Auto-tag EVALS: ≥60% accept rate on held-out test set | Run `make evals` in crystalos |
| P3-5 | Locked namespace: non-admin cannot create a tag in locked namespace | Test with non-admin user |
| P3-6 | Admin can lock/unlock a namespace from settings page | Manual test |
| P3-7 | Tag Universe graph renders with correct nodes and edges | Load `/tag-insights/universe` |
| P3-8 | Node hover shows correct NPS and survey count tooltip | Hover a node |
| P3-9 | Clicking a node opens the Tag Intelligence View side panel | Click a node |
| P3-10 | Tag Universe is gated to Enterprise | Log in as Starter user |

---

## Phase 4 — Cross-Feature Integration (Weeks 7–8)

**Goal:** Intelligence Groups become the organizational lens for the entire platform.

### What ships

- Workflow trigger type: `tag_nps_threshold`
- Report scope: `tag_filter` parameter
- Crystal chat: tag-aware queries
- MCP skill: `get_tag_insights(tag_slug, org_id)`

---

### Phase 4: New files to create

**Backend:**
- `backend/src/jobs/tagAlertChecker.ts`
- `backend/src/lib/tagWorkflowTriggers.ts`

**CrystalOS:**
- `crystalos/skills/get_tag_insights/SKILL.md`
- `crystalos/skills/get_tag_insights/skill.py`
- `crystalos/skills/get_tag_insights/EVALS.md`

### Phase 4: Acceptance criteria

| # | Criterion | How to verify |
|---|---|---|
| P4-1 | Workflow with `tag_nps_threshold` trigger fires when tag group NPS crosses threshold | Create workflow, simulate NPS drop |
| P4-2 | Workflow does NOT fire again until NPS recovers and drops again | Re-test after NPS recovers |
| P4-3 | Report can be scoped to a tag group | Create report with tag filter |
| P4-4 | Crystal chat responds correctly to "show me our mobile surveys" | Test 5 tag-aware queries |
| P4-5 | `get_tag_insights` MCP skill callable from external agent | Call skill from Claude desktop |
| P4-6 | MCP skill returns structured response matching API response shape | Compare outputs |
| P4-7 | CrystalOS EVALS for `get_tag_insights` skill pass at ≥90% | Run `make evals` |
| P4-8 | No regression in existing workflow triggers | Run backend workflow test suite |

---

## Cross-Phase Constraints

1. **Soft-delete everywhere.** Tags and survey_tags rows for historical audit — nothing
   is ever hard-deleted.

2. **Tag slugs are immutable.** Once set, `tags.slug` cannot be changed. It is used
   as the identifier in URLs, MCP skill calls, and report configs.

3. **Org scoping on every query.** Every backend route checks `req.orgId` from auth
   middleware and applies `WHERE org_id = ?` to every tag query.

4. **The propose → confirm → execute pattern.** CrystalOS proposes, user confirms,
   backend executes. CrystalOS never writes directly to `survey_tags`.

5. **Test coverage gate.** No phase ships without ≥80% frontend unit test coverage
   on new components and ≥90% backend route test coverage.

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `tag_insights` view refresh blocks reads | Medium | High | Use `REFRESH MATERIALIZED VIEW CONCURRENTLY`; test under load |
| Tag proliferation (tag soup) makes the system unusable | Medium | Medium | Phase 3 namespace governance + a "suggested cleanup" Crystal feature |
| Auto-tag accept rate <40% (Crystal quality miss) | Medium | High | EVALS suite must run before Phase 3 ships; fallback: delay auto-tagging |
| Tag Universe D3 performance with 100+ tags | Low | Medium | Cap at 200 nodes; aggregate small tags into "Other" cluster |
| Workflow tag trigger fires on stale data | Low | High | Always check `tag_insights.refreshed_at` before evaluating triggers |
| Slug collision on tag rename workaround | Low | Medium | Educate users: slug is permanent. Name is a display label. |
