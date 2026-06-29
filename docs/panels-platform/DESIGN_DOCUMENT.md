# Human Qualitative Panels — Product Design Document

> **Version:** 1.0  
> **Date:** 2026-06-26  
> **Authors:** Head of Product · Head of Design · CRO · Head of AI Engineering  
> **Status:** Pre-development design spec — approved before Sprint 0 begins

---

## 1. Product Vision

**In one sentence:**
Experient Human Qualitative Panels is the platform where a research team of one can
run a rigorous qualitative study by Thursday afternoon, have AI-assisted themes by
Friday morning, and present findings to the executive team by Monday — without a
research agency, a focus group facility, or a six-week timeline.

**The 3-year north star:**
Every quant signal in Experient automatically knows its corresponding qual investigation.
When NPS drops, Crystal proposes who to talk to, the researcher clicks once, and
the loop closes. This is the standard the platform is designed to achieve — not just
qual as a feature, but qual as the "why" engine for the entire XM platform.

---

## 2. Jobs to Be Done

These are the jobs the product must execute, ranked by how often they occur and
how badly existing solutions fail at them.

| # | Job Statement | Frequency | Current Solution Failure |
|---|---|---|---|
| J1 | When I see a quant signal I don't understand, help me quickly recruit the right people to explain it | Weekly | Takes 3–6 weeks via agencies; people recruited are strangers, not actual customers |
| J2 | When I need to understand a complex experience, help me capture it in people's own words at low cost | Monthly | Open-ended survey responses are shallow; full qual studies are expensive |
| J3 | When I have qual findings, help me turn them into something my executive team will act on | Monthly | Manual theming takes days; output is a deck that no one reads after the meeting |
| J4 | When I want to track how sentiment evolves, help me run the same study over time | Quarterly | No platform makes longitudinal qual self-serve; each wave requires full re-recruitment |
| J5 | When I have a concept to test, help me quickly get reactions from the right segment | Monthly | UX testing tools only cover UX; no link to CX/EX metrics |
| J6 | When I want to hear a specific customer's full story, help me schedule and analyze a video interview | Monthly | Calendly + Zoom + Otter.ai + manual coding = 6-step fragmented workflow |

---

## 3. User Personas

### Primary: Maya — The Research Lead

**Role:** CX Insights Manager at a 1,200-person SaaS company.  
**Sophistication:** 7 years in research. Has used Qualtrics, Dovetail, UserTesting.
Holds a Masters in organizational psychology. Has strong opinions about methodology.

**Typical workday interaction with qual:**
- 8:00am: Checks overnight participant responses to an active study
- 10:30am: Presents to the Customer Success leadership team on NPS drivers
- 2:00pm: Designs a new study based on a Crystal anomaly alert
- 4:00pm: Reviews AI-proposed themes from a study that completed yesterday

