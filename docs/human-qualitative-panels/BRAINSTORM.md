# Human Qualitative Panels — Multi-Persona Brainstorm

> **Date:** 2026-06-26  
> **Format:** Four expert perspectives on what an industry-leading solution requires.

---

## Perspective 1 — The Qualitative Research Scientist

*"I've moderated 500+ focus groups and coded 3,000 hours of interviews. I know
where qual platforms cut corners — and what it costs when they do."*

### What I Actually Need From a Platform

Qualitative research has a methodology problem when it goes digital: platforms
optimize for data collection but ignore the craft. Here is what the craft requires.

---

### Participant Recruitment Is Everything

Bad recruiting ruins a qual study more than bad questions. You can fix a question
mid-study; you cannot un-recruit the wrong participants.

**Screener design matters.** A screener survey that lets in the wrong participants
destroys the validity of everything that follows. The platform must support:
- Multi-condition screening logic (not just simple branching)
- Open-ended screener questions reviewed by a human before confirmation
- Quota management (screen until you hit N participants per segment)
- Soft-quotas (flag when a quota is getting full vs. hard-stop)
- Automatic duplicate detection (block people who've been in similar studies)

**Recruit from your own database first.**
The most powerful recruitment source is your existing survey respondents — they
are already opted in, already profiled, and already engaged with your brand.
A filter like "customers who gave CSAT < 7 in the last 90 days AND are enterprise
accounts" is not possible in any external panel provider. It is trivially possible
if qual lives inside the same platform as your surveys.

**Incentive management cannot be an afterthought.**
If participants are not paid promptly and appropriately, they ghost future studies.
The platform must handle: digital gift card delivery, incentive tracking per
participant, declined incentive handling, tax form collection for >$600 US (1099).

**Panel health over time.**
A quality qual panel is not a one-time list — it is a community that you actively
maintain. Track: response rate per participant, last invited date, last completed
date, cumulative incentive paid, panel fatigue signals (declining response quality
or rate), do-not-contact flags.

---

### Discussion Guide Design

Every qual method requires a discussion guide — the moderation script / prompt set.
This is not the same as a survey. A discussion guide is:
- Non-linear (moderator reads the room, not the script)
- Layered (probes follow up on participant responses dynamically)
- Stimulus-linked (show a concept, get a reaction, probe the reaction)

The platform must support guide creation that is **not a form builder**.
A guide has sections, probes within sections, conditional follow-ups, and attached
stimuli (images, videos, prototypes). It is a moderator's tool, not a participant's.

For async text communities, the guide becomes a sequence of "activities" posted
to participants over days: today they respond to an open prompt, tomorrow they
react to a concept, the day after they reply to other participants' responses.
This is fundamentally different from a survey — it is a moderated conversation.

---

### Analysis Is Where Everything Falls Apart

The biggest failure mode in qual platforms is that they collect rich data and then
make analysis the researcher's problem. Manual qualitative coding is:
- The #1 reason qual insights are late
- The #1 reason qual insights are shallow (teams code what is obvious, miss nuance)
- The #1 reason qual projects go over budget

**What AI-assisted analysis should do:**

*Auto-transcription with speaker diarization.*
Every video/audio session transcribed within minutes of completion, with speaker
labels. Accuracy must be >95% (comparable to professional transcription services)
to be trustworthy for research. Timestamps on every sentence for clip navigation.

*Thematic coding — assisted, not automated.*
AI should propose themes and tag quotes, but the researcher must approve. The
workflow is: AI surfaces candidate themes → researcher reviews + edits + merges →
codes are applied to a structured codebook. The AI does the first pass; the human
does the judgment. Never present AI-coded themes as final without human review.

*Quote surfacing.*
For each theme identified, surface the 3–5 strongest supporting verbatims. These
are the quotes that go into the stakeholder deck. The platform should make this
one click: "Find the best quotes for this theme."

*Clip creation from video.*
If a participant says something remarkable in a video session, the researcher
should be able to clip it in 10 seconds (drag a timeline range → save clip → add
to report). Video clips in stakeholder presentations land infinitely better than
typed quotes.

*Cross-participant pattern analysis.*
"How many of the 12 participants mentioned price as a concern?" should be instantly
answerable without reading all 12 transcripts. AI-powered frequency analysis across
participants, per theme.

*Longitudinal pattern detection.*
For diary studies and community studies running over days, the platform should
detect how responses evolve over time: "Price anxiety peaks on Day 1, but by Day 5
participants have rationalized it — the moment of doubt is Day 2–3."

---

### What We Are Currently Missing (XM Science Gaps)

- No participant panel management (profiles, history, health tracking)
- No discussion guide / activity builder (not the same as a survey builder)
- No async community / discussion board feature
- No video session integration
- No transcription pipeline
- No AI-assisted thematic coding
- No codebook management
- No quote surfacing
- No video clip creation
- No longitudinal activity sequencing for diary studies
- No incentive management

---

## Perspective 2 — The Product Owner / UX Researcher

*"I run qual research for a product team of 25. My job is continuous discovery —
talking to users fast enough to make good decisions."*

### My Core Jobs To Be Done

1. **Recruiting the right people in days, not weeks.**
   I need 8 enterprise customers who churned in the last 6 months for churn interviews.
   Right now I have to export from our CRM, manually email individuals, wait for replies,
   schedule in Calendly, and chase no-shows. This takes 3 weeks. It should take 3 days.

2. **Running async activities between sprints.**
   My sprint cycle is 2 weeks. A traditional qual study is 8 weeks. I need qual that
   moves at sprint speed — async activities that run for 5 days and give me directional
   answers before I commit to a design.

3. **Connecting what users say to what users do.**
   "Users say they want X" is the most dangerous phrase in product development. I need
   to triangulate qual insight with behavioral data. If my platform connects qual themes
   to CSAT, NPS, or survey scores, I can sanity-check what users say.

4. **Getting insights out of my head and into the team's.**
   I can't attend every meeting. I need qual insights to live somewhere the full team
   can access — not just in my Notion doc. Insights need to be searchable, linked to
   evidence, and surfaced in context.

---

### The Self-Serve UX I Need

**Recruitment as a filter, not a project.**
I should be able to open a filter UI — same mental model as filtering a CRM —
and say: "Give me customers who: rated usability < 4, are on the Enterprise plan,
have been customers > 12 months, haven't been in a study in 90 days, and are in
North America." The system matches from my survey respondent database, shows me
how many qualify, and lets me invite them with one click.

**Activity templates by method.**
I should not need to design a study from scratch every time. Templates:
- Unmoderated video interview (async video responses to questions)
- Async text community (3–7 day discussion prompt sequence)
- Concept test (show 3 options, get ranked reactions + open rationale)
- Diary study (daily prompts, image uploads, ratings)
- Moderated 1:1 interview (scheduler + video link + guide)

Each template provides the structure; I fill in the content.

**Five-day quick study.**
The bread and butter: recruit 8–12 participants, run 5 days of async activities,
get AI-synthesized themes on Day 6. This is my sprint-velocity qual method.
The platform should make this an obvious, named, well-supported workflow.

**AI synthesis I can actually use.**
After a study completes, I want a brief: 3–5 themes, top quote per theme, link to
the full transcript. Presented as a short document I can paste into Notion or send
to my PM. Not a 40-page research report.

**Crystal connection.**
I want to ask Crystal: "In this qual study, how many participants mentioned the
checkout flow as a pain point?" and get a direct answer with quotes. Same Crystal
I use for survey analysis — no context switching.

---

### What Makes This Self-Serve (Non-Negotiables)

| Requirement | Why It Matters |
|---|---|
| Recruit from existing respondent DB | Eliminates the 3-week recruiting bottleneck |
| Incentive delivery in-platform | No manual gift card process |
| Video scheduling built-in | No Calendly, no calendar juggling |
| Async activities (no scheduling required) | Fits sprint velocity; global participants |
| AI transcription auto-triggered | No manual upload to Otter.ai |
| AI theme brief on completion | Insight in hours, not weeks |
| Credit pricing, no contracts | Self-serve decision; no procurement |

---

### Product Gaps Today

| Gap | Priority | Notes |
|---|---|---|
| Participant recruitment from respondent DB | P0 | Core unlock — everything else depends on it |
| Study / activity builder | P0 | Distinct from survey builder |
| Async text activity (prompt + discussion) | P0 | Highest volume method |
| Incentive management | P0 | Without this, participant experience breaks |
| Video session scheduling + links | P1 | Calendar + video integration |
| Async video response (Loom-style) | P1 | Participants record themselves answering |
| AI transcription + theme brief | P0 | The analysis unlock |
| Crystal integration on qual data | P1 | Bridge to quant |
| Participant panel health tracking | P1 | Avoid fatigue, maintain quality |
| Concept testing stimuli upload | P1 | Images, videos, PDFs shown to participants |
| Diary study (daily prompt sequence) | P2 | Requires time-sequenced activity engine |
| Clip creation from video | P2 | High-value for stakeholder communication |

---

## Perspective 3 — The Customer

*"I'm a CX insights manager at a 1,200-person insurance company. I run our VoC
program. I have one analyst, a modest budget, and a VP who wants answers fast."*

### My World

My quantitative program is decent — we run NPS quarterly, post-transaction CSAT,
and employee pulse surveys. I can tell my leadership that our NPS is 32 and that
it dropped 6 points last quarter.

What I cannot tell them is why. And they always ask why.

Right now, when I need to understand why, I have two options:
1. Open-ended survey responses — which I read manually or try to analyze with
   whatever text analytics the platform has, which is usually mediocre.
2. Commission a focus group study — which costs $25,000 and takes 8 weeks.

Neither works for a quarterly business review cycle.

### What I Actually Want

**"Help me understand my detractors by Thursday."**
I ran our Q2 NPS survey. 18% are detractors. I need to know what's driving that
before I present to the CMO on Thursday. I want to send those detractors 3 open
prompts, get async text responses, and have the platform tell me the top 3 themes
by Wednesday afternoon. That is the use case. Everything else is noise.

**Participants I already know, not strangers.**
I don't want to recruit from an external panel of people who've never used our
product. I want to talk to MY customers — the ones who answered our NPS survey
two weeks ago. I have their contact information and their survey scores. Let me
invite the ones who rated us 1–4 to share more.

**Results I can put in a deck immediately.**
When the analysis is done, I want: a one-page brief with 3–5 themes, 2–3 verbatim
quotes per theme, and a methodology note. I can paste that into PowerPoint in 10
minutes. That is all I need.

**Transparent pricing.**
Tell me it costs 500 credits to invite 20 participants and run a 5-day async
study. I will decide if that's worth it. Don't make me talk to a salesperson.

**Make it feel like talking to people, not running a survey.**
The UX for participants needs to feel like a conversation, not a form.
When I send prompts, they should feel personal. When they respond, I should be
able to reply and dig deeper. That back-and-forth is what separates qual from quant.

---

### What I Fear (And How to Address It)

| Fear | Response |
|---|---|
| "Participants won't respond" | Incentive management + warm invitation flow + short activities |
| "The analysis is wrong" | AI themes always show source quotes; researcher approves before surfacing |
| "It's too complicated to set up" | Templates for the most common workflows, 3-step launch |
| "I can't get buy-in to use a new tool" | It lives inside the same platform as their NPS surveys |
| "What if participants say something offensive or off-topic?" | Moderation flags, automatic content safety filter |
| "Is this data GDPR-compliant?" | Explicit consent at participation, data retention controls, right-to-delete |

---

## Perspective 4 — The AI Engineer

*"I have to build this. Here is what the architecture actually requires — and where
the hard problems live."*

### The Hard Problems

---

**1. The study state machine is complex.**

A qual study is not a survey. A survey has a start and end. A study has:
- A recruitment phase (recruit → screen → invite → confirm → schedule)
- An active phase (prompt sequence, participant responses, moderation, follow-ups)
- An analysis phase (transcription, coding, synthesis)
- A sharing phase (report generation, stakeholder delivery)

Each phase has independent state transitions. Participants can be in different
phases simultaneously. The system must handle: ghosting (invited but never
confirmed), drop-out (confirmed but quit mid-study), late submissions (submitted
after the study period), and revision requests (researcher asks for more detail).

This is a workflow engine problem — more like a CRM campaign than a survey pipeline.

```
Participant state machine:
  invited → screened → qualified/disqualified → confirmed → 
  active → completed/dropped_out

Study state machine:
  draft → recruiting → active → analysis → complete → archived
```

---

**2. Async activity sequencing.**

A 5-day async text community runs like this:
- Day 1, 9am: send "What's your biggest frustration with X?" prompt to all participants
- Day 2, 9am: send "React to these 3 concept statements" prompt
- Day 3, 9am: optionally, show participants each other's Day 1 responses and ask for reactions (social layer)
- Day 4: moderator review, optional manual follow-up to specific participants
- Day 5: final prompt + close

This requires a time-sequenced activity engine with:
- Per-participant state (have they responded to Day 1 yet?)
- Conditional unlocks (Day 3 prompt only unlocks after Day 1 response)
- Moderator interrupt (researcher can add a follow-up prompt to a specific participant between scheduled activities)
- Timezone-aware delivery (9am in the participant's timezone, not the researcher's)

No existing Experient infrastructure handles this. A new `study_activities` +
`participant_activity_state` data model is required.

---

**3. Transcription pipeline.**

For video and audio sessions, we need a transcription pipeline:
- Integrate with a speech-to-text provider (Whisper API or Assembly AI — both
  are good options; Whisper is cheaper, Assembly has better speaker diarization)
- Handle: MP4, WebM, WAV, MP3 input formats
- Output: timestamped transcript with speaker labels
- Storage: transcripts stored as structured JSON (not just plain text) so timestamps
  are queryable for clip creation
- Async processing: transcription is not instant; poll or webhook pattern required
- Cost: ~$0.006/minute (Assembly AI) = ~$0.54 for a 90-minute session — cheap enough
  to auto-trigger on every session completion

---

**4. AI-assisted thematic coding.**

This is the highest-value AI feature and the hardest to get right.

The naive approach: throw all transcripts at an LLM and ask for themes.
The problem: LLMs are inconsistent on long documents, miss rare-but-important
themes, and don't let the researcher guide the codebook.

The right approach is a researcher-in-the-loop coding workflow:

```
Step 1: AI proposes candidate themes (with supporting quotes for each)
         — LLM reads all transcripts, proposes 8-15 candidate themes
         
Step 2: Researcher reviews, edits, merges, adds themes
         — UI: drag themes to merge, rename, delete low-value, add custom
         
Step 3: AI applies approved codebook to all transcripts
         — For each approved theme, tag every supporting quote in every transcript
         
Step 4: Researcher spot-checks coding
         — Review flagged ambiguous quotes; override individual codes
         
Step 5: Frequency table + representative quotes surfaced per theme
```

This requires: a structured `codebook` data model, a `coded_quotes` junction
table (quote × theme × confidence), a UI for codebook management, and two
CrystalOS skill calls (propose + apply).

---

**5. Crystal integration on qual data.**

The vision: Crystal should treat qual data as a first-class input alongside
survey data. Today Crystal analyzes survey responses. Tomorrow it should be
able to answer: "Across these 15 interview transcripts, what are the most
common objections to our pricing?"

This requires:
- Qual data indexed in the same way as survey open-ends (chunked, embedded)
- Crystal tools that can search across both quant and qual corpora
- A synthesis prompt that knows it is working with richer, more contextual data
  than survey responses

The storage pattern: chunks of qual text stored with embeddings in pgvector,
tagged with `source_type: 'qual_interview' | 'async_response' | 'diary_entry'`,
linked to the study and participant. Crystal retrieves via semantic search +
source type filter.

---

**6. The participant experience app.**

Participants need a consumer-grade experience, not a researcher's tool. When
they receive an invitation, they land on:
- A warm, branded invitation page (org's logo, friendly copy)
- A consent form (clear, plain language — GDPR/CCPA compliant)
- A screener (if configured)
- A confirmation screen with what to expect + incentive disclosed

When they receive a study prompt:
- Email/SMS notification with preview of the prompt
- One-click to the activity page (no login required — magic link)
- Mobile-first activity UI (most participants will be on phone)
- Simple text/image/video response depending on activity type
- Instant confirmation + progress indicator ("Activity 2 of 5 complete")

This is effectively a separate participant-facing app (or at minimum a distinct,
minimal-chrome UX path) that shares the backend but differs completely from the
researcher-facing admin UI.

---

### New Schema Required

```sql
-- Qual studies (the top-level container)
qual_studies
  id, org_id, title, status, method_type, survey_id (optional link),
  screener_id, target_n, confirmed_n, created_by, created_at

-- Panel of participants for a study
qual_participants
  id, study_id, org_id, respondent_id (FK to survey respondents, optional),
  email, name, external_id, status, incentive_amount, incentive_status,
  consent_at, screener_passed, created_at

-- Activities (the time-sequenced prompt sequence)
qual_activities
  id, study_id, activity_type,  -- open_prompt|concept_test|discussion|diary
  title, prompt_text, stimuli JSONB,  -- images/video URLs shown to participant
  unlock_condition JSONB,  -- e.g. {after_day: 2, requires_activity_id: X}
  scheduled_at, sent_at, close_at

-- Participant responses to activities
qual_responses
  id, activity_id, participant_id, study_id,
  text_response TEXT,
  video_url TEXT, audio_url TEXT,
  media_urls JSONB,  -- uploaded images
  numeric_rating INT,  -- for concept test ratings
  submitted_at, updated_at

-- Sessions (scheduled 1:1 or group calls)
qual_sessions
  id, study_id, moderator_id,
  scheduled_at, duration_mins, video_link, recording_url,
  transcript_status,  -- pending|processing|complete
  transcript_json JSONB,  -- timestamped speaker-labeled transcript
  created_at

-- Thematic codebook per study
qual_codebook_themes
  id, study_id, name, description, color,
  parent_theme_id,  -- for sub-themes
  created_by, is_ai_proposed, approved_at, created_at

-- Coded quotes (AI + human tagging of quotes to themes)
qual_coded_quotes
  id, theme_id, study_id, participant_id,
  source_type,  -- 'async_response' | 'session_transcript' | 'diary'
  source_id,  -- FK to qual_responses or qual_sessions
  quote_text TEXT,
  quote_start_ms INT,  -- for video clips
  quote_end_ms INT,
  confidence NUMERIC,
  is_representative BOOLEAN,  -- researcher-flagged as a top quote
  created_at

-- Incentive ledger
qual_incentive_transactions
  id, study_id, participant_id, amount, currency,
  delivery_method,  -- 'tango_card' | 'paypal' | 'manual'
  delivery_status, delivered_at, created_at
```

---

**7. Model selection for qual tasks.**

| Task | Model | Notes |
|---|---|---|
| Theme proposal from transcripts | Claude Sonnet | Long context, nuanced judgment |
| Quote tagging (codebook application) | Claude Sonnet | Accuracy critical |
| Transcript summarization | Haiku 4.5 | Speed + cost for short summaries |
| Crystal qual queries | Claude Sonnet | Same as existing Crystal |
| Discussion guide suggestions | Claude Sonnet | Creative + methodologically aware |

---

### CrystalOS Skills Required

| Skill | Function |
|---|---|
| `propose_themes` | Read all responses for a study → propose candidate themes with evidence |
| `apply_codebook` | Given approved codebook → tag all quotes across all responses |
| `synthesize_study` | Generate executive brief: N themes, top quotes, frequency table |
| `qual_query` | Crystal conversational access to qual data (semantic search + synthesis) |
| `suggest_follow_up` | Given a participant response → propose 3 follow-up probes for moderator |
| `diary_pattern_detect` | Across diary entries over time → detect how responses evolve day by day |

---

## Cross-Cutting: The Qual-Quant Bridge

This is the feature that makes Experient categorically different from every
standalone qual platform. No dedicated qual tool has it. No pure-quant XM
platform has invested in qual deeply enough to build it.

**The closed loop:**

```
QUANT SIGNAL
Crystal detects NPS drop of 8 points in enterprise segment
     │
     ▼
CRYSTAL PROPOSES QUAL INVESTIGATION
"Enterprise NPS dropped 8 pts. Recommend: recruit 12 enterprise accounts
 who rated 1-5 for async interviews. Estimated cost: 600 credits."
[Approve] [Modify] [Dismiss]
     │
     ▼
RECRUITMENT
Platform identifies 47 qualifying respondents from NPS survey
Researcher approves subset of 15 → system sends invitations
12 confirm and complete the study
     │
     ▼
QUAL ANALYSIS
Crystal analyzes 12 participants' responses:
Theme 1: "Unexpected price increases at renewal" — 9/12 participants
Theme 2: "Onboarding rework after new team member" — 6/12
Theme 3: "Feature gaps vs. Competitor X" — 4/12
     │
     ▼
THEMES TAGGED BACK TO QUANT
"Unexpected price increases" → linked to the enterprise cohort in NPS data
Next NPS survey wave includes: "How satisfied are you with pricing transparency?"
Crystal monitors that new question as a leading indicator
     │
     ▼
LOOP CONTINUES
Quant tracks the metric. Qual explains the next anomaly.
Crystal proposes the next investigation.
```

This is the product vision. Every other qual platform is a destination.
Experient is a loop.

---

## Differentiation Summary

| Feature | Experient | UserTesting | Qualtrics Qual | dscout |
|---|---|---|---|---|
| Recruit from own survey respondents | YES | No | Partial | No |
| Async text community | YES | No | No | No |
| Diary study | YES | No | No | YES |
| AI thematic coding (researcher in loop) | YES | No | No | No |
| Crystal conversational qual analysis | YES | No | No | No |
| Quant-qual bridge (auto-investigate signals) | YES | No | No | No |
| Self-serve, credit-based pricing | YES | Partial | No | No |
| Video interviews | YES | YES | YES | No |
| In-platform incentive management | YES | Partial | No | Partial |
| Mobile-first participant experience | YES | YES | No | YES |

---

## Phased Build Plan

### Phase HQ-1: Async Text Qual (6–8 weeks)
The highest-value, lowest-complexity method. Covers 70% of the use cases.
- Participant recruitment from respondent DB
- Activity builder (open prompt sequences)
- Participant-facing magic link experience (mobile-first)
- Incentive delivery (Tango Card / gift card API)
- AI theme brief on completion (Crystal skill: `propose_themes` + `synthesize_study`)
- Credits metering (per-participant + per-analysis)

### Phase HQ-2: Sessions + Transcription (4–5 weeks)
- Calendar scheduling (Calendly-style built-in or Calendly integration)
- Video link generation (Zoom / Google Meet integration or native WebRTC)
- Auto-transcription on session completion (Assembly AI)
- Transcript viewer with quote clipping
- `apply_codebook` skill for session transcripts

### Phase HQ-3: Concept Testing + Advanced Analysis (4 weeks)
- Stimuli upload (images, video, PDF shown to participants)
- Concept test activity type (rate + react + rank)
- Codebook management UI (researcher edits AI-proposed themes)
- Quote surfacing UI (representative quotes per theme)
- Video clip creation from timestamped transcript

### Phase HQ-4: Crystal Qual-Quant Bridge (3–4 weeks)
- Crystal `qual_query` skill (conversational access to qual data)
- Automatic qual investigation proposals from quant signals
- Theme tagging back to quant metrics
- Mixed-method report (qual themes + quant data in one view)

### Phase HQ-5: Diary Studies + Longitudinal (4 weeks)
- Time-sequenced activity engine (day-by-day unlock conditions)
- `diary_pattern_detect` skill (evolution of responses over time)
- Longitudinal study dashboard (participant engagement over study duration)
- Panel health tracking (fatigue signals, lifetime incentive totals)

---

## Open Questions

1. **Video hosting.** Where does recording video live? S3-compatible OCI Object
   Storage (already in the infra plan) makes sense. Streaming playback requires
   signed URLs with short TTL. Confirm storage budget at scale.

2. **Incentive legal.** In the US, incentive payments >$600/year per participant
   require a 1099 form. Do we handle this in-platform or tell customers it's their
   responsibility? Likely needs legal review before launch.

3. **GDPR + right to deletion.** Qual data (transcripts, responses) contains rich
   PII. Participant deletion must cascade to all qual tables and remove from any
   vector embeddings. This is non-trivial — design the deletion path before Phase HQ-1.

4. **The participant community app.** Is this a separate mobile app, a mobile-optimized
   web experience, or embedded in a PWA? Recommendation: mobile-first web (PWA) via
   magic link. No app download friction for participants.

5. **Moderation safety.** Participants can submit offensive or off-topic content.
   Automatic content moderation (OpenAI moderation API or equivalent) should flag
   before researcher sees — but never silently delete without researcher review.

6. **Pricing.** Qual is harder to price per-unit than quant. Proposed model:
   - Per-participant activation: 50 credits (recruitment + incentive tracking overhead)
   - Per-activity-response: 10 credits per response received
   - AI theme brief: 100 credits per study
   - AI transcript analysis: 25 credits per hour of audio
   Validate against actual compute + incentive costs before shipping.

7. **The hardest problem: participant response rates.**
   External panel providers achieve 15–25% response rates on email invitations.
   Recruiting from your own respondent base should be higher (30–50%) because
   the relationship already exists. But if response rates are low, the product
   fails regardless of how good the analysis is. Plan for A/B testing invitation
   copy and incentive amounts from day one.
