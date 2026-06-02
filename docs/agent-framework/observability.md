# XOS Observability

**Status:** Design  
**Last updated:** 2026-05-21

---

## Current State

| Signal | Current | Gap |
|--------|---------|-----|
| Metrics | Prometheus counters/histograms at `/metrics` | No per-skill breakdown |
| Logs | structlog JSON to stdout | No trace correlation |
| Traces | None | Can't follow a request across pipeline nodes |
| Evals | Inline LLM judge in `node_verify`, no persistence | No trend data, no regression detection |
| Hallucination | `_verify()` — LLM-asks-LLM | Same model family judging itself |
| PII | Scanned in compliance agent, not in trace logs | PII leaks into `ai_operation_logs` |

Three fixes in priority order:

1. **Distributed tracing** — Langfuse traces across every pipeline node and Crystal turn
2. **Hallucination gate** — Gemini Flash as cross-vendor judge replacing `_verify()`
3. **PII scrubber** — Regex scrub on trace inputs before they leave the process

---

## Fix 1: Distributed Tracing (Gap G1)

### Why Langfuse

Langfuse is self-hostable, open-source, and has a Python SDK that wraps LLM calls directly. It supports:
- Nested spans (trace → pipeline run → node → LLM call)
- Input/output capture with token counts
- Custom metadata (org_id, survey_id, skill_name)
- Eval scores linked to traces
- No-op when `LANGFUSE_PUBLIC_KEY` is unset

This last point is critical — the tracer must never break the pipeline if Langfuse is down.

### Tracer Design

**Planned file:** `agents/lib/tracer.py`

```python
class Tracer:
    """Thin wrapper around Langfuse. No-ops if LANGFUSE_PUBLIC_KEY is unset."""

    def trace(self, name: str, metadata: dict) -> ContextManager[Span]:
        """Create a root trace. Used at pipeline/Crystal entry points."""

    def span(self, parent: Span, name: str, input: dict) -> ContextManager[Span]:
        """Create a child span. Used at each pipeline node."""

    def llm_call(self, parent: Span, model: str, input: dict, output: dict,
                 tokens: dict) -> None:
        """Record a single LLM call with token counts."""

    def score(self, trace_id: str, name: str, value: float, comment: str = "") -> None:
        """Attach an eval score to a trace."""
```

All trace inputs pass through the PII scrubber (Fix 3) before being sent.

### Integration Points

**Pipeline (graphs/insights.py):**
```
node_ingest: open trace("insight-pipeline", {survey_id, org_id, run_id})
each node:   open span(trace, "node_{name}", {input_keys})
             close span with {output_keys, duration}
node_publish: close trace, record overall duration
```

**Crystal (agents/crystal.py):**
```
session start: open trace("crystal", {survey_id, org_id, thread_id})
each ReAct turn: span("react-turn-{n}", {question, tool_calls})
each LLM call:  llm_call(span, model, messages, response, tokens)
session end:     close trace
```

**OpenRouter (lib/openrouter.py):**

Langfuse's `observe()` decorator can wrap `call_agent()` directly. The fire-and-forget `_write_trace_safe()` pattern that currently writes to `ai_operation_logs` is kept — Langfuse flush happens separately on shutdown via `langfuse.flush()` in `lifespan()`.

### No-op Mode

If `LANGFUSE_PUBLIC_KEY` is not set, `Tracer` returns a `NullSpan` context manager that does nothing. Zero overhead in environments where Langfuse isn't configured.

---

## Fix 2: Hallucination Gate (Gap G2)

### Why the Current `_verify()` is Unreliable

`_verify()` in `graphs/insights.py` calls the same LLM (via OpenRouter) to verify its own output. The problem: if the model hallucinated in `node_narrate`, the same model family is unlikely to catch it — it has the same biases and blind spots.

### Cross-Vendor Judge Design

Use Gemini Flash (Google) as the judge. Cross-vendor means: a different model family with different training data, different tendencies, and different failure modes. When Claude hallucinates, Gemini Flash is much more likely to catch it.

**Planned file:** `agents/lib/hallucination_scorer.py`

```python
async def score_hallucination(
    claim: str,
    source_data: dict,
    threshold: float = 0.65,
) -> HallucinationResult:
    """
    Returns:
        HallucinationResult(score=float, passed=bool, reasoning=str)

    Never raises. On any error, returns score=0.75 (neutral pass)
    so production is never blocked by judge unavailability.
    """
```

