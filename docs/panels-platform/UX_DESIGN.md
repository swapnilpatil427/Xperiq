# Human Qualitative Panels — UX Design

> **Date:** 2026-06-26  
> **Owner:** Head of Design + Senior Product Designer  
> **Format:** Design principles, information architecture, user flows, and
> annotated screen wireframes for every key researcher and participant screen.

---

## Design Principles

These five principles govern every interaction in the platform. When in doubt,
return to them.

### 1. The Researcher Does the Thinking. The Platform Does the Work.
Every workflow decision must ask: "Is this something the researcher needs to think
about, or something the platform should handle?" Transcription, scheduling reminders,
AI first-pass coding, report formatting — these are platform responsibilities.
Theme judgment, participant selection, methodology decisions — these are researcher
responsibilities. Never make the researcher do the platform's job.

### 2. AI Proposes. Humans Decide.
No AI output is ever surfaced as final. Themes are proposed. Summaries are drafts.
Every AI output has a visible "review and edit" path. The researcher's approval is
always the last step before anything goes to a stakeholder. The UI must make this
explicit — not buried in a settings note, but in the primary interaction model.

### 3. Two Worlds, One Design Language.
The researcher experience (complex, feature-rich, desktop) and the participant
experience (simple, mobile-first, zero friction) share one visual language but
serve completely different needs. The researcher's world is a professional tool.
The participant's world is a conversation. The design must honor both without
compromising either.

### 4. Confidence Is Visual.
Every piece of AI-generated content carries a confidence signal. Researchers must
be able to assess reliability at a glance — not by reading a fine-print footnote.
Color, weight, and iconography communicate confidence level as a primary data
dimension. Never hide uncertainty.

### 5. Presentation-Ready by Default.
Every output — theme brief, quote list, export — should require zero reformatting
before it goes to a stakeholder. The default PDF and PPTX exports are polished
enough to attach to a CMO email. Researchers should never have to touch another
tool to share a finding.

---

## Information Architecture

### Researcher-Facing Navigation

```
Experient App
├── Home / Dashboard (existing)
├── Surveys (existing)
├── Insights (existing)
├── Crystal (existing)
│
└── Research  ← NEW TOP-LEVEL SECTION
    ├── Studies
    │   ├── Active Studies
    │   ├── Draft Studies
    │   ├── Completed Studies
    │   └── [+ New Study]
    ├── Participants
    │   ├── All Participants (org panel)
    │   ├── Panel Health
    │   └── Do Not Contact
    ├── Templates
    │   ├── Async Community templates
    │   ├── Video Interview guides
    │   ├── Concept Test setups
    │   └── Diary Study schedules
    └── Settings
        ├── Incentive settings (provider, default amounts)
        ├── Email customization (invitation from-name, logo)
        └── Integrations (Zoom/video platform)
```

### Participant-Facing (Magic Link — No Login)

```
participant.experient.ai/:token
├── /welcome        — Org logo, study description, consent form
├── /activity/:n    — Current unlocked activity
├── /complete       — Study completed, incentive confirmation
└── /unavailable    — Token expired or study closed
```

---

## User Personas (Design Reference)

### Persona A — "The Research Lead" (Maya, 38)
**Context:** CX Insights Manager at a 1,200-person SaaS company. Runs 6–8 studies/year.
One direct report. Presents to the Chief Customer Officer monthly.

**Primary device:** MacBook Pro, Chrome. Uses iPad for reviewing studies in meetings.

**Key behaviors:**
- Starts work at 8am; wants to see overnight participant responses in a morning summary
- Reviews AI themes while multitasking — needs to scan quickly, not read deeply
- Exports PPTX before every QBR; wants it ready in 2 clicks
- High trust in platform if she can see evidence behind every theme

**Pain points:**
- Constantly chasing participants who haven't responded
- Spends 6–8 hours on manual thematic coding per study
- Always reformatting reports for different stakeholders

### Persona B — "The Working Researcher" (James, 29)
**Context:** UX Researcher at a product team. Runs 2–3 studies per sprint cycle.
No direct reports. Presents findings in Slack and Confluence, not slide decks.

**Primary device:** MacBook. Often on mobile to check participant progress.

**Key behaviors:**
- Moves fast — builds a study in 30 minutes before daily standup
- Wants AI themes to be a starting point, not a final answer
- Shares links directly in Slack, not PDF attachments
- Very sensitive to AI-produced results that feel generic or obvious

**Pain points:**
- No time for 6-week research cycles; needs results this sprint
- Frustrated by qual tools that don't connect to his product analytics

