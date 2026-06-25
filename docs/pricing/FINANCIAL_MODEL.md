# Experient — Financial Model: Profitability & Sustainable Growth

**Date:** June 2026
**Prepared by:** Finance
**Purpose:** Show that Experient is profitable early and grows on its own cash flow — no outside funding required.

---

## The Premise

Experient is built to be a **durable, profitable, owner-operated software business**. The model below is deliberately conservative: it assumes modest customer growth, no outside funding, no debt, and a real founder salary paid from day one. The single question it answers is *"At what point — and under what assumptions — does this business pay for itself and the person running it?"*

The answer: **roughly 30 paying customers.** Everything beyond that is profit, reinvested at the founder's discretion.

---

## Cost Structure

### Fixed costs (lean launch)

| Service | Monthly | Notes |
|---|---|---|
| Fly.io backend | $100 | 2 small VMs |
| Fly.io CrystalOS | $160 | 2 VMs, 2GB |
| Supabase Pro | $25 | sufficient to ~80 customers |
| Redis (Upstash) | ~$5 | pay-per-use, low at launch |
| Firebase hosting | $5 | |
| Monitoring (self-hosted) | $0 | Prometheus on existing VM; defer paid Grafana |
| Sentry | $0 | free tier (5K errors/mo) |
| Novu | $0 | free tier (10K events/mo) |
| Clerk | $25 | production features |
| **Total fixed** | **~$325/mo** | grows in steps as customers scale (below) |

### Variable cost (AI + per-customer infra)

| Tier | AI cost/mo | Infra share (100 cust.) | True COGS/mo |
|---|---|---|---|
| Starter | $1.80 | $6.21 | $8.01 |
| Growth | $18.29 | $6.76 | $25.05 |
| Enterprise | $190.40 | $9.86 | $200.26 |

AI is the dominant variable cost and the one to manage. Crystal conversational turns ($0.035 each on Claude Sonnet 4.6) drive it. The bundled allowance + default spend cap mean a single power user can never run COGS away — AI pauses at the cap unless they pay for overage.

### Cost-control levers (apply early, not later)

| Lever | Savings | When |
|---|---|---|
| Model routing — Haiku for simple, Sonnet for complex Crystal turns | ~40% on Crystal cost | before 50 customers |
| Insight pipeline on Gemini 2.0 Flash | ~30× cheaper than Sonnet | already done |
| Semantic response cache | 10–15% | by 100 customers |
| Spend cap ON by default | caps the COGS floor | at launch |

Without outside funding, every dollar of AI cost comes out of margin. Applying routing + caching cuts blended AI cost ~45% and lifts Growth-tier margin toward 94%.

---

## Contribution Margin

| Tier | Price/mo | True COGS | **Contribution/mo** | Margin |
|---|---|---|---|---|
| Starter | $49 | $8.01 | **$40.99** | 83.7% |
| Growth | $299 | $25.05 | **$273.95** | 91.6% |
| Enterprise (base) | $1,499 | $200.26 | **$1,298.74** | 86.6% |

---

## Break-Even

### Including a founder salary

Monthly nut = $325 fixed + **$8,000 founder salary** = **$8,325/mo**.

| Path to break-even | Customers |
|---|---|
| Pure Growth ($274 each) | **30** |
| Realistic mix (20 Growth + 2 Enterprise) | **~25** |
| Pure Enterprise ($1,299 each) | **7** |

**The business covers infrastructure, AI cost, and a living founder salary at ~25–30 customers.** This is the most important number in the model. It is reachable with product-led growth alone.

### Sensitivity — what if things go worse than planned?

| Scenario | Effect | Break-even shifts to |
|---|---|---|
| AI cost 2× our estimate | Growth contribution $256 (still 86%) | ~32 customers |
| Founder salary $12K instead of $8K | Nut = $12,325 | ~45 Growth customers |
| 30% of customers are Starter, not Growth | Lower avg contribution | ~40 customers |
| Heavy power-user overage abuse | Spend cap prevents it | no material change |

Even in the stacked-pessimistic case (high AI cost + higher salary + Starter-heavy mix), break-even stays under ~60 customers. The model is robust because margins are high and the spend cap bounds the downside.

---

## Cash Flow — Growth Funded by Customers, Not Investors

The conservative growth engine is **annual prepayment**, not fundraising.

- A Growth customer on annual billing pays **$3,588 upfront**. Their COGS for the year is ~$300. That is **$3,288 of cash available immediately** to fund operations and the next customer's acquisition.
- 50 annual Growth customers = **~$179K of cash collected upfront**, against ~$15K of annual COGS. This deferred revenue is interest-free working capital.
- This is how the business self-funds expansion: each cohort's prepay funds the next cohort's acquisition and the founder's salary, with profit left over.

There is no scenario in this model that requires raising money to keep the lights on or to grow. Growth is paid for out of profit and prepaid cash.

---

## Profitability at Scale

