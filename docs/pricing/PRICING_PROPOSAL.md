# Experient — Pricing Proposal

**Version:** 2.0
**Date:** June 2026
**Prepared for:** Founder
**Status:** Draft for Approval

---

## The Strategy in One Sentence

Price Experient transparently below the incumbents, bundle generously so the AI meter is invisible at normal use, earn 70–94% gross margin from the first customer, and grow on our own cash flow — profitable, predictable, and in control, with no dependence on outside funding.

---

## What "Conservative" Means Here

This is not a land-grab. The goal is a durable, profitable business:

- **Revenue must exceed every cost — including a founder salary — at low customer counts.** We are cash-flow positive at roughly 30 customers (see Unit Economics).
- **Predictability over upside.** Flat plans, bundled allowances, spend caps on by default. Customers always know their ceiling. We always know our margin.
- **Grow on retained earnings, not runway.** Annual prepay funds expansion. No round required to reach or sustain profitability.
- **Fewer, better customers beat volume.** We'd rather have 200 happy mid-market customers paying predictably than chase 10,000 at a loss.

The bigger upside (enterprise scale, category leadership) remains *available* if we ever want it — but it is optional, not the plan, and never funded by debt or dilution we can't service.

---

## The Pricing Model: Flat Plans + Bundled AI Allowance

| | **Free** | **Starter** | **Growth** | **Enterprise** |
|---|---|---|---|---|
| **Price (annual)** | $0 | $49/mo | $299/mo | from $1,499/mo |
| **Price (monthly)** | $0 | $69/mo | $399/mo | Annual only |
| **Responses/mo (bundled)** | 100 | 2,000 | 20,000 | Unlimited (fair use) |
| **Seats** | 1 | 3 | 10 | Unlimited |
| **AI allowance/mo** | 3 runs + 5 turns (lifetime) | 1,500 credits | 12,000 credits | 80,000 credits |
| **Spend cap** | hard | ON by default | ON by default | configurable |
| **Target buyer** | Trial / individual | Solo CX / founder | CX team (5–20) | CX org (20–500) |

**Core usage is bundled — never metered.** Collecting responses, importing contacts, refreshing segments, in-app notifications, seats: all included up to the plan cap. Credits are spent only on expensive AI — insight runs (50 cr), Crystal conversational turns (15 cr), XO-Fusion (200 cr). Full mechanics in `CREDIT_SYSTEM.md`.

**The allowance is sized so a typical customer never hits it.** The meter exists for genuine power users, not to nickel-and-dime everyone. Overage is opt-in only.

---

## Why This Pricing Model (Benchmarked Against AI Leaders)

We studied how the best — and worst — AI products price. The pattern is unambiguous:

> **Trusted models bundle a generous allowance into a flat plan so the meter is invisible at normal usage, and meter only expensive, optional AI. Hated models meter everything and surprise-bill.**

| Company | Model | Verdict | Lesson |
|---|---|---|---|
| GitHub Copilot | Seat includes matching credit pool; caps ON by default | Trusted ✓ | Bundle the allowance; cap by default |
| Hex | Seat + bundled AI credits; predictable worst-case bill | Trusted ✓ | Customer can answer "what's my max bill?" |
| Notion AI | Re-bundled AI into the seat; no meter | Trusted ✓ | Simplicity wins |
| Microsoft Copilot | Seat + Copilot Credits at flat $0.01/cr | Trusted ✓ | Legible credit-to-dollar |
| Zendesk AI | Seat + *LLM-verified* resolution overage | Trusted ✓ | Bill only on delivered value |
| Intercom Fin | Bills "assumed resolutions" (even when nothing happened) | Backlash ✗ | Surprise bills destroy trust |
| Jasper (history) | Word-credits "caused confusion, inhibited use" → reverted | Failed ✗ | Don't meter everyday actions |

**Experient is built on the trusted pattern.** It is the only XM platform doing so: incumbents run three opaque meters at once (per seat **and** per response **and** per AI module). We run one transparent meter, only on the heavy AI, with a generous bundled floor and a hard cap. That is both more trustworthy *and* more profitable — lower support cost, lower churn, faster sales.

*(Sources: GitHub, Hex, Notion, Microsoft, Zendesk, Intercom, Jasper official pricing pages and changelogs, 2025–2026.)*

---

## Competitive Positioning

### Full AI feature set: $3,588/yr vs $75,000+/yr

