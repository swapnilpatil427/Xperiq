# Experient — Market Gaps & Strategic Pitfalls

**Version:** 1.0  
**Date:** 2026-06-03  
**Status:** Living document — updated by Crystal XM Market Intelligence skill  
**Owner:** Product & Strategy  
**Review cadence:** Monthly (Crystal auto-updates; human review quarterly)

> This document is the honest answer to "what would still leave us behind?"  
> It is maintained by the `xm-market-researcher` and `platform-gap-tracker` Crystal skills.  
> Do not delete gaps when features ship — mark them `[CLOSED vX.X - date]` so we preserve the history.

---

## Gap Severity Legend

| Symbol | Severity | Meaning |
|--------|----------|---------|
| 🔴 | **Critical** | Blocks enterprise deals today; customers walk away |
| 🟠 | **Major** | Loses 30%+ of deals to competitors who have it |
| 🟡 | **Significant** | Material disadvantage; overcome-able with positioning |
| 🟢 | **Minor** | Nice-to-have; rarely deal-breaking |

---

## Section 1: Compliance & Trust (Deal-Blockers)

### GAP-001 🔴 SOC 2 Type II Certification
**Status:** Open  
**Opened:** 2026-06-03  
**Competitor who has it:** Qualtrics ✓, Medallia ✓, InMoment ✓, Confirmit ✓  
**What it means:** Enterprise procurement in any regulated industry (finance, healthcare, insurance, government) has a mandatory checkbox for SOC 2 Type II. Without it, Experient cannot pass vendor security reviews and deals stall at procurement — regardless of features.  
**Timeline to close:** 6–12 months minimum (audit period + remediation)  
**Action required:** Engage a SOC 2 auditor (e.g., Vanta, Drata for continuous monitoring). Begin evidence collection now. Target: Type I within 6 months, Type II within 12.  
**Revenue at risk:** Every deal > $50K ACV in financial services, healthcare, insurance, government.

---

### GAP-002 🔴 HIPAA Business Associate Agreement (BAA)
**Status:** Open  
**Opened:** 2026-06-03  
**Competitor who has it:** Qualtrics ✓, Press Ganey ✓, Medallia ✓  
**What it means:** Healthcare is the single largest XM vertical (hospitals measure patient satisfaction as a regulatory requirement via HCAHPS). No BAA = zero healthcare deals, period. Press Ganey dominates this vertical. Qualtrics is the main alternative.  
**Action required:** Legal review of data architecture. Firebase Storage and Postgres hosting must be HIPAA-eligible. Migrate to HIPAA-eligible infrastructure, execute BAA with providers.

---

### GAP-003 🟠 FedRAMP Authorization
**Status:** Open (long-term)  
**Opened:** 2026-06-03  
**Competitor who has it:** Qualtrics FedRAMP Moderate ✓  
**What it means:** Federal government contracts. Large market (~$400M XM spend in US federal agencies). Not a short-term priority but required to play in this vertical at all.  
**Timeline:** 1–3 years. Start ATO process only after SOC 2 Type II.

---

### GAP-004 🟡 GDPR Data Processing Agreement (DPA) Tooling
**Status:** Partial  
**Opened:** 2026-06-03  
**What's missing:** Automated DPA generation, data subject request portal (right to access, right to deletion across all stores: Postgres + Firebase + Bigquery), data residency controls (EU-hosted option), consent management for survey respondents.  
**Action required:** Build respondent data deletion endpoint that cascades across all stores. Add consent log table. Generate standard DPA document for enterprise contracts.

---

## Section 2: Missing Product Surface Areas

