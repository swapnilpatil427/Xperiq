# Experient Credit Economy — System Design

**Version:** 2.0
**Date:** June 2026
**Status:** Proposal → Engineering Backlog

---

## Overview

Credits are Experient's value-linked currency for AI. They exist for one reason: to let customers pay for the expensive, optional AI work in proportion to the value they get from it — without ever feeling like a meter is running on everyday use.

The design follows the most trusted pattern in AI software (GitHub Copilot, Hex, Notion): **bundle a generous allowance into a flat plan so the meter is invisible at normal usage, meter only the genuinely expensive AI actions, and keep spend caps on by default.** We deliberately avoid the pattern that has produced backlash elsewhere (Intercom Fin's "assumed resolution" billing, Jasper's abandoned word-credits) — metering everything and surprising customers with the bill.

Three principles:

1. **Core usage is bundled, never metered.** Collecting responses, importing contacts, refreshing segments, sending in-app notifications — these are everyday actions. Metering them creates anxiety and slows the very data collection that makes Crystal valuable. They are included in the flat plan price up to a generous monthly cap.
2. **Credits meter only expensive AI.** Insight pipeline runs, Crystal conversational turns, XO-Fusion analyses. These are the high-value, high-cost actions — the equivalent of "workflow runs" or "queries" in other AI products.
3. **The customer always knows their worst-case bill.** Spend caps are ON by default. Overage is strictly opt-in. No surprise invoices, ever.

**The anchor: 1 credit = $0.01.** Simple, transparent, always convertible to dollars.

---

## Part 1: What Credits Are (and Aren't) Spent On

### Bundled — no credit cost

These are included in every paid plan up to the plan's monthly cap. They never touch the credit balance.

| Action | Why it's bundled |
|---|---|
| Survey response collected | Core usage. Metering it slows data collection — the opposite of what we want. |
| **Copilot survey authoring / editing** | The on-ramp to value. Never tax survey creation — it's onboarding, and each edit is only 1–2 cheap LLM calls. Bundled under a generous fair-use cap; only egregious automated abuse is throttled. |
| Contact imported | Near-zero cost; metering creates onboarding friction. |
| Segment evaluation / refresh | Everyday hygiene; should be free to use. |
| In-app notification | Near-zero cost; don't penalize engagement. |
| Basic reporting & dashboards | Table stakes. |
| Seats / users | Bundled per tier (see Part 2). |

**The principle:** meter the *analytical* AI that produces ongoing value (Crystal analysis, insight runs, XO-Fusion), never the *authoring* AI that sets a customer up to get value (Copilot). Crystal **proposes and analyzes** (metered); Copilot **builds and edits surveys** (bundled). This mirrors the Crystal-vs-Copilot boundary already in the codebase (`crystalos/CLAUDE.md`).

### Metered — consumes AI credits

| AI Action | Credits | Dollar Equiv | Compute Cost (conservative) | Margin |
|---|---|---|---|---|
| Insight pipeline run (per survey) | 50 cr | $0.50 | ~$0.15–0.25 (15–25 LLM calls) | ~70% |
| Crystal conversational turn | 15 cr | $0.15 | ~$0.006–0.04 (1–2 LLM calls, skill-first) | ~75–95% |
| XO-Fusion analysis run | 200 cr | $2.00 | ~$0.60–1.00 | ~67% |
| Crystal Agent run (future SKU) | 50–100 cr | $0.50–1.00 | multi-step agentic | ~65% |

> **Cost numbers are real and conservative.** CrystalOS already tracks the true per-call cost of every LLM operation (`crystalos/lib/credits.py` `CreditEntry` + `_COST_PER_1K`, written to the `ai_operation_logs` table and Langfuse). The default Crystal path is *skill-first* — 1–2 LLM calls on cheap models (~$0.006/turn), not the legacy ReAct loop (4–13 calls). Our quoted costs assume the expensive case; reality is often cheaper, so margins are floors, not ceilings. This same instrumentation is the COGS-per-credit feed for the Cost-Down Dividend (Part 9).

