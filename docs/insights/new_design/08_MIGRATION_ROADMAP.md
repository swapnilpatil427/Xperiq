# Migration Roadmap — Current → v2 Pipeline

> Phased delivery to minimize risk. Each phase shippable independently.

---

## Phase 0 — Foundation (2 weeks)

**Goal:** Fix known bugs; no schema break.

| Task | Owner | Files |
|------|-------|-------|
| Pass `force_regenerate` from API body | Backend | `crystalos/main.py`, `insights.ts` |
| Fix `schedule` → `scheduler` trigger CHECK | Migration + publish | `insights.py`, SQL |
| Wire `compute_delta()` in `node_publish` | CrystalOS | `insights.py`, `delta.py` |
| Persist `topic_fingerprint` on checkpoint insert | CrystalOS | `node_publish` |
| Gate automated checkpoint on `meaningful_delta` (feature flag) | CrystalOS | `node_publish` |

**Exit criteria:** `delta_from_prior` populated on new checkpoints; fewer noise writes.

**Note:** If Phase 0.5 is implemented directly (recommended fast-path), the following Phase 0 tasks are SUPERSEDED:
- "Wire `compute_delta()` in `node_publish`" → superseded by `node_delta_compute` in Phase 0.5
- "Gate automated checkpoint on `meaningful_delta`" → superseded by `node_delta_compute` in Phase 0.5

The following Phase 0 tasks MUST be completed before Phase 0.5 ships (they are dependencies):
- "Fix `schedule` → `scheduler` trigger CHECK" — every automated checkpoint write currently fails the CHECK constraint silently. This must be fixed first.
- "Pass `force_regenerate` from API body" — required for Refresh to work correctly.
- "Persist `topic_fingerprint` on checkpoint insert" — required for future Phase 2 topic lifecycle.

---

## Phase 0.5 — Trajectory-first quick win (3–5 days)

**Goal:** Deliver "complete investigation details" on the existing Intelligence page **without any new tables or Trail UI (two minimal schema changes required: one ADD COLUMN and one CHECK constraint fix).** This is the fastest path from zero to a customer seeing real provenance.

**Why this phase exists:** The full v2 roadmap delivers everything — but in 18 weeks. Phase 0.5 unlocks the core product promise in one sprint by fixing the pipeline node ordering and surfacing delta data in the existing UI.

### What customers see after Phase 0.5

