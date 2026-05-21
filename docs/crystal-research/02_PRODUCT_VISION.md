# Crystal: Product Vision & Strategy
## Internal PM Document — Experient, Inc.

**Status:** Living Document
**Owner:** Product
**Last Updated:** May 2026
**Classification:** Internal — Do Not Distribute

---

## 1. Executive Summary

Crystal is Experient's AI-powered experience intelligence engine. It combines a conversational ReAct agent built on Anthropic Claude with an automated, streaming insight pipeline to give organizations something the existing XM market cannot provide: a persistent, context-aware AI analyst that reasons across all of their experience data in real time.

The strategic thesis is simple. The XM industry — dominated by Qualtrics and Medallia — was built around reports. Reports are static snapshots that tell you what happened. Crystal tells you what it means, why it happened, what's about to happen, and what to do about it. This is a fundamentally different product category, and it requires a fundamentally different architecture.

Crystal's market opportunity is a $12B+ global XM market whose two dominant players are currently distracted, overpriced, and under-delivering on AI. Qualtrics's $6.75B acquisition of Press Ganey and Forsta in 2025 opened an 18–24 month disruption window during which enterprise customers are reevaluating their XM contracts and mid-market organizations — historically priced out of the category — are actively looking for alternatives.

Crystal's defensibility comes from three sources: the depth of contextual AI reasoning the platform enables, the proprietary data flywheel created by running insights across hundreds of organizations, and the extensible tool-use architecture that makes Crystal more valuable as more connectors are built.

This document is the canonical strategic reference for the Crystal platform. It defines the problem space, user personas, jobs to be done, competitive position, success metrics, roadmap, and key risks. It should be read by every PM, engineer, and GTM leader working on Crystal.

---

## 2. Problem Space

### 2.1 What CX, HR, and Product Leaders Actually Struggle With

Experience management in practice looks nothing like the analyst reports describe. The market literature is full of words like "closed-loop feedback," "action planning," and "experience improvement." The reality, inside the organizations buying these platforms, is much messier.

**The insight gap.** Data is collected. Dashboards are built. Reports are generated. But the gap between "we have data" and "we know what to do" is enormous, and it is staffed entirely by human beings who are expensive, slow, and have competing priorities. The typical enterprise XM program runs a quarterly NPS report, shares it in a slide deck, and moves on. No one goes back to check whether the actions taken actually moved the number.

**The volume problem.** A mid-sized company running a quarterly customer satisfaction survey might collect 5,000 open-text responses per cycle. Nobody reads 5,000 responses. Legacy platforms offer text analytics — topic modeling, sentiment classification — but these are summary statistics, not answers. When the CMO asks "Why did our NPS drop among enterprise customers in the Southeast?" the answer is not in the dashboard. It requires someone to query the data, cross-reference segments, read representative verbatims, and synthesize a finding. At most companies, that person does not exist.

**The latency problem.** By the time a quarterly report reaches an executive, the underlying experience that drove the data has already been delivered to thousands of additional customers. Feedback loops that operate on a monthly or quarterly cadence are structurally incapable of driving real-time experience improvement. Companies discover problems at scale after those problems have already become crises.

**The integration problem.** Customer experience does not live in one system. NPS data is in Qualtrics. Support tickets are in Zendesk. Product usage is in Mixpanel. Churn signals are in Salesforce. HR engagement data is in Workday. No existing XM platform connects all of this, which means the insights that require cross-domain reasoning — "Are customers who file support tickets within 30 days of onboarding more likely to churn, and does our onboarding survey predict this?" — simply do not get answered.

**The expertise barrier.** Getting meaningful insights from Qualtrics or Medallia requires product training, statistical knowledge, and platform-specific expertise. At most organizations, only two or three people can actually operate the XM platform at an advanced level. Everyone else gets pre-built dashboards that don't answer their specific questions. The platform becomes a reporting tool for a small priesthood rather than a decision-support tool for the organization.

### 2.2 Specific Failure Modes

The following failure modes are documented from customer interviews, support forums, and competitive analysis. They are the specific, recurring ways existing XM platforms fail their users.

**Failure Mode 1: The "I Can See It But Can't Understand It" Problem.**
A frontline manager logs into Qualtrics, sees an NPS of 23 for their region, sees a trend line that looks flat, and closes the browser. They have no idea if 23 is good or bad for their industry. They have no idea which specific experiences are driving it. The platform gave them a number. It gave them no context, no comparison, no next action.

**Failure Mode 2: The Quarterly Report Cemetery.**
An entire XM program is reduced to producing a PowerPoint deck once per quarter. No one acts on it between reports. By the next report, the issues from the previous one are still unresolved and the new issues have been compounding for three months. The CX team becomes a reporting team rather than an improvement team.

**Failure Mode 3: The Insight That Never Arrived.**
A company's NPS drops six points in a single month. This is statistically significant and operationally important. The XM platform never flagged it. The CX team discovered it at the next quarterly review. The root cause — a botched product update that affected a specific customer segment — was addressable in week one. By week twelve, the affected customers had churned.

**Failure Mode 4: The Expert Exodus.**
The one person who really knows how to use Qualtrics leaves the company. The platform's value immediately drops by 80% because everyone else only knows how to read the pre-built dashboards. The institutional knowledge about how the surveys were designed, how segments were defined, and how to interpret edge cases walked out the door.

