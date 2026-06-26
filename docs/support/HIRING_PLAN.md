# Experient Support System — Hiring Plan
## Every Role, What They Own, What Breaks Without Them

**Date:** June 2026  
**Scope:** Sprint S1 through Admin Pipeline Sprint A2 (approx. 12 weeks)  
**Based on:** Complete audit of existing codebase + all docs in `/docs/support/`

---

## The Audit: What Exists vs. What's Greenfield

Before hiring, I read every file. Here is what the codebase actually has:

**Exists and battle-tested:**
- 44 backend Express routes (TypeScript, Zod-validated, all tested)
- 49 backend test files — every route has tests, coverage is real
- 45 CrystalOS skill directories — skill runtime is mature
- 35+ React pages — the component system is established
- 6 admin pages (`AdminCrystal*`) — admin section scaffolding exists
- Novu v2.6, Stripe, pg, Redis, Zod all wired and working
- Vitest + React Testing Library — frontend test infrastructure solid
- Framer Motion v12, Tailwind v4, full design token system

**Greenfield — does not exist yet:**
- `crystalos/skills/crystal-support/` — the support skill
- `crystalos/skills/doc-writer/` — the doc generation skill
- `crystalos/lib/support_classifier.py` — intent pre-classifier
- `backend/src/routes/support.ts` — 12 public support routes
- `backend/src/routes/admin-support.ts` — 8 admin pipeline routes
- `backend/src/lib/pipelineStateMachine.ts` — typed state machine
- `backend/src/scheduler/docAutoApprove.ts` — cron worker
- Database: 5 new tables + pgvector embeddings
- `.github/workflows/doc-refresh.yml` + all extraction scripts
- `support.experient.ai` — entire Next.js support site
- Admin pipeline UI — 5 pages + 6 components
- `CrystalPanel.tsx` support mode extension
- `SupportCommandPalette` (Cmd+K extension)
- Playwright E2E tests (deferred since P0-5)

**The gap is large but bounded.** Every piece has a design doc, a wireframe, an implementation spec. The work is building, not designing.

---

## Priority Hiring Order

Sequence matters. These roles block each other.

```
Week 1: Hire roles 1, 2, 3, 4, 7 — the critical path
Week 3: Hire roles 5, 6 — they ramp into Sprint S2
Week 5: Hire roles 8, 9 — they validate Sprint S3 output
Week 8: Hire roles 10, 11, 12 — launch-window specialists
```

---

## Role 1: CrystalOS Engineer (Python + AI)
**Priority:** Hire first. Blocks the entire Crystal support layer.

### What They Own
Every new CrystalOS artifact for the support system:

```
crystalos/skills/crystal-support/SKILL.md       ← write from scratch
crystalos/skills/crystal-support/EVALS.md       ← write from scratch
crystalos/skills/crystal-support/EXAMPLES.md    ← curate first 20 examples
crystalos/skills/doc-writer/SKILL.md             ← write from scratch
crystalos/skills/doc-writer/EVALS.md             ← write from scratch
crystalos/lib/support_classifier.py              ← implement classifier
crystalos/crystal/tools.py                       ← add 8 new tool functions
crystalos/main.py                                ← register new skill routes
```

They also own tuning the Crystal Support Resolution Rate metric — if CSRR drops below 70%, this person diagnoses and fixes it.

### Day 1 Tasks
1. Read `docs/support/CRYSTAL_SUPPORT.md` in full — the SKILL.md spec is already written
2. Read 5 existing skills (`crystal-analyst`, `insight-narrator`, `specialist-nps`) to understand the SKILL.md → EVALS.md → EXAMPLES.md pattern
3. Implement `search_support_docs` tool in `crystalos/crystal/tools.py` — it's a pgvector cosine similarity query, the pattern exists in the codebase
4. Write the first draft of `crystal-support/SKILL.md` (the spec is in the doc, they translate it to the actual format)