### Persona C — "The Participant" (Lisa, 44)
**Context:** Enterprise customer at a bank. Was in NPS survey, rated 5/10.
Received invitation to share more.

**Primary device:** iPhone. Responds during commute or lunch break.

**Key behaviors:**
- Skeptical of unsolicited invitations; reads the "why we're asking" copy carefully
- Will abandon multi-step activities on mobile if they're too long
- Appreciates being thanked and told how her input was used
- Wants incentive delivered immediately after completion, not "within 5–7 business days"

**Pain points:**
- Confusing or lengthy consent forms
- Activities that feel like a survey disguised as a conversation
- Not knowing when or if she'll be contacted again

---

## Key User Flows

### Flow 1 — Researcher Creates and Launches an Async Study

```
ENTRY POINTS:
  A) Research > Studies > "+ New Study"
  B) Crystal proposal card "[Launch Study]" button
  C) Insights dashboard "Investigate with qual" action

HAPPY PATH:
  Step 1: Choose Study Type
    → Select "Async Text Community" (or start from template)
    → Name the study

  Step 2: Define Audience
    → Filter respondent database OR enter external emails
    → See matching count update in real time
    → Set target sample size + quota (optional)
    → Preview: "15 of 47 matching respondents will be invited"

  Step 3: Build Activity Sequence
    → Add activities (Day 1, Day 2, ...)
    → Each activity: type (text prompt / concept test), prompt text, optional stimuli
    → Set unlock conditions if needed (Day 2 unlocks after Day 1 response)
    → Preview the participant view of each activity

  Step 4: Set Incentive + Schedule
    → Incentive per participant: $10 / $25 / $50 / custom
    → Study duration: 3 days / 5 days / 7 days / custom
    → Start date (defaults to tomorrow 9am)
    → Credit cost summary: "This study will cost 1,750 credits ($17.50)"
    → Credit balance shown: "Your balance: 8,200 credits"

  Step 5: Review + Launch
    → Summary: 15 participants, 3 activities, 5 days, $15 incentives, 1,750 credits
    → [Launch Study] CTA → debit credits → send invitations → study goes Active

ALTERNATE PATHS:
  → Save as Draft at any step
  → "From Template" shortcut bypasses Steps 1–3, jumps to Step 4 with pre-filled content
  → Insufficient credits → blocked by upgrade modal with "Buy more credits" CTA
```

---

### Flow 2 — Participant Completes an Activity

```
TRIGGER: Invitation email received on iPhone

  Email: "[Org Name] has invited you to share your experience"
    Preview text: "5-day discussion. $25 Amazon gift card for your time."
    CTA: [Share My Experience]

  Step 1: Welcome Page (magic link)
    → Org logo + study title
    → "What this is and how long it takes" (plain language, ≤80 words)
    → Incentive disclosed: "You'll receive a $25 Amazon gift card after completing all activities"
    → [I agree to participate] primary CTA

  Step 2: Consent (inline, below the fold on same page)
    → Plain language consent (3 short paragraphs):
        "Your responses are used only for [Org Name]'s research."
        "Your name is never shared with [Org Name]'s leadership team."
        "You can stop at any time. Reply STOP to opt out."
    → [Continue to Activity 1] CTA

  Step 3: Activity Page
    → Friendly prompt text (set by researcher)
    → Response field (textarea, auto-expanding)
    → Character count indicator (soft minimum: "Share at least 2 sentences")
    → [Submit] CTA

  Step 4: Confirmation
    → "Thanks, [First Name]." (personalized if name available)
    → Activity progress: ●●○○○ "1 of 3 activities complete"
    → "Activity 2 will be available tomorrow morning."
    → Optional: "Add a reminder" → generates .ics download

  Day 2 trigger:
    → Push notification or email: "[Org Name] Day 2: [Activity title preview]"
    → Magic link to same /activity/2 page
```

---

### Flow 3 — Researcher Reviews AI Themes and Approves Codebook