### GAP-005 🔴 Employee Experience (EX) Module
**Status:** Open  
**Opened:** 2026-06-03  
**Market size:** ~35% of total XM TAM  
**Competitors:** Qualtrics EmployeeXM, Medallia EX, Culture Amp, Glint (LinkedIn/Microsoft), Lattice, 15Five  
**What's missing:**
- 360-degree feedback (multi-rater: self, manager, peers, direct reports)
- Engagement pulse surveys (weekly/monthly cadence, 5–10 questions)
- Manager effectiveness surveys
- Onboarding experience surveys (Day 1, Day 30, Day 90)
- Exit interview programs
- eNPS correlated to business outcomes (retention, productivity, ESAT → CSAT)
- Manager coaching recommendations from 360 data (Crystal opportunity)
**Crystal opportunity:** Crystal auto-generates personalized manager coaching plans from 360 results — something no EX platform does today.  
**Priority:** HIGH. Doubles TAM without changing go-to-market motion.

---

### GAP-006 🔴 Digital / Web Intercept VoC
**Status:** Open  
**Opened:** 2026-06-03  
**Competitors:** Qualtrics Site Intercept ✓, Medallia Digital ✓, Hotjar Surveys ✓, Sprig ✓, Usabilla ✓  
**What's missing:** A JavaScript `<script>` tag that embeds a survey widget on any website. Triggered by: page visit, scroll depth, exit intent, time on page, specific URL, user segment.  
**Why it matters:** E-commerce, SaaS, media — they collect most CX feedback through in-page intercepts, not email surveys. Without a web SDK, Experient cannot sell to digital-first companies as a primary VoC tool.  
**Scope:** ~50 lines of vanilla JS embed + a widget renderer + survey delivery API. Lower technical complexity than it appears.

---

### GAP-007 🟠 Contact Center & Omnichannel VoC
**Status:** Open (schema ready, nothing built)  
**Opened:** 2026-06-03  
**Competitors:** Verint ✓, Medallia ✓, Qualtrics Contact Center ✓, NICE Satmetrix ✓  
**What's missing:**
- Post-call IVR surveys ("Press 1 to rate your experience")
- Call recording transcription + Crystal sentiment analysis
- Chat transcript analysis (Zendesk, Intercom, Salesforce Service Cloud)
- Email ticket sentiment analysis
- Agent quality scoring from customer feedback
**Note:** The data model (`Signal` collection) already anticipates this. The ingestion adapters and Crystal pipeline extensions are the work.  
**Priority:** HIGH for financial services, telco, insurance, healthcare deals.

---

### GAP-008 🟠 In-Product / Mobile SDK for SaaS Feedback
**Status:** Open  
**Opened:** 2026-06-03  
**Competitors:** Sprig ✓, Pendo ✓, Qualtrics ProductXM ✓, Survicate ✓  
**What's missing:** iOS + Android + React Native SDK. Embed NPS/CSAT/CES prompts inside mobile apps. Triggered by events (after purchase, after N sessions, after feature use).  
**Why it matters:** Mobile-first companies (fintech, retail, travel) cannot use email surveys as primary feedback. In-app is the standard.

---

### GAP-009 🟠 Statistical Research Methods
**Status:** Open  
**Opened:** 2026-06-03  
**Competitors:** Qualtrics Research Core ✓, Confirmit ✓, Forsta ✓, Alchemer ✓  
**What's missing:**
- Conjoint analysis (trade-off preference modeling)
- Max-diff / Best-Worst Scaling (prioritization research)
- Choice-Based Conjoint (product configuration research)
- Advanced statistical testing (ANOVA, t-test, regression, factor analysis)
- Statistical significance indicators on every metric (already partially mentioned in dashboard design — needs backend implementation)
- SPSS / R data export
- Sample size calculator
- Quota management (stop collecting from segment X once N responses hit)
**Priority:** MEDIUM for most markets. HIGH for academic, pharma, government, market research agencies.

---

### GAP-010 🟡 Brand Experience (BrandXM) / Market Research
**Status:** Open  
**Opened:** 2026-06-03  
**Competitors:** Qualtrics BrandXM ✓, Kantar ✓, YouGov ✓  
**What's missing:** Brand tracking studies (run same survey monthly to track brand awareness, consideration, preference over time). Consumer panel access (recruit representative samples, not just your own customers). Market research project management.  
**Priority:** LOW for now — different buyer persona (market research vs. CX teams).

