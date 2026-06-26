# Configuration — Survey & Org Settings

> Customers configure **how far back** automated runs look, **when** checkpoints write, and **manual run limits**. Sensible defaults; enterprise overrides.

---

## 1. Configuration hierarchy

```
org_insight_defaults (org-level)
        ↓ merged with
survey_insight_settings (survey-level)
        ↓ snapshotted as
config_hash on each checkpoint/run
```

**Merge rule:** survey non-null fields override org defaults. `config_hash` computed on merged effective config at run start.

---

## 2. Org-level defaults

Table: `org_insight_defaults` (new)

```sql
CREATE TABLE org_insight_defaults (
  org_id                          TEXT PRIMARY KEY,
  settings_json                   JSONB NOT NULL DEFAULT '{}',
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by                      TEXT
);
```

Stored as JSONB for forward compatibility; flattened into `survey_insight_settings` on survey create.

---

## 3. Customer-facing settings UI

**Location:** Settings → Insights → per survey (or org default template)

### Section A — Automated intelligence

| Setting | Label (i18n key) | Default | Range | Description |
|---------|------------------|---------|-------|-------------|
| `automated_insights_enabled` | Enable automated insights (insight cards) | on | — | Master switch — controls continuous card updates on the Intelligence page |
| `automated_report_generation_enabled` | Generate automated report documents | on | — | **Separate from card updates.** When on, full report documents are generated at tier milestones (40/70/100 responses). Turn off to save credits while keeping live cards. |
| `stream_response_threshold` | New responses before auto-update | 10 | 5–500 | Lower = more frequent updates. Enterprise high-volume surveys may set 100–200 to avoid noise. |
| `report_regen_threshold` | Responses before narrative refresh | 25 | 10–200 | Min new data for full report regen |
| `prior_checkpoint_lookback` | **Prior checkpoints to reference** | **5** | 1–20 | How many past checkpoints inform delta |
| `prior_checkpoint_max_age_days` | Max age of prior checkpoints | 90 | 7–365 | Ignore older nodes in lookback walk |
| `full_checkpoint_response_threshold` | Force full checkpoint after N new | 200 | 50–2000 | Full archival checkpoint |
| `meaningful_delta_nps_points` | NPS change worth reporting | 2.0 | 0.5–10 | Suppress noise |
| `meaningful_delta_topic_pct` | Topic share change (pp) | 10 | 5–25 | Declining/emerging threshold |

> **Why two automated settings?** `automated_insights_enabled` controls whether the live Intelligence page stays current. `automated_report_generation_enabled` controls whether a document artifact is produced at each milestone. Document generation is 3–5× more expensive (credits). Many orgs want always-on card updates but only generate full documents on demand.

### Section B — Refresh (user-initiated from Intelligence page)

The "Refresh" button on the Experience → Intelligence page triggers a quick-profile run scoped to a recent time window. Unlike manual Expert/Quick (which require an explicit window selection), Refresh uses a configurable default lookback with a response-count fallback so low-volume surveys always have enough data.

| Setting | Label | Default | Range | Description |
|---------|-------|---------|-------|-------------|
| `refresh_lookback_days` | Refresh window (days) | 30 | 7–365 | How many days back the "Refresh" button looks by default |
| `refresh_min_response_count` | Minimum responses for refresh | 25 | 5–100 | If fewer than N responses exist in the window, automatically expand backwards until N are found. Prevents "insufficient data" errors on slow-cadence surveys. |
| `refresh_daily_limit` | Refreshes per day | 5 | 1–20 | Survey-level limit. Prevents accidental cost runup. |

**Fallback algorithm** (consistent with `04_PIPELINE_SPEC.md` Section 2):
```
1. window_start = NOW() - refresh_lookback_days; window_end = NOW()
2. corpus = responses WHERE created_at IN [window_start, window_end]
3. IF len(corpus) < refresh_min_response_count:
     WHILE len(corpus) < refresh_min_response_count AND window_end - window_start < 365d:
       window_start -= 7d
       corpus = responses WHERE created_at IN [window_start, window_end]
     Surface UI notice: "Window expanded to [actual window_start] to reach minimum sample"
4. IF still < refresh_min_response_count → return 400 insufficient_data
5. Proceed with profile=refresh on resulting corpus
```
The expand-window approach preserves the semantics of a contiguous date window (which customers can see). A simple `LIMIT N` would silently mix time periods with no customer-visible disclosure of the actual window.

