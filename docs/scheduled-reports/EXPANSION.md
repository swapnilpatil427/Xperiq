# Intelligence Briefings — Future Expansion (2027–2028)

> **Feature:** Scheduled Intelligence Reports ("Intelligence Briefings")
> **Horizon:** 2027–2028 — Next-generation capabilities
> **Updated:** 2026-06-29

---

## Overview

The seven expansions below represent what Intelligence Briefings look like when the current
foundation matures. Each is written as a concrete product and technical specification, not a
vision slide. Every expansion assumes the v1 foundation (Phases 1–5) is stable and instrumented.

The ordering is deliberate: expansions 1–3 are evolutionary (extend what exists), 4–5 are
platform bets (require new infrastructure or partnerships), and 6–7 are quality-of-life upgrades
that compound adoption.

---

## Expansion 1 — Living Reports

### What It Is

A "living briefing" is a URL that always reflects the current state of the data — not a snapshot
frozen at generation time. Share it with the CEO and they always see today's signal, not last
Monday's artifact. The scheduled email continues to exist, but it contains a link to the living
version instead of (or alongside) the full email rendering.

The email subject still says "Your Weekly NPS Digest — Week of Jun 23." But at the bottom: "View
the live version of this briefing for up-to-the-minute data." That link opens a page that Crystal
re-renders on every visit, using cached metrics (TTL: 15 minutes for daily cadence, 1 hour for
weekly) so performance is acceptable.

### How It Differs from the Current Design

Today: one artifact per run, frozen at generation time, expires in 90 days.
Living report: a persistent URL per `scheduled_report`, no expiry, re-evaluated on each load.

The living report does not replace scheduled generation. It is a complementary view that derives
its content from the same metric computation pipeline but re-runs on demand. Crystal's narrative
is re-generated or served from cache — the user sees a freshness indicator: "Crystal's narrative
last updated 23 minutes ago."

### Technical Design

**New fields on `scheduled_reports`:**
```sql
ALTER TABLE scheduled_reports ADD COLUMN living_report_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE scheduled_reports ADD COLUMN living_report_slug TEXT UNIQUE;
-- slug determines the stable URL: /live/:slug
```

**New route:** `GET /reports/live/:slug` — unauthenticated for view-only access (token-gated via
the same `report_shares` mechanism from SEC-007 in SECURITY_REVIEW.md). The backend checks the
Redis metric cache:
- Cache hit: render from cached `ReportMetricPayload` (no LLM call)
- Cache miss: enqueue a fast (non-LLM) render using pre-computed metrics, return a loading state
- Crystal narrative refresh: re-generated at most once per `cadence` period, not on every page load.
  The living report shows the narrative from the most recent full generation with a freshness
  timestamp.

**CrystalOS changes:**
- `render_html` node gains a `live_mode: bool` parameter. When true: omit the "Moments That
  Mattered" verbatim quotes section (PII risk in unauthenticated view), use cached metrics only.
- Add a `crystalos/graphs/living_report_refresh.py` lightweight graph: runs only
  `assemble_scope` → `compute_metrics` → `render_html` (no LLM nodes). P95 target: < 2 seconds.

**Data requirements:**
- The Redis metric cache must be warm for living reports to perform. Cache warming is tied to the
  scheduled report tick: after each scheduled run, the metric cache is refreshed for 24 hours.
- For unauthenticated living reports, `highlights` (verbatim quotes) are excluded. PII never
  appears in unauthenticated views.

**Timeline:** Q3 2027. Requires: stable metric cache layer (from OPS-010 fix in OPS_REVIEW.md),
`report_shares` table (from SEC-007 fix), living_report_refresh graph.

---

## Expansion 2 — Briefing Conversations

### What It Is

The email contains a "Reply to Crystal" button. Clicking it opens a Crystal chat thread
pre-loaded with the full report context: the metric payload, the narrative, the topics, and the
prior conversation history for this report's cadence. The executive can ask: "Why did NPS drop in
the Mobile segment?" and Crystal responds with a live analysis — not a canned answer, but a
genuine follow-up using the report's data as context.

