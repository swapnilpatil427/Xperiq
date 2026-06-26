# Experient Support System — Comprehensive Design Document

**Date:** June 2026  
**Status:** Canonical Design — Drives Implementation  
**Prepared by:** Product, Design, Engineering, and Customer Voices  
**Classification:** Internal Product & Engineering Reference

---

## Prologue: Why This Document Exists

Experient's platform is accelerating beyond the pace at which traditional support models can function. Thirteen Crystal skills. A credit-based pricing engine. An enterprise RBAC system. A skill runtime that lets any AI agent call Experient's four core skills. A visual AI pipeline. A workflow engine.

The old support model — a Notion wiki someone updates when they remember to, a Zendesk queue staffed by humans who context-switch 40 times a day, a quarterly doc review that nobody does — dies the moment Experient reaches 1,000 organizations. It probably dies at 200.

The new model has one organizing idea: **Crystal answers everything, docs write themselves, humans never touch a tier-1 ticket.**

To design this system properly, we did not write a spec. We hired a team. We ran debates. We made decisions. This document is the record of that process — and the canonical design that emerged from it.

---

## The Team

We assembled fourteen people. Not a committee that reaches consensus. A war room that argues toward decisions. Each person holds a specific seat at the table for a specific reason. Their disagreements were not moderated into neutrality — they were resolved into choices.

---

### Aria Nakamura — Chief Design Officer

Aria spent four years on Figma's internal design team before joining Linear as their first design hire, where she invented the "zero-chrome" interface philosophy: the idea that a great product makes its own UI feel invisible so that the user's work can feel loud. At Linear, this meant every modal, every shortcut, every loading state was audited against the question: "Does this serve the task or serve the software?" She is impatient with UI that performs helpfulness rather than delivering it. Her presence in this room means every design decision gets challenged on whether users will actually notice it in the way it's intended — or whether they'll click right past it looking for something that actually answers their question.

---

### Marcus Kim — Principal UX Researcher

Marcus ran enterprise usability programs at Salesforce Einstein for five years. He has personally sat behind the one-way mirror watching enterprise administrators — people who are paid well, are technically proficient, and have no patience for unclear affordances — fail to find a help article, fail to understand a Crystal response, fail to escalate a ticket because the form was too long. He has 200+ recorded support interaction sessions across CRM platforms, XM tools, and analytics suites. He knows exactly where users give up. He knows the precise second they decide to email someone instead of using the product. When Marcus says "they won't do that," he means he has watched 40 people not do that.

---

### Devon Clarke — Lead Frontend Engineer

Devon was at Vercel for three years, where he built core patterns for Next.js App Router incremental static regeneration. He is a TypeScript performance obsessive with a specific tic: he measures First Contentful Paint in milliseconds and regards anything over 800ms as a failure of professional responsibility. He pushes back on any design that adds a network round-trip he doesn't believe is justified, any state management pattern that will become a memory leak in six months, or any animation that requires a compositing layer the browser shouldn't need to create. Devon's value to this room is not skepticism for its own sake — it's that he has shipped enough complex UIs to know which beautiful ideas become maintenance nightmares.

---

### Priya Shah — Senior Frontend Engineer

Priya led Experient's Tailwind v4 migration and is the resident deep expert on Framer Motion. She knows the design token system — the indigo primary, the purple tertiary, the glass-card backdrop-filter pattern, the house ease curve at [0.22,1,0.36,1] — not as reference material but as working muscle memory. She is the person who takes a design that Aria describes and figures out whether it can be expressed in the existing component system or requires new primitives. Her opinion matters most on questions of animation budget, CSS performance, and whether a new pattern will compose cleanly with the components that already exist.

---

### Dr. Amara Osei — AI UX Researcher

Amara published CHI papers on conversational AI interfaces for enterprise support contexts during her tenure at Google PAIR. Her research is specifically about the failure modes of AI support — not when the AI gives a wrong answer, but when the AI gives a response the user cannot evaluate, cannot trust, and cannot act on. She has studied the difference between AI that makes support better (faster to resolution, more context-aware, less repetitive) and AI that makes support worse (confident-sounding wrong answers, no escape route when the AI fails, over-reliance on a system that breaks at 2am on a Sunday). She is not anti-AI. She is anti-AI theater.

---

### Jordan Webb — Enterprise Customer Voice

Jordan is the VP of CX at a 3,500-person financial services firm that runs NPS and CSAT programs on Experient. She is not here as a representative of a user archetype. She is here as a person who has filed 47 support tickets across XM platforms in the last two years, who has been put on hold, who has received auto-responder emails at 11pm, who has been asked to re-enter her organization name in a support form when it is the first field in her profile. She is specific. She is angry in the productive sense — she has already done the analysis about why she's angry. She is almost always right, and the team has learned to stop arguing with her about what enterprise customers want, because she is one.

---

### Sarah Chen — VP of Product (Chair)