### Must-Haves
- Python 3.11+, FastAPI, async programming
- LangGraph or LangChain — has built multi-step agent pipelines before
- Prompt engineering discipline — knows the difference between a well-structured system prompt and a flabby one
- Has written evaluation criteria (EVALS.md equivalents) before — can define what "good" looks like measurably
- pgvector or any vector database — embedding + similarity search is not new to them

### Red Flags
- "I'll tune the prompts until it works" with no eval framework — if there's no measurement, there's no improvement
- Has only used OpenAI SDK, never LangGraph — the skill runtime uses specific execution patterns they need to understand
- Cannot explain what cosine similarity actually measures — they'll be setting `ef_search` parameters without knowing why

### The Interview Question That Reveals Everything
*"I give you a support query: 'My SAML SSO login stopped working after I rotated my API keys.' Write the first 3 tool calls Crystal should make, in order, and explain why that order — not some other order."*

A strong candidate sequences: (1) `get_known_issues("SAML SSO")` — check if it's a known platform issue first, cheapest call; (2) `get_account_state(org_id)` — verify they have SSO on their plan; (3) `search_support_docs("SAML SSO API key rotation")` — find if there's a known relationship. A weak candidate starts with docs search and ignores the account state.

---

## Role 2: Backend TypeScript Engineer
**Priority:** Hire first. Owns the entire data layer and all new routes.

### What They Own

```
backend/src/routes/support.ts              ← 12 new routes (write from scratch)
backend/src/routes/admin-support.ts       ← 8 new admin routes
backend/src/lib/pipelineStateMachine.ts   ← typed state machine
backend/src/scheduler/docAutoApprove.ts   ← cron worker
backend/src/schemas/support.ts            ← Zod schemas for all new routes
supabase/migrations/*_support_system.sql  ← 5 new tables + pgvector
backend/src/__tests__/support.test.js     ← tests for all new routes
backend/src/__tests__/pipelineState.test.js ← state machine unit tests
```

### Day 1 Tasks
1. Read `docs/support/IMPLEMENTATION.md` sections 2–4 — the SQL migration, route stubs, and state machine are fully specified
2. Read any 3 existing route files (`experience.ts`, `billing.ts`, `members.ts`) — understand the pattern: Zod validation, `requireAuth`, `pg.query`, error handling
3. Run `docker-compose up -d` and verify Postgres starts — confirm pgvector extension availability with `CREATE EXTENSION IF NOT EXISTS vector`
4. Write the migration file first — nothing else can be built until the tables exist

### Must-Haves
- TypeScript strict mode — existing codebase has 0 type errors, they must maintain that
- PostgreSQL — comfortable with window functions, `FOR UPDATE SKIP LOCKED`, upsert patterns
- pgvector — has used `<=>` cosine distance operator or equivalent
- Pattern: `async/await`, Express middleware chains, Zod schema inference
- Has written a state machine before — the `transitionPipeline` function is a non-trivial piece of logic

### Red Flags
- Has never done the `FOR UPDATE SKIP LOCKED` pattern — the auto-approve worker is a distributed cron job, race conditions are real
- Writes SQL as string interpolation — existing codebase uses parameterized queries throughout, this is a security requirement
- "I'll add tests later" — the existing 49 test files are the pattern, new routes ship with tests

### The Interview Question That Reveals Everything
*"The auto-approve worker runs every 5 minutes. Two instances start simultaneously. Both query `support_docs WHERE pipeline_status = 'pending_review' AND auto_approve_deadline < NOW()` and both find the same 3 docs. Walk me through exactly what happens without `FOR UPDATE SKIP LOCKED` and then exactly what happens with it."*

Strong candidate traces the double-approval race condition without the lock, then explains that `SKIP LOCKED` makes the second instance skip rows already locked by the first, so each doc is processed exactly once. They'll also mention the transaction boundary matters.

---

