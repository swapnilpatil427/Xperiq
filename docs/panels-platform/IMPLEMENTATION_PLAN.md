# Human Qualitative Panels — Implementation Plan

> **Date:** 2026-06-26  
> **Method:** 2-week sprints. Each phase ends with a releasable milestone.  
> **Owner map:** References roles from `ROLES.md`. Wave 1 team is assumed on-board by Month 2.

---

## Phase Overview

| Phase | Sprints | Calendar | What Ships |
|---|---|---|---|
| **HQ-0** | Sprint 0 (2 wks) | Weeks 1–2 | Foundation: DB schema, auth, scaffold |
| **HQ-1** | Sprints 1–4 (8 wks) | Weeks 3–10 | Async text communities — end-to-end |
| **HQ-2** | Sprints 5–7 (6 wks) | Weeks 11–16 | Video sessions + transcription pipeline |
| **HQ-3** | Sprints 8–10 (6 wks) | Weeks 17–22 | Concept testing + codebook UI + export |
| **HQ-4** | Sprints 11–13 (6 wks) | Weeks 23–28 | Crystal qual-quant bridge |
| **HQ-5** | Sprints 14–16 (6 wks) | Weeks 29–34 | Diary studies + longitudinal panels |

**Public launch gate:** HQ-1 complete (Week 10) — async qual is the minimum viable product.  
**Enterprise launch gate:** HQ-2 + HQ-3 complete (Week 22) — video + codebook management.  
**Full platform:** HQ-5 complete (Week 34).

---

## Team Assignments

| Role | Alias | Primary Responsibility |
|---|---|---|
| Head of AI Engineering | `AI-Lead` | AI architecture, model selection, quality standards |
| Senior AI Engineer — NLP | `AI-NLP` | Thematic coding, synthesis, Crystal qual skills |
| Senior AI Engineer — Transcription | `AI-Tx` | Transcription pipeline, media processing |
| Senior Full-Stack Engineer | `FE` | All React/TypeScript UI |
| Senior Backend Engineer | `BE` | All Node.js routes, DB migrations, state machine |
| Senior Python Engineer (CrystalOS) | `PY` | LangGraph pipelines, CrystalOS skill runtime |
| Senior Product Designer | `UX` | Figma specs, design review, participant UX |
| Senior PM | `PM` | Specs, prioritization, sprint planning |
| Principal Qual Methodologist | `QM` | Methodology review, activity template QA |
| Senior Qual Research Scientist | `QR` | User validation, qual output QA |
| AI Evaluation Engineer | `EVAL` | Eval harness, quality regression tests (Wave 2) |
| Data Engineer | `DE` | Data pipelines, embeddings, analytics (Wave 2) |

---

## Phase HQ-0 — Foundation (Sprint 0, Weeks 1–2)

**Goal:** Schema, auth scaffolding, and API skeleton. No visible product yet — but
the foundation every later sprint builds on.

### Sprint 0

**Backend (`BE`):**
- [ ] Create all 8 qual database migrations (see schema in `BRAINSTORM.md`):
  - `qual_studies`, `qual_participants`, `qual_activities`
  - `qual_responses`, `qual_sessions`
  - `qual_codebook_themes`, `qual_coded_quotes`
  - `qual_incentive_transactions`
- [ ] Scaffold `routes/qual-studies.ts` — CRUD stubs (no logic yet)
- [ ] Scaffold `routes/qual-participants.ts` — CRUD stubs
- [ ] Scaffold `routes/qual-activities.ts` — CRUD stubs
- [ ] Extend `creditPlans.ts` with qual credit costs:
  - `qual_participant_activation: 50`
  - `qual_ai_analysis: 100`
  - `qual_transcript_hour: 25`
  - `qual_crystal_query: 15`
  - `qual_diary_day: 5`
- [ ] Wire qual routes into `src/index.ts`

**CrystalOS (`PY`):**
- [ ] Create `crystalos/graphs/qual_study.py` — empty LangGraph scaffold
- [ ] Create `crystalos/tools/qual_analysis.py` — empty skill stubs
- [ ] Register qual skills in `crystalos/crystal/registry.py`

**Frontend (`FE`):**
- [ ] Add qual-related routes to `app/src/constants/routes.ts`
- [ ] Add i18n keys for all new qual strings to `locales/en.ts`
- [ ] Create empty page components for all qual pages (no UI yet)