**Failure Mode 5: The ROI Phantom.**
A company pays $150K per year for Qualtrics. The CFO asks for a ROI analysis. The CX team cannot produce one. They can show survey completion rates and satisfaction scores, but they cannot demonstrate a causal link between XM investment and revenue, retention, or cost reduction. The budget gets cut.

**Failure Mode 6: The Consultant Dependency Loop.**
A company buys Medallia. Medallia recommends an implementation partner. The implementation takes six months and costs $200K in consulting fees. The resulting configuration is so customized and opaque that the company cannot change anything without hiring the consultant again. The annual cost of "owning" the platform is actually twice the license fee once consulting is included.

---

## 3. Market Opportunity

### 3.1 XM Market Size

The global experience management market was valued at approximately $12.2B in 2024 and is projected to grow at 12.4% CAGR through 2030. This figure encompasses:

- Customer Experience Management: $7.1B (dominant segment)
- Employee Experience Management: $2.8B
- Product/Digital Experience: $1.4B
- Other (market research, brand tracking, healthcare): $0.9B

The addressable market for an AI-native XM platform that spans all of these categories is larger than any single segment suggests, because Crystal creates a cross-functional platform that replaces point solutions in each category.

The mid-market segment (companies with 500–5,000 employees) is structurally underserved and represents roughly $3.2B of the total market. These organizations need enterprise-grade experience intelligence but cannot afford enterprise-grade platforms. Qualtrics's minimum contract of $50K per year, combined with implementation costs, puts them effectively out of reach. This is Experient's primary beachhead.

### 3.2 The Disruption Window: Qualtrics-Forsta Merger

In early 2025, Qualtrics completed its $6.75B acquisition of Press Ganey and the Forsta platform (formerly Confirmit/FocusVision). This is the most significant M&A event in XM history and it creates a specific, time-bounded disruption window that Experient must capitalize on.

**Why this matters strategically:**

**Product roadmap freezes.** During any major acquisition integration, engineering resources are diverted to consolidation work — migrating customers, merging data models, rationalizing duplicate features. Qualtrics's innovation roadmap for its core CX platform will slow materially during the 18–24 month integration period.

**Customer uncertainty.** Forsta customers are uncertain about their product's future. Some will be migrated to the Qualtrics platform (expensive and disruptive). Others will receive guarantees that their platform continues independently (uncertainty about investment levels). Both outcomes are anxiety-inducing for buyers. This is an active displacement opportunity.

**Qualtrics internal attention.** The operational complexity of integrating two enterprise platforms — engineering, customer success, sales, support — absorbs leadership attention that would otherwise be focused on competitive response. A well-funded challenger entering the market during this period faces a distracted incumbent.

**Pricing pressure.** The acquisition was funded by debt. Qualtrics will face pressure to demonstrate revenue synergies, which typically translates to price increases and packaging changes for existing customers. Renewal conversations that were previously stable are now contentious.

**The window closes.** By end of 2027, Qualtrics will have completed the integration, restabilized its customer base, and refocused on competitive threats. Experient needs to acquire 100+ enterprise customers and establish a recognizable brand in the XM market before that window closes. This is a three-year sprint.

### 3.3 AI Timing

The AI capability curve has reached the threshold required for genuine experience intelligence. Specifically, three capabilities that were technically infeasible in 2022 are production-ready today:

1. **Long-context reasoning.** Claude can reason across thousands of survey responses simultaneously, maintaining the full context needed to identify patterns, contradictions, and nuanced signals that statistical models miss.

2. **Tool-use (ReAct agents).** LLMs can now plan and execute multi-step analytical workflows — pulling data, running analyses, interpreting results, and synthesizing findings — without human orchestration at each step.

3. **Streaming inference.** Insights can be generated and delivered in real time as responses arrive, enabling sub-second time-to-insight for ongoing monitoring use cases.

These three capabilities, combined with LangGraph-based agent orchestration and Redis streams for real-time data movement, form the technical foundation of Crystal. No XM incumbent has deployed this architecture. The first-mover advantage in AI-native XM is available and Experient is positioned to capture it.

---

## 4. Crystal's Strategic Position

### 4.1 The Core Bet

Crystal's strategic bet is that the unit of value in XM is not a survey or a dashboard — it is an insight that drives an action. Everything else is infrastructure. Qualtrics and Medallia are very good infrastructure companies. They are poor insight companies. Crystal is an insight company first.

This reframing changes the entire product philosophy:
- Success is measured in insights acted upon, not surveys completed
- The product experience is conversational, not navigational
- The AI is the product, not a feature layered onto reports
- Time-to-insight is the primary performance metric, not survey completion rate

### 4.2 Defensible Moats

**Contextual AI depth.** Crystal's ReAct agent architecture, built on Claude with a plug-and-play tool registry, enables reasoning capabilities that bolt-on LLM features cannot replicate. As Qualtrics adds "AI-powered summaries" to its dashboard, Crystal is executing multi-step analytical workflows that span CRM data, support tickets, survey verbatims, and product usage patterns simultaneously.

**The data flywheel.** Every organization that runs Crystal contributes to a growing understanding of what "good" looks like across industries, company sizes, and program types. This benchmark data becomes a moat: Crystal can tell you not just what your NPS is, but whether it's good for a B2B SaaS company your size in your industry, and which specific drivers are below benchmark. No startup can replicate this without years of deployment data.