---

## Section 3: Distribution & Reach Infrastructure

### GAP-011 🟠 SMS Survey Distribution
**Status:** Open  
**Opened:** 2026-06-03  
**Competitors:** Qualtrics ✓, Medallia ✓, Birdeye ✓  
**What's missing:** Send surveys via SMS (Twilio integration). Collect responses via text reply or link. High response rates for post-service surveys (auto repair, healthcare appointments, hospitality).  
**Scope:** Twilio API integration in the backend distribution system. Relatively low complexity.

---

### GAP-012 🟡 Offline / Kiosk Survey Mode
**Status:** Open  
**Opened:** 2026-06-03  
**Competitors:** Qualtrics Offline ✓, SurveyMonkey Offline ✓  
**What's missing:** iPad kiosk mode (lobby surveys, event surveys, point-of-sale). Works without internet, syncs when connected. Relevant for: retail, hospitality, events, healthcare waiting rooms.

---

### GAP-013 🟡 Email Distribution at Enterprise Scale
**Status:** Partial  
**Opened:** 2026-06-03  
**What's missing:** Contact list management (import CSV, sync from Salesforce/HubSpot), distribution history, unsubscribe compliance (CAN-SPAM, GDPR), send-time optimization, throttling for >100K sends/day, bounce handling.

---

