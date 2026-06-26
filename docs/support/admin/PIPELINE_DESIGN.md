# Experient Docs Admin Pipeline — Design Document

**Status:** Design  
**Owner:** Documentation Engineering + Frontend + Backend  
**Companion to:** [CONTENT_ENGINE.md](../CONTENT_ENGINE.md) · [ARCHITECTURE.md](../ARCHITECTURE.md) · [DESIGN.md](../DESIGN.md)  
**Route:** `/admin/support` (embedded in Experient app, behind `role: doc_admin` gate)  
**Last updated:** June 2026

---

## What This Document Is

The Content Engine (see [CONTENT_ENGINE.md](../CONTENT_ENGINE.md)) is a fully automated pipeline. Code changes on `main` → CI extracts artifacts → the `doc-writer` Crystal skill generates a draft → `crystal-eval` scores it → docs publish or queue for annotation automatically.

The Content Engine does not need a human to operate. It does not stop when humans are away. It does not ask for permission.

The Admin Pipeline is what happens when humans need to see inside that machine — to review a draft before it goes live, clear a backlog of flagged docs, understand why a doc was rejected, monitor quality trends over time, and intervene when the automated system encounters something it cannot resolve alone.

This document designs that layer: a visual dashboard embedded in the Experient app where the doc-eng team (the "doc admins") can see every document moving through the pipeline at any moment, act on the ones that need them, and stay out of the way of the ones that don't.

---

## The Engineering War Room — 8 People

Eight people built this design. They do not agree on everything. Several of them still don't agree on the decisions that got made. That tension is on the record here because understanding what was argued against is as important as understanding what was chosen.

---

### Kenji Watanabe — Head of Content Operations

Kenji spent six years on the GitHub Docs team, the last three running the PR-review pipeline that processes 400+ documentation changes per week across github.com/docs. He helped build the tooling that lets a 15-person docs team manage documentation for one of the most-used developer platforms on Earth. His organizing principle is throughput: a review gate that slows publishing is, in his view, worse than a slightly imperfect doc, because documentation that ships late is documentation that doesn't exist. He is allergic to mandatory checkboxes and believes most review processes are anxiety management for stakeholders who aren't close enough to the work to assess risk accurately.

---

### Fatima Al-Rashid — Senior Engineer

Fatima built Notion's block-level conflict resolution and collaborative editing system — the infrastructure that lets two people edit the same paragraph without destroying each other's work. She thinks in merge semantics: what is a "write," who owns it, what happens when two writes conflict, and how you resolve it without losing information. Her deepest concern in this project is what happens when Crystal regenerates a doc that a human has already edited. She has seen collaborative editing systems fail because they treated all writes as equal when they weren't, and she is determined not to repeat that mistake here.

---

### Devon Clarke — Lead Frontend Engineer

Devon spent three years at Vercel building core performance infrastructure for Next.js App Router. He measures First Contentful Paint in milliseconds and considers anything above 600ms a personal affront. His criteria for any new UI feature are: does it render in under 600ms, does it use virtual scrolling if the list could exceed 50 items, and does it ever block the main thread? He pushes back on patterns that are visually elegant but computationally expensive, and on state management approaches that will become memory leaks in six months when nobody remembers why they were implemented the way they were.

---

### Lisa Park — Documentation Engineering Lead

Lisa has survived two broken doc review pipelines at previous companies. She can tell you exactly why they died: review fatigue (every doc looked the same urgency), unclear ownership (who is responsible for this review?), and the "I'll get to it later" problem (review queues that feel optional become queues nobody checks). She has strong opinions about smart triage — the idea that not everything needs human review, and that a system which treats a routine API reference regeneration the same as a first-time AI-generated guide for a new enterprise feature will produce a queue that everyone quietly learns to ignore.

---

### Carlos Mendes — Enterprise Architect

Carlos designed Experient's multi-tenant isolation layer and thinks in terms of queues, workers, and SLAs. He is the person in any design meeting who asks "what happens when 50 docs change in a single push" and "how do we prevent this review queue from becoming a 300-item backlog by Tuesday?" He does not trust process discipline to contain queue growth. He trusts architectural limits, priority tiers, and automatic routing rules that degrade gracefully under load.

---

### Dr. Amira Hassan — AI Research Lead

Amira has a PhD in information retrieval from Berkeley and published work on zero-shot enterprise support resolution before joining Experient. She wants to automate as much of the doc review process as possible and is prepared to fight hard against mandatory human gates that she believes exist more to make people feel safe than to actually improve quality. Her position: a doc with a quality score of 0.90 has been evaluated against five accuracy and completeness criteria by a purpose-built Crystal skill. Having a human skim it for 90 seconds and click approve adds no measurable quality signal. It only adds latency.

---

### Sarah Chen — VP Product / Chair

Sarah was a senior PM at Qualtrics before joining Experient. She kills features that don't serve a clear job-to-be-done by asking two questions: who is the actual user, and what are they doing at 9am on Monday that this feature makes better? She forces the debate back to the concrete user scenario every time it drifts into abstract principle. Her tolerance for features that serve organizational anxiety rather than user need is zero.

---

### Marcus Rodriguez — Head of Customer Success

Marcus has managed enterprise support queues at Intercom, Freshdesk, and a Series B startup he helped scale from 12 to 180 enterprise customers. He has been burned, personally and professionally, by wrong documentation going live. He knows that not all docs are equal: an API reference with incorrect authentication instructions is catastrophic — it blocks developers, generates support tickets, and erodes trust in a way that takes weeks to repair. A guide with a slightly unclear paragraph is fine; a customer reads past it and figures it out. His position is that the admin pipeline needs to understand the difference between these two types of errors and treat them accordingly.

---

## Five Sharp Debates

---

### Debate 1: Auto-approve vs. Mandatory Human Review

**The motion:** All docs with a quality score ≥ 0.85 should publish automatically, zero human gate.

---

Dr. Amira Hassan opened with a sharp framing: "The `crystal-eval` skill scores every generated doc against five criteria — accuracy, completeness, code example validity, clarity, and status badge correctness. A score of 0.90 means the doc passes 90% or more of those checks. Show me the evidence that a human reviewer looking at that doc for 90 seconds catches something that five automated criteria missed. I'll wait."

Marcus Rodriguez did not wait: "The evidence is every enterprise trust incident I've cleaned up after. The `crystal-eval` criteria don't check whether the doc is complete *for the specific version of the feature that just shipped*. They check internal consistency. A doc that's internally consistent but describes last sprint's behavior, not this sprint's behavior, scores 0.92 and is wrong. The human reviewer is not checking grammar — they're checking whether the doc matches what they know shipped this morning."

Kenji had data from GitHub Docs: "On our pipeline, mandatory human review for every doc change averaged 47 minutes between push and publish. We got that down to 11 minutes by splitting into tiers: auto-approve for regenerations of existing docs with delta below a threshold, human review only for net-new docs and docs with structural changes. The review rate dropped from 100% to 23%. Quality incidents did not increase."

