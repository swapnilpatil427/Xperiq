# Pipeline Specification — Run Profiles & Algorithms

> Executable spec for CrystalOS `run_insight_generation`.  
> Code computes; LLM narrates ([ENGINE_DECISIONS](../ENGINE_DECISIONS.md) #4).

---

## 1. Profile comparison matrix

| Dimension | `automated_incremental` | `refresh` | `manual_expert` | `manual_quick` |
|-----------|-------------------------|-----------|-----------------|----------------|
| **Trigger** | stream, scheduler, milestone | "Refresh" button (UI) | API, UI button | API, UI button |
| **Response scope** | `created_at > parent.watermark` | last `refresh_lookback_days` (default 30d, min `refresh_min_response_count` fallback) | `[window_start, window_end]` | last N days window |
| **Re-process old responses** | **No** | Yes (lookback window) | Yes (window corpus) | Sample only |
| **Prior checkpoints read** | Yes (default 5) | Yes (default 5, for context) | Yes (context, default `manual_expert_checkpoint_lookback`=3) | Optional (1) |
| **Prior checkpoint as truth** | **Yes** for pre-watermark | Context only | No for metrics | No |
| **ABSA scope** | new IDs only | window responses | window/sample | sample ≤150 |
| **Clustering** | delta merge into parent topics | window re-cluster | full/window re-cluster | light re-cluster |
| **Report template** | `incremental_delta` | `incremental_delta` (force) | `expert_deep` | `executive_quick` |
| **Updates active projection** | Yes | Yes (force) | No (unless pin) | No |
| **Creates checkpoint** | Gated | Always | Always | Always |
| **Typical duration** | 30–90s | 45–120s | 3–8 min | 45–90s |
| **Credit cost** | 5 credits | 8 credits | 40 credits | 15 credits |
| **Daily limit** | None (threshold-gated) | `refresh_daily_limit` (default 5) | `manual_daily_run_limit` | `manual_daily_run_limit` |

---

## 2. Node: `resolve_context`

**Input:** `InsightRunRequest`  
**Output:** state slice:

```python
{
  "profile": str,
  "settings": SurveyInsightSettings,
  "parent_checkpoint": dict | None,
  "prior_checkpoints": list[dict],      # loaded blobs (summary tier)
  "watermark": datetime | None,
  "new_response_ids": set[str],
  "window_start": datetime | None,
  "window_end": datetime | None,
  "metric_snapshots": list[dict],
  "actor": str,
  "config_hash": str,
}
```

> **State key naming:** Section 2 (resolve_context, Phase 2) populates `state["prior_checkpoints"]` — a list of full checkpoint blobs (blob URLs pre-fetched from object storage). Section 5 (node_delta_compute, Phase 0.5) populates `state["prior_checkpoint_summaries"]` — a list of scalar rows `{checkpoint_number, created_at, nps}`. These are two different keys serving the same conceptual role at different phases. In Phase 0.5, only `prior_checkpoint_summaries` exists in state. The narrate prompt (Section 6) reads `prior_checkpoint_summaries`, not `prior_checkpoints`. Section 11 (citation manifest) reads checkpoint IDs from `prior_checkpoint_summaries[n]["checkpoint_number"]` (not from an `"id"` field — the scalar summaries don't carry UUIDs).

### Automated algorithm

```
1. settings = load_settings(survey_id)
2. parent = latest checkpoint WHERE lane='automated' ORDER BY checkpoint_number DESC LIMIT 1
3. IF parent IS NULL → is_bootstrap = True, watermark = epoch, prior_checkpoints = []
4. ELSE:
     watermark = parent.response_high_watermark
     prior_checkpoints = walk_parent_chain(parent, settings.prior_checkpoint_lookback,
                                           max_age=settings.prior_checkpoint_max_age_days)
5. new_response_ids = SELECT id FROM responses
     WHERE survey_id = ? AND created_at > watermark AND deleted_at IS NULL
6. IF len(new_response_ids) < settings.stream_response_threshold AND NOT milestone:
     RETURN skip_run(reason='below_threshold')
7. metric_snapshots = last 1 snapshot (for anomaly context only)
```

### Refresh algorithm

```
0. credit_cost = settings.credit_cost_refresh (default 8)
   Pre-flight: debit org credits; return 402 if insufficient
1. lookback_days = settings.refresh_lookback_days          (default 30)
2. min_count    = settings.refresh_min_response_count      (default 25)
3. window_end   = now()
4. window_start = now() - lookback_days
5. corpus_ids   = responses WHERE created_at IN [window_start, window_end]
6. IF len(corpus_ids) < min_count:
     # Expand window backwards until min_count is met (max 365 days)
     WHILE len(corpus_ids) < min_count AND (window_end - window_start) < 365d:
       window_start -= 7d
       corpus_ids = responses in new window
7. IF still < min_count → return 400 insufficient_data
8. prior_checkpoints = last 5 automated summaries (context)
9. force_regenerate = True  →  updates active projection
```

**Daily limit:** `settings.refresh_daily_limit` (default 5, checked via Redis or DB fallback).

### Manual expert algorithm

```
1. window = user window OR (now - 90d, now)
2. corpus_ids = all response ids in window
3. IF len(corpus_ids) <= settings.manual_expert_full_corpus_cap:
     sample_ids = corpus_ids  # full corpus
   ELSE:
     sample_ids = stratified_sample(corpus_ids, cap=settings.manual_expert_max_corpus)
4. metric_snapshots = last N snapshots overlapping window, N=settings.manual_expert_snapshot_count
5. prior_checkpoints = last settings.manual_expert_checkpoint_lookback (default 3) automated summaries
   (context for "what we already knew" — not ground truth for window metrics)
6. parent = latest automated (for trail parent link only)
```

### Manual quick algorithm

```
1. window = user window OR (now - manual_quick_default_window_days, now)
2. sample_ids = recency_weighted_sample(window, cap=manual_quick_sample_cap)
3. metric_snapshots = last 2 in window
4. prior_checkpoints = optional latest automated summary (1)
```

---

## 3. Node: `ingest` (profile-aware)

| Profile | SQL filter | Cap |
|---------|------------|-----|
| automated | `id IN new_response_ids` | `INGEST_NEW_RESPONSE_ABSA_CAP` (50) if overflow |
| manual_expert | `id IN sample_ids` | up to 2000 |
| manual_quick | `id IN sample_ids` | 150 |

**Bootstrap:** first automated run when `parent IS NULL` uses `INGEST_BOOTSTRAP_CAP` (existing constant).

**Critical rule (automated):** Do not load verbatims with `created_at <= watermark` except via **prior checkpoint summaries** in narrate context.

---

## 4. Node: `cluster_delta` (automated)

Instead of full re-cluster:

1. Load parent topic centroids from parent checkpoint blob `themes[]`
2. Embed new response texts
3. Assign to nearest parent topic if similarity ≥ threshold; else **candidate new topic**
4. Update volume counts per topic
5. Emit `topic_signals` with `lifecycle` hints for narrate

Manual expert/quick: run existing `node_cluster` path on sample/window.

---

## 5. Node: `delta_compute` (NEW — mandatory)

### New functions required for node_delta_compute

#### `extract_metrics_from_state(state: dict) -> dict`
Extracts current metric snapshot from pipeline state.
Returns: `{"nps": float|None, "csat": float|None, "ces": float|None, "response_count": int}`
Sources: `state["metrics"]["nps"]["score"]`, `state["metrics"]["csat"]["score"]`, etc.
Returns `None` for any metric not present in `state["metrics"]`.

#### `extract_metrics_from_blob(blob: dict) -> dict`
Extracts metric snapshot from a prior checkpoint blob.
Returns same shape as `extract_metrics_from_state`.
Reads keys: `"nps_at_checkpoint"`, `"nps"`, `"nps_score"` (in priority order — first non-None wins).
Same for csat and ces.
`response_count`: reads `"response_count_at_checkpoint"` or `"response_count"`.

#### `build_current_topic_name_set(state: dict) -> set[str]`
Returns: set of topic name strings from `state["topic_signals"].keys()`.
Returns empty set if `topic_signals` is absent or empty.

#### `evaluate_meaningful_delta(delta: dict, settings: dict) -> bool`
Returns `True` if any condition is met:
- `abs(delta["nps_delta"]) >= settings.get("meaningful_delta_nps_points", 2.0)` — if `nps_delta` is not None
- `abs(delta["csat_delta"]) >= 0.15` — if `csat_delta` is not None
- `len(delta.get("topic_changes", {}).get("emerged", [])) >= 1`
- `len(delta.get("topic_changes", {}).get("resolved", [])) >= 1` — only if resolved topic had prior volume >= 5% share (requires prior blob topic data; if unknown, treat as True)
- `is_bootstrap` is True
- `is_tier_milestone` is True

Note: "declining" terminology used elsewhere in this spec = `"resolved"` in `compute_delta()` output. These are the same concept.
Note: `"fingerprint_changed"` is NOT used in Phase 0.5 — `compute_topic_fingerprint()` is not called. Phase 2 adds it.

---

```python
async def node_delta_compute(state: dict) -> dict:
    """Computes delta from prior checkpoint. Must run BEFORE node_narrate.
    Phase 0.5: uses compute_delta() output only (NPS/CSAT/CES + topic name-set changes).
    Phase 2 extension: adds compute_topic_lifecycle() for share-weighted topic analysis."""
    from crystalos.tools.delta import compute_delta

    survey_id = state["survey_id"]
    run_id    = state["run_id"]
    settings  = state.get("survey_settings", {})
    is_bootstrap = state.get("is_bootstrap", False)
    await _update_heartbeat(run_id)

    if is_bootstrap:
        return {
            **state,
            "delta_from_prior":           None,
            "meaningful_delta":           True,   # bootstrap always writes
            "prior_checkpoint_summaries": [],
        }

    # Load prior checkpoints from DB (ordered by checkpoint_number — Phase 0.5
    # does not yet have parent_checkpoint_id; Phase 2 replaces with walk_parent_chain)
    prior_rows = []
    prior_blob = None
    try:
        async with _db._pool_conn().connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """SELECT checkpoint_number, report_url, created_at,
                              nps_at_checkpoint, topic_fingerprint
                       FROM survey_insight_checkpoints
                       WHERE survey_id = %s AND org_id = %s
                         AND report_url IS NOT NULL
                       ORDER BY checkpoint_number DESC LIMIT 5""",
                    (state["survey_id"], state["org_id"]),
                )
                rows = await cur.fetchall()
                if rows:
                    cols = [d[0] for d in cur.description]
                    prior_rows = [dict(zip(cols, r)) for r in rows]
                    prior_blob_url = prior_rows[0]["report_url"]
                    prior_blob = await _load_blob(prior_blob_url)  # existing blob-load utility
    except Exception as exc:
        logger.warning("node_delta_compute_load_failed", survey_id=survey_id, error=str(exc))

    if not prior_blob:
        # Cannot compute delta — treat as bootstrap
        return {**state, "delta_from_prior": None, "meaningful_delta": True,
                "prior_checkpoint_summaries": []}

    current_metrics = extract_metrics_from_state(state)
    parent_metrics  = extract_metrics_from_blob(prior_blob)
    n2_blob = None  # Phase 0.5: single-parent delta only; N-2 used in Phase 2

    delta = compute_delta(current_metrics, parent_metrics, n2_blob)

    # Phase 0.5: topic_changes uses name-set intersection from compute_delta.
    # Phase 2 will replace with share-weighted compute_topic_lifecycle().
    current_topic_names = build_current_topic_name_set(state)
    # (compute_delta already computes emerged/resolved from topic name sets
    #  when checkpoint_n and checkpoint_n1 include "topics" arrays — see delta.py)

    meaningful = evaluate_meaningful_delta(delta, settings)
    delta["meaningful_delta"] = meaningful

    prior_checkpoint_summaries = [
        {
            "checkpoint_number": r["checkpoint_number"],
            "created_at":        str(r["created_at"])[:10],
            "nps":               r.get("nps_at_checkpoint"),
        }
        for r in reversed(prior_rows)   # oldest first
    ]

    logger.info("node_delta_compute_done", survey_id=survey_id,
                nps_delta=delta.get("nps_delta"),
                meaningful_delta=meaningful,
                topics_emerged=len(delta.get("topic_changes", {}).get("emerged", [])),
                topics_resolved=len(delta.get("topic_changes", {}).get("resolved", [])))

    return {
        **state,
        "delta_from_prior":           delta,
        "meaningful_delta":           meaningful,
        "prior_checkpoint_summaries": prior_checkpoint_summaries,
    }
```

> **Phase 0.5 scope:** Topic changes are name-set only (emerged = topic name present now but absent at N-1; resolved = absent now but present at N-1). Share-weighted lifecycle (`compute_topic_lifecycle`) is a Phase 2 addition. **Phase 0.5 limitation:** `survey_settings` is NOT loaded into state in Phase 0.5 (`resolve_context` is a Phase 2 node). `evaluate_meaningful_delta` always uses the hardcoded default `meaningful_delta_nps_points = 2.0`. Per-survey configuration of this threshold requires Phase 2. The `state.get("survey_settings", {})` call in the pseudocode returns `{}` in Phase 0.5, triggering the `.get("meaningful_delta_nps_points", 2.0)` default. `trend_direction` in `compute_delta()` uses a hardcoded ±2 display threshold (not the configurable threshold) — it is a display classification only, not the write-gate. `evaluate_meaningful_delta` is the write-gate and uses the configurable threshold from `survey_settings`.

### Token budget for prior_checkpoint_summaries

Each checkpoint summary passed to narrate context must be limited to: `checkpoint_number`, `created_at` (date only), `nps_at_checkpoint`. Do NOT include full blob narratives — only the structured scalar summary rows. This caps each summary at ~30 tokens. Five summaries = ~150 tokens added to context. Full blob content is NOT passed to narrate; only these scalar rows are. This is enforced in `node_delta_compute` (already implemented in the pseudocode above — only `checkpoint_number`, `created_at`, `nps` are included).

### New state keys added by node_delta_compute

```python
"delta_from_prior":           dict | None,   # output of compute_delta(), or None on bootstrap
"meaningful_delta":           bool,          # True = write checkpoint; default True for bootstrap
"prior_checkpoint_summaries": list[dict],    # [{checkpoint_number, created_at, nps}], oldest first
```

These keys must be added to the `InsightState` TypedDict and initialized in `initial_state`:

```python
"delta_from_prior":           None,
"meaningful_delta":           True,
"prior_checkpoint_summaries": [],
```

### Graph wiring (Phase 0.5)

```python
g.add_node("delta_compute", node_delta_compute)
# Remove: g.add_edge("topics", "narrate")
# Add:
g.add_edge("topics",        "delta_compute")
g.add_edge("delta_compute", "narrate")
```

`state["metrics"]` is populated by `node_metrics` which completes before `node_topics` (via the absa convergence point). It is safe to read in `node_delta_compute`.

**node_narrate cache-hit path:** When `node_narrate` short-circuits via the cache-hit path (no new responses, `force_regenerate=False`), no LLM calls are made and there is nothing to "inject DELTA_FACTS into." The correct requirement is: `state["delta_from_prior"]` computed by `node_delta_compute` is already in state and will propagate to `node_publish` via the `{**state, ...}` return. **`node_publish` must write `delta_from_prior` and `meaningful_delta` to the checkpoint record even when the narrate cache-hit path fires.** The cache-hit path does not affect the persistence of delta data — only the narrated text is cached, not the delta computation.

---

## 6. Node: `narrate` (profile-aware prompts)

### DELTA_FACTS injection mechanism (Phase 0.5)

**Injection mechanism (Phase 0.5) — specialist-specific:**

```
┌─────────────────────────────────────────────────────────────────────┐
│ Specialist          │ Injection method           │ Delta context?    │
├─────────────────────┼────────────────────────────┼───────────────────┤
│ narrate_topic_insight    │ overlay=specialist_overlay │ ✓ via prepend     │
│ narrate_prescriptive_insight │ overlay=specialist_overlay │ ✓ via prepend │
│ narrate_nps_insight  │ prior_snapshots param      │ ✓ via reformatted │
│ narrate_csat_insight │ no injection point         │ ✗ Phase 0.5 gap   │
│ narrate_trend_insight│ no injection point         │ ✗ Phase 0.5 gap   │
└─────────────────────────────────────────────────────────────────────┘
```

**Step 1 — Build delta_block and TRAJECTORY block** (same as before):
```python
delta     = state.get("delta_from_prior")
summaries = state.get("prior_checkpoint_summaries", [])
is_bootstrap = state.get("is_bootstrap", False)
```

**Step 2 — Topic + prescriptive specialists: prepend to specialist_overlay**
```python
if not is_bootstrap and delta is not None:
    nps_line = ""
    if delta.get("nps_delta") is not None:
        nps_line = f"NPS delta: {delta['nps_delta']:+.1f} pts  ({delta.get('trend_direction', 'stable')}, {delta.get('trend_persistence', 'first_occurrence')})\n"
    # (omit nps_line if nps_delta is None)
    delta_block = (
        "━━━ DELTA_FACTS (code-computed — authoritative for metric values) ━━━\n"
        + nps_line
        + (f"CSAT delta: {delta['csat_delta']:+.2f}\n" if delta.get("csat_delta") is not None else "")
        + (f"CES delta: {delta['ces_delta']:+.2f}\n" if delta.get("ces_delta") is not None else "")
        + f"New responses: {delta.get('response_count_delta', 0)}\n"
        + (f"Topics emerged: {', '.join(delta.get('topic_changes', {}).get('emerged', []))}\n"
           if delta.get("topic_changes", {}).get("emerged") else "")
        + (f"Topics resolved: {', '.join(delta.get('topic_changes', {}).get('resolved', []))}\n"
           if delta.get("topic_changes", {}).get("resolved") else "")
        + "\nCITATION RULE: [see unified rule below]\n"
        "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
    )
    if len(summaries) >= 2:
        traj_lines = "\n".join(
            f"  Checkpoint #{s['checkpoint_number']} ({s['created_at'][:10]}): NPS {s.get('nps', 'N/A')}"
            for s in summaries
        )
        trajectory_block = (
            "━━━ CHECKPOINT TRAJECTORY (oldest → newest) ━━━\n"
            + traj_lines + "\n"
            "Use this to identify multi-checkpoint trends.\n"
            "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
        )
        delta_block = delta_block + trajectory_block
    specialist_overlay = delta_block + specialist_overlay
elif is_bootstrap or delta is None:
    baseline_block = (
        "━━━ BASELINE_MODE ━━━\n"
        "This is the FIRST checkpoint for this survey. No prior state exists.\n"
        "Narrate as a BASELINE — establish what IS, not what changed.\n"
        "Do NOT use directional language: avoid 'increased', 'decreased', 'dropped', 'grew', 'improved', 'declined'.\n"
        "━━━━━━━━━━━━━━━━━━━━━\n"
    )
    specialist_overlay = baseline_block + specialist_overlay
    # SUPPRESS ESTABLISHED_FINDINGS: skip the anchor-run prior_insight_rows query
    # and do not append prior_context_block to specialist_overlay
```

**Step 3 — NPS specialist: inject via prior_snapshots**
```python
# Reformat prior_checkpoint_summaries to match prior_snapshots expected shape.
# narrate_nps_insight's prior_snapshots param accepts: [{nps, response_count, captured_at}]
nps_prior_snapshots = [
    {
        "nps":            s.get("nps"),
        "captured_at":    s.get("created_at"),
        "response_count": None,  # not available in Phase 0.5 summaries
    }
    for s in summaries
    if s.get("nps") is not None
]
# Pass nps_prior_snapshots to narrate_nps_insight call:
# nps_task = narrate_nps_insight(..., prior_snapshots=nps_prior_snapshots)
# The NPS specialist will incorporate the checkpoint history into its longitudinal narrative.
```

**Step 4 — CSAT and Trend specialists: no delta injection in Phase 0.5**
CSAT specialist (`narrate_csat_insight`) accepts only scalar metric arguments — no overlay, no prior_snapshots. It narrates based on current CSAT score only. CSAT delta context (`csat_delta`) appears in the topic specialist narratives via `specialist_overlay` overlay. This is an acceptable Phase 0.5 limitation.

Trend specialist (`narrate_trend_insight`) narrates response VOLUME trends (slope, forecast) — not NPS trends. No delta injection needed.

**Phase 2 upgrade path:** When DELTA_FACTS injection coverage needs to extend to CSAT specialist, add a `delta_context: str = ""` parameter to `narrate_csat_insight` in `insight_experts.py`. For Phase 0.5, this is not required.

---

**nps_delta=None handling:**
```
If delta.get("nps_delta") is None: omit the NPS delta line from DELTA_FACTS block.
Do NOT suppress the entire DELTA_FACTS block when NPS is absent — CSAT delta,
CES delta, response count, and topic changes may still be meaningful. The block
is suppressed only when delta itself is None (bootstrap path).
```

The anchor-run `prior_insight_rows` query and `ESTABLISHED FINDINGS` block are suppressed whenever `prior_checkpoint_summaries` are available. The checkpoint chain is the single source of historical narrative context.

---

**DELTA_FACTS block format** (built by `_build_delta_facts_block`):

```
━━━ DELTA_FACTS (code-computed — authoritative for metric values) ━━━
NPS delta:      {nps_delta:+.1f} pts  ({trend_direction}, {trend_persistence})
CSAT delta:     {csat_delta:+.2f}                [omit line if None]
CES delta:      {ces_delta:+.2f}                 [omit line if None]
New responses:  {response_count_delta}
Topics emerged: {', '.join(emerged)}             [omit line if empty]
Topics resolved:{', '.join(resolved)}            [omit line if empty]

CITATION RULE (three categories — apply uniformly):
Every factual claim MUST be supported by exactly one of:
  (a) A DELTA_FACTS value — state it directly (e.g. "NPS dropped 3.2 points").
      No verbatim citation needed for metric delta claims.
  (b) A [rXXX] citation from NEW_VERBATIMS — required for theme/topic claims.
      Do not cite verbatims for metric values.
  (c) A CHECKPOINT TRAJECTORY assertion — multi-checkpoint trend claims derived from
      the TRAJECTORY block are stated directly with checkpoint reference
      (e.g. "NPS has declined for three consecutive checkpoints (#11→#12→#13)").
      No verbatim citation needed; trajectory data is code-computed.
Do not make claims unsupported by (a), (b), or (c).
Do not invent citations.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**TRAJECTORY block format** (appended when `len(summaries) >= 2`, built by `_build_trajectory_block`):

```
━━━ CHECKPOINT TRAJECTORY (oldest → newest) ━━━
{for each summary: "Checkpoint #{n} ({date}): NPS {val}"}
Use this to identify multi-checkpoint trends in your narrative.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**BASELINE_MODE block** (for bootstrap or null delta, built by `_build_baseline_mode_block`):

```
━━━ BASELINE_MODE ━━━
This is the FIRST checkpoint for this survey. No prior state exists.
Narrate as a BASELINE — establish what IS, not what changed.
Do NOT use directional language: avoid "increased", "decreased", "dropped", "grew", "improved", "declined".
Describe current NPS, top themes by volume, and sentiment distribution.
━━━━━━━━━━━━━━━━━━━━━
```

This is a separate prompt branch, not a null-branch patch on the incremental template. When `is_bootstrap=True`, only the BASELINE_MODE block is prepended; no DELTA_FACTS or TRAJECTORY blocks are constructed.

---

### Automated incremental prompt structure

```
SYSTEM: You are narrating an INCREMENTAL intelligence update.
Facts in DELTA_FACTS are authoritative. Do not contradict them.

CONTEXT:
- [DELTA_FACTS block prepended to specialist_overlay — see injection spec above]
- [TRAJECTORY block prepended if len(prior_checkpoint_summaries) >= 2]
- NEW_VERBATIMS: {only new_response_ids sample, max 30 quotes}
- METRIC_SNAPSHOT: latest point

NOTE: The ESTABLISHED FINDINGS block and prior_insight_rows anchor-run query are suppressed
when prior_checkpoint_summaries are present. The checkpoint chain is the sole historical context.

TASK:
1. Lead with what CHANGED (metrics + topics)
2. New themes emerged / resolved themes
3. What stayed stable (brief)
4. Recommended action if prescriptive layer enabled

CITATION RULE (three categories — apply uniformly):
Every factual claim MUST be supported by exactly one of:
  (a) A DELTA_FACTS value — state it directly (e.g. "NPS dropped 3.2 points").
      No verbatim citation needed for metric delta claims.
  (b) A [rXXX] citation from NEW_VERBATIMS — required for theme/topic claims.
      Do not cite verbatims for metric values.
  (c) A CHECKPOINT TRAJECTORY assertion — multi-checkpoint trend claims derived from
      the TRAJECTORY block are stated directly with checkpoint reference
      (e.g. "NPS has declined for three consecutive checkpoints (#11→#12→#13)").
      No verbatim citation needed; trajectory data is code-computed.
Do not make claims unsupported by (a), (b), or (c).
Do not invent citations.
```

### Manual expert prompt structure

```
SYSTEM: You are producing the deepest experience intelligence report in the industry.

CONTEXT:
- Window: {window_start} to {window_end}
- Corpus: {sample_stats} with confidence disclosure
- Metric trajectory: {5 snapshots}
- Prior automated intelligence (context, not ground truth for window metrics)
- TOPIC_SIGNALS, DRIVERS, METRICS (all code-computed)

TASK: Full tiered report — executive summary, theme deep-dives, driver analysis,
segment highlights, risks, opportunities. Minimum 8 themes if data supports.

CITATIONS: Every claim must cite [rXXX]. Include citations_manifest output.
Exception: Metric claims (NPS/CSAT/CES values, response counts, score trajectories) are
code-computed from TOPIC_SIGNALS/METRICS — do NOT cite a verbatim for these. State them directly.
```

### Manual quick prompt structure

```
SYSTEM: Executive quick brief — decisive, scannable, 90-second read.

TASK: Top 3 findings, top 2 risks, top 1 action. Max 5 themes.
```

---

## 7. Node: `report_build` (tiered_report profiles)

| Template | Sections | Min insights |
|----------|----------|--------------|
| `incremental_delta` | delta_summary, changes, stable, action | 4–8 |
| `expert_deep` | exec, themes×N, drivers, segments, forecast | 15–40 |
| `executive_quick` | exec, top_findings, action | 3–6 |

Each insight row gets `audit_json`:

```json
{
  "prior_checkpoint_refs": ["uuid"],
  "new_response_refs": ["uuid"],
  "prior_insight_refs": ["checkpoint_id:uuid:category:voice.topic:billing"],
  "delta_facts": { },
  "run_mode": "automated_incremental"
}
```

---

## 8. Node: `publish` (profile-aware)

### Automated

```
IF NOT meaningful_delta AND NOT is_bootstrap AND NOT milestone:
  - Append metric snapshot only (optional)
  - SKIP checkpoint write
  - SKIP active projection update
  - Mark agent_run completed (skipped_checkpoint=true)
ELSE:
  # Phase 0.5: INSERT into survey_insight_checkpoints (existing table).
  # insight_checkpoints_v2 does NOT exist until Phase 1.
  - INSERT survey_insight_checkpoints
      (survey_id, org_id, checkpoint_number, trigger, run_id,
       delta_from_prior, meaningful_delta,            ← populated by node_delta_compute
       nps_at_checkpoint, topic_fingerprint,
       response_count_at_checkpoint, response_high_watermark,
       report_blob_ref, created_at)
    # Note: meaningful_delta requires Phase 0.5 migration:
    # ALTER TABLE survey_insight_checkpoints ADD COLUMN meaningful_delta BOOLEAN NOT NULL DEFAULT FALSE;
  - WRITE blob (schema_version=1, same as current)
  - Supersede + INSERT insights
  - Append survey_metric_snapshots
  # Emit checkpoint_written event via SSE (append to agent_runs.stream_events):
  # {"event": "checkpoint_written", "checkpoint_number": N, "nps": ..., "meaningful": true}
  # The backend SSE handler (GET /api/insights/:surveyId/stream) streams this
  # to the frontend automatically because it polls agent_runs.stream_events.

# Phase 1+: switch to INSERT insight_checkpoints_v2 with parent_checkpoint_id,
# lineage_json, and full linked-list fields (see 03_DATA_MODEL.md §3).
```

### Manual

```
- INSERT insight_reports (status=generating → ready)
- INSERT survey_insight_checkpoints (lane=manual, parent=latest automated)
  # Phase 1+: INSERT insight_checkpoints_v2 (lane=manual, parent=latest automated).
  # In Phase 0.5, manual modes are not yet implemented — this branch fires in Phase 3.
- WRITE blob + citations_manifest
- DO NOT supersede automated insights
- Emit SSE complete with report URL
```

---

## 9. Checkpoint write gate (automated) — decision table

| Condition | Write checkpoint? | Update active? |
|-----------|-------------------|----------------|
| Bootstrap (no parent) | Yes | Yes |
| Tier milestone (10/40/70/100) | Yes | Yes |
| meaningful_delta = true | Yes | Yes |
| new_responses ≥ 200 since parent | Yes | Yes |
| Otherwise | No | No |
| Scheduler + 0 new responses | Abort run early | No |

**Bootstrap note:** When `is_bootstrap=True`, the narrate prompt must receive an explicit `is_first_run=True` flag so the LLM uses baseline mode (see Section 6 DELTA_FACTS null-branch). This ensures the LLM does not attempt to describe changes when no prior state exists.

---

## 10. Sampling algorithms

### Stratified sample (manual expert, large corpus)

```
1. Bucket by: week × sentiment_tertile × has_nps_score
2. Proportional allocation per bucket
3. Within bucket: random with recency bias (weight ∝ exp(-age_days/30))
4. Ensure min 5 quotes per top-10 topic by parent fingerprint overlap
```

### Recency-weighted (manual quick)

```
1. Sort by created_at DESC
2. Take top 60% by recency
3. Stratified fill to 150 across sentiment classes
```

---

## 11. Citation manifest generation

At publish, build:

```python
citations_manifest = {
  "response_ids": sorted(all cited response ids),
  "snapshot_ids": [s["id"] for s in metric_snapshots],
  # Phase 0.5: prior_checkpoint_summaries contains {checkpoint_number, created_at, nps}
  # — no UUID. Use checkpoint_number as the identifier in Phase 0.5.
  # Phase 2+: prior_checkpoints from resolve_context contains full blobs with "checkpoint_id".
  "prior_checkpoint_refs": [
      f"checkpoint#{s['checkpoint_number']}" for s in state.get("prior_checkpoint_summaries", [])
  ],  # Phase 0.5
  # "prior_checkpoint_ids": [p["id"] for p in prior_checkpoints],  # Phase 2+
  "insight_hashes": [...],
  "generated_at": now(),
}
```

Store as separate blob if > 1000 IDs; else inline in `lineage_json`.

---

## 12. Error handling

| Failure | Behavior |
|---------|----------|
| Parent blob missing | Fall back to DB metrics row; log `lineage_degraded` |
| ABSA timeout on new batch | Partial publish with `trust_score` penalty |
| Manual run empty window | 400 `empty_window` |
| Checkpoint write fails | Fail run; do not update projection |
| Delta compute error | Block publish (scientist requirement) |

---

## 13. Reproducibility

- `temperature=0.1` for narrate specialist calls (matches current implementation in all environments). `temperature=0` is used only for ABSA and `report_build` section generation.
- Store `prompt_hash`, `model`, `seed` in `lineage_json`
- CI golden test: same parent + same new_response_ids → identical `delta_from_prior` JSON (code-computed, deterministic). Narrated text is not validated in CI golden tests — it is LLM-generated at temperature=0.1 and therefore non-deterministic.

---

## 14. Constants (defaults — override via settings)

```python
DEFAULT_PRIOR_CHECKPOINT_LOOKBACK = 5
DEFAULT_PRIOR_CHECKPOINT_MAX_AGE_DAYS = 90
DEFAULT_STREAM_THRESHOLD = 10
DEFAULT_REPORT_REGEN_THRESHOLD = 25
DEFAULT_FULL_CHECKPOINT_THRESHOLD = 200
DEFAULT_MANUAL_EXPERT_SNAPSHOTS = 5
DEFAULT_MANUAL_QUICK_SAMPLE = 150
DEFAULT_MANUAL_EXPERT_CHECKPOINT_LOOKBACK = 3
DEFAULT_REFRESH_LOOKBACK_DAYS = 30
DEFAULT_REFRESH_MIN_RESPONSE_COUNT = 25
DEFAULT_REFRESH_DAILY_LIMIT = 5       # env: REFRESH_DAILY_LIMIT
DEFAULT_MANUAL_DAILY_RUN_LIMIT = 10   # env: MANUAL_DAILY_RUN_LIMIT
```

---

## 15. Credit costs (all runs charged)

Every pipeline run debits credits before execution. Automated runs charge a small per-checkpoint
cost (not "free") so orgs have cost visibility and threshold-tuning incentive.

| Profile | Default cost | Env override | Per-survey override |
|---------|-------------|--------------|---------------------|
| `automated_incremental` (checkpoint only) | 5 | `CREDIT_COST_AUTOMATED_CHECKPOINT` | `credit_cost_automated_checkpoint` |
| `automated_incremental` (with report doc) | 15 additional | `CREDIT_COST_AUTOMATED_REPORT` | `credit_cost_automated_report` |
| `refresh` | 8 | `CREDIT_COST_REFRESH` | `credit_cost_refresh` |
| `manual_quick` | 15 | `CREDIT_COST_MANUAL_QUICK` | `credit_cost_manual_quick` |
| `manual_expert` | 40 | `CREDIT_COST_MANUAL_EXPERT` | `credit_cost_manual_expert` |
| Custom Analysis | 25–75 (corpus size) | `CREDIT_COST_CUSTOM_BASE` | per `custom_analysis_*` settings |

**Pre-flight rule:** Automated skips silently on insufficient credits (no error, logs `insufficient_credits`).
All manual/refresh/custom runs return HTTP 402 `insufficient_credits` if balance < cost.

---

## 16. `automated_insights_enabled` / `automated_report_generation_enabled` routing

These two settings split what was previously one "automated" toggle into two independent products:

| Setting | Controls | When OFF |
|---------|----------|----------|
| `automated_insights_enabled` | Whether stream/scheduler triggers run the insight pipeline at all | No checkpoint writes, no active projection updates, no credit charges |
| `automated_report_generation_enabled` | Whether the pipeline generates the tiered document report (the expensive part) when a run does execute | Runs execute but emit only metric insights; report template skipped; cost = `credit_cost_automated_checkpoint` (5) not full report cost |

**Pipeline routing:**

```python
# In resolve_context / pipeline entry:
if not settings.automated_insights_enabled:
    return skip_run(reason='automated_disabled')

skip_report = not settings.automated_report_generation_enabled
# Pass skip_report into node_narrate and node_report_build:
# When True → skip tiered_report call, emit only metric + topic insights
credit_cost = (
    settings.credit_cost_automated_checkpoint
    if skip_report
    else (settings.credit_cost_automated_checkpoint + settings.credit_cost_automated_report)
)
```
