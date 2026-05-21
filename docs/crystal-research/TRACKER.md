# Crystal Intelligence Platform — Project Tracker

> **Single source of truth** for all work on the Crystal Intelligence system:
> research documentation, design decisions, prompt library, and implementation.
>
> Implementation detail: `docs/CRYSTAL_TRACKER.md` (full task list with file paths and code specs).
> This tracker is the executive view — status, decisions, open items, and phase gates.

---

## Status Legend

| Symbol | Meaning |
|--------|---------|
| ⬜ | Not started |
| 🔄 | In progress |
| ✅ | Done |
| 🔴 | Blocked — needs decision or action before work can begin |
| 👤 | Needs owner assignment |
| 📝 | Needs a written decision (PM / UX / Science) |

---

## Quick Status — Docs

| Document | Last Updated | Status |
|----------|-------------|--------|
| `03_UX_DESIGN.md` | 2026-05-21 | ✅ Current — 5 UX open questions remain |
| `04_APPLIED_SCIENCE.md` | 2026-05-21 | ✅ Current — research roadmap Phases 2-4 are future work |
| `05_TECHNICAL_ARCHITECTURE.md` | 2026-05-21 | ✅ Current |
| `06_ENGINEERING_IMPLEMENTATION.md` | 2026-05-21 | ✅ Current |

---

## Part 1 — Outstanding Doc Audit Issues

These were identified in a 32-issue cross-doc review. Five remain unfixed.

| ID | Severity | Issue | Doc | Fix needed |
|----|----------|-------|-----|-----------|
| MED-06 | Medium | `topic_fingerprint` hash input is defined three different ways across docs 04, 05, and 06 | 04, 05, 06 | Canonicalize to `sha256(sorted_topic_names joined with '\|')`. One definition in doc 06 `compute_topic_fingerprint()`. Delete the other two definitions. |
| MED-10 | Medium | `narrate_topic_insight` references `specialist.display_name` as an object field but the function signature takes `specialist_context: str` | 06 | Fix: replace `specialist.display_name` reference with string from `specialist_context` param. |
| MED-11 | Medium | `get_driver_analysis` Crystal tool computes `nps_delta` as `topic_nps_avg - overall_nps` on a 0-10 scale — NPS is on a -100 to +100 scale | 06 | Fix: `nps_delta = (topic_nps_avg * 100) - survey_nps_score` where `survey_nps_score` is already on -100 to +100 scale. Note this is documented in doc 05 §3.1 tool spec but the code spec in doc 06 has the wrong formula. |
| LOW-03 | Low | `InsightStateBanner` in doc 06 references `onRetry` prop that is not in the component's props interface | 06 | Remove `onRetry` from the component example in doc 06. |
| LOW-05 | Low | Streaming function in doc 06 has dead imports `httpx, _os` | 06 | Delete those two import lines from the code block. |

**Owner:** Engineering lead reviews before Phase 3 implementation starts.

---

## Part 2 — Open UX Design Decisions

These are in `03_UX_DESIGN.md` §5.2. All must be decided before Phase 8 (frontend routes) begins.

| # | Decision | Current Proposal | Status |
|---|----------|-----------------|--------|
| UX-01 | **Crystal panel width on mobile** (<768px). Right-panel 30% or bottom sheet? | Bottom sheet triggered by floating button | 📝 Confirm with Engineering — bottom sheet has specific animation + z-index requirements |
| UX-02 | **Cross-session conversation persistence** — does Crystal resume conversation when navigating away and returning? | Session-only (thread resets on page reload). Cross-session: thread TTL governs (7-day inactivity rule) | ✅ Decided — thread TTL in doc 05 §2 covers this |
| UX-03 | **Report format** — scrollable page vs. slide-deck (one section per screen) | Scrollable page (current design) | 📝 Needs user research before committing. UX to test both formats with ≥5 users. |
| UX-04 | **Empty state for 0-response surveys** — what does Crystal say? | "No responses yet. Crystal will generate your first report after 10 responses arrive. I can help review your survey questions." | ✅ Decided — update empty state copy in doc 03 §7 to use 10 (not 30) per new sub-tier thresholds |
| UX-05 | **Crystal on non-insights pages** (survey builder, response dashboard) | Yes — with different system prompt context per page | 📝 Needs UX spec for what Crystal can do in each context. Minimum: scope + system prompt per page type. |

---

## Part 3 — Open PM Decisions

These are in `03_UX_DESIGN.md` §8.10.7. Must be resolved before Phase 12 (observability) and notification infrastructure.

