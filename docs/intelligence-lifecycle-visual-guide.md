# Intelligence Lifecycle Visual Guide (v2)

> Updated for Insight Pipeline v2. Reflects the linked-list checkpoint architecture,
> manual run modes, Phase 7 migration state, and the Crystal integration layer.

---

## 1. Overall flow

```
Response submitted
       │
       ▼
Redis stream (+10 threshold / tier milestone)
       │
       ▼
resolve_context → ingest → cluster_delta → metrics → absa →
drivers → trends → delta_compute → narrate → cite → verify → report_build → publish
       │
       ├─ [automated] → insight_checkpoints_v2 (lane=automated)
       │                → insights (projection update)
       │                → survey_metric_snapshots
       │                → insight_audit_log (G27)
       │
       ├─ [manual_expert / manual_quick] → insight_reports
       │                                  → insight_checkpoints_v2 (lane=manual)
       │                                  → insight_audit_log (G27)
       │
       └─ [custom_analysis] → custom_reports
                             → custom_report_insights
                             (NEVER touches insights table)
```

---

## 2. Checkpoint linked list

Each automated checkpoint is a node in the linked list:

```
[Checkpoint #1 — Bootstrap]
    parent_checkpoint_id: NULL
    lane: automated
    meaningful_delta: true (always for bootstrap)
    ↓
[Checkpoint #2]
    parent_checkpoint_id: → #1
    lane: automated
    meaningful_delta: false  ← NOT written to checkpoint table if false
    ↓
[Checkpoint #3]
    parent_checkpoint_id: → #2
    lane: automated
    meaningful_delta: true  ← written; updates active projection
    ↓
[Manual Report A]
    parent_checkpoint_id: → #3 (latest automated)
    lane: manual
    run_mode: manual_expert
    ← does NOT update active projection
    ← does NOT advance automated parent pointer
```

**Key invariant:** `lane=manual` checkpoints never become the parent of a subsequent `lane=automated` checkpoint.

---

## 3. Active projection vs. history

| Surface | Data source | Updated by |
|---------|-------------|------------|
| Intelligence page | `insights` rows (latest projection) | Automated checkpoint (meaningful_delta=true) |
| Insight Trail — Automated | `insight_checkpoints_v2` WHERE lane=automated | Every meaningful checkpoint write |
| Insight Trail — Manual | `insight_reports` + checkpoint (lane=manual) | Manual Expert / Quick run |
| Custom Analysis | `custom_reports` + `custom_report_insights` | Custom Analysis run |
| Crystal answers | Distilled insights + checkpoint tools | Real-time Crystal ReAct loop |

---

## 4. Checkpoint write gate (automated)

```
New responses arrive
       │
       ▼
  count < stream_threshold (10)?  ──YES──→  Skip (no run)
       │ NO
       ▼
  is_bootstrap OR tier_milestone?  ──YES──→  Write checkpoint + update projection
       │ NO
       ▼
  evaluate_meaningful_delta()
       │
  meaningful_delta = true?  ──YES──→  Write checkpoint + update projection
       │ NO                            (insight_checkpoints_v2 + insights)
       ▼
  new_responses ≥ 200?  ──YES──→  Write checkpoint + update projection
       │ NO                       (full_checkpoint_threshold)
       ▼
  Skip checkpoint write
  (metric snapshot only)
```

---

## 5. Manual run modes

| Mode | Window | Corpus cap | Credit cost | Duration target | Updates projection? |
|------|--------|------------|-------------|-----------------|---------------------|
| `manual_expert` | User-selected or last 90d | ≤500 full / ≤2000 stratified | 40 | 3–8 min | No (unless pinned) |
| `manual_quick` | Last 14d (configurable) | 150 recency-weighted | 15 | p95 < 90s | No |
| `refresh` | Last 30d (configurable) | 2000 | 8 | 45–120s | Yes (force) |
| Custom Analysis | Filter-specified | 500 stratified | 25–75 | 2–5 min | Never |

---

## 6. Sampling strategy

