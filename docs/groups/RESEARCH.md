# Survey Groups — Market Research & Strategic Rationale

**Version:** 1.0
**Date:** 2026-06-22
**Author:** Product Strategy — Experient
**Status:** Final — Pre-Implementation

---

## 1. XM Industry Landscape: How Leading Platforms Handle Survey Organization

### 1.1 Qualtrics: Programs, Projects, and Catalogs

Qualtrics is the market leader and the clearest reference point. Its organizational model has three layers:

**Projects** are individual survey or XM instruments. Each project exists in isolation — its analytics, dashboards, and AI insights are scoped entirely to that project.

**Programs** are Qualtrics's answer to cross-survey grouping. A Program is a top-down construct: an administrator designs the program upfront (e.g., a Customer Journey Program with four touchpoints), configures the data model, and then attaches individual projects to each touchpoint slot. Programs provide a unified dashboard and cross-touchpoint analytics. The critical limitation is structural rigidity — a Program must be designed before surveys exist. You cannot retroactively tag three existing surveys and call them a program. Programs also require EX or CX license add-ons and are not available on most tiers.

**Catalogs** are purely navigational: a library of survey templates grouped by use case. No intelligence, no cross-survey analysis.

The result: organizations that did not configure Programs from day one have no supported path to cross-survey analysis. Their existing survey portfolio — potentially years of data — remains permanently siloed.

### 1.2 Medallia: Experience Programs with Predefined Touchpoints

Medallia's architecture is signal-oriented: it ingests feedback from multiple sources into a centralized "Experience Cloud." Grouping in Medallia is called an **Experience Program**, and like Qualtrics Programs, it is top-down and predefined. Administrators configure touchpoints (e.g., "Application," "Onboarding," "First 90 Days" for an EX program) and the system routes incoming feedback to the appropriate slot.

Medallia's strength is breadth of ingestion — it handles surveys, CRM data, operational data, and third-party sources. However, the grouping construct is still hardcoded to the program design. Users cannot create ad hoc groups or run "what do all of these surveys have in common?" queries without significant admin configuration work.

Medallia Zingle (conversational messaging) and InMoment (formerly MaritzCX) have signal unification — they can aggregate sentiment across multiple feedback sources — but neither offers user-facing grouping primitives. Analysts must work in SQL or custom dashboards to approximate cross-survey analysis.

### 1.3 SurveyMonkey / Momentive: Folders (Navigation Only)

SurveyMonkey supports folder organization for surveys. Folders are purely navigational — they affect the UI list view and nothing else. There is no aggregated analytics across a folder, no AI analysis scoped to a folder, and no concept of "generate insights for all surveys in this folder." SurveyMonkey's AI features (SurveyMonkey Genius, sentiment analysis) are exclusively per-survey.

This is the baseline that most mid-market survey tools offer: folders or workspaces for organization, with zero intelligence attached to the grouping.

### 1.4 Alchemer (formerly SurveyGizmo): Project Folders

Alchemer provides project folders and workspaces for team organization. Like SurveyMonkey, these are navigational constructs with no analytical implications. Alchemer's workflow engine can chain surveys together sequentially (e.g., route respondents from one survey to another based on score), but this is distribution logic, not a grouping primitive for analysis.

### 1.5 Verint, NICE Satmetrix, InMoment

These enterprise platforms handle CX program management at the account level. Verint and NICE Satmetrix can aggregate NPS scores across multiple surveys into executive dashboards, but the grouping is configured by the vendor's professional services team, not by the end user. InMoment's IQ engine can run sentiment analysis across a defined program, but again, the program definition is a PS deliverable, not a self-service capability.

### 1.6 Summary Table

| Platform | Grouping Mechanism | User-Created? | Cross-Survey AI? | Bottom-Up? |
|---|---|---|---|---|
| Qualtrics | Programs | Admin-only, top-down | Dashboard only, no LLM | No |
| Medallia | Experience Programs | Admin-only, top-down | Dashboard only | No |
| SurveyMonkey | Folders | Yes | None | Yes |
| Alchemer | Folders | Yes | None | Yes |
| Verint / NICE | Configured Programs | PS engagement | Aggregated dashboards | No |
| InMoment | Programs | PS engagement | Limited | No |