| # | Decision | Options | Status |
|---|----------|---------|--------|
| PM-01 | **Email provider** for insight notifications | (a) Reuse existing transactional email, (b) New provider (Resend, SendGrid, etc.) | 📝 Pending PM decision |
| PM-02 | **Push platform** — native mobile vs web push | (a) Web push only (simpler, no app store), (b) PWA web push + future native, (c) Skip push V1 | 📝 Pending PM decision — determines notification_preferences schema values |
| PM-03 | **Notification frequency cap** — max 1 per day per survey even if multiple checkpoints fire? | Cap at 1 email/day per survey recommended | 📝 Pending PM decision — if yes, needs Redis TTL-based dedup in notification_events |
| PM-04 | **Anomaly resolution definition** — is an `ongoing_issue` resolved when metric returns to baseline (science) or when user manually marks it? | Science definition (auto-resolve at baseline) with manual override option | 📝 Pending PM decision — determines `anomaly_events` table and Crystal language |
| PM-05 | **Checkpoint retention** — how many historical checkpoints per survey? | User said: keep all forever | ✅ Decided — keep all. Costs ~2KB/checkpoint in DB + blob in OCI Object Storage. Add a note to doc 05 §5.3 confirming this. |

---

## Part 4 — Prompt Library

All LLM prompts must be written, reviewed, and locked before the engineering phase that uses them.
User confirmed they will review all prompts personally — especially the full report prompt.

| # | Prompt | Used in | Status | Notes |
|---|--------|---------|--------|-------|
| PR-01 | **Full report narration prompt** — generates all insight layers for a 200+ response checkpoint | `node_narrate` | 📝 User reviewing | Most expensive prompt in the system (~$0.05-0.10/run). Crystal Sonnet 4.6. |
| PR-02 | **Topic narration prompt** — generates diagnostic/predictive insight for a single topic cluster | `node_narrate` (per topic) | 📝 To be written | Takes topic signals dict + specialist context. Haiku 4.5 for sub-tier runs, Sonnet 4.6 for full. |
| PR-03 | **Score-only (no-text) narration prompt** — generates metric distribution insights when no open text | `_narrate_score_only()` | 📝 To be written | Must include: "Do not mention themes, topics, or verbatims." |
| PR-04 | **Insight verification prompt** — verifier checks a single insight for hallucination and coverage | `node_verify` | 📝 To be written | Haiku 4.5. Must produce: `{pass: bool, coverage_pct, consistency_pct, notes}` |
| PR-05 | **Crystal ReAct system prompt** — base system prompt for the tool-calling loop | `_build_system_prompt_agentic()` | 📝 To be written | Must include: tool-use instructions, org context injection, specialist context block. |
| PR-06 | **Crystal eval prompt** — quality check on Crystal's final answer | `crystal_eval agent` | 📝 To be written | Nemotron (dev) / Gemini Flash (prod). 5-dimension rubric from doc 04 §7.2. |
| PR-07 | **Specialist system prompt blocks** — one per 7 specialist types | `agents/specialists/` | 📝 User reviewing | saas_cx, healthcare_cx, retail_cx, finserv_cx, education_cx, employee_ex, research_generic |
| PR-08 | **Org-level narration prompt** — generates portfolio-level insights for org scope | `node_narrate` (org scope) | ⬜ Not started | Different from single-survey narration — compares across surveys |

---

## Part 5 — Science Research Roadmap

From `04_APPLIED_SCIENCE.md` §13. Work items organized by priority. Phases 2-4 are post-launch.

### Phase 1: Signal Accuracy Validation (pre-launch, Months 1-3)

These must be done before launch — they validate the signals Crystal reports are accurate.

| # | Task | Target | Status |
|---|------|--------|--------|
| SCI-01 | 100% unit test coverage of `agents/lib/topic_signals.py` — all 24 signals, edge cases (n=0, NPS-less, CSAT-less) | 100% coverage | ⬜ |
| SCI-02 | Create synthetic 200-response dataset with known ground-truth topics, NPS, sentiment | Ground truth dataset | ⬜ |
| SCI-03 | Run pipeline against SCI-02 dataset, compare computed signals to expected. Fix divergence. | Signal accuracy > 90% | ⬜ |
| SCI-04 | ABSA accuracy evaluation: manually annotate 500 open-text responses for sentiment, emotion, aspect. Compute precision/recall against LLM output | Precision > 0.80, Recall > 0.75 | ⬜ |
| SCI-05 | Centroid stability analysis: run clustering 10× with different seeds on same dataset. Measure Jaccard similarity | Jaccard > 0.85 | ⬜ |
| SCI-06 | Driver score correlation validation: on surveys with A/B-tested topic manipulation, validate driver_score identifies the manipulated topics | Correlation confirmed | ⬜ |