### Outbound communications — pass-through, billed at cost-plus

Broadcasts touch real carrier/delivery costs, so they are credit-metered but priced close to cost — they are a workflow feature, not a profit center.

| Action | Credits | Notes |
|---|---|---|
| Broadcast email sent | 2 cr ($0.02) | Novu + delivery; ~75% margin |
| Broadcast SMS sent | 8 cr ($0.08) | Carrier pass-through dominates; ~50% margin |

**Why this split matters for a conservative business:** metering only the expensive AI keeps the bill predictable, cuts support tickets ("why did my balance drop?"), shortens the sales conversation, and reduces churn. It is the customer-friendly *and* the profitable choice on every axis.

---

## Part 2: Tiers

### Tier Overview

| | **Free** | **Starter** | **Growth** | **Enterprise** |
|---|---|---|---|---|
| **Price (annual)** | $0 | $49/mo | $299/mo | from $1,499/mo |
| **Price (monthly)** | $0 | $69/mo | $399/mo | Annual only |
| **Annual discount** | — | 29% | 25% | Annual-only |
| **Responses/mo (bundled)** | 100 | 2,000 | 20,000 | Unlimited (fair use) |
| **Surveys** | 3 | Unlimited | Unlimited | Unlimited |
| **Seats** | 1 | 3 | 10 | Unlimited |
| **AI credits/mo (bundled)** | 3 insight runs + 5 Crystal turns *(lifetime)* | 1,500 | 12,000 | 80,000 |
| **What the AI allowance buys** | a real taste | ~30 insight runs **or** ~100 Crystal turns | ~240 insight runs **or** ~800 Crystal turns | ~1,600 runs **or** ~5,300 turns |
| **Spend cap** | hard | ON by default | ON by default | configurable |
| **Overage (opt-in only)** | n/a | $0.018/cr | $0.014/cr | $0.012/cr |

The AI allowance is sized so a typical customer in each tier **never hits the cap** during normal use. The meter is there for genuine power users, not to nickel-and-dime everyone.

### What each tier can do

| Feature | Free | Starter | Growth | Enterprise |
|---|---|---|---|---|
| Survey builder + collection | Yes | Yes | Yes | Yes |
| Basic reporting | Yes | Yes | Yes | Yes |
| Insight pipeline AI | 3 lifetime | Yes (allowance) | Yes (allowance) | Yes (allowance) |
| Crystal conversational AI | 5 lifetime | Yes (allowance) | Yes (allowance) | Yes (allowance) |
| CX Cases + Ownership Routing | No | No | Yes | Yes |
| Broadcast email/SMS | No | No | Yes | Yes |
| Contact segments + CRM sync | No | Limited | Yes | Yes |
| XO-Fusion | No | No | No | Yes |
| Department credit pools | No | No | No | Yes |
| Credit approval workflows | No | No | No | Yes |
| Finance credit dashboard | No | No | No | Yes |
| RBAC credit controls | No | No | No | Yes |
| SLA guarantees | No | No | No | Yes |
| Dedicated CSM | No | No | No | Yes (>$36K ARR) |

**Design rule:** Feature access is plan-gated. AI consumption is allowance-gated. The two never mix — that's what keeps billing predictable.

### Rollover

| Tier | Rollover | Cap |
|---|---|---|
| Starter | None — resets monthly | — |
| Growth | 3-month rolling | Max 2× monthly allowance (24K) |
| Enterprise | 12-month rolling | Max 3× base allowance (240K) |

Starter resetting monthly creates a gentle, honest upgrade signal: a Starter customer who consistently runs out of AI allowance is a Growth customer. Growth's rolling pool rewards steady use without letting credits bank into free years.

---

## Part 3: Spend Caps & Overage (the trust mechanism)

This is the heart of the conservative design. A customer must be able to answer *"what is the most this can cost me this month?"* before they ever sign.

