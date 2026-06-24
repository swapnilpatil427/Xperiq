# Next: Tier 3 — Closed-Loop Action Platform

**Type:** Problem statement + prompt (NOT a design doc — design is the next agent's job)
**Origin:** Tier 3 of `docs/agent-framework/CRYSTAL_ACTION_SYSTEM_REDESIGN.md`, flagged by the XM-leader review as the strategic unlock.
**Status:** Not started. Gated on the decisions in §"Decisions needed" below.

---

## TL;DR

CrystalOS has best-in-class *advisory IQ* — its skills encode real XM methodology
(Bain inner/outer loop, Gartner VoC maturity, the "average trap"). But it is an
**advice engine bolted onto a survey tool**: it can recommend closing a loop, but
the platform has no system of record to actually close one. The strategic bet is to
turn it into a **closed-loop action platform**, in this dependency order:

**response-level identity → case management → SLA/escalation → role routing → X+O operational data.**

The #1 unlock and gating dependency is **response-level identity** — almost nothing
else in closed-loop XM works without it.

---

## Why this matters

Tiers 1–2 made the action system *trustworthy* (real routing, no silent mutations,
outcome tracking, transparent proposals). But every "closed-loop" recommendation the
skills produce still dead-ends, because there is no operational layer to act on. This
is the gap between "an XM analytics tool" and "an XM platform" (Qualtrics CX /
Medallia / InMoment). It is the largest data-model change in the product and should
not be started without explicit go-ahead and the decisions below.

---

## Current-state gaps (grounded — verify before designing)

1. **No respondent/contact identity.** Responses are not linked to an identified
   external contact (no contact entity, no email/account key). `user_directory`
   resolves *internal org users* (eNPS-style), not external respondents. → Inner-loop
   ("recover this detractor") has no record to attach an action to.
2. **No case/ticket object.** `propose_workflow` (`crystalos/crystal/tools.py`)
   emits a fire-once `notify`. There is no case with status lifecycle, owner, SLA
   clock, or escalation. (Note: `supabase/migrations/20260623000005_bug_tracking.sql`
   has *bug*-tracking tables with SLA/escalation shapes — study them as a precedent,
   they are NOT the customer-case system.)
3. **No role→owner routing.** `CrystalContext.user_role` (`crystalos/crystal/context.py`)
   is a permission tier (viewer/editor/admin), not an org chart. Skills emit
   `owner_role: "CSM"` as free text that resolves to nobody.
4. **External integrations stubbed.** Slack/Jira/Salesforce/ServiceNow are not wired
   (`crystalos/lib/tool_dispatcher.py` notes them as stubbed). Actions die inside the tool.
5. **No X+O operational data.** No CRM/ARR/tickets/usage. Impact estimates in skills
   (`business_rationale`, NPS-point deltas) are heuristic templates, not data-derived;
   no real ROI, no churn model. No `action_outcomes` history to learn from.

---

## The five sub-problems (each a problem statement)

### 1. Response-level identity (gating dependency)
**Problem:** There is no way to know *who* a response came from, so individual
follow-up / closed-loop outreach is impossible.
**Needs to enable:** a contact/respondent entity, response→contact linkage, and
identity captured at distribution/collection time — while respecting anonymity
settings, consent, and `data_region` (see `BrandContext`).
**Hard constraints:** anonymous surveys must stay anonymous; PII access is already
gated (`data:pii` permission); GDPR/region rules apply.

### 2. Case management
**Problem:** A recommendation to act on a detractor/segment cannot become an
accountable, trackable unit of work.
**Needs to enable:** a case object (status lifecycle, owner, linked
response/insight/driver, audit trail) that a Crystal proposal can create, and that
the UI can display/manage. Closed-loop skills (`close-the-loop-advisor`,
`*-action-advisor`) should produce cases, not just prose.

### 3. SLA & escalation
**Problem:** Cases without deadlines and escalation are just a list.
**Needs to enable:** per-severity SLA clocks, breach detection, and auto-escalation
up an owner hierarchy (likely a `scheduler.py` job). Study the bug-tracking SLA
tables as a shape precedent.

### 4. Role / owner routing
**Problem:** A finding (e.g. a struggling segment/account/touchpoint) cannot be
routed to the person accountable for it.
**Needs to enable:** an ownership model mapping segment/account/touchpoint → owner
identity, surfaced into `CrystalContext` so skills can route a case to a real
assignee instead of a free-text role.

### 5. X+O operational data
**Problem:** Experience (X) data has no operational (O) counterpart, so impact/ROI is
templated and there is no churn/risk model or outcome learning.
**Needs to enable:** connectors for operational records (CRM/ARR, tickets, usage)
joinable by contact/account; an `action_outcomes` table feeding empirical outcomes
back into skill confidence and the example bank.

---

## Success criteria (what "done" looks like)

- A Crystal proposal can create a **case** assigned to a **real owner** with an **SLA**,
  routed by **ownership rules**, optionally synced to an **external system**, against an
  **identified respondent** where consent allows — and the **outcome** is recorded and
  loops back into skill quality.
- The full chain works end-to-end across the three layers (CrystalOS skill → backend
  contract/persistence → frontend handler), following the established
  "CrystalOS proposes, app executes, backend records, outcomes feed back" pattern in
  the root `CLAUDE.md`.

## Constraints & non-negotiables

- Preserve the **"Crystal proposes, app executes"** boundary — no autonomous mutation.
- Reuse the **Tier-1/2 plumbing**: action-proposal normalization (`_normalize_proposal`),
  DataBus invalidation, `recordProposalOutcome` funnel. New capabilities are new
  proposal types + skills + endpoints, not a parallel system.
- Anonymity/consent/PII/region rules are first-class, not an afterthought.
- Each new capability moves along **one seam end-to-end** (skill → contract → handler →
  outcome). No half-wired features.
- Keep the per-layer `CLAUDE.md`/`SKILLS.md` in sync as you build.

## Decisions needed before design (do not assume)

1. **Identity model scope:** how is a respondent identified at distribution — link
   token ↔ contact, authenticated fill, CRM import? What is the anonymity/consent
   contract?
2. **Build vs integrate cases:** native case object vs syncing to an external system
   of record (Salesforce/ServiceNow/Jira) as the source of truth?
3. **Which integration first** (Slack/Teams alerting vs Jira/SF case sync)?
4. **X+O ambition for v1:** ship identity+cases+SLA first and defer operational-data
   connectors, or include a first connector?

---

## Prompt for the next agent

> You are designing **Tier 3 — the Closed-Loop Action Platform** for Experient, in the
> dependency order: response-level identity → case management → SLA/escalation → role
> routing → X+O operational data. Read first:
> `docs/agent-framework/CRYSTAL_ACTION_SYSTEM_REDESIGN.md` (esp. §2.4 strategic gaps
> and the Tier 3 roadmap), this problem statement, and the root `CLAUDE.md`
> "how the three layers collaborate" pattern.
>
> **Step 1 — Confirm the decisions** in "Decisions needed" with the user before
> designing. Do not assume an identity/consent model.
>
> **Step 2 — Ground in the current code** (verify, don't trust prose): the `responses`,
> `surveys`, `orgs`/`users` schema and distribution/collection flow; the bug-tracking
> SLA/escalation tables (`supabase/migrations/20260623000005_bug_tracking.sql`) as a
> precedent; `crystalos/crystal/context.py` (CrystalContext/BrandContext, permissions);
> `crystalos/crystal/tools.py` propose_* + `crystalos/lib/tool_dispatcher.py` integration
> stubs; the Tier-1/2 action-proposal + DataBus + outcome-tracking plumbing.
>
> **Step 3 — Produce a phased, implementable design** spanning all three layers
> (frontend, backend, CrystalOS) for each sub-problem: data model (new tables +
> migrations), API contracts, CrystalOS changes (new skills, new proposal types,
> context additions), frontend (pages/components/handlers), and the outcome→learning
> loop. Sequence identity-first; mark hard dependencies. Call out anonymity/consent/PII/
> region handling explicitly. Reuse — don't duplicate — the existing proposal/invalidation/
> outcome plumbing.
>
> **Step 4 — For each capability, define acceptance criteria** that prove the
> end-to-end closed loop (propose → execute → record → feed back), and a test plan per
> layer.
>
> Do not start implementation until the design and the Step-1 decisions are approved.
