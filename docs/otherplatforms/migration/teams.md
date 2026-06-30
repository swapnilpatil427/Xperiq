# Team & Discovery

**Status:** Team assembled · Discovery synthesis complete · Discovery → Design
**Date:** 2026-06-29
**Owners:** Lena Vasquez, Hana Kim, Maya Chen

> **What this is.** The roster, seniority bar, and operating model for **Prism** —
> universal experience-data ingestion & migration into Xperiq — plus the **Discovery**
> findings from five enterprise buyers currently on incumbent platforms. Personas are
> illustrative composites (not real individuals). For the spectrum thesis see
> [`strategy-and-operating-modes.md`](./strategy-and-operating-modes.md); for the full
> doc set see [`README.md`](./README.md).

---

## 1. The bar & mandate

Experience-data migration is where most XM platform switches **die** — the incumbent owns
the data gravity (survey definitions, response history, contact directories, text-analytics
taxonomies, and the *trust* that NPS/CSAT/CES are computed the same way every quarter). So
the bar is one line: **a customer should switch to Xperiq without losing a single data
point, a single trend line, or a single night of sleep — and see better insight on day one
than on the platform they left.** We hired for three scarce capabilities: people who have
lived inside the incumbents, people who have built correctness-critical planet-scale
ingestion, and people who can make it feel like one calm flow.

---

## 2. The roster

| Persona | Role | Net-new? | Why on Prism |
|---|---|---|---|
| **Lena Vasquez** | Executive Sponsor / VP Platform & Ingestion | | Owns the bet; holds the "no data loss, no trust loss" line |
| **Anders Holm** | Distinguished Engineer / **Chief Architect** | **net-new** | Owns the adversarial [`architecture-review.md`](./architecture-review.md); final say on whether the design is *right* before full build |
| **Naomi Bergström** | **CMO** / GTM Lead | **net-new** | Owns marketing strategy + competitive-displacement category creation |
| **Raj Desai** | **VP Sales** — Competitive Displacement | **net-new** | Owns the enterprise rip-and-replace motion + funded-migration play |
| **Marcus Adeyemi** | Group Product Manager (Prism) | | Ex-PM of an incumbent's import/export + directory; knows where migrations break |
| **Priya Raghunathan** | Principal TPM / Program Lead | | Turns a multi-quarter program into dated, de-risked milestones + cutover runbooks |
| **Sofia Lindqvist** | Director, Migration Services (ex-Qualtrics PS) | | Owns the Qualtrics playbook: Survey Definitions, Response Export, XM Directory |
| **Daniel Okafor** | Principal Migration Architect (ex-Medallia) | | Owns the Medallia / locked-in-platform playbook (export-first, model re-derivation) |
| **Hana Kim** | Lead CX Consultant (ex-big-4) | | Represents the buyer; defines what "trustworthy migration" means to a CXO |
| **Tomás Rivera** | Onboarding & Enablement Lead | | Owns the self-serve long tail (SurveyMonkey/Typeform/Forms) that needs *zero* services |
| **Yuki Tanaka** | Senior PM, Connectors | | Owns the connector framework + source catalog roadmap |
| **Aisha Bello** | Senior PM, Insight Continuity | | Owns "our insight strategy on their data" — metric parity, taxonomy mapping |
| **Elena Rossi** | Principal Product Designer | | Owns the end-to-end migration flow UX; guardian of Xperiq design standards |
| **Jonah Pratt** | Staff UX / Interaction Designer | | Owns dry-run/preview/reconciliation interactions + trust affordances |
| **Maya Chen** | UX Researcher | | Validates the flow with real migration admins; owns the research loop |
| **Dr. Wei Zhang** | Principal AI Engineer (CrystalOS) | | Owns AI-assisted field mapping, taxonomy reconciliation, CrystalOS migration skills |
| **Olu Familusi** | Senior ML Engineer, Enrichment | | Owns re-enrichment so legacy verbatims reach Xperiq insight parity |
| **Karthik Nair** | Principal Distributed Systems Engineer | | Owns the ingestion engine: queues, workers, idempotency, backpressure, resumability |
| **Sara Müller** | Staff Backend Engineer (Connectors) | | Owns the connector SDK + source adapters (OAuth, rate limits, pagination) |
| **Diego Fernández** | Senior Data Engineer | | Owns normalization, staging→canonical transform, reconciliation reports |
| **Grace Mbeki** | Staff SRE / Operational Engineer | | Owns job observability, retries, alerting, run health |
| **Anton Petrov** | Senior Platform Ops Engineer | | Owns credential lifecycle, tenant isolation, ingestion cost guardrails |
| **Rebecca Stern** | Principal Security Engineer | | Owns security architecture: secrets, PII, residency, audit, ToS guardrails |
| **Faisal Rahman** | Privacy & Compliance Counsel (advisory) | | Owns the legal posture for public-review ingestion (what we may store per ToS) |

---

## 3. Operating model & RACI

- **Cadence.** 2-week design sprints; weekly architecture review (Karthik + Elena); a
  standing **Trust Council** (Sofia, Daniel, Rebecca, Aisha) signs off on anything touching
  metric parity, data fidelity, or legal posture.
- **Decision records.** Every contested decision is an ADR; dissent is recorded, not erased.
- **Connector definition of done.** Ships only when it satisfies the closed-loop seam
  (skill → contract → handler → outcome — root `CLAUDE.md`) **and** passes a reconciliation
  test (counts + checksums match source) **and** has a documented legal posture.