## Role 3: Frontend Engineer — Support Site (Next.js)
**Priority:** Hire first. Owns a completely separate application.

### What They Own

The entire `support.experient.ai` Next.js App Router application — a new repo or monorepo package, not embedded in the existing Vite app:

```
support-site/
  app/
    page.tsx                    ← homepage (Crystal hero + quick nav)
    search/page.tsx             ← search results (doc left, Crystal right)
    guides/[...slug]/page.tsx   ← guide articles
    api/[...slug]/page.tsx      ← API reference (auto-generated)
    crystal/[...slug]/page.tsx  ← Crystal skills reference
    features/[...slug]/page.tsx ← feature docs with status badges
    roadmap/page.tsx            ← What's Coming (ISR, 10min revalidate)
    status/page.tsx             ← System health (ISR, 30s revalidate)
    changelog/page.tsx          ← Release history
  components/
    UnifiedSearchBar.tsx        ← THE hero component
    CrystalAnswerCard.tsx
    DocResultCard.tsx
    StatusBadge.tsx
    RoadmapCard.tsx
    ChangelogEntry.tsx
    StatusComponentGrid.tsx
```

### Day 1 Tasks
1. Read `docs/support/WIREFRAMES.md` — all 8 screens, every element annotated
2. Read `docs/support/COMPONENTS.md` — 14 component specs with TypeScript interfaces
3. Set up Next.js 14 App Router project with the existing Experient design tokens — `theme.css` variables, Manrope + Inter fonts, Tailwind v4
4. Build `UnifiedSearchBar` first — it's the most important component on the site, get it right before building anything around it

### Must-Haves
- Next.js 14 App Router — specifically ISR (`revalidate` config, `revalidatePath`), not just pages router
- TypeScript strict — site must pass `tsc --noEmit`
- Tailwind v4 — the existing app uses Tailwind v4 alpha features the engineer must understand
- `backdrop-filter` CSS — the glass-card pattern is central to the design, Safari compatibility is the hard part
- Framer Motion — the house ease `[0.22, 1, 0.36, 1]` and stagger pattern are used throughout

### Red Flags
- "I'll do SSR for everything" — the support site is ISR (static with periodic revalidation), not server-rendered on every request; a candidate who doesn't distinguish these will kill performance
- Has never built a semantic search UI — the search results page has a split layout where Crystal streams an answer while doc results appear; this is a real-time SSE integration they need experience with

### The Interview Question That Reveals Everything
*"The support site homepage has a search bar. When a user types, we want instant doc suggestions from Algolia AND Crystal's AI answer streaming simultaneously. The Crystal answer takes 3–8 seconds. The Algolia results take 200ms. Design the state machine for this search bar — what states exist, what triggers transitions, what the user sees at each moment."*

Strong candidate defines: idle → focused → typing (Algolia fires at 300ms debounce) → results_loading (Algolia responds, docs appear) → crystal_thinking (spinner in bar) → crystal_streaming (answer text appears token by token) → resolved. They'll handle the race condition where Crystal finishes before the user stops typing.

---

## Role 4: Frontend Engineer — In-App + Admin Pipeline
**Priority:** Hire first. Owns the Crystal panel extension and entire admin UI.

### What They Own

```
app/src/components/CrystalPanel.tsx         ← add support mode + mode pill
app/src/components/SupportCommandPalette.tsx ← new Cmd+K extension
app/src/pages/admin/DocPipelinePage.tsx      ← new
app/src/pages/admin/DocReviewPage.tsx        ← new
app/src/pages/admin/DocEditorPage.tsx        ← new (focus mode)
app/src/pages/admin/DocGapsPage.tsx          ← new
app/src/pages/admin/PipelineStatsPage.tsx    ← new
app/src/components/admin/PipelineQueueRow.tsx
app/src/components/admin/DocDiffViewer.tsx   ← the hardest component
app/src/components/admin/QualityScoreBreakdown.tsx
app/src/components/admin/PipelineEventFeed.tsx
app/src/components/admin/DocGapCard.tsx
app/src/components/admin/PipelineStats.tsx   ← Recharts charts
app/src/lib/docDiff.ts                       ← section diff algorithm
```