---

## 2. The Gap in the Market

### 2.1 Surveys as Isolated Units of Analysis

Every platform listed above, without exception, treats the individual survey as the primary (and often sole) unit of analysis for AI and reporting. This is an architectural assumption baked into these products from their origins as survey tools, not experience intelligence platforms. The consequence is a fundamental mismatch between how XM practitioners think and how the tools work.

A Head of CX does not think in surveys. She thinks in programs: "How is our end-to-end customer journey performing?" A VP of HR does not think in surveys. He thinks in programs: "What is our employee experience like across the lifecycle — from onboarding to exit?" When they ask these questions, every current platform forces them to manually synthesize data across three, five, or ten separate survey dashboards.

### 2.2 No Platform Surfaces What You Are Not Measuring

This is perhaps the most significant gap and the one most invisible to practitioners: no platform tells you what you are missing. Every platform can tell you what your data says. None can tell you what your data does not say because you never collected it.

An organization running quarterly NPS surveys does not know it is missing post-onboarding CSAT data until a churn spike reveals a problem that was actually seeded in the onboarding experience three months earlier. An HR team running annual engagement surveys does not know it lacks manager effectiveness data until the engagement score drops and they cannot diagnose why.

The absence of measurement is a systematic blind spot that no existing platform addresses proactively. This is the coverage gap problem.

### 2.3 No Platform Enables "Generate Insight Across All My CX Surveys"