**Tool ecosystem.** Crystal's plug-and-play tool registry means third-party integrations make Crystal more capable. As the ecosystem grows — Salesforce connector, Zendesk connector, HRIS connectors — the value of Crystal scales non-linearly. Each new tool makes every existing customer's Crystal smarter. This is a network-effect dynamic that is hard to replicate.

**The expert colleague effect.** Crystal learns each organization's specific context: survey programs, segment definitions, organizational structure, historical baselines, known issues. Over time, Crystal becomes an institutional knowledge system that the organization cannot easily replace. This creates switching costs that are not based on data lock-in (which is extractable) but on contextual intelligence that took months to accumulate.

### 4.3 What Crystal Is Not Trying to Do

Strategic focus requires explicit exclusions. Crystal is not:

- A survey builder competing on survey design features (though it includes baseline survey capabilities)
- A market research platform (we do not compete with Qualtrics Research Core or Momentive)
- A BI/analytics platform (we do not compete with Tableau, Looker, or Mixpanel)
- An enterprise engagement platform for 100,000-employee companies (Q1–Q2 2026 focus is mid-market)

---

## 5. User Personas

### 5.1 The CX Manager

**Who they are:** A Director or Senior Manager of Customer Experience at a B2B SaaS or mid-market services company. They own the NPS program, manage 2–3 direct reports, run quarterly experience reports for the CMO, and are personally accountable for improving satisfaction scores.

**What they actually need:**
- To understand *why* scores are moving, not just *that* they are moving
- To identify the top 3–5 actionable issues to bring to the next leadership meeting
- To defend their program's ROI to a skeptical finance team
- To find specific verbatim evidence that illustrates systemic issues convincingly
- Early warning when a score is about to move so they can intervene before the data reaches the CMO

**What Crystal gives them:**
Crystal is their analyst on-demand. They can ask "Why did CSAT drop in the Enterprise segment this month?" and get a synthesized answer in seconds: the root cause, the affected customer cohort, three representative verbatim quotes, a comparison to the previous period, and a benchmark context. They can schedule automated anomaly alerts so they know within 24 hours when a metric moves outside normal range. Crystal drafts the executive summary for their monthly report. Their productivity doubles. Their job becomes about action and communication rather than data manipulation.

**Key Crystal features:** Conversational analysis, anomaly alerts, automated insight summaries, executive report drafting, verbatim evidence surfacing.

---

### 5.2 The C-Suite Executive (Chief Customer Officer, Chief People Officer)

**Who they are:** An executive accountable for customer or employee experience at the organizational level. They spend roughly 3–5% of their time looking at XM data — typically during quarterly business reviews — and need high-signal, low-noise information that connects to business outcomes.

**What they actually need:**
- Cross-program portfolio view: how is the organization performing across all experience programs simultaneously?
- Connection between experience metrics and business outcomes (retention, revenue, cost-to-serve)
- Competitive context: are our scores above or below industry benchmarks?
- Confidence that the data they see is the full picture, not a curated summary designed to minimize bad news
- The ability to ask follow-up questions in real time during a board meeting or leadership review

**What Crystal gives them:**
Crystal's org-level intelligence gives the CCO or CPO a portfolio dashboard that spans every survey program simultaneously. Crystal proactively surfaces the three most important findings per week — the things that require their attention — and suppresses everything else. When they ask "How are we doing compared to last year?" or "What's our biggest experience gap?" Crystal answers in plain language with evidence. During board prep, they can have a conversation with Crystal about the data rather than asking a junior analyst to build slides overnight.

**Key Crystal features:** Org-level portfolio intelligence, benchmark comparisons, executive briefings, board prep conversations, business outcome correlation.

---

### 5.3 The Frontline Manager

**Who they are:** A regional sales manager, store manager, customer success team lead, or department head who receives experience data about their specific area of responsibility. They typically have a Qualtrics login they never use because the platform is too complex and the dashboards don't answer their questions.

**What they actually need:**
- Simple, actionable information about their specific team, region, or account portfolio
- Context on whether their performance is normal, improving, or declining
- Specific examples of what customers or employees are saying — not statistics, actual words
- Practical suggestions for what to do differently based on the data
- No requirement to learn analytics tools or interpret statistical significance

**What Crystal gives them:**
Crystal gives the frontline manager a conversational interface they can actually use. "How is my team doing this month?" gets an answer: your satisfaction scores are above the company average, but your response time metric is in the bottom quartile. Here are three comments customers left about wait times. Crystal suggests a specific action — reviewing scheduling coverage during peak hours — based on patterns it identified in comparable teams that improved their scores. The frontline manager gets coaching from Crystal, not just data.

**Key Crystal features:** Role-filtered views, conversational Q&A, verbatim surfacing, peer benchmarking, action recommendations.

---

### 5.4 The Data Analyst / Insights Analyst

**Who they are:** A data analyst or insights specialist who is the primary technical operator of the XM platform. They build the dashboards, run the analyses, respond to ad-hoc requests, and are the bottleneck for everything analytical in the organization.

**What they actually need:**
- A force multiplier — a way to produce more and better insights without more headcount
- The ability to handle ad-hoc questions from stakeholders without spending two days pulling data
- Confidence that the AI's outputs are methodologically defensible (not hallucinated, source-citable)
- Tools to handle the statistical work they currently do manually: segment analysis, driver analysis, text analysis, trend detection
- A way to document and preserve their analytical frameworks so they're not a single point of failure