**Design (`UX`):**
- [ ] Figma: complete high-fidelity designs for HQ-1 screens (Study Builder,
  Participant experience, Results overview) — ready for Sprint 1 engineering

**PM:**
- [ ] Sprint 1 specs finalized and reviewed with all engineers
- [ ] Participant invitation email copy written and reviewed by `QR`

**Methodologist (`QM`):**
- [ ] Review and finalize the 3 launch activity templates:
  - Open-ended text community (5-day)
  - Quick concept reaction (2-day)
  - Customer debrief (3-day, post-purchase/post-churn)

**Milestone:** All migrations applied to local dev. Routes return 200 stubs. Figma
designs for HQ-1 approved by PM and QM.

---

## Phase HQ-1 — Async Text Communities (Sprints 1–4, Weeks 3–10)

**Goal:** A researcher can recruit participants from their respondent database,
build a 5-day activity sequence, send it to participants, and receive an AI-generated
theme brief. This is the public launch MVP.

---

### Sprint 1 (Weeks 3–4) — Recruitment & Study Builder

**Backend (`BE`):**
- [ ] `POST /api/qual/studies` — create study (title, method_type, survey_id link optional)
- [ ] `GET /api/qual/studies` — list org's studies with status, participant count
- [ ] `GET /api/qual/studies/:id` — study detail
- [ ] `DELETE /api/qual/studies/:id` — soft-delete
- [ ] `GET /api/surveys/:surveyId/respondents/filter` — existing endpoint; confirm
  it supports the filter params needed (plan_tier, score_range, date_range,
  response_count); extend if not
- [ ] `POST /api/qual/studies/:id/participants/invite` — bulk invite from respondent
  filter + optional external emails. Creates `qual_participants` rows with
  `status: invited`. Does NOT yet send emails (Sprint 2).

**Frontend (`FE`):**
- [ ] `StudiesListPage` — grid of study cards (status badge, participant count, date)
  with "New Study" button
- [ ] `StudyBuilderPage` — Step 1 (Audience): respondent filter UI (connected to
  filter endpoint), shows matching count, manual email add field
- [ ] `StudyBuilderPage` — Step 2 (Activities): empty activity canvas (Sprint 2 fills it)
- [ ] `StudyBuilderPage` — Step 3 (Preview): participant list preview, credit cost
  estimate (reads `qual_participant_activation` cost × invitee count)

**Design (`UX`):**
- [ ] Design review: Step 1 Audience builder matches Figma spec
- [ ] Deliver Figma specs for participant-facing screens (Sprint 2)

**Qual Methodologist (`QM`):**
- [ ] Review respondent filter UX: are the filter options sufficient to construct
  meaningful research samples? Flag gaps to PM.

**Tests (`BE`):**
- [ ] Unit tests for study CRUD
- [ ] Integration test: create study → invite 5 participants → verify `qual_participants` rows

---

### Sprint 2 (Weeks 5–6) — Activity Builder + Participant Experience

**Backend (`BE`):**
- [ ] `POST /api/qual/studies/:id/activities` — create activity (prompt_text,
  activity_type, scheduled_at, unlock_condition JSONB)
- [ ] `GET /api/qual/studies/:id/activities` — ordered activity list
- [ ] `PUT /api/qual/activities/:actId` — update (reorder, edit prompt, reschedule)
- [ ] `DELETE /api/qual/activities/:actId`
- [ ] `POST /api/qual/studies/:id/launch` — transition study to `active`, debit
  `qual_participant_activation × invitee_count` credits, trigger invitation email send
- [ ] Invitation email dispatch: integrate with existing notification system
  (Novu or direct email). Magic link generation (JWT with participant_id + study_id,
  7-day TTL). Mobile-optimized email template.
- [ ] `GET /api/qual/participate/:token` — validate magic link, return activity
  state for participant (which activities are unlocked, which are complete)
- [ ] `POST /api/qual/participate/:token/respond` — submit response to activity
  (text_response, numeric_rating, media_urls). Validates unlock_condition. Updates
  `qual_participants.status` to `active` on first response.

**Frontend (`FE`):**
- [ ] Activity builder canvas — drag-and-drop activity sequence (day labels, prompt
  editor, unlock conditions, activity type selector)
- [ ] Activity type: "Text Prompt" (textarea response)
- [ ] Credit cost preview updates live as activities are added/removed
- [ ] Participant magic-link landing page — consent display, "I agree" CTA
- [ ] Participant activity page — text prompt + textarea, character count, submit button
- [ ] Participant confirmation page — "Response submitted. Activity 2 unlocks tomorrow."