```
TRIGGER: Study closes; AI analysis pipeline runs; researcher notified by email

  Study Results — Overview Tab
    → Header: "Analysis complete — [N] themes proposed"
    → Stat bar: 15 participants · 3 activities · 247 responses · avg 82 words/response
    → [Review Themes] primary CTA

  Themes Review — AI Proposals View
    → Left panel: Theme list
        Each theme card:
          - Theme name (AI-generated, editable)
          - Evidence count: "11/15 participants (73%)"
          - Confidence indicator: ████░ "High"
          - Status: [Pending Review] / [Approved] / [Rejected]
    → Right panel (when theme selected):
        - Top 5 quotes for this theme
        - Each quote: participant #, activity day, quote text
        - "Play clip" button if video source
        - [Approve Theme] / [Edit + Approve] / [Reject] actions

  Actions on each theme:
    → Edit name inline
    → Edit description
    → Merge: drag theme card onto another → "Merge into [Target Theme]?" confirmation
    → Create sub-theme: "+ Add sub-theme" below approved theme
    → Add manual theme: "+ New Theme" button in left panel

  When satisfied:
    → "Approve All Reviewed Themes" → generates executive brief
    → OR selectively approve → brief generated from approved set only
```

---

## Screen Wireframes

> Note: `[  ]` = input field · `( )` = radio · `[ ]` = checkbox · `[BTN]` = button

---

### SCREEN 1 — Studies List Page

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Experient                    Research                              Maya ▾   │
│  ─────────────────────────────────────────────────────────────────────────── │
│  ◉ Studies  ○ Participants  ○ Templates  ○ Settings                          │
│                                                                               │
│  Studies                                           [+ New Study]             │
│  ─────────────────────────────────────────────────────────────────────────── │
│  [All ▾] [Active ●3] [Draft ○2] [Complete ✓8]       🔍 Search studies...     │
│                                                                               │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ ● ACTIVE                                                   5 days left │  │
│  │ Enterprise Churn Investigation                                         │  │
│  │ Async Community · 15 participants · 3 activities                      │  │
│  │ ████████████░░░  12/15 responded to Day 1                             │  │
│  │ Launched Jun 22                              [View Study]  [Monitor]  │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                               │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ ✓ COMPLETE — Analysis Ready                                            │  │
│  │ Q2 NPS Follow-Up                                                       │  │
│  │ Async Community · 20 participants · 5 activities                      │  │
│  │ 5 themes · High confidence                                            │  │
│  │ Completed Jun 18                             [View Results]  [Export] │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                               │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ ○ DRAFT                                                                │  │
│  │ Product Concept Test — Feature X                                       │  │
│  │ Concept Test · 0 participants · 2 concepts                            │  │
│  │ Last edited Jun 25                           [Continue Building]      │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                               │
│  Crystal Notice                                                    ✕         │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ 🔮 Crystal detected NPS dropped 8pts in Enterprise accounts.          │  │
│  │    Recommend investigating with a 3-day async study.                  │  │
│  │    Estimated cost: 900 credits.                                        │  │
│  │    [Launch Investigation]  [View Details]  [Dismiss]                  │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Annotations:**
- Study cards show the most critical status information without opening the study
- Progress bar on active studies: responses received / invited
- Crystal proposal card appears when the insight pipeline has generated a qual proposal
- Empty state: illustration + "Run your first study in 15 minutes" + template picker

---