Conservative mix (50% Starter / 35% Growth / 15% Enterprise). Fixed cost grows in steps (Supabase Business at ~80 customers, extra Fly VMs at ~50/100, Novu paid tier at ~20).

| Customers | Monthly revenue | Monthly COGS | Fixed + salary | **Monthly profit** |
|---|---|---|---|---|
| 30 | ~$8.4K | ~$0.9K | ~$8.3K | **~break-even** |
| 100 | ~$22.3K | ~$3.0K | ~$9.6K | **~$9.7K** |
| 250 | ~$55.8K | ~$7.5K | ~$12K | **~$36K** |
| 500 | ~$111.5K | ~$15K | ~$18K | **~$78K** |

(Profit figures assume founder salary already paid inside "Fixed + salary.")

At 500 customers — a modest target for a self-serve product over a few years — the business throws off roughly **$78K/month of profit after paying the founder a salary**, with no funding ever raised. That profit is the founder's to take home, reinvest in hiring, or both.

---

## What Reinvestment Looks Like (optional, from profit)

Because growth is funded by profit, every reinvestment decision is optional and reversible:

| Profit milestone | Optional reinvestment |
|---|---|
| ~$10K/mo profit | Better salary; part-time contractor for support/content |
| ~$35K/mo profit | First full-time hire (engineering or customer success) |
| ~$78K/mo profit | Small team (2–3 people); paid marketing experiments |

None of these are required to stay profitable. Each is funded by money already earned. If a hire doesn't pay for itself, the business simply returns to its prior profit level — no runway clock, no investor pressure.

---

## Risks & How the Conservative Model Contains Them

| Risk | Containment |
|---|---|
| AI cost spike from a power user | Spend cap ON by default; AI pauses at the cap. Bounded by design. |
| AI model price increases | Model routing + caching; ability to swap models via OpenRouter; rate changes pass through with 90-day notice. |
| Slow customer growth | Profitable at ~30 customers — a low bar. No runway clock forcing premature scaling. |
| Churn higher than expected | High margins absorb it; annual prepay smooths cash flow; no debt to service. |
| Incumbent competition | We compete on price transparency and the closed-loop product, not on outspending anyone. |
| Founder wants to slow down | Profitable, low-fixed-cost business can idle sustainably — it doesn't need constant capital injection to survive. |

The defining property of this model: **there is no failure mode that requires raising money.** The worst case is slower growth, not insolvency.

---

## The Cost-Down Dividend — A Margin Mechanic, Not a Discount

We have publicly committed that **our prices only go down** (see `PRICING_PROPOSAL.md`). Counter-intuitively, this *improves* the financial model rather than eroding it — because the dividend pays out only *realized* savings and retains half of them.

### The governing metric: COGS-per-credit

An LLM-cost observability layer (Helicone/Langfuse or the OpenRouter usage API, per `CREDIT_SYSTEM.md` Part 9) computes our trailing 30-day cost to deliver one credit of AI. Today that figure sits well below the $0.01 credit value; the AI-cost curve pushes it lower over time.

### The 50/50 rule

When measured COGS-per-credit falls by some amount, we return ~50% of that saving to customers (larger allowances / lower per-action costs) and retain ~50% as margin.

| | Year 0 (illustrative) | After a 40% AI-cost decline |
|---|---|---|
| COGS-per-credit | $0.0040 | $0.0024 |
| Saving realized | — | $0.0016 |
| Returned to customer (50%) | — | $0.0008 → bigger allowance |
| Retained as margin (50%) | — | $0.0008 → margin rises |
| Effective credit margin | 60% | **~76%** |

The customer's effective price per unit of value falls; our gross margin per credit *rises*. Both sides win because the underlying technology got cheaper — we simply split the gain transparently.

### Why this is conservative, not risky

- **Only realized savings are passed through** — never a bet on future cost declines. If costs don't fall, allowances don't change and nothing is given away.
- **Automated and bounded.** A monthly policy job applies the formula; there is no discretionary discounting, no sales-led price erosion, no margin leakage.
- **It strengthens retention.** Falling effective prices and rising value are the cheapest churn-reduction lever available — and churn is the main threat to a self-funded model.
- **Margins trend up over time**, not down — which means the break-even customer count (~30) only gets easier to clear as the business matures.

---

## Bottom Line

| Question | Answer |
|---|---|
| Do we need funding? | **No.** Profitable at ~30 customers, including a founder salary. |
| What funds growth? | **Customer prepayment and retained profit.** |
| What's the profit engine? | **The Growth tier** — 92% margin, self-serve, low CAC. |
| When is it cash-flow positive? | **At ~25–30 customers.** |
| What's the worst case? | **Slower growth — never insolvency.** No debt, no runway clock. |
| What's the goal? | **A durable, profitable business that compounds on its own cash, on the founder's terms.** |

Experient does not need scale to be a good business. At 70–94% gross margins, a ~$325/mo fixed cost base, and break-even at ~30 customers, it is profitable early and stays profitable — growing only as fast as its own cash flow comfortably allows. Conservative by design, and durable because of it.
