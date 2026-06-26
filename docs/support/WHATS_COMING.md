# What's Coming — Page Design
## Live Roadmap & In-Flight Features

**Status:** Design  
**Owner:** Product + Engineering  
**URL:** `support.experient.ai/roadmap` (also accessible as `/roadmap` from the main app)

---

## Purpose

The "What's Coming" page is the single source of truth for what Experient is shipping, what it's building right now, and what's planned. It eliminates a class of support queries: "Is X supported?", "When will Y ship?", "Did you fix Z?" — customers find the answer here before they ever talk to Crystal.

It is not a marketing page. It is not a sales promise page. It is an honest, technical account of the state of the platform — updated automatically every time a feature status changes in TRACKER.md.

---

## Page Structure

```
┌──────────────────────────────────────────────────────────────────────┐
│  HEADER                                                              │
│                                                                      │
│  What's Coming                                                       │
│  Last updated: 4 minutes ago  |  Next expected update: on every push │
│                                                                      │
│  [Filter: All · Features · Fixes · API · Crystal · Enterprise]      │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│  SECTION 1: JUST SHIPPED                                             │
│  (last 10 items with ✅ or 🧪 status, most recent first)             │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ ✅ SHIPPED  •  Sprint 7  •  May 2026                         │   │
│  │                                                              │   │
│  │ Crystal skill runtime — SKILL.md + EVALS.md execution        │   │
│  │ Skills now run as isolated LLM prompts with quality scoring. │   │
│  │ Adds: 13 skills across insight-narrator, copilot, analyst.  │   │
│  │                                                              │   │
│  │ [Read the docs ↗]  [View changelog ↗]                       │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ ✅ SHIPPED  •  Sprint 6  •  April 2026                       │   │
│  │                                                              │   │
│  │ Credit-based billing — Stripe integration + credit ledger   │   │
│  │ Pay-per-use credits replace seat licenses across all tiers. │   │
│  │                                                              │   │
│  │ [Read the docs ↗]  [View changelog ↗]                       │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  [See full changelog ↗]                                             │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│  SECTION 2: BUILDING NOW                                             │
│  (items with 🔄 status from current sprint)                          │
│                                                                      │
│  Sprint 8  ·  June–July 2026                                        │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ 🔄 IN PROGRESS  •  Sprint 8                                  │   │
│  │                                                              │   │
│  │ Support Site — automated docs + Crystal support skill       │   │
│  │ Docs that write themselves. Crystal answers before you ask.  │   │
│  │                                                              │   │
│  │ ████████████░░░  75% complete                               │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ 🔄 IN PROGRESS  •  Sprint 8                                  │   │
│  │                                                              │   │
│  │ Analytics Dashboard — NPS, CSAT, CES live charts            │   │
│  │ ResponseDashboardPage and InsightsDashboardPage wired to     │   │
│  │ real analytics endpoints.                                    │   │
│  │                                                              │   │
│  │ ██████░░░░░░░░░  40% complete                               │   │
│  └──────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│  SECTION 3: PLANNED NEXT                                             │
│  (next 2 sprints of planned features)                                │
│                                                                      │
│  Sprint 9  ·  Q3 2026                                               │
│                                                                      │
│  ⬜ Crystal action proposals — closed-loop actions from Crystal     │
│  ⬜ Workflow visual builder — drag-and-drop no-code automation      │
│  ⬜ Visual AI — natural language chart generation                   │
│                                                                      │
│  Sprint 10  ·  Q3 2026                                              │
│                                                                      │
│  ⬜ SCIM provisioning — auto-sync users from your IdP              │
│  ⬜ SAML SSO — enterprise single sign-on                           │
│  ⬜ Notification service — real-time Crystal-narrated alerts        │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│  SECTION 4: ON THE HORIZON                                           │
│  (major upcoming phases, no sprint assigned)                         │
│                                                                      │
│  Phase 2 — AI Engine (Q3–Q4 2026)                                   │
│  Predictive NPS modeling, anomaly detection, cross-survey            │
│  correlations, Crystal proactive narratives.                        │
│                                                                      │
│  Phase 4 — Enterprise (Q4 2026)                                     │
│  SSO, SCIM, audit logs, data residency, white-labeling,             │
│  dedicated Crystal brain per brand.                                  │
│                                                                      │
│  Phase 5 — Integrations (Q1 2027)                                   │
│  Salesforce, ServiceNow, Jira, Zendesk, Slack native app,           │
│  MCP skill publishing.                                              │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│  FOOTER                                                              │
│                                                                      │
│  This page is auto-generated from our work tracker.                 │
│  It updates every time a feature status changes.                    │
│                                                                      │
│  Want to be notified when something ships?                          │
│  [Subscribe to release notes →]                                     │
│                                                                      │
│  Have a feature request?                                            │
│  [Tell Crystal what you need →]                                     │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Data Model

The page is rendered from a JSON feed produced by the TRACKER.md parser:

```json
{
  "generated_at": "2026-06-25T14:32:00Z",
  "current_sprint": {
    "number": 8,
    "label": "Sprint 8",
    "date_range": "June–July 2026"
  },
  "sections": {
    "shipped": [
      {
        "id": "crystal-skill-runtime",
        "title": "Crystal skill runtime",
        "description": "Skills now run as isolated LLM prompts with quality scoring.",
        "detail": "Adds: 13 skills across insight-narrator, copilot, analyst.",
        "sprint": 7,
        "shipped_date": "2026-05-15",
        "tags": ["crystal", "ai"],
        "doc_key": "feature.crystal-skill-runtime",
        "changelog_id": "2026-05-15-crystal-skill-runtime"
      }
    ],
    "building": [
      {
        "id": "support-site",
        "title": "Support Site",
        "description": "Docs that write themselves. Crystal answers before you ask.",
        "sprint": 8,
        "progress_pct": 75,
        "tags": ["support", "crystal"],
        "tracker_id": "8-support"
      }
    ],
    "planned_next": [
      {
        "id": "crystal-action-proposals",
        "title": "Crystal action proposals",
        "description": "Closed-loop actions from Crystal",
        "sprint": 9,
        "tags": ["crystal", "actions"]
      }
    ],
    "horizon": [
      {
        "phase": "Phase 2 — AI Engine",
        "eta": "Q3–Q4 2026",
        "description": "Predictive NPS modeling, anomaly detection..."
      }
    ]
  }
}
```

**Feed endpoint:** `GET /api/support/roadmap`  
**Cache:** Redis, 10-minute TTL, invalidated on TRACKER.md push

---

## Filtering

The page supports tag-based filtering. Tags are auto-extracted from TRACKER.md item notes and feature names.

| Filter | Tags included |
|--------|-------------|
| All | — |
| Features | `feature`, `ui`, `ux` |
| Fixes | `fix`, `bug`, `regression` |
| API | `api`, `endpoint`, `schema` |
| Crystal | `crystal`, `ai`, `skill` |
| Enterprise | `enterprise`, `sso`, `saml`, `scim`, `rbac`, `audit` |

---

## Notify on Ship

Users can subscribe to release notifications. When a tracked feature moves to `✅ Shipped`, an email is sent to subscribers who indicated interest in that tag.

This is powered by the existing Novu notification service. Event: `feature.shipped`. Template: a clean "Here's what just shipped" email with:
- Feature name and description
- Link to the new documentation
- Link to the changelog entry
- "Tell Crystal you're ready to try it" CTA

---

## Crystal Panel Integration

Within the app, users can ask Crystal about the roadmap:

**User:** "Is SAML SSO available?"  
**Crystal (support mode):** "SAML SSO is planned for Sprint 10, estimated Q3 2026. It's not available yet. If you need SSO today, your options are: [Clerk-based social login] or [contact sales for enterprise early access]. Want me to add you to the notify list?"

This response is generated by the `crystal-support` skill calling `get_feature_status("SAML SSO")` which returns `{ status: "planned", sprint: 10, eta_text: "Q3 2026" }`.

---

## Trust Signals

Three elements on the page build trust through honesty:

**1. Accuracy badge:** "This page updates automatically when our engineers change feature status. Not manually curated."

**2. Last-updated timestamp:** Shown in the header — exact time the feed was last regenerated.

**3. Actual dates:** Shipped items show the actual ship date pulled from git log, not a planned date. "Shipped May 15, 2026" is a real commit date, not a marketing date.

---

## Internal View vs. Public View

The roadmap has two versions:

**Public (rendered at `/support/roadmap`):**
- Only items tagged `[public]` in TRACKER.md
- No internal notes or implementation details
- No sprint numbers on horizon items (too easy to hold us accountable for scope changes)

**Internal (rendered at `/admin/roadmap` — requires `org:admin` role):**
- All items including `[internal]` tagged ones
- Sprint numbers on all items
- Implementation notes
- Estimated credit costs for AI features
- Cross-links to GitHub issues

The parser produces both feeds from a single TRACKER.md parse. The `[internal]` tag strips items from the public feed only.