### SCREEN 2 — Study Builder: Step 1 — Audience

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  ← Research / Studies              New Study                        Draft ○  │
│  ─────────────────────────────────────────────────────────────────────────── │
│                                                                               │
│  ①──────────②──────────③──────────④                                         │
│  Audience   Activities  Incentive  Launch                                    │
│                                                                               │
│  Who do you want to hear from?                                               │
│  ────────────────────────────────────────────────────────────────────────    │
│                                                                               │
│  Source                                                                       │
│  ( ) From your survey respondents   ← default                               │
│  ( ) Enter email addresses manually                                          │
│  ( ) Both                                                                    │
│                                                                               │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │ FILTER YOUR RESPONDENTS                                              │   │
│  │                                                                      │   │
│  │  Survey    [Q2 2026 NPS Survey ▾]                                   │   │
│  │                                                                      │   │
│  │  NPS Score    [1] ──────●────── [10]   Range: 1–5 (Detractors)     │   │
│  │                                                                      │   │
│  │  Account Type  [ ] Enterprise  [ ] Growth  [ ] Starter              │   │
│  │                                                                      │   │
│  │  Response Date  [Last 30 days ▾]                                    │   │
│  │                                                                      │   │
│  │  Last study participation  [More than 60 days ago ▾]               │   │
│  │                                                                      │   │
│  │  + Add another filter                                               │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                               │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  47 respondents match your filters                                   │   │
│  │                                                                      │   │
│  │  Invite all 47      OR      Set a target: [  15  ]  participants    │   │
│  │                                                                      │   │
│  │  If target < matches: participants selected randomly from pool       │   │
│  │                                                                      │   │
│  │  Estimated response rate: ~40–60% → expect 6–9 responses           │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                               │
│  Study type                                                                   │
│  [Async Text Community ▾]                                                    │
│                                                                               │
│  Study name   [Enterprise Churn Investigation                            ]   │
│                                                                               │
│  ─────────────────────────────────────────────────────────────────────────── │
│  [Save Draft]                                              [Next: Activities →]│
└──────────────────────────────────────────────────────────────────────────────┘
```

**Annotations:**
- Filter UI mirrors the familiar filter pattern from survey tools — no learning curve
- Respondent count updates in real time as filters change
- Response rate estimate is shown so researchers can right-size their invite pool
- Target participant selector: "I want 15, pick randomly from 47 matching"

---

### SCREEN 3 — Study Builder: Step 2 — Activity Sequence

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  ← Research / Studies              New Study                        Draft ○  │
│  ─────────────────────────────────────────────────────────────────────────── │
│                                                                               │
│  ①──────────②──────────③──────────④                                         │
│  Audience   Activities  Incentive  Launch                                    │
│                                                                               │
│  Build your activity sequence                        [From Template ▾]       │
│  Participants receive one activity at a time, in order.                      │
│  ─────────────────────────────────────────────────────────────────────────── │
│                                                                               │
│  ┌──── Day 1 ──────────────────────────────────────── ≡ drag ── ✕ ──────┐  │
│  │  📝 Text Prompt                           Unlocks: Immediately        │  │
│  │                                                                       │  │
│  │  Prompt text:                                                         │  │
│  │  ┌───────────────────────────────────────────────────────────────┐   │  │
│  │  │ We noticed you recently gave us a low satisfaction score.     │   │  │
│  │  │ We want to understand what led to that experience.            │   │  │
│  │  │                                                               │   │  │
│  │  │ Can you walk us through what happened? What were you trying   │   │  │
│  │  │ to do, and what made it difficult?                            │   │  │
│  │  └───────────────────────────────────────────────────────────────┘   │  │
│  │  Response type: Long text   Minimum: 2 sentences                     │  │
│  │  [Preview participant view ↗]                                        │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                               │
│  ┌──── Day 3 ──────────────────────────────────────── ≡ drag ── ✕ ──────┐  │
│  │  📝 Text Prompt                      Unlocks: After Day 1 submitted   │  │
│  │                                                                       │  │
│  │  Prompt text:                                                         │  │
│  │  ┌───────────────────────────────────────────────────────────────┐   │  │
│  │  │ Looking back at that experience — what would have made it     │   │  │
│  │  │ better? If you could change one thing about how we handled    │   │  │
│  │  │ it, what would that be?                                       │   │  │
│  │  └───────────────────────────────────────────────────────────────┘   │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                               │
│  ┌──── Day 5 ──────────────────────────────────────── ≡ drag ── ✕ ──────┐  │
│  │  📝 Text Prompt                                   Unlocks: Day 5      │  │
│  │  [Edit prompt...]                                                     │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                               │
│  [+ Add Activity]  [+ Add Concept Test]                                      │
│                                                                               │
│  ─────────────────────────────────────────────────────────────────────────── │
│  [← Back]   [Save Draft]                          [Next: Incentive →]        │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Annotations:**
- Activities are cards in a vertical timeline — drag handles for reordering
- Day label is computed from study start date; researcher sets relative days (Day 1, 3, 5)
- Unlock condition displayed as a badge on each card — click to configure
- "Preview participant view" opens a mobile-sized modal showing how it looks on phone
- Activity type dropdown: Text Prompt | Concept Test | Rating + Text

---

### SCREEN 4 — Study Builder: Step 4 — Launch

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  ← Research / Studies              New Study                        Draft ○  │
│  ─────────────────────────────────────────────────────────────────────────── │
│                                                                               │
│  ①──────────②──────────③──────────④                                         │
│  Audience   Activities  Incentive  Launch ← You are here                    │
│                                                                               │
│  Review and launch                                                           │
│  ─────────────────────────────────────────────────────────────────────────── │
│                                                                               │
│  ┌─────────────────────────────┐  ┌─────────────────────────────────────┐   │
│  │ STUDY SUMMARY               │  │ COST BREAKDOWN                      │   │
│  │                             │  │                                     │   │
│  │ Name                        │  │ 15 participants × 50 cr      750 cr │   │
│  │ Enterprise Churn            │  │ 1 AI analysis run            100 cr │   │
│  │ Investigation               │  │                                     │   │
│  │                             │  │ Estimated total              850 cr │   │
│  │ Participants: 15 invited    │  │ = $8.50                             │   │
│  │ Activities:  3 (over 5 days)│  │                                     │   │
│  │ Incentive:   $25/participant│  │ Your balance:         8,200 cr      │   │
│  │ Incentive total: $375       │  │ After this study:     7,350 cr      │   │
│  │ (billed at cost via         │  │                                     │   │
│  │  Tremendous, not credits)   │  │ ✓ Sufficient credits                │   │
│  │                             │  └─────────────────────────────────────┘   │
│  │ Send date:  Tomorrow 9am    │                                             │
│  │ Close date: Jul 2, 9am      │                                             │
│  └─────────────────────────────┘                                             │
│                                                                               │
│  Invitation preview                                              [Edit copy] │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │ From: Maya Chen, [Org Name]                                            │  │
│  │ Subject: We'd love to hear your story — $25 for 15 mins over 5 days  │  │
│  │                                                                        │  │
│  │ Hi [First Name],                                                       │  │
│  │                                                                        │  │
│  │ We noticed you gave us a low satisfaction score recently. Before      │  │
│  │ anything else — we're sorry your experience wasn't great.             │  │
│  │                                                                        │  │
│  │ We'd love to hear what happened in your own words. It's 3 short       │  │
│  │ activities over 5 days, and we'll send you a $25 Amazon gift card     │  │
│  │ when you're done.                                                      │  │
│  │                                                                        │  │
│  │ [Share My Experience]                                                  │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                               │
│  ─────────────────────────────────────────────────────────────────────────── │
│  [← Back]   [Save Draft]                              [🚀 Launch Study]      │
│                                                                               │
│  By launching, 850 credits will be debited from your balance.                │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Annotations:**
- Incentive cost is shown separately from credits — participants are paid real money,
  platform credits are for AI + participant activation
- Invitation preview is editable inline — researcher can adjust tone before sending
- "By launching, N credits will be debited" — explicit consent before irreversible action
- Launch button is a distinct color (primary CTA) and includes an emoji for emotional weight

---

### SCREEN 5 — Study Monitor (Active Study)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  ← Studies                Enterprise Churn Investigation       ● ACTIVE     │
│  ─────────────────────────────────────────────────────────────────────────── │
│                                                                               │
│  Overview  Participants  Activities  Responses                               │
│                                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │  15          │  │  11          │  │  8           │  │  3.5 days    │    │
│  │  Invited     │  │  Confirmed   │  │  Active      │  │  Remaining   │    │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘    │
│                                                                               │
│  Activity Response Rates                                                     │
│  ────────────────────────────────────────────────────────────────────────    │
│  Day 1  ████████████████░░░  12/15  80%  sent Jun 22                         │
│  Day 3  ████████░░░░░░░░░░░   6/15  40%  sent Jun 24  ← in progress         │
│  Day 5  ░░░░░░░░░░░░░░░░░░░   0/15   0%  sends Jun 26  ← upcoming           │
│                                                                               │
│  Participants                                                                │
│  ────────────────────────────────────────────────────────────────────────    │
│  #   Status         Day 1   Day 3   Day 5   Last active                     │
│  1   ✓ Active       ✓       ✓       –       2 hours ago                     │
│  2   ✓ Active       ✓       ✓       –       5 hours ago                     │
│  3   ✓ Active       ✓       –       –       Yesterday  [⚠ Send reminder]   │
│  4   ✓ Active       ✓       ✓       –       3 hours ago                     │
│  5   ⚠ No response  –       –       –       Never      [⚠ Send reminder]   │
│  …                                                                           │
│                                                                              │
│  [Send Reminder to Non-Responders]                                          │
│                                                                               │
│  Early Themes (live, unconfirmed)                         ⓘ AI preview only │
│  ────────────────────────────────────────────────────────────────────────    │
│  These themes are preliminary — based on 12 responses. Final analysis       │
│  runs after study closes.                                                    │
│                                                                               │
│  Pricing surprise at renewal    ████████░░  8 mentions                      │
│  Onboarding complexity          ████░░░░░░  4 mentions                      │
│  Missing feature: bulk export   ██░░░░░░░░  2 mentions                      │
│                                                                               │
│  ─────────────────────────────────────────────────────────────────────────── │
│  [Close Study Early & Analyze]                    [Close on Jul 2 as planned]│
└──────────────────────────────────────────────────────────────────────────────┘
```