### GAP-014 🟡 Panel Management & Sampling
**Status:** Open  
**Opened:** 2026-06-03  
**What's missing:** Quota management (stop collecting when N responses for segment X). Respondent deduplication (don't survey same person twice in 90 days). Built-in survey panel access (for when you don't have your own respondents).

---

## Section 4: Data & Intelligence Gaps

### GAP-015 🔴 Industry Benchmark Database
**Status:** Open  
**Opened:** 2026-06-03  
**Competitors:** Qualtrics (15,000 customers, 20 years of data) ✓, Medallia ✓, Satmetrix ✓  
**What's missing:** Aggregate anonymous benchmark data per industry/vertical. When a customer asks "Is our NPS of 38 good?" — Experient currently cannot answer "you're in the 62nd percentile for SaaS."  
**Why critical:** Benchmark context is one of the most-requested features in every XM platform. It provides value without the customer doing any extra work.  
**How to close:** Opt-in benchmarking consortium. Approach: ask first 100 customers to anonymously contribute. Even 50 companies per vertical creates a meaningful baseline.  
**Crystal opportunity:** Crystal auto-contextualizes every score against the benchmark — "Your NPS is 12 points above the SaaS median. Here's what the top quartile does differently."

---

### GAP-016 🟠 Longitudinal / Panel Tracking
**Status:** Open  
**Opened:** 2026-06-03  
**What's missing:** Track the same respondent across multiple survey waves over time. See how individual customer sentiment evolves. Correlate individual NPS with CLV, churn, or upsell outcomes.  
**Why it matters:** The most valuable XM insight is predicting individual customer behavior (churn, expansion) from experience data. Requires linking respondent identity across surveys + CRM.

---

### GAP-017 🟡 Financial Outcome Correlation (XM ROI)
**Status:** Open  
**Opened:** 2026-06-03  
**Competitors:** Qualtrics BusinessXM ✓  
**What's missing:** "If you improve onboarding NPS from 32 to 45, our model predicts $4.2M in reduced annual churn." Requires: CRM revenue data integration + historical NPS + churn correlation model.  
**Crystal opportunity:** Crystal could build this model from existing data if Salesforce/HubSpot revenue is connected. This is the number CFOs care about. The ultimate justification for XM spend.

---

## Section 5: Integration Ecosystem Gap

### GAP-018 🟠 Integration Ecosystem Size
**Status:** Open  
**Opened:** 2026-06-03  
**Qualtrics native integrations:** 100+  
**Experient at launch (after workflows):** ~8–10  
**Gap:** 90+ integrations  
**Priority integrations missing:**
- Salesforce (bidirectional: push NPS to contact record, pull segment data)
- SAP (large Qualtrics distribution channel — SAP owns Qualtrics)
- Workday (EX programs need HR data)
- ServiceNow (IT service management + experience correlation)
- Microsoft Dynamics + Teams (enterprise standard)
- Zendesk (support ticket ↔ CSAT correlation)
- Marketo / Pardot (marketing automation triggers)
- Snowflake / Databricks (data warehouse export)
- Intercom (in-app chat + survey trigger)

---

### GAP-019 🟡 Data Warehouse / BI Export
**Status:** Open  
**Opened:** 2026-06-03  
**What's missing:** Snowflake, BigQuery, Redshift connectors. Enterprise data teams want Experient data in their existing data warehouse for cross-system analysis (NPS + revenue + product usage).  
**Note:** BigQuery is already in the data model architecture. The export job to customer-controlled BigQuery is the gap.

---

## Section 6: AI & Crystal Gaps

### GAP-020 🟠 AI Governance & Explainability
**Status:** Open  
**Opened:** 2026-06-03  
**What's missing:** Enterprise procurement increasingly requires: AI model cards (what model, trained on what data, bias assessment), explainability reports (why did Crystal say X?), human-in-the-loop controls (require human approval before Crystal-generated actions execute), audit trail of all AI decisions.  
**Why it matters:** Finance and healthcare regulators are beginning to require AI audit trails. Early compliance = competitive advantage.

---

### GAP-021 🟡 Multi-Language Crystal Intelligence
**Status:** Open  
**Opened:** 2026-06-03  
**What's missing:** Crystal analyzing verbatims in Spanish, French, German, Japanese, Mandarin, Arabic. Sentiment analysis, topic clustering, and insight narration in non-English languages. Qualtrics supports 100+ languages including RTL.  
**Current state:** Crystal processes English verbatims. Multi-language NLP requires either multilingual models or translation layer before analysis.

---

### GAP-022 🟡 Survey Methodology Intelligence (Pre-publish)
**Status:** Open  
**Opened:** 2026-06-03  
**Competitors:** Qualtrics iQ ✓  
**What's missing:** Before a survey goes live, Crystal reviews it for: leading question bias, double-barreled questions, scale imbalance, survey length fatigue prediction, completion rate prediction, readability score.  
**Crystal opportunity:** This is entirely doable with the existing skill framework. New skill: `survey-methodology-advisor`. Low effort, high perceived value.

---

## Section 7: Operational & Go-to-Market Gaps

### GAP-023 🟠 Native Mobile Apps (iOS / Android)
**Status:** Open  
**Opened:** 2026-06-03  
**Competitors:** Qualtrics App ✓, Medallia App ✓  
**What's missing:** iOS + Android apps for: survey management on the go, push notification delivery, offline data collection, executive dashboard (read-only).

---

### GAP-024 🟡 Enterprise Report Delivery at Scale
**Status:** Partial  
**Opened:** 2026-06-03  
**What's missing:** Scheduled delivery of branded PDF reports to hundreds of stakeholders. Role-based report templates (executive, analyst, operations). White-label report covers (logo, colors from BrandContext). Report version history.

---

### GAP-025 🟡 White-Label / Multi-Tenant Partner Mode
**Status:** Open  
**Opened:** 2026-06-03  
**What's missing:** CX consulting firms and agencies that want to offer Experient under their own brand to their clients. Requires: white-label domain, custom branding per tenant, agency billing model, client management dashboard.

---

### GAP-026 🟡 Professional Services & Implementation Support
**Status:** Open  
**Opened:** 2026-06-03  
**What's missing:** Enterprise XM implementations often require professional services: survey design consulting, CX program strategy, data migration, technical integration. Qualtrics has a large professional services division. This is a revenue opportunity and a retention mechanism.

---

## Section 8: Competitive Tracker

*Last updated by Crystal XM Market Intelligence skill: 2026-06-03*

### Qualtrics (SAP) — Primary Competitor
| Capability | Qualtrics | Experient (Post-Roadmap) | Gap |
|------------|-----------|--------------------------|-----|
| Survey builder | ✓ Mature | ✓ | Parity |
| AI insight generation | ✓ iQ | ✓ Crystal (superior narration) | Experient advantage |
| Notification service | ✓ Basic | ✓ Crystal-narrated | Experient advantage |
| Alerts system | ✓ | ✓ Crystal predictive | Experient advantage |
| Dashboard | ✓ Mature | ✓ Crystal-first | Comparable |
| Workflow automation | ✓ XM Workflows | ✓ Crystal-in-workflow | Experient advantage |
| Visual AI | ✗ | ✓ | Experient advantage |
| NL chart generation | ✗ | ✓ Crystal | Experient advantage |
| EX module | ✓ Full | ✗ | Qualtrics wins |
| Web intercept SDK | ✓ | ✗ | Qualtrics wins |
| SOC 2 Type II | ✓ | ✗ | Qualtrics wins |
| Benchmark database | ✓ 20 years | ✗ | Qualtrics wins |
| Integration count | 100+ | 10 | Qualtrics wins |
| Contact center VoC | ✓ | ✗ | Qualtrics wins |
| Statistical methods | ✓ Full | ✗ | Qualtrics wins |
| Mobile app | ✓ | ✗ | Qualtrics wins |
| SMS distribution | ✓ | ✗ | Qualtrics wins |

### Medallia — Secondary Competitor
| Capability | Medallia | Experient (Post-Roadmap) | Gap |
|------------|----------|--------------------------|-----|
| Real-time signal capture | ✓ Strong | ✓ | Comparable |
| AI narration | ✗ | ✓ Crystal | Experient advantage |
| Contact center VoC | ✓ Strong | ✗ | Medallia wins |
| Digital VoC | ✓ | ✗ | Medallia wins |
| EX | ✓ | ✗ | Medallia wins |
| Workflow | Limited | ✓ Crystal-powered | Experient advantage |

### Culture Amp — EX-specific
| Capability | Culture Amp | Experient |
|------------|-------------|-----------|
| EX surveys | ✓ | ✗ GAP-005 |
| 360 feedback | ✓ | ✗ GAP-005 |
| Manager tools | ✓ | ✗ GAP-005 |
| VoC / CX | ✗ | ✓ | Experient wins |

---

## Section 9: Closed Gaps

*Items moved here when shipped. Preserve for historical record.*

| Gap ID | Description | Closed | Version |
|--------|-------------|--------|---------|
| *(none yet)* | | | |

---

## Section 10: Priority Order for Closing Gaps

Ranked by: (Revenue impact × Urgency) ÷ Effort

| Priority | Gap | Rationale | Est. Effort |
|----------|-----|-----------|-------------|
| 1 | GAP-001 SOC 2 Type II | Blocks all enterprise deals | 6–12 months |
| 2 | GAP-005 EX Module | Doubles TAM | 3–4 months |
| 3 | GAP-006 Web Intercept SDK | Opens digital-native market | 3–6 weeks |
| 4 | GAP-015 Benchmark Database | Highest-requested feature | Ongoing (data) |
| 5 | GAP-011 SMS Distribution | Quick win, high response rates | 2–3 weeks |
| 6 | GAP-002 HIPAA BAA | Healthcare vertical | After SOC 2 |
| 7 | GAP-022 Survey Methodology AI | New Crystal skill, low effort | 1 week |
| 8 | GAP-007 Contact Center VoC | Schema ready, pipeline needed | 4–6 weeks |
| 9 | GAP-018 Integration Ecosystem | Salesforce first | 2–3 weeks each |
| 10 | GAP-017 XM ROI Modeling | CFO-level selling tool | 4–6 weeks |

---

*This document is maintained by Crystal. Run `/xm-market-researcher` to trigger a competitive landscape update, or `/platform-gap-tracker` to check which gaps have been closed based on recent code changes.*
