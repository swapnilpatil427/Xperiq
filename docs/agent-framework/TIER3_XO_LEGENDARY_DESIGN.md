# Tier 3 — Legendary Closed-Loop Action Platform
## The X+O Intelligence Architecture

**Author:** XM Science + AI Engineering + Product Leadership (synthesized)
**Date:** 2026-06-24
**Status:** APPROVED FOR IMPLEMENTATION — decisions locked below
**Companion docs:** `CRYSTAL_ACTION_SYSTEM_REDESIGN.md` (Tier 1–2 foundation), `ENTERPRISE_CRYSTALOS_REDESIGN.md`

---

## The Vision: Why This Makes Experient Legendary

The industry has built two half-platforms:
- **Qualtrics, Medallia, InMoment** — deep X-data (experience) with bolted-on O-data connectors that require professional services and never fully join.
- **Salesforce, ServiceNow** — deep O-data (operational) with survey features that are UI wrappers, not intelligence.

**The insight nobody has executed**: X-data and O-data are not just tables to JOIN. They are different vocabularies about the same reality. A "detractor" in NPS and a "churn risk" in CRM are the same phenomenon observed through different lenses. Without a **shared ontology** — a vocabulary layer that maps these lenses to each other — any X+O fusion is a reporting feature, not intelligence.

**We are building the ontology.** The four-tier composition:

```
╔════════════════════════════════════════════════════════════╗
║  TIER 4 — ONTOLOGY (Customer-specific, outermost layer)   ║
║  "A shared vocabulary that says what each thing means      ║
║   and how things relate."                                  ║
║   entity defs · vocabulary mappings · ownership rules      ║
╠════════════════════════════════════════════════════════════╣
║  TIER 3 — O-DATA (Operational, additive)                   ║
║  "What happened." — CRM records · tickets · ARR ·          ║
║  contacts · cases · SLA engine · ownership routes          ║
╠════════════════════════════════════════════════════════════╣
║  TIER 2 — X-DATA (Experience, additive)                    ║
║  "How people feel." — surveys · feedback · NPS/CES/CSAT ·  ║
║  Crystal insights · action proposals · topic discovery      ║
╠════════════════════════════════════════════════════════════╣
║  TIER 1 — PLATFORM CORE (Frozen, innermost)               ║
║  Survey schema · response model · insight pipeline ·        ║
║  Crystal intelligence · skill runtime · auth + RBAC         ║
╚════════════════════════════════════════════════════════════╝
```

**The frozen core principle**: Tier 1 never changes for a customer. Everything customer-specific is additive at the outer tiers. Tier 4 is the most customer-specific: an enterprise can define exactly what "at-risk account" means in their vocabulary, map it to their CRM stage, and have Crystal reason about it automatically.

This is the only XM platform in the world where a CSM can ask Crystal: *"Which accounts should I call today?"* and get an answer grounded in **both** NPS verbatims (X-data) **and** CRM renewal dates (O-data) **through** an ontology that knows those two signals are about the same risk phenomenon — and where Crystal then creates a case, assigns it to the right owner, and tracks whether the call moved the NPS.

---

## Locked Decisions

The following decisions from the problem statement are now locked:

| Decision | Choice | Rationale |
|---|---|---|
| **1. Identity model** | Link-token + consent-first | Token in survey URL; contact_id stored on response only if non-anonymous + consent = true. Anonymous surveys stay fully anonymous. PII gated by existing `data:pii` permission. |
| **2. Cases: build vs integrate** | Native `cx_cases` + adapter interface | Experient is the system of record. External systems (Jira/SF/ServiceNow) are sync targets via adapter pattern, not sources of truth. Enables offline-first and custom workflows. |
| **3. First integration** | Slack webhook (operational) | Lowest friction, highest reach. Any case event (created, escalated, resolved) can notify via Slack webhook. Jira/SF adapter interface is stubbed for v2. |
| **4. X+O v1 scope** | Identity + Cases + SLA + Ontology + action_outcomes | No CRM connector in v1. The ontology + ownership routing provides the "O-data" reasoning layer without requiring a live CRM connection. CRM import via CSV is v1; live sync is v2. |

---

## Five Systems to Build

### System 1: Contact Identity & Consent Layer
*The gating dependency — everything else requires this.*