### Day 1 Tasks
1. Read `docs/support/admin/WIREFRAMES.md` — 6 screens, every component annotated
2. Read `CrystalPanel.tsx` in full — understand the existing streaming architecture before extending it
3. Add the mode pill to `CrystalPanel.tsx` — amber for support mode, blue for analyst mode; this is a small change that unblocks the Crystal engineer's testing
4. Scaffold the 5 admin pages as empty shells behind `requireRole('admin')` — unblocks the backend engineer's route testing

### Must-Haves
- React 19 + TypeScript strict — existing codebase, no exceptions
- Framer Motion — the admin pipeline has specific animation specs (stagger reveals, quality score ring animation, diff section fade-in)
- Has built a diff viewer before — `DocDiffViewer.tsx` is the most complex component; section-level parsing + line-level diff hunks is non-trivial
- Recharts — the stats page uses it (check `package.json` — likely already a dep)
- `useCrystalPanel` context — they need to understand the existing Crystal context before extending it

### Red Flags
- Has never modified a streaming component — CrystalPanel.tsx uses SSE, the support mode addition must not break the streaming state machine
- "I'll refactor the Crystal panel while I'm in there" — they are adding support mode, not rewriting the panel

### The Interview Question That Reveals Everything
*"DocDiffViewer receives two markdown strings — old doc and new Crystal draft. Both have `## Parameters`, `## Overview`, `## Code Examples` sections. The Parameters section changed, Overview is identical, Code Examples is new. The Parameters section has a human lock. Describe your component's output — what does the admin see for each section?"*

Strong candidate: locked+changed Parameters shows amber lock icon + diff hunks but with a "stale lock" warning; identical Overview is collapsed by default (no diff); new Code Examples shows a green "Added" banner. They think about the locked-section-changed case being the most important edge case to get right.

---

## Role 5: QA / Test Automation Engineer
**Priority:** Hire week 3. Ramps in Sprint S2, essential by Sprint S3.

### What They Own

```
backend/src/__tests__/support.test.js          ← all 12 new routes
backend/src/__tests__/admin-support.test.js    ← all 8 admin routes
backend/src/__tests__/pipelineState.test.js    ← state machine edge cases
e2e/support-site.spec.ts                       ← Playwright (P0-5 revival)
e2e/crystal-support.spec.ts                    ← Crystal resolution E2E
e2e/admin-pipeline.spec.ts                     ← approval workflow E2E
```

They also own the **Crystal Resolution Rate testing harness**: a batch test runner that sends 50 canonical support queries to `crystal-support` and scores the output against ground truth, run weekly.

### Day 1 Tasks
1. Read existing test files (`billing.test.js`, `copilot.test.js`) — understand the test pattern: mock auth, real Postgres queries against a test DB, `beforeEach` cleanup
2. Write the `support_docs` table fixture — a set of known good docs that all support route tests can query against
3. Write test for `GET /api/support/docs` — the simplest route, establishes the pattern for all 20 routes

### Must-Haves
- Vitest (not Jest — the repo uses Vitest v4)
- Playwright for E2E — P0-5 was deferred specifically to be revived here
- Database testing discipline — not mocking the DB (`pg` pool), running against a real test Postgres instance
- Has built a regression harness for AI output — the CSRR testing requires scoring LLM responses against expected patterns

### The Interview Question That Reveals Everything
*"The crystal-support skill resolves 84% of test queries correctly. How do you write a regression suite that catches when a code change drops that to 79% — and alerts you before it ships?"*

Strong candidate: a deterministic test set (50 canonical queries with ground-truth resolutions), run in CI on every push to `crystalos/`, score against the EVALS.md criteria, fail the PR if score drops > 3 percentage points. They'll also mention the importance of a fixed random seed and pinned model version for reproducibility.

