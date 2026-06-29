# Synthetic Panels — What They Are & Why They Matter

> **Status:** Brainstorm / Pre-design  
> **Date:** 2026-06-26  
> **Owner:** Product  

---

## What Is a Synthetic Panel?

In traditional market research, a **panel** is a recruited group of real human respondents
who answer your surveys. You define the target demographic (e.g., "US consumers aged 25–44
with household income >$75k"), you pay a panel provider (Lucid, Dynata, Cint, Qualtrics
Research Core), and you wait days-to-weeks for real people to complete it.

A **Synthetic Panel** replaces — or augments — those real human respondents with
AI-generated personas that simulate how a specific demographic or psychographic segment
would realistically respond. Instead of recruiting people, you:

1. Define your target audience (demographics, psychographics, firmographics)
2. The AI instantiates statistically-realistic personas representing that audience
3. Those personas answer your survey — with natural variation, open-ended text, and
   realistic rating patterns
4. You get insight in **minutes, not weeks**, at a fraction of the cost

The key insight: **the value is not fake data — it is directional intelligence**.
Synthetic panels are a hypothesis-generation and concept-testing tool, not a replacement
for all human research. The best implementations are honest about this distinction.

---

## Who Uses Synthetic Panels?

| Persona | Core Job To Be Done |
|---|---|
| **Market Researcher** | "Test concept before committing to a $50k real panel" |
| **Product Manager** | "Which feature message resonates with Gen Z vs. Millennials?" |
| **Brand Strategist** | "How does our brand narrative land in the Southeast vs. Pacific NW?" |
| **UX Researcher** | "Pre-validate survey instrument — are my questions ambiguous?" |
| **CX Program Manager** | "Baseline: how would customers in segment X react to this policy change?" |
| **Innovation Team** | "Rapid iteration on 10 concepts without 10 real studies" |
| **Sales Enablement** | "What objections would CFOs at mid-market SaaS companies raise?" |

---

## Industry Landscape (2025–2026)

The space is moving fast. Here's where the market stands:

| Player | Approach | Weakness |
|---|---|---|
| **Qualtrics Synthetic Respondents** | GPT-4 personas via Research Core | Locked to Qualtrics ecosystem; no calibration transparency |
| **Synthetica / Replica Analytics** | Startup: panel simulation as standalone SaaS | No XM integration; isolated tool |
| **Kantar / Ipsos AI panels** | Internal R&D; not productized | Not self-serve; requires services engagement |
| **Prolific + AI augmentation** | Hybrid real+AI pilots | Early-stage; not scalable |
| **Various LLM wrappers** | Prompt personas and collect outputs | No calibration, no statistical rigor, no UX |

**The gap:** No one has built a self-serve, credit-metered, XM-native synthetic panel
product that feeds directly into an AI insight pipeline. That is exactly Experient's opening.

---

## Why Experient Is Uniquely Positioned

1. **Credits system already built** — per-respondent metering is a natural extension
2. **CrystalOS insight pipeline** — synthetic responses can feed Crystal directly,
   turning raw simulated data into structured intelligence in one flow
3. **Survey-native platform** — we already know the question types, skip logic,
   and response structures; building response simulation is a natural extension
4. **No legacy architecture debt** — we can build calibration-first from day one
5. **Mid-market focus** — our target customers can't afford traditional panels;
   this is a category-creating feature for them

---

## What Synthetic Panels Are NOT

- A replacement for all human research (high-stakes decisions still need real respondents)
- A way to generate fake positive reviews or biased data on demand
- A substitute for real behavioral data (transactions, clickstream, support tickets)
- 100% accurate prediction of any individual's response

**We must be opinionated about this.** Every synthetic study should auto-generate a
methodology disclosure that sets accurate expectations. Trust is the product.

---

## Documents in This Folder

| File | Contents |
|---|---|
| `README.md` | This primer — what synthetic panels are and why they matter |
| `BRAINSTORM.md` | Multi-persona brainstorm: XM scientist, PM, customer, AI engineer |
| `ARCHITECTURE.md` | Technical architecture — what to build, where, in what order |