| Capability | Qualtrics | Medallia | Experient |
|---|---|---|---|
| Survey creation + collection | Included | Included | **Free** |
| AI text analytics / insights | +$50K–$200K/yr | Module add-on | **In Growth ($299/mo)** |
| Conversational AI | XM Discover +$200K/yr | Athena add-on | **In Growth ($299/mo)** |
| Closed-loop case management | Professional services | Professional services | **In Growth ($299/mo)** |
| **Entry cost, full feature set** | **$75,000+/yr** | **$100,000+/yr** | **$3,588/yr** |
| Implementation fee | $5K–$20K | $50K–$200K | **$0** |
| Time to first insight | 6+ months | 6–12 months | **30 minutes** |

**The mid-market gap.** Between SurveyMonkey/Typeform (cheap, no intelligence) and Qualtrics/Medallia (intelligent, six-figure TCO) sits a $10K–$75K segment with budget and no AI-grade product built for it. Growth at $3,588/year with Crystal AI is the first credible product in that gap. Details in `COMPETITIVE_ANALYSIS.md`.

---

## Unit Economics

### Margin per tier (at 100 customers)

| Tier | Price/mo | True cost/mo | Contribution | Gross Margin |
|---|---|---|---|---|
| Starter | $49 | $8.01 | $41 | **83.7%** |
| Growth | $299 | $25.05 | $274 | **91.6%** |
| Enterprise (base) | $1,499 | $200.26 | $1,299 | **86.6%** |

Blended ~70% at 100 customers, rising to ~78% at 1,000 as shared infrastructure amortizes. Model routing (cheap models for simple Crystal turns) lifts Growth toward 94%.

### AI cost is the variable to watch

| Operation | Cost per call |
|---|---|
| Crystal conversational turn | $0.035 (Claude Sonnet 4.6) |
| Insight pipeline (1,000 responses) | $0.012 (Gemini 2.0 Flash) |
| XO-Fusion analysis | $0.60–1.00 |
| Notification (Novu) | $0.005 |

Crystal conversational AI is the dominant variable cost. The bundled allowance + spend cap directly protect margin: a single power user cannot blow up COGS because AI pauses at the cap unless they opt into (and pay for) overage.

---

## Break-Even — The Heart of the Conservative Case

### Lean fixed costs at launch

| Service | Lean launch | Notes |
|---|---|---|
| Fly.io backend | $100 | 2 small VMs |
| Fly.io CrystalOS | $160 | 2 VMs |
| Supabase Pro | $25 | until ~80 customers |
| Redis (Upstash) | ~$5 | pay-per-use |
| Firebase hosting | $5 | |
| Monitoring / Sentry / Novu | $0 | free tiers at launch |
| Clerk | $25 | |
| **Total fixed** | **~$325/mo** | |

### Break-even, including an $8,000/mo founder salary

Monthly nut = $325 fixed + $8,000 salary = **$8,325**.

| Path | Customers to break-even |
|---|---|
| Pure Growth ($274 contribution each) | **30** |
| Realistic mix (20 Growth + 2 Enterprise) | **~25** |
| Pure Enterprise ($1,299 each) | **7** |

**Experient covers infrastructure, AI cost, and a founder salary at roughly 25–30 paying customers.** That is reachable with product-led growth and content alone — no sales team, no funding. Every customer past ~30 is profit.

---

## Go-to-Market — Product-Led, Funded by Cash Flow

| Tier | Motion | CAC | Role |
|---|---|---|---|
| Free | Self-serve signup | ~$0 | Top of funnel |
| Starter | Self-serve (Stripe) | <$150 | Profit + funnel to Growth |
| Growth | Self-serve + in-app upgrade prompts | <$400 | **The profit engine** |
| Enterprise | Founder-led / inbound only | ~$0–$2K | Opportunistic |

**Rules:**
1. **Growth is the engine** — 92% margin, sub-$400 CAC, ~2.5-month payback, fully self-serve. Focus here.
2. **Enterprise is inbound-only** until cash comfortably allows otherwise. Take the deals that come to you (Medallia-displacement inbound especially), but don't fund a $15K-CAC sales org from money we don't have.
3. **No acquisition cost we can't recover in under 6 months.**
4. **Push annual prepay.** A $3,588 upfront Growth contract is interest-free working capital that funds its own COGS and then some — this is how we self-fund growth.

---

## Conservative Growth Outlook

Modest, cash-funded ramp (50% Starter / 35% Growth / 15% Enterprise mix):

| Customers | Approx. MRR | Approx. ARR | State |
|---|---|---|---|
| 30 | ~$8.4K | ~$100K | **Break-even (salary covered)** |
| 100 | ~$22K | ~$268K | Comfortably profitable |
| 250 | ~$56K | ~$670K | Profitable; first optional hire |
| 500 | ~$112K | ~$1.34M | Profitable; reinvest from earnings |

