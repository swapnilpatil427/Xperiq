# Experient Support Site — Structure & UX Design
## Complete Information Architecture and User Experience

**Status:** Design  
**Owner:** Product + UX  
**URL:** `support.experient.ai`  
**Companion to:** [DESIGN.md](./DESIGN.md), [ARCHITECTURE.md](./ARCHITECTURE.md)

---

## Guiding UX Principle

**A frustrated user should find their answer in under 45 seconds or be talking to Crystal.**

Every design decision is evaluated against this. Long navigation menus fail it. Buried FAQ sections fail it. "Contact us" as the first option fails it. Crystal as the entry point succeeds.

---

## Site Map

```
support.experient.ai/
│
├── /                           → Home (Crystal + quick navigation)
├── /search                     → Full-text + semantic search
├── /roadmap                    → What's Coming (auto-generated)
├── /status                     → System status (live)
├── /changelog                  → Release history (auto-generated)
│
├── /guides/                    → Getting started + how-to guides
│   ├── getting-started         → First 30 minutes with Experient
│   ├── survey-builder          → Creating and editing surveys
│   ├── crystal-basics          → What Crystal is, how to talk to it
│   ├── crystal-advanced        → Crystal actions, proposals, workflows
│   ├── insights-guide          → Reading and acting on insights
│   ├── workflows-guide         → No-code automation builder
│   ├── team-management         → Invites, roles, permissions
│   ├── billing-guide           → Credits, plans, payments
│   └── integrations-guide      → Slack, webhooks, API keys
│
├── /api/                       → API reference (auto-generated)
│   ├── overview                → Authentication, rate limits, errors
│   ├── surveys/                → Survey CRUD endpoints
│   ├── responses/              → Response collection endpoints
│   ├── insights/               → Insight + analysis endpoints
│   ├── workflows/              → Workflow management endpoints
│   ├── billing/                → Credits + subscription endpoints
│   ├── members/                → Team + RBAC endpoints
│   └── webhooks/               → Webhook event reference
│
├── /crystal/                   → Crystal AI reference
│   ├── overview                → What Crystal knows, what it doesn't
│   ├── skills/                 → All 13+ skills, auto-generated
│   │   ├── crystal-analyst
│   │   ├── insight-narrator
│   │   ├── specialist-nps
│   │   ├── specialist-csat
│   │   ├── specialist-ces
│   │   ├── crystal-support     → NEW: support skill
│   │   └── ... (all skills)
│   ├── actions                 → Action proposals: how Crystal suggests changes
│   ├── limits                  → Rate limits, context window, capabilities
│   └── privacy                 → What data Crystal processes
│
├── /features/                  → Feature-specific docs (status-aware)
│   ├── dashboard
│   ├── notifications
│   ├── alerts
│   ├── visual-ai
│   ├── workflows
│   ├── billing-credits
│   ├── rbac-permissions
│   ├── saml-sso                → [PLANNED] badge auto-applied
│   ├── scim-provisioning       → [PLANNED] badge auto-applied
│   └── audit-logs              → [PLANNED] badge auto-applied
│
└── /account/                   → Account & org management
    ├── plan-limits             → What each plan includes
    ├── credit-usage            → How credits are consumed
    └── data-privacy            → GDPR, data retention, deletion
```

---

## Home Page Layout

The home page is a support destination, not a landing page. It is optimized for the user who arrives with a problem.

