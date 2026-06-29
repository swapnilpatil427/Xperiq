# Human Qualitative Panels — Hiring Plan

> **Scope:** Human Qualitative Panels only.  
> **Date:** 2026-06-26  
> **Philosophy:** Every role is written for the person who has done it at the highest
> level — not the person who will learn on the job. "Top notch" means you have shipped
> the thing, not studied it.

---

## Role Summary (28 Roles Across 3 Waves)

| # | Role | Function | Wave | Level |
|---|---|---|---|---|
| 1 | Chief Research Officer | XM Science | 1 | C-Level |
| 2 | Head of Product — Qual Panels | Product | 1 | Director/VP |
| 3 | Head of Design | Design | 1 | Director |
| 4 | Head of AI Engineering | Engineering | 1 | VP |
| 5 | Principal Qualitative Methodologist | XM Science | 1 | Staff/Principal |
| 6 | Senior Qualitative Research Scientist | XM Science | 1 | Senior |
| 7 | Senior AI Engineer — NLP & Qual Analysis | AI Engineering | 1 | Senior |
| 8 | Senior AI Engineer — Transcription & Media | AI Engineering | 1 | Senior |
| 9 | Senior Full-Stack Engineer (React/TypeScript) | Engineering | 1 | Senior |
| 10 | Senior Backend Engineer (Node.js/TypeScript) | Engineering | 1 | Senior |
| 11 | Senior Python Engineer — CrystalOS | Engineering | 1 | Senior |
| 12 | Senior Product Designer | Design | 1 | Senior |
| 13 | Senior PM — Human Qual Panels | Product | 1 | Senior |
| 14 | Behavioral Scientist | XM Science | 2 | Senior |
| 15 | AI Evaluation Engineer — Qual Quality | AI Engineering | 2 | Senior |
| 16 | Data Engineer | Engineering | 2 | Senior |
| 17 | UX Researcher | Design | 2 | Senior |
| 18 | VP of Marketing | Marketing | 2 | VP |
| 19 | Head of Content & Thought Leadership | Marketing | 2 | Director |
| 20 | Product Marketing Manager | Marketing | 2 | Senior |
| 21 | Demand Generation Manager | Marketing | 2 | Senior |
| 22 | VP of Sales | Sales | 2 | VP |
| 23 | Solutions Consultant / Sales Engineer | Sales | 2 | Senior |
| 24 | Enterprise Account Executive (×2) | Sales | 2 | Senior |
| 25 | Customer Success Manager — Research | Success | 2 | Senior |
| 26 | Privacy & Research Ethics Counsel | Legal | 2 | Counsel |
| 27 | Head of Partnerships | Partnerships | 3 | Director |
| 28 | Community & Participant Experience Manager | Operations | 3 | Senior |

---

## Wave 1 — Build the Foundation (Hire in Months 1–3)

These 13 people build the product. No generalists. Every person has domain depth
that is hard to teach.

---

### 1. Chief Research Officer (CRO)

**The most important hire on this list.**

The Human Qual Panel product will be dismissed as "AI summarizing text" without
a credible methodologist at the helm. The CRO is the scientific credibility anchor —
the person enterprise research buyers trust before they trust the product.

**What top notch looks like:**
- PhD in qualitative methods, social psychology, or anthropology — not a nice-to-have;
  it signals that they have done the hard methodological work, not just managed projects
- Has conducted primary qualitative research themselves — moderated focus groups,
  coded transcripts, designed diary studies — not just overseen it
- 10–15 years spanning both rigorous academia and commercial research:
  think someone who started at a university qual methods lab, moved to a consultancy
  like IDEO, Ipsos UU, or Kantar Consulting, and has since been at a technology
  company (Qualtrics, UserTesting, dscout, or equiv.)
- Has been on the buyer side — they understand why enterprise research directors
  are skeptical of AI-coded themes and what it takes to earn their trust
- Is an active voice in the qual research community: ESOMAR speaker, AQRP member,
  writes for Greenbook or Quirks, has a point of view on AI and research ethics
