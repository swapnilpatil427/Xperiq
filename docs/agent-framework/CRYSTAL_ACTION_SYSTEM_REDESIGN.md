# Crystal Action System — Redesign & Roadmap

**Status:** Tier 1 + outcome-tracking foundation IMPLEMENTED. Tier 2 (integrations, new proposal types) and Tier 3 (identity/cases/X+O) remain proposed — they need external systems and the §5 decisions.

## Implementation log (Tier 1 + outcome tracking)

Shipped:
- **B1/G5 navigation fixed** — `CrystalPanel.executeAction` now uses React Router `useNavigate()` + `ROUTES`/`toPath` (no more `window.location.href` 404s; the Crystal conversation survives navigation). `app/src/components/CrystalPanel.tsx`.
- **B2 stale UI fixed** — new invalidation bus `app/src/lib/dataBus.ts`; `useWorkflows`/`useAlerts`/`useInsights` subscribe via `useInvalidation`; mutations call `invalidate('workflows'|'alerts'|'insights')`.
- **B3 edit_survey fixed** — `copilotRefine` result is now passed into the builder via router `state` (no longer discarded; no blind mutate-then-404). Builder review/save remains the commit point.
- **B4 alert thresholds fixed** — `crystalos/crystal/tools.py` `_parse_threshold()` parses prose ("NPS below 30" → `{below:30}`) with per-alert-type catalog defaults; alerts no longer created empty.
- **G1 transparency** — `business_rationale` populated by all `propose_*` tools; the card now renders a **"What will happen"** params block (via `humanizeParams`) and a confidence indicator.
- **G2 more buttons** — card adds a **Details** toggle (payload preview) alongside Apply/Dismiss.
- **G4 prioritization** — proposals sorted critical→low at render (`PRIORITY_RANK`).
- **Outcome tracking (Tier 2 item 8)** — migration `supabase/migrations/20260623000010_crystal_action_proposals.sql`; backend `POST/GET /api/insights/:surveyId/crystal/proposals`; client `api.recordProposalOutcome`; `executeAction`/`dismissAction` record the funnel (accepted → succeeded/failed/dismissed).

Tests: 356 frontend + 216 CrystalOS + 404 backend pass.

Deferred (need product decisions / external systems):
- Edit-before-apply modals, Undo, Snooze (Tier 1 stretch) — chose payload-transparency + correct routing first.
- `distribute` still navigates only (relabel/real-wire pending); `create_workflow` still `notify`-only until integrations land.
- All of Tier 2 integrations (Slack/Jira) and Tier 3 (identity, cases, SLA, X+O).

---


**Author:** Engineering, synthesizing a review panel (Product, UX, XM industry, Frontend architecture)
**Scope:** The Crystal recommendation/action-proposal system — how Crystal recommends actions (create survey, edit questions, distribute, create workflow, create alert) and how those get reviewed, executed, and reflected in the UI.
**Companion doc:** `ENTERPRISE_CRYSTALOS_REDESIGN.md` (the broader CrystalOS redesign). This doc is narrower: it covers the *action loop* specifically.

---

## 1. Why this doc exists

Crystal can recommend actions, but a review panel confirmed three classes of problem the user observed directly:

1. **Crystal recommends actions (e.g. "open the survey builder") but the execution navigates to broken routes** — they 404.
2. **Crystal mutates backend state, but the UI is not aware of it** — open pages show stale data; some mutations are entirely invisible.
3. **Recommendation cards have too few controls** — one "Apply" button that commits an unseen payload, no preview/edit/undo/rating.

Underlying all three: the recommendation→confirm→execute→**feedback** loop is only half-built. The advisory intelligence (the skills) is strong; the execution/UI/measurement layer is not.

This doc records the audit, the target design, and a phased roadmap so we can prioritize before writing code.

---

## 2. Current-state audit (with evidence)

### 2.1 What works well

- **Boundary model is correct.** "Crystal proposes, Copilot/endpoints execute" with `requires_confirmation: True` hardcoded (`crystalos/agents/crystal.py` `ActionProposal`). Right guardrail for enterprise trust.
- **Skill methodology is real.** `close-the-loop-advisor` (Bain inner/outer loop, urgency tiers, recovery-rate estimates), `nps-action-advisor` (passive conversion as top ROI lever), `segment-action-advisor` ("average trap"), `voc-program-advisor` (Gartner VoC maturity). This is best-in-class advisory IQ.
- **Quality gating** via `skill_runtime.py` EVALS + LLM-judge + retry + baseline output gate.
- **Two proposal sources, one normalized shape.** Skill path (`crystal-analyst` SKILL.md `action_proposals[]` → `_normalize_skill_output`) and tool path (`propose_*` tools → `_extract_action_proposals`), both normalized by `_normalize_proposal()`.

