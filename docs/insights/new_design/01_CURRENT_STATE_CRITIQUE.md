# Current State Critique

> Maps **today's as-built behavior** (from [intelligence-lifecycle-visual-guide.md](../intelligence-lifecycle-visual-guide.md)) against the **target vision** and identifies root causes.

---

## 1. Conceptual model mismatch

### Today

```
Responses → Pipeline → Publish simultaneously:
  • supersede active insights (mutable truth)
  • append metric snapshot (trend line)
  • append checkpoint + blob (history photo)
  • complete agent_run
```

The **next run** loads:
- `prior_insights` from **anchor run's insight rows** (SQL in `node_narrate`)
- `prior_snapshots` from last 5 `survey_metric_snapshots`
- `new_response_ids` from ingest watermark

It does **not** load prior **checkpoint blobs** or `delta_from_prior`.

### Target

```
Automated:  Checkpoint[N-1] ──parent──> Checkpoint[N]
            Only new responses + prior checkpoint summaries + metrics → delta → narrate

Manual:     Fresh window analysis → ManualReport (may snapshot to checkpoint w/ type=manual)
```

**Root cause:** Checkpoints were designed as archive but implemented as **publish side-effect** without read-path integration.

---

## 2. Automated vs manual — not truly separated

| Dimension | Automated (today) | Manual (today) | Target automated | Target manual |
|-----------|-------------------|----------------|------------------|---------------|
| Trigger | stream, scheduler | POST trigger, `force_regenerate` | same | same + mode param |
| Sample | ~50 new responses | full bootstrap sample | new only + prior checkpoint context | window corpus per mode |
| Re-narrate | skip if cache hit | always | always incremental narrate on new data | always full for window |
| Report regen | ≥25 new since last report | always | when threshold OR material delta | always |
| Checkpoint | every publish | every publish | gated + lineage | always + `run_mode` |
| Overwrites active insights | yes | yes | yes (automated lane) | separate lane / pin |

**Root cause:** Single `node_publish` path; `force_regenerate` is a boolean, not a **run profile**.

---

## 3. Checkpoint table — incomplete enterprise contract

Current schema (`survey_insight_checkpoints`):

```sql
trigger IN ('responses', 'days', 'manual', 'stream')  -- 'schedule' fails
parent_checkpoint_id  -- MISSING
run_id                -- MISSING
run_mode              -- MISSING (automated|manual_expert|manual_quick)
created_by            -- MISSING
lineage_json          -- MISSING (prior refs, new response ids, snapshot ids)
citations_manifest    -- MISSING
config_snapshot       -- MISSING (hash of org settings at run time)
watermark_response_at -- MISSING (latest response timestamp included)
meaningful_delta      -- MISSING (bool gate result)
```

Fields that exist but are **underused:**
- `topic_fingerprint` — computed in code, often not persisted
- `delta_from_prior` — `compute_delta()` not wired in `node_publish`

---

## 4. Delta and topic lifecycle — designed, not delivered

`crystalos/tools/delta.py` provides:
- Metric deltas (NPS, CSAT, CES)
- Topic change classification (emerged / resolved / persisted)
- Topic fingerprint

**Not wired into pipeline publish.** Customer-facing “what's new / what's declining” relies on LLM improvisation from `prior_insights` text, not deterministic classification.

**Impact:** Cannot guarantee reproducible delta narratives; cannot pass compliance audit (“prove NPS delta was -6.2”).

---

## 5. Sampling epistemology

### Automated stream (firehose)

- Run every ~10 responses
- Report regen only every ~25 new
- Checkpoints every publish → **dense, similar snapshots**
- Customer sees cluttered history ([lifecycle guide §7c](../intelligence-lifecycle-visual-guide.md))

### Manual analyst (launch week)

- Same publish path adds more checkpoints
- **Re-processes overlapping corpus** — doesn't leverage prior checkpoint as frozen knowledge
- 3/day rate limit frustrates Expert use cases

### Scientist's critique

Automated runs should treat prior checkpoints as **sufficient statistics** for everything before watermark. Re-embedding old verbatims wastes compute and introduces **non-deterministic drift** (cluster boundary shifts).

---

## 6. Active insights vs history

| Store | Role today | Problem |
|-------|------------|---------|
| `insights` (active) | Intelligence page, Crystal `get_insights_list` | Superseded rows hidden; history opaque |
| `survey_insight_checkpoints` | Timeline, blob archive | Not read by pipeline |
| `agent_runs` | Ops audit | Not customer-facing |

**Customer need:** “Show me automated timeline vs when Sarah ran Expert report on Friday.”  
**Today:** Partially possible via `trigger=manual` filter; no `run_mode`, no lane separation in UI.

---

## 7. Crystal integration gaps

| Capability | Today | Gap |
|------------|-------|-----|
| Read metrics | `get_metric_history` | OK |
| Read checkpoints | `get_checkpoint_history` | OK |
| Return full report | blob via internal proxy | No structured **document mode** in chat |
| Deep link to report | API exists | Crystal doesn't consistently return URL |
| Distinguish automated vs manual report | weak | Need `run_mode` in tool responses |

---

## 8. Configuration — all hardcoded

| Parameter | Location | Customer configurable? |
|-----------|----------|------------------------|
| Prior insight count (8) | `PRIOR_INSIGHT_MAX_COUNT` in code | No |
| Prior checkpoint lookback | N/A | No |
| Stream threshold (10) | `response_stream.py` | No |
| Report regen (25) | tiered_report / pipeline | No |
| ABSA new response cap (~50) | `INGEST_NEW_RESPONSE_ABSA_CAP` | No |
| Checkpoint write threshold (200) | env, not gating writes | No |

---

## 9. UI / UX gaps

Existing surfaces:
- **Survey Intelligence** — tier banner, topic cards, generate button
- **Survey Trends** — metric snapshots (strong)
- **Insights audit drawer** — model metadata, not lineage
- **Checkpoint API** — list + report fetch; **no dedicated Trail page**

Missing:
- Insight Trail (automated vs manual lanes)
- Manual mode picker (Expert / Quick)
- Pre-run preview (window, sample size, estimated cost/time)
- Checkpoint comparison (diff two nodes)
- Lineage visualization (linked list)

---

## 10. Operational risks (not corruption — noise & cost)

From lifecycle guide §10:

| Category | Issue |
|----------|-------|
| Safe | Supersede pattern, responses never mutated |
| Noisy | Checkpoints every run; duplicate snapshots on cache-hit publish |
| Gaps | delta unwired; schedule trigger CHECK; threshold not gating |

These don't corrupt data but **erode trust** in history UI and inflate storage.

---

## 11. Summary — priority fixes

| P | Fix |
|---|-----|
| P0 | Checkpoint linked list + read path in automated ingest/narrate |
| P0 | `run_mode` separation (automated / manual_expert / manual_quick) |
| P0 | Wire `compute_delta()` → `delta_from_prior` + topic lifecycle |
| P1 | Configurable prior checkpoint lookback (default 5) |
| P1 | Gate automated checkpoint writes on meaningful delta |
| P1 | Insight Trail UI |
| P2 | Crystal document mode + report URLs |
| P2 | Retention / compaction for firehose |
| P2 | Fix `schedule` trigger + `force_regenerate` API passthrough |

See [08_MIGRATION_ROADMAP.md](./08_MIGRATION_ROADMAP.md) for phasing.