---

## Role 6: DevOps / Platform Engineer
**Priority:** Hire week 3. Owns CI pipeline — nothing auto-generates without them.

### What They Own

```
.github/workflows/doc-refresh.yml     ← the entire extraction + generation pipeline
scripts/extract-routes.ts             ← TypeScript AST parser for routes
scripts/extract-schemas.ts            ← Zod schema reflection
crystalos/scripts/extract-skills.py  ← Markdown parser for SKILL.md files
scripts/parse-tracker.py             ← TRACKER.md → JSON roadmap feed
scripts/bootstrap-docs.sh            ← first-run batch generation
```

Also owns:
- pgvector extension installation and HNSW index tuning on Fly.io Postgres
- Prometheus metrics for the support system (new Grafana dashboard)
- UptimeRobot setup for `support.experient.ai`
- Algolia DocSearch setup and index seeding

### Day 1 Tasks
1. Read `docs/support/CONTENT_ENGINE.md` — the full 5-stage pipeline is documented
2. Write `scripts/extract-routes.ts` — takes `backend/src/routes/*.ts`, outputs `{ method, path, auth, schema_ref, rate_limit }` JSON. This is the first blocker for the content engine.
3. Confirm pgvector extension is available on the Fly.io Postgres plan — check `fly.toml` and Fly docs

### Must-Haves
- GitHub Actions — specifically: matrix jobs, conditional steps (`if: steps.diff.outputs.changed == 'true'`), artifact passing between jobs
- TypeScript AST (ts-morph or TypeScript compiler API) — parsing route files requires understanding the AST, not regex
- PostgreSQL operations — pgvector HNSW index parameters (`m`, `ef_construction`) need to be tuned for 1536-dimension OpenAI embeddings
- Python scripting — the skill extractor and tracker parser are Python

### The Interview Question That Reveals Everything
*"The `doc-refresh.yml` workflow runs on every push to main. Some pushes touch 0 doc-relevant files. Some touch 50. Walk me through how you ensure: (a) pushes with no doc changes don't waste CI minutes, (b) pushes with 50 changes don't exceed the 6-hour GitHub Actions timeout, (c) the workflow is idempotent — running twice on the same commit produces the same result."*

Strong candidate: (a) `git diff --name-only HEAD~1 HEAD | grep -E 'routes|schemas|skills|TRACKER'` as a pre-step that sets an output variable; (b) fan-out matrix job, parallel extraction, batch LLM calls with concurrency limit; (c) `source_hash` column — if the hash matches, skip regeneration.

---

## Role 7: Technical Product Manager
**Priority:** Hire week 1. Coordinates everything else.

### What They Own

Not features — delivery:
- Breaking `IMPLEMENTATION.md` sprint plans into trackable tickets in the team's PM tool
- Owning `docs/TRACKER.md` — the source of truth for what's done
- Running sprint ceremonies (planning, review) across 3 codebases (CrystalOS, backend, frontend)
- Writing acceptance criteria for QA from `docs/support/UX_FLOWS.md`
- Owning the launch checklist (`docs/support/IMPLEMENTATION.md` section 10) — checking off items and flagging blockers
- Managing the design partner customer relationship (Role 11)

### Day 1 Tasks
1. Read every doc in `/docs/support/` — not to understand implementation, but to understand what each engineer is building and how the pieces connect
2. Write Sprint S1 tickets — one ticket per task in `IMPLEMENTATION.md` Sprint S1, with acceptance criteria, owner, and dependencies
3. Schedule Role 1–4 kickoffs — first sprint planning in the first week

### Must-Haves
- Has shipped a multi-layer system (frontend + backend + AI) on a schedule before
- Comfortable in the code — can read TypeScript and Python well enough to understand when an engineer is blocked vs. stuck
- Writes tickets that engineers don't have to ask questions about — acceptance criteria are Given/When/Then, not "make it work"
- Knows what TRACKER.md is and keeps it current — the roadmap page on the support site auto-generates from it

