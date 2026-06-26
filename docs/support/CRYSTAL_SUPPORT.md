# Crystal Support Skill — Design Specification
## `crystal-support`: AI-Powered Support Resolution

**Status:** Design  
**Owner:** CrystalOS Team  
**Skill path:** `crystalos/skills/crystal-support/`  
**Companion to:** [ARCHITECTURE.md](./ARCHITECTURE.md)

---

## Purpose

`crystal-support` is the CrystalOS skill that handles support queries. It is distinct from `crystal-analyst` (which handles data analysis) and is invoked whenever Crystal detects that a user is asking about platform behavior, billing, account state, feature availability, or known problems — rather than asking about their survey data.

This skill is the first-responder for all support interactions. It resolves tier-1 and tier-2 queries autonomously and creates structured escalation packages for tier-3.

---

## Intent Classification

Before every Crystal turn, a pre-turn classifier determines whether the query is a **data query** (route to `crystal-analyst`) or a **support query** (route to `crystal-support`).

### Support Intent Signals

The classifier uses pattern matching + semantic similarity against intent categories:

| Category | Example Queries | Confidence Signal |
|----------|----------------|-----------------|
| `how-to` | "How do I export my data?", "How to set up SAML?" | Starts with "how" + platform noun |
| `broken` | "My export is failing", "Crystal isn't responding" | State verb + platform noun + negative |
| `billing` | "Why was I charged?", "I'm out of credits" | Billing noun + confusion verb |
| `feature-status` | "Is SCIM supported?", "When is mobile push shipping?" | Feature noun + status verb |
| `account` | "I can't log in", "My teammates can't see the survey" | Account/access noun + problem verb |
| `api` | "Getting 401 on the API", "Rate limit hit" | HTTP status + API noun |
| `data-export` | "CSV has wrong columns", "PDF report is blank" | Export format + problem |
| `integration` | "Slack notifications stopped", "Webhook not firing" | Integration name + stopped/broken |

**Mixed queries** (e.g., "My NPS dropped and my export failed") are classified as `mixed`. Crystal answers the support part first, then routes the data part to `crystal-analyst` in the same conversation.

### Classifier Implementation

```python
# crystalos/lib/support_classifier.py

SUPPORT_INTENT_PATTERNS = [
    (r"\bhow (do|can|should) (i|we|you)\b", "how-to", 0.90),
    (r"\b(not working|broken|failed|failing|stopped|can't|cannot|won't)\b", "broken", 0.85),
    (r"\b(charge|charged|billing|invoice|credit|payment|stripe|subscription)\b", "billing", 0.90),
    (r"\b(when (is|will)|roadmap|planned|coming|shipped|beta|released)\b", "feature-status", 0.85),
    (r"\b(can't log in|sign in|access|permission|role|invite|member)\b", "account", 0.85),
    (r"\b(401|403|404|429|500|rate limit|api key|endpoint)\b", "api", 0.90),
    (r"\b(csv|pdf|excel|export|download|report)\b.*\b(blank|empty|wrong|fail|error)\b", "data-export", 0.85),
    (r"\b(slack|webhook|zapier|salesforce|jira|novu|integration)\b.*\b(not|stopped|broken|fail)\b", "integration", 0.90),
]

def classify_support_intent(query: str) -> tuple[str | None, float]:
    """Returns (category, confidence) or (None, 0.0) if not a support query."""
    query_lower = query.lower()
    for pattern, category, base_confidence in SUPPORT_INTENT_PATTERNS:
        if re.search(pattern, query_lower):
            return category, base_confidence
    return None, 0.0
```

---

## Skill Specification

### SKILL.md (to be placed at `crystalos/skills/crystal-support/SKILL.md`)