**What it does**: Links individual survey responses to identified contacts, while preserving anonymity where required.

**Consent model**:
- Survey-level: `surveys.anonymous = true/false`
- Contact-level: `contacts.consent_given = true/false` + `consent_at`
- Rule: `contact_id` is stored on a response ONLY if `anonymous = false` AND `consent_given = true` AND a valid distribution token was present in the submission
- GDPR: `contacts.anonymized_at` timestamp enables erasure without deletion (PII fields zeroed, id retained for referential integrity)

**Distribution token flow**:
```
Org admin → uploads contact list (CSV) → system creates contact records + distribution tokens
Token embedded in survey URL: survey.link?t={token}
Respondent fills → submission includes token → backend resolves token → response.contact_id = contacts.id
If anonymous survey → token validated but contact_id NOT stored
```

### System 2: CX Case Management
*The accountable unit of work for closed-loop XM.*

**What it does**: Crystal creates structured cases (not just notifications) from its recommendations. Cases have lifecycle, owner, SLA clock, and audit trail.

**Case lifecycle**:
```
Crystal proposes create_case
    ↓ (user confirms)
cx_cases row created (status: open, sla_due_at calculated)
    ↓ (ownership_routes resolves owner)
Case assigned (status: in_progress, owner_user_id set)
    ↓ (SLA monitor runs)
SLA approaching → Slack notification
SLA breached → escalation_tier++ → reassign per escalation rules
    ↓ (owner resolves)
Case closed (status: resolved, resolved_at, outcome recorded)
    ↓ (action_outcomes table)
Crystal skill confidence updated from empirical outcome
```

### System 3: SLA & Escalation Engine
*Cases without clocks are just lists.*

**SLA config** (per org, per category, per severity):
- Critical: 2h acknowledge, 24h resolve
- High: 8h acknowledge, 72h resolve
- Medium: 24h acknowledge (no resolve deadline)
- Low: 72h acknowledge (no resolve deadline)

**Breach detection**: Scheduler job runs every 5 minutes. On breach: escalation_tier increments, case owner reassigned per `ownership_routes` escalation chain, Slack alert fired.

**Predictive breach**: Crystal warns 25% before SLA deadline ("Estimated to breach in 6 hours based on current case velocity").

### System 4: Ownership Intelligence
*The org chart Crystal has never had.*

**The problem**: Skills emit `owner_role: "CSM"` — free text that resolves to nobody. We need a real routing table.

**ownership_routes** maps:
- Dimension: `segment | account | touchpoint | driver | survey`
- Match value: `"Enterprise"` | `"Acme Corp"` | `"Checkout Flow"` | `"Wait Time"`
- Owner: real Clerk user_id + display label cache
- Priority: for when multiple rules match

**How Crystal uses it**: When proposing `create_case`, Crystal calls `get_ownership_route(dimension, match_value)` to resolve a real owner before emitting the proposal. The card shows "Assign to **Sarah Chen** (owns Enterprise accounts)" — not "assign to CSM".

### System 5: Ontology Layer
*The semantic bridge between X-data and O-data.*

**What it is**: A customer-configurable vocabulary of entities, relationships, and vocabulary mappings.

**Three tables**:
1. `ontology_nodes` — Entity definitions: Customer, Account, Segment, Touchpoint, Driver, Metric, RiskSignal
2. `ontology_edges` — Relationships: `drives(A, B)`, `correlates_with(A, B)`, `escalates_to(A, B)`, `is_instance_of(A, B)`
3. `ontology_mappings` — Vocabulary bridges: `CRM_STAGE("Renewal Risk") → XM_SIGNAL("Detractor")`, `NPS_RANGE(0..6) → RISK_LABEL("High Churn Risk")`

**How Crystal uses it**: The new `xo-fusion-advisor` skill queries the ontology to reason across X+O. When it sees a detractor segment, it can follow the ontology graph to find: "Detractor → `is_instance_of` → HighChurnRisk → `correlates_with` → NearingRenewal" — and if O-data shows accounts nearing renewal, Crystal flags them as convergence risks.

**Enterprise-only**: Ontology Studio (UI) is gated to `plan_tier: enterprise | enterprise_plus`. The default platform ontology (shipped with Experient) works without any customization.

---

## Data Model

### New Tables