**Annotations:**
- Early theme preview is clearly labeled "unconfirmed" to avoid premature action
- Participant table shows at-a-glance who needs a nudge (yellow ⚠ flag)
- "Send Reminder" is a one-click action — no new email to compose
- Close early option surfaced for when the researcher has enough responses

---

### SCREEN 6 — Results: Themes Review (AI Proposals)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  ← Studies / Enterprise Churn Investigation              ✓ Analysis Complete │
│  ─────────────────────────────────────────────────────────────────────────── │
│                                                                               │
│  Overview  Themes  Quotes  Participants  Export                              │
│                                                                               │
│  ─────────────────────────────────────────────────────────────────────────── │
│  Crystal proposed 6 themes from 20 participants.                             │
│  Review each one. Edit, merge, or reject as needed. Approve to generate      │
│  your brief.                                       [Approve All & Generate]  │
│                                                                               │
│  ┌───────────────────────────┐  ┌───────────────────────────────────────┐   │
│  │ THEMES                    │  │ QUOTES FOR SELECTED THEME             │   │
│  │ ─────────────────────     │  │ ────────────────────────────────────   │   │
│  │                           │  │                                       │   │
│  │ ● Pricing surprise at     │  │ "Pricing surprise at renewal"         │   │
│  │   renewal                 │  │ 15/20 participants (75%)  ████ High  │   │
│  │   15/20  ████ High        │  │ ─────────────────────────────────     │   │
│  │   [Pending Review]        │  │                                       │   │
│  │ ─────────────────────     │  │ P4  Day 1  Jun 22                    │   │
│  │ ○ Onboarding took         │  │ "When we renewed in March, the price  │   │
│  │   too long                │  │ was 35% higher than I expected. No    │   │
│  │   9/20  ████ High         │  │ one warned me. I almost canceled."    │   │
│  │   [Pending Review]        │  │ ──────────────────────                │   │
│  │ ─────────────────────     │  │                                       │   │
│  │ ○ Feature X is missing    │  │ P11  Day 1  Jun 22                   │   │
│  │   6/20  ██░░ Medium       │  │ "The renewal price jump was a shock.  │   │
│  │   [Pending Review]        │  │ I had budgeted for the original and   │   │
│  │ ─────────────────────     │  │ this almost caused a budget freeze."  │   │
│  │ ○ Support response time   │  │ ──────────────────────                │   │
│  │   4/20  ██░░ Medium       │  │                                       │   │
│  │   [Pending Review]        │  │ P7   Day 3  Jun 24                   │   │
│  │ ─────────────────────     │  │ "I wish someone had sent a pricing    │   │
│  │ ○ [+ New Theme]           │  │ notification 60 days before renewal." │   │
│  │                           │  │ ★ Mark as representative             │   │
│  │                           │  │ ──────────────────────                │   │
│  │                           │  │                                       │   │
│  │                           │  │ +12 more quotes                       │   │
│  │                           │  │                                       │   │
│  │                           │  │ ─────────────────────────────────     │   │
│  │                           │  │ [Edit Theme Name] [Merge Into ▾]      │   │
│  │                           │  │                                       │   │
│  │                           │  │ [✓ Approve Theme]  [✗ Reject]        │   │
│  └───────────────────────────┘  └───────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Annotations:**
- Split-panel layout: theme list (left) + evidence for selected theme (right)
- Confidence shown as both color-coded bar and word label ("High" / "Medium" / "Low")
- Participant IDs anonymized by default (P4, P11) — researcher can reveal names in settings
- "Mark as representative" stars a quote for the executive brief
- Merge: drag-to-target or dropdown — prevents accidental merges