Sarah was a senior PM at Qualtrics, left after watching an acquisition erase years of careful product investment, and joined Experient because she believed the XM space could be disrupted by a team willing to actually build AI-first. She has a specific way of killing features: she asks what job-to-be-done the feature serves, and if nobody can answer that clearly, the feature goes. She synthesizes well. She knows when a debate has reached a real decision and when it's cycling. Her job in this room is not to be the most opinionated person, but to ensure that the most opinionated people don't drive the design into a ditch.

---

### Dr. Amira Hassan — AI Research Lead / Support Scientist

Amira has a PhD in information retrieval from Berkeley and spent time building conversational AI for enterprise support at Salesforce Einstein before coming to Experient. She has published work on zero-shot support resolution — the idea that a well-built AI system should be able to resolve a support query it has never seen before, given sufficient context about the system state. She is frustrated by human fallbacks proposed for problems that AI can solve, and she makes this frustration visible in debates. Her target is 100% AI resolution. She does not think 80% is good enough. The gap between 80% and 100% is exactly where enterprise trust is built or broken.

---

### Marcus Rodriguez — Head of Customer Success

Marcus has managed three enterprise support queues at scale: at Intercom, at Freshdesk, and at a Series B startup he helped take from 12 enterprise customers to 180. He knows what tier-3 actually looks like at 2am — not the ticket description, but the person behind it: a frantic administrator whose NPS data feed has been broken for six hours and whose VP of CX (Jordan Webb, in fact, or someone like her) is emailing them every 20 minutes. He has seen support systems fail in every way a support system can fail. He pushes back on anything that sounds elegant in a design document but falls apart under real load.

---

### Carlos Mendes — Enterprise Architect

Carlos designed Experient's multi-tenant isolation architecture. He thinks in systems. Ask him about a feature and his first question is: "What breaks at 10,000 orgs?" He has strong opinions about SLAs and about the difference between SLAs that are aspirational and SLAs that are enforced by architecture. He does not trust soft controls. He trusts hard limits, circuit breakers, and queue depths. He is the person in this room who will notice that a beautiful async docs pipeline creates a 4-hour window where a doc is stale after a feature ships, and will not let the team pretend that window doesn't matter.

---

### Dev Patel — Senior CrystalOS Engineer

Dev built the skill runtime, the LangGraph pipeline, and the Redis namespacing layer. He is the feasibility gate in this room. When the AI team describes what Crystal should do, Dev is the person who explains whether that's a two-day build or a two-month build, and why the distinction matters. He knows every Crystal skill at the code level. He knows the difference between what Crystal can reason over and what requires a new tool. He is not a pessimist — he has shipped most of what this team has asked him to ship — but he is precise, and he does not allow scope to expand without consequences being named.

---

### Lisa Park — Documentation Engineering Lead

Lisa has built docs-as-code pipelines at two developer tools companies. She has strong opinions about what makes documentation actually useful, and those opinions are data-backed: she has A/B tested doc formats, measured time-to-find-answer in user sessions, tracked which doc pages reduce ticket volume and which ones generate it. She knows every way documentation rots — the feature that changed in v2 but whose doc page was never updated, the code sample that stopped working six months ago, the conceptual overview that describes an architecture the team abandoned. She is not romantic about human-written docs. Humans write docs poorly and infrequently.

---

### Tom Nakamura — Crystal PM

Tom manages Crystal's eval pipeline and knows every skill's quality scores, what it gets right, what it gets consistently wrong, and what scenarios trigger hallucinations. He is the person who can say, with data, "Crystal's `crystal-analyst` skill resolves 94% of data questions correctly but falls apart on multi-survey comparison questions, and here's the specific failure mode." He is not defensive about Crystal's limitations. He tracks them precisely so the team can make honest promises about what Crystal support will and won't handle.

---

### Yuki Tanaka — Interaction Design Lead

Yuki came from Linear and then Vercel. She is obsessed with time-to-answer, which she measures not from "user opens support page" but from "user realizes they have a question." She hates anything that requires more than two clicks. She hates search bars that don't have instant results. She hates loading states that feel like they're thinking when they should already know. Her presence in this room keeps the team honest about interaction cost — the cognitive tax of each step between a question and its answer.

---

## The Debates

Seven debates. Each one started with a motion, produced real disagreement, and ended with a decision. The debates are recorded here as closely as possible to how they happened — the arguments in full, the places where someone changed their mind, and the precise resolution each one reached.

---

### Debate 1: Is Crystal a search engine or a conversational AI?

**The central question:** When a user arrives at the support page and types something, are they searching for a document or starting a conversation?

The debate opened with Aria, who had been designing the support page layout and needed this resolved before she could make any further decisions. "I need to know," she said, "whether I'm drawing a search bar or a chat input. Because the affordance is completely different. A search bar says 'find.' A chat input says 'ask.' Users approach these differently and have different success expectations for each."