**AI NLP (`AI-NLP`):**
- [ ] Begin: `crystalos/tools/qual_analysis.py` — `propose_themes()` function stub:
  reads all `qual_responses` for a study, chunks text, runs first-pass theme extraction.
  Not wired to UI yet.

**Qual Research Scientist (`QR`):**
- [ ] User test: send invitation to 5 internal participants, run through the full
  participant flow on iOS Safari and Android Chrome. File all friction points.

**Tests:**
- [ ] Magic link validation (expired, used, invalid)
- [ ] Activity unlock condition evaluation
- [ ] Response submission idempotency (duplicate submit → no duplicate row)

---

### Sprint 3 (Weeks 7–8) — AI Analysis + Study Monitoring

**Backend (`BE`):**
- [ ] Study monitoring endpoint: `GET /api/qual/studies/:id/status` — participant
  response rates, activity completion by day, lagging participants
- [ ] `POST /api/qual/studies/:id/close` — close study to new responses, trigger
  analysis pipeline
- [ ] `GET /api/qual/studies/:id/themes` — return codebook themes with coded quotes
- [ ] `PUT /api/qual/themes/:themeId` — researcher edits theme (rename, description,
  parent_theme_id for sub-themes)
- [ ] `DELETE /api/qual/themes/:themeId` — soft-delete (merge into another theme)
- [ ] `POST /api/qual/studies/:id/themes/merge` — merge two themes into one

**CrystalOS (`PY`):**
- [ ] `graphs/qual_study.py` — wire `propose_themes` node into LangGraph pipeline:
  - Input: study_id
  - Read all `qual_responses` via DB
  - Chunk + embed responses
  - Call Claude Sonnet: propose 8–15 candidate themes with top 3 supporting quotes each
  - Write `qual_codebook_themes` rows (is_ai_proposed=true) + `qual_coded_quotes` rows
  - Emit `analysis_complete` event on `agent_runs`
- [ ] Debit `qual_ai_analysis` credits when pipeline triggered
- [ ] `tools/qual_analysis.py` — `apply_codebook()`: given approved themes, re-tag
  all quotes across all responses

**AI Lead (`AI-Lead`):**
- [ ] Review `propose_themes` prompt quality against 3 real study datasets from QR
- [ ] Define acceptance criteria for theme quality (precision/recall target vs. human-coded baseline)

**Frontend (`FE`):**
- [ ] Study monitoring view — participant status table, response rate by day
  (progress ring per activity), lagging participants flag
- [ ] "Close & Analyze" button — triggers pipeline, shows progress indicator
- [ ] Themes review UI (researcher-in-loop):
  - Left panel: theme list with evidence count
  - Right panel: quotes tagged to selected theme
  - Edit theme name inline
  - Merge theme modal (drag target or dropdown)
  - "Approve all themes" CTA when satisfied

**Qual Methodologist (`QM`):**
- [ ] Validate `propose_themes` output on 3 real study datasets from design partner
  research. Score: are these themes a qualified researcher would write? Flag systematic
  errors (too broad, too narrow, missed obvious theme).

---

### Sprint 4 (Weeks 9–10) — Executive Brief + Polish + Launch Prep

**Backend (`BE`):**
- [ ] `POST /api/qual/studies/:id/brief` — trigger executive brief generation (deducts credits)
- [ ] `GET /api/qual/studies/:id/brief` — return generated brief (title, 3–5 theme
  summaries, top quote per theme, methodology note, sample size)
- [ ] `GET /api/qual/studies/:id/export` — generate PDF export (brief + methodology
  disclosure + top quotes per theme + participant counts)
- [ ] Incentive delivery: integrate Tremendous or Tango Card API. On study close,
  trigger gift card emails to participants who completed all activities.
- [ ] `qual_incentive_transactions` rows created per participant; status tracking.

**CrystalOS (`PY`):**
- [ ] `synthesize_study()` skill: given approved codebook → generate executive brief
  (3–5 theme summaries, top quotes, frequency table, methodology note auto-text)
- [ ] Wire into `qual_study.py` pipeline as final node

**Frontend (`FE`):**
- [ ] Results overview page — stat cards (N participants, N themes, median response
  length, study duration), theme frequency chart, top quotes per theme
- [ ] Executive brief panel — formatted brief text with quotes, "Export PDF" button
- [ ] Methodology disclosure section (expandable) — auto-generated disclosure text
- [ ] Empty state polish: Studies list empty state, study with zero responses state,
  study with no themes approved state
