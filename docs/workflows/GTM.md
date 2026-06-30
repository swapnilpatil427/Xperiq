# Xperiq Actions — Go-to-Market Strategy

**Version:** 1.0
**Owner:** Simone Dufour (Marketing Lead) + Maya Okonkwo (Product Lead)
**Status:** Approved for execution starting Phase 3 (Week 6)
**Last updated:** 2026-06-29

---

## The Market Problem We're Solving

Every XM platform in existence gives you a dashboard. Some give you a digest. The best ones give you an alert — a single email that arrives hours after the signal appeared in your data. Then it sits in your inbox while NPS continues to erode.

The modal experience of a CX manager today:
1. Monday morning. Open Qualtrics. NPS is at 28.
2. "When did this start?" — Dig through trend charts. Thursday. Five days ago.
3. "Who owns this?" — Forward the chart to Product, Support, and the VP in three separate emails.
4. "What caused it?" — Request an ad hoc analysis from the insights team. Turnaround: 48 hours.
5. Next Monday: NPS is at 25. The loop resets.

The gap is not data. The gap is the distance between signal and action. CX teams spend 40% of their time doing manual work that should be automated: pulling reports, forwarding alerts, opening Jira tickets, scheduling briefings. This is not their job — their job is to act on what they learn.

Xperiq Actions eliminates that gap. When NPS drops, Xperiq acts. Before the Monday review. Before the problem gets worse.

---

## Core Message

**Primary headline:**
> "The first XM platform that doesn't just collect data — it acts on it."

**Supporting narrative:**
> Every XM platform today gives you a dashboard. Xperiq gives you a system. When your NPS drops, Xperiq doesn't wait for you to notice — it fires. Slack message to your team. Jira ticket for the product team. Crystal analysis in your inbox. All before your Monday morning review.

**7-word version (for ad copy, social, headline):**
> "Your data acts. Before you check it."

**10-word version (for landing page hero):**
> "Xperiq fires when your NPS drops. You stay focused."

---

## Feature Naming and Brand Language

| Technical name | User-facing brand name | Rationale |
|---|---|---|
| Workflows | **Xperiq Actions** | "Workflows" sounds like enterprise IT. "Actions" sounds like momentum. |
| AI triggers (sentiment_spike, new_theme_detected, anomaly_detected) | **Crystal Signals** | These are signals Crystal detects — not rules you write. |
| Workflow execution log | **Action History** | Audit trail framing. "What did my system do?" |
| Natural language workflow creation | **Crystal Builder** | Crystal is doing the building. You're describing the intent. |
| Template gallery | **Action Playbooks** | "Playbooks" implies tested, team-adopted practices. |
| Test mode | **Safe Run** | Zero confusion about whether it fires. |

---

## Competitive Positioning

### Head-to-Head Comparison

| Capability | Qualtrics | Medallia | SurveyMonkey | Xperiq Actions |
|---|---|---|---|---|
| Trigger: NPS threshold | No (manual action planning) | Email alert only | Basic email alert | Yes — threshold trigger |
| Trigger: Response count | No | No | No | Yes |
| Trigger: Response rate drop | No | No | No | Yes |
| Trigger: AI sentiment shift | No | No | No | Yes — Crystal Signal |
| Trigger: New emerging theme | No | No | No | Yes — Crystal Signal |
| Trigger: Statistical anomaly | No (requires BI export) | No | No | Yes — Crystal Signal |
| Actions: Slack notification | Requires Zap integration | No | No | Yes, native |
| Actions: Jira ticket | Requires implementation | No | No | Yes, native |
| Actions: Zendesk ticket | Requires implementation | No | No | Yes, native |
| Actions: Crystal AI analysis | N/A | N/A | N/A | Yes — runs on fire |
| Natural language creation | No | No | No | Yes — Crystal Builder |
| Visual no-code builder | No | No | No | Yes |
| Available on self-serve tier | No (implementation required) | No (enterprise only) | Limited (email only) | Yes — Starter tier |
| Time to first workflow | 3–6 weeks (setup + training) | 6–12 weeks (enterprise) | 30 min (email only) | < 10 minutes |

### Competitive Talking Points (for Sales)

**vs. Qualtrics:**
> "Qualtrics has 'action planning' — it's a project management workflow for humans. You still have to notice the signal, then assign tasks manually. Xperiq Actions fires the moment the signal appears. No one has to notice anything."