Dr. Amara Osei pushed back on the framing before it got started. "That binary is wrong. The research on this is clear: enterprise users don't distinguish between 'searching' and 'asking' until the interface forces them to. The question is what happens on the other side. If the response is a list of links, they're searching. If the response is a synthesized answer, they're in a conversation. The input affordance should be ambiguous by design."

Devon was skeptical. "Ambiguous by design is another way of saying we haven't decided what the backend does. If Crystal is reasoning over the query — doing a full ReAct loop — that's 2 to 8 seconds of latency. That's not a search experience. That's a conversation experience. If we want to feel like search, we need a separate fast path: a pre-indexed document retrieval layer that returns in under 300ms, and Crystal only kicks in if the fast path doesn't find a confident match."

"That's the right architecture," Dev confirmed. "We already have pgvector on the support docs corpus. Hybrid BM25 plus vector retrieval gives us sub-300ms on document questions. For operational questions — 'why did my NPS drop,' 'what's my credit balance' — Crystal needs to run tools, and that's a different latency class. We can run them in parallel and return whichever answers first."

Dr. Amira Hassan stepped in. "The parallel path is correct but incomplete. The real question is: what do we show while Crystal is reasoning? Because a blank screen for 4 seconds is not acceptable. But fake 'thinking...' animation is worse — it trains users to distrust Crystal when it's actually fast, because they've seen it fake-think before."

Aria made the design call that broke the deadlock. "We show the document results immediately. Beneath them, we show a Crystal reasoning indicator — not a spinner, a progress trace. Users see Crystal pulling context: 'Reading your org's NPS history... Checking anomaly events...' This sets accurate expectations and makes Crystal's reasoning feel real rather than theatrical. If Crystal finishes before they've read the documents, it surfaces its answer above the docs. If they've already found their answer in the docs, they can ignore Crystal. Both paths work."

Tom interjected: "This is important for evals. If users find the answer in docs and ignore Crystal's response, we need to distinguish that from Crystal failing. Users ignoring Crystal's response after reading a doc is a success, not a failure. We have to instrument this properly."

**Decision:** Crystal and document retrieval run in parallel. The UI surfaces document hits immediately (sub-300ms). Crystal's reasoning progress is shown as a live trace, not a spinner. Crystal's synthesized answer surfaces above documents when ready. Users can act on either path. The input affordance is a single unified field — not labeled "search" or "ask," simply: "How can we help?"

---

### Debate 2: Should the search bar and Crystal be the same thing or different things?

**The central question:** One unified input or two distinct surfaces — a search bar for docs and a Crystal chat for conversational queries?

Yuki opened this debate and was direct: "One input. No question. The moment you give users two inputs, they make a choice before they've formulated their question. 'Is this a Crystal question or a search question?' — that's not a question users should be making. That's our job to figure out on the backend."

Marcus Kim disagreed from research. "I've watched users interact with unified AI inputs at Salesforce. There's a specific failure mode: the user types a very short query — 'NPS export' — and the system can't tell if they want docs about NPS exports or they want Crystal to run an export. They get Crystal's response when they wanted a doc. Or they get a doc when Crystal could have done the thing directly. With two inputs, the affordance communicates intent before the system has to interpret it."

"The solution isn't two inputs," Yuki said. "The solution is better intent classification. 'NPS export' is ambiguous. Crystal should ask a clarifying question: 'Do you want to export your NPS data right now, or find documentation on how exports work?' That's one additional message, and it's infinitely better than asking the user to pre-classify their own query."

Devon raised a practical concern: "Every intent clarification round-trip adds latency. If we're routing ambiguous queries to Crystal for clarification, we've added 2 to 5 seconds to the time-to-answer for a class of queries that a two-input design would have answered instantly. What's the frequency of ambiguous queries in Marcus's research?"

Marcus Kim had the number. "About 23% of initial support queries are ambiguous enough that the system can't confidently classify intent at above 0.85 confidence. But the right comparison is not 'unified with clarification' versus 'two inputs without clarification.' The right comparison is the full user journey. In the two-input design, users misroute themselves to the wrong input about 18% of the time in my Salesforce data. That's a worse error rate than 23% ambiguous, because in the unified design the system handles the ambiguity — in the two-input design, the user handles it badly."

Devon accepted this. "Fine. Unified input. But I want a fast-path heuristic that resolves obvious document queries without Crystal: if the query matches a doc title at above 0.9 confidence, return that doc directly without a Crystal round-trip. Crystal only runs for queries that don't hit the fast path."

"Agreed," said Dev. "The semantic router already does something like this for Crystal skills. We extend it to the support domain."

**Decision:** Single unified input. Intent classification routes to: (1) direct document fast-path for high-confidence doc queries (sub-300ms), (2) Crystal operational queries for tool-requiring questions, (3) Crystal clarification for ambiguous queries. The input placeholder cycles through examples: "How do I configure SAML?", "Why did my NPS drop this week?", "What's left in my credit plan?" — communicating the range of query types without requiring the user to classify.

