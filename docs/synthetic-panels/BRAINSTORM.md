# Synthetic Panels — Multi-Persona Brainstorm

> **Format:** Four expert perspectives on what an industry-leading solution requires.  
> Each perspective surfaces needs, gaps, and non-obvious requirements.

---

## Perspective 1 — The XM Scientist

*"I've run thousands of research studies. I know where synthetic goes wrong."*

### What I Care About

Real research panels have decades of methodology behind them — quota sampling, response
distribution theory, attitudinal consistency, satisficing behavior. If synthetic panels
ignore all of this and just prompt GPT to "pretend to be a 35-year-old in Ohio," the
outputs are garbage dressed up in confidence. Here's what makes me trust a synthetic panel:

### Requirements From This Lens

**Calibration is table stakes.**
Every synthetic response should be benchmarked against known real-world distributions
where available. If I ask "How satisfied are you with your bank?" and 95% of synthetic
respondents say "Very satisfied," that's a red flag — real distributions rarely look
like that. The system must detect and flag distributional implausibility.

**Realistic response variance, not idealized means.**
Real people show variance. They satisfice (give "good enough" answers), they have
acquiescence bias (skew toward agreement), they have social desirability bias
(give the "right" answer on sensitive topics). Synthetic personas need to simulate
this realistically — not be idealized rational agents.

**Persona coherence across questions.**
A persona who says she's "very price-sensitive" should not rate a premium product
"extremely likely to purchase" two questions later. Personas need a trait vector
that stays consistent throughout the survey. This is a hard AI engineering problem.

**Open-ended responses that feel real.**
Qual data is where the real insights live. Synthetic open-ends need:
- Appropriate vocabulary and register for the persona (a retired teacher does not
  write like a 22-year-old TikTok creator)
- Realistic length variation (not every response is 3 sentences)
- Occasional misspellings, hedging language, colloquial phrasing
- NOT corporate buzzword salads

**Confidence banding per question.**
The system should output not just a mean score but a confidence range for each
metric. Questions where persona-type uncertainty is high (e.g., asking a synthetic
rural retiree about NFT adoption) should have wider bands and explicit warnings.

**Divergence detection.**
For clients who have real survey data in Experient, the system should automatically
compare synthetic distributions to real distributions and surface divergences.
"Synthetic says 72% would recommend; your real NPS data says 34% — investigate."

**Methodology transparency auto-generated for every run.**
Every synthetic panel result should auto-append a methodology disclosure:
- Model used, persona generation approach, calibration baseline, confidence level
- Recommended human validation steps before using for high-stakes decisions
- Explicit "this is synthetic data" watermark in all exports

**What's currently missing:**
- No calibration layer anywhere in the system
- No real-world benchmark dataset to calibrate against (needs to be sourced or built)
- No persona trait consistency enforcement mechanism
- No confidence interval computation on simulated responses
- No divergence detection vs. real Experient survey data

---

## Perspective 2 — The Product Owner

*"I ship features that get adopted. My lens is on self-serve, simplicity, and the jobs that matter."*

### The Core Jobs To Be Done

1. **Concept testing in an afternoon** — "I have 3 product names. Which lands best with my segment?"
2. **Survey pre-validation** — "Is my survey instrument working before I spend $40k on real fieldwork?"
3. **Segmentation exploration** — "How does Gen Z differ from Boomers on this topic?"
4. **Continuous tracking without continuous cost** — "Run this panel every quarter — I want trend lines."
5. **Hard-to-reach segments** — "I need CXOs at healthcare orgs. I can't recruit them. Synthesize."

### Self-Serve UX Requirements

**Three-step wizard — not more.**
1. Define your audience (demographic + psychographic targeting)
2. Choose your survey (existing survey or new)
3. Preview cost + launch

The panel builder must be drag-and-drop demographic targeting — not a JSON config
form. Visualize the panel composition with a simple breakdown chart before running.

**Credit cost preview before every run.**
Because we already have a credit system, the UX must show "This panel costs 240 credits"
with a breakdown per respondent — before the user commits. No surprise bills.

**Templates that make the first run trivial.**
Pre-built panel templates for the most common use cases:
- US General Consumer (1,000 respondents, balanced demographics)
- B2B Decision Makers (250 respondents, manager+, company size 50-5000)
- Gen Z Digital Natives (500 respondents, 18-27, mobile-first behaviors)
- Healthcare Patients (500 respondents, chronic condition awareness, US)
- Enterprise IT Buyers (200 respondents, IT/engineering, company size 1000+)
- Custom Segment (bring your own)