### Red Flags
- "I'll write the roadmap in Notion" — TRACKER.md is the source of truth, not Notion
- Has never shipped anything with an AI component — AI features have different failure modes (quality drift, latency spikes) that require different PM muscle memory

---

## Role 8: Support Scientist / AI Quality Engineer
**Priority:** Hire week 5. Owns quality post-launch.

### What They Own

Post-launch, this person is the quality owner for `crystal-support`:

- Weekly CSRR report: 50-query batch eval, scored against EVALS.md, trend vs. last week
- `skill_examples` table curation: reviewing auto-written examples (from 👍 resolutions), ensuring quality, removing bad examples
- `support_doc_gaps` triage: reviewing gap queue weekly, identifying patterns ("8 out of 12 gaps this week are about webhook configuration — we need a doc")
- Red-team testing: adversarial queries designed to make Crystal hallucinate, confabulate feature capabilities, or give confident wrong answers
- EVALS.md iteration: when Crystal fails a class of queries, updating the eval criteria to catch that failure going forward

### Day 1 Tasks
1. Run the CSRR harness against `crystal-support` (once it exists) — establish baseline
2. Write 20 adversarial test queries — questions designed to make Crystal fail (invented features, impossible combinations, edge cases not in the docs)
3. Review the first 20 `skill_examples` auto-written from real resolutions — mark good/bad

### Must-Haves
- Prompt engineering — can read a SKILL.md and predict where it will fail
- Evaluation design — has defined rubrics for AI output quality before
- Statistical literacy — knows the difference between a 3-point CSRR drop that's noise vs. a signal
- Customer empathy — understands that the support experience is where enterprise trust is made or broken

---

## Role 9: Documentation Operations Manager
**Priority:** Hire week 5. Runs the admin pipeline.

### What They Own

The human layer of the content engine:
- Daily: open `/admin/support/pipeline`, clear the review queue (≤ 5 items/day at steady state)
- Weekly: review doc gaps, write manual docs for gaps Crystal can't fill
- Monthly: doc quality audit — read 20 random live docs, score against the style guide
- Ongoing: update `crystalos/skills/doc-writer/references/TONE.md` when Crystal's writing style drifts

This is not a writing role. It is an operations role with writing as a secondary skill.

### Day 1 Tasks
1. Do a complete pass through the admin pipeline dashboard — understand every state and every action
2. Write the doc for one gap item manually — this is the only way to learn what Crystal gets wrong
3. Establish the daily review ritual — 9am, open queue, handle everything

### Must-Haves
- Has managed a content pipeline before — editorial workflow, not just writing
- Can write clean technical documentation (API-level, not just prose)
- Comfortable making approval decisions quickly — the optimistic 2-hour window means they can't deliberate for days
- Understands what "quality" means for auto-generated docs — knows when Crystal's output is "good enough" vs. "needs annotation"

---

## Role 10: Search / Embeddings Engineer
**Priority:** Hire week 8. Sprint S4 dependency.

### What They Own

```
backend/src/lib/embeddings.ts    ← embedding generation + caching
backend/src/lib/vectorSearch.ts  ← pgvector query abstraction
algolia/                         ← DocSearch index configuration
```

And owns the ongoing search quality metrics:
- MRR (Mean Reciprocal Rank) for doc search results
- NDCG (Normalized Discounted Cumulative Gain) at k=5
- Crystal `search_support_docs` tool relevance scoring

### Must-Haves
- OpenAI `text-embedding-3-small` or equivalent — understands `dimensions` parameter, knows 1536 vs. 512 tradeoffs for pgvector
- HNSW index tuning — `m`, `ef_construction`, `ef_search` parameters and their effects on recall vs. latency
- Algolia DocSearch configuration — specifically the `indexName`, `appId`, record size limits, attribute ranking