- [ ] Error states: invite fails, study close fails, analysis fails (retry button)

**Design (`UX`):**
- [ ] Design review of all HQ-1 screens against Figma spec
- [ ] Mobile responsive check on participant flow (iOS Safari + Android Chrome)
- [ ] Accessibility: color contrast on confidence indicators, focus states, screen
  reader labels on all interactive elements

**Qual Research Scientist (`QR`):**
- [ ] Run a complete end-to-end study with 10 real internal participants
- [ ] Evaluate: time from launch to brief delivery; brief quality; incentive UX
- [ ] Sign-off: "This is something I could use with a real client"

**PM:**
- [ ] Design partner onboarding materials ready (quickstart guide, CSM call script)
- [ ] 3 activity templates published in-app
- [ ] Credits pricing confirmed and wired to UI

**Launch gate criteria for HQ-1:**
- [ ] 10 internal studies completed successfully
- [ ] AI brief quality rating ≥4/5 by `QM` and `QR` on 5 sample studies
- [ ] Participant flow tested on 5 different devices/browsers with zero blocking bugs
- [ ] Incentive delivery working end-to-end (gift card received by test participant)
- [ ] All credits correctly debited in test scenarios
- [ ] Zero data leakage between orgs (multi-tenancy test)

---

## Phase HQ-2 — Video Sessions + Transcription (Sprints 5–7, Weeks 11–16)

**Goal:** Researcher schedules a 1:1 video interview. Participant receives a calendar
invite + video link. Session is recorded. Transcript is auto-generated with speaker
labels. Researcher reads transcript, highlights quotes, creates clips.

---

### Sprint 5 (Weeks 11–12) — Scheduling + Session Management

**Backend (`BE`):**
- [ ] `POST /api/qual/studies/:id/sessions` — create session (scheduled_at,
  duration_mins, participant_id). Generate video link via integration.
- [ ] `GET /api/qual/studies/:id/sessions` — list sessions with status
- [ ] `PATCH /api/qual/sessions/:id` — reschedule, cancel
- [ ] Calendar invite dispatch: send `.ics` attachment to researcher + participant
  email. Include video link in invite body.
- [ ] Video link generation: integrate Zoom API (create meeting) OR Daily.co API
  (create room with auto-record enabled). `ZOOM_API_KEY` or `DAILY_CO_API_KEY`
  env vars. Add to `.env.example` and `docs/ENV_VARS.md`.
- [ ] Session recording webhook: on session end, video platform posts recording URL
  to `POST /api/qual/sessions/:id/recording` webhook. Store `recording_url`.
  Trigger background transcription job.

**Frontend (`FE`):**
- [ ] Session scheduler UI — calendar date picker, time slot selector, participant
  selector from study participants, duration selector
- [ ] Sessions list view — upcoming sessions (date, participant, status),
  past sessions (recording available indicator)
- [ ] Participant session confirmation page (magic link) — shows date/time,
  video link button, "Add to Calendar" download

**Tests:**
- [ ] Session creation + calendar invite dispatch
- [ ] Recording webhook receipt + status update
- [ ] Timezone handling: session displayed in researcher's timezone; participant
  invite in participant's detected timezone

---

### Sprint 6 (Weeks 13–14) — Transcription Pipeline

**Backend / CrystalOS (`BE` + `AI-Tx`):**
- [ ] Transcription job in CrystalOS: `tools/transcription.py`
  - Download recording from video platform URL (signed, short-lived)
  - Upload to Assembly AI (or Deepgram) with speaker diarization enabled
  - Poll for completion (webhook preferred; polling fallback)
  - Parse response: structured JSON with `{speaker, text, start_ms, end_ms}[]`
  - Store in `qual_sessions.transcript_json`
  - Update `qual_sessions.transcript_status = 'complete'`
  - Emit completion event on `agent_runs`
  - Debit `qual_transcript_hour` credits per hour of audio
- [ ] `GET /api/qual/sessions/:id/transcript` — return structured transcript
- [ ] `POST /api/qual/sessions/:id/clips` — create clip from timestamp range
  (start_ms, end_ms, quote_text). Stores in `qual_coded_quotes` with session source.
- [ ] Signed video playback URLs: `GET /api/qual/sessions/:id/recording-url` —
  returns short-lived signed URL from OCI Object Storage (or video platform URL)

