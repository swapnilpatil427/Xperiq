# Prism — CrystalOS Notes & Deferred Work (I5 / ADR-025/026)

This file tracks the Prism (cross-platform import + continuous-sync) work that touches CrystalOS,
so the parts that are **designed but deferred** are not lost. Source of truth: the migration design
set under `docs/otherplatforms/migration/` — chiefly `architecture-review.md` (§3 CrystalOS
validation, I4/I5, ADRs 020/023/025/026) and `architecture-ingestion.md` §8.

## What landed in this change (shipped)

- **Skills** (auto-register via `skills/plugin.json` + `registry.warm_router`):
  - `schema-mapper` — propose source→Xperiq field mappings with confidence (ADR-018, deterministic-first; LLM is the residual).
  - `taxonomy-mapper` — reconcile imported topic labels with the `survey_topics` registry (merge / new / conflict).
  - `metric-parity` — explain a source-vs-Prism metric delta + recommend match-source vs rebaseline (ADR-003/019).
- **Context tools** (`crystalos/tools/prism_feedback.py`, registered in `plugin.json`):
  - `get_unified_feedback(org_id, survey_id?, date_from?, date_to?, topics?)` — ADR-026 cross-source read.
  - `get_insight_sources(org_id, insight_id)` — ADR-026 provenance ("the verbatims behind this number").
  - `should_enrich` / `stamp_enrichment_version` — `enrichment_version` awareness helper (B6).

> **Important caveat (TODO(verify)):** `unified_feedback` (view over `responses` + `signals`),
> `insight_response_citations`, the `signals` table, and the `enrichment_version` column are
> **DESIGNED but NOT YET in the DB** (verified against `supabase/` migrations + `lib/db.ensure_schema`
> on 2026-06-29). The two read tools probe the new shape first and **fall back** to today's tables
> (`responses`; `insights.sample_response_ids` → `agent_runs.sampled_response_ids`), so they work now
> and light up automatically once the Prism migrations land. Re-point the primary queries + confirm
> exact column names (`source_observed_at`, `topics_text`, `insight_response_citations` columns) when
> the migrations exist.

---

## Deferred I5 work — needs the running pipeline (concrete TODO checklist)

The "killer finding" (review §3): the insight pipeline runs **one survey at a time** (~10-conn pool,
30s–2min/run → ~5 concurrent). A naïve enrich-all-50M backfill ≈ **~230 days** wall-clock. Tiered
intelligence (ADR-013) is therefore **load-bearing**, not a feature. These items can only be
finished/validated against a running pipeline + load tests, so they are tracked here as TODOs for
the CrystalOS team. Each is owned in the review; none is started.

### Tier 1 — hardening (small; before P1 load tests)

