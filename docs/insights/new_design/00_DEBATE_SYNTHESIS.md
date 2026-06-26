# Multidisciplinary Debate Synthesis

> A structured review as if convened by: **AI Architect**, **Applied Scientist**, **Enterprise CX Director (customer)**, **Product Owner**, **Staff Engineer**, **UX Lead**, **Operational Engineer**, **Security & Compliance**.

**Inputs:** [intelligence-lifecycle-visual-guide.md](../intelligence-lifecycle-visual-guide.md), current `crystalos/graphs/insights.py`, `survey_insight_checkpoints`, customer vision (June 2026).

---

## Panel charter

> *“Build the most insane and futuristic insight pipeline in experience management — but make it enterprise-auditable, configurable, and honest about what changed.”*

---

## Round 1 — What are we doing wrong?

### AI Architect

| Finding | Severity |
|---------|----------|
| **Two checkpoint concepts** (intelligence blobs vs LangGraph Postgres checkpoints) confuse engineers and ops | High |
| **Next automated run does not read prior checkpoint blobs** — it re-derives `prior_insights` from `insights` rows via anchor run SQL | Critical |
| **Active insights are superseded** — history lives in checkpoints, but checkpoints are noisy append-only with weak gating | High |
| **Manual and automated share one publish path** — same checkpoint write, same supersede pattern; only `force_regenerate` differs | High |
| **`compute_delta()` exists but is not wired** — `delta_from_prior` and `topic_fingerprint` often null | High |
| **Schedule trigger may violate DB CHECK** (`schedule` ∉ `responses\|days\|manual\|stream`) | Medium |

**Verdict:** We built storage for a linked intelligence timeline but wired narration to a *mutable active set*. Architecture must treat **checkpoint = immutable node**, **active insights = projection of latest automated checkpoint**.

---

### Applied Scientist

| Finding | Severity |
|---------|----------|
| Automated runs sample ~50 new responses but **prior context is anchor-run insights**, not prior checkpoint narratives — risk of narrative drift vs metric reality | High |
| **Trends use `survey_metric_snapshots`** (correct) but **delta stories don't use checkpoint-to-checkpoint math** — inconsistent epistemology | High |
| Manual “full bootstrap” re-processes overlapping corpus — **wasteful and statistically redundant** with prior work | Medium |
| No explicit **topic lifecycle taxonomy** (emerged / growing / stable / declining / resolved) in customer-facing output | Medium |
| **Expert vs Quick** not differentiated — one manual path | High |
| Citations exist (`citations_json`, `[rXXX]`) but **checkpoint blob doesn't guarantee full provenance manifest** | Medium |

**Verdict:** Separate **incremental inference** (automated) from **windowed re-estimation** (manual). Delta must be **code-computed** from metrics + topic fingerprints, then narrated.

---

### Enterprise CX Director (Customer)

| Need | Today | Gap |
|------|-------|-----|
| “What changed since last week?” | Partial — trends yes, narrative delta weak | Need explicit **change ledger** per checkpoint |
| “Who generated this — system or Sarah?” | `trigger` field only | Need **actor**, **run mode**, **config snapshot** |
| “Show me the report from March 12” | Checkpoint list + blob fetch | Works but **cluttered on firehose surveys** |
| “Don't re-read 10,000 old verbatims every Tuesday” | Automated still loads samples | Need **trust in prior checkpoints** as frozen truth |
| Configure how far back automated runs look | Not configurable | **Must have** — default 5 checkpoints |
| Audit for compliance | `agent_runs` + sparse audit_json | Need **immutable lineage chain** |

**Verdict:** “Enterprise-ready” means **linked list + actor + config + citations manifest**, not more LLM prose.

---

### Product Owner