---

### Debate 3: How do we handle the "I don't trust AI" enterprise user?

**The central question:** Enterprise customers — particularly in regulated industries like Jordan's financial services firm — often have explicit policies about AI-generated content. How do we design for users who will not accept a Crystal response as authoritative?

Jordan opened this debate and didn't soften it. "At my firm, I cannot cite Crystal's output in an internal report. I cannot say 'Crystal told me X so I did Y.' My compliance team has been clear: AI-generated content requires human attestation before it influences a business decision. This is not irrational. This is my legal reality. If your support system gives me an answer and I can't tell whether a human wrote it or Crystal wrote it, I have a problem."

Dr. Amira Hassan was frustrated. "If we add a disclaimer banner to every Crystal response saying 'this was generated by AI,' we have just made Crystal feel like a second-class citizen in our own support system. We are training users to distrust it. The right answer is not disclosure — it's accuracy. If Crystal is right 97% of the time on tier-1 support queries, the 'I don't trust AI' objection is irrational and we should not design for it."

"That's an easy thing to say when your job isn't on the line if Crystal is wrong," Jordan replied. "I'm not asking for a disclaimer banner. I'm asking for a clear answer to one question: where did this come from? If Crystal is citing a specific doc page, I can click to that page, read it, and verify. If Crystal is reasoning from survey data, I can see the underlying data and verify. The problem isn't AI — the problem is opacity. Give me provenance and I can manage the trust question myself."

Sarah synthesized: "What Jordan is asking for is citation, not disclaimer. Crystal already produces reasoning traces. What we're adding is rendering those traces as clickable provenance links, not hiding them. That's a design feature, not a trust concession."

Dr. Amara Osei brought research context: "In my CHI work, I found that users' trust in AI answers correlates much more strongly with the presence of verifiable citations than with accuracy metrics. A user who can click to a source and verify an answer trusts the AI response even when they've verified that it's correct. A user who gets a correct answer with no citation has lower trust. The mechanism is agency — if you can verify, you feel in control."

Marcus Rodriguez added a practical constraint: "There's a second 'I don't trust AI' scenario: the user who has had Crystal give them a wrong answer before. That's a real memory, not an irrational fear. For those users, the design needs to make the human escalation path always visible — not prominent, but never hidden. Not a 'last resort' button after Crystal has failed three times. A quiet, always-present option."

Dev noted a build requirement: "Every Crystal skill already emits `reasoning_steps` in its output. The support mode skill needs to emit `source_citations` — structured references to specific doc pages, data points, or feature states that informed the answer. We add this to the skill output contract and render it as a collapsible 'Sources' section beneath Crystal's response."

**Decision:** Crystal support responses always include a collapsible Sources section showing the specific doc pages, data points, or operational states that informed the answer. Sources are clickable. The reasoning trace is available as a secondary disclosure for users who want it. Human escalation is always accessible — a quiet "Talk to someone" link in the response footer, never hidden. No disclaimer banners. No "AI-generated" watermarks. Trust is built through provenance, not warnings.

---

### Debate 4: What's the right page structure — docs-first or Crystal-first?

**The central question:** When a user lands on the support page, is Crystal the primary affordance above the fold, or is the documentation system?

Aria came with a strong position: "Crystal-first. The page opens with the unified input, full-width, with Crystal active and ready. Docs are a secondary surface — accessible, easily reachable, but not competing with Crystal for primary real estate. We are building a Crystal-native support experience, not a docs site with a Crystal chatbot in the corner."

Marcus Rodriguez disagreed. "The majority of support queries are not operational — they're not 'do this for me' or 'tell me what's happening in my data.' They're conceptual — 'how does X work,' 'what does Y mean.' For those queries, a well-written doc page is the right answer. It's scannable, it has examples, it has anchors. Crystal's prose response to a conceptual question is often worse than a doc page because users can't scan it."

Lisa Park backed Marcus: "I have data on this from the docs sites I've built. 70 to 80% of support queries that resolve without a ticket resolve through documentation — the user finds a page and reads it. The AI-first framing assumes users are asking complex operational questions when most of them are asking 'how do I do this thing.' Docs are faster to read than a Crystal response for those queries."

"But docs require navigation," Aria pushed back. "You have to know which section to look in. The unified input handles navigation through search. The question is what surface to show after the user enters a query — and the answer is Crystal's synthesized response, which is faster to read than finding and opening the right doc page."

"Not always," Marcus Kim said. "For operational questions, yes. For procedural questions — 'how do I set up SSO,' 'how do I configure an NPS workflow' — the right answer is a step-by-step doc page, not Crystal's prose restatement of that doc page. We should not use Crystal to paraphrase documentation. We should use Crystal to answer questions that documentation cannot answer."

Sarah stepped in. "I think the resolution is: Crystal-first in the input layer, docs-first in the results layer. The unified input is Crystal's interface. When the result is a doc page, we show the doc page first with a summary. When the result is a Crystal operational answer, we show Crystal first with citations. The hierarchy of the result depends on the type of query."