**What Crystal gives them:**
Crystal handles the 80% of requests that are variations on questions the analyst has answered before. Segment analysis, trend comparisons, sentiment breakdowns — these become instant. The analyst focuses on the 20% that requires genuine methodological innovation. Crystal's tool registry lets them extend the platform with custom analysis tools, so their unique approaches become institutionalized capabilities. They stop being a bottleneck and start being a strategic resource.

**Key Crystal features:** Advanced query interface, driver analysis, custom tool authoring, source citation and transparency, analytical audit trails.

---

### 5.5 The HR Business Partner

**Who they are:** A mid-level HR professional responsible for employee experience for a specific business unit or geography. They run engagement surveys, interpret the results for their business unit leaders, and are accountable for improving engagement scores and translating them into people programs.

**What they actually need:**
- A way to explain engagement data to business unit leaders who are not data-literate
- Specific identification of the drivers with the highest leverage for their specific team
- Comparison data: how does their business unit compare to the rest of the company?
- Connection between engagement data and business outcomes: turnover, absenteeism, performance
- Confidence in presenting findings to leaders who will push back on bad news

**What Crystal gives them:**
Crystal analyzes engagement data for the HRBP's business unit and produces a plain-language summary that the HRBP can use directly in a meeting with their VP. Crystal identifies the top three engagement drivers that, if improved, are most likely to move the overall engagement score for that specific team. It provides verbatim evidence that illustrates each driver. It shows how the business unit compares to peer units and highlights where they're above and below the company average. When the VP challenges the data, the HRBP can ask Crystal follow-up questions in real time and get evidence-backed responses.

**Key Crystal features:** Business unit benchmarking, driver importance ranking, verbatim evidence, executive-ready language generation, engagement-to-outcome correlation.

---

## 6. Jobs To Be Done

The following JTBD statements capture the fundamental motivations Crystal must serve. They are written in the JTBD format: "When [situation], I want to [motivation], so I can [outcome]."

1. **When my NPS scores change month-over-month**, I want to understand the specific causes and affected segments, so I can take targeted corrective action before the problem compounds.

2. **When I walk into a leadership meeting**, I want to be able to answer any data question about our experience programs with confidence, so I can position my team as a strategic function rather than a reporting team.

3. **When I receive thousands of open-text responses**, I want to understand the most important themes and the highest-priority issues within minutes, so I can focus human attention on what matters most.

4. **When I'm preparing for budget reviews**, I want to demonstrate a clear link between experience investment and business outcomes, so I can defend and grow my program budget.

5. **When something unexpected happens in my data**, I want to be automatically alerted with a clear explanation before anyone else notices, so I can manage the situation proactively.

6. **When a frontline manager asks me how their team is performing**, I want to give them a specific, actionable answer in under five minutes, so they can improve without requiring a full analyst engagement.

7. **When I'm evaluating a new XM platform**, I want to see value on day one without a multi-month implementation, so I can justify the investment quickly to my leadership team.

8. **When I need to benchmark our performance**, I want to know how we compare to similar organizations in our industry, so I can set realistic improvement targets and identify where we're genuinely behind.

9. **When I'm designing a new survey program**, I want to understand what questions will give me the most actionable data for my specific goals, so I don't waste respondents' time on questions that won't drive decisions.

10. **When a major experience event happens** (product outage, public criticism, policy change), I want to see the real-time impact on experience data before it shows up in formal reporting, so I can respond before the situation escalates.

---

## 7. Success Metrics

Crystal's success metrics are organized into three tiers: product quality, user value delivered, and business outcomes. Each metric has a specific definition, a measurement mechanism, and a target.

### 7.1 Product Quality Metrics

**Crystal Answer Quality Score (CAQS)**
Definition: A 1–5 rating provided by users after each Crystal interaction, weighted by interaction type (complex analytical question weighted 3x, simple factual query weighted 1x).
Measurement: In-product rating prompt shown after every 5th interaction; optional on individual interactions.
Target: Average CAQS >= 4.2 within 90 days of deployment; >= 4.5 at 12 months.
Rationale: CAQS is the primary quality signal for the AI analyst. It captures not just accuracy but relevance, clarity, and actionability from the user's perspective.

**Hallucination Rate**
Definition: The percentage of Crystal responses that contain factual claims not supported by the underlying data, as detected by automated consistency checking and spot-audit sampling.
Measurement: Automated pipeline runs a consistency check comparing every quantitative claim in Crystal's response against the source data; augmented by monthly human audit of 100 random responses.
Target: < 0.5% hallucination rate in quantitative claims; < 2% in qualitative synthesis.
Rationale: Trust is foundational. A single high-profile hallucination that leads to a bad business decision destroys the program. This metric must be tracked obsessively.

**Tool Execution Success Rate**
Definition: The percentage of agentic tool-use calls that complete without error and return a result that Crystal successfully incorporates into its response.
Measurement: Automated logging of all tool calls in the agent pipeline.
Target: >= 98% success rate at production scale.

### 7.2 User Value Metrics

**Insight Action Rate (IAR)**
Definition: The percentage of Crystal-surfaced insights that result in a logged action (an action item created, a ticket filed, a program change documented) within 14 days of the insight being surfaced.
Measurement: Action logging in Crystal's insight panel; integration with project management tools where available.
Target: >= 30% IAR at 6 months (baseline from manual insight delivery at comparable companies is approximately 8%).
Rationale: Insights that don't drive action are noise. IAR directly measures whether Crystal is producing insights with sufficient clarity and urgency to drive behavior change. A 30% IAR represents a 3.75x improvement over the baseline.