---

### SCREEN 7 — Results: Executive Brief

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  ← Studies / Enterprise Churn Investigation                                  │
│  ─────────────────────────────────────────────────────────────────────────── │
│                                                                               │
│  Overview  Themes  Quotes  Participants  Export                              │
│                                                                               │
│  Executive Brief                               [Edit]  [Export PDF]  [Share] │
│  ─────────────────────────────────────────────────────────────────────────── │
│                                                                               │
│  Enterprise Churn Investigation                                              │
│  June 22–27, 2026 · 20 participants · 5-day async community                 │
│                                                                               │
│  Key Finding                                                                 │
│  ─────────────────────────────────────────────────────────────────────────── │
│  The dominant driver of enterprise dissatisfaction is pricing surprise at    │
│  renewal — not product quality or feature gaps. 15 of 20 participants (75%)  │
│  described the renewal experience as unexpected, jarring, or trust-damaging. │
│                                                                               │
│  Themes                                                                      │
│  ─────────────────────────────────────────────────────────────────────────── │
│                                                                               │
│  ① Pricing surprise at renewal                     ████████████  75%        │
│                                                                               │
│    Participants were not prepared for renewal pricing increases.             │
│    Many described it as a "shock" that triggered an internal budget review.  │
│                                                                               │
│    "When we renewed in March, the price was 35% higher than I expected.      │
│     No one warned me. I almost canceled." — P4, Day 1                       │
│                                                                               │
│  ② Onboarding complexity for new team members      ████████░░░░  45%        │
│                                                                               │
│    When team composition changes, re-onboarding new members is perceived     │
│    as disproportionately difficult.                                          │
│                                                                               │
│    "Every time we get a new analyst, they spend two weeks just learning      │
│     the platform. It's not intuitive for newcomers." — P8, Day 1            │
│                                                                               │
│  ③ Feature gap: bulk export                        ██████░░░░░░  30%        │
│                                                                               │
│  ④ Support response time                           ████░░░░░░░░  20%        │
│                                                                               │
│  ─────────────────────────────────────────────────────────────────────────── │
│  Methodology Note                                              ▼ Expand       │
│  This study used an async text community method. 15 of 20 invited            │
│  participants completed all activities (response rate: 75%). AI-assisted     │
│  thematic analysis was reviewed and approved by the research team. This      │
│  data is qualitative and directional; it is not statistically representative │
│  of all enterprise accounts.                                                 │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Annotations:**
- Brief is a document, not a dashboard — readable top-to-bottom without any interaction
- Methodology note is collapsed by default but always present (cannot be deleted)
- "Edit" allows the researcher to add framing text, rephrase theme summaries
- Share button: generates a view-only link — no Experient account required for stakeholders