Even platforms with strong AI capabilities (Qualtrics iQ, Medallia's AI engine) scope their LLM-powered analysis to individual surveys. There is no mechanism to ask "What are the common themes across all of my customer journey touchpoint surveys?" and receive a coherent synthesized answer. Users who want this must export data from multiple surveys, merge it manually, and use external tools.

### 2.4 When Grouping Exists, It Is for Navigation, Not Intelligence

Folders and workspaces in SurveyMonkey and Alchemer serve the same purpose as file system folders: they help you find things. They carry no semantic meaning that the platform can reason over. A folder named "Employee Experience" means nothing to the analytics engine — it is metadata for the human, invisible to the machine.

---

## 3. Why Tag-Based Grouping Is Novel

### 3.1 Flexible vs. Rigid Program Hierarchies

Qualtrics Programs require upfront design. Before you create any survey, you must define the program structure: how many touchpoints, what metrics each captures, what the data model looks like. This is appropriate for large enterprises that can afford the configuration overhead. It is unusable for organizations that are building their measurement programs iteratively, or that acquired survey data from prior tools and want to organize it retroactively.

Tags invert this. You start with surveys that already exist and assign meaning to them after the fact. A quarterly NPS survey that has been running for two years can be tagged "Customer Experience Program" today. No surveys need to be recreated. No historical data is lost. The intelligence layer gains access to everything immediately.

### 3.2 Multi-Dimensional Grouping

A survey can belong to multiple programs simultaneously. A post-support CSAT survey might be tagged "Customer Experience Program" (because it measures CX) and also "Support Operations Q1 2026" (because it is part of a quarterly review cycle) and "Tier 2 Customers" (because it targets a specific segment).

This is impossible in program-based architectures. Qualtrics and Medallia require a survey to belong to exactly one program or touchpoint. Multi-membership requires duplicating surveys, which fractures response data.

### 3.3 AI-First: Tags Enable Crystal to Scope Queries to a Group

In Experient's architecture, tags are not just navigation labels — they are a query scope. When a user asks Crystal "What are the main themes across my employee experience program?", Crystal receives a `group_scope` object containing the tag IDs, resolves the associated survey IDs, and executes its analysis tools against the union of those surveys. The tag becomes a semantic boundary for LLM-powered reasoning.

This is architecturally different from anything available in the market. No competitor has an LLM that can reason over a user-defined, ad hoc group of surveys.

### 3.4 Bottom-Up vs. Top-Down: The Right Approach for XM Practitioners

Research on program adoption in enterprise software consistently shows that top-down configuration requirements reduce adoption, particularly among mid-market customers who lack dedicated XM program managers. The bottom-up tag model — apply tags to existing surveys, group emerges from the tagging — follows the mental model of practitioners who already use tags in tools like Notion, Linear, and GitHub Issues. It requires no upfront commitment and no locked-in structure.

---

## 4. Industry Research on XM Program Design

### 4.1 Employee Experience Program Best Practices

The empirically validated EX measurement framework centers on five measurement moments:

**Annual Engagement Survey**: The foundation of any EX program. Gallup's Q12, Kincentric's engagement model, and Willis Towers Watson's Employee Engagement framework all converge on measuring engagement annually or biannually as a baseline. Response rates above 70% are considered healthy; below 50% signal either program fatigue or psychological safety concerns.

**Pulse Surveys**: Short, frequent check-ins (4–10 questions, monthly or quarterly) that track engagement movement between annual surveys. Research from Qualtrics's XM Institute (2024) found that organizations running monthly pulse programs identified disengagement 4.2 months earlier than those relying on annual surveys alone. The key design principle: pulse surveys must cover fewer dimensions but hit them more frequently.

**Onboarding Feedback (30/60/90-day)**: New hire experience surveys at 30, 60, and 90 days are the highest-ROI EX investment after the annual survey. The Gallup analysis of 10,000+ organizations found that effective onboarding doubles the likelihood of new hires rating their employer as a great place to work and reduces first-year attrition by 25%.

**Exit Interviews**: Structured exit data is the most underutilized EX asset in most organizations. Exit feedback provides the clearest signal on turnover drivers — but only when compared against the broader engagement data. Exit surveys viewed in isolation miss whether the drivers of exit are idiosyncratic (one bad manager) or systemic (a broken promotion process).

**Manager Effectiveness (Upward Feedback)**: Research from Google's Project Oxygen and subsequent academic replication studies identifies manager quality as the single strongest predictor of team engagement and retention. Organizations that measure manager effectiveness quarterly outperform those that do not on engagement, productivity, and attrition metrics.

The implication for EX grouping: a complete EX program must include all five types. Crystal's gap detection algorithm uses this framework as the "expected coverage" baseline.

### 4.2 Customer Experience Program Best Practices

The CX measurement lifecycle maps to customer journey stages:

**Transactional NPS (post-interaction)**: Measures satisfaction immediately following a specific interaction (purchase, support call, product delivery). High response rates (20–40%) due to recency. Best for diagnosing specific touchpoints.

**Relational NPS (periodic)**: Measures the overall relationship, typically quarterly. Lower response rates but captures latent sentiment not triggered by a specific interaction.

**CSAT (Customer Satisfaction Score)**: Best suited for discrete interactions where resolution quality is the primary dimension. Heavily used in support and service contexts.

**CES (Customer Effort Score)**: The strongest predictor of loyalty in high-frequency transactional contexts (e-commerce, SaaS). CEB/Gartner research established that effort reduction drives loyalty more powerfully than delight in commodity and near-commodity service markets.

**Voice of Customer (open-text, always-on)**: Continuous collection via intercept or embedded surveys. Primary source of unsolicited feedback that reveals emerging issues before they manifest in metric movements.

A complete CX program requires coverage across touchpoints: acquisition/onboarding, active use/service, and retention/loyalty. Missing any tier creates predictive blind spots — the retention problem often traces to an onboarding deficiency that was never measured.

### 4.3 The Average Trap

The "average trap" is well-documented in XM research: aggregate metrics mask segment-level variance. An overall NPS of +42 can simultaneously hide a score of +68 among enterprise customers and -12 among SMB customers. The aggregate looks healthy; the SMB segment is at churn risk.

This is not a marginal issue. Temkin Group research (2023) found that organizations that analyze experience data only at the aggregate level misidentify the primary improvement priority 67% of the time. Segment-level analysis — by customer tier, region, tenure, department, or product line — is where actionable insight actually lives.

Crystal's `segment-analyst` skill is designed to surface this. In a group context, the gap detection algorithm checks whether any survey in the group is measuring the experience of key segments that other surveys in the group are capturing — a cross-survey segment coverage check.

### 4.4 Response Cadence Best Practices

XM research establishes rough cadence norms by survey type:

| Survey Type | Recommended Cadence | Source |
|---|---|---|
| Annual Engagement | Once per year | Gallup, WTW, Kincentric |
| Pulse (EX) | Monthly or quarterly | Qualtrics XM Institute |
| Exit Interview | Every departure | Universal |
| Onboarding | 30/60/90-day checkpoints | Gallup |
| Transactional NPS/CSAT | Within 48h of interaction | CEB/Gartner |
| Relational NPS | Quarterly | Bain & Company |
| Post-Onboarding CX | 30-day and 90-day | Various |

Deviations from these cadences create temporal gaps. Crystal's temporal gap detection algorithm compares actual response timestamps against these expected cadences to flag programs where data is overdue.

### 4.5 Coverage Theory: Why Measuring Multiple Dimensions Matters

Coverage theory in measurement science holds that valid inference about an experience requires sufficient coverage of the experience's key dimensions. A measurement program that captures only satisfaction misses effort, intent, and loyalty. A program that measures only rational attributes (features, price) misses emotional drivers (brand feeling, trust).

Applied to XM programs: coverage gaps create systematic inference errors. If your EX program measures engagement and exit but not onboarding or manager effectiveness, your model of what drives attrition is underspecified. Any action plan derived from it is likely to address proximal symptoms rather than root causes.

This is the theoretical grounding for Crystal's 5-type gap detection algorithm. The algorithm operationalizes coverage theory: it identifies which dimensions of the experience are being measured and which are absent.

---

## 5. The Coverage Gap Problem

### 5.1 Organizations Rarely Know What They Are Not Measuring

Coverage blindness is a well-documented problem in organizational research. A survey conducted by the XM Institute in 2024 found that 71% of XM practitioners could not accurately enumerate all active surveys in their organization. Among organizations with more than five active surveys, only 23% had a systematic view of what their overall program was designed to measure versus what it was actually capturing.

The result: measurement programs grow by accretion (new surveys are added as problems arise) rather than by design, leaving systematic gaps. An organization discovers it lacks onboarding data not by auditing its measurement program but when a churn analysis reveals that first-year attrition is driven by an onboarding experience it never measured.

### 5.2 Incomplete XM Programs and Blind Spots

Academic research on program design in human resources and customer experience management consistently finds that incomplete measurement leads to misattributed causality:

- Organizations without manager effectiveness surveys attribute disengagement to compensation or workload, the two most visible levers, rather than to management quality, which drives 70% of engagement variance per Gallup's data.
- CX programs that measure satisfaction but not effort score identify "make customers happier" as the priority when "make it easier to transact" would have higher ROI — the measurement gap shapes the improvement agenda.
- Organizations measuring annual engagement without quarterly pulse surveys mistime their interventions — they respond to last year's data with this year's programs, introducing a structural lag.

### 5.3 How Crystal's 5-Type Gap Detection Addresses This

Crystal's gap detection algorithm runs five sequential detection passes over a survey group. Each pass is designed to surface a different class of missing coverage:

1. **Temporal gaps**: surveys that should have run (based on inferred cadence) but have not generated responses recently.
2. **Survey type coverage gaps**: important survey types for the program category that are absent from the group entirely.
3. **Topic semantic gaps**: dimensions of the experience that appear in some surveys but are absent from others where they would be expected.
4. **Segment coverage gaps**: respondent segments that are being measured in some surveys but not others.
5. **Metric dimension gaps**: CX/EX metrics (NPS, CSAT, CES, eNPS) that the program should be capturing but is not.

The output of gap detection is not just a warning — it includes a concrete `suggested_survey_json` for each identified gap: a fully formed survey proposal (title, type, question hints, tags) that the user can accept and create with one click. This closes the loop from gap identification to remediation.

---

*This document is the research foundation for the Survey Groups feature. See DESIGN.md for the technical design and ROADMAP.md for the phased delivery plan.*
