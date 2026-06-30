# Tags & Group Intelligence — Go-to-Market Strategy

> **The strategic bet:** Folders are the least loved feature in every XM platform.
> Nobody at a CX team meeting says "I love how Qualtrics organizes our programs." They
> say "I spent two hours in Excel last Friday trying to combine our 14 NPS surveys into
> one picture." Intelligence Groups solve a real, named pain with a genuinely new
> capability. The GTM job is to make that pain vivid and make the solution feel inevitable.

---

## Positioning

### Core message

**"Stop organizing surveys into folders. Start grouping feedback into intelligence."**

Every XM platform gives you folders. Qualtrics calls them "Projects." Medallia calls
them "Programs." SurveyMonkey calls them "Teams." They are all filing systems with
dashboards bolted on. You still have to manually export, aggregate, and interpret.

Xperiq Intelligence Groups are different. They are **living segments** — every time a
new response comes in, the group's NPS, sentiment, and themes update automatically.
Crystal generates a fresh intelligence brief. You never look at a stale export again.

### The elevator pitch

"In your current XM tool, you have 14 NPS surveys, 8 CSAT surveys, and 6 onboarding
surveys. You know what's happening in each one. You don't know what's happening across
all of them — because the data lives in separate dashboards and nobody has time to
manually aggregate. Xperiq Intelligence Groups give you one button: 'tag these 14 surveys
as NPS Programs.' From that point on, you have an always-live aggregate intelligence
view: rolled-up NPS, trending themes, Crystal's AI brief — refreshed every 15 minutes,
no work required."

### Why this wins the XM positioning battle

| Dimension | Qualtrics / Medallia | Xperiq Intelligence Groups |
|---|---|---|
| Organization primitive | Folders / Projects / Programs | Dimensional intelligence groups |
| Aggregate insights | Manual reports, scheduled exports | Auto-computed, live, 15-min refresh |
| AI involvement | Optional dashboard widget | Crystal generates narrative briefs |
| Cross-survey NPS | Build a dashboard, write SQL | One click → immediate aggregate view |
| New survey added to group | Manual re-configuration | Apply the tag → auto-joins the group |
| "What's happening with mobile?" | Open 6 dashboards, compare | Ask Crystal: "show mobile group" |
| Visualization | Tables and bar charts | Tag Universe force-directed graph (unique) |

### The competitive knockout

Qualtrics's closest equivalent is "XM Directory Segments" — a contact-level segmentation
system. It segments who responded, not what they said across programs. Medallia's "Focus
Areas" are manual report templates. Neither product has cross-program AI-generated
intelligence briefs. Neither has a force-directed visualization showing how your feedback
programs interrelate.

This is genuinely unbuilt territory in enterprise XM. The GTM message can say that
directly.

---

## Ideal Customer Profile

**Primary buyer persona: "The Overextended CX Director"**

- Title: VP of Customer Experience, Director of CX, Head of Voice of Customer
- Company: Mid-market B2B SaaS or services company, 200–2000 employees
- Survey landscape: 8–30 active surveys across multiple programs (NPS, CSAT, onboarding,
  product feedback, support, churn)
- Pain: "I know what's happening in each survey. I don't know what's happening across the
  business. I make a deck once a quarter with manually aggregated data."
- Tool today: Qualtrics (Enterprise, underused), Medallia (too heavy), or a mix of
  Typeform + Google Sheets + Tableau
- Budget authority: yes (up to $50K/year without CFO sign-off)
- Success metric they own: Net Revenue Retention, NPS program ROI, customer health scores

**Secondary persona: "The Program Manager Who Owns the Data"**

- Title: CX Analyst, Customer Insights Manager, Voice of Customer Manager
- Pain: "I spend 3 hours a week aggregating data from multiple surveys for the director's
  deck. If I didn't do it, nobody would."
- They don't decide the purchase but they evangelize the tool that saves them those 3 hours.
- They are the ones who will create the Intelligence Groups and see the value first.
- Target them with in-product wins they can demo upward.

---

## Feature Naming

**Rule:** The word "tags" is an internal/technical term. Users see "Intelligence Groups."

| Technical term | User-facing name |
|---|---|
| Tags | Intelligence Groups |
| Create tag | Create Intelligence Group |
| Tag Intelligence View | Group Intelligence Report |
| Tag filter bar | Group filter |
| Auto-tagging by Crystal | Crystal Group Suggestions |
| Tag Universe visualization | Intelligence Universe |
| Namespace | Group dimension (or just "Dimension") |

**Rationale:** "Tag" is associated with low-value labeling (blog tags, email tags).
"Intelligence Group" communicates that grouping serves a purpose — it produces
intelligence, not just organization. It also sets the expectation that the group is
active and self-updating, not a static folder.

The one exception: in developer documentation, MCP skill names, and API reference,
we use "tags" because developers think in technical terms and "Intelligence Groups"
is unnecessarily wordy in a code context.

---

## Launch Narrative

### The "aha" story (for blog, sales decks, demo scripts)

**Before:**