This closes the last mile of the briefing experience. Today, a CX leader reads the briefing and
then has to open the dashboard, navigate to the right survey, and start a Crystal conversation
from scratch. Briefing Conversations eliminate that friction.

### Technical Design

**Email change:** The footer gains a "Continue with Crystal" CTA button. The URL is:
`/crystal?context=report:{report_run_id}`. This is a deep link into the Crystal chat interface
with a pre-loaded context payload.

**Context pre-loading in Crystal:**
When Crystal opens with `context=report:{run_id}`, the chat interface loads the `report_artifact`
for that run and injects the following system context into the conversation:

```python
# crystalos/skills/generate_report/context_loader.py

REPORT_CONTEXT_PREAMBLE = """
You are Crystal, continuing a conversation about an Intelligence Briefing.
The user has just reviewed their {template_name} for {scope_label} covering {date_range}.

Report summary:
- NPS: {nps_current} ({nps_delta:+d} pts vs prior period)
- Key themes: {top_topics_summary}
- Crystal's assessment: {narrative_first_sentence}

The full metric payload is attached below. Answer the user's questions using this data.
Do not hallucinate metrics — only reference values present in the payload.
"""
```

This system context is injected as a `system` message in the LangGraph conversation state,
followed by the full `metric_payload` as a tool result.

**Conversation threading:**
Each report run gains a `conversation_id TEXT` field (referencing CrystalOS conversation
storage). Conversations persist for 30 days (matching the artifact TTL). A user can return to the
conversation from the report's web view page.

**Deep link security:**
The deep link `?context=report:{run_id}` requires authentication. A non-member cannot use a
run_id to access org data through the Crystal chat interface — the backend validates
`report_run.org_id = req.orgId` before loading context.

**CrystalOS changes:**
- New route handler in CrystalOS: `POST /conversations/report-context` — accepts `run_id`,
  loads artifact, builds the context preamble, returns an initial Crystal response: "I've reviewed
  your [Report Name]. What would you like to explore?"
- The existing Crystal conversation graph is reused. The report context is injected as a
  persistent system prompt that persists across turns in this conversation.

**Data requirements:**
- `report_artifacts.metric_payload JSONB` must remain populated (it already is per the current
  architecture) so Crystal can reference exact numbers.
- The conversation system needs to support "seeded" conversations (pre-populated context) —
  a minor extension to the existing Crystal conversation state.

**Timeline:** Q4 2027. Requires: Crystal conversation threading (if not already built), report
context loader, deep link auth flow.

---

## Expansion 3 — Predictive Briefings

### What It Is

Crystal's briefings stop being purely retrospective. The Weekly NPS Digest gains a "Where We're
Headed" section: "Based on current trajectory and the resolution of the checkout friction issue
reported by 23 detractors this week, your Mobile App NPS is likely to reach +50 within 6 weeks."
The brief is not just what happened — it is what will happen, with conditional predictions tied
to observable factors.

This is not a naive trend line. Crystal uses: (1) historical NPS trend data, (2) identified
detractor themes with velocity (growing vs. shrinking), (3) known action items from prior
Crystal recommendations that have or haven't been actioned, and (4) external signals if
available (product release notes, support ticket volume).

### Technical Design

**New section type:** `prediction` — added to `SectionDef` type. Optional section, not included
in v1 templates by default. Users opt in per report.

**New CrystalOS graph node:** `generate_predictions`

```python
class PredictionOutput(BaseModel):
    predictions: list[Prediction]

class Prediction(BaseModel):
    metric: str          # e.g., "nps_score"
    horizon_weeks: int   # e.g., 6
    predicted_value: float
    confidence: Literal["low", "medium", "high"]
    key_driver: str      # e.g., "checkout friction detractor volume"
    condition: str       # e.g., "if checkout friction is addressed"
    basis: str           # explanation of the prediction basis
```

The `generate_predictions` node runs after `detect_changes`. It receives: `metric_payload`,
`changes`, `topics`, and the report's historical metric payload from the prior 4 periods
(fetched from `report_artifacts.metric_payload` for the last 4 runs of this report).