### Phase 2: Anomaly Model Tuning (post-launch, Months 4-6)

| # | Task | Status |
|---|------|--------|
| SCI-07 | False positive audit: review all `anomaly_flag=True` records over 30-day prod window. Target: FP rate < 20% | ⬜ |
| SCI-08 | Z-score threshold optimization: test 2.0, 2.5, 3.0 against labeled dataset. Choose threshold maximizing F1 | ⬜ |
| SCI-09 | Checkpoint shadow mode: run `survey_insight_checkpoints` trigger logic for 4 weeks without acting on it. Validate trigger frequency and delta computation. | ⬜ |
| SCI-10 | Sentiment reversal validation: find production cases where topic sentiment reversed. Manually verify not ABSA variance. | ⬜ |
| SCI-11 | Urgency language detection pilot: stage-1 pattern matching in streaming consumer for opted-in cohort. Track precision/recall. | ⬜ |

### Phase 3: Churn Prediction (Months 7-12)

| # | Task | Status |
|---|------|--------|
| SCI-12 | Feature engineering: `respondent_features` table schema + computation | ⬜ |
| SCI-13 | Label creation: link respondent data to CRM churn labels (requires customer data partnership) | ⬜ |
| SCI-14 | Baseline logistic regression model: AUC-ROC + precision at top 20% | ⬜ |
| SCI-15 | Feature importance analysis: validate CES + detractor_pct on Billing as top predictors | ⬜ |
| SCI-16 | Crystal churn risk integration: surface risk scores in Crystal answers | ⬜ |
| SCI-17 | Full promoter/detractor verbatim separation pipeline (doc 04 §8) | ⬜ |

### Phase 4: Multi-Survey Journey Correlation (Months 13-18)

| # | Task | Status |
|---|------|--------|
| SCI-18 | Respondent identity resolution model (email / probabilistic matching) | ⬜ |
| SCI-19 | Cross-survey topic co-occurrence analysis | ⬜ |
| SCI-20 | Journey NPS halo effect measurement | ⬜ |
| SCI-21 | Org-level portfolio correlation: systemic issue detection across surveys | ⬜ |
| SCI-22 | Crystal org-scope mode: portfolio-level Q&A | ⬜ |

---

## Part 6 — Doc Consistency & Completeness

Tasks to keep the four research docs accurate and internally consistent.

| # | Task | Docs | Status |
|---|------|------|--------|
| DOC-01 | Fix MED-06: canonicalize `topic_fingerprint` hash — three conflicting definitions | 04, 05, 06 | ⬜ |
| DOC-02 | Fix MED-10: `specialist.display_name` object reference in `narrate_topic_insight` | 06 | ⬜ |
| DOC-03 | Fix MED-11: `nps_delta` scale — fix formula in doc 06 `get_driver_analysis` | 06 | ⬜ |
| DOC-04 | Fix LOW-03: remove `onRetry` from `InsightStateBanner` props example | 06 | ⬜ |
| DOC-05 | Fix LOW-05: remove dead `httpx, _os` imports from streaming code block | 06 | ⬜ |
| DOC-06 | Update doc 03 §7 empty state copy: use 10 (not 30) responses for "first report" message | 03 | ⬜ |
| DOC-07 | Confirm checkpoint retention = forever in doc 05 §5.3 (currently says "policy TBD") | 05 | ⬜ |
| DOC-08 | Add response velocity formula to doc 04 §2.1: `velocity = response_count / max(1, days_since_first_response)` | 04 | ⬜ |
| DOC-09 | Add `crystal_opening` derivation spec to doc 06 Phase 6 API section — no LLM call, derived from top descriptive insight | 06 | ⬜ |
| DOC-10 | Add OCI blob storage spec to doc 05 §6 and doc 06 Phase 3 — replace GCS references with OCI | 05, 06 | ⬜ |
| DOC-11 | Add Crystal opening observation i18n keys to doc 03 §7.9 catalog: `insights.crystal.opening.collecting`, `.first_voices`, `.early_signals`, `.growing_picture`, `.full_report` | 03 | ⬜ |
| DOC-12 | Urgency language detection notification method (doc 04 §4.4 says "webhook or email, TBD") — resolve with PM-01/PM-02 decision | 04 | 🔴 Blocked on PM-01 |
| DOC-13 | Segment breakdown — `get_segment_breakdown` Crystal tool requires `question_id` segmentation dimension. No design for how survey owners mark segmentation questions. Write brief spec in doc 03 §3 or doc 05 §3.1 | 03 or 05 | 📝 Needs UX decision |
| DOC-14 | CSAT anomaly detection — doc 04 §4.2 notes CSAT anomaly detection uses a proxy test and will be replaced with t-test in Phase 2. Add a code comment / TODO note in doc 06 at the CSAT anomaly code block | 06 | ⬜ |
| DOC-15 | Verify all constants in docs 04/05/06 are identical. Cross-check: `TOPIC_ASSIGNMENT_THRESHOLD`, `CHECKPOINT_FULL_RESPONSE_THRESHOLD`, progressive tier values, trust score thresholds | 04, 05, 06 | ⬜ |
| DOC-16 | Full cross-doc consistency pass after all Part 1-6 edits are complete | All | ⬜ Last |