Dr. Amira pressed: "Kenji's data is the argument. 23% review rate, no quality regression. Let's extend that logic: if `crystal-eval` scores above 0.90, we're in the auto-approve zone. We are not asking humans to replicate what the eval already did."

Marcus held firm: "I'm willing to accept auto-approve above a threshold. I am not willing to accept the same threshold for all doc types. An API reference doc with auth instructions gets a different threshold than a getting-started guide. The cost of error is different."

Sarah synthesized the resolution: "Tiered approval. The tier is a function of quality score AND doc type. High score, low-risk doc type: publish immediately. High score, high-risk doc type: 2-hour optimistic window — publish, but with a brief hold period during which an admin can intervene without unpublishing. Below a threshold: explicit approval required."

**Decision — Tiered Approval:**

| Score | Doc Type | Behavior |
|-------|----------|----------|
| ≥ 0.90 | Any | Auto-publish immediately. No human action required. |
| 0.75–0.89 | Low-risk (guide, changelog, feature overview) | 2-hour optimistic window — publishes unless admin rejects within 2 hours. Admin sees the item in their queue with a countdown. |
| 0.75–0.89 | High-risk (API reference, auth guide, integration doc) | Requires explicit admin approval. Sits in `PendingReview` state. |
| 0.65–0.74 | Any | Requires annotation + explicit approval. Assigned to an annotator. |
| < 0.65 | Any | Rejected. Existing doc preserved. `doc_gap` created. |

High-risk doc types are defined by a `doc_risk_tier` field on each `support_docs` row: `critical` (API reference, auth, billing, integration) or `standard` (guides, features, changelog). `critical` type forces explicit approval at 0.75–0.89 even if the score would otherwise qualify for optimistic window.

---

### Debate 2: Where Does the Admin UI Live?

**The motion:** The admin pipeline should be inside the main Experient app at `/admin/support`, not a separate tool.

---

Devon argued for embedded: "One codebase, one CI pipeline, shared component library, shared auth via Clerk. A separate tool means a separate deploy, separate dependency updates, separate TypeScript type sync for the backend contract. The maintenance cost is real and it compounds. The Experient design system already has everything this UI needs."

Fatima pushed back: "The pipeline UI has fundamentally different information density than the main Experient app. Dense diff views. Side-by-side markdown comparisons. A review queue that wants to be keyboard-navigable. When you embed a power tool in a consumer app, you end up making the consumer app worse in the places where the tool's needs conflict with the app's patterns. The review flow wants a focused, distraction-free layout that the main nav actively works against."

Kenji had a concrete concern: "The GitHub Docs review tool is embedded in GitHub's main product. Every doc admin hates this. The navigation competes with your attention. The PR review UI fights with the rest of GitHub. The best doc review experiences I've used — Vale, Mintlify's admin panel — are purpose-built. Fatima is right that the information density mismatch matters."

Lisa brought it back to the user: "Let me give you the Monday 9am story. Neha on the doc-eng team opens her laptop. She has three things to do: clear the review queue, check what's new since Friday, and see if any doc gaps got created over the weekend. Those three jobs do not require her to be inside the Experient app. They require a clean, fast interface for documentation work. The question is whether embedding in Experient is a constraint or a convenience."

Devon landed the resolution: "Embed it, but give it a focus mode that removes the main SideNav and collapses the header. When a doc admin enters the review queue, the UI shifts into a keyboard-first, full-viewport layout. The main app navigation is accessible via a single button but doesn't compete for attention during active review. Best of both: shared codebase and auth, focused UX when you need it."

**Decision:** Embedded in Experient app at `/admin/support`. Behind `role: doc_admin` gate. A "Focus Mode" toggle collapses the main SideNav and hides the TopBar, entering a keyboard-first full-viewport review layout. Keyboard shortcuts for approve (`A`), reject (`R`), edit (`E`), skip (`S`), and next (`→`). Exit Focus Mode via `Esc`.

---

### Debate 3: How Do We Handle Crystal Overwriting Human Edits?

**The motion:** When a source file changes and Crystal regenerates a doc that a human previously edited, Crystal's new draft should replace the human edit.

---

Dr. Amira argued for a pragmatic position: "A human edited a section of an API reference. The route file changed. Crystal regenerated the doc. The new Crystal draft is based on the new source. The human's previous edit was based on the old source. Automatically preserving the human edit means we're publishing a doc that says the old thing about the new API. That is a quality regression, not a quality preservation."

Fatima pushed back hard: "The human edit was not just a restatement of the source. It was an improvement. A human looked at Crystal's draft, saw that the explanation of an authentication flow was technically correct but confusing, and rewrote it in a way that made it clearer. That improvement did not become invalid because the route file changed. Crystal's new draft will have the same clarity problem Crystal's old draft had, because the underlying generation hasn't improved."

Carlos asked the hard question neither of them had fully addressed: "How do you detect, at the database level, which sections are 'factual' — pulled from the source schema — and which sections are 'stylistic' — human judgment about how to explain a concept? The section boundaries in a Markdown doc are headings. Are you proposing to track edits at heading granularity?"

Fatima had a concrete answer: "Section-level locking. When an admin edits a specific section of a doc in the admin UI, that section is marked `human_edited = true` in a `section_locks` table. On Crystal regeneration, we pass the existing doc with its locked sections marked. The `doc-writer` skill's prompt instructs it to preserve locked sections verbatim and regenerate only the unlocked sections. Merge semantics, not overwrite semantics."

Dr. Amira raised the edge case: "What if a human locks the Parameters section of an API reference, then the endpoint adds three new parameters? Crystal's regeneration can't add those parameters to a locked section."

Fatima had anticipated this: "Lock expiry. When a source file changes — detected by `source_hash` diff — locks on sections that are downstream of changed source regions get flagged as `stale_lock`. The admin sees a warning: 'This section was manually edited. The source file changed. Review and re-confirm or unlock.' The admin resolves it. We don't silently overwrite, and we don't silently preserve stale human edits."

**Decision — Section-Level Locking:**

- Admins can lock any section of a doc via the edit UI. Lock is stored in `section_locks` table with `section_id`, `doc_id`, `admin_user_id`, `locked_at`.
- `human_edited = true` on locked sections.
- On Crystal regeneration: locked sections are passed to `doc-writer` as preserved content. Unlocked sections are regenerated.
- When `source_hash` changes on a doc with locked sections: locks that cover factual sections (Parameters, Authentication, Errors — detected by section heading patterns) are promoted to `stale_lock` status. Admin sees a `StaleLocksWarning` card in the review UI.
- Admin can: re-confirm the lock (overrides Crystal's regeneration for that section), unlock (Crystal regenerates), or merge manually (edit mode with Crystal's new draft shown in a diff panel).

---

### Debate 4: How Do We Prevent Review Queue Collapse at Scale?