---

### SCREEN 8 — Participant: Activity Page (Mobile, iPhone)

```
┌──────────────────────────────┐
│ 9:41 AM            ▓▓▓▓▓▓▓  │
│ ──────────────────────────── │
│                               │
│  [Org Logo]                   │
│                               │
│  ──────────────────────────   │
│  ●●○  Activity 1 of 3         │
│  ──────────────────────────   │
│                               │
│  We noticed you gave us a     │
│  low satisfaction score       │
│  recently. We want to         │
│  understand what happened.    │
│                               │
│  Can you walk us through      │
│  what led to that             │
│  experience? What were you    │
│  trying to do, and what       │
│  made it difficult?           │
│                               │
│  ──────────────────────────   │
│  ┌────────────────────────┐   │
│  │                        │   │
│  │                        │   │
│  │                        │   │
│  │                        │   │
│  │  Start typing here...  │   │
│  │                        │   │
│  └────────────────────────┘   │
│  Share at least 2 sentences   │
│                               │
│                               │
│                               │
│  ┌────────────────────────┐   │
│  │      Submit →          │   │
│  └────────────────────────┘   │
│                               │
│  Your response is private.    │
│  [Why are we asking this?]    │
│                               │
└──────────────────────────────┘
```

**Annotations:**
- No app download. No login. One tap from email to this screen.
- Org branding at the top builds trust — participant knows who asked them
- Activity progress bar (●●○) is the only navigation element — no menus, no back button
- "Your response is private" + "Why are we asking this?" answers the two questions
  every participant is thinking before they type anything
- Submit button is full-width — easy to hit with thumb. Sends on tap.
- Auto-expanding textarea — never shows a scrollbar; the page grows

---

### SCREEN 9 — Participant: Completion Page (Mobile)

```
┌──────────────────────────────┐
│ 9:41 AM            ▓▓▓▓▓▓▓  │
│ ──────────────────────────── │
│                               │
│  [Org Logo]                   │
│                               │
│                               │
│  ●●●  All done                │
│                               │
│                               │
│  Thank you, Lisa.             │
│                               │
│  Your input matters. We read  │
│  every response.              │
│                               │
│                               │
│  ──────────────────────────   │
│  Your reward                  │
│                               │
│  $25 Amazon gift card         │
│  Check your email in the      │
│  next few minutes.            │
│  ──────────────────────────   │
│                               │
│                               │
│  How was your experience?     │
│                               │
│  😔    😐    🙂    😊    🤩  │
│                               │
│                               │
│  ──────────────────────────   │
│  Want to participate in       │
│  future studies?              │
│                               │
│  [Yes, keep me on the panel]  │
│  [No thanks]                  │
│                               │
└──────────────────────────────┘
```

**Annotations:**
- "Thank you, Lisa" — personalized with first name; feels human, not automated
- Gift card delivery expectation set immediately — no "within 5–7 business days"
- Emoji reaction: 5-star substitute that works on mobile. Used to track
  participant satisfaction with the study experience itself.