**Time-to-First-Insight (TTFI)**
Definition: The elapsed time from when a new user starts their first Crystal session to when they receive an insight they rate as actionable (CAQS >= 4).
Measurement: Tracked automatically from first login to first high-rated interaction.
Target: Median TTFI <= 8 minutes.
Rationale: TTFI is the measure of Crystal's onboarding effectiveness and its ability to deliver immediate value. If an organization has to invest significant time configuring the platform before getting value, we have failed the core promise of instant insight.

**Weekly Active Analyst Rate (WAAR)**
Definition: The percentage of licensed Crystal users who have at least one analytical interaction (beyond viewing a dashboard) in a given week.
Measurement: User activity tracking by interaction type.
Target: >= 55% WAAR at 90 days post-deployment; >= 70% at 12 months.
Rationale: Industry benchmark for enterprise SaaS is 25–35% weekly active rate. Crystal's conversational nature should drive significantly higher engagement because it replaces a workflow (running reports, asking analysts) rather than adding one.

**NPS of Crystal Users vs. Non-Users**
Definition: Net Promoter Score measured among Crystal-enabled users vs. users at the same organizations who are not using Crystal, controlling for role and seniority.
Measurement: Quarterly survey to all users and a matched control group.
Target: Crystal users report NPS of the organization's XM program that is >= 20 points higher than non-Crystal users.
Rationale: This is the most important user value metric. If Crystal users are more likely to be promoters of the XM program than non-users, it demonstrates that Crystal is meaningfully changing the value perception of experience management — which is the entire strategic bet.

### 7.3 Business Outcome Metrics

**Net Revenue Retention (NRR)**
Target: >= 115% at 24 months.
Rationale: NRR above 100% means customers are expanding their use of Crystal faster than any are churning. For a usage-based platform, this is the primary growth indicator.

**Time-to-Contract (TTC)**
Definition: Time from first sales contact to signed contract.
Target: Median TTC <= 21 days for mid-market; <= 45 days for enterprise.
Rationale: Our competitive advantage includes speed-to-value. If our sales cycle is as long as Qualtrics's, we are not executing on that advantage.

**Gross Margin**
Target: >= 75% gross margin at scale.
Rationale: AI inference costs are real. Architecture decisions that optimize for insight quality without managing compute costs will destroy unit economics. This metric ensures product decisions are made with cost awareness.

---

## 8. Competitive Differentiation Table

The following table compares Crystal against Qualtrics XM Platform and Medallia Experience Cloud across the dimensions most important to mid-market and enterprise buyers.

| Dimension | Crystal (Experient) | Qualtrics XM Platform | Medallia Experience Cloud |
|---|---|---|---|
| **Price (entry-level)** | Usage-based, no floor. Est. $500/mo for a 50-person team at moderate usage. | $50,000/year minimum. Standard tiers range $50K–$323K/year. Additional per-response charges apply (~$5/response for some survey types). | Enterprise-only. No published pricing. Estimated $50K–$250K+ based on market reports. |
| **Price (enterprise)** | Scales with usage, not with seat count or feature gates. Transparent pricing. | $150K–$323K+ for multi-product agreements. Professional services add 30–50% on top. | Typically $150K–$500K+ annually. Significant professional services dependency. |
| **Setup time** | Day one value. No implementation required. Connect data source, configure org, start asking questions. Estimated: 1–3 hours to first insight. | 3–6 months typical implementation for enterprise. Even SMB requires 4–8 weeks with Qualtrics onboarding. | 6–12 months implementation. Dedicated implementation partner required. |
| **Implementation requirement** | Self-serve. No consultant required. Onboarding wizard guides setup. | Qualtrics Professional Services or certified implementation partner required for non-trivial deployments. | Medallia-certified implementation partner required. No self-serve pathway for enterprise features. |
| **Agentic AI capability** | Native. Crystal is a ReAct agent (LangGraph + Claude tool-use) that plans and executes multi-step analytical workflows. | Limited. Qualtrics added "Qualtrics AI" (powered by OpenAI) to its platform in 2024–2025, primarily as summarization and dashboard generation. Agent orchestration is not a core architecture. | Limited. Medallia has added AI-generated summaries and sentiment classification. No documented agentic workflow capability. |
| **AI model** | Anthropic Claude (Sonnet 4.x). Top-tier reasoning, 200K context window, strong qualitative analysis. | OpenAI GPT-4o (as of 2025). Primarily used for summarization. | Unspecified/proprietary models for classification; third-party LLMs for generative features. |
| **Real-time streaming insights** | Native. Redis streams pipeline delivers insights as responses arrive. Sub-second latency from response submission to insight generation. | No. Qualtrics insight pipelines operate on batch schedules (typically daily or weekly). Real-time dashboards update on a polling basis, not streaming. | No. Medallia processes data in batches. "Real-time" features refer to dashboard updates, not streaming insight generation. |
| **Tool extensibility / integrations** | Plug-and-play tool registry. Crystal agents can call any registered tool: Salesforce, Zendesk, HRIS, custom APIs. New tools extend Crystal's reasoning without platform changes. | Integration library (~500 integrations). Data flows into Qualtrics but cross-system reasoning is not automated. | Integration ecosystem exists but is implementation-heavy. Cross-system analysis requires custom development. |
| **Org-level portfolio intelligence** | Native. Crystal reasons across all surveys, programs, and time periods simultaneously at the org level. Ask org-level questions, get org-level answers. | Partial. Qualtrics XM Discover (formerly Clarabridge) provides cross-channel analysis but is an add-on product with separate pricing. | Partial. Medallia offers portfolio views but cross-program AI synthesis is limited. |
| **Context-aware reasoning** | Crystal knows whether you're asking at org level, survey level, or topic level and adjusts its reasoning and response accordingly. | No. Qualtrics presents context-neutral dashboards; users must self-navigate to the right level. | No. Medallia views are hierarchical but not dynamically context-aware for AI reasoning. |
| **Benchmark access** | Built-in industry benchmarking grows with platform usage. Opt-in anonymized benchmarks across Crystal customers by industry, company size, and program type. | Qualtrics BenchmarkXM — available at additional cost. Industry benchmarks from XM Institute. Not real-time. | Medallia Benchmarks — available for enterprise customers. Limited self-serve access. |
| **SMB / mid-market accessibility** | Core target market. Crystal is designed for organizations that cannot afford or staff legacy XM platforms. | Not a priority. Qualtrics actively moved upmarket post-SAP acquisition. SMB features are limited and underinvested. | Not accessible. Medallia's minimum contract effectively excludes organizations below 1,000 employees. |
| **Conversational interface** | Primary interface. Crystal is conversational-first. You ask questions in natural language and Crystal answers. | Secondary feature. Qualtrics added a natural language query tool but it is not the primary interface and has significant limitations. | Limited. Medallia has some NLP-driven search but conversational AI is not a core use case. |
| **Time-to-insight** | Target: < 8 minutes to first actionable insight for new users. | Estimated: Days to weeks for first meaningful insights after implementation. | Estimated: Weeks to months after implementation. |
| **Hallucination controls** | Built-in consistency checking. Every quantitative claim in a Crystal response is validated against source data before delivery. Audit trail available. | Unknown. No published methodology for AI response validation. | Unknown. No published methodology. |
| **Data ownership and portability** | Customer owns their data. Export in standard formats at any time. No lock-in by design. | Qualtrics owns the platform; data export available but the data model is proprietary. | Medallia data is exportable but integration into other systems is non-trivial. |