**Design implications:**
- Needs dense information on the monitor page (not oversimplified)
- Will catch any AI output that looks wrong — the review workflow must be fast, not
  buried (she'll do it daily)
- The executive brief export must match the quality bar of her current Keynote decks
- Does not want to be patronized by tooltips explaining obvious concepts

### Secondary: James — The Sprint-Cycle Researcher

**Role:** UX Researcher at a 400-person product team. No direct reports.  
**Sophistication:** 4 years in UX research. Strong in usability methods; newer to XM.

**Typical interaction:**
- Runs a 5-day async study every other sprint to inform design decisions
- Shares findings as a Slack message with key quotes, not a formal report
- Uses Crystal to answer the one-liner "what did people say about X?" for PMs

**Design implications:**
- Needs the fastest possible path from "I have a question" to "study launched"
- Templates are critical — he should be able to launch from a template in 10 minutes
- The Crystal qual query panel is a primary workflow, not an advanced feature
- Export to a shareable link (not PDF) is more useful for his team

### Tertiary: Chen — The Participant

**Role:** Enterprise buyer at a manufacturing company. Received an NPS survey,
scored 5/10. Received an invitation to a follow-up qual study.

**Context:** Mid-career professional. Responds on iPhone during lunch. Skeptical.
Values transparency about why she's being asked. Wants the incentive immediately.

**Design implications:**
- Every word on the participant-facing screens must earn its place
- Consent must be genuinely readable — not a legal wall
- The activity page must work flawlessly on 5-year-old iPhones with spotty connections
- Incentive delivery must be faster than she expects — builds trust for future studies

---

## 4. Feature Specifications

### 4.1 Study Types

**Async Text Community**
- Participants receive a sequence of text prompt activities over N days
- They respond in their own time via magic link on any device
- Activities unlock sequentially based on time or prior completion
- Best for: open-ended exploration of experiences, feelings, and motivations
- Default activity length: 5 days, 3 activities

**Video Interview (IDI)**
- Researcher schedules a 1:1 session with a participant
- Session conducted via integrated video platform (Zoom or Daily.co)
- Recording auto-uploaded; transcription auto-triggered
- Researcher uses a discussion guide (structured as a list of topics, not a script)
- Best for: deep exploration of complex experiences; building empathy
- Default duration: 60 minutes

**Concept Test**
- Researcher uploads 2–5 stimuli (images, videos, PDFs, text statements)
- Participants rate each stimulus and provide open-ended rationale
- Can be combined with async community: e.g., Day 2 is always a concept test
- Best for: comparing messaging options, design alternatives, feature priorities

**Diary Study**
- Time-sequenced activities delivered over 5–30 days
- Often includes daily journaling + periodic structured prompts
- Designed to capture in-the-moment experiences as they happen
- Best for: understanding high-frequency, context-dependent behaviors
- Requires time-sequenced activity engine (Phase HQ-5)

---

### 4.2 Participant Recruitment

**Source A: Survey Respondents Filter**

The primary differentiator. Filter parameters available:

| Filter | Data Source | Notes |
|---|---|---|
| Survey | `surveys` table | Which survey did they respond to? |
| Score range | `responses` table | NPS 1–5, CSAT <3, etc. |
| Response date | `responses.created_at` | Last 30/60/90 days |
| Account type / plan | `orgs.plan_tier` | Enterprise, Growth, etc. |
| Account industry | `orgs.industry` | If available |
| Last study participation | `qual_participants.created_at` | Cooldown enforcement |
| Geography | `responses.metadata` | Country/region if collected |
| Custom attribute | `responses.metadata JSONB` | Any custom metadata stored |

**Source B: External Email Upload**

- CSV upload or manual entry
- Name + email required; additional metadata optional
- External participants do not have a survey profile; shown without filter context
- Useful for: recruiting customers from CRM who haven't taken a survey

**Source C: Hybrid**

Filter from respondent database AND add external emails. Both pools merge into a
single `qual_participants` list. The distinction between sources is tracked in
`qual_participants.source_type` for analysis purposes.

**Quota Management**

- Target N: researcher sets the desired final sample size
- System selects randomly from the filtered pool up to target
- Optional quota groups: "50% enterprise, 50% growth" — system respects quotas
  within the random selection
- If target > matching pool: researcher is warned and can choose to invite all or
  expand filters

---

### 4.3 Activity Engine

**Activity Data Model:**

```
qual_activities:
  activity_type: text_prompt | concept_test | rating_scale | diary_check_in
  scheduled_day: int (relative to study start)
  unlock_condition: JSONB
    { type: 'immediate' }
    { type: 'after_day', day: N }
    { type: 'after_activity', activity_id: UUID }
  stimuli: JSONB array of { type, url, label, display_order }
  response_config: JSONB
    { min_length: 50, max_length: 2000, rating_scale: 5 }
```

**Unlock Logic (evaluated nightly by scheduler):**

```
for each active study:
  for each participant in status active:
    for each activity in study:
      if activity.unlock_condition is satisfied:
        if participant has not yet received this activity:
          send notification + update participant_activity_state
```

Satisfaction rules:
- `immediate`: always satisfied on study start
- `after_day`: `NOW() >= study.start_date + unlock_condition.day`
- `after_activity`: participant has submitted response to referenced activity_id

**Activity Notification:**

Delivered at 9am in the participant's local timezone (detected from IP at consent,
or explicitly selected). Delivery method: email (default) + SMS (if opted in).