### 2.2 Confirmed bugs (critical)

| ID | Issue | Evidence | Impact |
|----|-------|----------|--------|
| **B1** | Navigation routes 404. Handler uses `window.location.href = '/surveys/...'`, `/templates`; real routes are `/app/`-prefixed; `App.tsx` has `path="*"` → 404. | `CrystalPanel.tsx:510,522,530,581`; `constants/routes.ts:9-13`; `App.tsx:150` | `create_survey`, `edit_survey`, `distribute`, `view_template` all break visibly after firing. |
| **B2** | Mutations don't invalidate UI. No shared query cache; each page owns local `useState`+`load()`. Crystal's `api.*` mutations never notify open pages. | `useWorkflows.ts:12`, `useAlerts.ts`, `useInsights.ts`; `CrystalPanel.tsx:533-579` | Stale UI after create_workflow/create_alert/schedule_rerun. The user's exact concern. |
| **B3** | `edit_survey` mutates then discards result then 404s. `copilotRefine()` return value (refined questions) is thrown away; `window.location.href` full-reloads to a 404; builder inits from `location.state` which is now null. | `CrystalPanel.tsx:513-525`; `SurveyBuilderPage.tsx:1805-1826` | Survey silently changes, result lost, lands on broken page. |
| **B4** | `create_alert` produces empty thresholds. `execute_propose_alert` only sets `threshold_config` if `threshold` arrives as a dict; the LLM passes `condition` as prose ("NPS drops below 30") with no parser. | `crystalos/crystal/tools.py` `execute_propose_alert` | Alerts created with no actual threshold — silently broken; user believes they're protected. |

### 2.3 Gaps (high)

| ID | Gap | Evidence |
|----|-----|----------|
| **G1** | Card hides `params`, `confidence`, `business_rationale`. User confirms a black box. Fields exist in the model but aren't rendered/populated. | `CrystalPanel.tsx:2002-2152`; `tools.py` propose_* set no `business_rationale` |
| **G2** | Only Apply + Dismiss buttons. No Preview, Edit-before-apply, Undo, Snooze, Explain, rating. Dismiss is permanent, no undo. | `CrystalPanel.tsx:2114-2149` |
| **G3** | No outcome tracking. Only `dismissed_ids` is persisted. No accepted/applied/succeeded/failed state anywhere. | `backend/src/routes/insights.ts:1661-1678`; no such columns |
| **G4** | No prioritization across proposals. `[:5]`/`[:3]` in arrival order; everyone defaults to `priority:"medium"`; rendered unsorted. | `crystal.py` `_extract_action_proposals`, `_normalize_proposal`; `CrystalPanel.tsx:947` |
| **G5** | `window.location.href` full reload destroys the Crystal conversation, citation map, panel context. `getCrystalHistory` exists but panel doesn't hydrate from it. | `CrystalPanel.tsx:108`; `api.ts:1193` |
| **G6** | `distribute` is a no-op (just navigates); `create_workflow` only emits `action_type:"notify"` despite advertising Jira/email. | `tools.py` `execute_propose_distribution`, `execute_propose_workflow` vs `registry.py` description |
| **G7** | Type-alias drift. Frontend `ActionProposalType` lists canonical + alias forms; a new type can fall through to the `default` re-ask branch. | `types/index.ts:288-302`; `CrystalPanel.tsx:584-587` |

### 2.4 Strategic gaps (XM platform maturity)

The advisory skills describe closed loops the platform cannot actually close. To compete with Qualtrics CX / Medallia / InMoment:

| ID | Missing capability | Why it matters |
|----|--------------------|----------------|
| **X1** | **Response-level identity** (contact/respondent records linked to responses). | THE blocker. Inner-loop = a case on an *identified* detractor. No contact entity = no one to route a recovery to. |
| **X2** | Case/ticket object with lifecycle, owner, SLA clock, escalation. | The operational heart of enterprise XM. Today `propose_workflow` is a fire-once notify. |
| **X3** | Role→owner routing (org chart). `CrystalContext.user_role` is a permission tier, not an org chart. | Skills emit `owner_role:"CSM"` as free text; can't resolve to a real assignee. |
| **X4** | External integrations (Slack/Teams/Jira/ServiceNow/Salesforce). Currently stubbed. | Actions die inside the XM tool without these. |
| **X5** | X+O operational data (CRM/ARR, tickets, usage). | Impact estimates are templates, not data-derived; no true ROI; no churn model. |
| **X6** | Action-outcome history. | System can't learn which recommendations actually moved metrics; confidence is a priori. |

