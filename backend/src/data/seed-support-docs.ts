/**
 * Seed script — populates support_docs with live articles covering all 9 UI categories.
 *
 * Usage:
 *   cd backend && npm run seed:support
 *
 * Requires DATABASE_URL to be set (defaults to local postgres).
 * Idempotent: uses ON CONFLICT (key) DO UPDATE so re-running is safe.
 */
import { Pool } from 'pg';

const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5432/xperiq';

const pool = new Pool({ connectionString: DATABASE_URL });

interface DocSeed {
  key: string;
  title: string;
  content: string;
  category: string;
  source_type: string;
  quality_score: number;
}

const DOCS: DocSeed[] = [
  // ── Getting Started ────────────────────────────────────────────────────────
  {
    key: 'getting-started/what-is-xperiq',
    title: 'What is Xperiq?',
    category: 'getting-started',
    source_type: 'manual',
    quality_score: 0.98,
    content: `# What is Xperiq?

Xperiq is an AI-powered experience intelligence platform that helps organizations collect, analyze, and act on feedback at scale. Unlike traditional survey tools, Xperiq combines enterprise-grade data collection with Crystal AI — an always-on intelligence layer that finds patterns, surfaces risks, and proposes concrete actions.

## Core Capabilities

**Survey & Feedback Collection**
Build NPS, CSAT, CES, and custom surveys with a drag-and-drop builder. Distribute via email, web embed, API, or automated triggers. Responses stream in real time.

**Crystal AI Analysis**
Crystal is your AI analyst. It reads every response, identifies emerging themes, detects anomalies, and generates prescriptive insights — not just descriptions. Ask Crystal anything about your data using natural language.

**Workflows & Automation**
Trigger automated follow-ups, alerts, and actions based on response patterns. Close the loop without manual intervention.

**Dimensional Intelligence**
Layer responses against customer segments, lifecycle stages, product usage, and more. See why your scores move, not just that they moved.

## How It's Different

Most XM platforms show you dashboards. Xperiq shows you what to do next. Crystal proposes actions, you confirm them, and the system learns from the outcomes — closing the loop between insight and execution.

## Getting Started

1. Create your first survey → [Quick Start Guide](/guides/getting-started/quick-start)
2. Invite your team → Settings → Team Members
3. Ask Crystal a question → click the Crystal icon in the top right

Need help? [Contact our support team](/contact) — we respond in under 2 hours.`,
  },
  {
    key: 'getting-started/quick-start',
    title: 'Quick Start: Creating Your First Survey',
    category: 'getting-started',
    source_type: 'manual',
    quality_score: 0.97,
    content: `# Quick Start: Creating Your First Survey

Create and distribute your first survey in under 5 minutes.

## Step 1: Create a Survey

1. Click **+ Create Survey** in the left navigation
2. Choose a template or start from blank
3. Give your survey a name

## Step 2: Add Questions

Drag question types from the left panel onto the canvas:

- **NPS** — 0-10 scale with follow-up
- **Rating** — star or numeric scale
- **Multiple choice** — single or multi-select
- **Open text** — free-form response
- **CSAT** — 1-5 satisfaction scale

**Tip:** Use the AI question generator (✨ button) to automatically write follow-up questions based on your goals.

## Step 3: Configure Distribution

Click the **Distribute** tab:

- **Share link** — copy a URL to paste anywhere
- **Email blast** — upload a CSV of email addresses
- **Web embed** — paste a code snippet on your site
- **API** — programmatic submission via REST

## Step 4: Collect Responses

Once live, responses appear in the **Data** view in real time. Crystal will start analyzing patterns after the first 10 responses.

## Step 5: Get Insights

Go to **Insights** and click **Generate Insights** to run the full Crystal analysis pipeline. For quick answers, open the Crystal panel and ask a question in plain English.

## Next Steps

- [Set up automated NPS triggers](/guides/nps-automation/time-based-triggers)
- [Build your first workflow](/guides/workflows/building-your-first-workflow)
- [Understand Crystal AI](/guides/ai-analysis/intro-to-crystal)`,
  },
  {
    key: 'getting-started/dashboard-overview',
    title: 'Dashboard Overview',
    category: 'getting-started',
    source_type: 'manual',
    quality_score: 0.95,
    content: `# Dashboard Overview

The Xperiq dashboard gives you a real-time snapshot of your experience program health.

## Main Sections

### Surveys Panel
Lists all active surveys with response counts, completion rates, and last-activity timestamps. Click any survey to drill in.

### Insights Feed
Shows the latest Crystal-generated insights across all surveys. Insights are color-coded by layer:
- **Descriptive** (grey) — what happened
- **Diagnostic** (amber) — why it happened
- **Predictive** (blue) — what will happen
- **Prescriptive** (green) — what to do

### Crystal Chat
The Crystal icon (top right) opens a full-screen conversation with Crystal AI. Ask anything: "What drove NPS down last month?" or "Which customer segment is at risk of churn?"

### Activity Stream
The right sidebar shows recent actions: surveys sent, responses received, workflows triggered, Crystal proposals accepted or dismissed.

## Quick Actions

| Action | Where |
|--------|-------|
| Create survey | + button, top left |
| Run insights | Insights tab → Generate |
| Set up alert | Workflows → Alerts |
| Export data | Survey → Data → Export |

## Customising Your View

Drag and resize dashboard cards. Your layout is saved per-user. Click the filter icon to scope the dashboard to a specific survey, date range, or customer segment.`,
  },

  // ── AI Analysis Engine ────────────────────────────────────────────────────
  {
    key: 'ai-analysis/intro-to-crystal',
    title: 'Introduction to Crystal AI',
    category: 'ai-analysis',
    source_type: 'manual',
    quality_score: 0.99,
    content: `# Introduction to Crystal AI

Crystal is Xperiq's AI intelligence layer. It reads every survey response, identifies patterns, and surfaces actionable insights — all without you having to write a single query.

## What Crystal Does

**Natural Language Analysis**
Ask Crystal questions in plain English. "Why did our NPS drop this quarter?" or "What are the top themes in support feedback?" Crystal reasons over your actual response data to answer.

**Dimensional Insight Generation**
Crystal doesn't just summarise. It runs a four-layer analysis pipeline:
1. **Descriptive** — what's happening in the data
2. **Diagnostic** — root causes behind patterns
3. **Predictive** — what's likely to happen next
4. **Prescriptive** — specific, actionable recommendations

**Action Proposals**
Crystal can propose concrete actions based on its findings — send a follow-up survey, create an alert, trigger a workflow. You review each proposal and decide whether to apply it. Crystal never acts autonomously.

**Skill Runtime**
Crystal is powered by a skill runtime: modular, versioned AI capabilities that can be extended. Each skill has its own evaluation criteria and quality score, so you can see which capabilities are most reliable.

## The Crystal Panel

Open Crystal from any page by clicking the ✨ icon in the top bar. The panel opens on the right side. Type a question, and Crystal responds with:
- A structured answer with citations linking back to actual responses
- A confidence score (Reliable / Indicative / Low-signal)
- Any action proposals the analysis generates

## Trust Scores

Every Crystal insight carries a trust score:
- **≥80 (Reliable)** — backed by strong evidence, safe to act on
- **60-79 (Indicative)** — directional, use with judgement
- **<60 (Low-signal)** — early signal, needs more data

## Crystal in the Closed Loop

Crystal is built for closed-loop execution:
1. Crystal **proposes** (based on data)
2. You **confirm** (review the action)
3. The system **executes** (API call or workflow)
4. Outcome is **recorded** (did it work?)
5. Crystal **learns** from outcomes to improve future proposals`,
  },
  {
    key: 'ai-analysis/generating-insights',
    title: 'Generating Insights from Survey Data',
    category: 'ai-analysis',
    source_type: 'manual',
    quality_score: 0.96,
    content: `# Generating Insights from Survey Data

Crystal's insight pipeline transforms raw responses into structured, actionable intelligence.

## Running the Pipeline

From any survey's Insights tab:

1. Click **Generate Insights** (or the ↺ Refresh button for a re-run)
2. Choose pipeline depth:
   - **Quick** — descriptive + diagnostic layers, ~30 seconds
   - **Expert** — all four layers including predictive + prescriptive, ~2-3 minutes
3. Insights appear as they stream in

**Auto-run:** Crystal runs automatically every 15 minutes for paid plans (every 2 hours for free).

## Reading Insight Cards

Each insight card shows:
- **Layer badge** — which pipeline layer produced it
- **Headline** — one-sentence finding
- **Evidence** — sample responses that support the finding (click to see full text)
- **Trust score** — how statistically confident Crystal is
- **Suggested action** — what to do next (if prescriptive layer)

## Filtering and Grouping

Use the filter bar to scope insights:
- **By layer** — see only prescriptive insights
- **By category** — NPS drivers, feature feedback, support issues
- **By segment** — enterprise vs. SMB customers, new vs. churned

## Topic Hierarchy

Crystal builds a topic map across all responses. Go to **Topics** to see a visual hierarchy of what your customers are talking about, ranked by frequency and sentiment.

## Sharing Insights

Click the share icon on any insight to:
- Copy a link
- Export as PDF slide
- Send to a Slack channel (if integration is configured)`,
  },
  {
    key: 'ai-analysis/crystal-action-proposals',
    title: 'Crystal Action Proposals',
    category: 'ai-analysis',
    source_type: 'manual',
    quality_score: 0.97,
    content: `# Crystal Action Proposals

Crystal never acts unilaterally. When it identifies an action worth taking, it proposes it — and waits for your confirmation before anything happens.

## What Are Action Proposals?

After analysis, Crystal may generate proposals like:
- "Send a follow-up NPS survey to segment X"
- "Create an alert when satisfaction drops below 7"
- "Schedule a re-run of the insights pipeline for this survey"

Each proposal includes:
- **What will happen** — a plain-English description
- **Why** — the business rationale with data citations
- **Confidence** — how certain Crystal is this is the right action
- **Impact** — estimated business impact (high/medium/low)

## Reviewing Proposals

Proposals appear in the Crystal panel as confirmation cards. You can:
- **Apply** — execute the action immediately
- **Dismiss** — decline with optional reason
- **Details** — expand to see exactly what will change before committing

Nothing executes without your explicit confirmation. Crystal's role is to reason and propose; your role is to decide.

## Outcome Tracking

When you apply a proposal, Xperiq tracks the outcome:
- Did the follow-up survey get better response rates?
- Did the alert fire when expected?
- Did the re-run produce different insights?

This outcome data feeds back to Crystal, improving future proposal quality.

## Proposal History

Go to **Crystal → Proposals** to see all proposals across all surveys:
- Accepted vs. dismissed breakdown
- Outcome funnel
- Which proposal types are most frequently accepted`,
  },

  // ── Surveys & Templates ───────────────────────────────────────────────────
  {
    key: 'surveys/creating-a-survey',
    title: 'Creating a Survey from Scratch',
    category: 'surveys',
    source_type: 'manual',
    quality_score: 0.95,
    content: `# Creating a Survey from Scratch

The survey builder lets you create any type of experience measurement survey with a visual drag-and-drop interface.

## Opening the Builder

1. Click **+ Create Survey** in the sidebar
2. Select **Blank Survey** (or choose a template)
3. The builder opens in full-screen mode

## Question Types

| Type | Best For |
|------|---------|
| NPS (0-10) | Loyalty measurement |
| CSAT (1-5) | Satisfaction at a touchpoint |
| CES (1-7) | Effort measurement |
| Rating | General scoring |
| Multiple choice | Categorical feedback |
| Checkbox | Multi-select options |
| Text (short) | Names, IDs, quick answers |
| Text (long) | Open-ended qualitative feedback |
| Matrix | Rating across multiple dimensions |
| Date | Scheduling, follow-up timing |

## Logic and Branching

Click a question and open the **Logic** panel to:
- **Skip logic** — jump to a different question based on the answer
- **Display logic** — show a question only if a condition is met
- **End logic** — complete the survey early for certain paths

## Survey Settings

In the **Settings** tab:
- **Completion message** — what respondents see after finishing
- **Response limit** — cap total responses (useful for panels)
- **Anonymous mode** — strip all identifying information
- **Language** — auto-translate question text
- **Redirect URL** — send respondents to your site after completion

## Saving and Publishing

Click **Save** at any time. When ready:
1. Click **Publish** to make the survey active
2. Choose your distribution method (link, email, embed, API)
3. Monitor responses in real time from the **Data** tab`,
  },
  {
    key: 'surveys/templates',
    title: 'Using Survey Templates',
    category: 'surveys',
    source_type: 'manual',
    quality_score: 0.93,
    content: `# Using Survey Templates

Templates are pre-built survey structures designed for common use cases. Start from a template to save setup time and follow measurement best practices.

## Available Templates

**Customer Metrics**
- NPS (Net Promoter Score) — standard 11-point loyalty survey
- CSAT — post-interaction satisfaction
- CES (Customer Effort Score) — ease of doing business

**Product & Feature**
- Feature feedback — what users think about a specific feature
- Beta feedback — structured feedback for new releases
- Onboarding experience — first 30/60/90 day check-in

**Support & Service**
- Post-ticket resolution — did we solve your problem?
- Agent quality — rate your support interaction
- Escalation follow-up — closed-loop after escalation

**Employee Experience**
- Pulse survey — quick weekly check-in
- eNPS — employee net promoter
- Exit interview — structured offboarding feedback

## Using a Template

1. Click **+ Create Survey**
2. Browse templates by category or search
3. Click **Use Template**
4. Customise the text, branding, and logic for your context
5. Publish

## Custom Templates

Save any survey as a custom template:
1. Open the survey in the builder
2. Click **⋯** → **Save as Template**
3. Name it and add a description
4. It appears in your org's template library for all team members

## Template Versioning

Templates are versioned. If you update a template, existing surveys built from it are not affected. Only new surveys created from the updated template use the new version.`,
  },

  // ── Workflows & Automation ─────────────────────────────────────────────────
  {
    key: 'workflows/building-your-first-workflow',
    title: 'Building Your First Workflow',
    category: 'workflows',
    source_type: 'manual',
    quality_score: 0.95,
    content: `# Building Your First Workflow

Workflows automate your response to experience data. When something happens in Xperiq (a low score, a specific response pattern, a threshold breach), a workflow can automatically take action.

## Workflow Anatomy

A workflow has three parts:
1. **Trigger** — what starts the workflow
2. **Conditions** (optional) — filters that must be true
3. **Actions** — what happens

## Creating a Workflow

1. Go to **Workflows** in the sidebar
2. Click **+ New Workflow**
3. Name your workflow
4. Choose a trigger
5. Add optional conditions
6. Add one or more actions
7. Click **Activate**

## Common Triggers

| Trigger | Example |
|---------|---------|
| New response received | Any response to Survey X |
| Score below threshold | NPS ≤ 6 (detractor) |
| Score above threshold | NPS ≥ 9 (promoter) |
| Keyword match | Response contains "cancel" or "refund" |
| Survey completed | All questions answered |
| Time-based | 30 days after customer onboarded |

## Common Actions

| Action | Example |
|--------|---------|
| Send email | Alert the account manager |
| Create ticket | Open a support ticket |
| Add to segment | Tag as "at-risk" |
| Trigger another survey | Send a follow-up |
| Call webhook | Notify your CRM |
| Post to Slack | Alert the CS team channel |

## Example: Detractor Alert

**Trigger:** NPS score ≤ 6
**Condition:** Customer tier = Enterprise
**Action 1:** Send email to account manager
**Action 2:** Create support ticket with "High" priority

This ensures every enterprise detractor gets a human follow-up within hours.`,
  },
  {
    key: 'workflows/alerts-and-notifications',
    title: 'Alerts & Notifications',
    category: 'workflows',
    source_type: 'manual',
    quality_score: 0.92,
    content: `# Alerts & Notifications

Alerts notify your team when experience metrics cross thresholds or anomalies appear — so issues don't go unnoticed between insight runs.

## Creating an Alert

1. Go to **Workflows → Alerts**
2. Click **+ New Alert**
3. Choose the metric to monitor
4. Set the threshold (e.g., NPS drops below 7.0)
5. Choose notification channels
6. Set the quiet period (how often to re-notify if the condition persists)

## Alert Types

**Threshold alerts** — fire when a metric crosses a fixed value
- "Alert me when CSAT drops below 4.0"
- "Alert when response rate exceeds 80%"

**Trend alerts** — fire when a metric changes too quickly
- "Alert when NPS drops more than 5 points in 7 days"
- "Alert when negative sentiment increases by >20%"

**Anomaly alerts** — Crystal detects statistically unusual patterns
- Unusual spike in open-text mentions of a specific term
- Response volume significantly above or below baseline

## Notification Channels

Configure channels in **Settings → Notifications**:
- **In-app** — shown in the notification bell
- **Email** — delivered to specified addresses
- **Slack** — posted to a channel (requires Slack integration)
- **Webhook** — POST to your own endpoint

## Crystal-Generated Alerts

When Crystal proposes an alert as part of an action proposal, accepting it auto-creates the alert with pre-filled thresholds based on Crystal's analysis. You can edit the thresholds before saving.`,
  },

  // ── NPS Automation ────────────────────────────────────────────────────────
  {
    key: 'nps-automation/setting-up-automated-nps',
    title: 'Setting Up Automated NPS Surveys',
    category: 'nps-automation',
    source_type: 'manual',
    quality_score: 0.96,
    content: `# Setting Up Automated NPS Surveys

Automated NPS surveys send at the right moment without manual effort — capturing loyalty signals at key touchpoints throughout the customer lifecycle.

## How Automated NPS Works

Instead of sending surveys manually, you define rules: when a customer reaches a milestone (or a period of time), Xperiq automatically sends them an NPS survey. Responses flow into your dashboard alongside manually-triggered surveys.

## Creating an Automated NPS Program

1. Go to **Surveys → Automations**
2. Click **+ New Automation**
3. Choose **NPS** as the survey type
4. Select trigger type (see below)
5. Set frequency limits (to avoid survey fatigue)
6. Activate

## Trigger Types

**Time-based (lifecycle)**
- 30 days after signup
- 60 days after first value event
- 7 days after support ticket resolved
- 1 day after feature first used

**Event-based (behavioral)**
- After completing onboarding
- After a purchase or renewal
- After attending a webinar or training session

**Score-based (follow-up)**
- 90 days after a Promoter response
- 30 days after a Detractor response to check resolution

## Frequency Controls

Prevent over-surveying with global limits:
- **Minimum gap** — at least X days between surveys per respondent
- **Maximum per year** — no more than Y surveys per customer
- **Suppression list** — opt-out management

## Viewing Automation Results

Each automation has its own results view showing:
- Send volume over time
- Response rate by trigger type
- NPS trend for that automation
- Crystal's analysis of patterns in automated vs. manual responses`,
  },
  {
    key: 'nps-automation/time-based-triggers',
    title: 'Time-Based NPS Triggers',
    category: 'nps-automation',
    source_type: 'manual',
    quality_score: 0.93,
    content: `# Time-Based NPS Triggers

Time-based triggers send NPS surveys automatically at defined points in the customer lifecycle. This ensures you capture loyalty signals at moments that matter, without relying on manual scheduling.

## Available Trigger Anchors

**Onboarding milestones**
- 7 days after account created
- 30 days after account created (first month check-in)
- Day after first report/survey run (first value moment)

**Renewal and retention**
- 60 days before contract renewal
- 7 days after renewal confirmed
- 30 days after a downgrade

**Support touchpoints**
- 24 hours after a support ticket marked resolved
- 48 hours after a Critical/P1 incident resolved

**Product events**
- After completing the onboarding checklist
- After exporting data for the first time
- After inviting the 5th team member

## Setting Up a Time-Based Trigger

1. Create a new survey automation
2. Select **Time-based** trigger
3. Choose the anchor event (e.g., "Account created")
4. Set the delay (e.g., "30 days after")
5. Set the send window (e.g., "Between 9am–5pm respondent local time")
6. Set frequency limits

## Chaining Triggers

You can create a sequence of NPS surveys across the lifecycle:
- Day 7: "How was your first week?"
- Day 30: "Are you getting value from Xperiq?"
- Day 90: "Would you recommend us to a colleague?"

Each sends independently with its own frequency controls. Crystal tracks NPS trends across the sequence to identify where customers are succeeding or struggling.

## Best Practices

- Always send within business hours of the respondent's timezone
- Keep NPS surveys to 2-3 questions maximum
- Set a 90-day minimum gap to avoid over-surveying
- Add a follow-up open text question after the NPS score`,
  },

  // ── API & Integrations ────────────────────────────────────────────────────
  {
    key: 'api-integrations/rest-api-quick-start',
    title: 'REST API Quick Start',
    category: 'api-integrations',
    source_type: 'manual',
    quality_score: 0.97,
    content: `# REST API Quick Start

The Xperiq REST API lets you programmatically submit responses, retrieve insights, and manage surveys from your own applications.

## Authentication

All API requests require a Bearer token. Get your API key from **Settings → API Keys**.

\`\`\`bash
curl -H "Authorization: Bearer YOUR_API_KEY" \\
  https://api.xperiq.ai/v1/surveys
\`\`\`

## Base URL

\`\`\`
https://api.xperiq.ai/v1
\`\`\`

## Core Endpoints

### Submit a Response

\`\`\`bash
POST /surveys/:surveyId/responses

{
  "respondent": {
    "email": "customer@example.com",
    "external_id": "cust_123",
    "segment": "enterprise"
  },
  "answers": [
    { "question_id": "q1", "value": 9 },
    { "question_id": "q2", "value": "Great onboarding experience" }
  ],
  "metadata": {
    "source": "in-app-prompt",
    "plan": "enterprise"
  }
}
\`\`\`

### List Surveys

\`\`\`bash
GET /surveys?status=active&limit=20
\`\`\`

### Get Insights

\`\`\`bash
GET /surveys/:surveyId/insights?layer=prescriptive
\`\`\`

### Trigger Crystal Analysis

\`\`\`bash
POST /surveys/:surveyId/insights/generate
{
  "depth": "expert"
}
\`\`\`

## Rate Limits

| Plan | Requests/minute | Responses/day |
|------|----------------|--------------|
| Free | 60 | 1,000 |
| Starter | 300 | 10,000 |
| Growth | 1,000 | 100,000 |
| Enterprise | 5,000 | Unlimited |

## SDKs

Client libraries are available for:
- **Node.js**: \`npm install @xperiq/sdk\`
- **Python**: \`pip install xperiq-sdk\`
- **Ruby**: \`gem install xperiq\`

Full API reference at [api.xperiq.ai/docs](https://api.xperiq.ai/docs)`,
  },
  {
    key: 'api-integrations/webhooks',
    title: 'Webhook Configuration',
    category: 'api-integrations',
    source_type: 'manual',
    quality_score: 0.94,
    content: `# Webhook Configuration

Webhooks let Xperiq push real-time events to your servers — no polling required. Configure webhooks to receive notifications when responses come in, insights are generated, or alerts fire.

## Setting Up a Webhook

1. Go to **Settings → Webhooks**
2. Click **+ Add Webhook**
3. Enter your endpoint URL (must be HTTPS)
4. Select the events to receive
5. Copy the signing secret
6. Click **Save & Test**

## Webhook Events

| Event | Fires when |
|-------|-----------|
| \`response.created\` | A new survey response is submitted |
| \`response.completed\` | All required questions are answered |
| \`insight.generated\` | Crystal completes an insight run |
| \`alert.fired\` | An alert threshold is crossed |
| \`survey.published\` | A survey is activated |
| \`ticket.created\` | A support ticket is opened |

## Payload Structure

\`\`\`json
{
  "event": "response.created",
  "timestamp": "2026-06-25T14:22:00Z",
  "org_id": "org_abc",
  "data": {
    "response_id": "resp_xyz",
    "survey_id": "surv_123",
    "respondent_email": "customer@example.com",
    "nps_score": 8,
    "submitted_at": "2026-06-25T14:22:00Z"
  }
}
\`\`\`

## Verifying Webhook Signatures

Verify the \`X-Xperiq-Signature\` header to confirm requests are from Xperiq:

\`\`\`javascript
const crypto = require('crypto');

function verifySignature(payload, signature, secret) {
  const hash = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return \`sha256=\${hash}\` === signature;
}
\`\`\`

## Retry Logic

Failed deliveries (non-2xx responses or timeouts >10s) are retried:
- Immediately
- After 1 minute
- After 5 minutes
- After 30 minutes
- After 2 hours

After 5 failed attempts, the webhook is paused and you'll receive an alert.`,
  },

  // ── Data & Privacy ────────────────────────────────────────────────────────
  {
    key: 'data-privacy/security-overview',
    title: 'Data Security Overview',
    category: 'data-privacy',
    source_type: 'manual',
    quality_score: 0.98,
    content: `# Data Security Overview

Xperiq is built for enterprise security requirements. Here's how we protect your data.

## Infrastructure

- **Cloud provider**: Google Cloud Platform (us-east1 primary, us-west2 secondary)
- **Encryption at rest**: AES-256 for all stored data
- **Encryption in transit**: TLS 1.3 for all API connections
- **Database**: Postgres with row-level security and encrypted backups

## Access Controls

**Authentication**
- SSO via SAML 2.0 (Okta, Azure AD, Google Workspace)
- MFA required for all admin actions
- Clerk-based JWT auth with 1-hour token expiry

**Authorization**
- Role-based access control (RBAC) with custom roles
- Survey-level permissions (view, edit, distribute, delete)
- Org-level admin roles with audit trail

## Data Isolation

- All data is scoped to your organization by \`org_id\`
- Survey data never crosses organization boundaries
- CrystalOS processes data in isolated execution contexts

## Compliance

| Standard | Status |
|----------|--------|
| SOC 2 Type II | Certified |
| GDPR | Compliant |
| CCPA | Compliant |
| HIPAA | Available on Enterprise plan |

## Data Retention

Default retention periods:
- Survey responses: 3 years (configurable)
- Deleted survey data: 30-day soft delete, then permanent removal
- Audit logs: 7 years
- Crystal conversation history: 7 days (rolling)

## Incident Response

Security incidents trigger our SLA:
- Critical: 1-hour response, customer notification within 4 hours
- High: 4-hour response
- Medium/Low: 24-hour response

Report a security issue: security@xperiq.ai`,
  },
  {
    key: 'data-privacy/gdpr-compliance',
    title: 'GDPR & Data Privacy',
    category: 'data-privacy',
    source_type: 'manual',
    quality_score: 0.96,
    content: `# GDPR & Data Privacy

Xperiq is fully GDPR-compliant. This guide explains how we handle personal data and how to manage your obligations as a data controller.

## Data Processing Agreement

As a data processor on your behalf, Xperiq provides a standard DPA. Download from **Settings → Legal → Data Processing Agreement** or contact support for a custom DPA.

## Respondent Rights

Xperiq supports all GDPR data subject rights:

**Right to Access**
Export all data for a respondent via **Settings → Privacy → Export Respondent Data**. Provide the respondent's email address.

**Right to Erasure**
Delete all data for a respondent via **Settings → Privacy → Delete Respondent Data**. This removes responses, session data, and contact records. Note: aggregate statistics are not personally identifiable and are retained.

**Right to Portability**
Respondent data exports are available in JSON and CSV formats.

**Right to Rectification**
Edit respondent contact details from the Respondents tab.

## Consent Management

If you collect personally identifiable information (PII) in survey responses:

1. Enable **Consent Collection** in survey settings
2. Add a consent statement before the first question
3. Responses include a consent timestamp

## Data Minimisation

Best practices:
- Use anonymous surveys when individual identity isn't needed
- Enable **Response Anonymization** to auto-strip email addresses and names from open-text responses
- Set retention periods aligned with your policy

## Sub-processors

Xperiq's current sub-processors:
- **Google Cloud** — infrastructure
- **OpenRouter** — AI model routing (no data retained)
- **Clerk** — authentication
- **Sentry** — error monitoring (anonymised)

Full list available at [xperiq.ai/legal/sub-processors](https://xperiq.ai/legal/sub-processors).`,
  },

  // ── Billing & Plans ───────────────────────────────────────────────────────
  {
    key: 'billing/credits-and-plans',
    title: 'Understanding Credits & Plans',
    category: 'billing',
    source_type: 'manual',
    quality_score: 0.97,
    content: `# Understanding Credits & Plans

Xperiq uses a credit system to measure AI usage. Credits let you pay for exactly what you use, with a monthly allowance included in each plan.

## Plans

| Plan | Monthly Credits | Price |
|------|----------------|-------|
| Free | 225 (one-time grant) | $0 |
| Starter | 1,500 | $49/mo |
| Growth | 12,000 | $299/mo |
| Enterprise | 80,000 | $1,499/mo |
| Platform | 500,000 | Custom |

## Credit Costs

| Action | Credits |
|--------|---------|
| Insight run (Quick or Expert) | 50 |
| Crystal AI conversation turn | 15 |
| XO Fusion (cross-org analysis) | 200 |
| Broadcast email | 2 |
| Broadcast SMS | 8 |

**Example:** On the Starter plan (1,500 credits), you can run ~30 full insight pipelines per month, or hold ~100 Crystal conversations.

## Credit Balance

Your current balance is always visible in the top bar (the ✨ chip). Click it to see:
- Available credits
- Monthly allowance progress
- Credit cost breakdown
- Upgrade options

## Purchasing Additional Credits

Run out mid-month? Buy credit packs from **Settings → Billing → Buy Credits**. Packs are available in increments of 500, 2,000, and 10,000 credits.

## Unused Credits

Monthly allowance credits expire at the end of each billing period. Purchased credit packs roll over indefinitely.

## Enterprise Billing

Enterprise plans include custom terms, purchase orders, and invoicing. Contact sales@xperiq.ai or your account manager.`,
  },
  {
    key: 'billing/upgrading-your-plan',
    title: 'Upgrading Your Plan',
    category: 'billing',
    source_type: 'manual',
    quality_score: 0.93,
    content: `# Upgrading Your Plan

Upgrade to unlock more credits, higher rate limits, and enterprise features.

## How to Upgrade

1. Click the **✨ credits chip** in the top bar
2. Click **Upgrade Plan**
3. Choose your plan on the Stripe checkout page
4. Enter your payment details
5. Your new plan is active immediately after payment

Alternatively, go to **Settings → Billing → Plan**.

## What Changes After Upgrading

- **Credits** reset to your new plan's monthly allowance immediately
- **Rate limits** increase on the API
- **Features** are unlocked based on your plan tier:
  - Starter: Webhooks, API access, custom templates
  - Growth: SSO, custom branding, Slack integration, advanced analytics
  - Enterprise: HIPAA, dedicated support, custom DPA, SLA, multi-org

## Downgrading

Downgrades take effect at the end of the current billing period. Your data and surveys are never deleted — you simply get fewer credits next month.

## Cancelling

Cancel from **Settings → Billing → Cancel Plan**. Your data is retained for 90 days after cancellation. You can re-activate any time during this window.

## Invoices

Invoices are emailed automatically and available at **Settings → Billing → Invoices**.

## Questions?

Contact billing@xperiq.ai or open a support ticket. We typically respond in under 2 hours.`,
  },

  // ── Troubleshooting ───────────────────────────────────────────────────────
  {
    key: 'troubleshooting/common-issues',
    title: 'Common Issues & Solutions',
    category: 'troubleshooting',
    source_type: 'manual',
    quality_score: 0.96,
    content: `# Common Issues & Solutions

Quick fixes for the most frequent problems.

## Surveys

**Survey not collecting responses**
- Check the survey is set to **Active** (not Draft or Paused)
- Verify the share link works in a private/incognito window
- Check if a response limit was set and is now full
- Make sure required questions aren't blocking submission

**Responses not appearing in dashboard**
- Hard-refresh the browser (Ctrl+Shift+R / Cmd+Shift+R)
- Check the date filter — the default is "last 30 days"
- Responses may take up to 30 seconds to appear after submission

**Export is empty**
- Verify the date range includes the response period
- Check filters aren't excluding all responses
- Ensure you have "View Data" permission on the survey

## Crystal AI

**Insights not generating**
- Crystal needs at least 10 responses before generating insights
- Check your credit balance — insight runs consume 50 credits each
- If the pipeline shows "stuck", click the ↺ Refresh button to retry

**Crystal not responding in chat**
- Refresh the page and try again
- Check your internet connection
- Crystal conversations require 15 credits per turn; low balance blocks responses

**Insights seem wrong or outdated**
- Click the ↺ button to force a fresh analysis run
- Crystal works from the current data snapshot — adding new responses requires a new run
- Trust score below 60 means insufficient data; collect more responses

## Integrations

**Webhook not receiving events**
- Verify the endpoint returns 2xx within 10 seconds
- Check the signing secret is correctly verified in your handler
- View delivery logs at **Settings → Webhooks → [Webhook] → Logs**

**SSO not working**
- SAML metadata must match exactly — re-download from your IdP
- Check the ACS URL and Entity ID in your IdP settings match Xperiq's values
- Test in an incognito window to avoid cached sessions

## Account

**Can't invite team member**
- Check your seat limit (Settings → Team → Seats)
- The email address may already have a pending invitation — resend from Settings
- Enterprise plan required for SCIM auto-provisioning`,
  },
  {
    key: 'troubleshooting/contacting-support',
    title: 'How to Get Help from Support',
    category: 'troubleshooting',
    source_type: 'manual',
    quality_score: 0.94,
    content: `# How to Get Help from Support

When you can't find the answer in our docs, our support team is here to help.

## Support Channels

**Crystal AI (fastest for quick questions)**
Click the ✨ Crystal icon on any page and ask your question. Crystal has access to all documentation and your account context.

**Support Portal (this site)**
Search docs, browse guides, or submit a ticket at [support.xperiq.ai](https://support.xperiq.ai/contact).

**Email**
Write directly to support@xperiq.ai. Include your Org ID from **Settings → General**.

## Response Times (SLA)

| Severity | Response Time |
|----------|--------------|
| P1 Critical (production outage, data loss) | < 1 hour |
| P2 High (major feature broken) | < 4 hours |
| P3 Normal (questions, requests) | < 2 business days |

Enterprise plan customers get a dedicated Slack channel with 30-minute P1 response.

## What to Include in Your Request

To help us resolve your issue quickly, please include:

1. **Org ID** — from Settings → General (looks like \`org_xxxx\`)
2. **User ID** — your email address
3. **Survey ID** — if the issue is survey-specific (in the URL)
4. **Steps to reproduce** — what you did, what you expected, what happened
5. **Error messages** — screenshots or copy-pasted error text
6. **Browser and OS** — e.g., "Chrome 125 on macOS 15"

## Escalation

If a response is taking too long or the issue is urgent:

1. Open a new ticket and set severity to **P1 Critical**
2. Email escalations@xperiq.ai with your ticket ID
3. Enterprise customers: ping the dedicated Slack channel

## Known Issues

Check the [Status Page](/status) for active incidents. The [Known Issues](/status#known-issues) section lists bugs we're already working on.`,
  },
];