**Frontend (`FE`):**
- [ ] Transcript viewer — two-panel layout:
  - Left: video player with playback controls
  - Right: synchronized transcript (active sentence highlighted as video plays)
  - Click any sentence → video jumps to that timestamp
- [ ] Clip creation UI: drag across transcript lines → "Create Clip" button → names
  clip, assigns to theme (optional), saves
- [ ] Speaker label display: differentiate moderator vs. participant text

**AI NLP (`AI-NLP`):**
- [ ] Extend `propose_themes` to accept session transcripts as input alongside
  async text responses. The pipeline now has two source types.
- [ ] `apply_codebook` extended to tag quotes in transcript text

**Tests (`AI-Tx`):**
- [ ] Transcription accuracy test: known-accurate transcript compared to Assembly AI
  output. Target ≥95% word accuracy on clear audio.
- [ ] Speaker diarization: 2-speaker session → correct speaker labels ≥90% of utterances
- [ ] Timestamp accuracy: ±500ms on quote start times (for video seek)

---

### Sprint 7 (Weeks 15–16) — Transcript Analysis + Polish

**Backend (`BE`):**
- [ ] Extend study analysis pipeline to include session transcripts
- [ ] `GET /api/qual/studies/:id/quotes` — paginated quote browser across all sources
  (async responses + transcript clips), filterable by theme, participant, source_type

**Frontend (`FE`):**
- [ ] Session list with transcript status indicator ("Transcribing..." → "Ready")
- [ ] Quote browser — filterable grid of quotes: text, participant, source (activity
  or session), theme tags, "Play clip" button (for video quotes)
- [ ] Integrate session transcripts into themes review UI (same UI as async — just
  the quotes now include video source quotes too)

**Launch gate criteria for HQ-2:**
- [ ] 5 internal video sessions completed, transcribed, and analyzed end-to-end
- [ ] Transcription turnaround time ≤15 minutes per 60 minutes of audio
- [ ] Clip creation works on mobile Safari (researcher may clip on tablet)

---

## Phase HQ-3 — Concept Testing + Codebook Management + Export (Sprints 8–10, Weeks 17–22)

**Goal:** Add concept testing (show stimuli, get reactions). Full codebook management
UI (researcher creates, edits, approves themes). Professional PPTX export.

---

### Sprint 8 (Weeks 17–18) — Concept Testing Activity Type

**Backend (`BE`):**
- [ ] Concept test activity type in `qual_activities`: `activity_type = 'concept_test'`
- [ ] `stimuli` JSONB field on `qual_activities`: array of `{type: image|video|text, url, label}`
- [ ] Stimuli upload: `POST /api/qual/studies/:id/stimuli` — accepts image/PDF/video,
  stores in OCI Object Storage, returns signed URL. Add `OCI_BUCKET_NAME` env var.
- [ ] `qual_responses` schema: `choice_values JSONB` stores concept ranking +
  per-concept ratings. `numeric_value` stores overall preference score.

**Frontend (`FE`):**
- [ ] Activity builder: "Concept Test" activity type option
- [ ] Stimuli uploader in activity builder — drag-and-drop image/PDF upload, preview
- [ ] Per-concept order (researcher sets the display order; or "randomize" option)
- [ ] Participant concept test page:
  - Show stimuli (image carousel or side-by-side for ≤3 concepts)
  - Star rating (1–5) per concept
  - "Which do you prefer overall?" radio
  - Open-ended: "Why did you choose that one?"
- [ ] Concept test results: bar chart of preference by concept + average rating +
  open-ended responses grouped by choice

**Design (`UX`):**
- [ ] Concept test results visualization — clear winner view vs. competitive view
- [ ] Mobile stimuli display: full-screen image tap-to-zoom

---

### Sprint 9 (Weeks 19–20) — Codebook Management UI

**Backend (`BE`):**
- [ ] `POST /api/qual/studies/:id/codebook` — researcher creates a manual theme
  (not AI-proposed) and adds it to codebook
- [ ] `POST /api/qual/themes/:id/quotes` — researcher manually tags a quote to a theme
- [ ] `GET /api/qual/studies/:id/codebook/export` — structured codebook JSON
  (all themes + definitions + quote counts) for audit/archival
- [ ] Theme frequency: `GET /api/qual/studies/:id/themes/stats` — per-theme:
  participant count, quote count, % of participants who mention this theme