#### `contacts`
```sql
-- External respondent/customer identity (PII-gated by data:pii permission)
contacts(
  id              UUID PRIMARY KEY,
  org_id          TEXT NOT NULL,
  external_id     TEXT,                    -- CRM ID, employee ID
  email           TEXT,                    -- PII
  name            TEXT,                    -- PII
  phone           TEXT,                    -- PII
  account_id      TEXT,                   -- Groups contacts by company/account
  account_name    TEXT,
  segment_attrs   JSONB DEFAULT '{}',      -- flexible tags: {region, tier, plan}
  consent_given   BOOL NOT NULL DEFAULT false,
  consent_at      TIMESTAMPTZ,
  anonymized_at   TIMESTAMPTZ,             -- GDPR erasure: PII fields zeroed, row retained
  data_region     TEXT NOT NULL DEFAULT 'us',
  import_source   TEXT,                    -- 'csv' | 'api' | 'crm_sync'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, external_id),
  UNIQUE (org_id, email) -- partial, WHERE anonymized_at IS NULL
)
```

#### `survey_distribution_tokens`
```sql
-- Link-token per contact per survey distribution event
survey_distribution_tokens(
  id          UUID PRIMARY KEY,
  survey_id   UUID NOT NULL REFERENCES surveys(id),
  contact_id  UUID REFERENCES contacts(id) ON DELETE SET NULL,
  token       TEXT NOT NULL UNIQUE,        -- URL-safe random token (32 chars)
  channel     TEXT NOT NULL DEFAULT 'link', -- link|email|sms|embed
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  used_at     TIMESTAMPTZ,
  response_id UUID REFERENCES responses(id) ON DELETE SET NULL
)
```

#### `responses` additions
```sql
ALTER TABLE responses ADD COLUMN contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL;
ALTER TABLE responses ADD COLUMN distribution_token TEXT;
-- contact_id populated only if: survey.anonymous=false AND consent_given=true AND valid token
```

#### `cx_cases`
```sql
cx_cases(
  id              UUID PRIMARY KEY,
  org_id          TEXT NOT NULL,
  contact_id      UUID REFERENCES contacts(id) ON DELETE SET NULL,
  response_id     UUID REFERENCES responses(id) ON DELETE SET NULL,
  insight_id      UUID,                    -- soft ref to insights table
  driver_ref      TEXT,                   -- topic/driver label
  proposal_id     UUID REFERENCES crystal_action_proposals(id),

  title           TEXT NOT NULL,
  description     TEXT,
  category        TEXT NOT NULL DEFAULT 'cx', -- cx|esat|product|compliance

  status          TEXT NOT NULL DEFAULT 'open',
    -- open|in_progress|escalated|resolved|closed
  severity        TEXT NOT NULL DEFAULT 'medium',
    -- low|medium|high|critical

  owner_user_id   TEXT,                    -- Clerk user ID
  owner_label     TEXT,                   -- display name cache
  owner_role      TEXT,                   -- fallback if no user resolved

  sla_due_at      TIMESTAMPTZ,
  sla_breached    BOOL NOT NULL DEFAULT false,
  escalation_tier INT NOT NULL DEFAULT 0,

  external_refs   JSONB NOT NULL DEFAULT '{}',
    -- {slack_ts, jira_key, sf_case_id, servicenow_number}

  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      TEXT NOT NULL,
  audit_log       JSONB NOT NULL DEFAULT '[]'
    -- append-only: [{ts, actor, action, from_status, to_status, note}]
)
```

#### `cx_sla_configs`
```sql
-- Platform defaults + per-org overrides (same pattern as bug_sla_configs)
cx_sla_configs(
  org_id          TEXT NOT NULL DEFAULT '',  -- '' = platform default
  category        TEXT NOT NULL DEFAULT 'cx',
  severity        TEXT NOT NULL,
  ack_sla_hrs     INT NOT NULL,
  resolve_sla_hrs INT,                       -- NULL = no resolve SLA for this severity
  PRIMARY KEY (org_id, category, severity)
)
```