---

## 9. Roadmap Phases

### Phase 1: Survey-Level Deep Intelligence (Current — Q2 2026)

**Theme:** Go deep before going wide. Prove that Crystal can produce genuinely superior insights on a single survey program before building portfolio-level features.

**Target customer:** A CX Manager or HR Business Partner running 1–3 survey programs who needs better insights and cannot afford an analyst team.

**Core deliverables:**

- Crystal conversational agent (Claude + LangGraph + tool registry) — production-quality conversational analysis on any survey in the system
- Automated insight pipeline — anomaly detection, sentiment shifts, topic emergence, response volume alerts via Redis streams
- Insight panel with action logging — surface insights, capture actions, measure IAR
- Verbatim evidence surfacing — every Crystal claim links to the supporting verbatims
- Basic benchmark library — NPS, CSAT, CES benchmarks by industry
- Integration: native survey data ingestion; webhook support for external survey platforms (Typeform, SurveyMonkey)
- Crystal quality loop — CAQS rating, hallucination detection pipeline, feedback incorporated into model fine-tuning queue

**Success criteria for Phase 1 completion:**
- 25+ paying customers with avg contract value >= $500/month
- CAQS >= 4.2
- TTFI <= 8 minutes (median)
- IAR >= 25%
- Zero hallucination incidents reported as consequential by a customer

---

### Phase 2: Org-Level Portfolio Intelligence (Q3–Q4 2026)

**Theme:** Crystal becomes the organization's experience brain, not just a single-program analyst.

**Target customer:** A CCO or CPO at a company running 5–20 active experience programs who needs unified intelligence across all of them.

**Core deliverables:**

- Org-level Crystal agent — cross-program reasoning, portfolio-level questions ("How is employee experience correlated with customer experience trends?")
- Program portfolio dashboard — automated weekly briefing across all active surveys and programs
- Cross-program driver analysis — identify which factors are moving multiple programs simultaneously
- Role-based Crystal views — CCO gets portfolio view; frontline manager gets team view; same underlying AI, different contextual framing
- Advanced benchmark expansion — competitive benchmarks by industry, region, company size (powered by Crystal data flywheel)
- Enhanced integrations: Salesforce (link CX data to account health), Workday (link EX data to HRIS attributes)
- Benchmark contributor program — anonymized benchmark data contribution in exchange for richer benchmark access

**Success criteria for Phase 2 completion:**
- 5+ enterprise customers (>1,000 employees, >$2,000/month ACV) actively using org-level features
- CCO/CPO weekly engagement rate >= 40%
- Cross-program insights rated >= 4.3 CAQS
- NPS of Crystal users >= 20 points above non-Crystal users at same organization

---

### Phase 3: Predictive and Closed-Loop Intelligence (Q1–Q2 2027)

**Theme:** Crystal moves from descriptive ("what happened") and diagnostic ("why it happened") to predictive ("what will happen") and prescriptive ("what you should do about it").

**Target customer:** An enterprise organization that wants to use experience data to drive predictive decisions — proactive retention, early attrition identification, product prioritization.

**Core deliverables:**