### Automated incremental
1. Load responses where `created_at > parent.response_high_watermark`
2. If count ≤ `INGEST_MAX_RESPONSES_CAP` (1000 prod): use all
3. If count > cap: stratified time-bucket sample with NPS anchor responses
4. ABSA: re-cap new texts to `INGEST_NEW_RESPONSE_ABSA_CAP` (150 prod)

### Manual expert
1. Load all responses in `[window_start, window_end]`
2. If count ≤ 500: use full corpus
3. If count > 500: stratified sample (week × sentiment × NPS tier) up to 2000
4. Confidence disclosure in report when sampled

### Manual quick
1. Recency-weighted sample: top 60% by recency, fill to 150 across sentiment classes

---

## 7. Credit cost and metering

| Run type | Cost | Meter gate |
|----------|------|------------|
| Automated (checkpoint only) | 5 | Silent skip on insufficient |
| Automated (with report doc) | 5 + 15 = 20 | Silent skip |
| Refresh | 8 | 402 on insufficient |
| Manual Quick | 15 | 402 on insufficient |
| Manual Expert | 40 | 402 on insufficient |
| Custom Analysis | 25–75 | 402 on insufficient |
| Crystal chat | 2 per turn | 402 on insufficient |
| Ask Crystal (NLQ) | 1 per question | 402 on insufficient |

---

## 8. SLO thresholds

| Metric | Target | Warn | Critical |
|--------|--------|------|----------|
| Citation validity rate | ≥ 99.5% | < 99.5% | < 99.0% |
| Verifier pass rate | ≥ 95% | < 95% | < 90% |
| Automated run success rate | ≥ 99% | < 99% | < 95% |
| p95 manual_quick duration | < 90s | > 90s | > 120s |
| p95 manual_expert duration | < 8 min | > 8 min | > 12 min |

Check current SLO status: `GET /api/insights/_slo` (admin-gated, 24h window).

---

## 9. Phase 7 migration status

| Task | Status | Notes |
|------|--------|-------|
| Stop dual-write to `survey_insight_checkpoints` | **ENV-GATED** | Set `STOP_LEGACY_CHECKPOINT_WRITE=true` after full v2 migration |
| Redirect old `/checkpoints` API | DONE | Returns deprecation headers + Sunset date |
| Retention/compaction job | **AUTO-ENABLED** when `INSIGHT_CHECKPOINTS_V2_ENABLED=true` | Deletes non-meaningful checkpoint blobs after 30d |
| `intelligence-lifecycle-visual-guide.md` | DONE | This document |
| Remove anchor-run `prior_insight_rows` path | DONE | Suppressed when `prior_checkpoint_summaries` present (PIPELINE_SPEC §6) |
| Backfill `parent_checkpoint_id` on legacy rows | NOT STARTED | Requires migration script |
| Validate `parent_checkpoint_id` 100% coverage | NOT STARTED | Post-backfill verification |

---

## 10. Data retention policy

| Table | Default retention | Configurable? |
|-------|------------------|---------------|
| `insight_checkpoints_v2` rows | Forever (linked list integrity) | No |
| Checkpoint blobs (non-meaningful) | 30d after creation | `retention_non_meaningful_days` |
| Checkpoint blobs (meaningful) | 365d | `retention_meaningful_days` |
| `insight_audit_log` | 90d | `retention_audit_days` |
| `insights` (projection) | Until superseded + 30d | No |
| `custom_report_insights` | 90d | No |

---

## 11. Rollback

If the v2 pipeline causes issues:
1. Set `INSIGHTS_V2_PIPELINE=false` (or `INSIGHT_CHECKPOINTS_V2_ENABLED=false`) → reverts to anchor-run path
2. v2 tables remain intact — no data loss
3. Trail UI hides behind `insights_trail_ui` feature flag
4. Dual-write resumes if `STOP_LEGACY_CHECKPOINT_WRITE` is not set

---

*Last updated: 2026-06-26 | Reflects Insight Pipeline v2 Phase 6 complete + Phase 7 in progress*