### Section C — Manual intelligence

| Setting | Label | Default | Range |
|---------|-------|---------|-------|
| `manual_daily_run_limit` | Manual runs per day (Expert + Quick combined) | 10 | 1–50 |
| `manual_expert_full_corpus_cap` | Use full corpus up to N responses | 500 | 100–2000 |
| `manual_expert_max_corpus` | Max sampled responses (expert) | 2000 | 500–5000 |
| `manual_expert_snapshot_count` | Metric snapshots (expert) | 5 | 2–10 |
| `manual_expert_checkpoint_lookback` | Prior automated checkpoints as context (expert) | 3 | 1–10 |
| `manual_quick_sample_cap` | Quick mode sample size | 150 | 50–500 |
| `manual_quick_default_window_days` | Quick mode default window | 14 | 7–90 |

### Section D — Custom Analysis

Custom Analysis lets users select a specific date range, segment, and topic scope and generate a targeted report. It is a **separate product surface** (its own nav section, its own run queue) — not part of the manual run dialog.

| Setting | Label | Default | Range | Description |
|---------|-------|---------|-------|-------------|
| `custom_analysis_enabled` | Enable Custom Analysis | **on** | — | Available to all members by default. Disable for orgs that don't want user-driven ad hoc analysis. |
| `custom_analysis_daily_limit` | Custom Analysis runs per day | 3 | 1–20 | Per-survey limit |
| `custom_analysis_max_corpus` | Max responses for custom runs | 5000 | 500–20000 | Caps large-corpus analysis cost |
| `custom_analysis_min_n_for_nps` | Minimum n to show NPS metric | 30 | 10–100 | Below this → trust score degraded + warning shown |

**Important:** Custom Analysis results are written to `custom_report_insights` — **never to the `insights` table**. They never supersede the active automated projection.

### Section E — History & retention

| Setting | Label | Default |
|---------|-------|---------|
| `automated_checkpoint_retention_days` | Keep automated checkpoints | 365 |
| `collapse_similar_checkpoints` | Group low-delta runs in UI | on |
| `manual_report_retention_days` | Keep manual reports | 730 |

### Section F — Notification spec

Automated notifications are sent when significant pipeline events occur. Recipients, channels, and timing:

| Event | Phase | Trigger | Recipient | Channel | Message |
|-------|-------|---------|-----------|---------|---------|
| Automated insights updated | **Phase 0.5** | New automated checkpoint with `meaningful_delta=true` | `notify_user_ids` OR all `brand_admin` if empty | `in_app` | "New intelligence ready for [Survey Name]" |
| Automated run skipped (no credits) | **Phase 0.5** | `insufficient_credits` in pre-flight | All `brand_admin` in org | `in_app` | "Automated insights paused — insufficient credits. [Recharge →]" |
| Manual report ready | **Phase 3** | Manual Expert/Quick run completes | Requesting user only | `in_app` | "Your [Expert/Quick] report for [Survey Name] is ready" |
| Refresh completed | **Phase 3** | Refresh run completes | Requesting user only | `in_app` | "Intelligence refreshed for [Survey Name]" |
| Daily limit reached | **Phase 3** | Next run rejected with 429 | Requesting user only | `in_app` (toast only, not stored) | "Daily [Refresh/Manual] limit reached for this survey" |