**Frontend (`FE`):**
- [ ] Full codebook manager page:
  - Left: theme tree (main themes + sub-themes, drag to re-parent)
  - Right: quote review pane for selected theme
  - "Add sub-theme" inline
  - "Merge themes" drag target
  - "Mark as representative" toggle on individual quotes
- [ ] Inter-rater view (future-ready): UI placeholder for comparing two coders'
  codebooks (shows divergence percentage)
- [ ] Quote browser: filter by theme, participant, source, date, confidence score;
  bulk-assign to theme

**Qual Methodologist (`QM`):**
- [ ] Validate codebook UI against NVivo/MAXQDA workflows: are all critical codebook
  operations available? Flag any missing workflow for PM.

---

### Sprint 10 (Weeks 21–22) — Professional Export + Polish

**Backend (`BE`):**
- [ ] `GET /api/qual/studies/:id/export/pdf` — generate PDF report:
  - Cover page (study title, date, sample size, org logo)
  - Executive summary (brief text)
  - Themes section (per-theme: title, definition, frequency, top 3 quotes)
  - Methodology disclosure (auto-generated standard text + custom notes field)
  - Appendix: full participant breakdown by demographic filter
- [ ] `GET /api/qual/studies/:id/export/pptx` — PowerPoint export:
  - Slide 1: Title + key stats
  - Slide 2: Themes overview (bar chart)
  - Slides 3–N: One slide per theme (title, frequency, 2 quotes, supporting data)
  - Last slide: Methodology + "This study was conducted using Experient"
- [ ] Use `pptxgenjs` (already in backend deps) for PPTX generation

**Frontend (`FE`):**
- [ ] Export modal — format selector (PDF / PPTX), options (include methodology /
  include raw quotes / include participant breakdown), preview thumbnail
- [ ] Share link: `GET /api/qual/studies/:id/share-link` — generates a read-only
  share token so stakeholders can view results without an Experient account

**Qual Research Scientist (`QR`):**
- [ ] Review PDF and PPTX exports with the eyes of a research team lead presenting
  to a C-suite stakeholder. Any formatting, labeling, or content issue → file as P0.

**Launch gate criteria for HQ-3:**
- [ ] Concept test with 3 stimuli completed with 10 participants; results clear and
  interpretable in results UI
- [ ] PPTX export opened in PowerPoint and Google Slides without formatting corruption
- [ ] PDF methodology disclosure reviewed and approved by CRO

---

## Phase HQ-4 — Crystal Qual-Quant Bridge (Sprints 11–13, Weeks 23–28)

**Goal:** Crystal detects quant signals and proposes qual investigations. Qual themes
are tagged back to quant metrics. Researchers can query qual data conversationally.

---

### Sprint 11 (Weeks 23–24) — Crystal Qual Query

**CrystalOS (`PY` + `AI-NLP`):**
- [ ] `qual_query` skill: Crystal conversational access to qual data
  - Index all qual responses + transcript chunks in pgvector with `source_type` tag
  - On Crystal turn: if qual data exists for org, augment retrieval with qual chunks
  - New tool in Crystal's toolkit: `search_qual_corpus(query, study_ids?, source_types?)`
  - Returns: matching chunks with source attribution (study name, participant, date)
  - Crystal synthesizes an answer with qual evidence cited

**Backend (`BE`):**
- [ ] Qual corpus indexing: on study analysis completion, chunk all responses +
  transcript text → embed → write to pgvector with metadata
  `{org_id, study_id, participant_id, source_type, activity_id}`
- [ ] Re-index endpoint: `POST /api/qual/studies/:id/reindex` for manual refresh

**Frontend (`FE`):**
- [ ] Crystal sidebar in study results: "Ask Crystal about this study"
- [ ] Crystal qual response formatting: show qual quotes inline in Crystal's answer
  (quote block with source attribution: "Participant 7, Day 2 response")
- [ ] Global Crystal: when user asks a qual question without being in a study,
  Crystal searches across all org's studies automatically

**Tests:**
- [ ] Crystal qual query returns relevant quotes (not hallucinated quotes)
- [ ] Source attribution is accurate (quote matches the stored response text)
- [ ] Org isolation: Crystal only returns qual data for the requesting org

---

### Sprint 12 (Weeks 25–26) — Quant Signal → Qual Investigation Proposal

**CrystalOS (`PY`):**
- [ ] Extend the insights pipeline: after generating quant insights, check for:
  - NPS movement > 5 points in a segment
  - CSAT below threshold
  - Topic spike in open-ended survey responses
  - When detected: generate a `QUAL_INVESTIGATION_PROPOSAL` action proposal
    with: target segment filter, suggested study type, suggested activities (3 prompts),
    estimated credit cost, urgency label
