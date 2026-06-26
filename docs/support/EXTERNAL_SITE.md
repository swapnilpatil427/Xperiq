# Experient External Support Site — Strategic Design Document

**Site:** `support.experient.ai`  
**Date:** June 2026  
**Status:** Canonical Design — Drives Implementation  
**Prepared by:** Marketing, Growth, Legal, Brand, Product, Engineering, and Customer Voices  
**Classification:** Internal Reference — Governs External Publishing

---

## Prologue: Why This Document Is Different From the Others

The internal support docs — DESIGN.md, ARCHITECTURE.md, CONTENT_ENGINE.md — solve a content production problem: how does Experient keep its documentation accurate at the pace the product ships?

This document solves a different problem: **who is actually reading support.experient.ai, and what do they need from it?**

The answer is complicated. The internal design assumed an authenticated user with a question. But support.experient.ai is public. It is indexed by Google. It is read by a VP of CX at a Fortune 500 firm who found it searching "best NPS survey platform" and has never heard of Experient. It is read by a panicked Experient admin at 11pm who needs to fix a broken webhook before the morning executive briefing. It is read by a procurement team validating SOC 2 compliance before signing a contract.

These three people need fundamentally different things from the same URL. Getting that wrong costs Experient a sale, a customer, or a lawsuit — depending on which person you disappoint.

This document is the record of a strategic war room that worked through those tensions. The debates were real. The disagreements were sharp. The decisions are final.

---

## The War Room

We assembled nine people. They were told the rules of engagement before the session began: no deference, no softening, no waiting to say the uncomfortable thing. Every dollar of revenue eventually runs through this website — either because a customer found Experient here, got their question answered here, or decided to trust Experient here. Getting it wrong costs real money.

---

### The Attendees

**Zara Okonkwo — Chief Marketing Officer**  
Eight years at Salesforce, three at Medallia. Built Medallia's content marketing engine from near-zero to 2M monthly organic visitors. She is the most commercially-oriented person in the room and she makes no apology for it. To Zara, a support article that doesn't carry a CTA is a missed conversion — it's a warm audience who already believes in the product, and leaving without nurturing them is waste. She will fight for every pixel of conversion surface. She will argue with everyone.

**Rafael Diaz — Head of Growth & SEO**  
Built Intercom's SEO content engine. His résumé is a list of content clusters that rank. He knows the difference between a URL that Google will trust and one it will ignore. He has strong opinions about `/articles/23847` (wrong) versus `/guides/nps-surveys/how-to-calculate-nps` (right). He will correct people who use "SEO" to mean "keywords" and will spend five minutes explaining what a topical authority cluster actually is. He is allied with Zara on conversion but will disagree with her on tactics when the tactics damage long-term organic growth.

**Amara Singh — Brand Strategist & Copywriter**  
Former Figma, former Linear. She was the fourth employee at Linear and wrote the product's voice from scratch. She believes brand voice is not a style guide — it is the personality of the product made legible through language, and it is either earned by every sentence or lost by the first one that sounds like it was written by a lawyer. She will reject copy that says "navigate to the Surveys module" and insist it say "click Surveys." She will also insist Crystal says "I" instead of "The system." She has veto power over any copy sample in this document, and she used it several times.

**Dr. Kenji Mori — Legal Counsel (Privacy & Compliance)**  
GDPR, CCPA, SOC 2, HIPAA awareness. Has spent the last six years reviewing tech company public-facing sites for statements that create inadvertent warranties, disclosures that trigger GDPR article obligations, and CTAs that create implied contract terms. He does not disagree to slow things down — he disagrees to prevent Experient from printing a sentence that becomes a liability three years from now when a customer sues over it. His opinions are grounded in precedent. He will be overruled on some things. He will be right every time he is overruled.

**Priya Mehta — Content Marketing Director**  
Built Notion's help center from a scrappy collection of Notion pages into one of the most-referenced B2B help centers on the internet. She is not just a writer — she is a content taxonomist. She has a framework for the difference between "support content" (answers a question the user already has) and "discovery content" (answers a question the user didn't know they should ask). She knows that conflating them destroys both. She will propose a taxonomy. She will defend it with data. She will win most arguments about information architecture because she has run the experiment before.

**Devon Clarke — Frontend Lead**  
Already on the team. The technical counterweight to every beautiful idea that requires seventeen JavaScript bundles. He measures Core Web Vitals in milliseconds and regards a cookie consent banner that degrades LCP by 400ms as a business problem, not just a technical inconvenience. He pushes back on internationalization asks that underestimate content maintenance. He will say "that's fine if we use ISR" and "that will never pass Lighthouse" in the same meeting. His skepticism is never about laziness — it is about understanding that a support site that loads in four seconds is not a support site.

**Jordan Webb — Enterprise Customer (Fortune 500 CX Director)**  
Jordan runs CX programs at a 4,200-person financial services firm. She has filed more support tickets than anyone else in this room and she remembers every one that wasted her time. She is not a persona. She is a person. She will say "no one reads that" and mean it literally — she has watched six members of her own team fail to find the answer to a question she personally answered for them by typing a URL into Slack. She will say "just give me the answer" and mean that she does not care about Experient's conversion funnel when she is at 11pm trying to fix a broken integration. She is not mean about it. She is simply honest in a way that is clarifying.

**Marcus Kim — UX Research Lead**  
Already on the team. Six months of user research specifically on enterprise buyer and admin behavior on support sites. He has session recordings. He has heatmaps. He knows that enterprise buyers land on the Security page and spend four minutes on it before doing anything else. He knows that admins who arrive through Google go to the search box in the first eight seconds and leave if the first result does not match their intent. He does not theorize about user behavior — he measures it and then states it as fact.

**Sarah Chen — VP Product**  
Already on the team. The arbiter. She keeps the debate honest about what is actually built versus what is aspirational. She will say "Crystal doesn't do that yet" when someone proposes a Crystal-powered feature that exists only in the roadmap. She synthesizes. She calls the decision. She wrote the final resolutions below.

---

## The Debates

### Debate 1: Is This a Support Site or a Marketing Site?

**Zara:** I want a "Start free trial" CTA on every article. Every single one. We have an audience of warm, interested readers and we're just... not talking to them? That's insane. If someone reads our "How to set up NPS surveys" guide and doesn't see a path to sign up, we failed. The support site is the highest-intent marketing surface we have.

**Priya:** I built Notion's help center. I watched them add CTAs everywhere. Do you know what happened? Satisfaction scores dropped 18 points. Users reported feeling "sold to when they just needed help." The trust damage to the help center was measurable and it took two quarters to undo. Support content and marketing content have different contracts with the reader. You violate that contract at real cost.

**Zara:** Notion is a bottoms-up PLG company. Their users are individuals. We're enterprise B2B. Our readers are buyers evaluating a tool and admins maintaining a deployment. Those are completely different psychological contexts. The buyer absolutely wants to see a CTA. The admin does not. We can tell them apart.

**Jordan:** Can you though? When I'm searching "how to set up SAML with Experient" I am an admin. I have zero interest in a free trial. I'm already paying you. If I see a "Start free trial" box, I feel invisible. It signals that you don't know I exist. That is not a trust signal. That is the opposite of a trust signal.

**Rafael:** Let me separate this into a different frame. There are two kinds of pages here. There are pages that answer a question a specific person has — troubleshooting, how-to, API reference. Those are pure support. Then there are pages that exist because someone searched "what is NPS" or "best survey tools for enterprise" — those are discovery pages. I've built content clusters at Intercom. The discovery pages are marketing-adjacent. The support pages are not. The question is not whether to have CTAs — it is where they live.

**Dr. Mori:** I'll add a legal layer. Certain claims in CTA copy can create implied representations. "Start free trial — no credit card required" is fine. "Get AI-powered insights in minutes" on a page about data processing agreements could constitute a product warranty claim if the customer later argues their insights took twelve hours. I need to review any CTA copy before it goes on a page that has compliance content.

**Priya:** Kenji is right. The content type determines the rules. A troubleshooting article for "why did my webhook stop firing" should have zero marketing content. A guide titled "What is NPS and why does it matter" should be educational-first, with a soft CTA at the bottom for readers who want to try it.