```
┌──────────────────────────────────────────────────────────────────────┐
│  HEADER: minimal — logo, search icon, "Back to app" link             │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│  CRYSTAL PANEL (full width, prominent)                               │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │ Crystal                                           ○ Ready      │ │
│  │                                                                │ │
│  │  Ask me anything about Experient. I know what's live, what's  │ │
│  │  coming, and I can check your account.                        │ │
│  │                                                                │ │
│  │  ┌──────────────────────────────────────────────────────────┐ │ │
│  │  │  What can I help you with?                          [↑]  │ │ │
│  │  └──────────────────────────────────────────────────────────┘ │ │
│  │                                                                │ │
│  │  Popular right now:                                           │ │
│  │  · How do I export responses?                                 │ │
│  │  · What's the difference between NPS and CSAT?               │ │
│  │  · Is SAML SSO available yet?                                 │ │
│  └────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│  QUICK NAVIGATION (4 cards)                                          │
│                                                                      │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────────┐ │
│  │   Get        │ │   API        │ │   Crystal    │ │  What's    │ │
│  │   Started    │ │   Reference  │ │   Reference  │ │  Coming    │ │
│  │              │ │              │ │              │ │            │ │
│  │  First 30    │ │  Endpoints,  │ │  Skills,     │ │  Roadmap,  │ │
│  │  minutes     │ │  schemas,    │ │  tools,      │ │  in-flight,│ │
│  │              │ │  auth        │ │  capabilities│ │  changelog │ │
│  └──────────────┘ └──────────────┘ └──────────────┘ └────────────┘ │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│  PLATFORM STATUS  (live badge from /api/support/status)              │
│                                                                      │
│  ● All systems operational                    Last checked: 30s ago  │
│                                                                      │
│  API ● Healthy · CrystalOS ● Healthy · Exports ● Healthy           │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│  JUST SHIPPED  (last 3 changelog entries)                            │
│                                                                      │
│  Sprint 8 · June 2026                                               │
│  Support site with Crystal support AI — Docs write themselves.      │
│                                                                      │
│  Sprint 7 · May 2026                                                │
│  Crystal skill runtime — 13 skills, quality scoring.               │
│                                                                      │
│  Sprint 6 · April 2026                                              │
│  Credit billing — Stripe integration, pay-per-use.                 │
│                                                                      │
│  [See full changelog →]                                             │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Doc Page Layout

Every auto-generated doc page follows this structure:

```
┌──────────────────────────────────────────────────────────────────────┐
│  BREADCRUMB: Support / API / Surveys / Create Survey                 │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│  TITLE + STATUS                                                      │
│                                                                      │
│  Create Survey                                    ✅ Stable          │
│  POST /api/surveys                                                   │
│                                                                      │
│  Creates a new survey in your organization. Requires analyst role   │
│  or higher. Costs 0 credits (survey creation is free; AI generation │
│  costs 10 credits).                                                  │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│  TABBED CONTENT                                                      │
│  [Overview] [Parameters] [Response] [Errors] [Examples] [Code]      │
│                                                                      │
│  — Overview tab —                                                   │
│  Description, authentication requirements, rate limits              │
│                                                                      │
│  — Parameters tab —                                                 │
│  | Field    | Type   | Required | Description          |            │
│  | title    | string | yes      | Survey display name  |            │
│  | type     | enum   | yes      | 'nps'|'csat'|'custom'|            │
│  | questions| array  | no       | Pre-load questions   |            │
│                                                                      │
│  — Code tab —                                                       │
│  [curl] [Node.js] [Python]                                          │
│  Syntax-highlighted, runnable code examples (auto-generated)       │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│  ASK CRYSTAL (inline, collapsed by default)                         │
│                                                                      │
│  [Ask Crystal about this endpoint ▸]                                │
│                                                                      │
│  Expands to show Crystal panel pre-loaded with:                     │
│  "I'm looking at the Create Survey endpoint. I have a question..."  │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│  RELATED DOCS                                                        │
│                                                                      │
│  → List Surveys         → Publish Survey                            │
│  → AI Survey Generation → Survey Data Model                         │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│  DOC FEEDBACK                                                        │
│                                                                      │
│  Was this page helpful?   👍 Yes    👎 No                           │
│  "No" opens: "What was missing?" (text input → doc_gap)             │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│  FOOTER: "This page was auto-generated from source code on June 25, │
│  2026. Source: backend/src/routes/experience.ts"                    │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Status Page

The status page (`/status`) shows real-time platform health:

```
┌──────────────────────────────────────────────────────────────────────┐
│  Platform Status                                    Updated: live    │
│                                                                      │
│  ████████████████████████████████████  99.94% uptime (90 days)     │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│  COMPONENTS                                                          │
│                                                                      │
│  ● API                        Healthy   Avg response: 48ms          │
│  ● CrystalOS (AI engine)      Healthy   Avg response: 1.2s          │
│  ● Survey Response Collection Healthy                               │
│  ● Insight Pipeline           Healthy                               │
│  ● Notifications              Healthy                               │
│  ● Exports (CSV/PDF)          Healthy                               │
│  ● Billing                    Healthy                               │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│  INCIDENT HISTORY  (last 30 days)                                    │
│                                                                      │
│  No incidents in the last 30 days.                                  │
└──────────────────────────────────────────────────────────────────────┘
```

Data sources:
- Component health: Prometheus metrics exposed by `/api/metrics`
- Uptime: UptimeRobot API
- Active incidents: `support_known_issues` with `severity = 'critical'` and `status = 'open'`

---

## In-App Support Panel

Within the Experient app, Crystal's existing panel gains a support mode. The transition is seamless — no separate "support chat" widget.

When Crystal detects a support query:

```
┌─────────────────────────────────────────────────────┐
│ Crystal                          ○ Support mode      │
├─────────────────────────────────────────────────────┤
│                                                     │
│  You: Why is my NPS export failing?                 │
│                                                     │
│  Crystal: I checked the known issues and your       │
│  account. There's a current issue with CSV exports  │
│  on surveys with >50K responses — you have 62K.    │
│                                                     │
│  Workaround: Use filtered export (date range < 6    │
│  months). This runs a smaller query that completes  │
│  without timeout.                                   │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │ 📄 Known Issue: CSV Export Timeout           │   │
│  │ Active · Medium severity · Workaround ✓      │   │
│  │ Expected fix: Sprint 9                       │   │
│  │                                [Read more ↗] │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  Was this helpful?   👍 Yes   👎 No — open ticket   │
└─────────────────────────────────────────────────────┘
```