**The motion:** At 247 tracked features and a daily push cadence, the review queue will become a permanent backlog that admins stop checking.

---

Carlos did the math aloud: "247 tracked features. Daily push cadence. Assume 5% of pushes affect doc-relevant files — that's a conservative estimate given our route and schema change frequency. That's roughly 12 doc-relevant pushes per week. If 30% of those produce docs in the 0.65–0.89 score band requiring some form of human attention, that's 3–4 docs per week in the queue. Manageable if the team is healthy and on top of it. Not manageable if two people are out, or if we hit a sprint where we push 40 route changes at once."

Kenji described the GitHub Docs solution: "Two things made the difference for us: smart batching and priority triage. Smart batching groups related docs — all docs affected by the same feature branch — into a single review item. Instead of reviewing 8 individual route docs, you review one feature package. Priority triage sorts the queue by doc type: API references and auth docs first, guides and changelogs last. Review fatigue drops when admins see a short, correctly-ordered queue, not a flat undifferentiated list."

Lisa added the behavioral dimension: "The daily digest email is a forcing function. If Neha gets an email at 8am that says '2 docs need your review today,' she acts on it. If she has to remember to open the dashboard to check the queue, she doesn't. The email exists not to deliver information she can't get elsewhere — it's to create the habit. Real-time Slack pings for a 3-item queue are noise. A morning digest is a routine."

Dr. Amira proposed the most aggressive position: "Crystal reviewing its own drafts is not a trick. The `crystal-eval` skill already scores docs. What we're discussing is a separate evaluation persona — a `doc-reviewer` skill — that reads a Crystal draft the way a human reviewer would: checks for clarity, checks for internal consistency with the rest of the doc corpus, checks for alignment with recent changelog entries. If the `doc-reviewer` score is above 0.85, the item clears the human queue. We are using a second LLM pass to reduce the human queue to items that are genuinely ambiguous or novel."

Marcus pushed back with a concrete objection: "A new `doc-reviewer` LLM pass adds latency and cost to every doc generation. More importantly, it creates a situation where docs are reviewed by the same underlying model that generated them. You can't review your own work. A separate eval pass with a different prompt is not independent review."

Kenji mediated: "Marcus is right that model self-review has limits. But the use case Dr. Amira is proposing is narrow: Crystal self-review for routine regenerations of existing docs where the delta is small. First-time generations and high-delta regenerations still go to humans. Self-review is a filter for the obvious cases, not a replacement for judgment on the hard ones."

**Decision — Three-Layer Triage:**

1. **Smart batching:** Docs changed in the same push are grouped into review batches by feature scope (detected via commit message scope tags). A batch of 8 API docs from a billing feature refactor is one review item, not eight.
2. **Priority triage:** `critical` tier docs (API reference, auth, integration) sort to the top of the queue. `standard` tier (guides, changelogs) to the bottom. Within each tier, sorted by score ascending (lowest scores first, since they need the most attention).
3. **Crystal self-review filter:** For routine regenerations of existing docs where `source_hash` diff is small (< 20% of doc content changed), a `doc-reviewer` skill pass runs. If `doc-reviewer` score ≥ 0.85: item is cleared from the human queue and auto-approved. If < 0.85: item enters the human queue with the `doc-reviewer` failure reasons annotated on the item.

Human queue target after all three layers: < 3 items per working day in steady state.

---

### Debate 5: What Does "What's New" Mean for an Admin?

**The motion:** The admin dashboard's primary view should be "what changed since my last login."

---

Sarah framed the job-to-be-done precisely: "Neha is a doc admin. She opens her laptop at 9am on Monday. She needs to know three things in under 30 seconds: is anything broken, is anything waiting for me specifically, and is there anything I need to act on right now. That's the JTBD. 'What changed since my last login' is a proxy for that JTBD, not the JTBD itself. Something could have changed that doesn't need Neha's attention at all."

Devon argued for a work queue metaphor: "Design for action. The primary view is the queue: items sorted by urgency, each item with one clear action. Like GitHub PRs. You don't go to GitHub to see 'what changed' — you go to see what you need to review. The 'what changed' view is the activity feed, which is secondary. People who conflate these two surfaces end up with dashboards that are informative but not actionable."

Fatima argued for a diff feed: "The GitHub PR metaphor breaks down when you're a doc admin who needs situational awareness, not just a task list. What if three docs auto-published over the weekend and one of them has a subtle error that the `crystal-eval` missed? Nothing in Neha's action queue alerts her to this, because the doc published automatically and left the queue. She needs a chronological feed of everything that happened — a git log for the doc pipeline — to catch things the queue doesn't show her."

Kenji, who has lived inside both metaphors: "GitHub Docs uses both. The work queue is for assignments — what is specifically waiting for my action. The activity feed is for awareness — what happened in the pipeline that I should know about even if I don't need to act. They are different surfaces serving different needs. The mistake is making one of them the primary view. Both need to be first-class."

Sarah confirmed the resolution: "Split view. Left panel is the action queue — my items, sorted by urgency, with clear CTAs. Right panel is the activity feed — everything that happened in the pipeline chronologically, filterable by doc type, score range, and outcome. Neither is a tab the other is hidden behind. Both visible at once."

**Decision — Split View Dashboard:**

- **Left panel (40% width):** Action queue. Shows only items that require the current admin's attention: items explicitly assigned, unassigned items within their scope, items in optimistic window approaching expiry. Sorted by urgency tier, then by optimistic window expiry time.
- **Right panel (60% width):** Activity feed. Every pipeline event in reverse chronological order: doc auto-published, doc rejected, batch cleared, gap created, lock expiry warning. Filterable by doc type, score range, pipeline stage, date range. Serves awareness, not action.
- **"Last seen" session tracking:** Each admin session is recorded in `admin_sessions`. The activity feed highlights events since the admin's last login with a visual marker ("New since your last visit"). This is the "what's new" answer: not a separate view, but a decoration on the feed.
- **Morning digest at 8am:** Summarizes the action queue state and links directly to the dashboard. Format: "2 docs need approval, 1 doc gap assigned to you."

---

## Design Principles

Five principles emerged from the five debates. Each resolves a tension explicitly surfaced during deliberation.

---

### Principle 1: The Queue Is the Product

**Statement:** The admin pipeline's job is to make the review queue small, correctly ordered, and actionable. A pipeline that generates a 50-item undifferentiated queue has failed regardless of how good the individual items look.

**Emerged from:** Debate 4 (queue collapse prevention).

**Implementation rule:** The action queue must never show more than 15 items to a single admin in a single session without surfacing a batch group header. Items not requiring the current admin's action are hidden from the action queue (they appear only in the activity feed). The queue length after batching and filtering is a success metric, not a vanity metric.

---

### Principle 2: Human Edits Are First-Class Writes

**Statement:** When a human edits a doc section, that edit is an intentional act by a domain expert. It survives Crystal's next regeneration unless the underlying source changes in a way that makes it factually stale. Human edits are never silently overwritten.