- Red flags: someone who has only managed qual vendors, or who confuses "I ran a
  focus group" with "I understand qualitative epistemology"

**They own:**
- Methodological standards for every feature — what does a "valid" AI-coded
  codebook look like? What makes an async community design defensible?
- Methodology review on every customer-facing claim about AI accuracy
- External credibility: conference talks, white papers, the voice that says
  "this is how AI should be used in qual research"
- The veto on anything that makes methodological claims we cannot defend
- Long-term: building the research science function as the company scales

**Ideal profile:** Chief Methodologist or VP Research Science at Qualtrics, Ipsos,
or UserTesting who has spent the last 3 years thinking hard about what AI can and
cannot do for qualitative data.

---

### 2. Head of Product — Qual Panels

**What top notch looks like:**
- Has shipped a self-serve research platform that researchers actually love using —
  UserTesting, dscout, Remesh, Dovetail, Condens, or Qualtrics qual modules
- Understands the researcher workflow end-to-end — from study design through
  recruitment through fieldwork through analysis through stakeholder presentation —
  because they have watched real researchers do it dozens of times
- Has written a usage-based or metered pricing model for a research product and
  understands the self-serve → enterprise expansion motion
- Does discovery that goes three layers deep: the stated need, the underlying job,
  and the unstated constraint that makes standard solutions fail
- Background: has shipped into both UX researchers (who move at sprint speed)
  and market researchers (who move at quarterly cycle speed) — these are different
  users with different needs, and conflating them is a common PM failure

**They own:**
- Product strategy and roadmap for the qual panels platform
- Deep customer discovery with research buyers
- Specs that are detailed enough that engineering can build without constant
  clarification — annotated wireframes, not three-sentence tickets
- Coordination with the CRO on methodology and with Head of Design on UX
- Success metrics: studies completed, themes surfaced, time-from-launch-to-insight

---

### 3. Head of Design

**What top notch looks like:**
- Has designed a research or data analysis tool where information density and
  progressive disclosure are the core design challenge — not a marketing website
  or consumer app
- Has designed two distinct UX contexts that must coexist: an admin/researcher
  experience (complex, feature-rich, tolerates density) and a participant
  experience (consumer-grade, zero friction, mobile-first)
- Portfolio that demonstrates: they can make confidence and uncertainty beautiful;
  they know when a quote block communicates more than a bar chart; they have
  solved the "too much data, nowhere to look" problem
- Has run participatory design sessions with real researchers — not just observed
  users, but co-designed with them
- Background: principal or head of design at Dovetail (qual analysis tool),
  Notion (complex structured documents), Figma (tool for professionals),
  UserTesting, or a top research + design consultancy (IDEO, Frog, Fjord)

**They own:**
- The design system for the qual panels platform — every component, pattern, and
  interaction model
- Researcher-facing UX: study builder, activity sequencing, codebook management,
  results dashboard, video viewer with clip creation
- Participant-facing UX: invitation, consent, activity completion, confirmation —
  everything a participant touches must feel like a well-designed consumer app
- Design QA before anything ships
- Ultimately hiring and building a design team as the platform scales

---

### 4. Head of AI Engineering

**What top notch looks like:**
- Has built an AI product that processes unstructured human language — not a
  classifier or recommender system, but a system that reads what humans say and
  produces structured, actionable insight from it
- Has faced the quality problem in production: the AI surface meaningful things
  sometimes and noise other times, and this person has designed systems to measure
  and improve that ratio systematically
- Deep on LLMs for long-document analysis: chunking strategies, retrieval-augmented
  synthesis, how to handle 40-page transcripts without losing context
- Understands the "researcher in the loop" design pattern — AI that assists a
  human expert rather than replacing their judgment
- Background: Head of AI at a qual analysis platform (Dovetail, Notably, or equiv.),
  AI lead at a research-heavy enterprise product, or a senior AI engineer from
  Anthropic / Cohere who has moved into a product leadership role