**Channel rules:**
- All notifications use `in_app` by default (stored in `notification_events` table)
- Email opt-in for "report ready" notifications uses the existing `notification_preferences` table (`channel = 'email'`) — **Phase 3+ only** (manual report events don't exist until Phase 3)
- No push notifications for insight events (future)
- Toast-only notifications (daily limit) are NOT stored in `notification_events` — they're a frontend-only response to the 429 HTTP status

**Notification settings (per survey):**

| Setting | Default | Description |
|---------|---------|-------------|
| `notify_on_checkpoint` | `true` | Emit in-app notification on meaningful automated checkpoint |
| `notify_user_ids` | `[]` (all brand_admins) | Specific users to notify on checkpoint; empty = all brand_admins |

---

## 4. Presets (product bundles)

| Preset | Stream threshold | Lookback | Expert cap | Use case |
|--------|------------------|----------|------------|----------|
| **Standard** (default) | 10 | 5 | 2000 | Most surveys |
| **High volume** | 25 | 3 | 1500 | In-app pulses, firehose |
| **Low volume** | 5 | 7 | 500 | B2B, quarterly |
| **Executive** | 15 | 5 | 500 full corpus | Small exec surveys |

Preset applies on survey create; customer can customize after.

---

## 5. API

### GET `/api/insights/:surveyId/settings`

```json
{
  "effective": { /* merged settings */ },
  "survey_overrides": { },
  "org_defaults": { },
  "config_hash": "sha256..."
}
```

### PATCH `/api/insights/:surveyId/settings`

```json
{
  "prior_checkpoint_lookback": 8,
  "stream_response_threshold": 15
}
```

Requires permission: `insights:configure` (new) or `org:admin`.

**Audit:** append to `org_audit_log` with `updated_by`.

---

## 6. How lookback works (customer explanation)

> *"When Experient automatically updates your intelligence, it reads your last **5 checkpoint reports** (by default) — not every old response. It processes only **new responses** since the last checkpoint, compares metrics and topics, and tells you **what changed**. You can set lookback from 1 to 20 checkpoints, or limit how far back in time we look (default 90 days)."*

**Overlap:** Prior checkpoints may cover overlapping response time ranges — **intentional**. The model uses them as **narrative memory**, not for re-counting metrics.

---

## 7. Credit model — all runs are charged

**All insight runs consume org credits** — automated and manual. There is no "free" mode. Automated runs are cheaper per run but happen frequently; manual runs are more expensive per run but happen on demand.

| Run type | Default credit cost | Notes |
|----------|--------------------|----|
| Automated incremental | **5 credits** per checkpoint written | Only charged when checkpoint writes (gated by meaningful_delta). Skipped runs = 0 cost. |
| Automated report generation | **15 credits** per document produced | Only charged when `automated_report_generation_enabled=true` AND tier milestone triggers report. |
| Refresh (user-initiated) | **8 credits** per run | Charged regardless of result (run always executes). |
| Manual Quick | **15 credits** per run | |
| Manual Expert | **40 credits** per run | Higher due to larger corpus + more specialist agents |
| Custom Analysis | **25–75 credits** | Based on corpus size tier: ≤500 resp = 25cr, ≤2000 = 50cr, >2000 = 75cr |

**Validation rules for credit cost overrides:**
- Type: positive integer only (no decimals, no negatives)
- Min: 1 credit
- Max: 500 credits (platform ceiling — prevent runaway cost for custom plans)
- NULL/blank = use org default (org default = platform constant if also NULL)
- Server returns HTTP 422 with `invalid_credit_cost` if value outside [1, 500]
- UI shows inline error: "Must be between 1 and 500"

**Credit pre-flight:** Before any run starts, the backend checks `credit_ledger` for sufficient balance. If insufficient:
- Automated: run is skipped silently; `insight_runs.status = 'skipped_no_credits'`; org gets in-app notification at first skip.
- Manual / Refresh: API returns `402 Payment Required` with credit balance + cost shown in UI.

**UI surfaces:**
- Intelligence page: credit balance visible in survey header (org admin only)
- Pre-run dialog (manual/refresh): "Estimated cost: 15 credits · Your balance: 340 credits"
- Settings → Insights: credit consumption graph (last 30 days by run type)
- Automated settings tooltip: "At current threshold, estimated X automated runs/month ≈ Y credits"

**Org plan model:** Plans include a monthly credit allocation for automated runs (e.g., Growth plan = 500 automated credits/month). Manual and Custom Analysis credits come from the shared org credit pool via `creditLedger.ts`. Orgs can purchase additional credits.

---

## 8. Role-based access to settings

**Rule: everyone reads, only admins write.**

| Role | Can view settings | Can edit survey settings | Can edit org defaults |
|------|-------------------|--------------------------|----------------------|
| Any org member | ✅ Read-only | ❌ | ❌ |
| `survey_owner` | ✅ | ✅ (own surveys only) | ❌ |
| `brand_admin` | ✅ | ✅ (any survey in org) | ✅ |
| Platform admin | ✅ | ✅ | ✅ |

**Implementation:**
- `GET /api/insights/:surveyId/settings` — returns effective + survey + org layers; accessible to any authenticated org member (no role gate)
- `PATCH /api/insights/:surveyId/settings` — requires `brand_admin` OR (`survey_owner` AND survey belongs to requester)
- `GET /api/orgs/:orgId/insight-defaults` — any org member
- `PATCH /api/orgs/:orgId/insight-defaults` — `brand_admin` only

**Settings UI:** On the survey-level Insights config page, all fields are visible to all members but render as disabled inputs with a lock icon for non-admins. Tooltip: "Only org admins can change insight settings." Admins see the same UI with enabled inputs.

---

## 9. Feature flags (rollout)

All flags are stored in `org_feature_flags` (table or equivalent registry) and are off by default. Toggle per org for staged rollout.

| Flag | Phase | What it gates |
|------|-------|---------------|
| `insights_trajectory_v1` | **Phase 0.5** | Enhanced Header Band, Investigation Drawer, Topic Change Bar, delta chip, in-app notifications on meaningful checkpoints. When OFF: legacy NPS row + Section 5 header strip. **Register this flag as the first Phase 0.5 task.** |
| `insights_trail_ui` | Phase 4 | Insight Trail page (`/trail`), `← View checkpoint #N` link in drawer. When OFF: link is hidden (not just disabled). |
| `insights_manual_modes` | Phase 3 | Manual Expert / Quick run dialog and POST /runs route. |
| `insights_config_ui` | Phase 5 | Settings UI for survey/org config. |
| `insights_v2_pipeline` | Phase 2 | Full v2 pipeline with `resolve_context`, `parent_checkpoint_id` chain walk. |
| `insights_custom_analysis` | Phase 6 | Custom Analysis wizard and Reports nav section. |

**Frontend access pattern:**
```typescript
const showTrajectory = useFeatureFlag('insights_trajectory_v1');
const showTrail      = useFeatureFlag('insights_trail_ui');
```

**Backend access pattern (Node.js):**
```typescript
const showTrajectory = await checkFeatureFlag(orgId, 'insights_trajectory_v1');
```

**CrystalOS access pattern (Python):**
```python
from crystalos.lib.flags import check_feature_flag
show_trajectory = await check_feature_flag(org_id, "insights_trajectory_v1")
```

> **Crystal tools are NOT gated by feature flags.** The `insights_trajectory_v1` flag controls UI surfaces only (Enhanced Header Band, Investigation Drawer, Topic Change Bar). CrystalOS tools like `get_recent_checkpoints` are callable via Crystal regardless of whether `insights_trajectory_v1` is on — the flag does not gate backend or CrystalOS computation. Only the frontend `useFeatureFlag('insights_trajectory_v1')` guard renders or hides trajectory UI components.

Gradual rollout: internal orgs → beta orgs → GA. `insights_trajectory_v1` should be the first flag flipped for Phase 0.5 testing, alongside the Phase 0.5 CHECK constraint fix (which must land first as a dependency).

---

## 10. Validation rules

| Rule | Enforcement |
|------|-------------|
| `prior_checkpoint_lookback` ≥ 1 | API 400 |
| `stream_threshold` < `report_regen_threshold` | Warning in UI (not hard fail) |
| `manual_expert_max_corpus` ≥ `manual_expert_full_corpus_cap` | API 400 |
| Disabling `automated_insights_enabled` | Stream consumer skips survey; manual + refresh still work |
| Disabling `automated_report_generation_enabled` | Insight cards still update; no document produced at milestones |
| `refresh_min_response_count` > 0 | API 400 |
| `custom_analysis_min_n_for_nps` ≥ 10 | API 400 |

---

## 11. Config snapshot on checkpoint

Every checkpoint stores:

```json
{
  "config_hash": "a1b2...",
  "config_effective": {
    "prior_checkpoint_lookback": 5,
    "stream_response_threshold": 10,
    ...
  }
}
```

Enables: *"This checkpoint was generated with lookback=5; current setting is 8."*