**vs. Medallia:**
> "Medallia has email alerts. One integration. That's it. Xperiq has 10 trigger types, 10 action types, a visual builder, AI-detected signals, and you can set it up in 10 minutes without a solutions consultant."

**vs. SurveyMonkey:**
> "SurveyMonkey will send you an email when your survey gets a response. That's the ceiling. Xperiq Actions is a different category — automation that understands experience data, not just event data."

**vs. building your own:**
> "You could build a webhook + Lambda + Jira API pipeline to alert your team when NPS drops. Or you could use Xperiq Actions and be running in 10 minutes. The difference is that Xperiq understands NPS — it knows the rolling window, the hysteresis buffer, and it can attach a Crystal analysis to every alert automatically."

---

## Target Audiences

### Primary Audience: The CX Program Owner
- **Who:** VP of CX, Head of CX, Customer Insights Director at mid-market SaaS/e-commerce/retail (100–5,000 employees)
- **Their job:** Run the voice-of-customer program. Own the NPS / CSAT metrics. Brief leadership weekly. Manage the survey-to-action loop.
- **Their pain:** Data sits in dashboards. Alerts arrive late. Manual reports consume 30% of team time. "We see everything but act on nothing."
- **Their unlock:** Xperiq Actions runs the loop for them. The Monday briefing writes itself.
- **Message for this audience:** "Your program should be proactive, not reactive. Xperiq Actions fires before you check in."

### Secondary Audience: The CX Operations Analyst
- **Who:** CX Analyst, VoC Analyst, Survey Admin. 1–3 people on the CX team. Technical enough to configure integrations but not an engineer.
- **Their pain:** They spend all day manually routing data. "Someone asks me for an NPS report, I pull it. They ask for the themes, I run the analysis. Every week."
- **Their unlock:** Crystal Builder creates workflows from plain English. They can automate what they do manually in under 10 minutes.
- **Message for this audience:** "Describe what you want to automate. Crystal builds it."

### Tertiary Audience: The Product/Engineering Team
- **Who:** Product managers and engineers who receive CX data from the CX team via forwarded emails and spreadsheets
- **Their pain:** CX data arrives late, decontextualized, and without clear action items
- **Their unlock:** Xperiq Actions creates Jira tickets and Crystal analyses directly in their workflow. NPS drops, ticket opens.
- **Message for this audience:** "CX signals land directly in your backlog. Automatically."

---

## Launch Strategy

### Phase 1: Beta Co-Creation (Week 8–9, during Phase 3 development)

**Goal:** Validate the product against real usage before GA. Generate high-quality testimonials and use cases.

**Who:** 20 power users recruited from the Xperiq waitlist. Criteria: active users with at least 3 live surveys, in a role (CX manager, VoC analyst) that matches primary audience.

**What they get:** Early access to Xperiq Actions. Direct Slack channel with the product team. Influence over template gallery (their most-used workflows become templates). Named on the launch page (with permission).

**What we get:** Real workflow configurations (sanitized for templates). Testimonials for launch. Validation of the Crystal Builder NL parsing on real-world inputs (the 20 most natural descriptions they type become test cases).

**Beta feedback loop:**
- Week 8: Onboarding session (30 min, group). Give them the 12 pre-built templates. Ask them to create 1 workflow in the session.
- Week 9: Async feedback survey. "What did you automate? What couldn't you automate?"
- Week 10: Beta retrospective. Surface top 3 blockers. These become P1 fixes before GA.

**Beta commitment from participants:** 2 hours of their time, structured feedback, willingness to provide a testimonial if they love it.

---

### Phase 2: GA Launch — "Xperiq Actions" (Week 11)