**Instant results — under 90 seconds for 500 respondents.**
The UX should feel instant. Progress indicator showing personas being generated
and questions being answered in real time. Not a "check back in 10 minutes" flow.

**Segment comparison as a first-class feature.**
Side-by-side comparison of two or more panels on the same survey is one of the
highest-value use cases. "Gen Z vs. Millennials on this concept." Build it into
the results view, not as an afterthought.

**Integration with Crystal.**
After a synthetic panel runs, Crystal should be available to analyze it immediately.
"What are the top themes in the open-ended responses?" — same Crystal experience
customers already know.

**Export with disclosure.**
Export to PDF/PPTX with auto-generated methodology slide. One click, fully formatted.
This is what customers bring to stakeholders.

### What We're Missing (Product Gaps)

| Gap | Priority | Notes |
|---|---|---|
| Panel Builder UI | P0 | Core new page — doesn't exist |
| Panel Library (saved segments) | P1 | Save + reuse your team's custom segments |
| Panel Templates | P1 | 5-7 curated starting points |
| Segment Comparison View | P1 | Side-by-side results across panels |
| Credit cost preview | P0 | Extension of existing credit UI |
| Synthetic badge in survey results | P0 | Distinguish synthetic from real responses |
| Crystal integration with synthetic runs | P1 | Should be automatic — just another insight corpus |
| Longitudinal panel (recurring runs) | P2 | "Run this panel every 30 days" |
| Real vs. synthetic blending UI | P2 | Show real + synthetic distributions together |
| Methodology disclosure export | P0 | Legal/trust requirement |

---

## Perspective 3 — The Customer

*"I run the CX program at a 600-person SaaS company. My research budget is $15k/year."*

### My Reality

I can't afford a Qualtrics Research Core contract. Real panels from Lucid or Dynata
cost $3–8 per completed response at my scale — a 500-person concept test costs $4,000
and takes 3 weeks to field. My VP wants answers by Thursday. I live in spreadsheets
and PowerPoint. I need results I can explain to a skeptical CFO.

### What Would Make Me Love This

**"Just work" for the question I actually have.**
I don't want to configure a research methodology. I want to say:
"How would mid-market SaaS buyers react to a 20% price increase framed as an
'AI-enhanced tier'?" and get a usable answer today.

**Results I can explain to non-researchers.**
Give me a summary that says "74% of your target segment would accept this framing,
but price-sensitive buyers (28% of segment) show high churn risk — focus retention
messaging there." Not just a bar chart.

**Tell me when to trust it and when not to.**
I actually want the system to say "This result has low confidence because the segment
is very narrow — consider validating with 50 real respondents." That honesty builds
trust, not erodes it. I can use that in my stakeholder meeting.

**Make the output presentation-ready.**
Auto-generate a slide deck with key findings, methodology note, and caveats.
I will literally paste this into my leadership deck. This is table stakes.

**Let me run it again after I change the messaging.**
Iterate quickly. I should be able to tweak my survey question wording and rerun
against the same synthetic panel in 30 seconds to see how the number changes.

**Don't make me talk to sales.**
Every competitor requires a demo call, a proposal, and a 6-month contract.
I want to sign up, put in my credit card, and run my first panel in 15 minutes.

### Customer Fears (That We Must Address)

| Fear | How to Mitigate |
|---|---|
| "Is this made up?" | Confidence scores + calibration badges + honest methodology |
| "Can I show this to my CMO?" | Professional export with disclosure auto-included |
| "What if it's just telling me what I want to hear?" | Bias detection + adversarial probing mode |
| "Is this compliant with our research policies?" | GDPR-clean (no real PII), SOC2-aligned, IRB-exempt by design |
| "Am I wasting credits?" | Preview before running; cost-per-insight estimate |

---

## Perspective 4 — The AI Engineer

*"I have to build this. Here's what the architecture actually requires."*

### The Hard Problems

**1. Persona instantiation that is statistically consistent.**
A persona isn't a static prompt. It's a vector of trait dimensions that must stay
coherent across 20+ questions in a survey. We need to:
- Represent each persona as a structured attribute object (not a paragraph of prose)
- Store that attribute object in a vector space so we can enforce consistency
- Use it as a conditioning vector on every question response generation call

