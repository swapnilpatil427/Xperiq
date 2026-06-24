# CrystalOS A2A Protocol Integration

**Status:** Design  
**Last updated:** 2026-05-21

---

## What A2A Is

Google's Agent-to-Agent (A2A) protocol is a proposed standard for agents to call other agents across organizational and vendor boundaries over plain HTTP. Think of it as REST for agents: each agent publishes a machine-readable "agent card" describing what it can do, what it accepts, and what it returns. Any caller that can read the card can call the agent without custom integration code.

Why this matters for CrystalOS:
- Today all agents are Python imports. To add a new agent you change Python.
- With A2A, adding a new agent means deploying a new service + registering its agent card. No caller changes.
- It's the path to inter-org intelligence: an Experient survey insight agent calling a Salesforce CRM agent, or a Qualtrics benchmark agent.
- Skills are already designed with clean JSON input/output schemas. A2A compatibility is a thin wrapper, not a redesign.

> **Spec Stability Warning:** As of 2026-05, the A2A spec is at `0.2` (pre-1.0). Google has indicated schema fields and lifecycle states may still change before 1.0. Do not build hard dependencies on the wire format yet — isolate all A2A protocol code behind the adapter layer (`agents/a2a/`) so the rest of CrystalOS is insulated from spec changes. Track the [A2A GitHub repo](https://github.com/google-a2a/A2A) for breaking changes before each Phase 2 sprint. The agent card `schema_version` field exists precisely for this reason — always include it.

---

## A2A Concepts

| Concept | Description |
|---------|-------------|
| **Agent Card** | JSON file at `/.well-known/agent.json` describing the agent's capabilities, input/output schema, auth method, and endpoint |
| **Task** | A single invocation: input → output. Stateful tasks can be long-running with progress events. |
| **Artifact** | The output of a completed task |
| **Push Notifications** | Server-sent events for streaming task progress |
| **Agent Registry** | Directory where agents register their cards for discovery |

---

## CrystalOS Agent Cards

Each CrystalOS skill that is exposed externally gets an agent card. Internal-only skills (shared: false) don't need one.

### Example Agent Card

**File location:** `agents/a2a/cards/insight-narrator.json`  
**Served at:** `GET /a2a/insight-narrator/.well-known/agent.json`

```json
{
  "schema_version": "0.2",
  "name": "insight-narrator",
  "display_name": "Experient Insight Narrator",
  "description": "Generates structured narrative insight reports from clustered survey topics. Produces title, executive summary, key findings, and recommended actions.",
  "version": "1.2.0",
  "provider": {
    "organization": "Experient",
    "contact": "platform@experient.ai"
  },
  "url": "https://agents.experient.ai/a2a/insight-narrator",
  "capabilities": {
    "streaming": true,
    "state_transition_history": false,
    "push_notifications": true
  },
  "authentication": {
    "schemes": ["bearer"]
  },
  "default_input_modes": ["application/json"],
  "default_output_modes": ["application/json"],
  "skills": [
    {
      "id": "generate-narrative",
      "name": "Generate Insight Narrative",
      "description": "Generates a full narrative report from survey topics.",
      "input_schema": {
        "type": "object",
        "required": ["survey_id", "topics"],
        "properties": {
          "survey_id": {"type": "string"},
          "topics": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "label": {"type": "string"},
                "sentiment_score": {"type": "number"},
                "volume": {"type": "integer"},
                "sample_verbatims": {"type": "array", "items": {"type": "string"}}
              }
            }
          },
          "response_count": {"type": "integer"},
          "survey_type": {"type": "string", "enum": ["NPS", "CSAT", "CES", "custom"]}
        }
      },
      "output_schema": {
        "type": "object",
        "properties": {
          "title": {"type": "string"},
          "executive_summary": {"type": "string"},
          "key_findings": {"type": "array"},
          "recommended_actions": {"type": "array"},
          "confidence": {"type": "number"}
        }
      },
      "tags": ["insights", "survey", "narrative", "NPS", "CSAT"]
    }
  ]
}
```

---

## A2A Endpoint Design

### Routes

```
GET  /a2a/{skill-name}/.well-known/agent.json   → return agent card
POST /a2a/{skill-name}/tasks/send               → create task (blocking)
POST /a2a/{skill-name}/tasks/send-subscribe     → create task + SSE stream
GET  /a2a/{skill-name}/tasks/{task_id}          → get task status
POST /a2a/{skill-name}/tasks/{task_id}/cancel   → cancel task
```

### Task Lifecycle

```
POST /tasks/send → {task_id, status: "submitted"}
     │
     ▼
skill_registry.execute(skill_name, input, ctx)
     │
     ├─ status: "working" (emitted as SSE if streaming)
     │
     ▼
result
     │
     └─ status: "completed", artifact: {result JSON}
```

### Authentication

A2A tasks from external callers use Bearer token auth. Same `AGENTS_INTERNAL_KEY` mechanism for internal calls. For future B2B calls, each org gets a scoped API key.

**OAuth 2.0 for B2B External Callers (Phase 2):**

A shared org-scoped API key is not appropriate for B2B calls where the caller is a separate organization's agent. Use OAuth 2.0 Client Credentials flow instead:

```
External Caller                     CrystalOS Auth Server
      │                                    │
      │  POST /oauth/token                 │
      │  {client_id, client_secret,        │
      │   grant_type: client_credentials,  │
      │   scope: "a2a:insight-narrator"}   │
      │ ──────────────────────────────────▶│
      │                                    │
      │  {access_token, expires_in: 3600}  │
      │ ◀──────────────────────────────────│
      │                                    │
      │  POST /a2a/insight-narrator/tasks  │
      │  Authorization: Bearer {token}     │
      │ ──────────────────────────────────▶│
```

Scopes are per-skill: `a2a:{skill-name}`. A caller granted `a2a:insight-narrator` cannot call `a2a:survey-qc` without an explicit grant. This enables least-privilege B2B access without sharing the master internal key.

Implementation: FastAPI OAuth2 middleware + Postgres `oauth_clients` table (`client_id`, `client_secret_hash`, `allowed_scopes`, `org_id`). Standard `python-jose` for JWT issuance. This is Phase 2 work — do not implement until external B2B calls become real.

---

## Internal A2A vs. External A2A

Not all A2A calls are cross-org. CrystalOS uses A2A internally too:

**Internal A2A (within Experient):**
- Skills calling other skills: `insight-narrator` calls `survey-qc` to validate input
- Pipeline nodes calling Crystal: structured task handoff instead of Python import
- Python-to-Python, no network hop needed — use direct `skill_registry.execute()` instead

**External A2A (cross-org or cross-vendor):**
- Future: Experient agent calling a Salesforce CRM agent for account context
- Future: Experient benchmark agent aggregating industry NPS data from other sources
- Uses full HTTP A2A protocol with agent card discovery

Rule: internal calls always use Python dispatch. External calls use A2A HTTP. Never add network overhead for internal communication.

---

## Agent Registry Design

For external discovery, CrystalOS maintains an agent registry at `/a2a/registry`:

```
GET  /a2a/registry          → list all public agent cards (paginated)
GET  /a2a/registry/search   → semantic search over agent descriptions
POST /a2a/registry/register → register a new agent card (authenticated)
```

The registry is backed by the same skill registry embedding index. Adding a skill with `shared: true` automatically registers its agent card in the registry.

---

## Skill → A2A Mapping

Skills don't need to be rewritten for A2A. The A2A layer is a thin HTTP adapter:

```
A2A request
  → parse task input from JSON
  → call skill_registry.execute(skill_name, input, ctx)
  → wrap result in A2A task artifact
  → return
```

The only code needed per skill: the agent card JSON file. The card is generated from the skill's frontmatter (`name`, `version`, `description`, input/output schemas from SKILL.md).

Card generation command (future CLI):
```bash
python -m agents.skills.generate_card insight-narrator > agents/a2a/cards/insight-narrator.json
```

---

## Streaming with A2A

For long-running skills (insight narration, specialist analysis), A2A supports streaming via SSE:

```
POST /a2a/insight-narrator/tasks/send-subscribe
Content-Type: application/json

{"skill": "generate-narrative", "input": {...}}

---
Response (SSE):

data: {"type": "TaskStatusUpdate", "task_id": "xyz", "status": "working", "message": "Analyzing 234 topic clusters..."}
data: {"type": "TaskStatusUpdate", "task_id": "xyz", "status": "working", "message": "Drafting executive summary..."}
data: {"type": "TaskArtifact", "task_id": "xyz", "artifact": {"title": "Q1 Survey Insights", ...}}
data: {"type": "TaskStatusUpdate", "task_id": "xyz", "status": "completed"}
```

This mirrors how Crystal already streams to the browser. The A2A streaming format wraps the same SSE events.

---

## Timeline and Prioritization

A2A integration has two phases:

**Phase 1 (internal groundwork — do this first):**
- Clean up skill input/output schemas in SKILL.md (they're already needed for the skill runtime)
- Add `/a2a/{skill}/.well-known/agent.json` endpoint serving static card files
- Not yet callable — just discoverable

**Phase 2 (when external calls become real):**
- Add `/tasks/send` endpoint wired to skill runtime
- Add auth for external callers
- Register cards in the public registry

There's no urgency to implement Phase 2 today. The skill schema work in Phase 1 is required for the skill runtime anyway. A2A compatibility is the consequence of having clean schemas, not extra work.

---

## Async Task Callbacks (Push Notifications)

The A2A spec supports a push notification model for long-running tasks where the caller does not want to maintain an open SSE connection. This is common for server-to-server B2B calls where the external agent fires a task and wants to be notified on completion rather than polling.

### Problem

The current design only covers streaming (SSE). SSE requires the caller to hold an open connection for the duration of the task. For insight generation (3–10 seconds), this is fine for browsers. For external agent callers — which may themselves be in the middle of a ReAct loop — holding an open connection creates cascading coupling.

### Design

The A2A spec's push notification model: the caller registers a webhook URL when creating the task. CrystalOS calls that webhook on completion.

```
POST /a2a/insight-narrator/tasks/send
{
  "skill": "generate-narrative",
  "input": {...},
  "notification": {
    "url": "https://caller.example.com/a2a/callback",
    "token": "caller-provided-secret-for-verification"
  }
}

→ Response (immediate): {"task_id": "xyz", "status": "submitted"}

[task runs in background]

POST https://caller.example.com/a2a/callback
{
  "task_id": "xyz",
  "status": "completed",
  "artifact": { ...result... },
  "token": "caller-provided-secret-for-verification"
}
```

The caller verifies the `token` field to authenticate the callback. CrystalOS never stores the token beyond the single callback — it is a one-time hmac signature, not a reusable credential.

### Storage

Pending task state is stored in Redis (TTL 1 hour):
```
Key: a2a:task:{task_id}
Value: {skill, input, notification_url, notification_token, status, created_at}
```

On skill completion, the task worker reads the key, fires the webhook, updates status to `completed`, and deletes the key.

### Polling Fallback

For callers that don't provide a webhook URL, polling via `GET /a2a/{skill}/tasks/{task_id}` is supported. Polling is the fallback, not the default — the spec recommends push where possible.

### Priority

Async callbacks are Phase 2 work. Phase 1 (SSE streaming) covers all current use cases. Don't build async callbacks until an external caller requires them.

---

## Known Gaps

| # | Issue | Impact | Status |
|---|-------|--------|--------|
| A1 | A2A spec is pre-1.0 (`0.2`) — wire format may change | Protocol changes may require adapter updates | Monitor spec repo; isolate behind adapter layer |
| A2 | OAuth 2.0 for B2B external callers not implemented | Shared org key is insufficient for cross-org B2B | Phase 2 design above — implement when external callers become real |
| A3 | Async task callbacks (push notifications) not implemented | External agent callers must hold open SSE connection | Phase 2 design above — implement on demand |
| A4 | Agent card generation CLI not built | Cards must be maintained manually until CLI ships | Low effort; build alongside skill runtime |
| A5 | No registry federation — external agents can't discover CrystalOS skills | Cross-org discovery requires manual card exchange | A2A registry federation is still an open spec question |

---

## A2A vs. MCP

Both protocols connect agents to external capabilities. They serve different purposes:

| | A2A | MCP |
|--|-----|-----|
| Direction | Agent calling another agent | Agent calling a tool/resource |
| Unit | Task (input → artifact) | Tool call (function + args → result) |
| Discovery | Agent card at `/.well-known/agent.json` | `tools/list` JSON-RPC |
| Statefulness | Tasks can be long-running | Stateless tool calls |
| Use case | Inter-agent orchestration | External system access |
| CrystalOS use | Future B2B calls | Jira, Slack, Salesforce |

In CrystalOS: A2A is for agent-to-agent communication across boundaries. MCP is for tools within a single agent. They are complementary, not competing.