---

## 3. Target design

### 3.1 Principles

1. **No invisible mutation.** Every state change is either previewed before commit or acknowledged after with a link to the result and an undo path.
2. **One source of truth for routes.** The frontend never hardcodes paths; it uses `ROUTES`/`toPath` and client-side `useNavigate`.
3. **The card shows what it will do.** `params` are rendered as a human-readable "Will do" block before the user commits.
4. **Every recommendation is measurable.** Emitted → accepted → succeeded/failed is tracked.
5. **Proposals are typed and exhaustive.** Adding a type forces a handler (no silent `default`).

### 3.2 Redesigned action card (UX spec)

```
┌─────────────────────────────────────────────────────────┐
│ [icon]  Create churn-risk alert            ● HIGH  ◷ 2m  │  priority + est. time
│         Detractors in "Wait Time" rose 18% this week.    │  description (what + why)
│         ▸ Why this  (confidence 86%)                     │  expandable rationale + confidence
│ ─────────────────────────────────────────────────────── │
│  WILL DO:                                                │  params preview — the key fix
│   • Alert type: Sustained NPS drop (S-03)                │
│   • Trigger: NPS < 30 for 3 days · Severity: Warning     │
│   • Scope: this survey                                   │
│ ─────────────────────────────────────────────────────── │
│  [ Create alert ]   [ Edit… ]   [ Preview ]      ⋯       │  primary + secondary + overflow
└─────────────────────────────────────────────────────────┘
     overflow ⋯ → Snooze · Dismiss(+undo) · Explain · 👍/👎
```

Per-type button + navigation map:

| `type` | Primary | Secondary | Navigation | Post-apply feedback |
|--------|---------|-----------|------------|---------------------|
| `create_survey` | Start in builder → | Preview brief | client-side `navigate(ROUTES.BUILDER,{surveyId:'new'}, {state:{runId,questions}})` | toast + link chip |
| `edit_survey` | Review changes → | **Preview diff** (required) | open builder with refine result in `state`; **do not mutate before review** | show diff + Undo |
| `distribute` | Open distribution → | Preview segment | client-side navigate to builder `?tab=distribute` | n/a |
| `create_workflow` | Create workflow | Edit (name/trigger/action) | none (stay in panel) | success chip + "View workflow →" + Undo |
| `create_alert` | Create alert | Edit (threshold/severity) | none | success chip + "View alert →" + Undo |
| `schedule_rerun` | Re-run insights | — | none | live status chip (poll `getInsightRunStatus`) |
| `view_template` | Open template → | Preview | client-side `navigate(ROUTES.TEMPLATES)` | n/a |
| `export_insights` *(new)* | Export | Choose format | none | toast + download link |

Universal: every card gets Snooze, Dismiss-with-undo, and 👍/👎 (mirroring the answer-feedback already wired at `CrystalPanel.tsx:1598-1617`).

### 3.3 Data model additions

**Outcome tracking (Tier 1/2):**
```
crystal_action_proposals(
  id, org_id, survey_id, brand_id,
  type, params jsonb, priority, business_rationale, confidence,
  emitted_at,
  status,            -- emitted | accepted | dismissed | succeeded | failed
  outcome_ref,       -- id of the created entity (workflow_id, alert_id, run_id, ...)
  latency_to_action_ms,
  error_detail,
  updated_at
)
```
Fire `accepted`/`succeeded`/`failed` from the frontend `executeAction`; `dismissed` from `dismissAction`. Enables an emit→accept→success funnel per type, and feeds the skill example bank with *empirical* outcomes (the infra already exists in `skill_runtime.py`).

**Closed-loop entities (Tier 3):**
```
contacts(id, org_id, external_id, email, account_id, segment_attrs jsonb, ...)
responses.contact_id  -- link every response to a contact
cases(id, org_id, contact_id, response_id, insight_id, driver_ref,
      status, owner_user_id, sla_due_at, escalation_tier, audit jsonb, ...)
ownership_routes(org_id, dimension, match_value, owner_user_id)  -- segment/account/touchpoint → owner
action_outcomes(proposal_id, metric, baseline, post_value, measured_at)
```

---

## 4. Roadmap