**They own:**
- AI architecture: how thematic coding, synthesis, and Crystal qual queries work
- Model selection and evaluation — which model for which task, and how we know
  if the output is good
- The technical credibility that makes enterprise buyers trust the AI claims
- Hiring and growing the AI engineering team

---

### 5. Principal Qualitative Methodologist

**The bridge between research science and engineering.**

Without this person, AI engineers will build technically impressive but
methodologically wrong systems. They translate how qual research actually works
into specifications that engineers can implement.

**What top notch looks like:**
- Deep practitioner: has designed and run large-scale async text communities
  (100+ participants, 7+ days), diary studies, and IDI programs — not as a PM
  overseeing them, but as the research lead responsible for methodology and quality
- Has a structured, teachable process for thematic coding — not "I read the
  transcripts and themes emerge," but a codebook-based process with inter-rater
  reliability checks that they can specify precisely enough for an AI to follow
- Can write the spec for what a "good" AI-coded theme looks like: what is the
  minimum evidence threshold? When should two themes merge? How do you distinguish
  a theme from a single interesting quote? These are the exact questions an AI
  engineer will ask.
- Has strong opinions about where qual analysis tools fall short — and can explain
  specifically, technically, what needs to be different
- Background: Senior qual research lead at Ipsos UU, Kantar Consulting, Microsoft
  Research, Google UX Research, or Airbnb Research — someone who runs qual programs
  at scale and has thought hard about methodology rigor

**They own:**
- The specification for AI-assisted thematic coding workflow — what AI proposes,
  what the researcher approves, what the quality bar is
- Activity template design: what does a methodologically sound 5-day async
  community look like? A diary study? A concept test?
- Discussion guide builder requirements — what is structurally different from a survey?
- Quality review of AI-generated themes in early development

---

### 6. Senior Qualitative Research Scientist

**The practitioner who validates everything we build.**

If the Principal Methodologist writes the spec, this person runs studies against it
and catches every gap between what was designed and how researchers actually use it.

**What top notch looks like:**
- Has moderated 50+ focus groups and run 20+ in-depth interview programs
- Has run async online qual communities using existing tools (Recollective, QualBoard,
  Rival Technologies) and has a precise list of where those tools fail
- Has used NVivo, MAXQDA, or Dovetail for thematic coding and knows what a
  researcher actually does in an analysis session — the habits, the shortcuts, the
  moments of doubt
- Has recruited participants for a hard-to-reach segment and knows the practical
  realities of response rates, screening, and incentive management
- Speaks the language of research buyers: can walk into a VP Research meeting and
  be immediately credible as a peer

**They own:**
- Continuous discovery: running real qual studies on the platform during development
  and surfacing gaps before customers find them
- Participant experience QA: does the invitation email actually feel warm? Is the
  activity page confusing to a 55-year-old participant on an iPhone?
- Input on every qual-related AI output: are these themes real, or are they AI
  artifacts? Is this quote representative, or cherry-picked?
- Thought leadership content in partnership with the Head of Content

---

### 7. Senior AI Engineer — NLP & Qualitative Analysis

**The core AI builder for qual analysis.**

**What top notch looks like:**
- Has built a thematic analysis or qualitative coding system — not a sentiment
  classifier, not topic modeling, but a system that identifies meaningful themes in
  human conversational data and supports a human researcher's review workflow
- Deep in LLM use for long-document understanding: knows chunking strategies,
  knows how to preserve context across a 40-page transcript, has solved the
  "LLM produces confident but wrong themes" problem with concrete engineering solutions
- Has built a human-in-the-loop annotation workflow where the AI proposes and the
  human approves — understands the UX and data model challenges of that pattern
- Strong Python, LangGraph or equivalent, pgvector, embedding pipelines
- Background: NLP research engineer at a qual analysis platform (Dovetail, Notably,
  Condens), or ML engineer who has worked on document understanding at a research-
  heavy company