These are deliberately conservative. The point is not a hockey stick — it's that the business is profitable early and stays that way, with growth paid for out of profit rather than dilution.

---

## Profitability Guardrails

1. **Never price below true cost at scale.** Floors: Starter $19/mo, Growth $49/mo, Enterprise $299/mo. Published prices stay well above.
2. **Bundled allowance + spend cap on by default.** No unlimited AI on any plan; the cap protects margin and the customer's bill simultaneously.
3. **Overage and auto-refill are opt-in.** We don't dark-pattern revenue out of customers.
4. **SMS is a feature, not a profit center.** Priced near cost; bundled into campaign packs.
5. **Enterprise 80% consumption commitment** prevents "cheap insurance" contracts.
6. **Model routing before scaling** keeps AI cost low — protect margin proactively, not reactively.
7. **Never change credit rates retroactively.** 90-day notice, committed in contract.

### Configurable parameters (admin panel, no deploy needed)

```
CREDIT_RATE_INSIGHT_RUN          = 50      # credits per pipeline run
CREDIT_RATE_CRYSTAL_TURN         = 15      # credits per conversational turn
CREDIT_RATE_XO_FUSION            = 200     # credits per XO-Fusion run
CREDIT_RATE_BROADCAST_EMAIL      = 2
CREDIT_RATE_BROADCAST_SMS        = 8

BUNDLED_RESPONSES_STARTER        = 2000    # core usage, not metered
BUNDLED_RESPONSES_GROWTH         = 20000
AI_ALLOWANCE_STARTER             = 1500    # credits/mo included
AI_ALLOWANCE_GROWTH              = 12000
AI_ALLOWANCE_ENTERPRISE          = 80000

SPEND_CAP_DEFAULT                = true    # cap ON; overage opt-in
OVERAGE_OPT_IN_DEFAULT           = false
AUTO_REFILL_DEFAULT              = false   # off; opt-in only
ALLOWANCE_WARN_PCT               = 80
ALLOWANCE_HARD_WARN_PCT          = 95
OVERAGE_RATE_STARTER             = 0.018
OVERAGE_RATE_GROWTH              = 0.014
OVERAGE_RATE_ENTERPRISE          = 0.012
```

---

## The Cost-Down Dividend — Why Our Prices Only Fall

The cost of AI inference has dropped roughly 10× in two years and continues to fall. Qualtrics raises prices 5%+ every year at renewal. We do the opposite — and we make it a public, auditable promise that incumbents structurally cannot match:

> **Our prices only go down. The value of a credit ($0.01) is fixed forever; what changes is what a credit buys. Every quarter, we return a fixed share of our realized AI-cost savings to customers as larger allowances and lower per-action credit costs.**

### How it works

- **The anchor never moves.** 1 credit = $0.01, always. No repricing, no customer confusion.
- **We track true cost continuously.** An LLM-cost observability layer (Helicone/Langfuse, or the OpenRouter usage API) computes our trailing 30-day **COGS-per-credit** — the real cost to deliver one credit of AI. (Infrastructure in `CREDIT_SYSTEM.md` Part 9.)
- **We pass through realized savings, not projected ones.** When measured COGS-per-credit drops past a threshold, a policy job **automatically increases each plan's bundled allowance** (e.g. Growth 12,000 → 14,000 credits) or **lowers a per-action cost** (e.g. an insight run 50 → 40 credits). The customer simply gets more for the same price.
- **We keep enough to protect margin.** The dividend returns ~50% of realized savings to customers and retains ~50% — so margins *improve* even as customer value rises. This is a guardrail, not a giveaway (see `FINANCIAL_MODEL.md`).

### Why it's a moat, not a cost

- **It's the anti-Qualtrics.** "Our prices have never gone up" is a one-line sales argument against every incumbent's escalation clause.
- **It compounds trust.** Conservative buyers — our buyers — reward predictability and fairness with low churn and high retention.
- **It's automatic and honest.** Tied to a measured metric, applied programmatically, published transparently. No discretion to abuse, nothing to argue about.
- **It aligns us with the AI era.** As the technology gets cheaper, our customers — not just our margins — benefit. That is what leadership in AI-era experience management looks like.

---

## Summary

Experient competes in a market where the incumbents are expensive and opaque, and the cheap tools have no intelligence. We win the underserved mid-market with transparent, flat pricing; a generous bundled AI allowance on the most trusted pricing model in AI software; and spend caps that mean customers always know their ceiling.

The business is profitable at ~30 customers including a founder salary, carries 70–94% gross margins, and grows on its own cash flow. No funding round is required to reach or sustain profitability. The plan is simple and durable: **30 customers, profitable, in control** — and everything after that is profit we keep.