The "open ticket" button on 👎 creates a pre-filled ticket with Crystal's investigation context and routes it to the support queue.

---

## Personalized Content

When a user is authenticated (Clerk session), the support site adapts:

| Personalization | Data source | Example |
|----------------|-------------|---------|
| Plan-aware docs | Account state | Business plan users see their rate limits, not free tier |
| Current status | Account state | "Your credits: 42,000 / 100,000" in billing guide |
| Active known issues | Ticket + known issues | "This known issue affects your account" banner |
| Recent tickets | support_tickets | "Your open tickets" in Crystal panel |
| Crystal context | Active survey | "I see you're on the NPS survey dashboard" |

---

## Search

Two search mechanisms work in parallel:

**Algolia DocSearch (fast, full-text):**
- Indexed from support_docs on every doc update
- Responds in < 200ms
- Covers exact keyword matches
- Default search for non-authenticated users

**pgvector Semantic Search (smart, AI-powered):**
- Used by Crystal's `search_support_docs` tool
- Finds conceptually related content, not just keyword matches
- "How do I prevent bias in my survey" → finds `guide.survey-qc` even without matching words
- Responds in < 800ms
- Used when Algolia returns no results or when Crystal is active

---

## Accessibility

- All pages meet WCAG 2.1 AA
- Crystal panel is keyboard-navigable (Tab, Enter to submit, Escape to close)
- Status indicators use color + text (not color alone)
- Code examples have syntax labels (not color-only language identification)
- Doc pages have semantic heading hierarchy (h1 → h2 → h3)
- Alt text on all diagrams (auto-generated by Crystal from diagram context)

---

## Performance

| Metric | Target | Mechanism |
|--------|--------|-----------|
| First Contentful Paint | < 1.2s | ISR static pages, CDN |
| Crystal first response | < 3s | CrystalOS p95 latency SLA |
| Search results | < 300ms | Algolia, pgvector pre-warmed |
| Status page refresh | < 2s | Prometheus pull, 30s cache |
| Doc page weight | < 150KB | No heavy dependencies |

---

## Zero-Human Intervention: Operational Summary

Under normal conditions, no human touches the support system. Here is the full operational picture:

| Activity | Automated? | Mechanism |
|----------|-----------|-----------|
| Docs written | ✅ Yes | `doc-writer` skill on every push |
| Docs updated when code changes | ✅ Yes | CI diff detection + regeneration |
| Status badges updated | ✅ Yes | TRACKER.md parser on every push |
| Changelog updated | ✅ Yes | Git log extractor on every push |
| Roadmap updated | ✅ Yes | TRACKER.md parser on every push |
| Known issues surfaced | ✅ Yes | `support_known_issues` table, Crystal reads it |
| Tier-1 support (how-to) | ✅ Yes | `crystal-support` skill |
| Tier-2 support (broken, billing) | ✅ Yes | `crystal-support` with account + known issues tools |
| Doc gaps identified | ✅ Yes | Failed Crystal resolutions → `support_doc_gaps` |
| Ticket created on escalation | ✅ Yes | `create_support_ticket` tool |
| Ticket context populated | ✅ Yes | Crystal's investigation log auto-attached |
| Tier-3 support (novel issues) | ❌ Human | Engineer reads Crystal's escalation package |
| Doc annotation (5% failures) | ❌ Human | One sentence added to Crystal draft |
| Known issue entered | ❌ Human | Engineer adds to `support_known_issues` after diagnosis |

Human involvement is structural: tier-3 tickets and the 5% of doc quality failures that need annotation. Everything else runs unattended.

---

## Launch Checklist

Before the support site goes live:

- [ ] Bootstrap doc generation run complete (all existing routes/schemas/skills)
- [ ] TRACKER.md items tagged `[public]` for roadmap
- [ ] `crystal-support` skill deployed and tested in CrystalOS
- [ ] Support tables migrated (`supabase/migrations/`)
- [ ] Backend support routes deployed and health-checked
- [ ] Support site (Next.js) deployed to Fly.io
- [ ] Algolia DocSearch index seeded
- [ ] pgvector embeddings generated for all docs
- [ ] Status page wired to Prometheus + UptimeRobot
- [ ] Novu notification template `feature.shipped` configured
- [ ] Crystal panel in app updated with support intent classifier
- [ ] Prometheus metrics for support system deployed
- [ ] Grafana dashboard for support metrics configured
- [ ] `#doc-eng` Slack channel created for annotation queue alerts
- [ ] Human annotation workflow documented and team briefed