### The Interview Question That Reveals Everything
*"A user searches for 'Crystal doesn't understand my NPS question.' The correct doc is titled 'Crystal AI — Analyst Mode Capabilities.' Your pgvector search returns it at rank 4, behind three less relevant results. The query embedding and the doc embedding have cosine similarity 0.71. Walk me through how you debug and improve the ranking without retraining the embedding model."*

Strong candidate considers: (a) the query phrasing is negative ("doesn't") — add paraphrase augmentation; (b) chunk size — the doc title alone may not capture the semantics, embed title+first-paragraph together; (c) hybrid reranking — use BM25 for keyword recall, pgvector for semantic, combine with RRF.

---

## Role 11: Design Partner Customer (Enterprise)
**Priority:** Engage week 5. Validates Sprint S3 output.

This is not a vendor relationship. This is a real paying Experient customer — Jordan Webb archetype — who gets early access to the support site in exchange for structured feedback.

### What They Validate

- **Sprint S3 milestone:** Does Crystal actually resolve their real support questions?
- **What's Coming page:** Does the roadmap match what they actually want to know?
- **Doc quality:** When they follow an API reference doc, does it work?
- **The escalation experience:** When Crystal can't help, what does the ticket experience feel like?

### What We Give Them

- Early access to `support.experient.ai` before public launch
- A direct line to the TPM (Role 7) — if something is wrong, they tell us before it ships
- Their feedback is tracked in `support_doc_gaps` and `support_tickets` — they can see their impact

### What We Need From Them

- 3 scheduled sessions (1 hour each) during Sprint S3 and S4
- Written feedback on 5 specific journeys from `docs/support/UX_FLOWS.md`
- Honest answers to: "Would you actually use this instead of emailing someone?"

### Ideal Profile

An enterprise admin (org:admin role) at a company with:
- 100+ Experient users
- Active Crystal usage (so they have real data questions that mix with support questions)
- A CX or IT background — they know what good support looks like and will not be politely diplomatic about what's bad

---

## Role 12: UX Engineer (Design Implementation)
**Priority:** Hire week 3. Ensures wireframes become reality.

### What They Own

Design fidelity across all new surfaces. They don't write business logic — they own the visual and interaction layer:

- Pixel-perfect implementation review against `docs/support/WIREFRAMES.md`
- Animation budget enforcement — every motion must use the house ease `[0.22, 1, 0.36, 1]`, duration ≤ 350ms for UI chrome
- `backdrop-filter` cross-browser testing — Safari has inconsistent blur rendering; `@supports` fallbacks are required
- Accessibility audit (WCAG 2.1 AA) — color contrast, `aria-live` regions for Crystal streaming, keyboard navigation on DocDiffViewer
- Design token compliance — no hardcoded hex values, all colors via `var(--color-*)` tokens

### Day 1 Tasks
1. Read `docs/support/COMPONENTS.md` — every component has a CSS spec; understand what "faithful to spec" means
2. Set up a visual regression test (Percy or Chromatic) — catch unintended style changes in CI
3. Audit `CrystalAnswerCard` implementation against the spec — is the streaming cursor animation correct? Does the citation chip hover state match?

### Must-Haves
- Has used Framer Motion `AnimatePresence` with `mode="wait"` for route transitions
- Knows the difference between `backdrop-filter` and `filter` — specifically why `backdrop-filter: blur()` requires `z-index` management and `transform: translateZ(0)` on some elements
- CSS custom property cascade — can debug why a component's `var(--color-primary)` resolves to the wrong value in a dark context
- Has done accessibility audits before — knows what `aria-live="polite"` vs. `aria-live="assertive"` means for Crystal streaming

---

## Team Summary