- **Spend cap ON by default.** When the bundled AI allowance is exhausted, AI actions pause. The customer is never billed beyond their plan unless they choose to be.
- **Overage is opt-in.** A customer (or admin) explicitly enables overage and sets a ceiling: "allow up to $100/mo of extra AI." Only then does the meter run past the allowance.
- **Clear pre-action warnings.** At 80% of allowance: in-app banner. At 95%: high-credit actions show a confirm dialog ("This XO-Fusion run uses 200 credits; you have 180 left").
- **Auto-refill is opt-in, off by default.** Customers who want uninterrupted service can enable it; it is never forced. (Contrast: aggressive SaaS turns this on by default to maximize revenue — we don't.)

The result: no surprise bills, no "meter anxiety," far fewer billing support tickets, and a sales conversation that closes faster because the buyer can see the ceiling.

---

## Part 4: Credit Packs & Top-ups

For customers who occasionally need more AI than their allowance — without upgrading tiers.

| Pack | Credits | Price | Effective Rate | Best For |
|---|---|---|---|---|
| Insight Bundle | 5,000 (100 runs) | $49 | $0.0098/cr | Quarterly NPS deep-dive |
| Crystal Pack | 7,500 (500 turns) | $59 | $0.0079/cr | A heavy analysis week |
| Campaign Pack | 25,000 | $199 | $0.0080/cr | A big outreach push |

- Packs are purchased deliberately (no auto-charge), expire 12 months from purchase.
- Consumed **after** the monthly allowance (allowance first, then packs) so customers get full value from what they already pay for.
- Seasonal packs tied to real workflows (e.g. an "NPS Quarter Pack") are fine, but always optional and clearly time-bound — never dark-pattern urgency.

---

## Part 5: Enterprise Credit Controls

Larger orgs need their finance team to be comfortable. These controls exist to give them confidence, not to extract more.

### Department-level budgets
Org admins allocate a monthly AI-credit budget per cost center. Configurable whether departments can draw from a shared org pool after exhausting their own.

### RBAC for credit management

| Role | Allocate Budgets | Approve Spends | View Usage | Export |
|---|---|---|---|---|
| Finance Admin | Yes | Yes | All | Yes |
| Org Admin | Yes | No | All | No |
| Dept Manager | Within dept | Within dept | Dept | Dept |
| Power User | No | No | Own | No |
| Viewer | No | No | No | No |

### Approval workflows (reserve-at-request, debit-at-execution)
High-cost actions (XO-Fusion, large broadcasts) can require approval:
1. User initiates → system shows a **credit cost preview**.
2. If above the dept threshold, it queues for a Dept Manager / Finance Admin.
3. Credits are **reserved** at request, **debited** only at execution. Denied or expired (24h) requests release the reservation.

**Never debit for work not done.** That single rule is why customers trust the billing.

### Finance dashboard
Real-time balance (org + per dept), burn-rate graph with projected exhaustion date, action breakdown, cost-center attribution, configurable alerts (80% → email, 95% → Slack + email), and a CSV ledger export.

---

## Part 6: Free Tier

Narrow enough to prove value, not enough to run a business on.

| Capability | Free Limit |
|---|---|
| Active surveys | 3 |
| Responses per month | 100 (refreshes monthly) |
| Insight pipeline runs | 3 **lifetime** |
| Crystal conversational turns | 5 **lifetime** |
| Seats | 1 |
| CX Cases / Broadcasts / XO-Fusion | No |
| Data retention | 90 days |

**Why lifetime limits on AI:** after 3 insight runs the user has *felt* Crystal's value. The upgrade prompt appears in context, at the moment of maximum perceived value — an honest nudge, not a wall.

### Conversion prompts (honest, in-context)
1. Insight run #3 → "You've used your 3 free insight runs. Growth gives you ~240/month."
2. Response #90 → "Approaching your monthly response limit — don't lose data mid-survey."
3. Crystal turn #4 → "Crystal has more to say. Growth keeps the conversation going."
4. Team invite → "Free supports 1 seat. Growth includes 10."

No hard expiry. Re-engagement email at 180 days inactive; data archived at 365 days with a 30-day download window.

---

## Part 7: Never-Lose-Money Safeguards

These protect both sides — the customer from surprise bills, and Experient from runaway cost.

### Graceful exhaustion (never a silent cut-off)

| State | Behavior |
|---|---|
| 80% of allowance | In-app banner + admin email. |
| 95% | Pre-action confirm on high-credit actions. |
| 100% (cap on) | AI actions pause; core usage (surveys, reporting) continues uninterrupted. |
| 100% (overage opted in) | Meter runs to the customer's chosen ceiling, then pauses. |

Core platform use never stops because the AI allowance ran out — only AI does. The customer keeps collecting responses and viewing reports.

### Cost protection
- **Spend caps cap our exposure too.** A single power user can't blow up COGS — the cap stops AI before it does.
- **Per-org API rate limits** enforced independently of credit balance.
- **New-account daily cap** (10,000 credits/day for accounts <30 days old) until payment history is established.
- **Velocity alert:** >3× the 30-day average in a day triggers a review hold.
- **Model routing** (Haiku for simple Crystal turns, Sonnet for complex) keeps the per-credit cost low enough to protect margin — see `FINANCIAL_MODEL.md`.

### Floors
- Free: no payment required.
- Starter/Growth: valid card on file before any overage.
- Enterprise: $18,000 annual minimum commitment.

---

## Part 8: Pricing Psychology (the conservative version)

We win trust by being legible and generous, not by maximizing extraction.

- **The meter is invisible at normal use.** Bundle enough that typical customers never see it. That's how GitHub Copilot and Hex earned trust.
- **One transparent rate.** "1 credit = $0.01. An insight run is 50 credits — fifty cents." A buyer can do the math in their head.
- **Anchor to real-world value, not to other software.** "One XO-Fusion run = $2.00 — it replaces about four hours of analyst time."
- **Never change rates retroactively.** 90-day written notice for any change, committed in contract. This is itself a differentiator versus Qualtrics's 5%+ annual escalation.
- **Our prices only go down.** The credit value (1 credit = $0.01) is fixed forever; what changes is what a credit *buys*. As our AI cost falls, allowances grow and per-action credit costs drop — never the reverse. See the Cost-Down Dividend in `PRICING_PROPOSAL.md` and `FINANCIAL_MODEL.md`.
- **Caps over surprises.** A predictable bill that's slightly higher beats a "cheap" bill that occasionally spikes. Conservative customers — our customers — value predictability.

### Competitive framing
> "Qualtrics charges for 25 seats whether you run 1 survey or 100, plus per-response, plus AI modules — three meters, all opaque. Experient bundles everything you use day-to-day into one flat price, meters only the heavy AI, and caps your bill by default. You always know your ceiling."

---

## Part 9: Billing & Metering Infrastructure

We do not build payments, invoicing, or a metering engine from scratch. We assemble proven, mostly open-source components so the credit ledger stays under our control, the fixed cost stays low, and the architecture stays conservative.

### The four layers

| Layer | Tool (recommended) | Role | Why |
|---|---|---|---|
| **Payments & invoicing (system of record)** | **Stripe** | Charges cards, issues invoices, handles tax (Stripe Tax), dunning, prepaid credit purchases | Enterprise procurement trusts it; native usage-based billing + credit grants |
| **Credit ledger & metering** | **Lago** (open-source, self-hosted) | Holds the allowance / pack / overage balances, applies deductions, pushes invoices to Stripe | We own the ledger and the data; near-zero marginal cost; no revenue-share to a billing vendor |
| **True-cost observability** | **Helicone** or **Langfuse** (self-host), or OpenRouter usage API | Logs the real token cost of every Crystal turn, insight run, and XO-Fusion call | Produces the single metric that governs pricing: trailing 30-day **COGS-per-credit** |
| **Cost-down policy engine** | Internal job + Lago grants | Reads COGS-per-credit; when it falls past a threshold, programmatically raises allowances / lowers per-action credit costs | Makes "our prices only go down" automatic and auditable |

**Managed alternatives to Lago** (if we ever prefer not to self-host): **Metronome** or **Orb** — both are real-time, AI-grade usage-billing platforms with credit ledgers and margin tracking. Trade-off is a platform fee / revenue share, which works against the high-margin conservative thesis. Default is Lago; revisit only if operational load justifies it.

### Data flow (proposed)

```
Customer action (insight run / Crystal turn / XO-Fusion)
        │
        ▼
Backend records a metered event  ──►  Lago (deduct from allowance → pack → overage)
        │                                   │
        │                                   ├─ balance/cap check (Redis-cached, fast path)
        │                                   └─ if overage opted-in & within ceiling: allow; else pause AI
        ▼
Helicone/Langfuse logs real token cost  ──►  COGS-per-credit metric (trailing 30d)
                                                   │
                                                   ▼
                                        Cost-Down policy job (monthly):
                                        if COGS/credit dropped ≥ threshold → grant larger allowances via Lago
        │
        ▼
Stripe: prepaid credit purchases, monthly/annual invoices, overage true-up
```

### Design rules

- **Metering is on the expensive AI only** (per `CREDIT_SYSTEM` Parts 1–3). Core usage is bundled and never hits the ledger — fewer events, lower metering cost, simpler reconciliation.
- **The fast path is cached.** A balance/cap check on every Crystal turn must be sub-millisecond — read from Redis, reconcile to Lago asynchronously. Never block an AI call on a billing round-trip.
- **Reserve-at-request, debit-at-execution** (Part 5) maps to Lago's wallet transactions; reservations expire in 24h.
- **Stripe is the only thing that touches money.** Lago issues; Stripe charges. We never store card data.
- **Stablecoin (USDC) only as an optional payment rail** for international customers via Stripe — never as the pricing unit. We do not tokenize credits: volatility breaks the $0.01 anchor, and it creates securities, accounting, and procurement problems with no offsetting benefit.

---

## Part 10: Implementation Priority

1. **Credit ledger + atomic deduction engine** — every metered AI action hits the ledger first; no race conditions.
2. **Allowance + balance display + spend cap (default ON)** — customers always know where they stand and what their ceiling is.
3. **80%/95% alerts + pre-action cost preview** — no surprises.
4. **Opt-in overage + opt-in auto-refill** — for customers who want uninterrupted service, on their terms.
5. **Department pools + RBAC + approval workflows** — unlocks Enterprise.
6. **Finance dashboard + CSV ledger export** — closes procurement.
7. **Credit packs** — optional top-ups for occasional spikes.

### Backend schema additions

```sql
-- AI credit ledger (only AI actions are logged here; core usage is not metered)
CREATE TABLE org_credit_ledger (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        TEXT NOT NULL,
  amount        INT NOT NULL,        -- negative = debit, positive = grant
  action_type   TEXT NOT NULL,       -- 'insight_run' | 'crystal_turn' | 'xo_fusion' | 'broadcast_email' | ...
  action_ref_id UUID,
  user_id       TEXT,
  dept_id       UUID,                -- NULL = org pool
  cost_center   TEXT,
  source        TEXT,                -- 'allowance' | 'pack' | 'overage'
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON org_credit_ledger (org_id, created_at DESC);

-- Materialized balance, updated atomically with each ledger write
CREATE TABLE org_credit_balance (
  org_id           TEXT PRIMARY KEY,
  allowance_left   INT NOT NULL DEFAULT 0,   -- resets/rolls per tier policy
  pack_balance     INT NOT NULL DEFAULT 0,
  overage_enabled  BOOLEAN NOT NULL DEFAULT FALSE,
  overage_ceiling  INT,                       -- in credits; NULL = no overage
  dept_balances    JSONB,
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Reservations for approval workflows (reserve at request, debit at execution)
CREATE TABLE credit_reservations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      TEXT NOT NULL,
  dept_id     UUID,
  amount      INT NOT NULL,
  action_type TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,           -- 24h default
  status      TEXT DEFAULT 'pending'          -- pending | committed | released
);
```

---

The credit economy is a trust instrument first and a billing mechanism second. Bundle generously, meter only the expensive AI, cap by default, and never surprise the customer. Build the ledger and the spend cap first; everything else follows.