| Before | After |
|--------|-------|
| "NPS is 41." | "NPS 41 · ↓3.2 since last checkpoint (Jun 22)" |
| Insight cards with no history | Topic change bar: "▲ Wait Time · ▲ Onboarding · ▼ Billing" |
| No trigger info | "Updated 2h ago · Automated (new responses) · checkpoint #14 · 12 new responses" |
| No credit cost visibility | Provenance shows "5 credits" (from org's configured `credit_cost_automated_checkpoint` setting — not per-checkpoint DB value in Phase 0.5) |
| LLM narrates without knowing history | LLM narrates with DELTA_FACTS and 5 prior checkpoint NPS values |
| Crystal can't answer "what changed?" | Crystal answers trajectory questions via `get_recent_checkpoints` (ordered-by-number, not chain-walk) |
| In-progress analysis invisible | "Analyzing 12 new responses…" state visible in header band |
| Brand admins unaware of new intelligence | In-app notification: "New intelligence ready for [Survey Name]" |

**Explicitly NOT in Phase 0.5 (deferred to later phases):**
- Verbatim citation drill-through from topic chips (Phase 4 Trail)
- Full Insight Trail page (Phase 4)
- `get_checkpoint_chain` linked-list walk (Phase 1 — requires `parent_checkpoint_id`)
- Share-weighted topic lifecycle (`compute_topic_lifecycle`) (Phase 2)
- Checkpoint comparison view (Phase 4)

### Tasks

| Task | Owner | Files | Notes |
|------|-------|-------|-------|
| **DEPENDENCY:** Add `meaningful_delta` column to `survey_insight_checkpoints` | Migration | `supabase/migrations/` | `ALTER TABLE survey_insight_checkpoints ADD COLUMN IF NOT EXISTS meaningful_delta BOOLEAN NOT NULL DEFAULT FALSE;` — must run before Phase 0.5 node_publish can write `meaningful_delta`. Column already exists on `insight_checkpoints_v2` (Phase 1+) but NOT on the Phase 0.5 legacy table. |
| **DEPENDENCY:** Fix trigger CHECK constraint (`schedule` → correct values) | CrystalOS + Migration | `insights.py`, SQL | Must ship before Phase 0.5. Current checkpoint writes fail silently on scheduler trigger. Exact migration: `ALTER TABLE survey_insight_checkpoints DROP CONSTRAINT IF EXISTS survey_insight_checkpoints_trigger_check; ALTER TABLE survey_insight_checkpoints ADD CONSTRAINT survey_insight_checkpoints_trigger_check CHECK (trigger IN ('responses', 'days', 'manual', 'stream', 'scheduler', 'milestone'));` |
| Register feature flag `insights_trajectory_v1` | Backend + Frontend | `org_feature_flags` table or flag registry, `useFeatureFlag` hook | Off by default; flip per org for testing. |
| Implement `node_delta_compute` as graph node | CrystalOS | `crystalos/graphs/insights.py`, `crystalos/tools/delta.py` | Implements `extract_metrics_from_state`, `extract_metrics_from_blob`, `build_current_topic_name_set`, `evaluate_meaningful_delta`. Uses `compute_delta()` (exists). Does NOT use `compute_topic_lifecycle` (Phase 2). |
| Wire `node_delta_compute` BEFORE `node_narrate` in graph | CrystalOS | `crystalos/graphs/insights.py` | Remove edge `topics → narrate`. Add edges `topics → delta_compute → narrate`. Update `InsightState` TypedDict and `initial_state` with three new keys. |
| Inject `DELTA_FACTS` into `node_narrate` specialist_overlay | CrystalOS | `crystalos/graphs/insights.py` | Prepend DELTA_FACTS block to `specialist_overlay` before parallel specialist calls. Suppress `ESTABLISHED_FINDINGS` block when `prior_checkpoint_summaries` are present. Add `BASELINE_MODE` block for bootstrap. See `04_PIPELINE_SPEC.md §6` for exact block format. Handle cache-hit path: even when narrate short-circuits, write `delta_from_prior` to the checkpoint record. |
| Update `node_publish` INSERT to write `delta_from_prior` and `meaningful_delta` | CrystalOS | `crystalos/graphs/insights.py` | Column already exists in `survey_insight_checkpoints`. Task is to add these fields to the INSERT column list and VALUES. Read from `state["delta_from_prior"]` and `state["meaningful_delta"]`. Remove old delta computation from `node_publish` (it is now in `node_delta_compute`). |
| Add UNIQUE constraint on `(survey_id, org_id, checkpoint_number)` | Migration | `supabase/migrations/` | Prevents duplicate checkpoint numbers from concurrent runs. One-line ALTER TABLE. |
| Add `checkpoint_written` SSE event | Backend + CrystalOS | `backend/src/routes/insights.ts`, `crystalos/graphs/insights.py` | CrystalOS `node_publish` appends `{'event': 'checkpoint_written', 'checkpoint_number': N, 'nps': ..., 'meaningful': true}` to `agent_runs.stream_events` JSONB array. The existing backend SSE handler (`GET /api/insights/:surveyId/stream`) streams all events from `stream_events` automatically — no additional backend SSE code needed beyond reading the stream events. The frontend listens for `checkpoint_written` and calls `GET /api/insights/:surveyId/list` to refresh `latest_checkpoint`. |
| Add `latest_checkpoint` to GET /api/insights/:surveyId/list response | Backend | `backend/src/routes/insights.ts` | Add to the `GET /api/insights/:surveyId/list` response body. Query `survey_insight_checkpoints` for the latest row (ORDER BY checkpoint_number DESC LIMIT 1). Return `{number, nps, delta, meaningful, created_at, trigger, credits_debited_note}`. **Note:** `credits_debited` is NOT in the Phase 0.5 legacy table schema — omit from the response in Phase 0.5. The `InvestigationDrawer` credit cost row shows `settings.credit_cost_automated_checkpoint` (default 5 credits) as the configured cost, not a per-checkpoint actual cost. Per-checkpoint actual credit tracking is Phase 1+ (`insight_checkpoints_v2.credits_debited`). |
| Implement in-app notification on `meaningful_delta=true` | Backend | `backend/src/routes/insights.ts` (or trigger in `crystalos/graphs/insights.py`) | Event: "New intelligence ready for [Survey Name]". Recipients: `notify_user_ids` or all `brand_admin` in org. Channel: `in_app` via `notification_events` table. See `05_CONFIGURATION.md §F` for full spec. |
| Build `EnhancedHeaderBand` component | Frontend | `app/src/components/` | Replaces legacy NPS row AND Section 5 header strip when flag is on. All 5 states (skeleton, generating, bootstrap, legacy, full-delta). Incorporates [View trail] (conditional on `insights_trail_ui` flag), [Generate ▾], [↻ Refresh] with Section 12 state machine. |
| Build `InvestigationDrawer` component | Frontend | `app/src/components/` | Sections A–D, 4 drawer states (bootstrap, legacy, full-delta, baseline). Sparkline with degraded states for 1–4 data points. Full accessibility spec (Section 15.6). |
| Build `TopicChangeBar` component | Frontend | `app/src/components/` | Read-only chips with cursor-default. AnimatePresence. |
| Add i18n keys for Section 15 | Frontend | `app/src/locales/en.ts` | All keys from `04_UX_DESIGN.md §15.4`. Includes trigger label map, accessibility labels, credit cost label. |
| Crystal: implement `get_recent_checkpoints` tool | CrystalOS | `crystalos/skills/insight-analyst/` | Phase 0.5 Crystal tool: `get_recent_checkpoints(survey_id, limit=5)`. Queries `survey_insight_checkpoints ORDER BY checkpoint_number DESC LIMIT 5`. Returns checkpoint metadata + delta summaries. See `07_CRYSTAL_INTEGRATION.md` for spec. |

**Exit criteria:**
- [ ] Automated pipeline run with 2+ prior checkpoints: narrated text references NPS delta (e.g. "NPS dropped 3.2 points") sourced from DELTA_FACTS block. Verify in logs: `node_delta_compute_done` event + no `ESTABLISHED_FINDINGS` in narrate overlay.
- [ ] Bootstrap run (first checkpoint): narrated text contains no directional language ("increased", "decreased", "dropped", "grew"). BASELINE_MODE block confirmed in narrate overlay logs.
- [ ] State 4 (legacy checkpoint, delta=null): Intelligence page shows NPS number without delta chip. Drawer shows "Delta not available" message in Section A.
- [ ] State 2 (generating): Intelligence page shows "Analyzing N new responses…" in place of delta chip. Refresh button is disabled.
- [ ] GET /api/insights/:surveyId/list returns `latest_checkpoint.delta` when pipeline has run at least once with Phase 0.5 code.
- [ ] `checkpoint_written` SSE event emitted on pipeline completion. Frontend refreshes delta chip without page reload.
- [ ] Intelligence page shows in-app notification "New intelligence ready for [Survey Name]" to brand_admin when `meaningful_delta=true` checkpoint is written.
- [ ] Crystal answers "what changed since last time?" using `get_recent_checkpoints` tool and summarizes delta from returned data.
- [ ] TypeScript: `npx tsc --noEmit` passes.
- [ ] Python: `pytest tests/` passes including new tests for `node_delta_compute`, `evaluate_meaningful_delta`, and DELTA_FACTS injection.
- [ ] No new tables required (beyond the UNIQUE constraint ALTER TABLE).

**Feature flag:** `insights_trajectory_v1` — registered in flag registry, off by default, flip per org.

---

## Phase 1 — Data model v2 (3 weeks)

**Goal:** New tables alongside old.

| Task | Detail |
|------|--------|
| Migration `insight_checkpoints_v2` | [03_DATA_MODEL.md](./03_DATA_MODEL.md) Section 3 |
| Migration `org_insight_defaults` | [03_DATA_MODEL.md](./03_DATA_MODEL.md) Section 13 — org-level config fallback |
| Migration `survey_insight_settings` + defaults | Seed defaults on survey create; COALESCE from org_insight_defaults |
| Migration `insight_reports` | Manual documents |
| Migration `custom_reports` | [03_DATA_MODEL.md](./03_DATA_MODEL.md) Section 10 — Custom Analysis output |
| Migration `custom_report_insights` | [03_DATA_MODEL.md](./03_DATA_MODEL.md) Section 11 — NEVER joins with `insights` table |
| `insights` table extensions | Add nullable columns: `projection_source_checkpoint_id UUID`, `lane TEXT DEFAULT 'automated'`, `insight_report_id UUID`. Backfill: `lane` = `'automated'` for all existing rows (safe default); `projection_source_checkpoint_id` and `insight_report_id` remain NULL for pre-migration rows (acceptable — lineage only applies to runs after migration). |
| Backfill script | Old checkpoints → v2 with inferred `parent_checkpoint_id` (order by checkpoint_number ASC) |
| Dual-write | New runs write v2 + old table (compat) |

**Exit criteria:** v2 table populated; old API still works.

> **Pre-lineage rows:** Existing `insights` rows where `projection_source_checkpoint_id IS NULL` are treated as "pre-lineage" records. They continue to appear on the Intelligence page as before, but are excluded from the Insight Trail UI — the trail only shows runs that occurred after migration and carry a linked checkpoint reference.

---

## Phase 2 — `resolve_context` + automated read path (4 weeks)

**Goal:** Automated runs read checkpoint chain.

| Task | Detail |
|------|--------|
| New graph node `resolve_context` | [04_PIPELINE_SPEC.md](./04_PIPELINE_SPEC.md) |
| Profile param `automated_incremental` | `run_insight_generation` |
| Watermark-based ingest | Skip pre-watermark verbatims |
| `cluster_delta` node | Merge into parent topics |
| `node_delta_compute` extension | Add `compute_topic_lifecycle()` (share-weighted topic lifecycle), switch DB query from `ORDER BY checkpoint_number DESC` to `walk_parent_chain(parent_checkpoint_id)` (requires Phase 1 `insight_checkpoints_v2`). The node itself was implemented in Phase 0.5; this task only extends it. |
| Incremental narrate prompt | Prior checkpoint summaries |
| Publish gate | Skip checkpoint if not meaningful |

**Exit criteria:** Stream run with parent loads blob chain; delta in narrate context; gated writes.

**Feature flag:** `insights_v2_pipeline`

---

## Phase 3 — Manual modes (3 weeks)

**Goal:** Expert + Quick separated from automated.

| Task | Detail |
|------|--------|
| `POST /runs` with mode + window | Backend |
| `manual_expert` / `manual_quick` profiles | CrystalOS |
| `insight_reports` publish path | No supersede of automated |
| Manual run dialog UI | [06_UX_DESIGN.md](./06_UX_DESIGN.md) |
| Rate limits + cost preview | Backend + UI |

**Exit criteria:** Manual report opens at `/reports/:id`; automated active unchanged.

---

## Phase 4 — Insight Trail UI (3 weeks)

**Goal:** Customer-visible history.

| Task | Detail |
|------|--------|
| Trail page + routes | Frontend |
| Checkpoint detail + tabs | Frontend |
| API `GET /trail` | Backend |
| Compare view | Frontend + API |
| Collapsed similar checkpoints | UI logic |

**Exit criteria:** Customer can filter Automated vs Manual history.

---

## Phase 5 — Configuration UI (2 weeks)

| Task | Detail |
|------|--------|
| Settings page | [05_CONFIGURATION.md](./05_CONFIGURATION.md) |
| PATCH settings API | Backend |
| `config_hash` on checkpoints | CrystalOS |
| Org presets | Product |

---

## Phase 6 — Crystal integration (2 weeks)

| Task | Status | Files | Notes |
|------|--------|-------|-------|
| `get_recent_checkpoints` tool | ✅ DONE in Phase 0.5 | — | Already implemented per Phase 0.5 task table; do not re-implement. |
| `get_checkpoint_chain`, `get_insight_trail`, `get_checkpoint_detail`, `get_insight_report`, `compare_checkpoints`, `view_report` action proposal | Phase 6 | `crystalos/skills/insight-analyst/` | New Phase 6 Crystal tools — see [07_CRYSTAL_INTEGRATION.md](./07_CRYSTAL_INTEGRATION.md) for specs (all marked Phase 1–4 dependencies). |
| `InsightDocumentCard` | Phase 6 | `app/src/components/` | — |
| Manual run action proposal | Phase 6 | Crystal + confirm card | — |
| Citation context enrichment | Phase 6 | experience route | — |

---

## Phase 7 — Deprecation & cleanup (2 weeks)

| Task | Detail |
|------|--------|
| Stop dual-write to `survey_insight_checkpoints` | |
| Redirect old API paths | |
| Retention/compaction job | Ops |
| Update `intelligence-lifecycle-visual-guide.md` | Docs |
| Remove anchor-run prior_insight SQL path | CrystalOS |

---

## Timeline summary

```
Week  0  2  4  6  8  10 12 14 16 18
      P0 P1    P2       P3    P4  P5 P6 P7
      ▓▓ ▓▓▓▓  ▓▓▓▓▓▓   ▓▓▓▓  ▓▓▓ ▓▓ ▓▓ ▓▓
```

**Total:** ~18 weeks with 2 engineers (1 backend/CrystalOS, 1 frontend). Parallelizable to ~12 weeks with 3.

---

## Risk register

| Risk | Mitigation |
|------|------------|
| Backfill breaks parent chain | Validate with SQL constraints + manual audit sample |
| Narrate quality drops on incremental | A/B shadow runs; fallback to wider sample flag |
| Firehose cost spike on manual Expert | Corpus caps + cost preview |
| Customers confused by two histories during dual-write | Flag + Trail shows v2 only |
| Blob schema v2 incompatibility | `schema_version` reader handles v1 + v2 |

---

## Testing strategy

| Layer | Tests |
|-------|-------|
| Unit | `compute_delta`, `evaluate_meaningful_delta`, `cluster_delta` |
| Integration | `resolve_context` with fixture checkpoints |
| Golden | Same inputs → identical delta JSON |
| E2E | Manual Expert run → report URL → Trail visible |
| Load | Firehose survey: gated writes < 30% of today |
| Notification | meaningful_delta checkpoint → in-app notification emitted to brand_admin |

---

## Rollback plan

- Feature flag `insights_v2_pipeline` off → revert to anchor-run path
- v2 tables remain; no data loss
- UI Trail hidden behind `insights_trail_ui` flag

---

## Success criteria (GA)

- [ ] 100% automated checkpoints have `parent_checkpoint_id` (post-bootstrap)
- [ ] `delta_from_prior` on all meaningful writes
- [ ] Manual Expert/Quick selectable in UI
- [ ] Trail filters Automated vs Manual
- [ ] Crystal returns `document_url` for report requests
- [ ] Default lookback=5 configurable
- [ ] `intelligence-lifecycle-visual-guide.md` updated to v2 behavior
- [ ] In-app notifications delivered on all meaningful_delta=true automated checkpoints
- [ ] `get_checkpoint_chain` returns correct linked-list walk post-Phase-1 migration

---

## Open questions (for product decision)

1. **Manual overwrite:** Should pinning a manual report promote it to "active" for all users or per-user?
2. **Compaction:** Delete non-meaningful checkpoint blobs after 30d or keep forever?
3. **Cross-survey Expert:** Phase 2 of manual modes or separate initiative?
4. **PDF export:** Trail report → PDF in v2.0 or v2.1?
