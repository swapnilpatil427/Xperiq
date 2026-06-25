# Experient Pricing — Document Index

A conservative, profitable, self-funded pricing strategy. The whole doc set is built
on one principle: **flat plans with a generous bundled AI allowance and a spend cap on
by default — profitable at ~30 customers, growing on our own cash flow, no funding required.**

| Document | Purpose |
|---|---|
| **[PRICING_PROPOSAL.md](./PRICING_PROPOSAL.md)** | **Start here.** Tiers, the flat-plan + bundled-allowance model, why it beats the incumbents, AI-industry pricing benchmark, unit economics, break-even, product-led go-to-market. |
| [PITCH_DECK.html](./PITCH_DECK.html) | Presentation — open in any browser, arrow keys to navigate, print to PDF. The conservative profitability story and the comparison to AI leaders. |
| [CREDIT_SYSTEM.md](./CREDIT_SYSTEM.md) | Credit mechanics — what's bundled vs metered, spend caps, enterprise controls, fraud safeguards, billing infrastructure, DB schema. |
| [METERING_AND_USAGE.md](./METERING_AND_USAGE.md) | How usage is measured against the real codebase — metered surfaces (Crystal, insight runs, XO-Fusion, broadcasts), why Copilot is bundled, the check/debit mechanics, live usage UX, and why we can be transparent *and* cheap. |
| [FINANCIAL_MODEL.md](./FINANCIAL_MODEL.md) | Profitability & sustainable growth — cost structure, break-even, contribution margin, cash flow from prepay, downside sensitivity. No funding, no exit math. |
| [COMPETITIVE_ANALYSIS.md](./COMPETITIVE_ANALYSIS.md) | Teardown of Qualtrics, Medallia, InMoment, Birdeye, Typeform, SurveyMonkey, and AI-native challengers. |

## Viewing the deck

```bash
open docs/pricing/PITCH_DECK.html       # macOS — opens in default browser
```
Arrow keys or click to navigate. Cmd-P → "Save as PDF" to export. For a true `.pptx`,
print to PDF and import, or paste the slide content into Google Slides / PowerPoint.

## Key Numbers

- **1 credit = $0.01.** Core usage (responses, contacts, segments, notifications) is **bundled** — the meter runs **only** on insight runs (50 cr), Crystal turns (15 cr), and XO-Fusion (200 cr).
- **Spend cap ON by default; overage opt-in.** Customers always know their worst-case bill.
- **Starter $49/mo** → 83.7% margin · **Growth $299/mo** → 91.6% (the profit engine) · **Enterprise $1,499/mo** → 86.6%.
- **Break-even at ~30 customers** — including an $8K/mo founder salary. No funding required.
- **Lean fixed cost ~$325/mo** at launch (free tiers for monitoring, Novu, Sentry).
- **Go-to-market:** product-led self-serve for Growth; Enterprise inbound-only until cash allows.
- **Worst case is slower growth — never insolvency.** No debt, no runway clock.
- **Never price below:** Starter $19/mo, Growth $49/mo, Enterprise $299/mo.
- **Billing stack:** Stripe (money + invoicing) → Lago self-hosted (credit ledger) → Helicone/Langfuse (true cost per credit). No crypto tokens. Details in `CREDIT_SYSTEM.md` Part 9.
- **Cost-Down Dividend:** our prices only go down — the $0.01 credit value is fixed; allowances grow as AI cost falls (50% of realized savings returned, 50% retained). See `PRICING_PROPOSAL.md` / `FINANCIAL_MODEL.md`.
