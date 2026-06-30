# Examples: metric-parity

<!-- Hand-authored seed examples. The skill runtime appends high-scoring runs below. -->

## Good Example

**Input**

```json
{
  "survey_id": "sv_123",
  "metric": "csat",
  "source_reported": 4.31,
  "prism_computed": 4.30,
  "response_window": {"start": "2026-04-01", "end": "2026-06-30"},
  "method_context": {
    "source_method": "CSAT mean, 1-5, partials unknown",
    "prism_method": "CSAT mean, 1-5, exclude partials, banker's rounding"
  },
  "response_evidence": {
    "n_total": 812,
    "n_partials": 0,
    "score_distribution": {"1": 12, "2": 28, "3": 96, "4": 280, "5": 396},
    "sample_response_ids": ["r_a1", "r_b2", "r_c3"]
  }
}
```

**Expected Output**

```json
{
  "explanation": "Prism's mean over all 812 complete responses is 4.30; the source reports 4.31. With no partial responses in the window the population is identical, so the 0.01 gap is a rounding artefact: the source rounds half-up while Prism applies banker's rounding to the same 4.304 raw mean.",
  "hypothesis": {
    "cause": "rounding",
    "detail": "Raw mean 4.304 → source half-up gives 4.31, Prism banker's rounding gives 4.30; same underlying data.",
    "closes_gap": true
  },
  "recommended_method": "match_source",
  "recommendation_rationale": "Adopting half-up rounding reproduces 4.31 exactly and keeps the board's CSAT trend line continuous at cutover; the underlying data is identical.",
  "parity_ledger": {
    "metric": "csat",
    "source_reported": 4.31,
    "prism_computed": 4.30,
    "method": "CSAT mean, 1-5, exclude partials, half_up rounding",
    "variance": 0.01,
    "explanation": "Identical 812-response population (no partials); 0.01 delta is rounding mode only — source half-up vs Prism banker's on raw mean 4.304."
  },
  "citations": ["n_total=812", "n_partials=0", "r_a1", "r_b2", "r_c3"]
}
```

Why it's good: it names a concrete cause (rounding mode on raw mean 4.304), every figure traces to
`response_evidence` (812 total, 0 partials, the distribution), `closes_gap` is verifiable,
`recommended_method` is `match_source` with a trend-line justification, the `parity_ledger` carries
all six fields, and citations reference real counts/ids.

## Bad Example

**Same input as above.**

**Bad Output**

```json
{
  "explanation": "The two numbers are slightly different. Prism's calculation is more accurate.",
  "hypothesis": {"cause": "scale", "detail": "different scales", "closes_gap": false},
  "recommended_method": "rebaseline",
  "recommendation_rationale": "Ours is better.",
  "parity_ledger": {
    "metric": "csat",
    "source_reported": 4.31,
    "prism_computed": 4.30,
    "explanation": "numbers differ"
  },
  "citations": ["about 1000 responses were dropped for being low quality"]
}
```

Why it's bad: the explanation hand-waves ("numbers are slightly different") with no checkable cause
(E2 fail); the `cause` is `scale` when both are 1-5 — and it doesn't close the gap; it recommends
`rebaseline` with no real justification, needlessly breaking the trend line on a 0.01 rounding gap
(E4 weak); the `parity_ledger` is **missing `method` and `variance`** (E5 fail); and the citation
invents "~1000 responses dropped" that does not exist in `response_evidence` (E3 fail).