### Tier 1 — Correctness & trust (days; low risk)
Resolves the user's three stated concerns. No new infra.

1. **Fix navigation (B1, G5).** Replace all `window.location.href` in `executeAction` with `useNavigate()` + `ROUTES`/`toPath`. Preserves the chat panel; fixes the 404s.
2. **State invalidation (B2).** Introduce a lightweight invalidation bus (or adopt React Query) so `create_workflow`/`create_alert`/`schedule_rerun` refresh the relevant page hooks. After-mutation: surface a deep link to the created entity.
3. **Fix `edit_survey` (B3).** Stop discarding `copilotRefine` result; pass it into the builder via router `state`; require a diff-preview before mutating.
4. **Alert threshold parser (B4).** Parse `condition` → `threshold_config` in `execute_propose_alert`; reject the proposal if no valid threshold can be derived; render the parsed threshold on the card.
5. **Card redesign (G1, G2).** Render `params` ("Will do"), `confidence`, `business_rationale`; add Preview / Edit-before-apply / Undo / Snooze / 👍👎. Populate `business_rationale` in every `propose_*` tool and make it required in the skill schema.
6. **Prioritize + sort (G4).** Backend ranks proposals; frontend sorts critical→low; cap visible at 2–3.
7. **Honest scoping (G6, G7).** Make `distribute` either real or relabel "Open distribution setup"; narrow `create_workflow` to wired `action_type`s; make the proposal switch exhaustive so new types can't silently no-op.

**Acceptance:** No action navigates to a 404; no mutation leaves an open page stale; every card shows its payload and offers undo/feedback; alerts always carry a valid threshold.

### Tier 2 — Close the loop (weeks)
8. **Outcome tracking** (`crystal_action_proposals` table) + emit→accept→success funnel.
9. **Real integrations.** Implement the stubbed Slack/Jira/webhook channels; add a `webhook`/`case` `action_type`.
10. **New proposal types:** `assign_to_teammate`, `create_ticket`, `export_insights` (declared in types but has no tool/handler today), `schedule_readout`, `trigger_followup_to_detractors`.

### Tier 3 — Enterprise XM platform (the strategic bet)
11. **Response-level identity (X1)** — contacts + response→contact linkage. Gating dependency for everything closed-loop.
12. **Case management + SLA engine + escalation (X2)** in `scheduler.py`.
13. **Role→owner routing (X3)** — ownership_routes; feed into `CrystalContext`.
14. **X+O connectors (X5)** — CRM/ARR, tickets, usage → data-derived ROI + churn model → real `predictive` layer.
15. **Live benchmark service** (replace static `_NPS_BENCHMARKS`).
16. **Action-outcome learning (X6)** — feed outcomes back into confidence scoring + example bank.

---

## 5. Open decisions (need product input before Tier 1 build)

1. **Query cache:** adopt React Query/SWR (cleaner, bigger change) vs a lightweight in-house invalidation bus (smaller, less standard)? Recommendation: lightweight bus for Tier 1, evaluate React Query for Tier 2.
2. **Edit-before-apply depth:** inline param editing on the card vs a modal? Recommendation: modal for the two pure mutations (workflow, alert) where params are richest.
3. **Undo semantics:** soft-delete + undo token, or hard confirm? Recommendation: soft undo for created entities (workflow/alert), 10s toast window.
4. **Tier 3 sequencing:** identity-first (X1) unblocks the most, but is the largest data-model change. Confirm appetite before committing.

---

## 6. Appendix — key files

- `app/src/components/CrystalPanel.tsx` — `executeAction` (~497-600), `ActionProposalCard` (~2002-2152)
- `app/src/types/index.ts` — `ActionProposalType`, `ActionProposal` (~285-316)
- `app/src/constants/routes.ts` — canonical `/app/`-prefixed routes
- `app/src/lib/api.ts` — `startRun`, `copilotRefine`, `createWorkflow`, `createAlertRule`, `triggerInsightGeneration`
- `crystalos/agents/crystal.py` — `ActionProposal`, `_normalize_proposal`, `_extract_action_proposals`, `_normalize_skill_output`, `NAVIGATION_GUIDE`
- `crystalos/crystal/tools.py` — `propose_*` tools
- `crystalos/crystal/registry.py` — tool defs, `ACTION_TOOL_NAMES`
- `crystalos/skills/crystal-analyst/SKILL.md` — proposal output schema
- `crystalos/lib/tool_dispatcher.py` — stubbed Slack/Jira integrations
- `crystalos/crystal/context.py` — `CrystalContext`, `BrandContext`