#### `ownership_routes`
```sql
-- Maps segment/account/touchpoint/driver → real owner identity
ownership_routes(
  id              UUID PRIMARY KEY,
  org_id          TEXT NOT NULL,
  dimension       TEXT NOT NULL,  -- segment|account|touchpoint|driver|survey
  match_value     TEXT NOT NULL,  -- 'Enterprise' | 'Acme Corp' | 'Wait Time'
  match_type      TEXT NOT NULL DEFAULT 'exact', -- exact|prefix|regex
  owner_user_id   TEXT NOT NULL,  -- Clerk user_id
  owner_label     TEXT,           -- display name (cached from Clerk, refreshed on write)
  escalation_user_id TEXT,        -- who gets the case on SLA breach
  priority        INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, dimension, match_value)
)
```

#### `ontology_nodes`
```sql
ontology_nodes(
  id              UUID PRIMARY KEY,
  org_id          TEXT NOT NULL DEFAULT '',  -- '' = platform default
  category        TEXT NOT NULL,   -- entity|metric|signal|risk|action
  label           TEXT NOT NULL,   -- 'Customer', 'ChurnRisk', 'Detractor'
  description     TEXT,
  definition      TEXT,            -- formal definition
  synonyms        TEXT[] DEFAULT '{}',
  x_data_ref      TEXT,            -- XM concept: 'nps_score' | 'sentiment_score'
  o_data_ref      TEXT,            -- O-data field: 'crm.health_score'
  platform_node   BOOL DEFAULT false, -- true = ships with Experient, cannot delete
  parent_id       UUID REFERENCES ontology_nodes(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
```

#### `ontology_edges`
```sql
ontology_edges(
  id              UUID PRIMARY KEY,
  org_id          TEXT NOT NULL DEFAULT '',
  from_node_id    UUID NOT NULL REFERENCES ontology_nodes(id),
  to_node_id      UUID NOT NULL REFERENCES ontology_nodes(id),
  relationship    TEXT NOT NULL,
    -- drives|correlates_with|escalates_to|is_instance_of|requires|signals
  weight          NUMERIC(4,3) DEFAULT 1.0,  -- strength of relationship 0–1
  evidence_type   TEXT DEFAULT 'manual',      -- manual|empirical|inferred
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
)
```

#### `ontology_mappings`
```sql
-- Vocabulary bridges between external systems and Experient concepts
ontology_mappings(
  id              UUID PRIMARY KEY,
  org_id          TEXT NOT NULL DEFAULT '',
  source_system   TEXT NOT NULL,    -- 'crm' | 'helpdesk' | 'billing' | 'custom'
  source_field    TEXT NOT NULL,    -- 'opportunity_stage'
  source_value    TEXT NOT NULL,    -- 'Renewal Risk'
  target_node_id  UUID NOT NULL REFERENCES ontology_nodes(id),
  target_label    TEXT NOT NULL,    -- 'Detractor' (cached)
  nps_range_low   INT,              -- optional: maps NPS range to this concept
  nps_range_high  INT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, source_system, source_field, source_value)
)
```

#### `action_outcomes`
```sql
-- Empirical outcome tracking — feeds Crystal skill confidence
action_outcomes(
  id              UUID PRIMARY KEY,
  proposal_id     UUID NOT NULL REFERENCES crystal_action_proposals(id),
  case_id         UUID REFERENCES cx_cases(id),
  org_id          TEXT NOT NULL,
  metric          TEXT NOT NULL,   -- 'nps'|'csat'|'ces'|'case_resolution_days'
  baseline        NUMERIC,         -- metric value at case creation
  post_value      NUMERIC,         -- metric value at outcome measurement
  delta           NUMERIC GENERATED ALWAYS AS (post_value - baseline) STORED,
  delta_pct       NUMERIC GENERATED ALWAYS AS (
                    CASE WHEN baseline <> 0 THEN ((post_value - baseline) / ABS(baseline)) * 100
                    ELSE NULL END
                  ) STORED,
  measured_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  measurement_lag_days INT,        -- days between case close and measurement
  context_json    JSONB DEFAULT '{}'
)
```

---

## API Contracts

### Contacts
```
POST   /api/contacts                      — Create contact
GET    /api/orgs/me/contacts              — List (search, paginated)
GET    /api/contacts/:id                  — Get contact + linked responses
PUT    /api/contacts/:id                  — Update (PII fields require data:pii)
DELETE /api/contacts/:id                  — Anonymize (GDPR erasure)
POST   /api/orgs/me/contacts/import       — CSV bulk import
POST   /api/surveys/:id/distribute/tokens — Generate tokens for a contact list
```

