# Synthetic Panels — Technical Architecture

> **Status:** Pre-design  
> **Date:** 2026-06-26  

This document maps the end-to-end technical architecture for synthetic panels onto
Experient's existing three-layer stack (Frontend → Backend → CrystalOS).

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Frontend (app/)                             │
│   PanelBuilderPage → DemographicTargeting → CreditPreview           │
│   PanelLibraryPage → PanelTemplateCard                              │
│   PanelResultsPage → SegmentComparisonView → Crystal integration    │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ REST
┌──────────────────────────────▼──────────────────────────────────────┐
│                        Backend (backend/)                            │
│   routes/synthetic-panels.ts   agentsClient.triggerSyntheticPanel() │
│   creditPlans.ts (new: synthetic_respondent cost)                   │
│   DB: synthetic_panel_runs, synthetic_respondents, synthetic_responses│
└──────────────────────────────┬──────────────────────────────────────┘
                               │ HTTP (agentsClient)
┌──────────────────────────────▼──────────────────────────────────────┐
│                         CrystalOS (crystalos/)                       │
│   agents/synthetic_panel.py                                          │
│   graphs/synthetic_panel.py  (LangGraph pipeline)                   │
│   tools/persona_engine.py                                            │
│   tools/response_simulator.py                                        │
│   tools/panel_calibration.py                                         │
└─────────────────────────────────────────────────────────────────────┘
```

---

## CrystalOS: The Synthetic Panel Pipeline

### LangGraph Pipeline: `graphs/synthetic_panel.py`

```
START
  │
  ▼
[load_survey]           — fetch survey questions from DB; validate question types
  │
  ▼
[generate_personas]     — instantiate N personas from panel spec (batched)
  │                       output: List[PersonaSpec] with trait vectors
  ▼
[simulate_scale_qs]     — batch-simulate Likert/NPS/choice responses (fast model)
  │                       parallelized: all personas × all scale questions
  ▼
[simulate_openend_qs]   — generate open-ended text responses (capable model)
  │                       parallelized: all personas × open-end questions
  ▼
[validate_consistency]  — cross-check persona trait coherence across responses
  │                       flag outliers; optionally regenerate
  ▼
[calibrate]             — compare distributions to benchmarks; compute confidence bands
  │                       output: per-question confidence scores + divergence flags
  ▼
[aggregate]             — roll up: means, distributions, theme extraction from open-ends
  │
  ▼
[write_results]         — persist to synthetic_responses; update run status
  │
  ▼
END → emit run_complete event
```

### Persona Spec Schema

```python
@dataclass
class PersonaSpec:
    # Demographics
    age: int
    gender: str                    # "male" | "female" | "nonbinary" | ...
    income_bracket: str            # "<35k" | "35-75k" | "75-150k" | ">150k"
    education: str                 # "high_school" | "some_college" | "bachelors" | "graduate"
    geography: dict                # {region, urbanicity, country}
    household_size: int

    # Psychographics (values + lifestyle)
    values: list[str]              # ["family", "security", "achievement", ...]
    political_lean: float          # -1.0 (liberal) to 1.0 (conservative), 0=moderate
    tech_savviness: float          # 0.0 to 1.0
    environmental_concern: float   # 0.0 to 1.0

    # Behavioral
    purchase_drivers: list[str]    # ["price", "brand_trust", "convenience", ...]
    brand_loyalty: float           # 0.0 (switcher) to 1.0 (loyal)
    media_habits: list[str]        # ["social_media_heavy", "news_reader", ...]

    # Response style (voice calibration)
    response_length: str           # "terse" | "moderate" | "verbose"
    hedging_tendency: float        # 0.0 to 1.0 (how often they say "maybe" / "kind of")
    acquiescence_bias: float       # 0.0 to 1.0 (tendency to agree)
    satisficing: float             # 0.0 to 1.0 (tendency to give "good enough" answers)