- [ ] **B1 — connection pooling.** Put pgBouncer (transaction pooling) in front of the `db.py` pool
      so a run doesn't pin a connection for its whole 30s–2min. Today `_pool` is `min_size=4,
      max_size=20`; runs hold a conn across LLM calls. → unblocks any large backfill / many custom analyses.
- [ ] **B2 — per-provider LLM semaphore + `BudgetExceeded` ≠ circuit.** Add a per-provider concurrency
      semaphore + backoff around `lib/openrouter.py`. **Separate `BudgetExceededError` from provider
      failure** so a budget event does NOT open the org-wide circuit breaker
      (`ENTERPRISE_CRYSTALOS_REDESIGN.md:174–183`). Budget = "stop spending"; provider 5xx = "retry/trip".
- [ ] **B3 — Redis consumer groups.** Move `consumers/response_stream.py` from plain `XREAD` to
      `XREADGROUP` consumer groups so multiple replicas share the stream and a dead consumer's
      pending entries are reclaimed (today a single consumer death loses triggers). Keep the
      `tier:{survey_id}:{tier}` dedup + DLQ behavior.
- [ ] **B6 — `enrichment_version` column.** Add `enrichment_version` to `responses` (and `signals`
      when it exists); re-enrich only on a version bump. Wire `tools/prism_feedback.should_enrich` /
      `stamp_enrichment_version` into the enrichment write path. Cache key = `(response_id,
      enrichment_version)` so a paused backfill resumes without double-charging.

### Tier 2 — decoupled enrichment + horizontal scale (the core fix — ADR-025)

- [ ] **B4 — decoupled enrichment worker tier.** Pull enrichment (embeddings / ABSA / sentiment /
      topic assignment) OUT of the inline insight pipeline (`graphs/insights.py`) into its own
      queue-backed, horizontally-scaled worker tier that enriches **on ingestion** — idempotent,
      cached by `response_id` + `enrichment_version`. The insight pipeline then **reads cached
      enrichments** instead of computing them inline.
- [ ] **B5 — Redis `run_registry`.** Move the in-process `run_registry` (`main.py:530`, used for
      cancel/track) into Redis so **N stateless CrystalOS replicas** can see/cancel each other's runs.
      Highest-risk item — treat as its own hardening spike with chaos tests (per review caveat).
- [ ] **Per-tenant fairness + credit-gated admission.** Separate interactive (Crystal copilot) vs
      batch (Prism backfill) pools/queues so a 50M-row backfill cannot starve interactive Crystal.
      Admission is credit-gated (credits track **processed** intelligence, ADR-013).
- [ ] **Tiered orchestration (live / batch / on-demand).** Implement the load-shedding strategy so we
      **never** run the full pipeline over all history:
      - **Tier A — live**: new data is *always* checkpointed, every mode, no setting; only knob is
        `history_window` (1–12mo, default ~3) of existing history to also checkpoint live.
      - **Tier B — batch**: history older than the window → paced background snapshot checkpoints per
        period/wave; throttled, resumable, deferrable, credit-metered; never blocks the import.
      - **Tier C — on-demand**: any older window not yet snapshotted is computed on demand via the
        existing custom-analysis lane (`graphs/custom_analysis.py`), emitting a checkpoint when requested.

### Bitemporal checkpoint writes (ADR-020 / ADR-023 — I4)

- [ ] **Bitemporal `insight_checkpoints_v2`.** Today's `insight_checkpoints_v2` is a per-run parent
      linked list (`checkpoint_number` + `parent_checkpoint_id`). ADR-023 is an **enhancement, not a
      contradiction**: key each checkpoint by **valid-time** (data period `period_start`/`period_end`)
      AND **transaction-time** (`as_of`, `superseded_at`). Order the trail by valid-time so a late
      Tier-B backfill for an earlier period slots into the past and triggers a cheap **delta relink**
      of only its valid-time neighbor — never touching newer checkpoints. Tag backfill rows
      `origin: 'prism_backfill'`. Recompute = insert a new `as_of` + mark prior `superseded_at`; never
      mutate in place. One CURRENT version per `(org, survey, lane, period)`. This is what makes
      concurrent Tier-A live + Tier-B historical writes safe.

### Tier 3 — cross-source + provenance (ADR-026) — partially seeded here

- [ ] **`unified_feedback` view/table** over `responses` **+ `signals`** with a normalized shape
      (`source_type`, `source_record_id`, `survey_id`, `contact_id`, `rating`, `sentiment`,
      `sentiment_score`, `raw_text`, `topics_text`, `source_observed_at`, provenance + bitemporal
      stamps). Pairs with the I6 identity graph (`xperiq_person_id`) for cross-*person* reasoning and
      GDPR-safe erasure. → `tools/prism_feedback.get_unified_feedback` already reads it (with fallback).
- [ ] **`insight_response_citations` table** (insight_id → response_id/signal_id + snippet + weight)
      written at insight `publish` so provenance is queryable. → `get_insight_sources` already reads it
      (with fallback to `sample_response_ids`).
- [ ] **`signals` table** (reviews / calls / tickets / social) with the same `metadata.prism`
      provenance block as `responses`; only first-party `legalPosture` sources are written.
- [ ] **Register the cross-source tools with the Crystal ReAct/registry path** if/when Crystal should
      call them in chat: add definitions to `crystal/registry.py` `TOOL_REGISTRY` + executors in
      `crystal/tools.py` `TOOL_EXECUTORS`. (Skill-path usage already works via `plugin.json` +
      `allowed-tools`.)

---

## Gating

Per review §3 caveat: effort numbers are integration estimates from code inspection, **not
measurement**. Full 50M-at-scale productionization is **gated on running the load/soak tests** (not
yet run). The `run_registry` → Redis move (B5) is the highest-risk item and should be its own
hardening spike with chaos tests.