```markdown
# Crystal Support Skill

You are Crystal, Experient's AI support specialist. Your job is to resolve support 
questions about the Experient platform — not to analyze survey data (that is a 
different skill). You are honest, precise, and efficient. You do not guess. You do 
not make up feature capabilities. If you don't know, you say so and route to a human.

## Your Job

Resolve the customer's support query using available tools. You have a budget of 
3 tool calls. If you cannot resolve after 3 calls, create a structured escalation.

## Resolution Tiers

**Tier 1 — Crystal resolves directly:**
You found a doc, a known issue, or an account state that answers the question.
Return: answer + source link + next step.

**Tier 2 — Crystal resolves via doc:**
The answer is in the documentation. Return: the relevant doc section + direct link.
Do not paraphrase incorrectly — quote the doc and link to it.

**Tier 3 — Escalation required:**
You have used 3 tool calls and cannot resolve. Create a support ticket with full 
context. Be transparent: "I've looked at X, Y, and Z and couldn't find the answer. 
I've opened a ticket and included everything I know."

## Input Schema

{
  "query": "string — the customer's question",
  "org_id": "string — authenticated org",
  "user_id": "string — authenticated user",
  "intent_category": "string — pre-classified intent",
  "context": {
    "current_page": "string | null — what page they're on",
    "active_survey_id": "string | null",
    "conversation_history": "Message[] — last 5 turns",
    "account_state": {
      "plan": "string",
      "credits_remaining": "number",
      "recent_issues": "string[]"
    }
  }
}

## Output Schema

{
  "resolution_tier": 1 | 2 | 3,
  "resolved": boolean,
  "answer": "string — Crystal's response to the customer",
  "sources": [
    {
      "type": "doc" | "known_issue" | "changelog" | "account",
      "key": "string",
      "title": "string",
      "url": "string"
    }
  ],
  "escalation": {
    "ticket_id": "string | null",
    "summary": "string — what Crystal investigated",
    "tools_called": ["string"],
    "recommended_tier3_action": "string"
  } | null,
  "follow_up_suggestions": ["string"],
  "doc_gap_signal": {
    "gap_detected": boolean,
    "missing_topic": "string | null"
  }
}

## Tool Use Instructions

1. Start with `search_support_docs` — semantic search against all documentation.
2. If the query mentions a feature, call `get_feature_status` to check if it's live/beta/planned.
3. If the query mentions billing/credits, call `get_account_state`.
4. If the query mentions platform errors, call `get_system_status` and `get_known_issues`.
5. If you find a resolution, return it with sources. Do not call more tools.
6. If 3 calls yield no resolution, call `create_support_ticket` with full context.

## Tone

- Direct. No filler. No "Great question!"
- Honest. If uncertain: "Based on the docs, I believe X — but you should verify Y."  
- Contextual. Reference their org, their plan, their active survey when relevant.
- Proactive. If you find the answer, also mention the closest related doc section.

## What You Must Not Do

- Make up feature capabilities that are not in the docs
- Claim an issue is resolved if you only found a workaround
- Return an answer with no source — always cite what you found
- Open a ticket without first trying at least 2 tool calls
```

---

## Tools Reference

### `search_support_docs`

```typescript
// Semantic search over support_docs using pgvector cosine similarity
// Returns top-5 most relevant doc chunks with scores

async function search_support_docs(params: {
  query: string;           // the customer's query (used for embedding)
  category_filter?: string; // 'api' | 'guide' | 'feature' | 'skill' | 'changelog'
  status_filter?: string;  // 'stable' | 'beta' | 'building' | 'planned'
  limit?: number;          // default 5
}): Promise<{
  results: Array<{
    doc_key: string;
    title: string;
    excerpt: string;         // first 400 chars of body
    score: number;           // 0.0-1.0 cosine similarity
    status_tag: string;
    url: string;
  }>;
}>
```

### `get_feature_status`

```typescript
// Checks TRACKER.md cache + support_docs status for a named feature
async function get_feature_status(params: {
  feature_name: string;    // e.g. 'SAML SSO', 'mobile push', 'PDF export'
}): Promise<{
  feature: string;
  status: 'live' | 'beta' | 'building' | 'planned' | 'not_found';
  status_detail: string;   // e.g. 'Live since Sprint 7 (May 2026)'
  eta_text?: string;       // e.g. 'Expected: Sprint 15 (Q3 2026)'
  doc_url?: string;
}>
```

### `get_account_state`

```typescript
// Fetches the org's current billing and plan state
async function get_account_state(params: {
  org_id: string;
}): Promise<{
  plan: string;            // 'free' | 'starter' | 'growth' | 'business' | 'enterprise'
  credits_remaining: number;
  credits_total_this_period: number;
  next_reset_date: string;
  active_features: string[];
  recent_charges: Array<{
    date: string;
    amount_credits: number;
    description: string;
  }>;
  stripe_status: 'active' | 'past_due' | 'canceled' | 'trialing';
}>
```

### `get_known_issues`

```typescript
// Fetches active known issues matching the query topic
async function get_known_issues(params: {
  topic: string;           // e.g. 'CSV export', 'SAML', 'webhooks'
}): Promise<{
  issues: Array<{
    issue_key: string;
    title: string;
    severity: string;
    status: 'open' | 'mitigated' | 'resolved';
    workaround?: string;
    eta_text?: string;
  }>;
}>
```

### `get_system_status`

```typescript
// Current platform health from Prometheus + external status
async function get_system_status(): Promise<{
  overall: 'healthy' | 'degraded' | 'outage';
  components: Array<{
    name: string;          // 'API', 'CrystalOS', 'Exports', 'Notifications'
    status: 'healthy' | 'degraded' | 'down';
    last_incident?: string;
  }>;
  active_incidents: string[];
}>
```