Tom confirmed the feasibility from an eval perspective: "Crystal already classifies queries by type in the skills router. We add a `preferred_result_surface` output to the classification step: `document` for procedural queries, `crystal_answer` for operational queries, `clarification` for ambiguous queries. The frontend renders accordingly."

**Decision:** Crystal-first input layer. Results layer is adaptive: procedural queries surface the relevant doc page first with a Crystal summary; operational queries surface Crystal's answer first with document citations beneath. Browse-mode documentation is accessible via a "Browse docs" link that opens a structured navigation panel. No dedicated "docs homepage" — everything flows through the unified input.

---

### Debate 5: How do we measure support quality without a human in the loop?

**The central question:** CSAT surveys require human responses. If the goal is 100% AI resolution, how do we know if the system is actually working well?

Tom opened with a clear problem statement: "Our current support quality metrics are all lagging indicators. Ticket volume tells us there's a problem three days after users gave up. CSAT tells us users were unhappy a week after they filed a ticket. We need leading indicators that tell us Crystal is failing before users stop trusting it."

Carlos reframed: "We also need metrics that function correctly at scale without requiring a human in the loop. At 10,000 orgs, you cannot manually review Crystal responses. The measurement system has to be automated end to end."

Dr. Amira Hassan had a specific proposal: "We measure implicit satisfaction, not explicit satisfaction. Implicit signals: session ended with no escalation (positive), session ended with ticket filed (negative), user acted on Crystal's recommendation (positive), user ignored Crystal's recommendation and filed a ticket (strong negative), user returned to the same question within 24 hours (negative). Combine these into a resolution confidence score that doesn't require a single user survey."

"Resolution confidence is a proxy metric," Carlos pushed back. "A user might act on Crystal's recommendation and get a wrong outcome. We'd score that as positive. The feedback loop has to include outcome verification — did the action Crystal recommended actually solve the problem?"

"Then we measure return rate," Dr. Amira said. "If Crystal tells a user to configure their NPS workflow a certain way and they come back 48 hours later with the same problem, that's a failed resolution. We track the recurrence window per query type."

Tom validated this from the eval pipeline perspective: "We already track skill outputs and user actions in the backend. We add: (1) session resolution signal per support interaction, (2) 48-hour recurrence check, (3) action outcome tracking for Crystal recommendations that result in API calls. From these three signals we derive the Crystal Support Resolution Rate — CSRR — which is our primary quality metric."

Devon raised a UI requirement: "The implicit signal for 'user found what they needed' depends on us correctly capturing session end. If a user closes the tab, did they find their answer or give up? We need to distinguish. We can use a lightweight exit-intent card — not a survey, a single-click: 'Did you find what you needed?' that appears on the first scroll-up-toward-close gesture. Below 3 seconds on page, we don't show it — that's a bounce, not a resolved session."

**Decision:** Primary quality metric is CSRR (Crystal Support Resolution Rate), derived from implicit signals: session-end without escalation, return rate within 48 hours, action outcome tracking. Supplemented by a single-click exit-intent micro-prompt (not a survey). No mandatory CSAT forms. Human review queue samples 5% of low-confidence resolutions weekly for eval pipeline input.

---

### Debate 6: What's the right escalation experience?

**The central question:** When Crystal cannot resolve a query, what does the escalation experience look like — and how do we make it fast, pre-populated, and non-humiliating for the user?

Marcus Rodriguez opened with a strong opinion: "The worst support experience I've seen repeatedly is: AI fails to answer, user clicks 'contact support,' user is presented with a blank form. Every field the user fills out on that form is information the system already has. The system knows who they are, what org they're from, what plan they're on, what question they just asked, what Crystal tried and couldn't answer. The form should have one field: anything else you want us to know?"

Jordan was emphatic: "This is not a nice-to-have. This is table stakes. If I have just spent five minutes talking to Crystal about a problem and then Crystal escalates me and I have to re-explain the problem to a human, I have had a worse experience than if Crystal had never existed."

Devon translated to implementation: "We create an escalation payload that's assembled automatically from the Crystal session: org ID, plan, the original query, Crystal's full reasoning trace, the actions Crystal attempted, the specific point at which Crystal flagged insufficient confidence. We POST this to the ticketing backend when escalation is triggered. The human agent opens a ticket and sees the complete context before they type their first word."

Dr. Amara Osei raised a nuance: "The escalation trigger matters as much as the escalation experience. There are two failure modes: Crystal escalates too early (users feel Crystal gave up without really trying), and Crystal escalates too late (users feel trapped in a loop). The right trigger is a combination of confidence threshold below 0.65 AND the user has indicated dissatisfaction with the most recent response — either explicitly ('That didn't answer my question') or implicitly (rephrasing the same query twice)."