async function seed() {
  console.log(`\n🌱 Seeding ${DOCS.length} support docs...\n`);

  let created = 0;
  let updated = 0;
  const errors: string[] = [];

  for (const doc of DOCS) {
    try {
      const result = await pool.query<{ id: string; pipeline_status: string }>(
        `INSERT INTO support_docs
           (org_id, key, title, content, category, source_type, quality_score, pipeline_status, published_at)
         VALUES ('__global__', $1, $2, $3, $4, $5, $6, 'live', NOW())
         ON CONFLICT (key, org_id) DO UPDATE
           SET title           = EXCLUDED.title,
               content         = EXCLUDED.content,
               category        = EXCLUDED.category,
               source_type     = EXCLUDED.source_type,
               quality_score   = EXCLUDED.quality_score,
               pipeline_status = 'live',
               published_at    = COALESCE(support_docs.published_at, NOW()),
               updated_at      = NOW()
         RETURNING id, pipeline_status, (xmax = 0) AS inserted`,
        [
          doc.key,
          doc.title,
          doc.content,
          doc.category,
          doc.source_type,
          doc.quality_score,
        ],
      );

      const row = result.rows[0] as { id: string; pipeline_status: string; inserted: boolean };
      if (row.inserted) {
        created++;
        console.log(`  ✅ Created: ${doc.key}`);
      } else {
        updated++;
        console.log(`  🔄 Updated: ${doc.key}`);
      }
    } catch (err) {
      errors.push(doc.key);
      console.error(`  ❌ Failed: ${doc.key} — ${(err as Error).message}`);
    }
  }

  // Seed changelog entries
  const CHANGELOG = [
    {
      version: '2.4.0',
      released_at: '2026-06-15T00:00:00Z',
      summary: 'Crystal AI v2 — Reasoning Transparency & Multi-turn Context',
      changes: [
        { type: 'feature', title: 'Reasoning transparency', description: 'Crystal now shows its reasoning steps as it analyzes your data, including which surveys and signals it consulted.' },
        { type: 'feature', title: 'Multi-turn context retention', description: 'Crystal conversations retain full context across sessions — no need to repeat yourself.' },
        { type: 'improvement', title: 'Faster insight pipeline', description: 'Expert pipeline runs 40% faster through parallel processing.' },
      ],
    },
    {
      version: '2.3.5',
      released_at: '2026-06-08T00:00:00Z',
      summary: 'Webhook reliability improvements and event ordering guarantees',
      changes: [
        { type: 'fix', title: 'Webhook silent retry failures', description: 'Fixed edge case causing webhook retries to fail silently after 3 attempts.' },
        { type: 'improvement', title: 'Event ordering guarantees', description: 'Improved event ordering for high-volume organisations (>1000 responses/hour).' },
      ],
    },
    {
      version: '2.3.0',
      released_at: '2026-05-28T00:00:00Z',
      summary: 'NPS Automation: Time-based triggers for lifecycle milestones',
      changes: [
        { type: 'feature', title: 'Time-based NPS triggers', description: 'Trigger NPS surveys automatically based on customer milestones: 30/60/90 day post-onboarding, post-support-resolution, and post-renewal.' },
        { type: 'feature', title: 'Timezone-aware sending', description: 'Surveys are delivered within the respondent\'s local business hours.' },
      ],
    },
    {
      version: '2.2.0',
      released_at: '2026-05-10T00:00:00Z',
      summary: 'Crystal action proposals — closed-loop execution between AI and human',
      changes: [
        { type: 'feature', title: 'Action proposals', description: 'Crystal can now propose concrete actions (send a survey, update a segment, trigger a workflow). You review and confirm — nothing executes without your sign-off.' },
        { type: 'feature', title: 'Outcome tracking', description: 'Proposal outcomes (accepted/dismissed/succeeded/failed) are tracked and fed back to improve future proposals.' },
      ],
    },
    {
      version: '2.1.3',
      released_at: '2026-04-22T00:00:00Z',
      summary: 'Analytics dashboard performance — 40% faster initial load',
      changes: [
        { type: 'improvement', title: 'Dashboard initial load', description: 'Reduced initial dashboard load time by 40% through incremental data loading and smarter cache invalidation.' },
        { type: 'improvement', title: 'Background report exports', description: 'Report exports now generate in the background and notify when ready — no more waiting at the export screen.' },
      ],
    },
  ];

  console.log(`\n📋 Seeding ${CHANGELOG.length} changelog entries...\n`);

  for (const entry of CHANGELOG) {
    try {
      await pool.query(
        `INSERT INTO support_changelog
           (version, released_at, summary, changes)
         VALUES ($1, $2::timestamptz, $3, $4::jsonb)
         ON CONFLICT (version) DO UPDATE
           SET released_at = EXCLUDED.released_at,
               summary     = EXCLUDED.summary,
               changes     = EXCLUDED.changes`,
        [entry.version, entry.released_at, entry.summary, JSON.stringify(entry.changes)],
      );
      console.log(`  ✅ Changelog: v${entry.version}`);
    } catch (err) {
      console.error(`  ❌ Changelog v${entry.version}: ${(err as Error).message}`);
    }
  }

  console.log('\n' + '─'.repeat(50));
  console.log(`✅ Done! Created: ${created}, Updated: ${updated}, Errors: ${errors.length}`);
  if (errors.length > 0) {
    console.log(`\nFailed keys:\n  ${errors.join('\n  ')}`);
  }
  console.log('\nRestart the backend and refresh the support site to see docs.\n');
}

seed()
  .catch((err) => {
    console.error('Fatal seed error:', err);
    process.exit(1);
  })
  .finally(() => pool.end());