The naive approach (prompt: "You are a 42-year-old female elementary school teacher
in rural Iowa. Answer this question...") fails on long surveys because the LLM doesn't
maintain coherent trait expression across calls. We need stateful personas.

Proposed architecture:
```
PersonaSpec:
  demographics: {age, gender, income_bracket, education, geography, hh_size}
  psychographics: {values[], lifestyle_stage, political_lean, tech_savviness}
  behavioral: {purchase_drivers[], brand_affinities[], media_habits[]}
  voice: {vocabulary_level, response_length_pref, hedging_tendency}
```

**2. Question-type-aware response generation.**
Different question types need different generation strategies:
- **Likert/scale**: Generate a score from a calibrated distribution for the persona,
  not just the midpoint
- **Multiple choice**: Select from options with realistic choice probability
- **Open-ended**: Generate text with appropriate voice, length, and sentiment
- **Net Promoter Score**: Score calibrated against typical distributions for the segment
- **Ranking**: Generate ranking with internally consistent logic

**3. Calibration against real distributions.**
We need a calibration layer that compares synthetic response distributions to:
a) Internal real data (Experient surveys where we have ground truth)
b) External benchmarks (publicly available survey benchmarks — Pew, Gallup, etc.)
c) Our own growing "calibration corpus" of real vs. synthetic comparisons

Over time, each synthetic run that gets "validated" (user runs both synthetic and
real on same survey) becomes a calibration data point. This is a flywheel.

**4. Scale: 500–2000 respondents in <90 seconds.**
With LLM API latency, 500 respondents × 15 questions = 7,500 API calls naively.
This is too slow. Architecture must be:
- Batch by question, not by respondent
- Run question batches in parallel (async LangGraph nodes)
- Cache shared context (survey definition, question text) across personas
- Use a faster model for simple scale questions; reserve capable model for open-ends

Rough target: ~200ms per question × 15 questions = 3 seconds wall-clock for
500 respondents if we batch and parallelize correctly.

**5. The calibration database (new schema needed).**
```sql
-- Persona archetypes (canonical segment definitions)
synthetic_panel_templates
  id, name, description, persona_spec JSONB, sample_size_default, created_by

-- Panel runs
synthetic_panel_runs
  id, org_id, survey_id, panel_template_id, custom_spec JSONB,
  sample_size, status, credit_cost, run_id, created_at, completed_at

-- Generated personas (one row per "respondent")
synthetic_respondents
  id, run_id, persona_spec JSONB, persona_embedding vector(1536)

-- Simulated responses (one row per respondent × question)
synthetic_responses
  id, run_id, respondent_id, question_id, question_type,
  numeric_value, text_value, choice_values JSONB,
  confidence_score, generated_at

-- Calibration records (ground-truth comparisons)
synthetic_calibrations
  id, org_id, survey_id, synthetic_run_id, real_run_baseline,
  divergence_score, divergence_details JSONB, created_at
```

**6. The CrystalOS pipeline extension.**
A new skill: `synthetic_panel_skill`:
- Input: panel spec + survey definition
- Phase 1 (Persona Generation): instantiate N personas from spec
- Phase 2 (Response Simulation): for each question, batch-simulate responses across all personas
- Phase 3 (Calibration Check): flag distributional anomalies
- Phase 4 (Aggregate): roll up to summary statistics + theme extraction
- Output: structured response dataset + confidence scores + methodology report

This plugs into the same `agent_runs` / `insight_pipeline` infrastructure we
already have — it is just another skill the Crystal runtime can invoke.

**7. Anti-hallucination safeguards.**
LLMs can generate confident-sounding nonsense. We need:
- Numeric clamping (Likert responses must stay in [1, N] range)
- Choice validation (selected choices must be valid options from the question)
- Consistency checking (flag respondents whose responses are internally contradictory)
- Refusal detection (if the LLM refuses to simulate a persona, handle gracefully)

**8. Model selection strategy.**
- Persona generation: Claude Sonnet (nuanced persona spec)
- Scale/choice responses: GPT-4o-mini or Haiku (fast + cheap; high volume)
- Open-ended text generation: Claude Sonnet (quality matters for qual)
- Calibration analysis: Claude Sonnet (reasoning required)

Total estimated cost per 500-respondent run on a 15-question survey:
- ~7,500 small-model calls for scale questions: ~$0.10–0.20
- ~2,500 large-model calls for open-ends: ~$1.50–3.00
- Total: $1.70–3.20 per run → maps to ~170–320 credits at our credit pricing

---

## Cross-Cutting Requirements (All Perspectives Agree)

### Industry-Leading Differentiation

These are the bets that separate Experient from every competitor:

**1. Calibration-first, not simulation-first.**
Every competitor just generates responses. We generate + validate + score confidence.
We are the only product that tells you "here's how reliable this simulation is."

**2. Crystal-native analysis.**
After a synthetic panel runs, Crystal immediately analyzes it. You can ask:
"What are the top barriers my Gen Z segment mentions?" No export, no manual analysis.
This is the XM insight loop that no panel tool has.