```

### Calibration Layer: `tools/panel_calibration.py`

The calibration tool compares synthetic response distributions to:

1. **Internal real-data baseline** — if the org has real Experient responses on the
   same or similar questions, compare distributions automatically
2. **External benchmark corpus** — Pew, Gallup, industry CSAT benchmarks stored in
   a calibration table; matched by question type + segment
3. **Statistical plausibility checks** — flag distributions that are statistically
   implausible (e.g., >90% "very satisfied" on any sentiment question)

Output per question:
```json
{
  "question_id": "q_123",
  "confidence": 0.82,
  "confidence_label": "high",
  "divergence_from_benchmark": 0.12,
  "flags": [],
  "distribution": {
    "1": 0.04, "2": 0.08, "3": 0.21, "4": 0.38, "5": 0.29
  }
}
```

---

## Database Schema (new migrations)

### `synthetic_panel_templates`
```sql
CREATE TABLE synthetic_panel_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      TEXT,                        -- NULL = global template
  name        TEXT NOT NULL,
  description TEXT,
  persona_spec JSONB NOT NULL,             -- default PersonaSpec parameters
  sample_size_default INT DEFAULT 500,
  is_public   BOOLEAN DEFAULT FALSE,
  created_by  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

### `synthetic_panel_runs`
```sql
CREATE TABLE synthetic_panel_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          TEXT NOT NULL,
  survey_id       UUID REFERENCES surveys(id),
  run_id          UUID REFERENCES agent_runs(id),  -- links to existing pipeline tracking
  template_id     UUID REFERENCES synthetic_panel_templates(id),
  custom_spec     JSONB,                  -- overrides on top of template
  sample_size     INT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',  -- pending|running|complete|failed
  credit_cost     INT NOT NULL,
  label           TEXT,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### `synthetic_respondents`
```sql
CREATE TABLE synthetic_respondents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id       UUID NOT NULL REFERENCES synthetic_panel_runs(id) ON DELETE CASCADE,
  persona_spec JSONB NOT NULL,
  persona_embedding vector(1536),         -- for similarity / consistency checks
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
```

### `synthetic_responses`
```sql
CREATE TABLE synthetic_responses (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id           UUID NOT NULL REFERENCES synthetic_panel_runs(id) ON DELETE CASCADE,
  respondent_id    UUID NOT NULL REFERENCES synthetic_respondents(id) ON DELETE CASCADE,
  question_id      TEXT NOT NULL,
  question_type    TEXT NOT NULL,         -- likert|nps|choice|open_end|ranking
  numeric_value    NUMERIC,
  text_value       TEXT,
  choice_values    JSONB,                 -- for multi-select / ranking
  confidence_score NUMERIC,              -- 0.0 to 1.0
  generated_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON synthetic_responses (run_id, question_id);
```

### `synthetic_calibrations`
```sql
CREATE TABLE synthetic_calibrations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            TEXT NOT NULL,
  survey_id         UUID REFERENCES surveys(id),
  synthetic_run_id  UUID REFERENCES synthetic_panel_runs(id),
  real_data_source  TEXT,               -- "internal" | "external_benchmark" | "user_provided"
  divergence_score  NUMERIC,            -- 0.0 (perfect match) to 1.0 (completely divergent)
  divergence_detail JSONB,              -- per-question divergence breakdown
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Backend API Routes

### `routes/synthetic-panels.ts`

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/panels/templates` | List global + org panel templates |
| `POST` | `/api/panels/templates` | Create custom panel template |
| `POST` | `/api/panels/preview` | Cost preview (no debit) — returns `{estimated_cost, sample_size}` |
| `POST` | `/api/panels/runs` | Launch panel run — debit credits, trigger CrystalOS |
| `GET` | `/api/panels/runs` | List org's panel runs (by survey or all) |
| `GET` | `/api/panels/runs/:runId` | Run status + aggregated results |
| `GET` | `/api/panels/runs/:runId/responses` | Raw synthetic responses (paginated) |
| `GET` | `/api/panels/runs/:runId/calibration` | Calibration report for the run |
| `GET` | `/api/panels/compare?runIds=a,b` | Side-by-side comparison of two runs |

### Credit Cost

Add to `creditPlans.ts`:
```typescript
synthetic_respondent_scale:  envInt('CREDIT_COST_SYNTHETIC_SCALE', 5),   // per respondent, scale-only survey
synthetic_respondent_full:   envInt('CREDIT_COST_SYNTHETIC_FULL', 20),   // per respondent, includes open-ends
```

A 500-person full survey = 10,000 credits = $100 at list price.
This is dramatically cheaper than a real panel ($1,500–4,000 for 500 completes).

---

## Frontend Pages

### `PanelBuilderPage.tsx` — 3-step wizard

```
Step 1: Choose your survey
  - Select from existing surveys or create inline
  - Shows question count, estimated run time

Step 2: Define your audience
  - Template picker (cards) OR custom targeting
  - Demographic sliders: age range, gender split, income, education, geography
  - Psychographic checkboxes: values, tech level, political lean
  - Sample size selector (50 / 250 / 500 / 1000 / custom)
  - Live "panel composition" breakdown chart updates as you adjust

Step 3: Preview + launch
  - Cost preview card: "This run will cost 2,500 credits ($25)"
  - Credit balance check + upgrade prompt if insufficient
  - Label field (optional name for this run)
  - [Run Panel] CTA → redirects to PanelResultsPage (live progress)
```

### `PanelResultsPage.tsx`

```
Header: Panel name, run date, sample size, status badge
  [crystal] button → open Crystal on this panel's results

Tabs:
  Overview       — key metrics: distribution summaries for all questions
  Open-Ends      — theme extraction from qualitative responses
  By Segment     — break results by demographic subgroup (age / income / geo)
  Calibration    — confidence scores per question, divergence flags
  Raw Data       — respondent-level table (export to CSV)

Confidence band shown on every question chart:
  ████████░░  82% confidence  ← color-coded (green >80%, yellow 60-80%, red <60%)

At bottom: auto-generated methodology disclosure (expandable)
```

---

## Phased Build Plan

### Phase SP-1: Core Pipeline (4–5 weeks)
- CrystalOS: persona_engine, response_simulator, basic calibration
- Backend: routes, DB migrations, credit metering
- Frontend: basic PanelBuilderPage (no templates, no comparison)
- Goal: 500-respondent scale-only survey in <90 seconds, credited correctly

### Phase SP-2: Quality + Trust (2–3 weeks)
- Full calibration layer with confidence scoring
- Open-ended response generation
- Methodology disclosure auto-generation
- Confidence badges in results UI

### Phase SP-3: Self-Serve Polish (2–3 weeks)
- Panel templates (5–7 curated)
- Segment comparison view (side-by-side)
- Panel library (save + reuse specs)
- Crystal integration on results (one-click)
- Export to PDF with methodology slide

### Phase SP-4: Enterprise + Differentiators (4–6 weeks)
- Longitudinal panels (recurring runs, trend view)
- Hybrid real + synthetic blending
- Custom persona calibration (org uploads their segments)
- Adversarial mode (simulate resistant segment)
- Marketplace: share/purchase panel templates

---

## Model Selection (Cost vs. Quality)

| Task | Model | Rationale |
|---|---|---|
| Persona generation | Claude Sonnet | Nuanced trait specification |
| Scale/NPS responses | Haiku 4.5 | High volume, fast, cheap |
| Open-ended text | Claude Sonnet | Quality + voice fidelity |
| Calibration reasoning | Claude Sonnet | Analytical judgment required |
| Theme extraction | Claude Sonnet | Existing Crystal capability |

Estimated cost per 500-respondent, 15-question survey (10 scale + 5 open-end):
- Persona generation: ~$0.05
- 5,000 scale responses (Haiku): ~$0.08
- 2,500 open-end responses (Sonnet): ~$2.50
- Calibration + aggregation: ~$0.15
- **Total compute: ~$2.80** → maps to ~280–500 credits (healthy margin)

---

## Non-Negotiable Quality Standards

1. Every synthetic run must display a confidence band for each question — no exceptions
2. Every export must include a methodology disclosure section — no raw synthetic data
   exports without it
3. Responses must be clamped to valid ranges (Likert 1–5, NPS 0–10, etc.)
4. Synthetic data must be visually distinguished from real data everywhere in the UI
5. Credit cost must be previewed and confirmed before any run executes