### CX Cases
```
POST   /api/cx/cases                      — Create case (from proposal)
GET    /api/cx/cases                      — List (filter by status/severity/owner/survey)
GET    /api/cx/cases/:id                  — Get case + audit log + contact
PUT    /api/cx/cases/:id                  — Update status/owner/severity
POST   /api/cx/cases/:id/events           — Append event to audit log
GET    /api/cx/cases/:id/timeline         — Audit log formatted for UI
GET    /api/cx/cases/sla-dashboard        — SLA health: open/breached/at-risk counts
```

### Ownership Routing
```
GET    /api/orgs/me/ownership-routes       — List rules
POST   /api/orgs/me/ownership-routes       — Create rule
PUT    /api/orgs/me/ownership-routes/:id   — Update rule
DELETE /api/orgs/me/ownership-routes/:id   — Delete rule
GET    /api/orgs/me/ownership-routes/resolve?dimension=&value= — Resolve owner for a value
```

### Ontology
```
GET    /api/ontology/nodes                 — List all nodes (platform + org)
POST   /api/ontology/nodes                 — Create org node (enterprise only)
GET    /api/ontology/nodes/:id             — Get node + edges + mappings
PUT    /api/ontology/nodes/:id             — Update node
POST   /api/ontology/edges                 — Create relationship
POST   /api/ontology/mappings              — Map external value to ontology node
GET    /api/ontology/resolve?signal=&value= — Resolve external value to node + context
```

### SLA Config
```
GET    /api/cx/sla-configs                 — Get org SLA config (inherits platform defaults)
PUT    /api/cx/sla-configs                 — Update org config
```

---

## CrystalOS Changes

### New Tools (crystal/registry.py + crystal/tools.py)

| Tool | Category | What it does |
|------|----------|--------------|
| `get_contact_identity` | DATA | Fetches contact record for a response_id (requires data:pii) |
| `get_ownership_route` | DATA | Resolves dimension+value → real owner (no PII required) |
| `get_ontology_context` | DATA | Gets ontology nodes + edges relevant to a topic/segment/signal |
| `get_xo_context` | DATA | Joins X-data (NPS/sentiment for a contact/account) with O-data (ontology mappings) |
| `get_case_history` | DATA | Gets case history for a contact or segment |
| `propose_create_case` | ACTION | Proposes creating a CX case with contact + owner + SLA resolved |
| `propose_assign_owner` | ACTION | Proposes reassigning a case to a different owner |
| `propose_slack_alert` | ACTION | Proposes sending a Slack notification (wired, not stubbed) |

### New Proposal Types (+ aliases in crystal.py)

| `proposal_type` (tool) | Frontend `type` | Handler |
|---|---|---|
| `case` | `create_case` | `api.createCase()` → invalidate 'cases' |
| `assign_owner` | `assign_owner` | `api.updateCase()` → invalidate 'cases' |
| `slack_notify` | `send_slack_alert` | `api.sendSlackAlert()` → toast only |
| `ontology_suggest` | `view_ontology` | navigate to Ontology Studio |

### CrystalContext Additions

```python
@dataclass(frozen=True)
class CrystalContext:
    # ... existing fields ...
    # NEW for Tier 3:
    contact_id:       str | None = None       # if response linked to contact
    account_id:       str | None = None       # account grouping for this context
    owner_map:        dict[str, str] = field(default_factory=dict)  # pre-resolved dimension→owner
    ontology_version: str | None = None       # ontology cache version for cache invalidation
```

### New Skills

#### `case-advisor`
**Purpose**: Given a detractor/segment/driver finding, propose a CX case with owner, SLA severity, and case content.

**Methodology**: Bain inner-loop (individual detractor recovery). Urgency tiers map to case severity (critical/urgent → high/critical SLA). Owner resolved from ownership_routes before proposal.

**Tools allowed**: `get_survey_overview`, `get_verbatims`, `get_contact_identity`, `get_ownership_route`, `propose_create_case`

**Output schema**:
```json
{
  "case_proposal": {
    "title": "string (imperative, 80 chars max)",
    "description": "string (grounded in verbatim evidence)",
    "severity": "low|medium|high|critical",
    "category": "cx|esat|product",
    "contact_id": "uuid or null",
    "owner_label": "string (resolved from ownership_routes)",
    "business_rationale": "quantified impact",
    "evidence_verbatims": ["string (max 3 quotes)"]
  }
}
```