| # | Role | Type | Priority | Sprint Start |
|---|------|------|----------|-------------|
| 1 | CrystalOS Engineer | Engineering | Hire week 1 | S1 |
| 2 | Backend TypeScript Engineer | Engineering | Hire week 1 | S1 |
| 3 | Frontend Engineer — Support Site | Engineering | Hire week 1 | S1 |
| 4 | Frontend Engineer — In-App + Admin | Engineering | Hire week 1 | S1 |
| 7 | Technical Product Manager | Product | Hire week 1 | S1 |
| 5 | QA / Test Automation Engineer | Engineering | Hire week 3 | S2 |
| 6 | DevOps / Platform Engineer | Engineering | Hire week 3 | S2 |
| 12 | UX Engineer | Design | Hire week 3 | S2 |
| 8 | Support Scientist / AI Quality | AI | Hire week 5 | S3 |
| 9 | Documentation Operations Manager | Operations | Hire week 5 | S3 |
| 11 | Design Partner Customer | Customer | Engage week 5 | S3 |
| 10 | Search / Embeddings Engineer | Engineering | Hire week 8 | S4 |

**Total: 11 hires + 1 design partner engagement.**

---

## What Breaks Without Each Role

| Skip this role | What breaks |
|----------------|-------------|
| CrystalOS Engineer | No `crystal-support` skill. The entire AI resolution layer doesn't exist. CSRR = 0%. |
| Backend TypeScript Engineer | No routes, no DB tables, no state machine. Nothing in the system can store or serve docs. |
| Frontend (Support Site) | The public-facing support site doesn't exist. Customers still file tickets. |
| Frontend (In-App + Admin) | Crystal in the app has no support mode. Admins have no pipeline UI. |
| Technical PM | Sprint plans exist as docs but never become tickets. Engineers work in parallel without coordination. Sprints S1–S4 collapse into undefined work. |
| QA Engineer | No regression safety net. A breaking change to `crystal-support` ships without detection. CSRR drops and nobody knows why until customers complain. |
| DevOps / Platform Engineer | The CI pipeline doesn't exist. Docs are never auto-generated. The entire content engine is a design doc, not a running system. |
| UX Engineer | The wireframes exist but the implementation diverges. Backdrop-filter breaks on Safari. Animations use the wrong easing. Design token violations accumulate. |
| Support Scientist | CSRR is unmeasured. Crystal quality drifts. No one notices until enterprise customers report that Crystal is giving wrong answers. |
| Doc Operations Manager | The admin pipeline has nobody running it. Review queue fills up. Docs stale. Crystal's source material degrades. |
| Design Partner Customer | Launch validation is internal only. Ship without real enterprise user feedback. Discover the failure modes after enterprise onboarding. |
| Search Engineer | pgvector HNSW parameters are untuned defaults. Algolia index is unseeded. Search quality is whatever it happens to be. CSRR never reaches the 85% target. |

---

## The Lean Version (If Headcount Is Constrained)

If you can only hire 5 people immediately, hire in this order and accept these tradeoffs:

1. **CrystalOS Engineer** — non-negotiable, nothing works without the skills
2. **Backend TypeScript Engineer** — non-negotiable, nothing stores or serves
3. **Frontend Engineer (In-App + Admin)** — takes both frontend roles, slower delivery
4. **DevOps / Platform Engineer** — doubles as QA for backend routes
5. **Technical PM** — coordinates, writes tickets, also acts as Doc Ops Manager until headcount opens

Support site (`support.experient.ai`) ships 4 weeks later. Search quality is untuned at launch. Accepted.

---

## One Thing Every Hire Must Know Before Day 1

The Experient platform has three layers that move in lockstep: CrystalOS proposes, the backend persists, the frontend executes. The support system extends all three simultaneously.

An engineer who only understands one layer will block the other two. Every hire on this list reads the architecture diagram ([FigJam](https://www.figma.com/board/pDeP6JhufuwHZinnLbG0BU)) and the CLAUDE.md before their first commit.

The system is designed. The docs exist. The work is building.