> "It's 8 PM on a Thursday. Your CMO wants a CX briefing for the board meeting on
> Monday. You have 14 NPS surveys, 8 CSAT surveys, and 6 onboarding pulse surveys.
> Each one lives in a separate dashboard. You open a blank spreadsheet. You start
> copying NPS scores. You realize survey 7 uses a different scale. You fix the formula.
> You copy-paste verbatim quotes into a Word doc. It's 11 PM. You have a deck.
> It's already stale."

**After:**

> "It's 8 PM on a Thursday. Your CMO wants a CX briefing. You open Xperiq, click
> 'NPS Programs' Intelligence Group. You see: aggregate NPS is +42, up 8 points in
> 30 days. Crystal's brief says: 'Onboarding satisfaction is driving the improvement,
> but checkout friction themes are emerging across 3 surveys.' You screenshot the
> Intelligence Universe — it shows exactly how your 14 NPS surveys cluster around
> two themes. You send it to the CMO. It's 8:07 PM."

This is the story the blog tells. This is the story the demo walks through. This is the
story the LinkedIn ad ends with.

---

## Launch Channels

### Channel 1: In-app onboarding moment

**Trigger:** First survey creation for a new user (or any user who has 0 tags).

**Moment:** After the user names their survey and lands on the survey editor, a
contextual tooltip appears (not a modal, not a blocker):

```
✦ Crystal can suggest Intelligence Groups for this survey
  Group your surveys by theme or program to get aggregate insights.
  [See Crystal's suggestions] [Skip for now]
```

Clicking "See Crystal's suggestions" triggers the auto-tag skill and shows the proposal
pills. This is the first value moment for the Intelligence Groups feature.

**Why in-app is Channel 1:** The best time to show a user the value of grouping is
when they are creating their first survey — before they have 14 ungrouped surveys and
a messy library. Getting tagging behavior established early makes the feature sticky.

**Success target:** 25% of first-survey-creations result in at least one tag applied
within 24 hours of account creation.

### Channel 2: Product Hunt launch

**Title:** "Intelligence Groups — AI-powered grouping for your entire feedback program"

**Tagline:** "Stop copying NPS scores into spreadsheets. Group your surveys, get
AI-powered insights automatically."

**Body:**
Intelligence Groups are a new primitive for experience management. Instead of organizing
surveys into folders (like every other XM tool), you group them by dimension — product
line, region, program, team. From that point on:

- Every new response automatically updates the group's aggregate NPS, sentiment, and themes
- Crystal AI generates a fresh intelligence brief every 15 minutes
- The Intelligence Universe shows you how all your feedback programs interrelate
- Ask Crystal: "What's happening in our mobile app surveys?" — it knows

We built this because CX directors at mid-market companies are drowning in per-survey
dashboards and spending nights in Excel trying to see the big picture. Nobody in XM
has solved this. We think we just did.

**Target launch day:** Coordinate with Phase 2 ship (Tag Intelligence View live in
production). Phase 1 alone (just tags + filtering) is not worth a Product Hunt launch.
Phase 2 with the aggregate insights and Crystal narrative is the "wow" version.

### Channel 3: Blog post

**Title:** "Why XM Folders Are Dead (And What Comes Next)"

**Thesis:** The "folder" mental model for organizing feedback programs is a holdover
from document management. It was the best XM platforms could offer when insights
required manual analysis. In the AI era, the right primitive is a living group that
aggregates insights automatically. We call them Intelligence Groups.

**Structure:**
1. The problem with folders (concrete pain: the Thursday-night spreadsheet story)
2. Why the legacy platforms can't fix this (folders are architectural, not cosmetic)
3. What a living intelligence group does differently (auto-aggregation, Crystal briefs)
4. The Intelligence Universe: seeing your entire VoC program in one view
5. How to create your first Intelligence Group in 60 seconds (with screenshots)

**Author:** Priya Nalawade (Product Lead) — byline adds credibility that this is a
product thinking piece, not a marketing puff piece.