**Emerged from:** Debate 3 (section-level locking).

**Implementation rule:** There is no code path in the pipeline that overwrites a `human_edited = true` section without an explicit admin action resolving a `stale_lock` state. Any implementation that silently loses a human edit is a defect, regardless of quality score.

---

### Principle 3: Risk Tier Drives Threshold, Not Score Alone

**Statement:** A doc's quality score is one input to its approval routing. Its risk tier — determined by doc type — is an equal input. High-risk docs require explicit human approval at lower score thresholds than low-risk docs.

**Emerged from:** Debate 1 (tiered approval).

**Implementation rule:** The `doc_risk_tier` field on `support_docs` is set at doc creation and is derived from the source artifact type. It cannot be automatically upgraded by a Crystal skill. Only an admin can lower a doc's risk tier. When in doubt, docs default to `critical`.

---

### Principle 4: Awareness and Action Are Different Jobs

**Statement:** An admin who needs to act on a doc and an admin who needs to know what happened to a doc are performing different cognitive tasks. Conflating them in a single surface produces a dashboard that does neither job well.

**Emerged from:** Debate 5 (split view).

**Implementation rule:** The action queue contains only items requiring an action decision. It does not contain informational items. The activity feed contains everything, including auto-approved items. Surfacing auto-approved items in the action queue is a UI defect.

---

### Principle 5: The Pipeline Must Degrade Gracefully

**Statement:** A healthy pipeline runs mostly automatically. When it degrades — review queue grows, Crystal quality drops, a large push creates a burst — the degradation must be visible, bounded, and recoverable without heroics.

**Emerged from:** Debate 4 (scale), Debate 1 (auto-approve thresholds).

**Implementation rule:** The stats endpoint exposes queue depth, average review time, and quality score trend at all times. When queue depth exceeds 10 items for a single admin, a degradation alert fires to the `#doc-eng` Slack channel. When Crystal quality scores drop below 0.80 in aggregate for 3 consecutive pipeline runs, an alert fires to the AI Research Lead.

---

## Pipeline States — Full State Machine

Every document in the pipeline exists in exactly one of the following states at any moment.

---

### `Queued`

**Description:** The CI pipeline detected a source file change and queued the document for processing. The document has not yet been extracted.

**Triggered by:** GitHub Actions workflow detecting a changed artifact file in the diff.

**What the admin sees:** A pending item in the activity feed with the source file name and commit SHA. Not yet in the action queue.

**Available actions:** None. Pipeline is running.

---

### `Extracting`

**Description:** The extraction scripts are parsing the source artifact — route file, schema file, skill SKILL.md, or TRACKER.md — into structured JSON.

**Triggered by:** CI artifact extraction step starting.

**What the admin sees:** Activity feed item in progress state. Extraction duration shown in milliseconds once complete.

**Available actions:** None. Automated step.

---

### `Drafting`

**Description:** The `doc-writer` Crystal skill is generating the draft from the extracted artifact data. The LangGraph skill execution is in progress.

**Triggered by:** Successful extraction producing a valid artifact JSON.

**What the admin sees:** Activity feed item showing "Crystal drafting..." with elapsed time. If a previous version exists, the existing doc remains live during this step.

**Available actions:** None. Automated step.

---

### `QualityCheck`

**Description:** The `crystal-eval` skill is scoring the draft against five criteria: accuracy, completeness, code example validity, clarity, and status badge correctness.

**Triggered by:** `doc-writer` skill producing a complete draft output.

**What the admin sees:** Activity feed item showing "Evaluating quality...". Score visible once the step completes.

**Available actions:** None. Automated step. Duration target: < 15 seconds.

---

### `AutoApproved`

**Description:** Quality score ≥ 0.90. Doc published immediately with no human gate. (OR: routine regeneration with small source delta that passed `doc-reviewer` self-review filter with score ≥ 0.85.)

**Triggered by:** `crystal-eval` score ≥ 0.90, OR `doc-reviewer` self-review filter pass for routine regenerations.

**What the admin sees:** Activity feed entry: "Auto-published · Score: 0.94 · api.surveys.create". Green badge. Item does not appear in action queue.

**Available actions:** Admin can click into the activity feed item to view the published doc, view the eval scores, or flag the doc for manual review (which puts it back in `PendingReview` state). No action required.

---

### `PendingReview`

**Description:** Quality score 0.75–0.89 AND either (a) doc is `standard` risk tier with an optimistic 2-hour publish window, or (b) doc is `critical` risk tier requiring explicit approval.

**Sub-state A — Optimistic Window (`standard` risk):** Doc publishes in 2 hours unless an admin rejects it. Admin sees a countdown timer. Admin can approve early (publishes immediately), reject (reverts to existing doc, creates review note), or edit (enters edit mode, timer pauses).

**Sub-state B — Explicit Approval Required (`critical` risk):** Doc does not publish until an admin explicitly approves. No countdown. Existing doc remains live.

**Triggered by:** `crystal-eval` score 0.75–0.89.

**What the admin sees:** Action queue item with quality score badge, doc type, risk tier indicator, and diff view showing changes from the previous version. For Sub-state A: countdown timer in amber showing time remaining in optimistic window.

**Available actions:** Approve, Reject, Edit, Assign to colleague, View full diff.

---

### `RequiresAnnotation`

**Description:** Quality score 0.65–0.74. Draft has structural issues that the eval flagged. Requires a human to add an annotation — a 1–3 sentence note that addresses the flagged gaps — before approval.

**Triggered by:** `crystal-eval` score 0.65–0.74.

**What the admin sees:** Action queue item with a `RequiresAnnotation` badge. The eval failure reasons are listed inline: "Incomplete: Parameters section missing 2 fields from schema. Clarity: Authentication flow description is circular." The admin can read the full draft and add their annotation directly in the queue item without opening a separate editor.

**Available actions:** Add annotation (inline text field), Approve after annotation, Reject, Edit full doc, Assign to colleague.

---

### `Rejected`

**Description:** Quality score < 0.65, OR an admin explicitly rejected the draft. The existing published version of the doc (if any) is preserved. A `doc_gap` record is created if this is a first-time generation with no existing doc to fall back to.

**Triggered by:** `crystal-eval` score < 0.65, OR admin reject action.

**What the admin sees:** Activity feed entry showing the rejection reason. If a `doc_gap` was created, a link to the gap in the gap backlog. The rejected draft is preserved in `pipeline_events` for reference.

**Available actions:** Open in editor (to manually write the doc), View rejection reason, Dismiss to gap backlog.

---

### `Publishing`

**Description:** The approved doc is being written to `support_docs`, re-embedded (pgvector), and the ISR revalidation is being triggered on the support site.

**Triggered by:** Admin approve action, auto-approve threshold met, or optimistic window timer expiry without rejection.

**What the admin sees:** Activity feed item: "Publishing..." with a brief spinner. Transition to `Live` is typically < 5 seconds.

**Available actions:** None during publishing step.