#### `xo-fusion-advisor`
**Purpose**: Cross X-data signals with O-data context (via ontology) to identify accounts where both experience AND operational signals indicate risk.

**Methodology**: Convergence scoring — accounts where X-signal (detractor, low NPS) and O-signal (ontology-mapped risk) both fire are highest priority. This is the "at-risk account" view no other platform produces natively.

**Tools allowed**: `get_survey_overview`, `get_segment_breakdown`, `get_ontology_context`, `get_xo_context`, `get_verbatims`, `propose_create_case`

**Output schema**:
```json
{
  "convergence_risks": [
    {
      "entity_label": "Acme Corp",
      "entity_type": "account|segment|contact",
      "x_signal": {"metric": "nps", "value": 4, "percentile": "bottom_20"},
      "o_signal": {"source": "crm", "concept": "renewal_risk", "value": "Renewal Risk Q3"},
      "ontology_path": ["Detractor", "is_instance_of", "HighChurnRisk", "correlates_with", "NearingRenewal"],
      "convergence_score": 0.87,
      "recommended_action": "create_case"
    }
  ],
  "summary": "string"
}
```

### Scheduler Additions (scheduler.py)

**`_sla_breach_sweep()`** — Runs every 5 minutes:
1. Query `cx_cases` WHERE `sla_due_at < NOW()` AND `sla_breached = false`
2. Mark `sla_breached = true`, increment `escalation_tier`
3. Resolve new owner via `ownership_routes.escalation_user_id`
4. Append to `audit_log`: `{ts, actor:"system", action:"sla_breach", escalation_tier}`
5. Fire Slack notification if `external_refs.slack_webhook` is set
6. Publish to `crystal_event_queue` for case dashboard refresh

**`_outcome_measurement_sweep()`** — Runs daily:
1. Query resolved cases with `resolved_at > 7 days ago`
2. Fetch current NPS/CSAT for the linked survey
3. Write `action_outcomes` row: baseline (at case creation) vs post (now)
4. Update `crystal_action_proposals.confidence` based on empirical delta

---

## Frontend: New Pages + Components

### New Routes
```typescript
CONTACTS:              '/app/contacts',
CONTACT_DETAIL:        '/app/contacts/:contactId',
CASES:                 '/app/cases',
CASE_DETAIL:           '/app/cases/:caseId',
SETTINGS_OWNERSHIP:    '/app/settings/ownership',
SETTINGS_ONTOLOGY:     '/app/settings/ontology',      // enterprise only
SETTINGS_CONNECTIONS:  '/app/settings/connections',
```

### New Pages

#### `ContactsPage` — Contact Intelligence Hub
- Contact directory: search by name/email/account, filter by segment/consent/anonymized
- Per-contact: linked survey responses, NPS history, active cases, X+O risk signals
- CSV import wizard with field mapping
- PII access guard: blurs email/phone for users without `data:pii` permission

#### `CasesPage` — Case Command Center
- Three-column layout: SLA dashboard (open/at-risk/breached counts) + case list + quick-filter
- SLA countdown timers — red when < 25% remaining, amber 25–50%, green > 50%
- Case cards: contact name, survey, severity badge, owner avatar, SLA bar
- Crystal "suggested cases" panel: top proposals not yet confirmed

#### `CaseDetailPage` — Case Workspace
- Left: case metadata + SLA timer + status transitions
- Center: full audit log timeline (Crystal proposed → accepted → owner assigned → SLA events → resolved)
- Right: Crystal context panel — relevant verbatims + X+O signals + suggested next actions
- Linked contact card: NPS history, other open cases
- Action bar: Change status / Reassign / Add note / Sync to Slack

#### `OwnershipRoutingPage` — Ownership Map
- Dimension selector (Segment / Account / Touchpoint / Driver / Survey)
- Table: match_value + owner + escalation_owner + priority
- "Test a route" — enter value, see which owner resolves
- Import/export routing rules as CSV

