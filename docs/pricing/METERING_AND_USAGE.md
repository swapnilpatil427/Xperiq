# Metering & Live Usage — How Experient Measures Credits

**Version:** 1.0
**Date:** June 2026
**Status:** Design (not yet implemented)
**Companion to:** `CREDIT_SYSTEM.md`, `PRICING_PROPOSAL.md`, `FINANCIAL_MODEL.md`

This document specifies *how* usage is measured — for agentic Crystal, Copilot, the insight pipeline, broadcasts, and any future public API — grounded in the platform's real architecture. It is the bridge between the pricing strategy and engineering.

---

## Principle: Meter the analytical AI, bundle everything else

Restating the rule from `CREDIT_SYSTEM.md` because it governs every decision below:

- **Metered (consumes credits):** the expensive, value-producing *analytical* AI — insight pipeline runs, Crystal conversational/agent turns, XO-Fusion.
- **Bundled (never metered):** core usage and the *authoring* AI — survey responses, contacts, segments, notifications, and **Copilot survey building/editing**. These are the on-ramp to value; taxing them slows adoption.
- **Pass-through (cost-plus):** outbound email/SMS, priced near carrier cost.

This maps cleanly to the existing **Crystal-vs-Copilot boundary** in `crystalos/CLAUDE.md`: Crystal *proposes and analyzes* (metered); Copilot *acts and edits surveys* (bundled).

---

## What we already have (and what's missing)

The platform is closer to metered billing than expected. The AI layer **already records true cost per call**.

| Capability | Status | Where |
|---|---|---|
| Per-call token capture (in/out) | ✅ Exists | `crystalos/lib/openrouter.py` `call_agent()` |
| Per-call cost in USD | ✅ Exists | `crystalos/lib/credits.py` `CreditEntry` + `_COST_PER_1K` |
| Per-operation cost log | ✅ Exists | `ai_operation_logs` table (async write), Langfuse traces, Prometheus counters |
| Crystal turn telemetry event | ✅ Exists (tokens currently 0) | `crystalos/lib/turn_publisher.py` `TurnEvent`, fired by `_fire_telemetry()` |
| Org context on every AI call | ✅ Exists | `CrystalInput.org_id`, insight/copilot request bodies |
| Per-org rate limiting | ✅ Exists | `backend/src/middleware/rateLimiter.ts` (`apiLimiter` 500/15m, `aiLimiter` 30/15m) |
| Redis sliding-window metering pattern | ✅ Exists (reuse) | `backend/src/lib/frequencyCapper.ts`, `suppressionList.ts` |
| Plan tier + seat model | ✅ Exists | `org_profiles.plan_tier`, `seat_limit`; `backend/src/lib/seats.ts`; `billing:manage` permission |
| **Credit ledger + balance** | ❌ Missing | to be added (`org_credit_balance`, `org_credit_ledger`) |
| **Balance check before a metered call** | ❌ Missing | to be added at the backend route boundary |
| **Stripe / purchase flow** | ❌ Missing | greenfield |

**Implication:** the credit system is *additive*. It layers a ledger and a check/debit on top of cost data we already produce. We are not building cost tracking from zero.

---

## The metered surfaces (with real hook points)

Every metered action is checked **before** execution at the backend route boundary, and debited **after** confirmed success — using the actual cost already computed by CrystalOS.

### 1. Insight pipeline run — 50 credits

- **Trigger:** `POST /api/insights/:surveyId/generate` → `backend/src/routes/insights.ts` (~L319–378) → `agentsClient` → CrystalOS `run_insight_generation` (`crystalos/graphs/insights.py`).
- **Check (before):** verify org has ≥ 50 credits (or overage opted-in) **before** `createInsightRun()`. If not, return `402 Payment Required` with an upgrade/top-up CTA. Re-use the pre-flight pattern already there for the 60-second rate check.
- **Debit (after):** the pipeline is fire-and-forget; debit when CrystalOS signals completion (it already writes total tokens + `cost_usd` to `agent_runs` at publish). Debit the flat 50 credits and stamp the run with actual cost for the COGS feed.
- **Why a flat 50, not per-token:** predictability. The customer sees "1 insight run = 50 credits = $0.50" regardless of how many internal LLM calls (15–25) it took. We absorb the variance; they get a stable price. This is the trusted pattern.

### 2. Crystal conversational turn — 15 credits