---

### `Live`

**Description:** Doc is published, embedded, and live on the support site. `updated_at` timestamp recorded.

**Triggered by:** Successful publish operation.

**What the admin sees:** Activity feed entry with `Live` badge, quality score, publish timestamp, and a direct link to the live doc. In the stats view, contributes to the "published this week" and "average quality score" metrics.

**Available actions:** View live doc, Edit (creates a draft in `PendingReview` without a Crystal regeneration), Flag as stale, View history.

---

### `Stale`

**Description:** The daily staleness cron job detected that the doc's `source_file` was modified after the doc's `updated_at` timestamp, and the pipeline has not picked up the change (e.g., a CI failure or a file that is not in the diff detection scope).

**Triggered by:** Daily staleness cron at 7am UTC detecting a doc whose `updated_at < last_commit_time` for its source file.

**What the admin sees:** Activity feed item: "Stale: api.billing.create — source file changed 18 hours ago, doc not updated." Orange badge. If stale for > 24 hours, an item appears in the action queue.

**Available actions:** Trigger regeneration (re-runs the pipeline for this doc immediately), Dismiss (marks as reviewed, removes from action queue for 48 hours), Edit (manually update the doc).

---

## Admin User Stories

---

**US-01 — Morning Review Queue**

As a doc admin, I want to open the dashboard and see exactly which docs need my action today, so I can prioritize my morning without scanning through everything that happened overnight.

**Acceptance criteria:**
- Action queue loads in < 600ms and shows only items assigned to me or unassigned items within my scope.
- Items are sorted by urgency: `critical` risk tier first, then `PendingReview` items with expiring optimistic windows, then `RequiresAnnotation`.
- A header count badge shows "3 docs need action today" before the list renders.
- Items that do not require action are not visible in the queue (they are in the activity feed only).

---

**US-02 — One-Click Approve with Diff**

As a doc admin, I want to approve a Crystal-generated doc update by reviewing the diff from the previous version, not the entire document, so I can review 10 docs per hour instead of 2.

**Acceptance criteria:**
- The action queue item default view shows the diff between the previous published version and the Crystal draft (added lines green, removed lines red).
- The diff uses a side-by-side view at viewport widths > 1200px and unified diff at narrower widths.
- Pressing `A` (keyboard shortcut) approves the doc and advances to the next item.
- A "View full doc" link opens the complete draft without leaving the queue.

---

**US-03 — Annotate and Approve in the Queue**

As a doc admin, I want to add a corrective annotation to a flagged draft directly from the queue item, without opening a separate editor, so the annotation flow does not break my review rhythm.

**Acceptance criteria:**
- Pressing `E` on a `RequiresAnnotation` item expands an inline annotation text field in the queue item.
- The eval failure reasons are shown above the annotation field as prompts.
- Submitting the annotation transitions the item to `PendingReview` and places it in the optimistic window for its risk tier.
- The annotation is stored in `pipeline_events` linked to the doc and the admin's user ID.

---

**US-04 — Focus Mode for Batch Review**

As a doc admin reviewing a batch of 8 API docs after a major release, I want to enter a keyboard-first focus mode that removes all navigation chrome, so I can stay in flow and clear the batch in under 20 minutes.

**Acceptance criteria:**
- A "Focus Mode" button in the top-right of the admin panel (or keyboard shortcut `F`) collapses the SideNav and hides the TopBar.
- In Focus Mode, the keyboard shortcuts `A` (approve), `R` (reject), `E` (edit/annotate), `S` (skip), `→` (next), `←` (previous) are active.
- A batch progress indicator shows "3 of 8 reviewed" in the corner.
- Pressing `Esc` exits Focus Mode and restores the full app shell.

---

**US-05 — Section Lock During Edit**

As a doc admin who has rewritten the authentication explanation in an API reference, I want to lock that section so Crystal's next regeneration preserves my rewrite, so my work doesn't get silently overwritten on the next push.

**Acceptance criteria:**
- The doc editor shows a lock icon next to each section heading.
- Clicking the lock icon marks that section as `human_edited = true` in `section_locks` and shows a locked state indicator.
- A section count indicator shows "2 sections locked" in the editor toolbar.
- When the doc's source file changes and the locked section is flagged as potentially stale, a `StaleLocksWarning` banner appears in the action queue item: "1 locked section may need review — source file changed."

---

**US-06 — Doc Gap Backlog**

As a doc admin, I want to see the full backlog of open doc gaps (docs that were rejected or routes with no coverage), sorted by how many support tickets referenced the missing topic, so I can prioritize which gaps are hurting customers the most.

**Acceptance criteria:**
- The gap backlog page at `/admin/support/gaps` lists all open `support_doc_gaps` records.
- Default sort: `ticket_count DESC` (gaps referenced by the most tickets appear first).
- Each gap item shows: the query text that triggered the gap, the suggested doc key, the ticket count, the date created.
- Pressing `A` on a gap item assigns it to the current admin and changes its status to `in_progress`.
- An admin can click "Trigger Draft" to initiate a Crystal `doc-writer` run for that gap key, creating a new pipeline entry in `Queued` state.

---

**US-07 — Activity Feed Awareness**

As a doc admin, I want to see everything that happened in the pipeline since my last login — including docs that auto-published without my involvement — so I can catch cases where the automated pipeline made a mistake I should know about.

**Acceptance criteria:**
- The activity feed shows all pipeline events in reverse chronological order.
- Events since the admin's last session are marked with a "NEW" label.
- The feed is filterable by: event type (auto-published, rejected, flagged, annotation-required), doc category (api, guide, changelog), date range.
- Clicking any activity feed item opens a detail panel on the right with the full event context: score, diff, eval failure reasons (if any), admin who acted (if applicable).

---

**US-08 — Pipeline Stats at a Glance**

As a doc admin team lead, I want a metrics overview showing quality trends over the last 30 days, so I can tell if Crystal's doc generation quality is improving or degrading.

**Acceptance criteria:**
- The stats panel at `/admin/support/stats` shows: average quality score (trend line, 30 days), score distribution histogram (bucketed: < 0.65, 0.65–0.74, 0.75–0.89, ≥ 0.90), total docs published, human review rate (what % required human action), average time-to-publish per tier, open gap count.
- Stats update every 15 minutes (not real-time — no WebSocket required here).
- Clicking any bar in the histogram opens the activity feed pre-filtered to that score range.

---

**US-09 — Assign Review to Colleague**

As a doc admin who receives a `PendingReview` item for a Crystal-generated doc about the billing integration — a topic I'm not the domain expert on — I want to assign the review to a colleague who owns that area, so the right person reviews the right doc.

**Acceptance criteria:**
- The action queue item for any `PendingReview` or `RequiresAnnotation` doc has an "Assign" button.
- Clicking "Assign" opens a dropdown of users with the `doc_admin` role in the org.
- Assigning creates a `review_assignments` row and sends the assignee an in-app notification: "Neha assigned you a review: api.billing.create."
- The assigned item moves out of the assigning admin's action queue and into the assignee's.