#### `OntologyStudioPage` — Vocabulary Editor (Enterprise only)
- Three tabs: Entities / Relationships / Vocabulary Mappings
- Graph visualization: entity → relationship → entity
- Platform nodes marked as locked (view only)
- Org-specific nodes: create / edit / delete
- Vocabulary mappings: map CRM field value → ontology node

### CrystalPanel Enhancements

**New proposal cards** for `create_case`, `assign_owner`, `send_slack_alert`:

```
┌────────────────────────────────────────────────────────────┐
│ [briefcase] Create CX Case                  ● HIGH  ◷ 30m  │
│             4 Enterprise detractors, $1.2M in renewal ARR  │
│             ▸ Why this  (confidence 91%)                   │
│ ─────────────────────────────────────────────────────────  │
│  WILL CREATE:                                              │
│   • Contact: Acme Corp (john.smith@acme.com)               │
│   • Assigned: Sarah Chen (Enterprise West CSM)             │
│   • SLA: Resolve within 72h (High severity)                │
│   • Evidence: "Support took 4 days..." + 3 more verbatims  │
│ ─────────────────────────────────────────────────────────  │
│  [ Create Case ]   [ Edit… ]   [ Preview ]          ⋯      │
└────────────────────────────────────────────────────────────┘
```

**Identity indicator** in Crystal chat: when a response is linked to a contact, show a contact chip next to citations: `[sarah-chen → Acme Corp]`.

**X+O convergence banner**: when `xo-fusion-advisor` identifies convergence risks, show an amber banner above the proposal cards: "3 accounts where both NPS and renewal signals indicate risk."

### DataBus additions
```typescript
type InvalidationKey = 'workflows' | 'alerts' | 'insights' | 'surveys' 
  | 'cases' | 'contacts' | 'ontology';  // NEW
```

---

## The Outcome Learning Loop

This is what makes the platform legendary over time — it gets smarter from its own outcomes.

```
Crystal proposes create_case (skill: close-the-loop-advisor, confidence: 0.82)
    ↓ user confirms
cx_cases created → action_outcomes baseline captured (NPS = 32 for segment)
    ↓ 7 days later (scheduler: _outcome_measurement_sweep)
NPS measured = 41 (+9 points) → action_outcomes.delta = +9
    ↓ outcome written to skill_examples bank
close-the-loop-advisor examples now include: "High-urgency inner-loop case on Wait Time segment → +9 NPS in 7 days"
    ↓ next time close-the-loop-advisor runs for a similar pattern
Skill retrieves this example → calibrates its business_rationale to use empirical delta, not template
    ↓ Crystal's confidence estimate for this pattern type becomes empirically grounded
```

The `action_outcomes` table is the feedback wire from real-world results back into Crystal's intelligence. Over time, Crystal's `business_rationale` evolves from template estimates ("typically recovers 30% of detractors") to empirically-calibrated claims ("in your account segment, similar cases moved NPS +6–11 points in 7–14 days based on 23 resolved cases").

---

## Acceptance Criteria (End-to-End Closed Loop)

### Per Capability

#### Contact Identity
- [ ] CSV import creates contacts with consent model applied
- [ ] Distributing with tokens embeds token in URL
- [ ] Response submission stores contact_id when non-anonymous + consent
- [ ] Anonymous survey submission: contact_id is never stored
- [ ] GDPR erasure: email/name/phone zeroed, contact_id retained, audit entry created
- [ ] Crystal: `get_contact_identity` returns null for anonymous responses

#### CX Cases
- [ ] Crystal proposes `create_case` with real owner (not free-text role)
- [ ] Confirming proposal creates case with correct SLA deadline
- [ ] Case status transitions recorded in audit_log
- [ ] SLA breach detected within 5 minutes of deadline
- [ ] Slack notification fires on breach (if webhook configured)
- [ ] Case resolution triggers action_outcomes write

#### Ownership Routing
- [ ] `ownership_routes.resolve` returns correct owner for matching dimension+value
- [ ] Crystal proposal card shows resolved owner name, not role string
- [ ] Escalation_user_id used on SLA breach
- [ ] Test-a-route UI shows correct resolution

#### Ontology
- [ ] Platform nodes visible (read-only) to all orgs
- [ ] Enterprise orgs can create org-specific nodes
- [ ] `get_ontology_context` returns relevant nodes for a topic/driver
- [ ] `xo-fusion-advisor` uses ontology to identify convergence risks
- [ ] Vocabulary mapping resolves CRM value → XM concept