**Sarah (calls the decision):** We resolve this with a content taxonomy — four types with different rules. Support articles (pure help, no CTAs). Discovery articles (educational, soft CTA at bottom only). Reference docs (pure technical, Crystal-searchable). Legal pages (Dr. Mori's domain, no CTAs). We also resolve the auth question: logged-in customers never see CTAs of any kind. Anonymous users see soft CTAs on discovery pages only. This gets built into the article template system. The taxonomy is the contract. Nobody deviates from it.

---

### Debate 2: How Do We Handle Content That Makes Promises About the Product?

**Amara:** I want the Crystal page to say "Crystal answers every question instantly." That is the aspiration, it's the brand promise, and it's what will make someone click the free trial button. Hedging kills conversion.

**Dr. Mori:** That sentence is a warranty. "Every question" — unlimited scope. "Instantly" — a time guarantee. If a customer purchases Experient based on reading that sentence and then Crystal takes 45 seconds to answer a complex insight query, they have a breach of warranty claim. I'm not being paranoid. I have case files.

**Rafael:** I want bold claims too, but Kenji is right that unverifiable claims also hurt SEO. Google's quality raters penalize pages that make performance claims without evidence. "Crystal answers every question instantly" has the YMYL problem — it's a claim about a tool that businesses depend on. If we want to rank for competitive terms, we need claims that survive a fact-check.

**Amara:** So we say nothing bold? We become another enterprise software company with a wall of careful non-statements? "Crystal may be able to assist with some queries in certain circumstances"?

**Rafael:** No — we say bold, specific, verifiable things. "Crystal resolved 84% of support queries without human escalation in Q1 2026" is bolder than "Crystal answers everything" because it's concrete, it's credible, and it's rare. Nobody else has that number. We have it because we track it.

**Dr. Mori:** That works. Specific metrics with a source citation are representations of fact, not warranties. "84% of support queries" is past tense, it's bounded, it has a reporting period. I can approve that.

**Jordan:** From my perspective, I trust specific numbers more than superlatives anyway. "Crystal instantly" sounds like marketing copy. "84% first-call resolution" sounds like something from an enterprise SLA document. I believe the second one.

**Sarah (calls the decision):** Verified, specific claims only. "Crystal resolves 84% of support queries without human escalation" (with footnote to source). "Under 3 seconds for tier-1 responses on 95% of queries" (with footnote). Any claim about Crystal's capabilities on any public page goes through a Claims Register — Dr. Mori's team reviews and dates it. Claims older than two quarters get audited against current data. Amara gets to write the copy. Kenji gets to fact-check it. Neither of them wins alone.

---

### Debate 3: Article Authorship — Crystal AI or Humans?

**Priya:** I want "Written by the Experient team" on every single article. It signals credibility, it signals accountability, and it signals that a human being stands behind this content. That matters to enterprise buyers.

**Sarah:** The problem is that Crystal auto-drafts about 80% of our articles from route files, skill SKILL.md files, and schema artifacts. We've been explicit about this in our internal docs. Saying "Written by the Experient team" when Crystal wrote the first draft is at minimum misleading.

**Amara:** It's not necessarily misleading if a human reviewed and approved it. The question is what "written by" means. Every book "written by" a famous person went through a developmental editor. Every press release "written by" a CEO went through comms. Human review is authorship.

**Dr. Mori:** The FTC has issued guidance on AI-generated content disclosure. The standard is evolving but the trend is clear: if material is substantially AI-generated and the audience would consider that material if they knew, you need to disclose. Enterprise buyers evaluating a software platform's documentation — the documentation that tells them how the product works — would absolutely consider whether it was AI-generated. We need a disclosure framework.

**Jordan:** Honestly? I don't care who wrote it as long as it's accurate. What I care about is whether the article was recently reviewed by someone who actually knows the product. I've been burned by auto-generated docs that described a feature that was removed six months ago. The recency and accuracy matter more than the authorship label.

**Marcus (UX Research):** Our session data shows a specific trust pattern: enterprise users read the "Last reviewed" date more carefully than the author name. Freshness signals confidence. We saw this in interviews with IT admins — they'd skip to the "Last updated" field before reading a single sentence. The authorship debate matters less than the freshness guarantee.

**Priya:** Then we solve both. Crystal-generated content gets "AI-drafted, human-reviewed" — which is true, accurate, and actually differentiating. Human-written content gets author attribution. And everything gets a "Last reviewed" date. That's honest and it's still credible.

**Sarah (calls the decision):** Two badges. "AI-drafted, human-reviewed" with review date for Crystal-generated content. "Written by [Name], [Title]" with date for human-authored pieces. All articles display "Last reviewed: [date]" prominently. Content that hasn't been reviewed in six months gets a warning badge and enters the review queue automatically. This is a quality signal, not a trust problem.

---

### Debate 4: How Aggressive Should the Upsell Be?

**Zara:** I want plan comparison tables in the API docs. Every developer who reads our API docs is either an existing customer integrating more deeply — in which case they might upgrade — or a prospect evaluating the API — in which case they absolutely need to see pricing. The API docs are one of our highest-conversion surfaces.

**Jordan:** I'm already a customer. I'm reading your API docs to debug a 401 error. I do not want to see a plan comparison table. I want to see what scope my API key needs. The upsell table is noise. Worse than noise — it signals that Experient doesn't know I'm already paying them.

**Rafael:** There's a simple technical answer here. We can detect auth state. Logged-in users see no upsells. Anonymous users see upsells. This is not a philosophical question — it's a personalization decision.

**Zara:** That's fine for logged-in users. But anonymous users hitting the API docs are high-intent. I want those people funneled.

**Devon:** I want to flag a technical constraint. Detecting auth state on a public Next.js site without degrading Core Web Vitals requires either SSR (which hurts TTFB on high-traffic pages) or a client-side reveal (which causes layout shift). There are ways to do this cleanly — a cookie-based auth check that runs at the edge, then ISR with personalization injected at the edge layer — but it adds implementation complexity that needs to be scoped properly.

**Dr. Mori:** If we're rendering different content to authenticated versus anonymous users, and the authenticated view omits content the anonymous view shows, we could have implications depending on what that content is. "You're logged in, we know who you are, we're hiding the price table from you" is fine from a contract standpoint. But the mechanism needs to be transparent in our Privacy Policy — we disclose that we use session state to personalize content.

**Amara:** Can we make the upsell feel like useful context rather than a sales interrupt? The problem with plan comparison tables is that they're transactional. But a soft CTA that says "Building something complex? Crystal's Enterprise tier handles multi-org deployments natively — here's how" doesn't feel like being sold to. It feels like useful information.

**Sarah (calls the decision):** Authenticated users: zero upsells anywhere, period. No exceptions. Anonymous users: soft contextual CTAs on discovery articles only — not comparison tables, not banners, single-sentence recommendations with a link. Troubleshooting articles, API reference, and legal pages are clean for all users. We measure anonymous-to-trial conversion from discovery articles only. If the number is good, Zara's instinct was right. If it's negligible, we pull them. Data decides in six months.

---

### Debate 5: Legal Pages and Compliance

**Dr. Mori:** Let me be direct about what we need. GDPR compliance requires a Privacy Policy that covers data subjects' rights under Articles 13-14, a Cookie Policy with granular consent, and a Data Processing Agreement available to enterprise customers. CCPA requires a "Do Not Sell" mechanism. SOC 2 Type II means we can put a badge on the site but we need to be careful about what the badge implies — it attests to our controls over a specific audit period, not as a permanent guarantee. And I want an AI Disclosure page — how Crystal works, what data it uses, how customers can opt out. That last one is not legally required today in most jurisdictions, but it will be. Better to have it now.

**Devon:** Cookie banners destroy Core Web Vitals. They add render-blocking JavaScript, they cause layout shift, and they are the single biggest LCP killer I see on enterprise SaaS sites. If we implement a GDPR-compliant consent banner naively, we will fail Lighthouse.

**Rafael:** There's also a traffic consequence. I have data from four different sites that shows a 12-18% bounce rate increase in EU markets after a cookie consent banner is introduced poorly. Users in Germany specifically have been trained by years of dark patterns to be hostile to cookie prompts. A bad implementation doesn't just fail on Core Web Vitals — it fails on user behavior.

**Dr. Mori:** I understand the concern but GDPR consent is not optional. We cannot avoid the banner for EU visitors.

**Devon:** The banner is not optional but the implementation is. If we run essential cookies only by default — no analytics, no advertising, no third-party trackers — then consent is not required under GDPR for those cookies. We only need consent for non-essential cookies. If our approach is: essential cookies only, first-party analytics only, no third-party trackers, then the consent banner becomes an information notice rather than a consent gate. It can be a dismissible bar, not a full-screen overlay. That passes Lighthouse.

**Zara:** I hate losing the analytics fidelity but I'll take that trade if we get clean Core Web Vitals numbers.

**Rafael:** First-party analytics is actually better for SEO work anyway. We're not tracking conversion funnels across third-party domains — we're tracking on-site behavior, which is what we need for content performance.

**Dr. Mori:** I can approve essential-only default with first-party analytics, information-notice banner, and granular consent available but not forced. I want the Cookie Policy page to be detailed, in plain English, and reviewed by me before launch. I also want a dedicated `/legal` section with all compliance pages, and I want the SOC 2 badge linked to a page that explains the scope and audit period — not just a badge floating in the footer.

**Sarah (calls the decision):** Essential cookies only by default. First-party analytics only. Cookie banner is an information notice — a dismissible bar, not a modal, not a full-page gate. Granular consent available on `/legal/cookies`. The `/legal` section contains: Privacy Policy (GDPR/CCPA compliant), Terms of Service, DPA (downloadable PDF), Security page (SOC 2 badge with scope explanation, pen test summary, responsible disclosure program), Cookie Policy, AI Disclosure. Dr. Mori reviews all legal pages quarterly and signs off on any product-claims copy before publish. SOC 2 badge links to `/legal/security`, not to the auditor's PDF directly.

---

### Debate 6: Language and Internationalization

**Zara:** We should launch in twelve languages. Our enterprise market is global. The moment a Japanese buyer sees an English-only support site they have a question about our commitment to their region.

**Devon:** Twelve languages is twelve content maintenance workflows. Every time a feature ships, someone has to update twelve versions of the article. We don't have the headcount for this. We barely have the headcount for English.

**Priya:** There's a middle path. Crystal can translate articles on demand. We already have a localization pipeline for the app — we can pipe support articles through the same translation flow and surface translated versions with a disclaimer.

**Dr. Mori:** Auto-translated legal pages are a liability. If our Privacy Policy says one thing in English and Crystal's translation of it says something different in French, and a French regulator compares them, we have a problem. Legal pages must be human-translated.

**Amara:** Auto-translation with a disclaimer also has a brand problem. If our brand voice is direct and precise in English and Crystal renders it as generic machine-translated prose in Spanish, we're not consistent. Brand voice doesn't translate automatically. You can lose years of carefully constructed tone in a single pass through a language model that doesn't know why we chose "click" over "navigate to."

**Rafael:** SEO won't work with auto-translated pages. Google wants hreflang tags, canonical handling, and sufficient translation quality to pass quality assessments. Auto-translated content typically scores poorly and can be flagged as thin content. We would actively hurt our international organic presence by launching twelve auto-translated content clusters.

**Jordan:** I'm going to be the boring voice here. In my experience, enterprise buyers in non-English markets have bilingual procurement teams. They read English documentation fine. What they care about is whether the support team can respond in their language when something breaks. That's a customer success problem, not a content problem.

**Marcus (UX Research):** We have data on this. In our session analysis, non-English sessions on competitor support sites almost universally used auto-translate at the browser level rather than the site's native translation. Users were faster to reach answers when the browser translated the page than when the site offered its own translation, because the browser translation was immediate and full-page. Site-level translation adds latency and partial coverage.

**Sarah (calls the decision):** English-first at launch. Auto-translate enabled at the browser level with no interference from us — we ensure our pages don't break under browser translation tools. An explicit "Machine-translated — may contain inaccuracies" disclaimer is added when a translated version is served, except for legal pages which have no auto-translated versions at all. Within six months of launch, human translation for Spanish, German, and French for top-level guides and the legal section. Legal pages are translated by humans only, no exceptions. We review the hreflang and canonical strategy before launch to avoid SEO penalties. Zara gets twelve languages in the roadmap, not on the launch checklist.

---

## Section 1: Content Taxonomy

The taxonomy is the contract. Every article published to support.experient.ai must be classified before it is drafted. Its classification determines its template, its CTA policy, its authorship badge, its SEO treatment, and its review pipeline.

---

### Type 1: Support Articles

**Definition:** Content that answers a question the user arrived with. The user is in a task context — they want to do something, they are stuck, or something is broken.

**Examples:** "How to export survey responses as CSV," "Why is my SAML login failing," "Crystal is not responding to my query," "How do I add a team member with read-only access."

**Rules:**
- Zero CTAs of any kind — no "Start free trial," no "See plans," no "Talk to sales"
- No marketing language, no comparative claims against competitors
- Crystal-generated articles get "AI-drafted, human-reviewed" badge with review date
- Human-written articles get author attribution
- All articles show "Last reviewed" date prominently
- Articles not reviewed in 180 days enter automated review queue
- Escalation path to human support must be visible and reachable in under two clicks

**SEO Treatment:** These pages target long-tail, task-specific queries. They will not rank for high-volume terms. Their value is in providing accurate resolution for users already in the Experient ecosystem. Do not chase high-volume keywords with troubleshooting content — that creates content-intent mismatches that Google penalizes and users abandon.

**Crystal Context Hints:** Every support article must include structured `context_hints` in its frontmatter — the entities (survey IDs, feature names, setting paths, error codes) that the Crystal support skill should use when a user asks a related question. This allows Crystal to surface the article preemptively when a user's query pattern matches.

---

### Type 2: Discovery Articles

**Definition:** Content that answers a question the user might not know they had — or content that intercepts high-intent searches from users who do not yet know Experient exists.

**Examples:** "What is NPS and how do you calculate it," "Best practices for employee engagement surveys," "How to improve survey response rates," "The difference between NPS, CSAT, and CES."

**Rules:**
- Educational tone first — the content must genuinely serve the reader regardless of whether they ever become a customer
- Soft contextual CTA at bottom only — one sentence, not a banner, not a table, not an interstitial
- CTA is conditional on auth state: authenticated users see no CTA
- No CTA in first 80% of the article — readers came for the information, not the pitch
- Author attribution for human-written pieces; "AI-drafted, human-reviewed" for Crystal-generated
- External links to authoritative sources (Bain on NPS methodology, etc.) improve credibility and SEO
- These pages should not be linked from the main support navigation — they live in `/guides/[category]/[slug]` and are primarily discovered through search

**SEO Treatment:** These are the pillar and cluster pages. They compete for high-volume, high-commercial-intent keywords. They need proper structured data (FAQ schema, HowTo schema), authoritative external citations, comprehensive internal linking, and genuine content depth — not thin keyword-stuffed pages. The minimum viable discovery article is 1,200 words with at least three concrete examples and one original data point (from Experient's own research or verified industry data).

---

### Type 3: Reference Documentation

**Definition:** Pure technical content. Schema definitions, API endpoint specifications, authentication requirements, rate limits, error codes.

**Rules:**
- Zero marketing language, zero CTAs, zero opinion
- Machine-readable first: structured data, code blocks, parameter tables
- Crystal-searchable: all reference docs must be indexed by the Crystal support skill for in-app resolution
- Version-tagged: API docs must carry the API version they describe
- Auto-generated from source artifacts (route files, Zod schemas) wherever possible — human annotation for exceptional cases only
- Exact, tested code examples in at least Python, Node.js, and curl

**SEO Treatment:** These pages rank for developer-specific queries. URL structure matters: `/api/surveys/create` beats `/api/v1/reference/POST_surveys`. Target queries like "experient api authentication," "experient webhook events list," and "experient api rate limits" — queries from developers who are already integrating or evaluating the API.

---

### Type 4: Legal Pages

**Definition:** Privacy Policy, Terms of Service, Data Processing Agreement, Cookie Policy, Security page, AI Disclosure. Governed by Dr. Mori's team.

**Rules:**
- Written and reviewed exclusively by Legal Counsel (Dr. Mori or delegated attorney)
- Plain English required — but legal accuracy is not negotiable. "Plain English" means minimizing jargon without creating ambiguity in the legal meaning
- No auto-translation: all legal pages must be human-translated before being published in any language
- Reviewed quarterly — Dr. Mori signs off on the review date
- Any change to a legal page triggers a change log entry and, if material, requires re-consent from affected users under GDPR
- Zero CTAs of any kind
- SOC 2 badge on Security page must include: audit period, auditing firm name, scope of controls, link to request the full report (gated behind a business email form)

**Specific Pages Required at Launch:**
1. `/legal/privacy` — GDPR/CCPA compliant, covers Crystal AI data usage explicitly
2. `/legal/terms` — Usage terms, Crystal AI limitations disclaimer (prominently placed, not buried)
3. `/legal/dpa` — Enterprise DPA, downloadable as PDF
4. `/legal/security` — SOC 2 Type II attestation, pen test summary, responsible disclosure
5. `/legal/cookies` — Essential-only default, granular consent interface
6. `/legal/ai-disclosure` — How Crystal works, what data it processes, opt-out mechanism

---

## Section 2: Brand Voice Guide

Amara Singh's five principles. Each principle is a constraint, not a preference. Violations fail the article review gate.

---

### Principle 1: Direct, Not Corporate

The user is a professional doing a job. The docs are a tool for doing that job. Tools should not be ceremonial.

**The test:** Would you say this sentence out loud to a colleague?

| Wrong | Right |
|-------|-------|
| "Navigate to the Surveys module via the left-hand navigation panel" | "Click Surveys in the left menu" |
| "In order to facilitate the creation of a new survey" | "To create a new survey" |
| "Please ensure that the following prerequisites have been met" | "Before you start, make sure you have:" |
| "Utilize the export functionality located within the Responses section" | "Go to Responses and click Export" |
| "This feature may not be available depending on your subscription tier" | "This requires a Growth plan or higher" |

**The failure mode:** Corporate hedging that exists to cover the writer, not to help the reader. Every "utilize" should be "use." Every "navigate to" should be "click" or "go to." Every "in order to" should be "to."

---

### Principle 2: Confident, Not Boastful

We make specific, verifiable claims. We never claim more than we can prove. Confidence is earned through precision — not through superlatives.

**The test:** Can this claim be independently verified? Does it have a source?

| Wrong | Right |
|-------|-------|
| "Crystal answers every question instantly" | "Crystal resolves 84% of support queries without human escalation (Q1 2026)" |
| "Industry-leading NPS analysis" | "Crystal's NPS skill identifies the top three drivers in your data with statistical confidence intervals" |
| "The most powerful survey platform on the market" | "Survey logic supports 40+ question types, branching, and real-time quota management" |
| "Crystal will always find the answer" | "Crystal resolves most common questions automatically. Complex account issues escalate to the support team within 4 business hours." |

**The failure mode:** Aspirational copy that sounds impressive in a brainstorming session and creates a lawsuit in year three. The Claims Register (see Section 8) enforces this. Every superlative needs a footnote or gets deleted.

---

### Principle 3: Human, Not Robotic

Crystal has a voice. It uses "I." The support site has a voice. It addresses the reader as a human.

**The test:** Does this copy remind the reader they are interacting with software?

| Wrong | Right |
|-------|-------|
| "The system has determined that your query requires escalation" | "I couldn't find what you're looking for — let me connect you with the support team" |
| "Error: Authentication failure detected for user session" | "Your session has expired. Click here to sign in again." |
| "This document provides information regarding the configuration of webhooks" | "This guide walks you through setting up webhooks in under 10 minutes." |
| "Crystal AI utilizes large language models to process user inputs" | "Crystal reads your data and your question, then reasons about them together to give you an answer." |

**The failure mode:** Technical precision that strips out all human register. Crystal should feel like a knowledgeable colleague, not a system message. The support site should feel like a well-run help center at a company that knows its users, not a legal document.

---

### Principle 4: Precise, Not Vague

Specificity builds trust. Vague claims create anxiety.

**The test:** Could a reader act on this information without having to measure something themselves?

| Wrong | Right |
|-------|-------|
| "Responses are processed quickly" | "Responses are processed within 30 seconds for surveys under 5,000 submissions" |
| "Crystal takes a moment to think" | "Crystal responds in under 3 seconds for most queries. Complex analysis may take up to 15 seconds." |
| "Large files may cause issues" | "Files over 10MB will fail. Export in batches if your dataset exceeds this limit." |
| "This feature is available to enterprise customers" | "This feature requires an Enterprise plan. Contact sales to upgrade." |

**The failure mode:** Vague language that sounds more professional but delivers less value. "Quickly," "soon," "large," and "may" are red flags. Replace them with numbers wherever possible.

---

### Principle 5: Honest About AI

Crystal has limitations. We say so. Transparency about limitations builds more trust than pretending they don't exist.

**The test:** Are we claiming Crystal can do something it demonstrably cannot do consistently?

| Wrong | Right |
|-------|-------|
| "Crystal knows everything about your account" | "Crystal has access to your survey data, response history, and billing status. It does not have access to emails or external systems unless integrated." |
| "Crystal will never give you incorrect information" | "Crystal AI may occasionally misunderstand complex questions or have out-of-date information about recently released features. If something seems wrong, check the docs or contact support." |
| "Crystal handles all your support needs automatically" | "Crystal resolves about 84% of support queries automatically. The remaining 16% are routed to the human support team." |

**The failure mode:** Marketing copy that sets false expectations. An enterprise customer who deploys Crystal expecting it to handle everything, then hits the 16% it can't handle during a business-critical moment, will never trust the platform again. Setting accurate expectations is a retention strategy.

---

## Section 3: Article Template System

Three templates. Every article maps to one. The template determines structure, not style — the voice principles govern style.

---

### Template A: How-To Article

**Use when:** The user wants to complete a specific task.

**Title format:** `How to [verb] [object]`  
Examples: "How to Export Survey Responses," "How to Configure SAML SSO," "How to Set Up a Webhook"

**Meta description format:** `Learn how to [verb] [object] in Experient. [One specific detail about the process]. [Time estimate or outcome].`  
Example: "Learn how to export survey responses in Experient. Supports CSV, Excel, and PDF formats with custom field selection. Takes about 2 minutes."

**Required sections:**
1. **Before you start** — Prerequisites (plan level, permissions, required integrations). If none: omit this section entirely. Do not write "No prerequisites" — just skip the section.
2. **Steps** — Numbered. One action per step. Each step uses the imperative voice: "Click," "Enter," "Select," not "You should click" or "Navigate to." Steps include screenshot placeholders with descriptive alt text.
3. **What happens next** — Brief description of the result. Closes the loop for the user.
4. **Troubleshooting** — Two to four common failures. Each failure is formatted as: symptom → likely cause → fix. Link to full troubleshooting article if one exists.
5. **Related articles** — Three to five links. Surfaced by Crystal based on embedding similarity to this article's content.

**Crystal context hints (frontmatter):**
```yaml
crystal_hints:
  entities: [feature_name, setting_path, related_errors]
  skill: crystal-support
  intent: how-to
  escalation_tier: 1
```

**SEO guidelines:**
- Title H1 must match the URL slug: `how-to-export-survey-responses` → "How to Export Survey Responses"
- Target long-tail task query: "export survey responses CSV experient"
- Use HowTo structured data schema
- Steps section enables Google rich result for step-by-step display in SERPs

---

### Template B: Concept Article

**Use when:** The reader wants to understand what something is, not just how to operate it.

**Title format:** `What Is [Concept]` / `Understanding [Concept]` / `[Concept]: A Guide`  
Examples: "What Is Net Promoter Score," "Understanding Crystal AI Skills," "CES vs. CSAT: A Guide"

**Meta description format:** `[Concept] explained for [audience]. [Core insight in one sentence]. [What you'll learn or be able to do after reading].`

**Required sections:**
1. **Definition** — What it is in two to three sentences. No jargon without immediate definition. No acronyms without expansion.
2. **When to use it** — Specific contexts where this concept applies. This is where discovery articles earn trust — show genuine understanding of the user's situation.
3. **How it works in Experient** — Concrete application. This is where the product connection is made — naturally, not transactionally.
4. **Examples** — Two to three worked examples. Real scenarios, not hypotheticals. For metrics articles: include the formula.
5. **Common mistakes** — What people get wrong. This is the most-read section in concept articles and the highest trust-builder.
6. **Related articles** — Crystal-surfaced links.

**Soft CTA placement (discovery articles only):**  
After the last section, one paragraph maximum. Not a button. Not a banner. Example: "If you're running NPS programs and want to track driver analysis automatically, Crystal's NPS skill does this natively — you can try it free for 14 days."

**Crystal context hints (frontmatter):**
```yaml
crystal_hints:
  entities: [concept_name, related_features, related_metrics]
  skill: crystal-support
  intent: concept
  escalation_tier: 0  # no escalation — pure information
```

**SEO guidelines:**
- Target informational-intent query: "what is NPS," "how to calculate CES"
- Use FAQ structured data for the "Common mistakes" section if formatted as Q&A
- Include authoritative external citations (Bain for NPS, Gartner for CX benchmarks)
- Minimum 1,200 words for competitive informational terms

---

### Template C: Troubleshooting Article

**Use when:** Something is broken or not working as expected.

**Title format:** `[Feature/Event] Not Working: [Brief Description]` or `How to Fix: [Error or Problem]`  
Examples: "Webhook Not Firing: Troubleshooting Guide," "How to Fix: Crystal Not Responding to Queries," "SAML Login Failing: Common Causes and Fixes"

**Meta description format:** `Troubleshooting [problem] in Experient. [Most common cause]. [Where to start fixing it].`

**Required sections:**
1. **Symptoms** — Describe what the user is experiencing. Use their language ("you see a blank screen," "you get a 401 error"), not system language ("authentication token has expired"). This is the section that makes users feel understood.
2. **Quick diagnosis** — Two to three questions that help the user identify which path applies to them. Format as: "First, check [X]. If [condition], go to Fix 1. If [other condition], go to Fix 2."
3. **Fix 1, Fix 2, Fix 3** — Each fix is: what causes this, what to do, how to know it worked. If the fix requires admin access or a specific plan, say so at the start of that fix — not at the end.
4. **If none of these work** — The escalation path. Be specific. "Open a support ticket" is not specific. "Click the Help button in the bottom-right corner, type your question, and Crystal will try to help. If Crystal can't resolve it, select 'Talk to a person' and include your organization ID (Settings → Account → Organization ID)." That is specific.
5. **Related articles** — Crystal-surfaced links to related how-to guides.

**Crystal context hints (frontmatter):**
```yaml
crystal_hints:
  entities: [feature_name, error_codes, related_settings]
  skill: crystal-support
  intent: troubleshooting
  escalation_tier: 2  # higher bar — likely needs human if not resolved by article
```

**SEO guidelines:**
- Target error-message-specific queries: "experient webhook 400 error," "crystal not responding"
- FAQ structured data for the symptom/fix pairs
- Include exact error messages users will see — they copy-paste those into Google

---

## Section 4: SEO Strategy

Rafael's framework. The content cluster strategy is the SEO strategy. There are no tactics here without the strategy.

---

### The Core Principle: Topical Authority Over Keyword Stuffing

Ranking for competitive XM and survey keywords requires Google to trust Experient as an authoritative source on those topics — not just a page that contains the keywords. Topical authority is built by comprehensive, interlinked coverage of a subject area, not by optimizing individual pages in isolation.

**The cluster model:** One pillar page covers a broad topic comprehensively. Six to twelve cluster pages cover specific subtopics in depth. All cluster pages link to the pillar. The pillar links to all cluster pages. The internal linking structure signals to Google that this is a coherent body of knowledge, not scattered thin content.

---

### URL Structure

**Decision: `/guides/[category]/[slug]`**

Rafael won this argument. The alternatives were `/articles/[id]` (no topical signal to Google), `/help/[slug]` (acceptable but no category signal), and `/support/[slug]` (conflates support and discovery). The winning structure encodes category into the URL, which Google uses as a topical signal.

```
support.experient.ai/guides/nps-surveys/how-to-calculate-nps
support.experient.ai/guides/experience-management/what-is-experience-management
support.experient.ai/guides/crystal-ai/crystal-ai-overview
support.experient.ai/guides/survey-best-practices/increase-survey-response-rates
```

API docs use a separate `/api/` prefix. Legal pages use `/legal/`. These are not guides.

---

### Content Cluster Map

#### Pillar 1: Experience Management Software
**Pillar URL:** `/guides/experience-management/experience-management-platform-guide`  
**Target query:** "experience management software" (12K monthly searches, high commercial intent)

Cluster articles:
1. "What Is Experience Management? A Complete Guide" — `/guides/experience-management/what-is-experience-management`
2. "XM vs. CRM: What's the Difference?" — `/guides/experience-management/experience-management-vs-crm`
3. "How to Build an Experience Management Program" — `/guides/experience-management/build-experience-management-program`
4. "Employee Experience vs. Customer Experience: Measuring Both" — `/guides/experience-management/employee-vs-customer-experience`
5. "Experience Management KPIs: What to Measure" — `/guides/experience-management/experience-management-kpis`
6. "How AI Is Changing Experience Management" — `/guides/experience-management/ai-experience-management`
7. "Experience Management for Enterprise: Scale Considerations" — `/guides/experience-management/enterprise-experience-management`
8. "Survey Data Alone Is Not XM: Moving Beyond Scores" — `/guides/experience-management/beyond-survey-scores`
9. "The ROI of Experience Management Programs" — `/guides/experience-management/experience-management-roi`
10. "Choosing an Experience Management Platform: 8 Questions to Ask" — `/guides/experience-management/choosing-xm-platform`
11. "How to Get Executive Buy-In for an XM Program" — `/guides/experience-management/executive-buy-in-xm`
12. "Experience Management Maturity Model: Where Is Your Program?" — `/guides/experience-management/xm-maturity-model`

---

#### Pillar 2: NPS Surveys
**Pillar URL:** `/guides/nps-surveys/nps-complete-guide`  
**Target query:** "NPS survey" (40K monthly searches, very high commercial intent)

Cluster articles:
1. "How to Calculate Net Promoter Score" — `/guides/nps-surveys/how-to-calculate-nps`
2. "NPS Benchmarks by Industry (2026)" — `/guides/nps-surveys/nps-benchmarks-by-industry`
3. "Transactional vs. Relational NPS: Which to Use" — `/guides/nps-surveys/transactional-vs-relational-nps`
4. "How to Increase Your NPS: Driver Analysis Guide" — `/guides/nps-surveys/increase-nps-driver-analysis`
5. "NPS Follow-Up Questions: What to Ask Detractors" — `/guides/nps-surveys/nps-follow-up-questions`
6. "NPS Survey Design: Question Wording and Scale" — `/guides/nps-surveys/nps-survey-design`
7. "How Often Should You Run NPS Surveys?" — `/guides/nps-surveys/nps-survey-frequency`
8. "NPS vs. CSAT vs. CES: Which Metric to Use" — `/guides/nps-surveys/nps-vs-csat-vs-ces`

---

#### Pillar 3: Crystal AI Analytics
**Pillar URL:** `/guides/crystal-ai/crystal-ai-complete-guide`  
**Target query:** "AI analytics for surveys" (8K monthly searches, high commercial intent)

Cluster articles:
1. "Crystal AI Overview: What It Does and How It Works" — `/guides/crystal-ai/crystal-ai-overview`
2. "How to Ask Crystal Better Questions" — `/guides/crystal-ai/asking-crystal-better-questions`
3. "Crystal's NPS Skill: Automated Driver Analysis" — `/guides/crystal-ai/crystal-nps-skill`
4. "Crystal Action Proposals: How to Use AI Recommendations" — `/guides/crystal-ai/crystal-action-proposals`
5. "Crystal vs. Traditional Analytics: A Practical Comparison" — `/guides/crystal-ai/crystal-vs-traditional-analytics`
6. "Crystal AI Data Privacy: What It Accesses and What It Doesn't" — `/guides/crystal-ai/crystal-ai-data-privacy`

---

#### Pillar 4: Survey Best Practices
**Pillar URL:** `/guides/survey-best-practices/survey-design-complete-guide`  
**Target query:** "survey best practices" (18K monthly searches, high commercial intent)

Cluster articles:
1. "How to Write Survey Questions That Get Honest Answers" — `/guides/survey-best-practices/write-better-survey-questions`
2. "Survey Length and Completion Rates: The Research" — `/guides/survey-best-practices/survey-length-completion-rates`
3. "How to Increase Survey Response Rates" — `/guides/survey-best-practices/increase-survey-response-rates`
4. "Survey Sampling: How to Choose Who Gets the Survey" — `/guides/survey-best-practices/survey-sampling`
5. "Avoiding Survey Bias: Common Mistakes and How to Fix Them" — `/guides/survey-best-practices/avoiding-survey-bias`
6. "Likert Scale Best Practices: 5 vs. 7 Points, Labeling, and More" — `/guides/survey-best-practices/likert-scale-best-practices`
7. "Survey Timing: When to Send for Maximum Responses" — `/guides/survey-best-practices/survey-timing`
8. "B2B vs. B2C Survey Design: Key Differences" — `/guides/survey-best-practices/b2b-vs-b2c-survey-design`
9. "How to Analyze Open-Ended Survey Responses" — `/guides/survey-best-practices/analyze-open-ended-responses`
10. "Survey Fatigue: Causes, Measurement, and Prevention" — `/guides/survey-best-practices/survey-fatigue`

---

### Schema Markup Strategy

| Page Type | Schema | Benefit |
|-----------|--------|---------|
| How-To articles | `HowTo` | Step-by-step rich results in SERPs |
| Troubleshooting articles | `FAQPage` | Expandable FAQ rich results |
| Concept/Discovery articles | `Article` + `FAQPage` (for common-mistakes sections) | Article rich results |
| API reference | `TechArticle` | Developer search result enrichment |
| Software product pages | `SoftwareApplication` | App info panel in Google |
| Legal pages | No schema required | — |

All structured data is injected at build time via Next.js `generateMetadata` — not client-side, not via tag manager. Devon's requirement: structured data must be present in the initial HTML response for correct Googlebot indexing.

---

## Section 5: Legal and Compliance Layer

Dr. Mori's domain. This section is not negotiable.

---

### Required Pages (Launch Blockers)

The following pages must exist and pass legal review before the site goes live. They are not "nice to have." They are the minimum viable compliance posture for an enterprise SaaS platform serving EU and US customers.

---

**Privacy Policy — `/legal/privacy`**

GDPR compliance requires disclosure under Articles 13-14 to data subjects. CCPA requires disclosure of data collection practices to California residents. Our Privacy Policy must cover:
- Categories of personal data collected (survey respondents, account holders, API users)
- How Crystal AI processes personal data (what it reads, what it stores, what it infers)
- Data retention periods — specific durations, not "we retain data as long as necessary"
- Data subject rights: access, correction, deletion, portability, restriction, objection (GDPR); opt-out of sale (CCPA — note: we do not sell data, but the mechanism must exist)
- International data transfers (Standard Contractual Clauses for EU-to-US transfers)
- Contact information for the DPO or privacy team

**Review schedule:** Quarterly review by Dr. Mori. Any change to how Crystal processes personal data triggers an out-of-cycle review within 30 days.

**Plain English requirement:** Every section must have a "What this means" plain-English summary next to the legal text. Legal accuracy takes priority in any conflict; the plain-English summary may not contradict the legal text.

---

**Terms of Service — `/legal/terms`**

Covers the contract between Experient and users. Must include:
- Acceptable use policy (including what cannot be done with Crystal AI's outputs)
- Crystal AI limitations disclaimer — **prominently placed, not buried in Section 14**. The disclaimer must state clearly that Crystal AI may produce incorrect outputs, that Experient's liability for Crystal AI outputs is limited, and that Crystal AI's outputs do not constitute professional advice (legal, medical, financial, or otherwise)
- Credit and billing terms (compatible with the billing.ts and creditLedger.ts implementation)
- Data ownership (customers own their survey data and responses)
- Intellectual property (Experient owns the platform, customers own their content)
- Dispute resolution and governing law

**Crystal AI limitations placement:** This is in Section 3, after the service description and before the payment terms — not buried in Section 14. If a customer ever argues that they relied on Crystal AI output to make a business decision that harmed them, this placement matters.

---

**Data Processing Agreement — `/legal/dpa`**

Required for enterprise customers under GDPR Article 28. Must cover:
- Subject matter and duration
- Nature and purpose of processing (Crystal AI specifically named)
- Types of personal data and categories of data subjects
- Processor obligations (security measures, sub-processor management, breach notification)
- Sub-processors list (OpenRouter AI specifically named, with mechanism for customer objection)
- Data deletion and return procedures

Available as a downloadable, dated PDF. Enterprise customers can request a signed version via a form on the page. The form sends to a legal@ email address and is responded to within 5 business days.

---

**Security Page — `/legal/security`**

Not just a badge. This page must include:
- SOC 2 Type II badge with: audit period (not just "SOC 2 certified"), auditing firm name, controls in scope (Security, Availability, Confidentiality), and a form to request the full report (requires business email — the report itself is not publicly downloadable)
- Penetration test summary: frequency (annual minimum), scope, who conducts it, most recent completion date
- Infrastructure security: encryption at rest (AES-256), encryption in transit (TLS 1.3), key management summary
- Access controls: SOC 2 controls summary, principle of least privilege statement, MFA requirement for admin access
- Responsible disclosure program: `/legal/security/disclosure` with a PGP key and a description of how to submit a vulnerability report, expected response time (72 hours for critical, 5 days for others), and safe harbor statement
- Incident response: what happens when there is a breach, notification timeline (72 hours to affected customers for significant breaches, per GDPR Article 33)

---

**Cookie Policy — `/legal/cookies`**

Must distinguish between:
- Essential cookies (session management, auth state, CSRF protection) — no consent required
- Analytics cookies (first-party only, no third-party trackers) — granular consent available, opt-in only
- The policy must clearly state that Experient does not use advertising cookies, does not share data with ad networks, and does not use any third-party tracking pixels

The granular consent interface on this page must actually work — not just display preferences but save them server-side and honor them on every subsequent visit.

---

**AI Disclosure — `/legal/ai-disclosure`**

This page does not yet have a legal mandate in most jurisdictions, but several are coming (EU AI Act, downstream regulations from US executive action on AI). Publishing it now signals transparency and positions Experient favorably when disclosure requirements arrive.

Must cover:
- What Crystal AI is (large language model-based, routed through OpenRouter AI)
- What data Crystal AI accesses (survey data, response data, account metadata — not emails, not external systems unless integrated)
- What Crystal AI does not do (make autonomous changes without user confirmation, access data outside the customer's organization, retain personal data beyond the session unless explicitly logged)
- How to opt out of AI features entirely (and what the product experience is without them)
- How Crystal AI outputs should be used (informational, not professional advice)
- Contact for AI-related questions or concerns

---

### Claims Register and Review Pipeline

Any page on support.experient.ai that makes a product claim — performance metric, capability description, or comparative statement — must be registered in the Claims Register.

**Claims Register format (Notion database or equivalent):**
- Claim text (exact quote as it appears on the site)
- Page URL
- Category (capability, metric, comparison, legal)
- Source (Q1 2026 CSRR data, internal benchmark, Bain methodology)
- Review date (when was this claim last verified against current data)
- Owner (who is accountable for keeping this claim accurate)
- Legal approval (Dr. Mori or delegated counsel, date)

**Review trigger:** Claims older than two quarters are automatically flagged for re-verification. Metrics claims (like the 84% CSRR) are re-sourced from current data. Capability claims are verified against the current TRACKER.md status.

---

## Section 6: Trust Signals

What enterprise buyers actually need to see before they will consider trusting Experient with their organization's experience data. Marcus Kim's user research identified these as the highest-signal trust elements for enterprise buyers in the XM category.

---

### Homepage Trust Architecture

Enterprise buyers who land on support.experient.ai through Google spend the first 30 seconds forming a trust assessment. The homepage is the trust pitch. It is not the conversion pitch — the conversion pitch lives on the marketing site. The support site's homepage trust signals answer one question: "Is this platform serious?"

**Required elements, in priority order:**

1. **SOC 2 Type II badge** — Linked to `/legal/security`. Enterprise procurement teams need to see this before they will read anything else. Badge must display the audit period year (not just a generic "SOC 2 certified" badge). Example: "SOC 2 Type II (2025-2026)"

2. **GDPR compliant badge** — Linked to `/legal/dpa`. Required signal for EU enterprise buyers, and communicates data maturity to US buyers too.

3. **Real usage number** — "Used by [X] enterprise teams." This number must be real, sourced from the billing database, and updated quarterly by the operations team. No rounding up, no "approximately." The number is verified and dated. If the number is small right now, use a different framing: "Trusted by enterprise CX teams across [X] industries" — not inflated by a specific count.

4. **Uptime SLA indicator** — A green "All systems operational" badge linked to `/status`. If there is an active incident, this becomes amber or red. This signal communicates operational maturity more clearly than any prose.

5. **"AI-drafted, human-reviewed" transparency badge** — Linked to `/legal/ai-disclosure`. This is the differentiating signal. No other XM platform has it because no other XM platform auto-generates support documentation from code artifacts. Displaying it says "we use AI and we are transparent about it" — which is a stronger trust signal than pretending the content was written entirely by humans.

6. **No "Start Free Trial" button on the support homepage.** This is a constraint, not a preference. The support homepage is where customers come when they need help. A CTA to start a free trial signals to existing customers that this page is not for them. Jordan said it clearly: it signals that Experient does not know they exist.

---

### Article-Level Trust Signals

Every article must display:
- **Authorship badge** — "AI-drafted, human-reviewed" or "[Author Name], [Title]"
- **Review date** — "Last reviewed: [Month Year]"
- **Plan indicator** (for how-to articles that require specific plan access) — "[Feature] requires Growth plan or higher"
- **Escalation access** — The Crystal widget and the "Talk to a person" option must be reachable within two clicks from any article. Not buried. Not behind a modal. Present.

---

## Section 7: Analytics and Conversion Tracking

Privacy-first measurement. No third-party cookies. No ad network pixels. First-party only.

---

### Primary KPI: Crystal Support Resolution Rate (CSRR)

**Definition:** The percentage of support sessions initiated via Crystal on support.experient.ai that end without the user selecting "Talk to a person" or submitting a support ticket.

**Why this is the primary KPI:** It measures the thing the support site is actually supposed to do — resolve user questions. Everything else is secondary. If CSRR is high, the site is working. If CSRR is low, the site has a content gap, a Crystal skill gap, or a UX gap. This metric points directly at the problem.

**Target:** ≥ 80% CSRR at launch. ≥ 85% at 6 months.

---

### Full Metrics Stack

| Metric | Definition | Collection Method | Target |
|--------|-----------|------------------|--------|
| Crystal Support Resolution Rate (CSRR) | Sessions resolved by Crystal without human escalation | Server-side event on session close | ≥ 80% |
| Search-to-Article CTR | % of search queries that result in article click | First-party search log | ≥ 60% |
| Article Satisfaction Score | % thumbs-up on article feedback widget | Server-side event | ≥ 75% |
| Escalation Rate by Article | % of article reads that end in support ticket | Join article URL to ticket origin | Track, alert on outliers |
| Time-to-Answer p50/p95 | Time from page load to user indicating satisfaction | First-party session events | p50 < 60s, p95 < 3 min |
| Stale Content Rate | % of articles not reviewed in >180 days | Content database query | < 5% |
| Anonymous→Signup Conversion | Anonymous users who sign up after reading discovery articles | First-party session with UTM | Baseline first 90 days |
| Average Crystal Turns to Resolution | Number of Crystal messages before resolution | Session log analysis | ≤ 3 turns |

---

### What We Explicitly Do Not Track

- No cross-site user tracking
- No advertising pixel of any kind (Google Ads, Meta, LinkedIn, etc.)
- No heatmap tools that capture keystrokes or form inputs
- No A/B testing tools that set third-party cookies
- No CDN-injected analytics

**Why this matters:** GDPR consent for analytics cookies is genuinely complex and legally risky for enterprise users. The simplest compliance posture is to not need consent in the first place — which means first-party only. As a secondary benefit, this is a trust signal to enterprise buyers who check the cookie banner to evaluate the vendor's data practices before buying.

---

### Analytics Implementation

First-party analytics are logged server-side via the Express backend. Client-side, lightweight POST requests fire to `/api/telemetry/support-event` for user interactions. No JavaScript tracking library. No client-side state management for analytics. Devon's requirement: analytics must not add to the JavaScript bundle or block the main thread.

Event schema:
```typescript
interface SupportTelemetryEvent {
  eventType: 'article_view' | 'search_query' | 'crystal_turn' | 'escalation' | 'satisfaction_vote' | 'cta_click';
  articleSlug?: string;
  searchQuery?: string;
  sessionId: string;        // first-party session, not linked to identity
  isAuthenticated: boolean; // boolean only — no user ID in analytics
  timestamp: string;
  durationMs?: number;
}
```

Note: `isAuthenticated` is a boolean flag only. The analytics store does not contain user IDs, organization IDs, or any personally identifiable information. The authenticated flag exists solely to enable the "authenticated users never see CTAs" rule and to segment CSRR by customer versus prospect.

---

## Section 8: External Publishing Pipeline

How an article moves from a Crystal draft to a live URL on support.experient.ai. This is the operational contract between the content engine (CONTENT_ENGINE.md), the external site, and the business teams whose review gates appear for the first time here.

---

### The Eight-Stage Pipeline

#### Stage 1: Source-Triggered Draft
**Trigger:** A source artifact changes — a route file, Zod schema, SKILL.md, or TRACKER.md entry is pushed to main.  
**Actor:** CI pipeline → Crystal content engine  
**Output:** A draft article with: title, body, meta description, crystal_hints frontmatter, suggested URL slug, content type classification  
**Time:** Automated, under 2 minutes from push

Crystal drafts with access to:
- The changed artifact (route file, schema, SKILL.md)
- The existing article (if this is an update, not a new article)
- The article template for the classified content type
- The brand voice principles (embedded in the crystal-support skill prompt)

Crystal does not have access to:
- The Claims Register (it cannot verify metric claims it makes — that is Stage 4's job)
- Legal pages (Crystal does not draft or modify legal content)

---

#### Stage 2: Quality Score Check
**Actor:** Crystal quality evaluator  
**Threshold:** ≥ 0.80 quality score for external publication. This is a higher bar than the internal support system (≥ 0.70 threshold in CONTENT_ENGINE.md).

The quality evaluator assesses:
- **Completeness** (0.0–1.0): Does the article cover all required sections for its template?
- **Accuracy** (0.0–1.0): Do the described behaviors match the source artifact? (Structural check — endpoint names, parameter names, and field names are correct)
- **Voice compliance** (0.0–1.0): Does the copy match the five brand voice principles? (Secondary Crystal pass against the voice guide)
- **Structural compliance** (0.0–1.0): Is the article format correct for its type? Does the URL slug match the title?

**Composite score:** Weighted average (accuracy 40%, completeness 30%, voice 20%, structure 10%)  
Articles scoring below 0.80 are returned to draft with specific failure reasons. They do not advance.

---

#### Stage 3: Marketing Review Gate
**Actor:** Priya Mehta's content marketing team  
**Time budget:** 48 hours maximum (SLA). Articles in this queue older than 48 hours auto-escalate to Priya directly.  
**Scope:**
- Tone and brand voice check (does this sound like us?)
- Positioning review: does this article say something that contradicts current messaging?
- Content type validation: is this classified correctly?
- SEO brief alignment: for discovery articles, does the article target the right query intent for its cluster?

**Output:** Approve, Edit (with changes), or Reject (with reason). Rejections go back to Stage 1 with editorial notes for Crystal to incorporate.

This gate did not exist in the internal support pipeline. It exists here because support.experient.ai is a public-facing brand surface. A technically accurate article that sounds like it was written by a compliance officer damages the brand. Marketing's job here is not to make the article promotional — it is to make it worth reading.

---

#### Stage 4: Legal Scan
**Actor:** Automated claims scanner + Dr. Mori review for flagged items  
**Purpose:** Detect any sentence that constitutes a product claim, performance guarantee, capability promise, or comparative statement.

**Automated scanner flags:**
- Sentences containing: "always," "never," "guarantee," "ensure," "every," "all customers," "fastest," "best," "leading"
- Sentences containing performance metrics (numbers + unit + capability description)
- Sentences containing comparative language ("better than," "unlike," "compared to")
- Sentences that describe Crystal AI capabilities in absolute terms

**For each flagged sentence:**
- If the claim is in the Claims Register and was reviewed within two quarters: auto-approve
- If the claim is NOT in the Claims Register: route to Dr. Mori for review (48-hour SLA)
- If Dr. Mori rejects the claim: returned to Stage 3 with specific language guidance

**Articles with zero flagged sentences:** Advance automatically (no Dr. Mori review needed).

---

#### Stage 5: Admin Approve and Edit
**Actor:** Support content admin (designated team member, not automated)  
**Interface:** Internal admin dashboard (`/admin/content`)  
**Time budget:** 24 hours for routine articles, 4 hours for incident-related troubleshooting articles (expedited queue)

Admin review covers:
- Final read for anything the automated stages missed
- Screenshot verification: are the screenshot placeholders accurate to the current UI?
- Internal link verification: do the "Related articles" links point to real, live articles?
- Plan indicator accuracy: does the article correctly describe plan requirements?

**Admin has full edit capability.** They are the last human editor before the article goes live. Their edit is logged. If they make substantive changes to Crystal-generated content, the authorship badge updates to "AI-drafted, edited by [Admin Name]."

---

#### Stage 6: SEO Optimization Pass
**Actor:** Automated  
**Steps:**
1. Meta description verification (150–160 characters, matches format for content type)
2. Title tag verification (H1 matches URL slug, 55–60 characters)
3. Structured data injection (HowTo, FAQPage, or TechArticle schema based on content type)
4. Internal link injection: Crystal adds three to five related-article links based on embedding similarity
5. hreflang tag injection for any translated versions
6. Canonical tag verification (no duplicate content across translated versions)
7. Image alt text verification (all screenshot placeholders have descriptive alt text)

---

#### Stage 7: Publish via Next.js ISR
**Actor:** Automated deployment  
**Method:** Next.js Incremental Static Regeneration — the article is generated as a static page and served from the CDN edge. No server-side rendering on request.  
**Revalidation trigger:** On-demand ISR revalidation via Next.js `revalidatePath` API, called from the publishing pipeline.  
**Performance target:** First Contentful Paint < 800ms. No JavaScript required for above-the-fold content. Crystal widget loads deferred.

---

#### Stage 8: Sitemap Update and Search Engine Ping
**Actor:** Automated  
**Steps:**
1. Sitemap XML is regenerated (Next.js generates this automatically from the app router)
2. Google Search Console indexing API is pinged for the new URL
3. Bing Webmaster Tools is pinged (non-trivial share of enterprise search behavior)
4. Internal search index (support.experient.ai/search) is updated with the new article's embeddings

**For updated articles (not new):**
- Old URL is preserved (no redirects unless slug changed — slug changes require a 301 redirect)
- Cache invalidated
- Search engine ping sent with the updated `lastmod` date

---

### Pipeline SLAs Summary

| Stage | Actor | SLA |
|-------|-------|-----|
| Stage 1: Crystal draft | Automated | < 2 min from push |
| Stage 2: Quality check | Automated | < 5 min |
| Stage 3: Marketing review | Priya's team | < 48 hours |
| Stage 4: Legal scan | Automated + Dr. Mori | < 48 hours (flagged items only) |
| Stage 5: Admin approve | Content admin | < 24 hours (< 4 hours for incidents) |
| Stage 6: SEO pass | Automated | < 2 min |
| Stage 7: Publish (ISR) | Automated | < 1 min |
| Stage 8: Sitemap + ping | Automated | < 5 min |
| **Total (no legal flags)** | | **< 72 hours** |
| **Total (with legal review)** | | **< 96 hours** |

---

## Appendix A: Decision Log

Every significant decision made in the war room, with the resolution.

| Decision | Resolution | Owner |
|----------|-----------|-------|
| CTA policy on support articles | Zero CTAs, no exceptions | Priya Mehta |
| CTA policy on discovery articles | Soft contextual CTA, bottom only, anonymous users only | Priya Mehta |
| Authorship badge | "AI-drafted, human-reviewed" for Crystal content; author attribution for human content | Amara Singh |
| FTC AI disclosure | Required: badge on all Crystal-generated content + `/legal/ai-disclosure` page | Dr. Kenji Mori |
| Upsell for authenticated users | Never. Zero. Not even soft. | Jordan Webb |
| Cookie consent | Information-notice banner, essential cookies only, first-party analytics only | Devon Clarke |
| Language at launch | English only; browser auto-translate not interfered with | Priya Mehta |
| Human translation target | ES, DE, FR within 6 months post-launch | Zara Okonkwo |
| URL structure | `/guides/[category]/[slug]` | Rafael Diaz |
| Product claims policy | Specific, verifiable, Claims Register, Dr. Mori sign-off required | Dr. Kenji Mori |
| Analytics | First-party only, no user IDs, server-side events | Devon Clarke |
| Marketing review gate | Required for all externally published content (Stage 3) | Priya Mehta |
| Legal scan gate | Automated scanner + Dr. Mori for flagged claims (Stage 4) | Dr. Kenji Mori |
| Content taxonomy | 4 types with distinct rules — support, discovery, reference, legal | Priya Mehta |
| Primary KPI | Crystal Support Resolution Rate (CSRR) ≥ 80% at launch | Sarah Chen |
| No "Start Free Trial" on support homepage | Constraint, not preference | Jordan Webb + Sarah Chen |

---

## Appendix B: Launch Checklist

Before support.experient.ai goes live, the following must be complete. Each item has an owner. None are advisory.

- [ ] All six legal pages published and reviewed by Dr. Mori — **Dr. Kenji Mori**
- [ ] Claims Register populated with all existing product claims — **Dr. Mori + Priya Mehta**
- [ ] Cookie consent banner implemented (information-notice style, essential cookies only) — **Devon Clarke**
- [ ] SOC 2 badge linked to `/legal/security` with audit period displayed — **Dr. Mori + Devon Clarke**
- [ ] Auth detection for CTA gating implemented and tested — **Devon Clarke**
- [ ] Crystal widget deployed on all article pages — **CrystalOS team**
- [ ] "AI-drafted, human-reviewed" badge system implemented — **Devon Clarke**
- [ ] Stage 3 (marketing review) and Stage 4 (legal scan) gates live in publishing pipeline — **Backend + Priya Mehta**
- [ ] All four pillar URLs returning 200 with at least three cluster articles each — **Priya Mehta**
- [ ] hreflang and canonical tags implemented for future internationalization readiness — **Devon Clarke**
- [ ] First-party analytics events firing and verified in the analytics dashboard — **Devon Clarke + Analytics**
- [ ] Escalation path from every article to human support verified in under two clicks — **Marcus Kim**
- [ ] Core Web Vitals passing Lighthouse audit (LCP < 2.5s, CLS < 0.1, INP < 200ms) — **Devon Clarke**
- [ ] `/status` page live and linked from trust section — **Infrastructure team**
- [ ] Responsible disclosure page live at `/legal/security/disclosure` — **Dr. Kenji Mori**
- [ ] Stale content rate < 5% at launch (no article older than 180 days without review) — **Priya Mehta**

---

*Document maintained by: Priya Mehta (Content), Dr. Kenji Mori (Legal), Devon Clarke (Engineering)*  
*Review schedule: Quarterly (content taxonomy and voice guide); On-change (pipeline stages, legal pages)*  
*Last reviewed: June 2026*