---

**US-10 — Stale Doc Alert Response**

As a doc admin, when I receive a morning digest email telling me a doc has been stale for 26 hours, I want to trigger a manual pipeline re-run directly from the email link, so I don't have to log into the dashboard and find the doc to take action.

**Acceptance criteria:**
- The morning digest email includes a direct action link for each stale doc: "Regenerate now →".
- Clicking the link, after Clerk auth, triggers `POST /api/admin/support/pipeline/doc/:id/regenerate` and immediately initiates a new extraction → drafting → quality check run.
- The admin is redirected to the activity feed view for that doc to monitor progress.
- If the admin is not logged in, the link redirects to the Clerk login page and then to the intended URL after auth.

---

## Data Model Extensions

The following schema additions extend the existing `support_docs` table and add four new tables.

---

### Extensions to `support_docs`

```sql
ALTER TABLE support_docs
  ADD COLUMN pipeline_status  TEXT NOT NULL DEFAULT 'live'
    CHECK (pipeline_status IN (
      'queued', 'extracting', 'drafting', 'quality_check',
      'auto_approved', 'pending_review', 'requires_annotation',
      'rejected', 'publishing', 'live', 'stale'
    )),
  ADD COLUMN doc_risk_tier    TEXT NOT NULL DEFAULT 'standard'
    CHECK (doc_risk_tier IN ('critical', 'standard')),
  ADD COLUMN optimistic_expires_at TIMESTAMPTZ,  -- set when entering 2-hr window
  ADD COLUMN last_pipeline_run_at  TIMESTAMPTZ,
  ADD COLUMN pipeline_batch_id     UUID;          -- groups related docs into one review
```

---

### `section_locks`

Tracks which sections of a doc have been locked by a human admin.

```sql
CREATE TABLE section_locks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id        UUID NOT NULL REFERENCES support_docs(id) ON DELETE CASCADE,
  section_id    TEXT NOT NULL,          -- derived from section heading slug
  section_title TEXT NOT NULL,          -- display label
  human_edited  BOOLEAN DEFAULT true,
  lock_status   TEXT NOT NULL DEFAULT 'active'
    CHECK (lock_status IN ('active', 'stale_lock', 'resolved')),
  locked_by     TEXT NOT NULL,          -- Clerk user ID
  locked_at     TIMESTAMPTZ DEFAULT NOW(),
  stale_at      TIMESTAMPTZ,            -- when source_hash changed and this lock became stale
  resolved_at   TIMESTAMPTZ,
  UNIQUE (doc_id, section_id)
);
```

---

### `pipeline_events`

Append-only audit log of every state transition in the pipeline. Never updated; only inserted.

```sql
CREATE TABLE pipeline_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id          UUID NOT NULL REFERENCES support_docs(id),
  event_type      TEXT NOT NULL,
    -- 'queued' | 'extraction_complete' | 'draft_complete' | 'quality_check_complete'
    -- 'auto_approved' | 'pending_review_entered' | 'requires_annotation_entered'
    -- 'annotation_added' | 'approved' | 'rejected' | 'published' | 'stale_detected'
    -- 'regeneration_triggered' | 'stale_lock_flagged' | 'lock_resolved'
  from_status     TEXT,
  to_status       TEXT,
  actor           TEXT,                 -- 'system' | 'crystal' | clerk user ID
  quality_score   FLOAT,
  eval_details    JSONB,                -- full crystal-eval output
  annotation_text TEXT,                -- if event_type = 'annotation_added'
  commit_sha      TEXT,
  source_hash     TEXT,
  batch_id        UUID,
  metadata        JSONB,               -- flexible extra context
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX pipeline_events_doc_id_idx ON pipeline_events (doc_id);
CREATE INDEX pipeline_events_created_at_idx ON pipeline_events (created_at DESC);
CREATE INDEX pipeline_events_event_type_idx ON pipeline_events (event_type);
```

---

### `review_assignments`

Tracks which admin is responsible for reviewing which doc at any moment.

```sql
CREATE TABLE review_assignments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id          UUID NOT NULL REFERENCES support_docs(id),
  assigned_to     TEXT NOT NULL,        -- Clerk user ID
  assigned_by     TEXT NOT NULL,        -- Clerk user ID (or 'system' for auto-assign)
  assigned_at     TIMESTAMPTZ DEFAULT NOW(),
  status          TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'completed', 'reassigned')),
  completed_at    TIMESTAMPTZ,
  notes           TEXT
);

CREATE INDEX review_assignments_assigned_to_idx ON review_assignments (assigned_to, status);
```

---

### `admin_sessions`

Tracks when each doc admin last viewed the pipeline, used to power the "New since your last visit" feed markers and morning digest scoping.

```sql
CREATE TABLE admin_sessions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL,        -- Clerk user ID
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  feed_seen_through TIMESTAMPTZ,        -- the timestamp through which the feed was fully viewed
  UNIQUE (user_id)
);
-- Upsert on every dashboard visit: INSERT ... ON CONFLICT (user_id) DO UPDATE SET last_seen_at = NOW()
```

---

## Notification Design

Notifications fire across three channels: in-app (via the existing Novu integration), Slack (to `#doc-eng`), and email (daily 8am digest). Each channel has a distinct role.

---

### In-App Notifications (Novu)

Fires immediately. Used for direct assignments and time-sensitive items only. Not used for informational pipeline events — those live in the activity feed.

**Trigger: Doc assigned to you**
```
Title:  Review assigned: {doc_title}
Body:   {assigner_name} assigned you to review this {doc_risk_tier} doc.
        Score: {quality_score} · Due: {optimistic_expires_at or 'awaiting approval'}
Action: [Open Review →]
```

**Trigger: Optimistic window expiring in 30 minutes**
```
Title:  Doc publishes in 30 min: {doc_title}
Body:   This doc will auto-publish in 30 minutes unless you reject it.
        Score: {quality_score}
Action: [Review Now →] [Dismiss]
```

**Trigger: Stale lock detected**
```
Title:  Locked section may be outdated: {doc_title}
Body:   You previously locked the "{section_title}" section.
        The source file changed. Please review.
Action: [Review Lock →]
```

**Trigger: Queue depth exceeds 10 items for any single admin**
```
Title:  Review queue at {queue_depth} items
Body:   Your doc review queue has grown to {queue_depth} items.
        Oldest item has been waiting {oldest_item_age}.
Action: [Open Queue →]
```

---

### Slack (`#doc-eng` channel)