| Finding | Implication |
|---------|-------------|
| UI tier progression (10/40/70/100) is **marketing signal**, not intelligence depth | Keep for UX; decouple from checkpoint logic |
| **Generate button** gated on 10 new + 3/day feels arbitrary for Expert mode | Manual should allow **time-window report** even without 10 new (with warning) |
| No clear **Automated vs Manual** timeline in product | **Insight Trail** is P0 |
| Crystal read-only vs pipeline write is correct | Extend: **“Open full report”** deep link |
| Competitive wedge: **delta-native XM** — nobody shows “what emerged / what declined” with citations | Build this as first-class |

**Verdict:** Product promise = **“Living intelligence with memory.”** Memory = checkpoints; living = automated incremental.

---

### Staff Engineer (CrystalOS + Backend)

| Finding | Location |
|---------|----------|
| `force_regenerate` from API body **ignored** in `main.py` | Integration bug |
| Checkpoint written **every publish** regardless of `CHECKPOINT_FULL_RESPONSE_THRESHOLD` | `node_publish` |
| `prior_insight_refs` in audit_json set in tiered_report but **not loaded from checkpoint blobs on next run** | `tiered_report.py` / `node_narrate` |
| Active `insights` table uses **upsert by hash** — good for UI, bad as history | By design — need parallel immutable store |
| Frontend checkpoint UI **minimal** — API exists, experience pages don't surface trail | `insights.ts` vs experience pages |

**Verdict:** Implementation gap is **read path**, not write path. Wire checkpoint chain into ingest/narrate.

---

### UX Lead

| Finding | Recommendation |
|---------|----------------|
| Audit drawer on insight cards is **model/verifier focused**, not **lineage focused** | Add **Provenance tab**: prior checkpoints, new response IDs, snapshot IDs |
| Trends page is strong; **intelligence history** is weak | Unified **Insight Trail** with Automated/Manual lanes |
| Manual run has no mode picker | **Expert / Quick** with clear time + sample preview before run |
| Firehose checkpoint clutter | **Collapse** similar automated checkpoints in UI; show delta badge |

---

### Operational Engineer

| Finding | Risk |
|---------|------|
| Checkpoint blob growth unbounded on high-volume surveys | Tiered retention + **compaction policy** |
| Redis stream + scheduler + manual can **triple-fire** | Idempotency keys per `(survey_id, mode, window)` |
| OCI/local blob refs opaque | OK if API proxies; need **lifecycle GC** for superseded automated blobs > retention |

---

### Security & Compliance

| Requirement | Design response |
|-------------|-----------------|
| Immutable audit | Checkpoint rows **append-only**; soft-delete prohibited for automated |
| PII in blobs | Citations by ID; blob stores **refs not full PII** where possible |
| Who did what | `created_by` (`system:stream`, `system:scheduler`, `user:{clerk_id}`) |

---

## Round 2 — Debate highlights

**Architect vs Scientist** on “should automated runs re-embed old responses?”  
→ **No.** Past checkpoint narratives + metrics + topic fingerprints are sufficient; only **new response IDs** enter ABSA/cluster delta. Overlap ≤ configured lookback window is acceptable.

**PO vs Customer** on manual without 10 new responses:  
→ **Expert mode** may run on **calendar window** (e.g. “last 30 days”) with `confidence: exploratory` badge if n is low. **Quick mode** keeps stricter gates for cost.

**Engineer vs Ops** on one pipeline vs two:  
→ **One tool library, two orchestration profiles** (`automated_incremental`, `manual_expert`, `manual_quick`) — preserves ENGINE_DECISIONS #3.

**UX vs PO** on history UI:  
→ Single **Insight Trail** with filters; not separate pages per mode.

---

## Consensus principles (v2)