#### Outcome Learning
- [ ] action_outcomes row written after case resolved + 7 days elapsed
- [ ] skill_examples bank updated with resolved case outcome
- [ ] Crystal's business_rationale for similar future proposals references empirical history

### Full Chain Test
1. Create survey (anonymous = false)
2. Import 10 contacts with consent = true
3. Generate + distribute tokens to all 10 contacts
4. Submit 5 responses with tokens (5 detractors)
5. Crystal identifies detractor segment → proposes create_case
6. Card shows: contact name, real owner (from ownership_routes), SLA
7. Confirm → case created in `cx_cases`
8. Advance time past SLA → breach detected, Slack fires, escalation applied
9. Resolve case → action_outcomes captured
10. Re-run Crystal → business_rationale references empirical outcome history

---

## Implementation Phasing

### Phase A — Identity Foundation (Week 1–2)
- Migrations: contacts, distribution_tokens, responses.contact_id
- Backend: contacts CRUD + CSV import + token generation/validation
- CrystalOS: `get_contact_identity` tool
- Frontend: ContactsPage + ContactDetailPage
- Acceptance: contacts importable, responses linkable, Crystal can see identity

### Phase B — Case Management (Week 3–4)
- Migrations: cx_cases, cx_sla_configs, ownership_routes
- Backend: cx-cases CRUD + ownership routing + SLA config
- CrystalOS: `get_ownership_route` + `propose_create_case` + `case-advisor` skill
- Frontend: CasesPage + CaseDetailPage + OwnershipRoutingPage
- CrystalPanel: `create_case` handler + new proposal card
- Acceptance: full case lifecycle, owner routing, SLA dashboard

### Phase C — SLA Engine + Slack (Week 5)
- Scheduler: `_sla_breach_sweep` + `_outcome_measurement_sweep`
- Backend: `lib/slack.ts` + Slack notification on case events
- CrystalOS: `propose_slack_alert` tool
- Acceptance: SLA breach detection, Slack alerts, escalation

### Phase D — Ontology + X+O Fusion (Week 6–7)
- Migrations: ontology_nodes, ontology_edges, ontology_mappings
- Backend: ontology CRUD routes
- CrystalOS: `get_ontology_context` + `get_xo_context` + `xo-fusion-advisor` skill
- Frontend: OntologyStudioPage (enterprise) + X+O convergence panel in CrystalPanel
- Acceptance: ontology-guided routing, X+O convergence risks surfaced by Crystal

### Phase E — Outcome Learning (Week 8)
- Migrations: action_outcomes
- Scheduler: `_outcome_measurement_sweep` writes action_outcomes + updates skill_examples
- Acceptance: empirical outcomes feed Crystal's business_rationale

---

## Constraints & Non-Negotiables

1. **"Crystal proposes, app executes"** — no autonomous case creation. Crystal always surfaces a confirmable proposal.
2. **Anonymity is inviolable** — if a survey is anonymous, no contact_id EVER touches the response row. Enforced at the DB write level, not just the API.
3. **PII access gating** — all contact email/name/phone fields behind `data:pii` permission check, in backend middleware and in Crystal's `get_contact_identity` tool.
4. **One seam, end-to-end** — each capability ships skill → contract → handler → outcome. No half-wired features.
5. **Reuse Tier 1–2 plumbing** — new proposal types flow through `_normalize_proposal`, DataBus invalidation, `recordProposalOutcome`. No parallel systems.
6. **CLAUDE.md/SKILLS.md in sync** — update per-layer docs as each capability ships.

---

## The Legendary Competitive Position

After Tier 3 ships, Experient is the only platform that can truthfully claim:

> "Crystal doesn't just tell you which customers to call. It tells you **who** (from your CRM contacts), **why** (grounded in NPS verbatims **and** renewal signals — both lenses, via the ontology), **who should call** (real name, resolved from your ownership rules), **by when** (SLA clock is already running), and it gets **smarter** from every case you resolve."

That is not a feature. That is a platform shift. It competes not with the survey tools, but with the enterprise CX platform category — and it does it with AI-native intelligence that Qualtrics, Medallia, and InMoment cannot match without rebuilding their core.

**This is what legendary looks like.**