Used for team-level awareness and degradation alerts. Not used for individual assignments (that's in-app). Fires as formatted Slack Block Kit messages.

**Trigger: Quality score aggregate drops below 0.80 for 3 consecutive pipeline runs**
```
:warning: *Doc pipeline quality alert*
Average quality score: 0.77 (3 consecutive runs below 0.80)
Last 10 docs: [score sparkline]
Investigate: <{dashboard_url}/admin/support/stats|Open stats →>
```

**Trigger: Queue depth exceeds 15 items across the whole team**
```
:inbox_tray: *Doc review queue at {queue_depth} items*
Oldest unreviewed: {oldest_doc_title} ({oldest_item_age} ago)
Unassigned: {unassigned_count}
<{dashboard_url}/admin/support|Open pipeline →>
```

**Trigger: First-time doc generation for a new route (not a regeneration)**
```
:sparkles: *New doc generated: {doc_title}*
Score: {quality_score} · Risk tier: {doc_risk_tier}
Status: {pipeline_status_label}
<{dashboard_url}/admin/support/pipeline/doc/{doc_id}|Review →>
```

**Trigger: Doc rejected (score < 0.65) creating a gap**
```
:x: *Doc rejected — gap created: {suggested_doc_key}*
Rejection reason: {eval_failure_summary}
Source file: {source_file}
<{dashboard_url}/admin/support/gaps|View gap backlog →>
```

---

### Email Digest (8am Daily, Working Days Only)

Sent to all users with `role: doc_admin`. Scoped to each admin's personal queue. Does not contain pipeline events that don't require that admin's attention.

**Subject line (dynamic):**
- `Docs: 3 need your review today — Experient` (when queue > 0)
- `Docs: pipeline clear ✓ — Experient` (when queue = 0)

**Body structure:**

```
Good morning, {first_name}.

[IF queue > 0]
YOUR REVIEW QUEUE ({queue_count} items)

  🔴 api.billing.create — Score: 0.78 — Critical — Awaiting approval
     [Review →]

  🟡 guide.survey-builder — Score: 0.81 — 1h 23m remaining in optimistic window
     [Review →]  [Dismiss]

[/IF]

[IF doc_gaps assigned to me > 0]
YOUR ASSIGNED GAPS ({gap_count} items)

  • Missing: guide.saml-azure-setup — 4 tickets referenced this gap
    [Open gap →]

[/IF]

[IF stale_locks > 0]
STALE SECTION LOCKS ({lock_count} sections to review)

  • api.surveys.create — "Authentication" section locked by you on Jun 19
    Source file changed Jun 24. Review needed.
    [Review lock →]

[/IF]

YESTERDAY'S PIPELINE SUMMARY
  ✓ 11 docs auto-published  (avg score: 0.93)
  ○ 2 docs pending review
  ✗ 1 doc rejected (api.webhooks.create — gap created)

[Open pipeline dashboard →]
```

---

## API Routes

All routes are under `/api/admin/support/pipeline`. All require `role: doc_admin` middleware. All return standard `{ data, meta, error }` envelope.

---

### `GET /api/admin/support/pipeline`

Returns the current state of the pipeline: the action queue for the authenticated admin and the full activity feed.

**Query parameters:**
```
queue_filter:   'mine' | 'unassigned' | 'all'   (default: 'mine')
feed_since:     ISO timestamp                     (default: 30 days ago)
feed_type:      comma-separated event_type values
feed_risk_tier: 'critical' | 'standard' | 'all'
page:           integer (for feed pagination, 50 items per page)
```

**Response:**
```json
{
  "data": {
    "queue": {
      "items": [
        {
          "doc_id": "uuid",
          "doc_key": "api.billing.create",
          "title": "Create Billing Record",
          "pipeline_status": "pending_review",
          "doc_risk_tier": "critical",
          "quality_score": 0.78,
          "optimistic_expires_at": null,
          "assigned_to": "user_clerk_id",
          "batch_id": "uuid",
          "eval_failure_reasons": [],
          "has_stale_locks": false,
          "last_pipeline_run_at": "2026-06-25T08:14:22Z"
        }
      ],
      "total": 3,
      "unassigned_count": 1
    },
    "feed": {
      "items": [
        {
          "event_id": "uuid",
          "doc_id": "uuid",
          "doc_key": "api.surveys.create",
          "event_type": "auto_approved",
          "quality_score": 0.94,
          "actor": "system",
          "is_new_since_last_visit": true,
          "created_at": "2026-06-25T07:52:11Z"
        }
      ],
      "total": 47,
      "new_since_last_visit": 12,
      "next_page_cursor": "..."
    }
  }
}
```

---

### `GET /api/admin/support/pipeline/doc/:id`

Returns full detail for a single doc in the pipeline: current content, Crystal draft, diff from previous version, eval scores, section locks, pipeline event history.

**Response:**
```json
{
  "data": {
    "doc": { /* full support_docs row */ },
    "crystal_draft": "# Create Billing Record\n...",
    "previous_version": "# Create Billing Record\n...",
    "diff": { "sections": [ { "heading": "Authentication", "added": [...], "removed": [...] } ] },
    "eval": {
      "score": 0.78,
      "criteria": {
        "accuracy": 0.90,
        "completeness": 0.72,
        "code_examples": 0.85,
        "clarity": 0.80,
        "status_badge": 1.0
      },
      "failure_reasons": ["Completeness: Request body missing `idempotency_key` field present in schema"]
    },
    "section_locks": [ { "section_id": "authentication", "lock_status": "active", "locked_by": "user_xyz" } ],
    "pipeline_events": [ /* last 20 events for this doc */ ],
    "review_assignment": { /* current assignment if any */ }
  }
}
```

---

### `POST /api/admin/support/pipeline/doc/:id/approve`

Approves a doc in `pending_review` or `requires_annotation` state. If an annotation is provided, it is recorded in `pipeline_events` before publishing.

**Request body:**
```json
{
  "annotation": "Added clarification: idempotency_key is optional for non-idempotent operations.",
  "override_risk_tier": false
}
```

**Response:** `{ "data": { "doc_id": "...", "new_status": "publishing" } }`

**Side effects:**
- Inserts `pipeline_events` row (`event_type: 'approved'`).
- Transitions `pipeline_status` to `'publishing'`.
- Queues the doc for upsert + re-embed + ISR revalidation.
- Resolves the `review_assignments` row for the current admin.
- Fires `pipeline_events` row for `'published'` once the publish step completes.

---

### `POST /api/admin/support/pipeline/doc/:id/reject`

Rejects a doc draft. The existing published version is preserved. If no published version exists (first-time generation), a `doc_gap` record is created.

**Request body:**
```json
{
  "reason": "Authentication section describes v1 flow, not v2. Source was updated in PR #892.",
  "create_gap": true
}
```

**Response:** `{ "data": { "doc_id": "...", "new_status": "rejected", "gap_id": "uuid-or-null" } }`

---

### `POST /api/admin/support/pipeline/doc/:id/edit`

Saves a human edit to one or more sections of a doc draft. Supports both full-doc replacement and section-level edits. Section-level edits automatically create `section_locks` entries.

**Request body:**
```json
{
  "mode": "section",
  "sections": [
    {
      "section_id": "authentication",
      "content": "## Authentication\n\nAll requests require a Bearer token...",
      "lock": true
    }
  ]
}
```

**Response:** `{ "data": { "doc_id": "...", "sections_locked": ["authentication"] } }`

---

### `GET /api/admin/support/pipeline/stats`

Returns aggregated pipeline health metrics for the last N days.

**Query parameters:**
```
days:     integer (default: 30, max: 90)
```

**Response:**
```json
{
  "data": {
    "period_days": 30,
    "docs_published": 143,
    "docs_rejected": 4,
    "human_review_rate": 0.18,
    "auto_approve_rate": 0.82,
    "average_quality_score": 0.91,
    "score_distribution": {
      "below_065": 4,
      "band_065_074": 9,
      "band_075_089": 31,
      "above_090": 99
    },
    "average_time_to_publish_minutes": {
      "auto_approved": 2.1,
      "pending_review_standard": 47.3,
      "pending_review_critical": 93.8,
      "requires_annotation": 188.4
    },
    "quality_trend": [
      { "date": "2026-05-26", "average_score": 0.89 },
      { "date": "2026-05-27", "average_score": 0.90 },
      ...
    ]
  }
}
```

---

### `GET /api/admin/support/pipeline/gaps`

Returns the doc gap backlog, sorted by ticket count descending.

**Query parameters:**
```
status:       'open' | 'in_progress' | 'resolved' | 'all'   (default: 'open')
assigned_to:  clerk user ID | 'me' | 'unassigned'
```

**Response:**
```json
{
  "data": {
    "gaps": [
      {
        "id": "uuid",
        "query_text": "how do I configure webhook retry behavior",
        "gap_category": "missing-doc",
        "suggested_doc_key": "api.webhooks.configure-retry",
        "suggested_title": "Configure Webhook Retry Policy",
        "ticket_count": 7,
        "status": "open",
        "assigned_to": null,
        "created_at": "2026-06-20T11:44:02Z"
      }
    ],
    "total": 12,
    "open": 12,
    "in_progress": 0
  }
}
```

---

### `POST /api/admin/support/pipeline/gaps/:id/assign`

Assigns a doc gap to a specific admin (or the current user).

**Request body:**
```json
{
  "assign_to": "user_clerk_id",
  "trigger_draft": true
}
```

When `trigger_draft: true`, this route also queues a Crystal `doc-writer` run for the gap's `suggested_doc_key`, creating a new pipeline entry in `Queued` state. The admin is notified via in-app notification when the draft is ready for review.

**Response:** `{ "data": { "gap_id": "...", "assigned_to": "...", "pipeline_entry_created": true } }`

---

## Frontend Component Architecture

The admin pipeline UI lives at `/admin/support` in the main Experient app (`app/src/pages/AdminSupportPage.tsx`). It is rendered only for users with `role: doc_admin` in their Clerk session. The main `SideNav` and `TopBar` remain visible by default; Focus Mode collapses them.

### Design tokens in use

- Background: `bg-[#f5f7f9]` (Surface)
- Cards: `bg-white rounded-2xl shadow-card`
- Primary action buttons: `bg-gradient-to-r from-[#2a4bd9] to-[#8329c8] text-white rounded-xl`
- Approve button: `bg-[#059669] text-white rounded-xl`
- Reject button: `bg-[#b41340] text-white rounded-xl`
- Pending/optimistic window countdown: `text-[#d97706]`
- Stale lock warning: amber left-border card
- Quality score ≥ 0.90: `text-[#059669]`
- Quality score 0.75–0.89: `text-[#d97706]`
- Quality score < 0.75: `text-[#b41340]`
- Muted metadata: `text-[#595c5e] font-[Inter]`
- Section headings: `font-[Manrope] font-extrabold`

### Key components

| Component | Path | Purpose |
|-----------|------|---------|
| `AdminSupportPage` | `app/src/pages/AdminSupportPage.tsx` | Root page, split-panel layout, Focus Mode toggle |
| `ActionQueue` | `app/src/components/admin/ActionQueue.tsx` | Left panel — scrollable list of review items |
| `QueueItem` | `app/src/components/admin/QueueItem.tsx` | Single review item: diff preview, action buttons, keyboard shortcuts |
| `ActivityFeed` | `app/src/components/admin/ActivityFeed.tsx` | Right panel — virtualized feed list (react-virtual) |
| `FeedItem` | `app/src/components/admin/FeedItem.tsx` | Single feed event with status badge and detail expand |
| `DocDiffView` | `app/src/components/admin/DocDiffView.tsx` | Side-by-side / unified diff renderer (wraps `react-diff-viewer`) |
| `AnnotationEditor` | `app/src/components/admin/AnnotationEditor.tsx` | Inline annotation text field, expands on `E` key |
| `SectionLockControl` | `app/src/components/admin/SectionLockControl.tsx` | Lock icon and stale-lock warning inline in doc editor |
| `PipelineStats` | `app/src/components/admin/PipelineStats.tsx` | Quality trend chart + score histogram (recharts) |
| `GapBacklog` | `app/src/components/admin/GapBacklog.tsx` | Gap list with assign + trigger-draft actions |
| `OptimisticCountdown` | `app/src/components/admin/OptimisticCountdown.tsx` | Live countdown for 2-hour optimistic window items |

`ActionQueue` and `ActivityFeed` use `react-virtual` for virtual scrolling — the list renders only visible items regardless of total count, targeting < 16ms per frame at 60fps.

---

## Implementation Notes

### Wiring into existing backend

The new admin pipeline routes mount under the existing admin role gate in `backend/src/index.ts`. The `requireRole('doc_admin')` middleware already exists for the billing admin routes — the same pattern applies here. The `X-Internal-Key` internal routes for CI-triggered doc ingestion (`POST /api/internal/support/refresh-doc`) remain unchanged; the admin pipeline reads from and writes to the same `support_docs` table, coordinating via the new `pipeline_status` column.

### Optimistic window implementation

The optimistic window is implemented as a scheduled job in `backend/src/scheduler/` (the scheduler system introduced in the current branch). A job runs every 5 minutes and queries:

```sql
SELECT id FROM support_docs
WHERE pipeline_status = 'pending_review'
  AND optimistic_expires_at IS NOT NULL
  AND optimistic_expires_at <= NOW();
```

Each returned doc transitions to `publishing` state automatically. This avoids the need for a real-time timer on the backend and keeps the window enforcement reliable under server restarts.

### Focus Mode implementation

Focus Mode is a layout-level state in the React app: a boolean context value `focusMode` that, when true, renders `AdminSupportPage` in a full-viewport layout without the `SideNav` and `TopBar` slots. It does not require a separate route — it is a rendering variant of the same component tree, toggled by the `F` keydown event and exited by `Esc`. This keeps the URL stable (bookmark-able to specific queue states) and avoids a full navigation event on toggle.

---

*Document maintained by Documentation Engineering. Companion debates are canonical — implementation decisions that contradict the five debate resolutions require a new documented debate, not a silent override.*