**They own:**
- `propose_themes` and `apply_codebook` CrystalOS skills
- Transcript chunking, embedding, and semantic indexing pipeline
- `synthesize_study` brief generation (the executive brief that goes to stakeholders)
- `qual_query` — Crystal conversational access to qual data ("what did participants
  say about pricing?")
- `suggest_follow_up` — AI-suggested follow-up probes for moderators in live sessions

---

### 8. Senior AI Engineer — Transcription & Media

**What top notch looks like:**
- Has built an audio/video processing pipeline in production — ingestion, format
  conversion, STT integration, speaker diarization, transcript structuring
- Has integrated with Assembly AI, Deepgram, or Whisper at scale and knows the
  practical tradeoffs (accuracy vs. latency vs. cost; speaker diarization quality;
  handling accents and domain-specific vocabulary)
- Has designed async media processing with webhook patterns — the transcription job
  runs in the background; the system updates state and notifies when complete
- Knows timestamped transcript storage: not just plain text, but structured JSON
  where every word has a timestamp — enabling clip creation, quote linking, and
  playhead-synchronized reading
- Background: AI engineer at a video platform, podcast/media company, or sales
  intelligence tool (Gong, Chorus) where transcription is the core product

**They own:**
- Full transcription pipeline: video/audio ingestion → STT → diarization → structured JSON
- Signed URL serving for video playback (OCI Object Storage or equiv.)
- Quote-to-timestamp linking (click a quote, jump to that moment in the video)
- Clip creation support (start/end timestamps → shareable clip)
- `diary_pattern_detect` — detect how responses evolve across days in a diary study

---

### 9. Senior Full-Stack Engineer (React / TypeScript)

**What top notch looks like:**
- Ships high-quality, accessible React UIs with real design sense — not just
  functional code, but components that feel right to use
- Has built complex, state-heavy interfaces: multi-step wizards, real-time progress
  states, conditional UI flows, drag-and-drop sequencing
- Has designed a mobile-first participant experience — understands the constraints
  of a 390px screen, fat thumbs, and an impatient participant who received an
  invitation email on their phone
- Has worked on a data-intensive dashboard: charts, filtering, exports, paginated
  lists — and knows how to present complex qual data without overwhelming the
  researcher
- Background: product engineer at Dovetail, UserTesting, dscout, Hotjar, or any
  research/analytics tool with strong design culture

**They own:**
- All new React components under `app/src/components/panels/`
- Study builder wizard UI
- Participant-facing activity experience (mobile-first web app, magic link entry)
- Results dashboard: themes, quotes, participant breakdown, transcript viewer
- Video player with timestamped transcript + clip creation UI

---

### 10. Senior Backend Engineer (Node.js / TypeScript)

**What top notch looks like:**
- Strong Postgres data modeling — has designed multi-tenant, multi-state workflow
  schemas; has solved the "participant is in 5 different states simultaneously
  across 3 activities" problem
- Has built a state machine system (participant: invited → screened → confirmed →
  active → completed; study: draft → recruiting → active → analysis → complete)
- API discipline: idempotency, proper pagination, webhook design, event sourcing
  for audit trails
- Has worked with a metered billing or credit system and understands the debit
  logic, preflight checks, and reconciliation requirements
- Has handled personal data at scale: GDPR-compliant deletion cascades, data
  export, anonymization — this is not optional when the data is interview transcripts

**They own:**
- `routes/qual-studies.ts` — all study lifecycle endpoints
- `routes/qual-participants.ts` — participant management, state transitions
- `routes/qual-activities.ts` — activity sequencing and time-gated unlock logic
- Incentive delivery integration (Tango Card / Tremendous API)
- All new DB migrations for the 8 qual tables
- GDPR deletion cascade: participant delete → responses → transcript chunks → embeddings

---

### 11. Senior Python Engineer — CrystalOS

**What top notch looks like:**
- Expert in FastAPI + LangGraph: has built multi-step, long-running AI pipelines
  with proper error handling, retry logic, and partial-completion recovery
- Understands async task management: the qual study analysis pipeline runs for
  minutes; the system must emit progress events, handle failures gracefully, and
  resume from checkpoint
- Has worked with large language model context management for long-document tasks:
  knows when to use full-document vs. chunked-retrieval approaches and why
- Background: AI platform engineer or senior backend engineer who has moved into
  LLM orchestration — someone who treats the pipeline as production software, not
  a Jupyter notebook

**They own:**
- `graphs/qual_study.py` — full LangGraph analysis pipeline
- All CrystalOS skills for qual panels: propose_themes, apply_codebook,
  synthesize_study, qual_query, suggest_follow_up, diary_pattern_detect
- Integration with existing `agent_runs` infrastructure and progress event emission
- Transcript embedding and pgvector indexing pipeline

---

### 12. Senior Product Designer

**What top notch looks like:**
- Masters progressive disclosure in complex tools — knows when to show advanced
  options and when to hide them, knows when a modal is the right pattern and
  when an inline drawer works better
- Has designed a codebook or annotation interface — a UI where a professional
  tags, organizes, and edits structured knowledge extracted from unstructured data
- Has strong opinions about typography and readability for long-form text —
  because qual analysis is reading-intensive, and bad typography causes real errors
- Works fluidly in Figma, delivers annotated specs that engineering can build
  without constant clarification, and is present enough in engineering to catch
  implementation drift before it ships
- Background: product designer at Dovetail, Notion, Linear, or an enterprise
  analytics/research tool

**They own:**
- Figma component library for qual panels
- All screens from study builder through results dashboard
- The participant-facing design: invitation, consent, activity, completion
- Continuous design review during engineering sprints

---

### 13. Senior PM — Human Qual Panels

**What top notch looks like:**
- Has shipped a qual research product that researchers use in production — not a
  feature inside a survey tool, but a product where qual is the core workflow
- Runs discovery at the right layer of abstraction: not "what features do you
  want?" but "walk me through the last qual study you ran — where did you
  almost give up?"
- Has written specs detailed enough that engineers don't need to guess: edge cases
  are listed, error states are described, the participant state machine is mapped
- Thinks in jobs and outcomes, not features: "researchers need themes in 6 hours,
  not 6 days" → "that means AI coding must run in the background, researcher gets
  notified, one-click review UI"
- Background: PM at dscout, Dovetail, UserTesting, Remesh, or Qualtrics Research Core

---

## Wave 2 — Ship and Go to Market (Hire in Months 3–6)

---

### 14. Behavioral Scientist

Understanding how real people behave in qual research — why some participants
ghost, why response quality degrades over long diary studies, why social
desirability bias distorts responses in group settings — is essential for
designing studies that produce valid data. This person brings that science
to the product.

**Background:** PhD behavioral economics or social psychology. Industry work at
a behavioral consultancy (ideas42, BEworks) or research role at a tech company.
Can write: "Activity 2 should be unlocked only after Activity 1 is complete,
because the priming effect from Activity 1 is required for Activity 2 to produce
valid responses." That is the level of specificity needed.

---

### 15. AI Evaluation Engineer — Qual Quality

**The person who makes sure the AI is actually right.**

Thematic coding by AI will be wrong sometimes. This engineer builds the automated
evaluation harness that catches quality regressions before customers see them —
comparing AI-coded themes to human-coded ground truth, measuring precision and
recall on theme extraction, and ensuring quote attribution is accurate.

**Background:** ML evaluation engineering at an AI lab or quality-critical AI
product. Has built eval harnesses for qualitative AI output, not just classification
metrics. Understands inter-rater reliability and can translate it into an automated
evaluation framework.

---

### 16. Data Engineer

Qual studies generate rich, high-volume, unstructured data: transcripts, diary
entries, coded quotes, participant responses, embeddings. A data engineer owns the
pipeline that makes this data queryable, exportable, and available to Crystal.

**Background:** Data engineering at a research or analytics platform. Comfortable
with unstructured text pipelines, pgvector embeddings, and event-driven architecture
for long-running study jobs.

---

### 17. UX Researcher

The platform is built FOR researchers — it must be continuously validated BY real
researchers using it. This UX Researcher runs discovery with customers, tests new
concepts in Figma before engineering starts, and maintains the research repository
that informs every product decision.

**Background:** UX research at a B2B SaaS or research tools company. Has run both
moderated sessions and unmoderated usability tests. Can present findings to product
and engineering in a way that actually changes decisions.

---

### 18. VP of Marketing

**Why this is the most important wave 2 hire.**

Qual panels are a crowded space. UserTesting, dscout, Dovetail, Remesh — all
are well-funded and well-known. The VP of Marketing is not executing a playbook;
they are writing one that positions Experient as the platform that finally connects
qual to quant in a self-serve, AI-native product.

**What top notch looks like:**
- Has built a content-led demand generation engine in the research or insights
  technology category — not just B2B SaaS generically, but specifically targeting
  VP Research, CX Insights Managers, or UX Research Leads
- Has created genuine thought leadership content that research professionals actually
  read and share — not just company blogs and case studies, but methodology papers,
  webinars with the CRO, POVs on AI in qualitative research that get cited at
  ESOMAR
- Has managed product marketing + demand gen + content as a single integrated
  function — not siloed
- Has experience with a self-serve + enterprise sales-assisted hybrid motion:
  knows how to nurture a credits trial user into an enterprise deal
- Background: VP Marketing at UserTesting, Dovetail, Qualtrics (qual division),
  or a fast-growing research tech startup

**They own:**
- Category positioning: Experient is not "another qual tool" — what is it?
- Content engine: the blog, white papers, conference talks, the CRO's LinkedIn
- Demand gen: how trial users are acquired, nurtured, and handed to sales
- GTM readiness for every feature launch
- Brand: what Experient stands for in the research community

---

### 19. Head of Content & Research Thought Leadership

Research buyers read. They read Quirks, Greenbook, Research World, and the LinkedIn
feeds of methodologists they trust. This person creates the content that makes
Experient the credible voice on AI-assisted qualitative research — driving organic
demand from exactly the buyers we want.

**What top notch looks like:**
- Has written content that research professionals share with their peers — not
  just content they scroll past
- Understands qualitative methodology deeply enough to write about it credibly
  (or to edit and shape the CRO's thinking into accessible, compelling content)
- Can run a content calendar that includes: deep methodology articles, customer
  success stories with real data, webinar series with the CRO, and conference
  session pitches to ESOMAR and Greenbook
- Background: senior editor at a research industry publication, Head of Content
  at a research tech company, or a former researcher who discovered they love writing

---

### 20. Product Marketing Manager

Every feature ships with a story. The PMM writes it: positioning, competitive
battlecards, launch assets, sales enablement. For every new capability — say,
AI-assisted thematic coding — the PMM defines the narrative before the feature
goes live.

**Background:** PMM at a B2B research or analytics tool. Has run a product launch
with measurable pipeline impact. Can write a competitive battlecard that sales
actually uses.

---

### 21. Demand Generation Manager

Owns the acquisition pipeline: paid search, SEO, email nurture, webinar promotion,
event presence. Measured on MQLs generated and trial conversions. Understands the
research buyer's journey — they often discover tools through content, not ads.

**Background:** Demand gen at a B2B SaaS with a self-serve + sales-assisted motion.
Comfortable with both high-volume trial acquisition and targeted enterprise pipeline
generation.

---

### 22. VP of Sales

**What top notch looks like:**
- Has sold qualitative research technology or XM software to enterprise buyers —
  VP Research, CX Director, UX Research Leads — knows their budget cycles
  (often tied to annual research program planning, not perpetual calendar), their
  internal champions, and their procurement gatekeepers
- Has built a sales team from scratch at an early-stage company and knows when to
  hire AEs vs. SDRs vs. when to stay hands-on
- Understands the self-serve → enterprise expansion motion: how a team that started
  on credits becomes a six-figure contract
- Background: VP Sales at UserTesting, dscout, Remesh, Qualtrics (research division),
  or Dovetail — someone who has sold to research buyers and has relationships in that
  community

**They own:**
- Enterprise revenue and pipeline targets
- Sales process design: credits trial → expansion → enterprise contract
- Hiring and building the sales team in Wave 3
- Field intelligence: bringing customer signals back to product

---

### 23. Solutions Consultant / Sales Engineer

Every enterprise deal involves a technical demo — showing the study builder,
running a live async community, demonstrating how Crystal analyzes the qual output.
This person runs those demos, builds custom proof-of-concept studies that close
deals, and is present at key customer calls to answer deep methodology + AI questions.

**What top notch looks like:**
- Comfortable talking AI architecture to technical buyers AND research methodology
  to qual scientists — in the same meeting
- Has demo'd a research tool under pressure and knows how to handle the "but
  what about bias in the AI coding?" question with a credible, non-defensive answer
- Can independently run a 5-day async text community to produce a live demo result
  for a prospect — not just screen-share the product, but actually use it

---

### 24. Enterprise Account Executives (×2)

**What top notch looks like:**
- Sold qual research technology to enterprise buyers — UserTesting AE, Qualtrics
  AE, dscout AE, or equivalent
- 3–6 month enterprise sales cycle experience; multi-stakeholder deal management
- Has run the credits-trial → enterprise-contract expansion motion and knows what
  signals indicate a trial user is ready for an enterprise conversation
- Not order-takers — active participants in discovery who bring real customer
  problems back to the product team

---

### 25. Customer Success Manager — Research

Enterprise research customers don't just need onboarding — they need a research
partner who helps them run their first study well, interprets their AI-coded
themes with them, and ensures they build habits that drive retention and expansion.

**What top notch looks like:**
- Has been a CSM at UserTesting, Dovetail, or a qual research platform — not a
  generic SaaS CSM who will learn qual on the job
- Can independently design a 5-day async study with a customer from scratch and
  help them interpret the results — this is the trust-building activity that drives
  renewals
- Tracks leading indicators: studies launched per month, themes acted on, time from
  study launch to insight delivery — not just health score and NPS

---

### 26. Privacy & Research Ethics Counsel

**Non-negotiable before enterprise sales begins.**

Qual panels collect the richest PII in any product we build: video interviews,
diary entries, personal narratives, emotional reactions. Enterprise legal teams
will ask hard questions before signing. This person has answers ready.

**What they must cover:**
- GDPR right to erasure: a participant's deletion request must cascade from
  responses → transcript → coded quotes → vector embeddings — this is technically
  and legally complex
- Research ethics: IRB exemption positioning for qual studies (no therapeutic
  intervention, but the framing matters in regulated industries)
- Incentive payment compliance: US 1099 thresholds, international payment laws,
  gift card regulations by country
- Data residency: enterprise customers will ask where qual data is stored and
  whether it can be in-region
- DPA negotiation: the data processing agreement template that enterprise procurement
  can sign without a 3-month legal review

**Background:** Privacy attorney with GDPR/CCPA depth AND familiarity with research
ethics standards (ESOMAR, AAPOR, MRS). Ideally has worked at a research platform,
a data company, or a healthcare/legal SaaS where data sensitivity is the core risk.

---

## Wave 3 — Scale (Hire in Months 6–12)

---

### 27. Head of Partnerships

Three partnership categories directly unlock product capabilities and GTM:

**Participant incentive platforms.** Tango Card, Tremendous, or Rybbon for digital
gift card delivery — the incentive management feature cannot ship without one of
these integrations. Negotiate commercial terms that allow per-transaction pricing
(not a flat SaaS fee) so the cost scales with usage.

**Video and scheduling platforms.** Deep integration with Zoom or Google Meet for
session scheduling + recording + auto-upload to Experient for transcription. Or a
native WebRTC provider (Daily.co, Agora) for a fully embedded experience. The
choice is a partnership and build decision that needs a dedicated owner.

**Real panel providers.** A strategic relationship with Lucid, Cint, or Prolific
for hybrid studies where customers want to supplement their own respondent pool
with external recruits. This is the expansion pathway for customers who need
hard-to-reach audiences they do not already have in Experient.

**Background:** Partnerships leader at a research tech or data platform who has
closed both technology integrations and commercial data agreements.

---

### 28. Community & Participant Experience Manager

As the platform scales, participant experience becomes a product unto itself.
Response rates, incentive satisfaction, activity completion rates, and panel
health are the foundation everything else sits on. This person owns the participant
side of the relationship.

**What top notch looks like:**
- Has managed an online research community at scale (500+ active participants)
- Knows how to improve response rates through invitation copy, incentive design,
  activity length calibration, and re-engagement campaigns
- Has built participant trust programs: transparency about how data is used,
  feedback loops that make participants feel heard, gamification that does not
  feel manipulative
- Background: Community manager at a qual research platform (Recollective, Rival
  Technologies, QualBoard) or participant experience lead at a panel company

---

## Hiring Sequence

```
Month 1 — Leadership & Science (4 people)
  Chief Research Officer
  Head of Product
  Head of Design
  Head of AI Engineering

Month 2 — Specialists & Builders (9 people)
  Principal Qualitative Methodologist
  Senior Qualitative Research Scientist
  Senior AI Engineer — NLP & Qual Analysis
  Senior AI Engineer — Transcription & Media
  Senior Full-Stack Engineer
  Senior Backend Engineer
  Senior Python Engineer (CrystalOS)
  Senior Product Designer
  Senior PM — Human Qual Panels

Month 3–4 — Quality, Infrastructure, GTM Readiness (5 people)
  Behavioral Scientist
  AI Evaluation Engineer
  Data Engineer
  UX Researcher
  Privacy & Research Ethics Counsel

Month 4–5 — Go to Market (5 people)
  VP of Marketing (3 months before launch to build the narrative)
  Head of Content & Thought Leadership
  Product Marketing Manager
  Demand Generation Manager
  VP of Sales

Month 5–6 — Sales Execution (4 people)
  Solutions Consultant
  Enterprise AE × 2
  Customer Success Manager — Research

Month 7–12 — Scale (2 people)
  Head of Partnerships
  Community & Participant Experience Manager
  [Plus: SDR team, additional AEs under VP Sales]
```

---

## What "Top Notch" Actually Means

For every role above, the bar is the same four things:

**1. They have shipped the thing before.**
Not adjacent to it. Not managed a team that did it. They personally built,
designed, sold, or analyzed it — and they have scars from where it went wrong.

**2. They have strong opinions with evidence.**
They can say "the standard approach to thematic coding is wrong because X, and
here is what I did instead and why it worked better." Generic best-practice
answers are a red flag.

**3. They make the people around them better.**
The bar-raiser, not just the strong individual contributor. In a 28-person team,
every person influences every other. One person who brings the average down
is expensive.

**4. They have community credibility.**
The research buyer who hears the CRO's name should say "I read her work."
The enterprise buyer who hears the VP Sales's name should say "I know him —
he's good." That external credibility is part of the product.

**The single most important hire: Chief Research Officer.**
Without scientific credibility, the AI-assisted thematic coding feature is a
liability with enterprise research buyers. With a CRO they recognize and trust,
it is the thing that unlocks the deal.

---

## Rough Budget (US Market, 2026)

| Wave | Headcount | Estimated Annual Comp |
|---|---|---|
| Wave 1 (13 people) | Build team | ~$3.2–4.5M |
| Wave 2 (add 13) | Ship + GTM | +$3.5–5.0M |
| Wave 3 (add 2) | Scale | +$0.5–0.8M |
| **Total (28 people)** | | **~$7–10M annualized** |

These are total compensation estimates (base + equity value).
Actual cash/equity split varies by individual and stage.