Marcus Rodriguez had a practical addition: "We need escalation SLA visibility in the confirmation. When Crystal escalates, the confirmation card should say: 'A support engineer will have your complete context and will respond within [X] hours.' Not 'we'll be in touch.' A specific SLA. If we can't commit to a specific SLA, we should commit to a specific queue depth update."

Sarah noted: "This requires the backend to know current ticket queue depth and compute an estimated response time. That's a real-time calculation. Carlos, is this feasible?"

Carlos: "Yes. We expose a `/api/support/queue-depth` endpoint that reads from the ticketing system and returns an estimated wait time band: under 2 hours, 2-8 hours, next business day. The escalation card renders the current band. We don't promise a specific time — we promise a band, and we can honor that with SLA monitoring on the backend."

**Decision:** Escalation triggers on confidence below 0.65 AND implicit or explicit user dissatisfaction signal. Escalation card is pre-populated: all Crystal session context, zero re-entry fields, one optional free-text "anything else?" The card shows current queue SLA band. Human agent receives full session context as structured data. Escalation is a one-click action from the Crystal response.

---

### Debate 7: How do we keep docs current across 247 tracked features?

**The central question:** Experient has 247 tracked features in TRACKER.md, a daily shipping cadence, and a TypeScript backend with Zod schemas. How do docs stay current without a dedicated docs team?

Lisa opened with her architecture: "The answer is differential regeneration on every merge to main. We have three source-of-truth artifacts that are already maintained as part of the engineering workflow: the Zod schemas in `backend/src/schemas/`, the route files in `backend/src/routes/`, and the TRACKER.md status entries. From these three, we can generate complete documentation for every feature. The pipeline runs on CI, regenerates only the docs for changed files, and deploys to the support site automatically."

"The pipeline is sound," Dev said. "The question is quality. Machine-extracted schemas produce technically accurate but narratively empty docs. 'POST /api/billing — creates a billing record' is accurate and useless. We need Crystal to generate the narrative layer — the explanation of what the endpoint does, when to use it, what the common errors are."

"Crystal is not free," Tom added. "Running Crystal over every changed schema on every merge is expensive if we're not careful about model selection. I want to see a model tiering: Haiku for first-draft narrative generation, quality eval against a rubric, Sonnet escalation only if the eval score is below threshold."

Priya raised the frontend implication: "The support site is a React app. If we're deploying doc updates on every merge, we need incremental static regeneration, not a full rebuild. I've built this pattern before at Vercel. Changed doc pages rebuild in isolation. The rest of the site serves from cache. Deploy time is proportional to the number of changed files, not the total doc count."

"What about features that are in Beta or In Progress?" Marcus Rodriguez asked. "If a feature is live but incomplete and Crystal generates docs for it from the current schema, we might be documenting behavior that's about to change."

Lisa had this solved: "TRACKER.md has a status field for every feature. The pipeline reads that status and automatically prepends the appropriate callout to the generated page: a yellow 'Beta' callout, an amber 'In Progress' callout, or nothing for 'Done / Tested'. We never hand-write these callouts — they're driven by TRACKER.md status. The only human action required is keeping TRACKER.md accurate, which the team already does."

Carlos raised the stale window problem: "There's a gap between when a feature ships and when the docs regenerate. On a fast merge-to-main cadence, that window might be 15-30 minutes. Is that acceptable?"

Lisa: "Yes, with one condition: the support site displays a `Last updated` timestamp on every page. Users can see exactly when a doc was generated. If the timestamp is 20 minutes old and the feature just shipped, they know to check back."

**Decision:** Docs auto-generate from Zod schemas + route files + TRACKER.md on every merge to main. Pipeline: CI extracts changed artifacts → Crystal Haiku generates narrative → quality eval → Sonnet escalation if needed → status annotation from TRACKER.md → ISR deploy. Human annotation only for below-threshold quality (estimated under 5%). All pages show `Last updated` timestamp. Status callouts are TRACKER.md-driven.

---

## Design Principles

Seven principles emerged from these seven debates. Each one resolves a tension that the debates exposed. Each one has a concrete implementation rule so that "principle" does not become euphemism for "aspiration."

---

### Principle 1: Crystal Is the Interface, Not a Feature

**Statement:** Crystal is not a chatbot added to a support page. Crystal is the page. Every user action — query, escalation, doc navigation — flows through Crystal's unified input and routing layer.

**Emerged from:** Debate 1 (Crystal as reasoning engine, not search engine) and Debate 4 (Crystal-first input layer).

**Implementation rule:** There is no separate "search" UI and no separate "chat" UI. There is one input field. All query routing — to documents, to Crystal operational answers, to escalation — happens behind that single field. The field is always present, always focused by default.

---

### Principle 2: Provenance Is Trust

**Statement:** Users trust Crystal's answers when they can verify them. Every Crystal response shows exactly where it came from: which doc pages, which data points, which system states.

**Emerged from:** Debate 3 (handling AI skepticism through citation, not disclaimer).