**ProductHunt Launch:**
- Title: "Xperiq Actions — AI-triggered automations for CX teams"
- Tagline: "Your data acts. Before you check it."
- Thumbnail: animated GIF showing the Crystal Builder filling in a workflow, then the Slack message firing — 3 seconds, loops perfectly
- First comment (from Simone): The Monday Morning Pain story (personal narrative version of the market problem section above — 200 words, first-person from a CX manager's perspective)
- Launch day strategy: schedule for Tuesday 12:01 AM PST (PH resets). Notify beta users 1 week in advance to be ready to upvote and comment with real use cases.
- Target: Top 3 Product of the Day

**Simultaneous announcements:**
- Blog post (see content section below)
- In-app banner for all existing Xperiq users: "Xperiq Actions is here. Set up your first automation in 10 minutes."
- Email to waitlist: "You asked us when Xperiq would act on insights. The answer is now."
- Twitter/LinkedIn: 5-tweet/post thread. Starts with the Monday Morning story, ends with the video demo link.

**90-Second Demo Video:**
This is the most important asset. Script:

```
0:00 — Open shot: Xperiq dashboard. NPS score drops visibly in real time.
0:05 — Text overlay: "It's 2:17 AM. NPS just dropped to 27."
0:10 — Text overlay: "Your CX manager is asleep."
0:15 — Xperiq Actions fires. Slack message appears in #cx-alerts.
0:22 — Jira ticket opens in CX board: "NPS Alert — CSAT Q3 2026"
0:28 — Crystal analysis runs. Summary: "3 new themes detected. Top: 'Onboarding confusion'"
0:35 — Text overlay: "Your team wakes up at 9 AM. Everything is already handled."
0:42 — Cut to: Crystal Builder. User types: "Alert my team when NPS drops below 30"
0:52 — Crystal fills the builder. Cards animate in one by one.
1:00 — User hits Enable. Workflow is live.
1:05 — Text overlay: "From description to live automation. Under 2 minutes."
1:10 — Xperiq logo. "xperiq.com"
```

---

### Phase 3: Content Engine (Ongoing from Week 12)

**Blog Post 1: "5 automations every CX team should have running"**
- Word count: 900 words
- Structure: Problem intro (Monday morning pain) + 5 numbered sections, each with:
  - Name of automation
  - What it does
  - Real-world scenario ("Imagine you run CX for a 300-person SaaS company...")
  - The Xperiq Action Playbook template that does it (deep link)
  - Time to set up: < 5 min
- SEO target: "cx automation", "customer experience automation", "nps alert workflow"
- CTA: "Start with the NPS Drop Alert template →"

**Blog Post 2: "The hidden cost of manual CX reporting" (Week 14)**
- Quantify the time CX teams spend on manual reporting (surveys from our beta users)
- Frame Xperiq Actions as the solution
- Lead gen: gated version of the data report in exchange for email

**Blog Post 3: "Crystal Signals: how AI detects what dashboards miss" (Week 16)**
- Deep-dive on AI triggers (sentiment_spike, new_theme_detected, anomaly_detected)
- Use a real beta user case study (with permission): "Before Crystal Signals, they noticed the theme 3 weeks late. Here's what changed."
- Positions Xperiq as the AI-first alternative

---

### Phase 4: Integration Partner Listings (Week 10–12)

**Slack App Directory:**
- Xperiq Actions Slack app listing
- Category: "Customer Success & Support"
- Description: "Send real-time CX alerts to Slack when NPS drops, sentiment shifts, or Crystal detects a new theme. Set up in 5 minutes."
- Screenshots: Slack message from Xperiq Actions, Crystal analysis summary card

**Atlassian Marketplace:**
- Xperiq Actions for Jira
- Category: "Project Management"
- Description: "Automatically create Jira tickets when customer experience signals warrant action. Connect your CX data to your product backlog."

**Zendesk Marketplace:**
- Xperiq Actions for Zendesk
- Description: "Route CX alerts directly to Zendesk. When Crystal detects a sentiment spike, a ticket is already waiting."

---

## Pricing

### Tier Assignments

| Feature | Free | Starter ($49/mo) | Growth ($149/mo) | Enterprise |
|---|---|---|---|---|
| Active workflows | 1 | 10 | Unlimited | Unlimited |
| Trigger types | Manual, response_submitted only | All threshold triggers (response_count, nps_threshold, response_rate_drop, schedule, survey_lifecycle) | All threshold + Crystal Signals (sentiment_spike, new_theme_detected, anomaly_detected) | All + custom trigger hooks |
| Actions per workflow | 1 | 3 | Unlimited | Unlimited |
| Action types | notify_in_app only | email, Slack, notify_in_app | All 10 action types | All + custom action code |
| Crystal Signals (AI triggers) | No | No | Yes | Yes |
| Crystal Builder (NL creation) | No | No | Yes | Yes |
| Run history retention | 7 days | 30 days | 1 year | Unlimited |
| Workflow versioning | No | No | Yes | Yes |
| Test mode (Safe Run) | No | Yes | Yes | Yes |
| Action Playbooks (templates) | 3 templates | All 12 templates | All templates + community | Custom enterprise playbooks |

**Pricing rationale:**
- Free: 1 workflow with manual trigger. Enough to see the value (set up a "run Crystal analysis" workflow triggered manually). Not enough to rely on for a CX program.
- Starter: Real threshold triggers cover the majority of basic XM automation use cases. Captures the "I want real NPS alerts" buyer without requiring them to pay for AI.
- Growth: Crystal Signals are the defensible moat. No competitor has them. Growth tier is where Xperiq becomes transformationally different.
- Enterprise: Custom hooks for enterprise integration patterns (ServiceNow, SAP, custom identity providers).

### Upgrade Prompts

**In-product upgrade triggers (Growth tier features):**
1. User tries to add a 4th action to a workflow on Starter: "Multi-step workflows require Growth. [Upgrade →]"
2. User tries to add a Crystal Signal trigger on Starter: "Crystal Signals require Growth. [Learn more] [Upgrade →]"
3. User lands on Crystal Builder tab on Starter: "Crystal Builder is a Growth feature. [See what's included] [Upgrade →]"

**Upgrade message frame:**
> "Crystal Signals don't just alert you to changes — they tell you about patterns you couldn't see without AI. That's worth it."

---

## Sales Enablement

### One-Pager (PDF, 1 page)

Front:
- Headline: "Xperiq Actions: From signal to action in minutes"
- Three key benefits with icons:
  1. "10 trigger types. Including AI-detected signals your competitors don't have."
  2. "10 action types. Slack, Jira, Zendesk, email — and Crystal analysis."
  3. "Set up in minutes. Not weeks. No implementation required."

Back:
- Competitive comparison table (simplified 4-column version of the table above)
- Two beta customer quotes
- Pricing table
- QR code to demo video

### Demo Flow for Sales (15 minutes)

1. Start on the workflows list page. Show a pre-built NPS Drop Alert workflow. (2 min)
2. Click Edit → Visual Builder. Walk through the trigger + condition + action cards. (3 min)
3. New tab: Crystal Builder. Type the Monday morning scenario out loud as you type it. Watch Crystal build the workflow. (3 min)
4. Enable the workflow. Show the live preview strip. (1 min)
5. Click Test → Safe Run. Simulate NPS = 27. Show the "would fire" preview for all three actions. (2 min)
6. Show a pre-built run history with the expanded run detail (Slack message content, Jira ticket link, Crystal analysis summary). (2 min)
7. Close: "What would you automate first?" (2 min)

### Objection Handling

**"We already use Zapier for this."**
> "Zapier doesn't understand your CX data. It can react to events — a new row in a spreadsheet, a form submission. Xperiq Actions reacts to meaning — when NPS drops, when sentiment shifts, when Crystal detects an emerging theme. That's a different category."

**"We have an internal data team that handles our alerting."**
> "How long does it take them to set up a new alert? A week? A sprint? With Xperiq Actions, your CX manager can do it in 10 minutes without a single ticket. Your data team can focus on things that actually require engineering."

**"We're already on Qualtrics/Medallia, this would mean migration."**
> "You don't have to migrate your survey data to use Xperiq Actions. But here's the question: does your current platform alert your Slack channel when Crystal detects a new customer complaint theme before you've noticed it? Because ours does."

**"Crystal Signals sounds interesting but I'd want to see the accuracy before relying on it."**
> "That's exactly why we built Safe Run. Test any workflow — including Crystal Signal triggers — with real sample data before enabling it. See exactly what would fire and what Crystal would say, with zero side effects. You can tune the confidence threshold too."

---

## Key Metrics to Track Post-Launch

| Metric | Target (Day 30) | Target (Day 90) |
|---|---|---|
| Organizations with >= 1 active workflow | 100 | 500 |
| Median time to first workflow creation (from org signup) | < 10 min | < 8 min |
| Crystal Builder usage (% of new workflows created via NL) | 30% | 50% |
| Crystal Signal trigger adoption (% of Growth tier orgs using AI triggers) | 40% | 65% |
| Workflow-to-Growth upgrade conversion (% of users who create a workflow and upgrade) | 8% | 12% |
| Action delivery success rate | >= 99.5% | >= 99.5% |
| ProductHunt upvotes | 500+ | — |
| NPS of Xperiq Actions feature (in-product survey) | >= 50 | >= 60 |