- Panel opt-in at the end — the warmest possible moment to ask

---

### SCREEN 10 — Crystal Qual Query (In-Study)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Results / Enterprise Churn Investigation                                    │
│                                                                               │
│  ┌────────────────────────────────────────────────┐ ┌──────────────────────┐│
│  │  BRIEF                                         │ │  🔮 Ask Crystal      ││
│  │  ...                                           │ │  ──────────────────  ││
│  │                                                │ │                      ││
│  │                                                │ │  What did customers  ││
│  │                                                │ │  say about pricing   ││
│  │                                                │ │  transparency?       ││
│  │                                                │ │                      ││
│  │                                                │ │  ──────────────────  ││
│  │                                                │ │                      ││
│  │                                                │ │  15 of 20            ││
│  │                                                │ │  participants        ││
│  │                                                │ │  mentioned pricing   ││
│  │                                                │ │  concerns. The core  ││
│  │                                                │ │  theme is not price  ││
│  │                                                │ │  level but price     ││
│  │                                                │ │  predictability —    ││
│  │                                                │ │  participants        ││
│  │                                                │ │  wanted to budget    ││
│  │                                                │ │  ahead of renewal.   ││
│  │                                                │ │                      ││
│  │                                                │ │  ┌────────────────┐  ││
│  │                                                │ │  │ "I needed a    │  ││
│  │                                                │ │  │ 60-day warning │  ││
│  │                                                │ │  │ to plan the    │  ││
│  │                                                │ │  │ budget."       │  ││
│  │                                                │ │  │ — P12, Day 1   │  ││
│  │                                                │ │  └────────────────┘  ││
│  │                                                │ │                      ││
│  │                                                │ │  ┌────────────────┐  ││
│  │                                                │ │  │ Ask a follow-up│  ││
│  │                                                │ │  │ [            ] │  ││
│  │                                                │ │  └────────────────┘  ││
│  └────────────────────────────────────────────────┘ └──────────────────────┘│
└──────────────────────────────────────────────────────────────────────────────┘
```

**Annotations:**
- Crystal panel is a drawer on the right — persists while scrolling through results
- Answers are grounded in quotes — not summaries without evidence
- Participant IDs link to the full response in the quote browser
- Follow-up input field at bottom — conversational turn-taking

---

## Mobile Responsiveness Rules

| Screen | Desktop | Tablet | Mobile |
|---|---|---|---|
| Studies List | Full grid | 1-column cards | 1-column cards |
| Study Builder | Multi-column | Stepped panels | Stepped panels (full screen each) |
| Activity Builder | Split canvas | Full-width timeline | Full-width timeline |
| Study Monitor | Wide table | Scrollable table | Cards per participant |
| Themes Review | Split panel | Stacked (themes above quotes) | Tab switch (Themes / Quotes) |
| Executive Brief | Reading layout | Reading layout | Reading layout |
| Crystal Panel | Right drawer | Bottom drawer | Full-screen overlay |
| Participant screens | N/A (not used on desktop) | Full-width | Full-width |

---

## Design System Components (New — Qual Panels)

| Component | Purpose | Variants |
|---|---|---|
| `StudyCard` | Study list item | active, draft, complete, analysis-ready |
| `ActivityCard` | Activity in sequence builder | text-prompt, concept-test, rating |
| `ThemeCard` | Theme in codebook | pending, approved, rejected; confidence level |
| `QuoteBlock` | A verbatim quote | with-source, with-clip-button, representative-starred |
| `ParticipantRow` | Participant in monitor table | active, lagging, no-response, complete |
| `ConfidenceBadge` | AI confidence indicator | high (green), medium (amber), low (red) |
| `ProgressRing` | Study activity completion | 0–100% fill |
| `CrystalDrawer` | Crystal qual query panel | docked-right, floating |
| `IncentiveChip` | Shows incentive amount + status | pending, sent, confirmed |
| `MagicLinkPage` | Participant-facing wrapper | welcome, activity, complete, unavailable |

---

## Accessibility Requirements

- All colors must meet WCAG 2.1 AA contrast ratios (4.5:1 for normal text, 3:1 for large)
- Confidence indicators must use both color AND an icon (never color alone)
- Activity builder drag-and-drop must be keyboard-accessible (arrow keys + enter)
- Participant activity page: font size minimum 16px on mobile; tap targets minimum 48px
- Transcript viewer: keyboard navigation between sentences (arrow keys)
- All form inputs have visible focus states
- Error messages reference the specific field that failed
- Crystal responses have an "Copy to clipboard" button (for accessibility and convenience)