The LLM is prompted with structured trend data and asked to generate conditional predictions.
The prediction output is validated: predicted values must be within ±50% of the historical range
(a sanity guard against hallucinated predictions).

**Hallucination guard for predictions:**
Predictions are always presented as conditional and probabilistic, never as certainties. The
`render_html` node renders predictions with an explicit uncertainty label: "Crystal's projection
(medium confidence) — based on 8 weeks of data." Users who see a prediction that turns out wrong
can flag it via the narrative correction mechanism (CX-002 in CUSTOMER_REVIEW.md), which feeds
back into the prediction prompt calibration.

**Data requirements:**
- `report_artifacts.metric_payload JSONB` for historical runs — already stored.
- The `generate_predictions` node needs the prior 4 runs' `metric_payload` fetched from Postgres.
  This is a new query in `assemble_scope` or a new pre-node: `load_history`.
- Prediction accuracy tracking: a new `report_predictions` table logs predictions at generation
  time and actual outcomes when the next report run executes. This feeds Aditya's eval framework.

```sql
CREATE TABLE report_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES report_runs(id),
  metric TEXT NOT NULL,
  horizon_weeks INTEGER NOT NULL,
  predicted_value FLOAT NOT NULL,
  confidence TEXT NOT NULL,
  actual_value FLOAT,              -- populated when the horizon run completes
  outcome_run_id UUID REFERENCES report_runs(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

**Timeline:** Q1 2028. Requires: prediction quality eval framework, 4+ months of artifact history
per report (cannot generate reliable predictions on fewer than 4 data points), narrative correction
feedback loop (CX-002).

---

## Expansion 4 — Multi-Org Benchmarking in Briefings

### What It Is

Anonymous aggregated benchmarks woven into the narrative. "Your NPS of +42 is 12 points above
the median for B2B SaaS companies your size (100–500 employees, $5M–$20M ARR)." This is not
available in any Xperiq feature today, and it is a stated weakness in the competitive positioning
against Medallia (which has a proprietary industry benchmark panel).

The benchmark data is computed from the Xperiq customer base — anonymized, aggregated, never
attributable to individual orgs. An org with fewer than 20 response submissions per week is
excluded from the benchmark corpus to protect small orgs from reverse-identification.

### Technical Design

**New infrastructure: Benchmark Computation Pipeline**

This requires a multi-workstream investment:

1. **Opt-in consent mechanism:** Orgs must explicitly opt into the benchmark pool
   (`settings.benchmark_sharing_enabled BOOLEAN DEFAULT false`). The opt-in comes with a data
   processing agreement addendum. Enterprise-only in the first release.

2. **Anonymized metric aggregation:** A weekly batch job aggregates opt-in orgs' metrics into a
   `benchmark_metrics` table:
   ```sql
   CREATE TABLE benchmark_metrics (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     segment TEXT NOT NULL,          -- e.g., 'b2b_saas_100_500_employees'
     metric_name TEXT NOT NULL,      -- e.g., 'nps_weekly'
     p25 FLOAT,
     p50 FLOAT,
     p75 FLOAT,
     p90 FLOAT,
     org_count INTEGER NOT NULL,     -- must be >= 20 for the row to be published
     computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   ```
   The batch job runs Sunday night (before Monday morning reports). No individual org's data
   can be traced back through the published benchmark rows.

3. **CrystalOS integration:** The `compute_metrics` node fetches the relevant benchmark row for
   the org's segment and adds `benchmark_comparison` to `ReportMetricPayload`. The
   `generate_narrative` prompt includes: "If benchmark data is available, mention the org's NPS
   relative to peers. Always present as benchmark context, not as a grade."

4. **Org segmentation:** Org segment is determined by `organizations.employee_count_tier` and
   `organizations.industry_vertical` — fields that need to be added to the orgs table or sourced
   from the signup flow.

**Privacy requirements:**
- Benchmark rows with `org_count < 20` are suppressed and never exposed to any report.
- The benchmark pipeline runs in an isolated compute environment with no access to individual
  org response data — only to pre-aggregated per-org NPS summaries.
- Benchmark data is never attributed: "companies similar to yours" not "your direct competitors."
- Opt-out must be honored within 30 days: the org's historical contribution is excluded from
  future benchmark computations.

**Competitive impact:** This directly addresses the Medallia gap in GTM.md. Benchmark data
transforms Crystal's narrative from "your NPS changed" to "your NPS is above/below peers" —
a fundamentally different value proposition for executive briefings.

**Timeline:** Q2 2028. This is a platform bet: requires legal review (data sharing terms),
product design for the consent flow, data engineering investment (benchmark pipeline), and a
minimum of 50+ opt-in orgs to produce meaningful benchmarks. Build the infrastructure in Q1 2028;
launch publicly in Q2 2028 when the benchmark corpus is large enough.

---

## Expansion 5 — Voice Briefings

### What It Is

Crystal reads the briefing aloud as a 3-minute audio summary. Auto-generated from the same
narrative used in the email. Delivered to the recipient as: (a) an audio player embedded in the
email, (b) an RSS feed compatible with Apple Podcasts and Spotify (auto-subscribed, new episode
each cadence), (c) a push notification to Xperiq's mobile app (if built) with "Play your
Monday briefing."

The audio format is optimized for commute listening: Crystal reads the 3 key metrics, the Crystal
summary narrative, and the top 2 recommendations. Total runtime: 2–4 minutes. Visual data (charts,
KPI tables) is described verbally: "Your NPS this week was plus 42, up 8 points from last week's
plus 34."

### Technical Design

**TTS generation node:** New `generate_audio` node added to the report generation graph.
Conditional: only runs if the report has audio delivery enabled.

```python
# crystalos/graphs/nodes/generate_audio.py

async def generate_audio(state: ReportGenerationState) -> ReportGenerationState:
    """Convert the report narrative to audio using TTS API."""
    audio_script = build_audio_script(
        narrative=state["narrative"],
        metric_payload=state["metric_payload"],
        recommendations=state["recommendations"],
        template_slug=state["template_slug"]
    )
    # audio_script is plain-text optimized for TTS:
    # no bullet points, no HTML, numbers spoken naturally ("plus 42" not "+42")

    audio_bytes = await tts_client.synthesize(
        text=audio_script,
        voice="crystal_professional",   # Xperiq's branded TTS voice
        format="mp3",
        speed=1.0
    )
    state["audio_bytes"] = audio_bytes
    state["audio_duration_seconds"] = estimate_duration(audio_script)
    return state
```

**TTS provider options:** ElevenLabs (highest quality, custom voice cloning), OpenAI TTS
(`tts-1-hd`), or Google Cloud TTS. The voice is configurable per org — Xperiq ships a default
"Crystal voice." Enterprise orgs can upload a custom voice profile (ElevenLabs voice cloning)
to have a branded voice read their briefings.

**RSS feed architecture:**
Each `scheduled_report` with audio enabled gets a stable RSS feed URL:
`/reports/:id/feed.rss` — authenticated for in-app access, or with a token for podcast app
subscription. The RSS feed lists one episode per successful report run, with the MP3 stored in
Supabase Storage. The episode title is the email subject line. The description is the Crystal
narrative first paragraph.

**Audio script builder (`build_audio_script`):**
A pure Python function that converts the structured `ReportMetricPayload` + narrative into a
well-formatted audio script:
- Opens with: "Good morning. Here is your [Report Name] from Crystal AI, for [date range]."
- KPI section: reads out 3–4 key metrics in conversational language
- Narrative section: reads the Crystal narrative verbatim
- Recommendations: "Crystal's top recommendation this week: [recommendation text]."
- Closes with: "This has been your Intelligence Briefing from Xperiq Crystal."

Numbers are spoken correctly: `+42` → "plus 42", `-3` → "down 3 points", `87%` → "87 percent."

**Email integration:** The email template gains an audio player section (for Apple Mail and
Gmail web) using HTML5 `<audio>` with a fallback link for email clients that do not support
audio playback. The audio file is served from a CDN URL with the same presigned URL mechanism
as PDF artifacts.

**New data fields:**
```sql
ALTER TABLE report_artifacts ADD COLUMN audio_storage_key TEXT;
ALTER TABLE report_artifacts ADD COLUMN audio_duration_seconds INTEGER;
ALTER TABLE report_recipients ADD COLUMN delivery_audio BOOLEAN NOT NULL DEFAULT false;
```

**Timeline:** Q3 2028. Requires: TTS API integration, audio script builder, RSS feed
infrastructure, email audio player testing across clients (Apple Mail supports `<audio>`; most
Outlook versions do not — fallback link required for all Outlook builds).

---

## Expansion 6 — Executive Briefing Editor

### What It Is

A rich text editor embedded in the report web view that lets CX leaders edit Crystal's narrative
before the report is sent — or after it is sent, to correct the archived version. All edits are
tracked as "human overrides" with the editor's name, timestamp, and the original Crystal text.
These overrides are stored and used to improve Crystal's tone and priorities for that org over time.

This directly addresses CX-002 (narrative correction mechanism) from CUSTOMER_REVIEW.md, but
goes further: the editor is not just for corrections — it is a first-class composition tool.
The CX leader becomes a co-author with Crystal, not just a reviewer.

### Technical Design

**Editor interface:** Built on TipTap (a ProseMirror-based React editor). The editor loads the
Crystal narrative in edit mode. Changes are tracked using a diff algorithm: the original Crystal
text is always preserved in `report_artifacts.narrative_text`; the edited version is stored
separately in `report_artifacts.narrative_overrides JSONB`.

**Override structure:**
```typescript
interface NarrativeOverride {
  section: string;             // e.g., "narrative", "recommendation_1"
  original: string;
  edited: string;
  editedByUserId: string;
  editedAt: string;
  reason?: string;             // optional: why was this changed?
  overrideType: 'correction' | 'tone' | 'context' | 'omit';
}
```

**Feedback loop to Crystal:**
Monthly, the CrystalOS quality team runs a diff analysis across all org overrides:
- High-frequency corrections (same type of claim corrected by many orgs) → prompt engineering fix
- Tone overrides (professional → formal, corporate → casual) → per-org tone calibration stored in
  `organizations.crystal_tone_profile JSONB`
- Omit overrides (a section always deleted) → adjust template section weights for this org

The feedback loop is semi-automated: a weekly `crystalos/tools/override_analysis.py` script
aggregates override patterns and exports a report to `crystalos/skills/generate_report/EVALS.md`.

**Approval workflow integration:**
When `approval_mode = true` (from CX-001 fix in ISSUES_AND_FIXES.md), the editor is the approval
interface. The CX leader reviews Crystal's draft in the editor, makes changes, and clicks
"Approve and Send." The approved version (including any edits) is delivered to recipients.

**Version history:** Every save creates a new version record. The web view has a "History" panel
showing all versions: Crystal's original draft, each human edit, and the final approved version.
The report creator can revert to any version.

```sql
CREATE TABLE report_artifact_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_id UUID NOT NULL REFERENCES report_artifacts(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  narrative_text TEXT NOT NULL,
  edited_by_user_id UUID REFERENCES users(id),
  edit_type TEXT NOT NULL CHECK (edit_type IN ('crystal_original', 'human_edit', 'approved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (artifact_id, version_number)
);
```

**Timeline:** Q1 2028. Requires: TipTap integration, `narrative_overrides` schema, version history
API, approval workflow (CX-001 fix). The editor and the approval workflow should ship together —
the editor is the surface that makes approval workflow useful rather than a gate that blocks
without giving the CX leader a way to fix the issue.

---

## Expansion 7 — Multi-Language Delivery

### What It Is

Crystal generates the same briefing in English, Spanish, Japanese, German, French, and
Mandarin — configured per recipient. A global enterprise with regional CX teams receives each
briefing in their language. The Japanese operations lead gets the Monthly Executive Summary
in Japanese. The VP in Barcelona gets it in Spanish. The global rollup goes to the US HQ in
English. All from a single configured report.

### Technical Design

**Per-recipient language configuration:**
```sql
ALTER TABLE report_recipients ADD COLUMN delivery_language TEXT NOT NULL DEFAULT 'en';
-- ISO 639-1 codes: 'en', 'es', 'ja', 'de', 'fr', 'zh'
```

**Multi-language generation pipeline:**
The `generate_narrative` node gains a `target_language` parameter. When a report has
multiple delivery languages, the node runs once per unique language in the recipient list —
not once per recipient. If 5 recipients want Spanish, the Spanish narrative is generated once
and reused for all Spanish-language deliveries.

```python
# In the deliver node, before fan-out:
unique_languages = set(r.delivery_language for r in active_recipients)

narratives_by_language = {}
for lang in unique_languages:
    if lang == state["base_language"]:  # typically 'en'
        narratives_by_language[lang] = state["narrative"]
    else:
        narratives_by_language[lang] = await generate_narrative(
            state, target_language=lang
        )
```

The LLM prompt for non-English languages instructs Crystal to: (a) translate the narrative
into the target language, (b) maintain the same tone and structure, (c) adapt metric labels
to locale conventions, (d) not translate proper nouns (org name, survey name, Crystal AI).

**HTML template internationalization:**
Section labels ("What Changed", "Moments That Mattered", "Recommended Actions") are localized
using a flat i18n map in the Jinja2 templates:
`crystalos/templates/email/i18n/labels.json` — mapping of section label keys to translations
for each supported language.

**Subject line and preview text** are also translated per language, generated by the same
`generate_narrative` call with `target_language`.

**Quality assurance:**
Multi-language narratives are reviewed in the weekly narrative quality review ritual. For each
supported language, at least one native-speaking team member or contractor reviews sampled
outputs monthly. Crystal does not hallucinate translations, but it can produce grammatically
awkward business language — this requires human QA before each language exits beta.

**Pricing:** Multi-language delivery is Enterprise-only. Each additional language increases the
LLM cost per run by one narrative call (approximately $0.01–0.05 depending on model). For an
org with 3 languages and 10 reports, cost increase is $0.30–$1.50 per week — negligible relative
to Enterprise contract value.

**Supported languages at launch:** English (default), Spanish, Japanese, German. French and
Mandarin in the second release (require more QA investment). Additional languages available
by request with a 90-day turnaround.

**Timeline:** Q2 2028. Requires: per-recipient language field, multi-language narrative
generation loop, i18n label system, native-speaker QA for each language.

---

## Sequencing and Dependency Summary

| Expansion | Timeline | Complexity | Strategic Value | Key Dependencies |
|-----------|----------|------------|-----------------|-----------------|
| Living Reports | Q3 2027 | Medium | High | Metric cache (OPS-010), `report_shares` (SEC-007) |
| Briefing Conversations | Q4 2027 | Medium | High | Crystal conversation threading |
| Predictive Briefings | Q1 2028 | High | Very High | 4+ months of artifact history, CX-002 feedback loop |
| Multi-Org Benchmarking | Q2 2028 | Very High | Very High | Legal/privacy review, 50+ opt-in orgs, org segmentation data |
| Voice Briefings | Q3 2028 | Medium | Medium | TTS API, RSS infrastructure, audio storage |
| Executive Briefing Editor | Q1 2028 | Medium | High | CX-001 approval workflow, TipTap integration |
| Multi-Language Delivery | Q2 2028 | Medium | High | Per-recipient language field, native-speaker QA |

**Sequencing rationale:** Ship Expansions 1 and 2 first — they are the most natural extensions
of v1 and unlock measurable engagement gains (living report views, briefing conversation
sessions) that justify the subsequent investments. Expansion 3 (Predictive Briefings) should
enter design in parallel with 1 and 2, because it requires accumulating historical artifact
data — start that data collection now, ship the feature when the corpus is mature. Expansions
4 and 7 (Benchmarking and Multi-Language) require non-engineering work (legal, QA,
partnerships) — start those conversations in parallel with Expansions 1–3. Expansion 6
(Executive Briefing Editor) should ship alongside the approval workflow fix from ISSUES_AND_FIXES.md:
the two features are most valuable when they land together.