- **The one rule that overrides everything.** *No silent transformation.* Every mapping,
  re-computation, or dropped field is shown in a dry-run diff before anything is written.

| Workstream | Responsible | Accountable | Consulted |
|---|---|---|---|
| Source catalog & connectors | Yuki, Sara | Marcus | Sofia, Daniel, Tomás |
| Ingestion engine & scale | Karthik, Diego | Lena | Grace, Anton |
| Field & taxonomy mapping (AI) | Wei, Olu | Marcus | Diego, Aisha |
| Insight / metric continuity | Aisha | Marcus | Sofia, Daniel, Wei |
| Migration UX | Elena, Jonah | Marcus | Maya, Tomás |
| Security / privacy / legal | Rebecca, Faisal | Lena | Anton, all PMs |
| Program / cutover | Priya | Lena | everyone |
| GTM / displacement | Naomi, Raj | Lena | Marcus, Sofia |

---

## 4. Discovery

**Method.** Five in-depth interviews (60–90 min) with enterprise buyers currently on
competitor platforms, recruited by the Migration Services team and synthesized into the
requirements below. Profiles are composite/anonymized.

### 4.1 The cohort

| # | Profile | Industry | Incumbent stack | Role | One punchy quote |
|---|---|---|---|---|---|
| C1 | Global retail bank (40M customers) | Financial services | Qualtrics (CX + EX) | VP, Customer Experience | *"If the trend line breaks at the migration date, my board deck breaks. That's a non-starter."* |
| C2 | Regional health system (12 hospitals) | Healthcare | Medallia | Director, Patient Experience | *"Getting data **out** of Medallia is the hard part. It's not a button."* |
| C3 | B2B SaaS scale-up (1,200 employees) | Technology | SurveyMonkey + Typeform + Forms | Head of CS Ops | *"Honestly if it's not self-serve I won't do it. I'm not booking a services call to import a Typeform."* |
| C4 | Public university system (5 campuses) | Education | Qualtrics + Google Forms | Director, Institutional Research | *"Course evals are semester-anchored. Fall 2023 must stay Fall 2023, or every longitudinal study is wrong."* |
| C5 | Restaurant group (300+ locations) | Hospitality | Google + Yelp + CX vendor (SMG-class) | SVP, Ops & Guest Experience | *"I want the reviews **in** the platform so I can ask Crystal 'what's going wrong in Dallas.' Just don't get me sued for scraping."* |

### 4.2 The headline finding

> **Nobody fears the new platform. Everybody fears the move.**

The blocker to switching was never "is the destination good enough" — it was *"I cannot put
six years of NPS in a spreadsheet and pray."* Migration risk, not product gap, keeps the
incumbent in place. This validates Prism as a **wedge product**, not a feature.

### 4.3 Cross-cutting requirements (ranked by frequency × intensity)

| # | Requirement | Raised by | Prism response |
|---|---|---|---|
| R1 | **History continuity** — original timestamps, unbroken trend lines | C1, C2, C4 | Continuity is sacred; import preserves `original_at` |
| R2 | **Metric parity** — NPS/CSAT computed identically; *prove it* | C1, C2 | Parity check + dry-run diff |
| R3 | **Getting data OUT is the hard part** | C1, C2 | Async export-poll + file fallback ([`source-platforms-catalog.md`](./source-platforms-catalog.md)) |
| R4 | **Self-serve, no services call** (mid-market) | C3, C5 | Self-serve tier + guided wizard |
| R5 | **Taxonomy / topic continuity** | C2 | Taxonomy mapping + re-enrichment |
| R6 | **Contact directory + embedded data + dedup** | C1, C3 | Contact / identity resolution in mapping |
| R7 | **Signals, not just surveys** | C2, C5 | Reviews/calls map to the existing `Signal` model |
| R8 | **Compliance / residency / ToS / no scraping** | C1, C2, C4, C5 | Compliant by construction ([`security-compliance.md`](./security-compliance.md)) |
| R9 | **A signed reconciliation report** for audit | C1 | Reconciliation report artifact at cutover ([`operations-runbook.md`](./operations-runbook.md)) |
| R10 | **Unify everything so Crystal can reason across it** | C5, C3 | The whole point — feeds the unified analytics layer |

### 4.4 Anti-requirements (explicitly *not* asked for)

- **Pixel-perfect survey re-creation** — buyers want data + logic fidelity, not the old theme. (Cuts scope.)
- **Two-way sync** — nobody wanted bidirectional incumbent sync; they want a clean, dated cutover. (One-way review/signal sync *is* wanted.)
- **Cloning the incumbent's dashboards** — they want *the insight* the Xperiq way, not their old dashboards reproduced.

### 4.5 Implications for design

1. **Lead with trust, not speed** — the hero of the UX is the dry-run diff + reconciliation, not a progress bar.
2. **Two doors, one engine** — self-serve wizard and services-guided flow share the same ingestion engine and contracts ([`architecture-ingestion.md`](./architecture-ingestion.md)).
3. **Continuity is a hard constraint** — timestamp + metric parity are acceptance criteria, not stretch goals.
4. **Signals are first-class** — reviews/calls/tickets ride `Signal`; surveys ride `Response`; both unify for Crystal.
5. **Compliance gates the catalog** — a source ships only with a documented legal posture; reviews are API-only.

> Phasing, contracts, and CrystalOS migration skills that act on these requirements are in
> [`engineering-plan.md`](./engineering-plan.md).
