# Experient AI Insights — Competitive Landscape (May 2026)

> The XM market just consolidated. Qualtrics announced a **$6.75B acquisition of Press Ganey Forsta in October 2025** ([Qualtrics press release](https://www.qualtrics.com/articles/news/qualtrics-to-invest-6-75-billion-in-press-ganey-forsta-acquisition-to-advance-ai-powered-experience-management/)), and Press Ganey had already absorbed **InMoment in May 2025**. As of May 2026 the deal is closing/integrating, so the historical "three leaders" effectively become **two leaders** (Qualtrics-mega and Medallia) plus a layer of agentic upstarts. Gartner's April 2025 Magic Quadrant for VoC Platforms named Qualtrics, Medallia, Sprinklr, InMoment, and Forsta as Leaders ([CX Today summary](https://www.cxtoday.com/voice-of-the-customer/gartner-magic-quadrant-for-voice-of-the-customer-voc-platforms-2025-the-rundown/)). Qualtrics was highest on both axes.

**The thesis of this document:** The legacy leaders share the same flaw set — multi-month implementations, six- and seven-figure ACVs, low time-to-first-insight, deep services dependency, and a "GenAI dusted onto a 15-year-old data model" architecture. The 18-month post-merger integration window is **Experient's largest customer-disruption opportunity in a decade**.

---

## 1. Qualtrics XM (XM/os2 + XM Discover + Experience Agents)

### Insight engine capabilities

- **AI/ML stack marketed:** Stats iQ (regression/predictive), Text iQ (topic + sentiment), Predict iQ (neural-net churn), XM Discover (ex-Clarabridge — conversational analytics: emotion/intent/effort), new XM/os2 generative layer with a stated **$500M, 4-year AI investment** ([Diginomica](https://diginomica.com/qualtrics-invest-500-million-ai-it-launches-new-xm-platform), [Qualtrics blog](https://www.qualtrics.com/blog/next-generation-xm-os2/))
- **Insight types:** key drivers, topic, sentiment, intent, effort, emotion, churn prediction (Predict iQ requires ~500 churned respondents min, ~5,000 for accuracy), agent-behavior detection, anomaly detection
- **Real-time vs batch:** XM Discover positions as "real-time insights based on every interaction" — practical reality from reviewers: large dashboards still slow
- **Closed-loop:** Ticketing module triggers on NPS thresholds; native Zendesk and Salesforce connectors; **Experience Agents (March 2025 X4 Summit)** — agentic AI inside post-service surveys/ticketing; claims TruGreen cut escalations 30% in a week ([Qualtrics news](https://www.qualtrics.com/articles/news/qualtrics-accelerates-ai-leadership-and-value-with-experience-agents/)). Same source admits historically organizations close the loop on only 2-3% of customers.
- **Generative AI:** Summaries after every interaction, auto-ticket creation, AI Assisted Topic models (Topic Hierarchy Generator), generative report writing
- **Multi-source:** surveys, chat, voice (transcripts), email, social, ratings/reviews, third-party ops data
- **Languages:** XM platform UI in **21 languages**. XM Discover NLP supports **~23 languages with 150+ industry-tuned models**
- **BYO model:** Topic models and category rules user-editable; LLM choice opaque; no public BYO-model fine-tuning surface

### Differentiation surface

- **Pricing:** **$5/response, 10,000 response annual minimum ($50K floor)** documented in a Michigan state contract; typical enterprise ACV **$25K–$100K+/yr, average ~$323K/yr** per Spendhound/Vendr ([Vendr](https://www.vendr.com/marketplace/qualtrics), [Spendhound](https://www.spendhound.com/marketplace/qualtrics-pricing)). One self-serve research plan at ~$420/mo exists but heavily capped.
- **Time-to-first-insight:** NPS launch 4–8 weeks; full enterprise VoC program 3–6 months; "average customer waits **21 months** for ROI" cited in comparison material; reviewers describe "weeks or even months to launch a campaign, requiring consultants" ([Joyous CEO blog](https://www.bejoyous.ai/ceo-blog/the-five-biggest-complaints-from-qualtrics-customers))
- **Configuration complexity:** Steep learning curve; advanced features (Text iQ, Stats iQ, dashboards) require trained admins

### Top 5 pain points (G2/TrustRadius/community)

1. Learning curve / weeks to build basic surveys
2. Cost escalates with channels, analytics, support seats
3. Slow performance on large datasets and complex dashboards
4. Reports and exports require external help to be usable
5. Support is email-only and slow ("repeated outreach over months without response")

### What they're genuinely good at

Stats iQ for non-statisticians; XM Discover post-Clarabridge has 150+ industry-tuned models that take years to replicate; Salesforce + Zendesk integrations mature; brand recognition; healthcare verticalization once Press Ganey closes.

### Architecture clues

- XM/os2 is a re-platforming with a unified data fabric ("Experience Data Records") and generative AI fused into every product ([Futurum](https://futurumgroup.com/insights/xm-os2-launched-by-qualtrics/))
- Conversational analytics is Clarabridge IP (acquired 2021), originally a separate processing pipeline; integration ongoing
- Public engineering blog thin; little disclosure on model architecture, latency SLAs, vector store choice
- Post-acquisition (PG-Forsta + InMoment), Qualtrics absorbs **Lexalytics NLP** stack from InMoment and Press Ganey's healthcare patient data corpus

---

## 2. Medallia Experience Cloud (Athena / Athena Studio)

### Insight engine capabilities

- **AI/ML stack marketed:** **Athena** = native AI layer with "hundreds of ML models." **Athena Studio** (2024) lets customers configure GenAI on their data ([press release](https://www.medallia.com/press-release/medallia-introduces-athena-studio/)). **Ask Athena** = natural-language Q&A over experience data
- **Insight types:** Themes (now GenAI-generated with user-friendly labels), sentiment, effort, emotion, intent, root-cause analysis, digital session summarization, behavioral anomaly detection, key drivers, segmentation
- **March 2025 announcement:** 7 new AI innovations including **Prescriptive Digital Experience Insights** and **Coaching Intelligence**
- **Real-time:** Real-time signal capture across digital, voice, chat, social. Digital Experience Analytics (DXA) is session-level near-real-time
- **Closed-loop:** Native case management; "Medallia Closed Loop Service Experience for Salesforce"; Zendesk connector
- **Generative AI:** Smart Response (personalized agent replies), Intelligent Summaries, Themes-with-GenAI, Digital Session Summarization, Ask Athena Q&A
- **Multi-source ingestion:** Surveys, **Medallia Speech** (voice transcription + analytics), chat, web behavior, **30+ social and review sites directly (Google, Facebook, TripAdvisor, Expedia, Agoda) and 100+ via partners**, CRM/HRIS/POS/ERP
- **Languages:** Marketed as global; specific NLP language counts not publicly published

### Differentiation surface

- **Pricing:** Based on **Experience Data Records (EDR)** rather than seats or response count ([pricing page](https://www.medallia.com/pricing/)). Custom quoted. Starts around **$20K/yr** at floor; **implementations regularly exceed $50K**; mid-enterprise typically $100K+. Reviewers complain about opaque renewals.
- **Time-to-first-insight:** Reviewers describe "complex and time-consuming" setup; not self-service; requires Medallia services org for most projects

### Top 5 pain points

1. Setup complex, not self-service
2. Pricing opaque; reports of **10% auto-renewal price increases without notice**
3. Data export and filtering limitations
4. Duplicate survey records skew results
5. Heavy manual effort to push insights across departments

### What they're genuinely good at

Best-in-class digital experience analytics (session replay + DXA); deepest contact-center voice transcription stack; strongest signals-from-everywhere story.

### Architecture clues

- Public **engineering blog at engineering.medallia.com** but mostly historical microservices content from 2016–2019
- Athena uses "hundreds of ML models" — traditional + transformer mix
- Athena Studio is the productionized GenAI surface
- Speech analytics has a [public API](https://developer.medallia.com/medallia-apis/reference/speech-overview)
- No public latency SLAs

---

## 3. InMoment XI Platform (now being absorbed by Qualtrics)

### Insight engine capabilities

- **AI/ML stack marketed:** **InMoment AI**, **AI Studio** (framework for deploying GenAI features in XI), **Smart Summary Generator** (GPT-based), **AI Journey Insights** (industry-first per their PR), **AI Auto Responding** (July 2025) for reputation management
- **Insight types:** Intent detection (purchase, churn), effort, emotion, sentiment, themes, journey insights, reputation/auto-responding
- **Languages:** **Active Listening surveys in 90 languages**, **41+ languages self-serve for survey/invitation creation**; NLP via Lexalytics covers **31 total languages, 11 with full feature parity**

### Pain points

1. Date-picker resets on every login; small UX papercuts everywhere
2. Long onboarding, services-heavy configuration
3. Dashboard rigidity; custom reports gated by support
4. Slow innovation cadence pre-acquisition
5. **Acquisition uncertainty — InMoment, Forsta, Press Ganey, Decipher all now rolling into Qualtrics**, customers worried about roadmap

### What they're good at

Lexalytics NLP for non-English markets; Reputation Management module (auto-responding); healthcare and retail verticals; AI Journey Insights is genuinely useful.

### Architecture

- **Lexalytics acquisition (2022)** is the NLP engine
- AI Studio is a framework, not a model — LLM calls likely go to OpenAI/Anthropic/Azure under the hood
- After Qualtrics acquisition closes, expect convergence onto XM/os2 infrastructure

---

## 4. Challenger upstarts worth tracking

### Platform-adjacent (CCaaS / Social / Forms)

- **Sprinklr Insights** — Named a Leader in 2025 Gartner VoC MQ. AI+ stack covers VoC, Brand Monitoring, Crisis, Competitor Insights. **Image detection on top of text**; claims **90%+ accuracy** on contextual insights; **Spring '26 (26.4) release** adds agentic copilot, governed automation, GenAI-enriched AI Topics. Strength: social and external listening at scale. Weakness: not strong on traditional surveys/program management.
- **NICE Enlighten** — Contact-center-anchored. **Enlighten Copilot** (agent/supervisor real-time assist), **Enlighten XM** (memory graph + LLM cross-session continuity), **Enlighten Actions** (specialized CX models, next-best-action), **Enlighten CSAT** (auto-CSAT from agent soft skills). Strength: deeply embedded in CXone. Weakness: contact-center first; surveys/programs secondary.
- **AskNicely** — NPS-focused, frontline-team-centric. **NiceAI** generates open-text summaries. Strength: mid-market, fast deploy, mobile-first for frontline managers.
- **GetFeedback** (SurveyMonkey/Momentive) — Now part of SurveyMonkey Enterprise. Built-in AI for sentiment, theme detection, auto-summaries. SurveyMonkey is also retiring Delighted (June 2026 shutdown) — **another customer-disruption window for Experient**.
- **Typeform AI** — Launched "AI engagement platform" turning forms into workflows. **Insights AI** offers Ask-AI Q&A over results. Trained on 1B+ anonymized responses. Strength: best-in-class form UX. Weakness: not a real CX program platform — no closed loop, no voice, no enterprise ops.
- **Forsta** (now part of Press Ganey → Qualtrics) — Will be absorbed
- **Alida** — Community-centered research; Q3 2025 launched AI Assistant for researchers. Strength: research/insights communities. Weakness: smaller scale, not operational CX.

### Pure-AI insight platforms (the architectural threat model)

- **Viable** — Acquired by Apple 2024, absorbed. Was a leader in qualitative summarization
- **Kraftful** — **Acquired by Amplitude on July 10, 2025**. Proprietary LLM analysis of unstructured feedback (support tickets, app reviews, calls), **patent-pending hallucination detection**, AI-powered interviews at scale. Now a 360-degree feature inside Amplitude.
- **Enterpret** — **Launched first "agentic" customer feedback platform on October 27, 2025**. Key concepts: **Customer Knowledge Graph** linking feedback to users/accounts/opportunities/products, **Adaptive Taxonomy** that auto-evolves (no manual tagging), connectors to 50+ sources. **This is the architecture Experient must benchmark against.**
- **Maven AGI** — Resolves **up to 93% of support tickets autonomously**, 10× faster resolution, 81% cost reduction claims. AI co-pilots integrated into Zendesk/Salesforce/HubSpot. **$250M+ funding** including Cisco Investments, Dell Technologies Capital. Threat model: support-automation play, but the agentic pattern is the threat for Experient.

---

## 5. Architectural pattern across the leaders

The **legacy XM stack** looks like this:

```
structured survey schema → operational data warehouse → batch ML pipelines for topic/sentiment → BI-style dashboards → workflow engine for ticketing
```

GenAI bolted on in 2023–2024 as: (a) a summarization layer over existing topic models, (b) a natural-language query interface on the warehouse, (c) "copilot" inline help. **None of the three legacy leaders has rebuilt their data model around vector embeddings or LLM-native semantic search.** Everyone still does topic modeling first, then GenAI labels the topics nicely.

The **upstart pattern** (Enterpret, Kraftful, the Experient bet):

```
vector store first → semantic clustering → LLM categorization in-loop → no fixed taxonomy
```

This is **simpler, faster, cheaper, more accurate** if done right — exactly Experient's wedge. See [ARCHITECTURE.md](ARCHITECTURE.md) for our implementation.

---

## 6. Competitor matrix

| Dimension | Qualtrics | Medallia | InMoment | Sprinklr | NICE | Typeform AI | Enterpret | Maven AGI |
|---|---|---|---|---|---|---|---|---|
| **Survey program mgmt** | Strong | Strong | Strong | Weak | None | Weak | None | None |
| **Text/conversation analytics** | Very strong | Very strong | Strong | Strong | Strong | Weak | Very strong | Strong |
| **Real-time closed-loop** | Strong | Strong | Moderate | Weak | Very strong | None | Moderate | Very strong |
| **Generative AI / Q&A** | Strong | Strong | Moderate | Strong | Strong | Moderate | Very strong | Strong |
| **Multi-source ingestion** | Broad | Broadest | Broad | Social-heavy | Voice-heavy | Forms-only | Very broad | Support channels |
| **Language coverage (NLP)** | ~23 | Many | 31 | Many | Many | Limited | LLM-based | LLM-based |
| **Time-to-first-insight** | **Slow (months)** | **Slow** | **Slow** | Moderate | Moderate | Fast | **Fast** | Fast |
| **Self-service config** | **Hard** | **Hard** | **Hard** | Moderate | Moderate | Easy | Easy | Moderate |
| **Pricing transparency** | **Opaque, $50K+ floor** | **Opaque, $20K+ floor** | **Opaque** | Opaque | Opaque | Public tiers | Public-ish | Custom |
| **Avg enterprise ACV** | ~$323K | $100K+ | $50–200K | $100K+ | Bundled | $5–50K | $30–150K | Custom |
| **Vertical depth** | Healthcare, HR, edu | Hospitality, retail | Retail, healthcare | Brand/marketing | Contact center | Marketing/research | SaaS/product | SaaS support |
| **Acquisition risk** | Acquirer (stable) | Stable | Being absorbed | Public, indep | Public, indep | Indep | Indep | Indep |
| **AI architecture freshness** | Legacy + GenAI layer | Legacy + GenAI layer | Legacy + GenAI layer | More native AI+ | CCaaS-native | Modern but shallow | **LLM-native, vector-first** | LLM-native |

---

## 7. Implications for Experient — the explicit wedge

### Where to attack hard

1. **Time-to-first-insight.** Leaders take weeks to months. **We publicly commit to "first insight within 60 seconds of survey close" and "production program in 1 day."** Single most consistent pain point across all three reviews. Verifiable in a 90-second demo.
2. **Pricing transparency.** Every leader is opaque/custom-quoted with $20K–$50K floors. **Public, per-response/per-credit pricing is differentiation by itself** — half the sales cycle disappears.
3. **Architecture.** LLM-native, vector-first, no fixed taxonomy (Enterpret-style adaptive taxonomy). **Legacy leaders cannot ship this without rebuilding their data model.** They have ~18 months of post-merger integration consuming their engineering attention. We have a clear runway.
4. **Closed-loop.** Qualtrics' Experience Agents are the new bar. Match with a credible agentic close-the-loop story (auto-ticket, auto-respond, auto-escalate). The Qualtrics-acquired-everything moment is a major customer-disruption window for **18 months**.
5. **Trust UI.** Citation-back-to-quotes + CIs on every number. Free. Boring. The deepest moat.

### Where not to fight (yet)

- **Vertical depth** (healthcare patient experience, hospitality verticals) — takes years and acquisitions
- **30+ social-site connectors** — Medallia's signal-everywhere story is hard to match v1
- **Contact-center voice** — adjacent product category; partner with a CCaaS instead

### Quiet asymmetric advantages

- **Languages.** Modern LLMs give us 60+ languages for free with no Lexalytics-style per-language model. **An asymmetric advantage.**
- **No legacy data model.** Every legacy leader is paying a hidden tax to integrate Clarabridge/Lexalytics with their core. We don't.
- **AI-native cost basis.** Gemini Flash @ <$1/insight vs. legacy stacks running on bespoke ML pipelines + services org.

### Track closely

**Enterpret and Kraftful (inside Amplitude)** — the architectural future we're aiming at. Their UX/feature choices are leading indicators. Watch their product changelogs monthly.

---

## 8. The displacement narrative (for sales)

> "When Qualtrics bought Press Ganey, Forsta, and InMoment for $6.75B, every legacy XM customer faced an 18-month migration uncertainty window. Renewals are being delayed. Roadmaps are being unified. Implementation teams are being consolidated. Meanwhile your team needs insights *today*. Experient ships you the same insight categories — drivers, sentiment, churn risk, prescriptive actions — in 60 seconds, with sources cited, with confidence intervals on every number, at <10% of the price. No services org. No 6-month onboarding. No vendor-acquisition risk."

See [MARKETING.md](MARKETING.md) for the full GTM playbook.

---

## 9. Source URLs (complete)

**Qualtrics:**
- https://www.qualtrics.com/articles/news/qualtrics-launches-xm-os2-the-next-generation-of-the-qualtrics-platform-fully-enabled-with-ai/
- https://www.qualtrics.com/articles/news/qualtrics-to-invest-6-75-billion-in-press-ganey-forsta-acquisition-to-advance-ai-powered-experience-management/
- https://www.qualtrics.com/articles/news/qualtrics-accelerates-ai-leadership-and-value-with-experience-agents/
- https://www.qualtrics.com/support/survey-platform/data-and-analysis-module/predict-iq/
- https://www.qualtrics.com/support/xm-discover/getting-started-discover/xm-discover-basic-overview/
- https://diginomica.com/qualtrics-invest-500-million-ai-it-launches-new-xm-platform
- https://www.bejoyous.ai/ceo-blog/the-five-biggest-complaints-from-qualtrics-customers
- https://www.vendr.com/marketplace/qualtrics
- https://www.spendhound.com/marketplace/qualtrics-pricing
- https://www.cxtoday.com/contact-center/qualtrics-customer-feedback-management-ai-cx/
- https://futurumgroup.com/insights/xm-os2-launched-by-qualtrics/

**Medallia:**
- https://www.medallia.com/platform/medallia-ai/
- https://www.medallia.com/press-release/medallia-introduces-athena-studio/
- https://www.medallia.com/press-release/medallia-unveils-vision-for-future-of-customer-experience-and-7-ai-powered-capabilities/
- https://www.medallia.com/pricing/
- https://www.medallia.com/platform/signals/
- https://developer.medallia.com/medallia-apis/reference/speech-overview
- https://engineering.medallia.com/blog/tags/architecture/
- https://www.customerexperiencedive.com/news/medallia-generative-ai-customer-service-virtual-assistant/707263/

**InMoment / Forsta / Press Ganey:**
- https://inmoment.com/xi-platform/
- https://inmoment.com/news/inmoment-announces-new-ai-studio-a-pioneering-framework-for-deploying-generative-ai-features-in-its-xi-platform/
- https://inmoment.com/news/news-inmoments-active-listening-now-available-in-90-languages/
- https://www.cmswire.com/customer-experience/qualtrics-to-buy-press-ganey-forsta-for-675-billion/
- https://www.forrester.com/blogs/qualtrics-planned-acquisition-of-press-ganey-forsta-shakes-up-multiple-markets/

**Challengers:**
- https://www.sprinklr.com/products/consumer-intelligence/
- https://www.sprinklr.com/newsroom/sprinklr-unveils-next-wave-of-ai-native-customer-experience/
- https://www.nice.com/platform/enlighten-ai
- https://www.asknicely.com/blog/asknicelys-2025-product-updates
- https://www.typeform.com/ai
- https://www.alida.com/newsroom/alida-launches-industry-first-ai-assistant-for-user-research
- https://www.kraftful.com/
- https://investors.amplitude.com/news-releases/news-release-details/amplitude-acquires-kraftful-accelerate-ai-strategy
- https://www.enterpret.com/
- https://www.businesswire.com/news/home/20251027487140/en/Enterpret-Launches-the-First-Agentic-Customer-Feedback-Platform-to-Unify-Understand-and-Act-on-Scattered-Customer-Signals
- https://www.mavenagi.com/
- https://www.cxtoday.com/voice-of-the-customer/gartner-magic-quadrant-for-voice-of-the-customer-voc-platforms-2025-the-rundown/