- Predictive churn models trained on CX signal patterns — Crystal flags accounts at elevated churn risk 30–60 days before typical detection
- Proactive action recommendations — Crystal doesn't just flag problems, it recommends specific interventions with estimated impact
- Closed-loop tracking — every action linked to a Crystal insight is tracked through to outcome; Crystal reports on whether the action moved the metric
- Action effectiveness learning — Crystal's recommendations improve over time as it learns which interventions work for which types of issues in which organizational contexts
- Natural language survey design assistant — Crystal recommends question changes, warns about survey design issues, and estimates which new questions will produce the most actionable data
- Employee retention early warning — for HR customers, Crystal identifies engagement signal patterns that precede voluntary attrition
- Program ROI calculator — Crystal generates the quarterly ROI report linking experience program investment to business outcomes (retention delta, cost reduction, revenue impact)

**Success criteria for Phase 3 completion:**
- Predictive churn model accuracy >= 75% precision at 30-day horizon
- Closed-loop tracking adoption >= 60% of enterprise customers
- At least 3 customer-documented case studies showing Crystal prediction led to measurable intervention and outcome
- Program ROI reports adopted by >= 50% of customers as their primary CFO-facing metric

---

### Phase 4: Multi-Modal and Ecosystem (Q3 2027 and beyond)

**Theme:** Crystal evolves into a multi-modal experience intelligence platform with an open ecosystem that makes it the standard infrastructure layer for experience data analysis.

**Target customer:** Large enterprises and platform builders who want to embed Crystal's intelligence into their own products and workflows.

**Core deliverables:**

- Multi-modal data ingestion — Crystal analyzes voice (call center recordings transcribed to text), video (product research sessions), chat logs, and traditional survey data in a unified pipeline
- Crystal API and embedded analytics — third-party developers embed Crystal's analytical capabilities into their own CX/HR/product tools
- White-label Crystal — Experient offers Crystal's AI layer to XM platform builders who want to compete with Qualtrics without building their own AI
- Industry-specific Crystal models — fine-tuned versions of Crystal with deep domain knowledge for healthcare experience (HCAHPS, patient journey), financial services (NPS benchmarks by product type), and retail (location-level intelligence)
- Real-world signal integration — Crystal incorporates external signals (Glassdoor ratings, Google reviews, App Store reviews, social media sentiment) alongside internal survey data
- Crystal Skills marketplace — third-party developers publish specialized analytical skills (specific statistical methods, industry models, compliance frameworks) that Crystal customers can install

**Success criteria for Phase 4 indicators:**
- Crystal API adopted by >= 3 third-party platforms
- Multi-modal ingestion processing >= 10% of total data volume
- Industry-specific models live in at least 2 verticals with measurable CAQS improvement vs. generic model

---

## 10. Risks and Mitigations

### Risk 1: AI Hallucination Destroys Trust
**Description:** Crystal produces a response that contains factually incorrect claims about the customer's data — an incorrect NPS figure, a misattributed verbatim, a fabricated segment comparison. The customer catches it and loses confidence in the platform. In enterprise XM, where decisions are made based on data that influences executive strategy, a single high-profile error can trigger contract cancellation and become a reference story that undermines sales.

**Probability:** Medium. LLMs have well-documented tendencies to confabulate, especially when synthesizing across large datasets.

**Impact:** High. Trust is the product in analytics. There is no recovery from a reputation for inaccurate outputs in an enterprise data context.

**Mitigation:**
- Build a dedicated hallucination detection pipeline before launching any customer-facing AI features. Every quantitative claim in a Crystal response is checked against the source data before delivery. Responses that fail consistency checks are revised or flagged.
- Maintain a human-auditable citation system: every Crystal claim links to the underlying data. Users can inspect the evidence for any statement.
- Establish a responsible disclosure policy: if Crystal produces an error that a customer relies on for a decision, Experient discloses it proactively and credits the affected billing period.
- Train internal red teams to adversarially probe Crystal with questions designed to elicit hallucinations. Document and address systematically before customer-facing release.

---

### Risk 2: Qualtrics Accelerates Its AI Roadmap
**Description:** The disruption window created by the Forsta acquisition closes faster than anticipated, either because Qualtrics completes the integration ahead of schedule or because it acquires an AI-native startup to fast-track its capabilities. A well-resourced Qualtrics with a credible AI product makes customer acquisition significantly harder.

**Probability:** Medium. Qualtrics has $1B+ in recurring revenue and a strong engineering organization. Their AI product as of 2025 is mediocre, but they are investing.

**Impact:** Medium-High. The window-based go-to-market strategy depends on Qualtrics being distracted for 18–24 months. A faster competitor recovery compresses our customer acquisition runway.

**Mitigation:**
- Move fast in 2026. Crystal Phase 1 must be in production and generating case studies by Q2 2026. The first 25 paying customers are the defensive moat — they are reference customers, they contribute to the benchmark data flywheel, and they represent evidence that the category is real.
- Focus relentlessly on capabilities Qualtrics structurally cannot replicate: real-time streaming intelligence, org-level contextual reasoning, tool extensibility. These are architectural, not feature-level, advantages. Even a fully focused Qualtrics engineering team would take 18+ months to build a comparable architecture.
- Build customer relationships that are not based on price alone. If the only reason a customer chose Crystal over Qualtrics was price, they will consider switching when Qualtrics improves. If Crystal has become indispensable as an analytical partner — if Crystal knows their organization, their programs, their historical baselines — switching costs are high.

---

### Risk 3: AI Inference Costs Destroy Unit Economics
**Description:** Crystal's AI-heavy architecture — long-context reasoning, streaming analysis, multi-step agent workflows — incurs significant API costs per customer interaction. As usage scales, inference costs grow faster than revenue, producing negative unit economics that are not visible at small scale but become existential at scale.