1. **Immutable checkpoint linked list** — each node points to `parent_checkpoint_id`, prior refs[], new response set, snapshot refs, actor, config hash.
2. **Automated = incremental** — read N prior checkpoints (default 5), never re-narrate old responses; process only new since `parent.watermark_response_at`.
3. **Manual = windowed** — always new report for explicit timeframe; Expert vs Quick controls sample depth and snapshot count.
4. **Active insights = projection** — UI default view = latest **automated** checkpoint insights; manual runs create **named reports** that don't overwrite automated truth unless pinned.
5. **Delta is code-first** — wire `compute_delta()` + topic lifecycle before LLM narrate.
6. **Crystal returns documents** — tool `get_insight_report(checkpoint_id)` → summary + URL to `/experience/surveys/:id/intelligence/trail/:checkpointId`.
7. **Configurable** — org/survey settings for lookback, thresholds, retention; defaults documented in [05_CONFIGURATION.md](./05_CONFIGURATION.md).

---

## What we keep from current system

- LangGraph DAG structure and tool layer (`metrics.py`, `delta.py`, `tiered_report.py`)
- `survey_metric_snapshots` as trend source of truth
- Supersede pattern for **active card view** (with clearer separation from history)
- Stream consumer + scheduler triggers
- Citation format `[rXXX]` and trust scoring
- Crystal read path via tools (extend, don't replace)

---

---

## Round 3 — Second-pass critique (June 2026)

Additional issues surfaced by the product owner after Round 1+2:

### Credit model was wrong

The previous design said "automated runs are unbounded (gated by threshold)" — implying no credit charge. **This is wrong for three reasons:**

1. You absorb the actual LLM cost invisibly. At scale, this becomes a loss center.
2. Orgs have no visibility into their AI spend, which makes the credit system feel inconsistent.
3. Removing the incentive to configure thresholds leads to trigger abuse (orgs set threshold=5 and get 20+ runs/day).

**Fix:** All runs charge credits. Automated runs are cheap (5 credits/checkpoint) but not free. The org's plan includes a monthly automated credit allowance so it feels included in the plan — but it's still tracked and credited to the ledger. This gives orgs cost transparency and incentive to tune thresholds.

### `automated_enabled` was one setting doing two jobs

The prior design had one `automated_enabled` toggle that controlled both (a) continuous insight card updates and (b) automated document report generation. These have different cost profiles and different customer value. An org might want live cards always updating but not want to burn credits on document generation at every milestone.

**Fix:** Two settings — `automated_insights_enabled` (card updates) and `automated_report_generation_enabled` (document generation). Independent toggles. Both default on.

### Refresh lookback was undefined

The "Refresh" button on the Intelligence page had no defined lookback window. Without this, the pipeline either re-processes all responses (expensive) or uses an arbitrary recent window. The correct design: configurable `refresh_lookback_days` (default 30) with a `refresh_min_response_count` fallback (default 25) that expands the window backwards if needed. Prevents "insufficient data" errors on slow-cadence surveys.

### Settings RBAC was underspecified

"Requires `insights:configure` permission" — but who has that? The design needed to say explicitly: **all members read, only `brand_admin` (or `survey_owner` for their own survey) can write.** Settings pages show read-only UI to non-admins rather than hiding the page entirely.

### Custom Analysis was disabled by default

Setting `custom_analysis_enabled=false` by default hides a high-value feature from all customers until an admin notices and flips it. The right default is **enabled**. Guardrails (trust degradation for n<30, minimum-n warnings, dedicated UI separate from manual run dialog) handle abuse without requiring a kill switch as default.

### Stream response threshold range was too narrow (5–50)

Enterprise customers running high-volume in-app surveys (10,000+ responses/month) need thresholds of 100–500 to avoid trigger noise. Range updated to 5–500.

---

## Success metrics (12 months post-launch)

| Metric | Target |
|--------|--------|
| Automated run p95 latency | < 90s (incremental) |
| Manual Expert p95 | < 8 min |
| Checkpoint lineage completeness | 100% rows have `parent_checkpoint_id` + `lineage_json` |
| Customer comprehension (usability test) | 80% explain “what changed since last checkpoint” |
| Firehose checkpoint noise | < 30% “no meaningful delta” writes (gated) |