**Implementation rule:** Crystal support responses always include a collapsible Sources section. Sources are clickable links to the specific doc page, data record, or system state that informed the answer. Removing citations from a Crystal response is not permitted for usability reasons.

---

### Principle 3: The Escalation Cost Is Zero

**Statement:** Escalating from Crystal to a human costs the user nothing. They do not re-explain. They do not re-enter. They confirm and wait.

**Emerged from:** Debate 6 (pre-populated escalation experience).

**Implementation rule:** The escalation payload is assembled automatically from the Crystal session before the user clicks anything. The escalation card has one optional field. The human agent receives full session context as structured data. Any implementation that requires users to re-enter information that the system already has is a defect.

---

### Principle 4: Docs Are a Rendered View of Code

**Statement:** Documentation is not written — it is generated. Code is the source of truth. Docs are what the code looks like when rendered for humans.

**Emerged from:** Debate 7 (auto-generation from Zod schemas and TRACKER.md).

**Implementation rule:** No feature documentation is hand-written. If a doc page requires a human to write it from scratch, the source artifacts (schema, route, TRACKER.md entry) are incomplete. Fix the source, regenerate the doc.

---

### Principle 5: Quality Is Measured in Outcomes, Not Responses

**Statement:** A Crystal response is not good because it sounds confident. A Crystal response is good because the user who received it did not return with the same problem within 48 hours.

**Emerged from:** Debate 5 (implicit quality metrics, CSRR).

**Implementation rule:** Crystal support quality is measured by CSRR (Crystal Support Resolution Rate) — the percentage of support sessions that end without escalation and without a recurrence within 48 hours. This metric is surfaced in the admin dashboard and feeds the Crystal eval pipeline weekly.

---

### Principle 6: Latency Is a Product Decision

**Statement:** Every network round-trip added to the support experience is a product decision with a measurable cost in user completion rates. It requires justification.

**Emerged from:** Debate 1 (parallel fast-path and Crystal reasoning) and Debate 2 (intent classification without extra round-trips).

**Implementation rule:** Document retrieval must return initial results within 300ms. Crystal reasoning traces must begin rendering within 500ms of query submission (not complete — begin). Any feature that adds a sequential network request to the time-to-first-answer requires explicit sign-off from the Lead Frontend Engineer citing the latency budget impact.

---

### Principle 7: Status Is Always Visible, Never Inferred

**Statement:** Users should never have to wonder whether a doc is current, whether Crystal is confident, or whether their escalated ticket is in the queue. These states are explicit, timestamped, and always present.

**Emerged from:** Debate 7 (doc timestamps, TRACKER.md status) and Debate 5 (escalation SLA bands).