**Distribution:** Xperiq blog → LinkedIn (Priya's personal + company page) → HN
(Show HN: we built a new primitive for XM beyond folders) → r/CustomerSuccess

### Channel 4: LinkedIn campaign

**Target audience:** CX Director, VP of Customer Experience, Head of Voice of Customer
at companies 200–2000 employees, using Qualtrics/Medallia/Typeform.

**Ad 1 — The pain hook:**
> "Last week, how many hours did your team spend aggregating survey data into a spreadsheet
> to see your overall NPS?"
>
> If the answer is "more than zero," you have the problem Intelligence Groups solve.
>
> [See how it works →]

**Ad 2 — The Crystal moment:**
> Your CX director asks: "What's happening with our mobile app surveys?"
>
> Before Xperiq: 45 minutes of dashboard clicking and Excel formulas.
> After Xperiq: Crystal answers in 8 seconds.
>
> Intelligence Groups. Now in Xperiq.
> [Try free →]

**Ad 3 — The competitive displacement:**
> Qualtrics gives you folders.
> Medallia gives you programs.
> Xperiq gives you intelligence.
>
> Group your surveys. Get AI-powered insights. Automatically.
> [See the demo →]

**Targeting:** Job title = VP Customer Experience / Director CX / Head of VoC / Customer
Insights Manager. Company size: 200–2000. Industry: SaaS, financial services, retail,
healthcare.

---

## Pricing Model

### Tier structure

| Capability | Free | Starter ($49/mo) | Growth ($149/mo) | Enterprise |
|---|---|---|---|---|
| Create Intelligence Groups | Up to 10 | Unlimited | Unlimited | Unlimited |
| Apply groups to surveys | Yes | Yes | Yes | Yes |
| Group filter in survey list | Yes | Yes | Yes | Yes |
| Group Intelligence Report (aggregate NPS, sentiment, topics) | No — upgrade prompt | Yes | Yes | Yes |
| Crystal narrative brief in reports | No | Yes | Yes | Yes |
| Auto-tag (Crystal Group Suggestions) | No | No | Yes (5 credits/batch) | Yes (included) |
| Custom namespace dimensions | No | Up to 3 | Unlimited | Unlimited |
| Namespace locking (governance) | No | No | Yes | Yes |
| Intelligence Universe visualization | No | No | No | Yes |
| Trend data (90-day history) | 7 days | 30 days | 90 days | Unlimited |
| MCP skill: `get_tag_insights` | No | No | Yes | Yes |

### Pricing rationale

**10 free tags:** Generous enough that a small team can tag all their surveys and feel
the value. Restrictive enough that any team with real survey programs (10+ surveys, 3+
dimensions) hits the limit and sees the upgrade path.

**Group Intelligence Report on Starter+:** This is the core value unlock. Showing the
aggregation wall at Free creates a clear upgrade moment. The in-product message when a
Free user clicks the Intelligence Report: "See how all your Customer Onboarding surveys
perform together. Group Intelligence Reports are available on Starter." (Not a scary
enterprise upsell — a $49/mo ask.)

**Auto-tagging on Growth with credits:** The 5-credit cost per batch (not per tag)
keeps it low-friction while attaching a value signal to the Crystal capability. A user
who accepts Crystal's suggestions and sees immediate time savings will convert.
"Crystal suggested 3 groups for this survey. Accept? (5 credits)" — this is the moment
Growth customers feel they are getting LLM capability worth paying for.

**Intelligence Universe on Enterprise:** This is the enterprise "wow" feature. It is
also technically expensive (the graph data query touches all tags and their co-occurrence
data). Reserving it for Enterprise sets a high-end anchor and gives Enterprise sales a
concrete differentiator to demo.

---

## Success Metrics

### North Star metric

**Tag group adoption rate:** Percentage of active surveys (published, with ≥1 response)
that have at least one Intelligence Group applied, measured 30 days after the feature
launches.

**Target:** ≥40% of active surveys tagged within 30 days.

**Why this metric:** It measures whether users understand that Intelligence Groups
belong on surveys (not just as an org-level filing system). A survey with no tag is
invisible to the aggregate intelligence layer — adoption rate captures whether we've
crossed the minimum viable coverage threshold.

### Supporting metrics

| Metric | Target | Signal |
|---|---|---|
| Time-to-first-group (new users) | ≤5 minutes | Onboarding friction |
| Group Intelligence Report sessions/user/week | ≥2.0 (Starter+) | Retention value |
| Auto-tag accept rate | ≥60% | Crystal quality |
| Free → Starter conversion from tag limit | ≥8% of users who hit limit | Monetization |
| Auto-tag → Growth conversion | ≥5% of users who see auto-tag paywall | Monetization |
| Intelligence Universe Enterprise demo close rate | Track in CRM | Enterprise pipeline |
| CX Director NPS for the feature (in-app survey) | ≥55 | Satisfaction |

### Anti-metrics (what we track to avoid)

- **Tag proliferation rate:** If orgs average >50 tags, the system is becoming tag soup.
  Alert Priya if any org exceeds 40 tags in the first 30 days (signal that namespace
  governance UX needs improvement).
- **"Untagged surveys" percentage:** If >60% of surveys remain untagged 60 days post-launch,
  the in-app onboarding is failing. Trigger a re-evaluation of the Crystal suggestion flow.

---

## Launch Calendar

| Week | Milestone |
|---|---|
| Week 2 | Phase 1 ships: tags, filter, settings. Internal dog-food week. |
| Week 4 | Phase 2 ships: Group Intelligence Report + Crystal narrative. Product Hunt submission ready. |
| Week 4 | Blog post published: "Why XM Folders Are Dead" |
| Week 5 | Product Hunt launch (align with Phase 2 availability) |
| Week 5 | LinkedIn campaign starts (1 ad/day, 3-week run) |
| Week 6 | Phase 3 ships: auto-tagging, Tag Universe |
| Week 6 | Press outreach: "Xperiq launches AI-powered Intelligence Groups — first XM platform to replace folders with dimensional intelligence" |
| Week 8 | Phase 4 ships: workflow triggers, MCP skill |
| Week 8 | Customer story: target a Starter customer who can quantify time saved |
| Week 10 | 30-day post-launch GTM retrospective (metrics review, pricing calibration) |