- [ ] Wire into `crystal_action_proposals` table with `type = 'qual_investigation'`

**Backend (`BE`):**
- [ ] `POST /api/qual/proposals/:proposalId/accept` — researcher accepts proposal →
  pre-fills study builder with the proposed segment filter + activities
- [ ] `POST /api/qual/proposals/:proposalId/dismiss` — record outcome

**Frontend (`FE`):**
- [ ] Qual investigation proposal card in Crystal panel:
  - "NPS dropped 7pts in enterprise accounts last month. Recommend: recruit 15 enterprise
    detractors for a 3-day async study. Cost: 900 credits. [Launch Study] [Dismiss]"
- [ ] "[Launch Study]" click → study builder pre-populated with:
  - Respondent filter: enterprise accounts, NPS score 1–5, last 30 days
  - 3 default activities (from the `customer_debrief` template)
  - Cost preview shown
- [ ] Proposal history in study list sidebar: "3 pending investigation proposals"

---

### Sprint 13 (Weeks 27–28) — Theme Tagging to Quant + Mixed-Method Report

**Backend (`BE`):**
- [ ] `POST /api/qual/themes/:id/link-metric` — link a qual theme to a quant metric:
  `{metric_type: 'nps'|'csat'|'survey_question', metric_id, direction: 'driver'|'detractor'}`
- [ ] `GET /api/insights/:surveyId/mixed` — mixed-method view: quant metrics +
  linked qual themes displayed together
- [ ] Metric trend + linked quotes: NPS trend chart with a "qual evidence" popover
  showing representative quotes from the linked theme

**Frontend (`FE`):**
- [ ] Theme-to-metric linking UI in codebook manager:
  - "Link this theme to a metric" action
  - Metric picker (surveys in org, specific question or NPS score)
- [ ] Insights dashboard card update: NPS card shows "3 themes linked" indicator
  → click → see qual evidence panel
- [ ] Mixed-method report view: quant stats on the left, supporting qual quotes on the right

**Qual Methodologist (`QM`):**
- [ ] Review mixed-method report UX: is the qual-quant link presented in a way that
  is methodologically honest? (Theme is associated with metric, not causal of it —
  the language matters.)

---

## Phase HQ-5 — Diary Studies + Longitudinal (Sprints 14–16, Weeks 29–34)

**Goal:** Time-sequenced diary studies with per-day activity unlocks. Longitudinal
panel health. Pattern detection across days.

---

### Sprint 14 (Weeks 29–30) — Diary Study Engine

**Backend (`BE`):**
- [ ] Time-sequenced activity unlock engine:
  - Activities have `scheduled_day: int` (day 1 = study start + 0, day 2 = +1, etc.)
  - Cron job runs nightly: for each active diary study, send activity notifications
    to participants whose current day matches a scheduled activity
  - `unlock_condition` evaluated: `{after_day: 2, requires_activity_id: X}` — activity
    unlocked only after prior activity submitted
  - Timezone-aware: notification sent at 9am in participant's detected timezone
- [ ] Participant timezone detection: IP-based or explicit timezone selection at consent
- [ ] Daily participation report: per-day completion rates emailed to researcher each morning

**CrystalOS (`PY`):**
- [ ] `diary_pattern_detect` skill:
  - Input: study_id
  - Reads responses day-by-day
  - Identifies: sentiment arc (how does tone change from Day 1 to Day N?),
    theme evolution (does a theme emerge strongly on a specific day?),
    engagement decay (do responses get shorter/less detailed over time?)
  - Output: structured timeline of emotional + thematic patterns with evidence

**Frontend (`FE`):**
- [ ] Study builder: "Diary Study" template option — activates day-sequencing mode
- [ ] Activity builder diary mode: day labels (Day 1, Day 2, etc.) instead of
  absolute dates; drag-and-drop day ordering
- [ ] Diary results view: timeline visualization — day on X-axis, sentiment/theme
  intensity on Y-axis; click any data point to see that day's quotes

---

### Sprint 15 (Weeks 31–32) — Panel Health + Longitudinal Dashboard

**Backend (`BE`):**
- [ ] `qual_participants` panel health signals:
  - Response rate: (responses submitted / activities sent) per participant
  - Response quality score: avg character count (proxy for effort)
  - Panel fatigue flag: response rate drop >30% in last 3 studies
  - Last participated date