- **Trigger:** `POST /api/insights/:surveyId/crystal` → `insights.ts` (~L775–940) → `agentsClient` → CrystalOS streaming endpoint → `_run_skill_stream` (default) or `_run_react_loop_streaming` (legacy).
- **Check (before):** verify ≥ 15 credits before `_agentsFetch('/insights/crystal')`. Sub-millisecond Redis balance read — never block the turn on a DB round-trip.
- **Debit (after):** on a successful answer. The natural completion marker is `_fire_telemetry()` in `crystalos/agents/crystal.py`, which already fires a `TurnEvent`. Credit-metering piggybacks here: thread real `tokens_in/out` into the event (currently 0), record actual cost, debit the flat 15 credits.
- **Skill-first vs ReAct:** default skill-first is 1–2 LLM calls (~$0.006). Legacy ReAct is 4–13 (~$0.03). The customer pays the same 15 credits either way; routing to skill-first protects *our* margin. We never pass execution-path complexity to the bill.
- **Crystal Novu Connect** (Slack/Teams via `POST /api/crystal-novu/message`) is the same turn, same 15 credits, same org resolution.

### 3. Crystal Agent run (future SKU) — 50–100 credits

- Autonomous multi-turn agentic workflows (the agentic evolution of the ReAct loop). Priced higher because they fan out into many turns and tool calls. Metered as one "agent run" with a credit cost proportional to a bounded turn budget — never an open-ended meter. Same check/debit boundary.

### 4. XO-Fusion analysis — 200 credits

- The most expensive analytical action (cross-operational data join + multi-model inference). Enterprise-only. Because it's high-cost, it is a prime candidate for the **approval/reservation** flow (`CREDIT_SYSTEM.md` Part 5): reserve 200 credits at request, debit at completion.

### 5. Copilot survey authoring — bundled (not metered)

- **Trigger:** `POST /orchestrate/{run_id}/refine` → `crystalos/agents/copilot.py` (1–2 LLM calls/edit), and `POST /api/ai/generate-survey` / `refine-survey`.
- **Not debited.** Survey creation is the on-ramp. We track its cost (it still flows through `call_agent()` → `ai_operation_logs`) for COGS visibility, but it does not touch the credit balance. A generous monthly fair-use cap (e.g. N authoring actions) guards against scripted abuse; normal use never sees it.

### 6. Outbound communications — pass-through

- `POST /api/outreach/broadcasts/:id/send`: debit per delivered message (email 2 cr, SMS 8 cr) at send time. Re-uses the existing suppression/frequency-cap send loop — the debit is one more check in a path that already gates each recipient.

### 7. Public API (future) — same rates, same ledger

- There is **no customer-facing API today** (the surface is internal, Clerk-authenticated). When one is offered: each AI endpoint maps to the same credit cost as its in-app equivalent, an API key resolves to an `org_id`, and the identical check/debit + ledger applies. Metering is designed to be surface-agnostic so the API is a thin addition, not a parallel system.

---

## How the meter works (mechanics)

A deliberately simple, fast, fail-safe loop — reusing patterns already in the backend.

```
                ┌─────────────────────────── backend route boundary ───────────────────────────┐
 request ──►    │  1. resolve org_id (auth.ts / requireAuth)                                     │
                │  2. CHECK balance  ── Redis read `credit:{orgId}`  (sub-ms; reuse rateLimiter   │
                │     pattern). Miss → load from Postgres `org_credit_balance`, cache 60s.        │
                │     • enough credits → continue                                                │
                │     • not enough + no overage → 402 Payment Required (+ top-up/upgrade CTA)     │
                │     • not enough + overage opted-in & under ceiling → continue                  │
                │  3. (optional, high-cost actions) RESERVE credits (credit_reservations, 24h)    │
                └───────────────────────────────────────────────────────────────────────────────┘
                                   │  call CrystalOS (agentsClient, X-Internal-Key)
                                   ▼
                CrystalOS executes; call_agent() records real tokens + cost_usd
                                   │  on success (_fire_telemetry / run publish)
                                   ▼
                ┌──────────────────────────── debit (async, never blocking) ────────────────────┐
                │  4. DEBIT flat credit cost from org balance (atomic)                            │
                │     • write `org_credit_ledger` row (action, credits, source, actual cost_usd)  │
                │     • update `org_credit_balance` + invalidate Redis cache                      │
                │     • emit live usage event (SSE/websocket) → UI meter updates instantly        │
                │     • feed actual cost_usd into COGS-per-credit metric (Cost-Down Dividend)     │
                └───────────────────────────────────────────────────────────────────────────────┘
```

**Design rules:**
- **Check is fast and cached; debit is async and never blocks the AI response.** Latency of billing must be invisible to the user.
- **Flat credit cost per action; we absorb token variance.** The ledger also stores *actual* `cost_usd` per event for our own margin/COGS analytics — but the customer is only ever charged the flat, published rate.
- **Fail-safe direction is explicit.** Balance-check failures (Redis down) **fail open** for already-paying orgs within plan allowance (never block paid work on an infra blip); hard balance exhaustion **fails closed** only past the cap with overage off.
- **Spend cap is enforced at the check step.** Past the bundled allowance, AI pauses unless overage is opted-in and under the ceiling — core platform use (surveys, reporting) continues regardless.
- **Reuse, don't reinvent.** The Redis sliding-window + Postgres-source-of-truth pattern in `frequencyCapper.ts` / `suppressionList.ts` is the template for the ledger cache.