**Implementation rule:** Every doc page shows a `Last updated` timestamp. Crystal responses include a confidence indicator (high / medium / low — derived from the skill's internal score). Escalation confirmation cards show the current SLA band. None of these are optional UI elements — they are required fields in the response contract.

---

## North Star Metrics

The support system is not a soft product. It has hard performance targets. Six metrics define success.

---

### 1. CSRR — Crystal Support Resolution Rate

**Definition:** The percentage of support sessions that resolve without human escalation AND without the user returning with the same query within 48 hours.

A session is a "resolution" if: it ends without escalation, the user does not return within 48 hours, and — for operational queries that result in a Crystal-recommended action — the user did not reverse that action within 24 hours.

| Milestone | Target |
|---|---|
| Launch | 72% |
| 6 months | 84% |
| 12 months | 92% |

The 12-month target of 92% is not aspirational. It is the number Dr. Amira Hassan derived from the skill quality data: at current Crystal accuracy rates for tier-1 and tier-2 queries, 92% is achievable if the escalation trigger is tuned correctly and the skill coverage covers the top 200 support query types.

---

### 2. TTFA — Time to First Answer

**Definition:** The time from query submission to the user receiving a substantive response. For document queries, this is time-to-first-document-render. For Crystal operational queries, this is time-to-first-Crystal-response-token.

| Milestone | Target |
|---|---|
| Launch | < 800ms (p50), < 2.5s (p95) |
| 6 months | < 600ms (p50), < 1.8s (p95) |
| 12 months | < 400ms (p50), < 1.2s (p95) |

The p95 target is the engineering contract. A support system that is fast for 50% of users and slow for the other 50% fails enterprise buyers who run on the tail of the distribution.

---

### 3. DFL — Doc Freshness Lag

**Definition:** The median time between a feature change landing on main and the updated documentation page being live on the support site.

| Milestone | Target |
|---|---|
| Launch | < 45 minutes |
| 6 months | < 20 minutes |
| 12 months | < 10 minutes |

The 10-minute target at 12 months requires pipeline parallelization that Dev has scoped as a Phase 3 build. The launch target of 45 minutes is achievable with the sequential pipeline.

---

### 4. ESR — Escalation Self-Sufficiency Rate

**Definition:** The percentage of escalations where the human agent resolves the ticket in one reply — meaning the session context that Crystal pre-populated was complete enough that the agent didn't need to ask clarifying questions.

A one-reply resolution means Crystal's context capture was correct and complete. Multiple-reply resolutions indicate Crystal is missing important context or the session payload is incomplete.

| Milestone | Target |
|---|---|
| Launch | 55% |
| 6 months | 70% |
| 12 months | 82% |

---

### 5. DSC — Doc Search Coverage

**Definition:** The percentage of support queries that match at least one documentation page with above 0.75 semantic similarity. Queries below this threshold represent gaps in documentation coverage — topics users are asking about that we haven't written docs for yet.

| Milestone | Target |
|---|---|
| Launch | 78% |
| 6 months | 88% |
| 12 months | 95% |

Coverage gaps surface weekly in the admin dashboard as a ranked list of uncovered query clusters. The top 10 uncovered clusters each week trigger an auto-generated stub doc that Lisa's team reviews before publishing.

---

### 6. CQDI — Crystal Query Deflection Index

**Definition:** The ratio of support sessions handled entirely by Crystal to total support interactions, including sessions that would have become tickets on a traditional support system. This is the "what would have happened without Crystal" metric — estimated by comparing ticket volume against session volume for the same query types.

| Milestone | Target |
|---|---|
| Launch | 4:1 (Crystal handles 4 queries per ticket) |
| 6 months | 8:1 |
| 12 months | 15:1 |

The 15:1 target at 12 months implies that for every ticket a human touches, Crystal has resolved 15 queries autonomously. This is the metric Jordan Webb specifically asked for — the one that demonstrates business value of the Crystal support investment to her CFO.

---

## Technical Architecture

The support system sits at the intersection of three existing Experient subsystems: CrystalOS (skill runtime), the Express backend (API and persistence), and the React frontend (rendering and interaction). It extends each without breaking existing contracts.

### CrystalOS Layer

A new skill, `crystal-support`, is added to the skill runtime. It is a ReAct agent with four tools:

- `search_documentation(query)` — hybrid BM25 + pgvector retrieval over the support docs corpus, returning ranked document chunks with source citations
- `get_system_state(context)` — reads org-specific operational state: plan, credit balance, active features, recent events
- `get_feature_status(feature_id)` — reads TRACKER.md status for a specific feature, used to contextualize Crystal's answers with release state
- `flag_for_escalation(session_payload)` — triggers the escalation flow when confidence falls below threshold

The skill emits structured output: `{ answer, source_citations, confidence_score, reasoning_steps, escalation_recommended }`. This output contract is stable across Crystal skill runtime versions.

### Backend Layer

New routes added to the Express API:

- `POST /api/support/query` — routes a support query to `crystal-support` skill, returns structured Crystal response
- `POST /api/support/escalate` — creates a support ticket from a Crystal session payload, returns ticket ID and SLA band
- `GET /api/support/queue-depth` — returns current estimated response time band
- `POST /api/support/docs/regenerate` — CI webhook endpoint that triggers differential doc regeneration for changed file paths

### Frontend Layer

A new page, `SupportPage`, is added under the existing route structure. It uses the existing design system: `rounded-2xl` cards, glass-card backdrop-filter, gradient buttons, Framer Motion for response animations, and the house ease curve `[0.22, 1, 0.36, 1]` for all transitions.

The Crystal reasoning trace renders as a live `AnimatePresence` sequence — each reasoning step fades in at 0.06s stagger intervals, giving users a sense of Crystal working through their question rather than waiting in silence.

The escalation card uses the existing action-proposal card pattern from the Crystal closed-loop design: a preview state (showing what will be in the ticket), a confirm action, and a success state showing the SLA band.

---

## Implementation Phases

### Phase 1 — Core Support Experience (Weeks 1–6)

The unified input, `crystal-support` skill, document retrieval, and basic escalation flow. CSRR and TTFA measurement begins at launch.

### Phase 2 — Docs Auto-Generation Pipeline (Weeks 7–12)

The CI pipeline for differential doc regeneration. Crystal narrative generation. TRACKER.md status annotation. ISR deployment. DFL measurement begins.

### Phase 3 — Quality and Coverage (Weeks 13–20)

CSRR-driven eval pipeline improvements. DSC gap detection and stub generation. CQDI reporting for enterprise buyers. Escalation ESR optimization.

---

## Closing Note

This document is a design record, not a specification. The debates happened. The decisions were made. The principles and metrics are binding — they are the criteria by which implementation will be evaluated.

If an implementation decision contradicts a principle in this document, the principle takes precedence unless a new debate is convened, recorded, and appended here. Design by drift is not permitted.

The support system is not finished when it launches. It is finished when Jordan Webb can resolve every support question she has about Experient without filing a ticket — and when she trusts the answers enough to act on them.

---

*Document maintained by Sarah Chen (VP Product). Last debate: June 2026. Next review: September 2026.*