**Probability:** Medium. Claude API costs are non-trivial for complex agentic workflows. A single Crystal session involving multi-step cross-program analysis can consume several hundred thousand tokens.

**Impact:** High. A business that grows its way into a cost problem cannot be fixed by growth alone.

**Mitigation:**
- Build cost-per-insight tracking into the platform from day one. Every Crystal interaction is logged with its token cost. Product decisions are evaluated against their cost impact.
- Design prompt caching aggressively. Crystal's organizational context — survey structures, segment definitions, historical data summaries — is cached to avoid re-computing shared context on every request. Anthropic's prompt caching API can reduce inference costs by 60–80% for repeated context.
- Differentiate compute-intensive features by tier. Real-time streaming intelligence, org-level portfolio analysis, and predictive modeling are in paid tiers. The conversational analyst with a reasonable interaction budget is the base tier.
- Monitor Anthropic's pricing roadmap. As model capabilities improve and inference costs fall (the historical trend in AI hardware and software), costs that are marginal today become negligible at scale. The architecture should be designed for cost efficiency now, with the expectation that the underlying cost curve improves.

---

### Risk 4: Data Privacy and Security Concerns Block Enterprise Sales
**Description:** Enterprise buyers — especially in healthcare, financial services, and HR — have strict data residency, privacy, and security requirements. A startup without SOC 2 Type II certification, GDPR compliance documentation, and enterprise security controls will be disqualified from enterprise deals regardless of product quality.

**Probability:** High. Every enterprise deal will include a security review. Many organizations have policies against sending employee or customer feedback data to third-party AI APIs.

**Impact:** High for enterprise segment; medium for mid-market.

**Mitigation:**
- Prioritize SOC 2 Type II certification on the current engineering roadmap. Target Q4 2026.
- Build a clear data processing agreement and privacy policy that explicitly addresses how customer survey data is used (it is not used to train models without opt-in; it is not commingled across customers; it is retained only for the contractual period).
- For enterprise customers with strict data residency requirements, design a private deployment option (Crystal on customer-managed infrastructure or in a dedicated cloud tenancy) as a Phase 2 premium offering.
- Brief enterprise sales candidates on Anthropic's enterprise security posture. Anthropic maintains strong security controls and offers Business Associate Agreements for healthcare customers. Crystal's reliance on Anthropic is a feature from a security perspective, not a liability.

---

### Risk 5: Small Team Spreads Too Thin Across the Roadmap
**Description:** Crystal's four-phase roadmap is ambitious. A small founding team attempting to build all of it simultaneously will ship nothing well. The risk is that pressure to show progress across all four phases leads to a product that is mediocre at all of them and excellent at none.

**Probability:** High. This is the default failure mode for ambitious startups.

**Impact:** High. A mediocre Crystal loses to Qualtrics on trust and to emerging AI tools on price.

**Mitigation:**
- Phase 1 must be the only engineering priority through Q2 2026. Nothing gets built for Phase 2, 3, or 4 until Phase 1 success criteria are met. This is a resourcing policy, not a suggestion.
- Define "done" for Phase 1 with specific, measurable criteria (see Section 9) and require sign-off from at least two design partners before moving to Phase 2.
- Ruthlessly scope Phase 1 to the minimum feature set that demonstrates the core value proposition: a conversational analyst that gives better answers than Qualtrics in under 8 minutes. Everything else is Phase 2 or later.
- Accept that Phase 1 will not serve the C-Suite Executive persona well. That persona requires org-level portfolio intelligence (Phase 2). Phase 1 targets CX Managers and HRBPs, who can get value from single-program analysis. Ship a great product for a small persona rather than an adequate product for everyone.

---

### Risk 6: Benchmark Data is Too Thin at Launch
**Description:** Crystal's competitive differentiation includes industry benchmarking. At launch, with a small customer base, Crystal's benchmark data will be thin — limited industries, limited company sizes, limited time history. Customers who need benchmarks will be disappointed. Early customers who contribute data will not see benchmark value until the customer base grows.

**Probability:** High. The benchmark data flywheel requires critical mass.

**Impact:** Medium. Benchmarking is a differentiator but not a core reason a customer buys Crystal. It becomes a reason they stay and expand.

**Mitigation:**
- Launch with third-party benchmark data from publicly available sources (XM Institute, Bain NPS research, Gallup engagement benchmarks) as the initial benchmark layer. Crystal uses these as its industry context until the proprietary benchmark flywheel is mature enough.
- Be transparent with customers about benchmark data provenance: "This benchmark is from the XM Institute 2025 report; we are building a proprietary benchmark from our customer base that will be available in Q3 2026."
- Design the benchmark contribution program to be opt-in and clearly value-delivering: customers who contribute data get richer benchmark access. Make the opt-in default on and the opt-out easy — do not bury it.
- Target vertical customer clusters early. If Experient's first 25 customers are spread evenly across 25 industries, the benchmarks are useless. If 8 of the first 25 customers are B2B SaaS companies, the B2B SaaS benchmark is already meaningful. GTM should cluster early customers by industry intentionally.

---

*This document is intended to evolve. Every section should be revisited at the end of each roadmap phase. Assumptions that are invalidated should be documented with the date they were invalidated and the reason. Strategic decisions made against this document should reference it explicitly.*

---

*Experient, Inc. — Internal Strategic Document — Not for External Distribution*