---

## Live usage in the UX — what the customer sees

Transparency is a feature, not a footnote. The customer should never wonder where their credits went.

### Always-visible meter
- A compact **credit meter** in the top nav: `8,430 / 12,000 this month` with a thin progress ring. One glance answers "how much do I have left?"
- Updates **live** — the debit step emits a usage event so the meter ticks down the moment an insight run or Crystal turn completes (no refresh).

### At the moment of spend (pre-action clarity)
- High-cost actions show the cost *before* they run: "Run XO-Fusion analysis — **200 credits** (you have 4,180 left)." Confirm to proceed.
- Crystal and insight buttons carry a quiet "15 cr" / "50 cr" tag — legible, never alarming. At normal usage inside the bundled allowance, these read as informational, not as a meter running.

### The usage ledger (radical transparency)
A **Billing & Usage** page (new settings page, gated by the existing `billing:manage` permission, alongside Connections / Ownership / Notification-Analytics):
- **This month:** credits used by action type (insight runs, Crystal turns, XO-Fusion, broadcasts) — a simple bar breakdown.
- **Ledger:** every metered action with timestamp, who ran it, credits charged, and — uniquely — the *actual underlying compute cost* we incurred. No competitor shows customers their true COGS. We can, because we already track it.
- **Burn rate + projection:** "At this pace you'll use ~10,100 of 12,000 this month." No surprises.
- **Cost-Down Dividend banner:** "Your allowance grew from 12,000 → 14,000 this quarter as our AI costs fell. Your price didn't change." Proof we keep the promise.

### Buying & topping up (Stripe + Lago, per CREDIT_SYSTEM Part 9)
- **Plan upgrade:** self-serve Free → Starter → Growth via Stripe Checkout; in-app prompts appear at allowance-exhaustion and feature gates.
- **Credit packs:** one-click top-up (Insight Bundle, Crystal Pack, Campaign Pack) for occasional spikes — deliberate purchase, never an auto-charge unless opt-in auto-refill is on.
- **Spend cap & overage controls:** a single toggle — "Pause AI at my allowance" (default) vs. "Allow overage up to $___/mo." The customer sets their own ceiling and always knows their worst-case bill.
- **Enterprise:** department budgets, approval workflows, and the Finance dashboard (CREDIT_SYSTEM Part 5) — annual invoicing via Stripe, credit ledger via Lago.

---

## Transparent *and* cheap — why we can be both

These usually trade off. Our architecture lets us have both.

**Why we can be cheap:**
- The default Crystal path is **skill-first**: 1–2 LLM calls on inexpensive models (~$0.006/turn), not the 4–13-call ReAct loop. We engineered the cheap path to be the default.
- **Deterministic tool calls** (no LLM tool-selection loop) and **model routing** (cheap models for simple work) keep per-action cost low.
- The insight pipeline **samples** rather than processing every verbatim, so cost scales sub-linearly (1,000 responses ≈ 2× the cost of 100, not 10×).
- Result: we charge $0.15–$0.50 per analytical action and still hold 70–95% margin — while the same capability costs $50K–$200K/year as an add-on at Qualtrics.

**Why we can be transparent:**
- We already log the **true cost of every AI call** (`credits.py`, `ai_operation_logs`, Langfuse). We can show customers exactly what they consumed *and* what it cost us to deliver.
- Flat credit rates mean the bill is **predictable**: the customer is never charged for internal execution variance.
- Spend caps mean the customer **always knows their ceiling**.
- The Cost-Down Dividend means transparency cuts in the customer's favor over time.

The combination — *cheap because the architecture is efficient, transparent because we already measure everything, and predictable because we absorb the variance* — is the pricing posture incumbents cannot copy without rebuilding their stack and their business model.

---

## Open questions to resolve before build

1. **Debit signal for fire-and-forget insight runs:** complete the loop via a CrystalOS→backend callback on publish, or have the backend poll `agent_runs.status`? (Callback preferred; reuses internal-key auth.)
2. **Token threading for Crystal turns:** wire real `tokens_in/out` from `call_agent()` into `TurnEvent` (currently 0) so the debit records actual cost.
3. **Allowance reset/rollover job:** monthly reset (Starter) and rolling windows (Growth/Enterprise) — a scheduled job in the existing scheduler.
4. **Reconciliation:** Redis cache vs Postgres ledger vs Lago vs Stripe — define the source of truth (Postgres ledger) and a periodic reconciliation sweep.
5. **Fair-use cap for Copilot:** set the authoring-action ceiling that distinguishes normal use from scripted abuse.

These are implementation decisions, intentionally left open — this document is design, not code.