---

## Part 7 — Engineering Pre-Implementation Decisions

Decisions needed before specific implementation phases start. Most are not doc tasks — they require a short alignment meeting or Slack thread.

| # | Decision | Blocks phase | Status |
|---|----------|-------------|--------|
| ENG-01 | Multi-specialist surveys (doc 04 §11.3) — when a survey spans two industries, does Crystal use both specialist contexts or the closest match? | Phase 4 | 📝 Recommendation: use the `research_generic` specialist for ambiguous cases unless org has set a primary industry |
| ENG-02 | Response quality score formula — `response_quality_score` is listed in doc 04 §2.1 as a signal but no formula is given | Phase 3 | 📝 Proposed: `quality = min(1.0, (word_count / 20) * (1 - is_gibberish))` where gibberish detection is a simple vocab check |
| ENG-03 | Crystal eval pipeline trigger — when does `crystal_eval` run? After every Crystal response? Only in prod? Only when trust score falls below threshold? | Phase 5 | 📝 Recommendation: run in `staging` + `prod` only, triggered after every Crystal response. Skip in `dev` / `dev-paid` to avoid cost. |
| ENG-04 | `ai_operation_logs` retention — how long are LLM operation logs kept? | Phase 12 | 📝 Recommendation: 90 days (matches thread storage TTL). Partition by month, drop oldest partition. |
| ENG-05 | Rate limiter config for Crystal — 10 req/min per org. Is this measured per org or per user? | Phase 5 | 📝 Recommendation: per org (shared pool across all users in the org). Prevents one heavy user from locking others out. |
| ENG-06 | Org aggregation job isolation — `run_org_aggregation()` runs hourly. If the job takes >60s for a large org, does it block the next invocation? | Phase 7 | 📝 Recommendation: use a Redis lock key `org_agg:running` with 120s TTL to prevent overlap. |
| ENG-07 | ABSA circuit breaker recovery — current config is `failure_threshold=3, recovery_timeout=60s`. What is the user experience during ABSA circuit open? | Phase 3 | 📝 Decision: when ABSA circuit is open, fall back to heuristic sentiment (positive/neutral/negative from keyword list) rather than failing the run |

---

## Part 8 — Implementation Phases

See `docs/CRYSTAL_TRACKER.md` for the full task list with file paths, code specs, and dependencies.
Summary of phases and gate conditions here.

| Phase | Description | Gate condition | Status |
|-------|-------------|----------------|--------|
| P0 | Centralized constants | None | ⬜ |
| P1 | Database migrations (6 new migrations) | P0 | ⬜ |
| P2 | Backend route cleanup | None | ⬜ |
| P3 | Agent pipeline hardening (signal extraction, heartbeat, no-text path, blobs, status gate, backend security) | P0 + P1 | ⬜ `checkpoint_store.py` ✅ |
| P4 | Crystal tool registry (13 tools + executors + specialists) | P0 + P1 + P3 + GAP-12 resolved | 🔴 Wait for GAP-12 (org_profile.industry) |
| P5 | Crystal ReAct loop + SSE streaming + thread lifecycle | P4 | ⬜ |
| P6 | Checkpoint system + delta analysis + progressive tiers + rate limiting | P0 + P1 + P3 | ⬜ |
| P7 | Backend API — 10 new endpoints | P3 + P5 + P6 | ⬜ |
| P8 | Frontend — 7 new routes/pages + `useExperience` hook | P7 | ⬜ |
| P9 | Frontend — progressive intelligence UI (ProgressArc, sub-tier layouts, trends) | P7 + P8 | ⬜ |
| P10 | Frontend — Crystal panel refactor (SSE streaming, audit drawer) | P5 + P8 | ⬜ |
| P11 | Frontend — existing fixes + polish + i18n (70+ keys) | P7 | ⬜ |
| P12 | Observability + audit logging | P1 + P3 | ⬜ |
| P13 | Testing | Per-phase | ⬜ |
| P14 | Production readiness + deployment | All | ⬜ |