### `create_support_ticket`

```typescript
// Creates a tier-3 escalation ticket with Crystal's full investigation context
async function create_support_ticket(params: {
  org_id: string;
  user_id: string;
  query: string;
  category: string;
  crystal_summary: string;    // what Crystal found and tried
  tools_called: string[];     // list of tools Crystal called
  recommended_action: string; // what the human engineer should do
  severity: 'low' | 'medium' | 'high' | 'critical';
}): Promise<{
  ticket_id: string;
  expected_response_time: string;
  confirmation_message: string;
}>
```

---

## Escalation Package Format

When Crystal cannot resolve (tier-3), it generates a structured escalation package shown to the customer and sent to the support queue:

```
──────────────────────────────────────────────────────────
Crystal Support — Escalation Package
Ticket #EXP-2847  |  Priority: Medium  |  Category: API

Customer Query:
"I'm getting 401 errors on POST /api/surveys even though 
my API key is valid. It was working yesterday."

What Crystal Investigated:
1. Searched docs for "401 API key" — found authentication 
   guide (api.auth.keys). Key format matches their report.
2. Checked known issues — no active 401 issues.
3. Checked account state — plan: Business, key active.

Crystal's Assessment:
API key appears valid per account state. No active 
known issues. Possible causes: key was rotated without 
regenerating, rate limit burst (checked: within limits), 
or backend auth middleware regression (requires engineer).

Recommended Investigation:
[ ] Check api_keys table for key last_used and status
[ ] Review auth middleware logs for org since yesterday 5pm
[ ] Check if there was a backend deploy between yesterday 
    and their last successful call

Expected Resolution: < 4 hours (Business plan SLA)
──────────────────────────────────────────────────────────
```

---

## Evaluation Criteria (EVALS.md fragment)

The skill is evaluated on every execution. Minimum passing score: 0.78.

| Criterion | Weight | Passing Condition |
|-----------|--------|------------------|
| Resolution accuracy | 0.30 | Answer matches ground truth (sampled) |
| Source citation | 0.20 | Every claim has a source |
| Tool efficiency | 0.15 | Resolution in ≤ 3 tool calls |
| Escalation quality | 0.15 | Ticket has all required context fields |
| No hallucination | 0.20 | No invented feature claims (LLM judge check) |

---

## Crystal Panel UX Integration

When Crystal is in support mode, the panel shows a visual indicator:

```
┌─────────────────────────────────────┐
│ Crystal                             │
│ ○ Support mode — investigating...  │  ← status pill (amber)
├─────────────────────────────────────┤
│                                     │
│  I found your answer. The CSV       │
│  export timeout issue is a known    │
│  limitation on surveys with >50K    │
│  responses. Here's the workaround:  │
│                                     │
│  [Use filtered export ↗]           │  ← doc link card
│  [Read: Export Guide ↗]            │
│                                     │
│  Was this helpful?  👍  👎          │  ← resolution feedback
└─────────────────────────────────────┘
```

Mode indicators:
- **Amber pill "Support mode"** — Crystal is resolving a platform question
- **Blue pill "Analyst mode"** — Crystal is analyzing survey data  
- **Red pill "Investigating"** — Crystal is calling tools (spinner)
- **Gray pill "Escalated"** — Ticket created, human will follow up

---

## Intent Routing Decision Tree

```
User sends message to Crystal
          │
          ▼
  [Pre-turn classifier]
          │
          ├─── support confidence ≥ 0.85 ──────► crystal-support skill
          │
          ├─── support confidence 0.60-0.85 ──► crystal-support with note
          │                                      "I'll try to answer this as
          │                                       a platform question..."
          │
          ├─── mixed query detected ───────────► crystal-support first, then
          │                                      crystal-analyst in same turn
          │
          └─── support confidence < 0.60 ──────► crystal-analyst skill
                                                 (standard data analysis)
```

---

## Feedback Loop

Every Crystal support interaction generates training signal:

1. **Resolution feedback** (👍/👎) stored in `support_tickets.feedback_score`
2. **Thumbs down** → auto-creates `support_doc_gaps` entry with the query text
3. **Unresolved escalations** → weekly batch: Crystal reviews patterns, suggests new doc topics
4. **High-quality resolutions** (score ≥ 0.85 + thumbs up) → written to `skill_examples` for `crystal-support`
5. **Weekly CSRR report** → emailed to product team with category breakdown

This is the closed loop: customer query → Crystal resolution → feedback → doc improvement → better Crystal → fewer tier-3 tickets.