**3. Longitudinal synthetic panels.**
Run the same panel spec every 30/60/90 days. Track how sentiment shifts for a
simulated segment over time. Call it "Continuous Audience Intelligence." No one
has this as a self-serve feature.

**4. Pre-survey validation mode.**
Run a quick synthetic panel (50 respondents) specifically to check if your survey
questions are clear, unbiased, and producing the variance you expect. Flag ambiguous
questions before you spend real money on real respondents. Unique positioning.

**5. Hybrid real + synthetic.**
Blend your real Experient survey responses with a synthetic extension panel.
"I have 45 real responses from enterprise buyers. Add 200 synthetic SMB buyer
responses for comparison." Show both distributions together, clearly labeled.
No one does this. It is genuinely new.

**6. Persona calibration from your own data.**
For enterprise customers: upload your CRM segment definitions or customer persona
docs. The system calibrates synthetic personas against your actual customer data
profiles. Suddenly "simulate my Tier 1 accounts" becomes possible. Differentiated.

**7. Adversarial probing mode.**
Give me the hardest-to-convince version of my target segment. "Show me the
responses from the 20% of this segment most resistant to my value proposition."
This is the hidden insight — who won't buy, and why.

---

## What We Are Missing Today (Gap Summary)

### CrystalOS (crystalos/)
- [ ] `agents/synthetic_panel.py` — panel execution agent
- [ ] `tools/persona_engine.py` — persona instantiation and trait management
- [ ] `tools/response_simulator.py` — question-type-aware response generation
- [ ] `tools/panel_calibration.py` — distribution validation and confidence scoring
- [ ] `graphs/synthetic_panel.py` — LangGraph pipeline: generate → simulate → calibrate → aggregate
- [ ] `lib/persona_store.py` — persona consistency via pgvector embeddings

### Backend (backend/src/)
- [ ] `routes/synthetic-panels.ts` — panel CRUD, run trigger, results retrieval
- [ ] `creditPlans.ts`: new metered action `synthetic_respondent` (per-respondent cost)
- [ ] `agentsClient.ts`: `triggerSyntheticPanel()` + polling helpers
- [ ] Database migrations (see Architecture doc)

### Frontend (app/src/)
- [ ] `pages/panels/PanelBuilderPage.tsx` — 3-step wizard
- [ ] `pages/panels/PanelLibraryPage.tsx` — saved panel specs + run history
- [ ] `pages/panels/PanelResultsPage.tsx` — results dashboard with Crystal integration
- [ ] `components/panels/DemographicTargeting.tsx` — drag-and-drop audience builder
- [ ] `components/panels/PanelTemplateCard.tsx` — template selection step
- [ ] `components/panels/SegmentComparisonView.tsx` — side-by-side panel results
- [ ] `components/panels/ConfidenceBadge.tsx` — per-question confidence indicator
- [ ] Synthetic response badge in existing survey results view

### Database (supabase/migrations/)
- [ ] `synthetic_panel_templates` table
- [ ] `synthetic_panel_runs` table
- [ ] `synthetic_respondents` table
- [ ] `synthetic_responses` table
- [ ] `synthetic_calibrations` table

### Calibration Data
- [ ] Public benchmark dataset (Pew, Gallup, CSAT industry benchmarks) — sourced and stored
- [ ] Internal calibration corpus (track real vs. synthetic comparisons over time)

---

## Open Questions

1. **Trust floor:** At what point do we allow synthetic results to inform
   high-stakes decisions? Do we build guardrails (e.g., "minimum 100 real responses
   before enabling this feature")? Or is that the customer's call?

2. **Persona intellectual property:** Who owns a saved panel spec? Can orgs sell
   or share their calibrated persona libraries? Is there a marketplace play here?

3. **Regulatory exposure:** Are synthetic panels subject to any research ethics
   regulations? Probably not (no real human subjects), but legal should review.

4. **Calibration data sourcing:** Building a calibration corpus requires real panel
   data. Do we license from Pew/Gallup? Partner with a real panel provider? Build
   our own via user studies?

5. **Longitudinal drift:** Synthetic personas based on LLM training data will drift
   as the world changes (new events, cultural shifts). How do we keep them current?
   Is this a model update problem or a calibration problem?

6. **Pricing:** Per-respondent credits is the right model. But what's the right
   cost? $0.05/respondent (5 credits) is probably right for scale questions;
   $0.20/respondent (20 credits) for full open-ended surveys. Validate with actual
   compute costs before shipping.