**Phases 9, 10, 11, 12 can run in parallel** once Phase 7 API is complete.

---

## Part 9 — Resolved Gaps

Items that were open and are now decided/implemented.

| ID | Gap | Resolution | Date |
|----|-----|-----------|------|
| GAP-02 | `agents/crystal/` package doesn't exist | Will be created in Phase 4 | — |
| GAP-10 | Blob storage backend (was GCS) | OCI Object Storage for staging/prod; local filesystem for dev/dev-paid. `checkpoint_store.py` created with optional OCI SDK, graceful fallback, instance principal auth. | 2026-05-20 |
| GAP-11 | OCI SDK not in requirements | Add `oci>=2.119.0` as optional dependency in Phase 3 | 2026-05-20 |
| GAP-14 | Crystal opening observation — LLM call or pre-computed? | Derived from top descriptive insight's `narrative` by trust_score. Backend adds `crystal_opening` to `GET /api/insights/:surveyId/list`. Zero extra LLM cost. | 2026-05-20 |
| GAP-17 | Signed URL strategy for checkpoint reports | dev/dev-paid: `agentsClient.getCheckpointBlob(ref)` → agents reads local file. staging/prod: `agentsClient.getCheckpointReadUrl(ref)` → agents generates OCI PAR (15-min). Both internal endpoints added to `agents/main.py`. | 2026-05-20 |
| GAP-20 | `insight_hash` three conflicting definitions | Canonical: `sha256(f"{survey_id}:{topic_fingerprint}:{layer}:{category}")` in `agents/tools/delta.py` | — |

---

## Part 10 — Decision Log

Key decisions made during the research phase. Not tasks — permanent record.

| Date | Decision | Made by | Doc reference |
|------|----------|---------|--------------|
| 2026-05 | Progressive sub-tiers: Collecting(0-9), First Voices(10-39), Early Signals(40-99), Growing Picture(100-199), Clear Picture(200+) | Confirmed | doc 03 §8, doc 04 §12, doc 05 §5.2, doc 06 |
| 2026-05 | Cumulative window: all runs load ALL responses up to `INGEST_MAX_RESPONSES_CAP=250` | Confirmed | doc 04 §3.1, doc 06 constants |
| 2026-05 | Clear Picture = Full Checkpoint — `PROGRESSIVE_TIER_CLEAR_PICTURE=200 = CHECKPOINT_FULL_RESPONSE_THRESHOLD=200`, same trigger | Confirmed | doc 04 §12, doc 05 §5.2 |
| 2026-05 | Multi-checkpoint delta: N vs N-1 (delta_latest) + N-1 vs N-2 (delta_prior) → trend_direction, trend_persistence, nps_acceleration | Confirmed | doc 04 §3.7 |
| 2026-05 | No 4-tier prominence model | Confirmed | — |
| 2026-05 | Notification infrastructure: stubs only — in-app active, email/push as `notification_events` pending queue | Confirmed | doc 05 §6, doc 03 §8.10.6 |
| 2026-05 | Keep ALL checkpoints forever | Confirmed | doc 05 §5.3 (needs DOC-07 update) |
| 2026-05 | Crystal thread key: (org_id, user_id, survey_id, scope). 7-day inactivity TTL. 90-day storage TTL. | Confirmed | doc 05 §2 |
| 2026-05 | Survey pause: accepts responses, shows insights, no pipeline triggers, clear status banner | Confirmed | doc 05 §5.2, doc 03 §7.2 |
| 2026-05 | No-text surveys: skip ABSA/embed/cluster/topics; score-only narration; topics section hidden (not empty) | Confirmed | doc 04 §2.3, doc 05 §5.2, doc 03 §7.2 |
| 2026-05 | Object store: OCI for prod, local filesystem for dev/dev-paid | Confirmed | `agents/lib/checkpoint_store.py` |

---

*Crystal Intelligence Platform — Experient Internal Research*
*For implementation task detail see: `docs/CRYSTAL_TRACKER.md`*