**Model:** `google/gemini-flash-1.5` via OpenRouter  
**Cost:** ~$0.0001 per verification call  
**Latency:** ~400ms (runs async, doesn't block pipeline completion)  
**Failure mode:** Returns `score=0.75` (neutral) — never blocks production

### Prompt

The scorer sends a structured verification request:

```
Given the following source data:
[source_data as JSON]

Does the following claim accurately represent the data?
[claim]

Return JSON: {"score": float 0-1, "reasoning": "one sentence"}
Score 1.0 = perfectly accurate, 0.0 = complete fabrication.
```

### Integration

Replace `node_verify` in `graphs/insights.py`:
- Current: call LLM with the insight and ask "is this accurate?"
- Target: call `score_hallucination(insight_text, topics_data)` with Gemini Flash
- If `result.score < threshold`: mark insight as `needs_review`, add `hallucination_flag` to publish output
- Score is attached to the Langfuse trace via `tracer.score(trace_id, "hallucination", result.score)`

### Threshold Calibration

Default threshold: 0.65. Below this, the insight is flagged — not blocked. Blocking would hurt availability. Flagging allows the UI to show a "low confidence" indicator while still delivering the insight.

Over time, collect human feedback (Gap G9) to calibrate per-skill thresholds.

---

## Fix 3: PII Scrubber (Gap G3)

### The Risk

`ai_operation_logs` currently stores LLM inputs and outputs. These may contain verbatim survey responses with names, emails, phone numbers. Langfuse traces will have the same exposure. This is a GDPR compliance risk.

### Design

**Planned file:** `agents/lib/pii_scrubber.py`

Reuse `_PII_PATTERNS` from `agents/lib/validators.py` — these are already compiled regex patterns covering names, emails, phone numbers, SSNs, and credit card numbers.

```python
def scrub_for_trace(data: dict | str) -> dict | str:
    """
    Replaces PII matches with [REDACTED:{pii_type}].
    Pure regex — no LLM call. ~0.1ms per call.
    Applied to trace INPUTS only (not LLM inputs — that would corrupt prompts).
    """
```

### What Gets Scrubbed

- Trace inputs logged to Langfuse / `ai_operation_logs`
- NOT the actual LLM prompt (scrubbing prompts would degrade output quality)
- NOT survey verbatims in the DB (those are governed by separate data retention policy)

The scrubber runs in the tracer: `Tracer.span()` calls `scrub_for_trace(input)` before sending to Langfuse. This means PII never leaves the process in traces.

### Audit Log

When the scrubber redacts something, it increments a Prometheus counter:
```
pii_scrub_redactions_total{pii_type="email", source="crystal_input"}
```

This allows detection of PII-heavy inputs without exposing the actual content.

---

## Eval Stack (Gap G9, G10)

### Current Eval Coverage

The pipeline has one eval node: `node_evaluate` in `graphs/insights.py`. It runs an LLM judge inline and writes a score to `insight_records.quality_score`. No persistence of eval details, no trend tracking.

### Target Eval Stack

**Per-execution evals (EVALS.md):**  
Already designed in [skills.md](./skills.md). Every skill execution checks its EVALS.md criteria and scores are logged to Langfuse.

**UI feedback collection (Gap G9):**  
Add thumbs up/down to Crystal responses in the frontend. Each rating is a `tracer.score(trace_id, "user_feedback", 1.0 | 0.0)` call. This is the highest-quality signal — explicit user preference, zero cost per label.

Schema: `crystal_thread_feedback(thread_id, turn_index, rating, org_id, created_at)`

**A/B testing for prompts (Gap G10):**  
When a skill gets a new version, route 10% of traffic to the new version and compare eval scores. The skill runtime reads `SKILL.md` version from a feature flag in Redis:
```
Key: skill_ab_test:{skill_name}
Value: {"control": "1.2.0", "treatment": "1.3.0", "traffic_pct": 10}
```
Langfuse groups traces by version. After 100 samples per variant, auto-select the winner or alert for human review.

**Braintrust for CI:**  
Before deploying a prompt change (SKILL.md minor bump), run the new version against the last 50 EXAMPLES.md entries and assert the aggregate score doesn't regress more than 5%. This runs as a pre-deploy check in CI.

> **G29 — Data Residency:** Braintrust is cloud-only. All eval data (production LLM inputs and outputs) is sent to Braintrust's servers. For enterprise customers with data residency requirements (EU data must stay in EU, government customers require on-prem), this is a hard blocker. **Policy decision required before deploying Braintrust in production.**
>
> Options ranked by implementation cost:
> 1. **Self-hosted Langfuse only** — skip Braintrust, run CI evals directly against local `skill_examples` table using the same EVALS.md criteria the runtime already checks. Zero external data transfer. Lowest fidelity.
> 2. **DeepEval or RAGAS** — open-source eval frameworks that run entirely within the customer environment. Similar criteria-based scoring. Mid-effort migration from Braintrust.
> 3. **Braintrust self-hosted** — not yet GA. Track their roadmap. Easiest migration path if it ships.
>
> Until resolved: do not pipe production eval data to cloud Braintrust for enterprise orgs. Use Langfuse local scores as the CI gate signal instead.

---

---

## Audit Trail for AI Decisions (Gap G26)

### Why It's Required

Enterprise and regulated customers need to answer:
- "Why did Crystal say X?" — GDPR right to explanation (Art. 22)
- "What data was used to generate this insight?" — SOC2 audit trail
- "Was this insight flagged for hallucination?" — compliance review

Without an audit trail these questions are unanswerable. Langfuse traces contain the information, but traces are not customer-accessible and are not linked to business objects.

### Design

**Schema addition:** `reasoning_trace` JSONB column on `insight_records` (pipeline) and `crystal_threads` (Crystal):

```json
{
  "reasoning_trace": {
    "supporting_tool_results": [
      "get_survey_overview: response_count=234, avg_nps=42",
      "get_topic_details:onboarding: volume=89, sentiment=-0.3"
    ],
    "hallucination_score": 0.91,
    "eval_score": 0.87,
    "eval_issues": [],
    "model": "claude-3-5-sonnet",
    "schema_version": 1
  }
}
```

This is NOT the full LangGraph state (too large — up to 100KB). It is the 3–5 decision-relevant fields per insight:

| Field | What it records |
|-------|-----------------|
| `supporting_tool_results` | Which tool calls provided data, with a brief result summary (not full payload) |
| `hallucination_score` | Gemini Flash cross-vendor score from Fix 2 |
| `eval_score` | EVALS.md score for the skill execution |
| `eval_issues` | List of failed eval criteria IDs, if any |
| `model` | Model that generated this output |

### Write Points

**Pipeline:** `node_publish` writes `reasoning_trace` from state at publish time. Includes tool result summaries accumulated in `node_context` + `node_topics`, plus scores from `node_verify` and `node_evaluate`.

**Crystal:** At the end of each turn, `_run_react_loop_streaming` appends a turn-level trace entry to `crystal_threads.reasoning_trace` (array of per-turn records, one per session turn). Includes tool calls made, result summaries, and the eval score.

### Access

New endpoint `GET /api/insights/:id/trace` returns `reasoning_trace` for authorized callers (same auth as insight read, org-admin role required). Not exposed to anonymous users or standard respondents.

The Langfuse trace ID is also stored in `reasoning_trace` so admins can drill into the full distributed trace when the self-hosted Langfuse instance is available.

---

## Observability Gaps Remaining

| Gap | Description | Status |
|-----|-------------|--------|
| G9 | UI thumbs up/down feedback | Not designed — needs frontend work |
| G10 | A/B testing for prompt changes | Design above, not implemented |
| G26 | Audit trail for AI decisions | Design above, not implemented |
| G29 | Braintrust data residency for enterprise | Policy decision needed — see G29 note in Eval Stack section |

---

## Complete Observability Signal Map

After all three fixes:

```
Crystal request
  └─ Langfuse trace: crystal/{org_id}/{session_id}
       ├─ span: memory-load (L1 cache check, L3 facts load)
       ├─ span: react-turn-1
       │    ├─ llm_call: claude-3-5-sonnet, 823 tokens
       │    └─ tool: getTopics, 12ms
       ├─ span: react-turn-2
       │    └─ llm_call: claude-3-5-sonnet, 1102 tokens
       ├─ span: hallucination-check (Gemini Flash)
       │    └─ score: hallucination=0.87
       └─ score: user_feedback=1.0  (if user rates)

Pipeline run
  └─ Langfuse trace: pipeline/{org_id}/{run_id}
       ├─ span: node_ingest, 44ms
       ├─ span: node_context, 230ms
       ├─ span: node_route_specialists, 1.2s
       │    ├─ span: specialist_nps, 890ms
       │    └─ span: specialist_csat, 760ms
       ├─ span: node_narrate, 3.1s
       │    └─ llm_call: claude-3-5-sonnet, 2048 tokens
       ├─ span: node_verify
       │    └─ score: hallucination=0.91
       └─ span: node_publish, 88ms
```

All spans include: `duration_ms`, `org_id`, `survey_id`, `model`, `input_tokens`, `output_tokens`. PII is scrubbed from all inputs before Langfuse export.

The `reasoning_trace` column on `insight_records` / `crystal_threads` stores the business-accessible subset of the trace: tool results, scores, and model. It is the customer-facing audit record; the Langfuse trace is the engineering debugging record. Both point at each other via `trace_id`.