Notification content: personalized preview of the activity prompt ("Today's question:
What would have made your renewal experience better?") + magic link button.

---

### 4.4 AI Analysis Pipeline

**Pipeline: `graphs/qual_study.py`**

Triggered when researcher clicks "Close & Analyze" or study's scheduled close date passes.

```
Node 1: load_study
  - Fetch all qual_responses for the study
  - Fetch all qual_sessions + transcripts
  - Normalize into a unified corpus: [{participant_id, source, text, day}]
  - Validate: minimum 3 participants required to proceed

Node 2: propose_themes
  Model: Claude Sonnet
  Input: full corpus (chunked if >100k tokens)
  Prompt strategy:
    - "You are a qualitative researcher analyzing verbatim responses."
    - "Identify 5–12 meaningful themes. A theme must: appear in ≥15% of responses,
      represent a coherent experience or perspective (not just a keyword),
      and be supported by at least 3 verbatim quotes."
    - "For each theme: name, 1-sentence definition, list of supporting quotes
      (exact verbatim, with participant_id and response_id references)."
  Output: structured JSON per theme
  Write: qual_codebook_themes (is_ai_proposed=true) + qual_coded_quotes

Node 3: calculate_frequency
  - For each proposed theme: count distinct participants whose responses contain
    supporting quotes
  - Compute: mentions / total_participants = frequency percentage
  - Assign confidence: high (>50%), medium (25–50%), low (<25%)
  - Update qual_codebook_themes.frequency + confidence fields

Node 4: embed_corpus
  - Chunk all responses into ≤500-token segments
  - Generate embeddings via OpenAI text-embedding-3-small (1536-dim)
  - Write to pgvector with metadata {org_id, study_id, participant_id, source_type}

Node 5: notify_researcher
  - Update agent_runs status to complete
  - Emit qual_analysis_complete event
  - Send email to study owner: "Analysis complete for [Study Name]. [View Themes →]"
```

**Model Selection Rationale:**

| Task | Model | Why |
|---|---|---|
| Theme proposal | Claude Sonnet | Nuanced qualitative judgment; long-context understanding |
| Quote tagging (apply_codebook) | Claude Sonnet | Accuracy is critical; cost justified |
| Executive brief | Claude Sonnet | Quality of synthesis goes to stakeholders |
| Crystal qual query | Claude Sonnet | Conversational reasoning with evidence |
| Diary pattern detection | Claude Sonnet | Longitudinal reasoning across time |
| Session summary | Haiku 4.5 | Speed + cost for per-session bullet summaries |

---

### 4.5 Researcher-in-Loop Codebook Workflow

**Design principle:** AI codes themes; researcher validates and approves.
Nothing goes to stakeholders without explicit researcher approval on each theme.

**Workflow states per theme:**

```
pending_review → approved (by researcher)
             ↘ rejected (by researcher)
             ↘ merged (into another theme)
pending_review → edited + approved (name/definition changed before approving)
```

**Approval mechanics:**
- "Approve" on a theme: marks it `approved_at = NOW()`, `approved_by = user_id`
- "Approve All Reviewed Themes": bulk-approves all themes the researcher has read
  (tracked by a `last_viewed_at` timestamp on each theme)
- "Generate Brief" button only activates when at least 3 themes are approved
- Rejected themes are soft-deleted; the researcher can "un-reject" within the same session

**What the brief contains (approved themes only):**
Brief is generated from approved themes exclusively. If researcher approves 4 of 6
proposed themes, the brief covers those 4. Rejected themes are excluded.

---

### 4.6 Crystal Qualitative Query

**Capability:** Researchers ask natural language questions about qual study data.
Crystal retrieves semantically relevant chunks from the study's embedded corpus and
synthesizes an answer with verbatim evidence.

**Query examples:**

> "What did participants say about the onboarding experience?"
> "Which participants mentioned competitor products?"
> "What tone or emotion came through most in Day 3 responses?"
> "Were there any positive surprises in the feedback?"

**Retrieval strategy:**
1. Query embedded with text-embedding-3-small
2. pgvector cosine similarity search across study corpus
3. Top 15 chunks retrieved
4. Synthesize answer from retrieved chunks with Claude Sonnet
5. Response includes: synthesized paragraph + 2–4 verbatim quotes + source attribution

**Scope:** By default, queries are scoped to the current study. Researcher can
expand scope to "All studies in this organization" for cross-study analysis.

**Boundary condition:** Crystal must not fabricate quotes. Every quote in a Crystal
qual response must be retrievable from `qual_coded_quotes` or `qual_responses` table.
If relevant content was not found, Crystal says so explicitly.

---

### 4.7 Incentive Management

**Provider:** Tremendous API (primary), Tango Card (secondary/fallback).

**Flow:**

```
On study_close trigger:
  for each participant with status = completed:
    if study.incentive_amount > 0:
      call Tremendous.create_reward({
        recipient_email: participant.email,
        amount: study.incentive_amount,
        currency: 'USD',
        reward_type: 'AMAZON_GIFT_CARD'  # default; researcher can change
      })
      create qual_incentive_transactions row {status: pending}
      
On Tremendous webhook (reward_delivered):
  update qual_incentive_transactions.status = 'delivered'
  update qual_participants.incentive_status = 'delivered'
  send participant confirmation email: "Your $25 gift card is on its way."
```

**Billing model:**
- Incentive amounts are charged at cost to the org (pass-through)
- Processing fee: 10% of incentive total (Experient margin on incentive management)
- Incentive costs are NOT credits — they are billed separately on the org's
  monthly invoice as "Participant Incentive Pass-Through"
- Credit balance covers platform costs; incentive pass-through covers human costs

**Legal requirements (US):**
- Aggregate >$600 paid to a single participant in a calendar year → flag for 1099
- `qual_incentive_transactions` tracks cumulative incentive per
  `{org_id, participant_email, calendar_year}` for 1099 threshold monitoring
- Privacy Counsel to advise on international payment requirements per country

---

### 4.8 Privacy and Data Handling

**Participant consent:**
- Shown on the welcome page (magic link entry point)
- Must be explicitly acknowledged ("I agree") before any activity is accessible
- Consent text is stored as `qual_participants.consent_at` + `consent_version`
- If consent text changes, existing participants are not retroactively re-consented;
  new participants see new version; `consent_version` tracks which text each participant saw

**GDPR right to erasure:**
A participant deletion request must cascade in this order:
1. `qual_participants` — set `pii_deleted_at`, null out email/name fields
2. `qual_responses` — set `pii_deleted_at`, null out `text_response` (replace with
   `[RESPONSE DELETED PER GDPR REQUEST]`)
3. `qual_coded_quotes` — null out `quote_text` where `participant_id` matches
4. pgvector embeddings — delete all rows with `metadata->>'participant_id' = :id`
5. OCI Object Storage — delete any uploaded media for this participant
6. `qual_incentive_transactions` — null out `recipient_email`
7. Audit log entry: `{event: 'gdpr_deletion', participant_id, requested_at, completed_at}`

**Note:** Codebook theme names are NOT deleted (they are researcher-created, not PII).
Frequency counts on themes are NOT deleted (they are aggregate statistics).

**Data residency:**
- Default: US region (OCI us-ashburn or us-phoenix)
- Enterprise option: EU region (OCI eu-frankfurt) for GDPR-sensitive customers
- Data residency preference stored in `org_profiles.data_region`

**Anonymization in UI:**
- Participant names never shown in the researcher UI by default
- Displayed as "P1", "P2", etc. in quotes and analysis
- Researcher can toggle "Show names" in settings (requires explicit permission;
  logged in audit trail)

---

### 4.9 Export Formats

**PDF Export — Fields:**

```
Cover:
  - Study title
  - Org logo
  - Date range
  - "Prepared using Experient Research Platform"
  - "Qualitative Study — Directional Findings"

Executive Summary:
  - 3–5 sentence overall summary (AI-generated, researcher-editable)
  - Key finding highlighted in a callout box

Themes (one section per approved theme):
  - Theme name + definition
  - Frequency: "N of M participants (X%)"
  - Frequency bar visualization
  - 3 representative quotes (researcher-starred or top-confidence)
  - Source attribution: participant ID + activity + date

Methodology Disclosure:
  - Study type, dates, participant count, response rate
  - "AI-assisted thematic analysis reviewed and approved by [Researcher Name]"
  - "This is qualitative, directional research. Results are not statistically
    representative of [Org Name]'s full customer base."
  - "Conducted on the Experient Research Platform."

Appendix:
  - Full participant breakdown by filter (e.g., 60% enterprise, 40% growth)
  - Full quote list by theme (all coded quotes, not just top 3)
```

**PPTX Export — Slide Structure:**

```
Slide 1: Title + Key Stat
  - Study name
  - "N of M participants (X%) identified [top theme] as a driver of dissatisfaction"
  - Date

Slide 2: Themes Overview
  - Horizontal bar chart of all themes by frequency
  - Color-coded by confidence level

Slides 3–N: One slide per theme
  - Theme name (large)
  - Definition (subtext)
  - "N/M participants (X%)"
  - 2 quotes in pull-quote format
  - "This theme was identified in the Experient Research Platform"

Final slide: Methodology
  - Verbatim methodology disclosure text
  - Experient logo + date
```

---

## 5. Edge Cases and Error States

### Researcher-Side

**Insufficient credits at launch:**
- Preflight check before debiting
- Show: "This study costs 850 credits. Your balance is 400 credits."
- CTA: "Buy more credits" → credits purchase flow
- CTA: "Reduce study size" → back to Step 1 with sample size suggestion

**Zero participants match filter:**
- Show: "No respondents match your current filters."
- Suggestions: expand date range, broaden score filter, check if survey has responses

**Study closed with <3 responses:**
- Block AI analysis: "At least 3 responses are required for thematic analysis."
- Show: "You have 2 responses. Consider re-opening the study to invite more participants."
- Allow: "Export raw responses" without AI analysis

**AI analysis times out (>30 min):**
- CrystalOS pipeline emits `analysis_failed` event
- Researcher notified by email: "Analysis encountered an issue. [Retry Analysis]"
- Retry button on study results page

**Video platform webhook not received (recording URL missing):**
- After session end + 30 min: send researcher notification: "Recording not received yet."
- After 2 hours: researcher prompted to upload recording manually (file upload fallback)

**Transcript confidence low:**
- Assembly AI returns confidence score per segment
- If overall confidence <80% (heavy accent, poor audio, etc.): show warning banner
  in transcript viewer: "Transcript accuracy may be lower than usual. Verify quotes
  against the recording before using in research."

### Participant-Side

**Magic link expired (>7 days):**
- Show: "[Org Name] Research"
- "This invitation has expired. Contact [researcher email] if you'd like to participate."
- Do NOT show a generic 404

**Magic link used from different device:**
- Allow: magic links are participant-specific, not device-specific
- If a different user email is signed into the device's browser: no session check
  needed (magic link flow has no login)

**Participant submits duplicate response:**
- POST endpoint is idempotent on (activity_id, participant_id)
- Second submission updates the first: "Update submitted" confirmation

**Participant tries to access locked activity:**
- Show: "This activity isn't available yet."
- Show: day and time when it unlocks
- Do NOT show the prompt text of the locked activity

**Participant drops out mid-study (stops responding):**
- After 48 hours of no activity response when one is due: send one reminder notification
- After 96 hours with no response to reminder: mark participant `status: dropped_out`
- Do not send further notifications to dropped-out participants
- `dropped_out` participants are excluded from AI analysis if they completed <50% of activities

**Participant requests to stop:**
- Reply "STOP" to SMS or click "Unsubscribe" in email → immediate opt-out
- Set `qual_participants.status = 'opted_out'`
- No further notifications sent
- Responses already submitted are retained (as per consent terms); only new
  communication is stopped

---

## 6. Technical Design Decisions

### Decision 1: Magic Link TTL and Reuse

**Decision:** Magic links expire after 7 days. They can be clicked multiple times
(not single-use). Each click validates the JWT and returns the current participant state.

**Rationale:** Participants often save the link and return. Single-use links cause
support burden when participants click but are interrupted. 7-day TTL is calibrated
to the longest study duration for initial contact.

**Security:** JWT payload contains `{participant_id, study_id, issued_at}`. Server
validates signature + TTL. No session state required.

### Decision 2: Participant PII Handling

**Decision:** Participant emails stored in `qual_participants.email`. Not in
`qual_responses`. Theme codebook contains no PII. Quote text contains participant speech
(which may contain self-identifying PII — we cannot control this).

**Implication:** GDPR deletion nulls out `qual_responses.text_response` to remove
participant-authored PII. Theme frequency counts are aggregate and retained.

### Decision 3: AI Analysis Trigger

**Decision:** Analysis runs after researcher explicitly clicks "Close & Analyze",
not automatically on study close date.

**Rationale:** Researcher may want to keep the study open to collect more responses
even after the scheduled close date. Explicit trigger gives control. Also avoids
triggering a billable AI analysis run on an abandoned study.

**Exception:** If researcher has set "Auto-analyze on close" toggle: system
auto-triggers analysis 2 hours after close date passes (gives late responses a window).

### Decision 4: Video Storage vs. Platform Storage

**Decision:** Video recordings are stored on the video platform (Zoom/Daily.co)
by default. We store only the URL. OCI Object Storage used only if researcher
manually uploads a recording.

**Rationale:** Video files are large (500MB–2GB per session). Storing on the
platform adds significant OCI storage costs and egress complexity. The video
platform's CDN is better at video delivery than our Object Storage.

**Risk:** Video platform may delete recordings after N days. Mitigation:
- Warn researcher in UI: "Zoom recordings expire after 30 days. Download and upload
  to Experient if you need them longer."
- Phase 2 feature: "Archive to Experient" button that copies recording to OCI
  with signed URL serving.

### Decision 5: Crystal Qual Scope

**Decision:** Crystal qual queries are scoped to the current org. Researchers
cannot query qual data from other orgs (obvious). But they CAN query across all
studies in their org if they ask a general question.

**Rationale:** Cross-study synthesis is a high-value use case ("What is the
most common qual theme across all studies in 2026?"). Multi-tenant isolation is
enforced at the embedding metadata level (`org_id` filter on every pgvector query).

### Decision 6: Incentive Currency

**Decision:** Default incentive currency is USD. International incentives are
supported via Tremendous's global gift card catalog, but the platform UI shows
amounts in USD. Conversion to local currency happens at delivery time.

**Rationale:** Multi-currency support in the UI adds significant complexity for
v1. Research teams in the US (our primary market) will not be affected. Document
known limitation for international teams.

---

## 7. Success Metrics and Instrumentation

Every user action is logged to the analytics pipeline. Key events:

| Event | Properties | Purpose |
|---|---|---|
| `study_created` | study_type, source (new/template) | Funnel entry |
| `study_launched` | participant_count, activity_count, credits_cost | Activation |
| `participant_responded` | activity_number, response_time_ms, word_count | Engagement |
| `study_closed` | response_rate, days_open, completed_count | Completion quality |
| `analysis_triggered` | study_id, corpus_size | AI usage |
| `theme_approved` | theme_count, edit_rate (% researcher edited AI name) | AI quality |
| `brief_exported` | format (pdf/pptx), theme_count | Value delivered |
| `crystal_qual_query` | query_text (hashed), result_quote_count | Crystal adoption |
| `qual_proposal_accepted` | proposal_id, launch_time_ms | Bridge adoption |
| `participant_completed` | study_type, day_count | Participant health |
| `participant_dropped_out` | drop_day, reason_code | Participant health |

**Key ratios to monitor:**

- **Invite → Completion rate:** participants who complete all activities / invited
  - Target: ≥40%. <30% = product intervention needed on invitation/activity design
- **Launch → Brief rate:** studies that generate an approved brief / launched studies
  - Target: ≥75%. <60% = analysis quality or UX friction problem
- **Theme edit rate:** % of AI-proposed theme names researchers change before approving
  - Target: <40%. >60% = AI theme quality problem
- **Time-to-brief:** study launch → executive brief approved by researcher
  - Target: ≤48 hours for a 5-day study
- **Crystal qual query per study:** Crystal questions asked per completed study
  - Target: ≥2 per study at 6-month mark. Zero queries = Crystal integration not adopted

---

## 8. Launch Readiness Checklist

### Engineering
- [ ] All 8 DB migrations applied and tested
- [ ] Multi-tenancy: zero data leakage in security audit
- [ ] Magic link security: JWT validation, TTL enforcement, replay prevention
- [ ] Credit debit: all study actions debit correctly with idempotent guards
- [ ] GDPR deletion cascade: verified end-to-end including pgvector
- [ ] Incentive delivery: gift card received by test participant
- [ ] Load test: 100 concurrent study launches without degradation

### AI Quality
- [ ] `propose_themes` precision/recall ≥70% vs. human-coded baseline on 10 test studies
- [ ] No fabricated quotes in 100-query Crystal qual test
- [ ] AI eval harness deployed and running on every merge to main
- [ ] Transcription accuracy ≥95% on clear audio test corpus

### UX/Design
- [ ] Full participant flow tested on iPhone 12, iPhone 15, Pixel 7, Samsung Galaxy S22
- [ ] Accessibility audit: WCAG 2.1 AA pass on all researcher screens
- [ ] Activity page tested on 3G connection (4s load time maximum)
- [ ] PDF export tested in Preview (Mac), Adobe Acrobat, and Google Drive
- [ ] PPTX export tested in PowerPoint 365 and Google Slides without formatting loss

### Legal/Compliance
- [ ] Consent text approved by Privacy Counsel
- [ ] Methodology disclosure text approved by CRO
- [ ] DPA template ready for enterprise customers
- [ ] Incentive payment tax handling reviewed and documented
- [ ] Data retention policy published in-app and in privacy policy

### Go-to-Market
- [ ] 10+ design partners have completed at least 2 studies
- [ ] 3 publishable case studies approved by design partners
- [ ] CRO white paper published or press-ready
- [ ] Product Hunt and HN launch assets ready
- [ ] CSM team trained; onboarding playbook written
- [ ] 5 activity templates live in the template library
- [ ] Quickstart video (4 min) recorded and embedded in onboarding flow