- [ ] `GET /api/qual/participants/:id/history` — all studies participant was in,
  response rates, incentive totals
- [ ] `GET /api/qual/panel-health` — org-level panel health: total active participants,
  avg response rate, fatigue-flagged count, do-not-contact list

**Frontend (`FE`):**
- [ ] Panel health dashboard — participant list with health indicators:
  - Green: active, high response rate
  - Yellow: declining response rate (last study <60%)
  - Red: fatigue-flagged or do-not-contact
- [ ] Longitudinal study comparison: run the same study template at T=0 and T=3mo,
  see theme evolution between waves. "Theme: 'Pricing transparency' grew from 24% →
  41% mention rate over 3 months."
- [ ] Participant profile: full study participation history, lifetime incentive,
  panel health score, notes field for researcher

---

### Sprint 16 (Weeks 33–34) — Platform Polish + Full Launch Prep

**All engineers:**
- [ ] Performance audit: all study list queries <200ms on 500 studies/org
- [ ] Transcript viewer: smooth video-transcript sync at 1x, 1.5x, 2x playback
- [ ] Mobile participant flow: full E2E test on 10 real devices (iOS + Android)

**AI Lead + AI NLP:**
- [ ] Full eval harness run: precision/recall on thematic coding across 20 test studies
- [ ] `diary_pattern_detect` quality review by QM + QR

**Data Engineer (`DE`):**
- [ ] Analytics pipeline: study-level metrics → analytics DB for product dashboards
- [ ] Per-org usage reports: studies/month, participants/study, brief quality ratings

**Privacy Counsel:**
- [ ] GDPR deletion cascade test: participant right-to-delete → verify removal from
  all qual tables + pgvector embeddings + Object Storage
- [ ] Data processing agreement (DPA) template ready for enterprise customers
- [ ] Methodology disclosure legal review: ensure auto-generated text is accurate
  and does not make unsupported accuracy claims

**QM + QR + AI Lead:**
- [ ] Full methodology validation across all study types (async, video, concept, diary)
- [ ] CRO sign-off: "This platform produces qual research I would present to clients"

**Full launch gate criteria:**
- [ ] All 5 study types work end-to-end
- [ ] GDPR deletion cascade verified
- [ ] 3 enterprise design partners have completed multi-study programs
- [ ] AI eval harness: zero critical quality regressions in last 4 sprints
- [ ] Privacy Counsel DPA ready
- [ ] CSM team trained and ready for enterprise onboarding

---

## Risk Register

| Risk | Owner | Probability | Mitigation |
|---|---|---|---|
| Assembly AI accuracy unacceptable for research use | `AI-Tx` | Medium | Benchmark 5 providers before Sprint 6 commits; Whisper as fallback |
| `propose_themes` quality too low for researcher trust | `AI-NLP` + `QM` | Medium | Methodologist QA in Sprint 3; acceptance criteria enforced before HQ-1 ships |
| Participant response rate <30% kills product value | `PM` + Behavioral Scientist | Medium | A/B test invitation copy from day 1; incentive optimization study in Month 2 |
| Magic link security: link forwarded to wrong person | `BE` | Low | JWT has participant_id baked in; flag if IP changes significantly mid-study |
| OCI Object Storage egress costs for video | `DE` | Medium | Signed URL TTL = 1hr; never serve video through API; measure cost at Sprint 6 |
| Crystal qual-quant bridge confuses correlation with causation | `AI-NLP` + `QM` | High | Language in UI is explicit: "associated with" not "causes"; QM reviews all Crystal qual outputs |
| GDPR deletion from pgvector embeddings is hard | `BE` | Medium | Design the deletion path in Sprint 0 before any embeddings are written |

---

## Dependencies and Prerequisites

Before Sprint 1 starts:
- [ ] OCI Object Storage bucket provisioned (video + stimuli storage)
- [ ] Assembly AI or Deepgram API key obtained and tested
- [ ] Tremendous or Tango Card account created, API key obtained
- [ ] Video platform decision made (Zoom API vs. Daily.co) and API key obtained
- [ ] All env vars added to `.env.example` and `docs/ENV_VARS.md`
- [ ] Privacy Counsel reviewed: magic link consent flow, incentive payment legal requirements
- [ ] 3 activity templates written by `QM` and reviewed by `QR`
- [ ] Design partner agreements signed (10+ companies)
- [ ] Figma designs for HQ-1 complete before Sprint 1 engineering starts
