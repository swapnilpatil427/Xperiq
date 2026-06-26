# Experient Docs Admin Pipeline
## Index — Visualize, Review, and Approve Every Doc Before It Goes Live

**Status:** Design Complete — Sprint A1/A2 (follows Support System Sprint S4)  
**Owner:** Documentation Engineering + Frontend + Backend  
**Location in app:** `/admin/support/pipeline` (requires `org:admin` role)

---

## What This Is

The content engine (see `../CONTENT_ENGINE.md`) auto-generates docs from code on every git push. Crystal drafts, evaluates, and publishes — mostly without human involvement. But "mostly" is the problem.

The admin pipeline is the visibility and control layer. It answers three questions every doc admin needs:

1. **What's in the pipeline right now?** Every doc in every state — queued, drafting, pending review, auto-approved, live, stale.
2. **What needs my attention?** Docs that scored below the auto-approve threshold, docs on their optimistic 2-hour countdown, and doc gaps that Crystal couldn't fill.
3. **What changed since I was last here?** A chronological activity feed of everything that moved — auto-published, rejected, regenerated, locked.

And it gives them three controls:
- **Approve** — publish immediately
- **Edit + Approve** — fix Crystal's draft inline, lock sections you touched
- **Reject** — send back to the gap queue with a reason

---

## The Core Design Decision

Documents with quality score ≥ 0.90 auto-publish. No human sees them unless something breaks.

Documents with quality score 0.75–0.89 enter a 2-hour optimistic window — they publish automatically unless an admin explicitly rejects them. The admin sees them in the queue. Most of the time, they do nothing and the doc publishes on schedule.

Documents with quality score 0.65–0.74 require explicit approval. They sit in the queue until an admin acts.

Documents with quality score < 0.65 are rejected automatically. A doc gap entry is created. The admin's job is to either write the doc manually or link it to an existing one.

This tiered model means the admin queue stays manageable — typically 2–5 items per day — even as the pipeline processes dozens of doc changes.

---

## Documents

| Document | What it covers |
|----------|---------------|
| [PIPELINE_DESIGN.md](./PIPELINE_DESIGN.md) | 8-person engineering war room: 5 sharp debates on auto-approve vs. gates, UI location, conflict resolution, queue scale, and "what's new." 5 design principles, full state machine spec, data model extensions, all API routes. |
| [WIREFRAMES.md](./WIREFRAMES.md) | 6 admin screens: pipeline dashboard (queue + feed), doc review panel (diff view + section locks), inline editor (Monaco-style, section locking), doc gap queue, pipeline stats/analytics, mobile swipe UX. |
| [IMPLEMENTATION.md](./IMPLEMENTATION.md) | DB extensions, TypeScript state machine, 8 backend route stubs, auto-approve worker, React page + component list, diff algorithm, 2-sprint plan, notification templates, 10 acceptance criteria. |

---

## FigJam Diagrams

| Diagram | Link |
|---------|------|
| Pipeline State Machine | https://www.figma.com/board/yjrtXcU8MgpeNA6DBvTdW3 |
| Review Workflow & Notification Flow | https://www.figma.com/board/8nvuwYlIZa3zUBbaxFCEuC |

---

## Pipeline States at a Glance

```
git push
    │
    ▼
[Queued] → [Extracting] → [Drafting] → [QualityCheck]
                                              │
                         ┌────────────────────┼────────────────────┐
                         ▼                    ▼                    ▼
                  score ≥ 0.90         score 0.75–0.89       score 0.65–0.74
                 [AutoApproved]        [PendingReview]      [RequiresAnnotation]
                         │              (2hr window)                │
                         │           ┌──────┴──────┐               │
                         │           │             │                │
                         │     timeout fires   admin acts     admin annotates
                         │           │         │     │              │
                         │       [AutoApproved] │  [Rejected]  [PendingReview]
                         │                   [Approved]            ↓
                         └──────────────┬──────┘            [DocGap queue]
                                        ▼
                                  [Publishing]
                                        │
                                        ▼
                                     [Live]
                                        │
                              source file changes again
                                        │
                                        ▼
                                    [Stale] → re-enters pipeline
```

---

## Key Engineering Decisions (from debates in PIPELINE_DESIGN.md)

| Decision | Choice | Why |
|----------|--------|-----|
| Auto-approve threshold | 0.90 | Below this, Crystal's drafts have measurable imperfection worth 2 minutes of admin eyes |
| Optimistic window | 2 hours | Long enough for admins to notice, short enough to not block freshness |
| UI location | `/admin/support/pipeline` in main app | One codebase, shared component library, focus mode hides SideNav |
| Human edit conflict | Section-level locking | Lock what you edited; Crystal updates the rest on regeneration |
| Queue scale solution | Smart batching + Crystal self-review | Related docs grouped; Crystal reviews routine regenerations; humans see < 5 items/day |
| Activity feed | "Since last visit" model | Admin sees the delta, not a firehose |

---

## What Gets Built

### New Backend
```
backend/src/routes/admin-support.ts     ← 8 new routes
backend/src/lib/pipelineStateMachine.ts ← typed state machine
backend/src/scheduler/docAutoApprove.ts ← cron worker (every 5 min)
```

### New DB (migration appended to support system migration)
```sql
-- support_docs: new columns (pipeline_status, reviewed_by, human_edited, auto_approve_deadline...)
-- support_doc_sections: section-level content + locks
-- support_pipeline_events: full audit log
-- support_admin_sessions: "last seen" for activity feed
```

### New React Pages (app/src/pages/admin/)
```
DocPipelinePage.tsx     ← queue + feed (main dashboard)
DocReviewPage.tsx       ← single doc review with diff
DocEditorPage.tsx       ← inline editor with section locking
DocGapsPage.tsx         ← gap queue management
PipelineStatsPage.tsx   ← analytics dashboard
```

### New React Components (app/src/components/admin/)
```
PipelineQueueRow.tsx         ← one row in the action queue
DocDiffViewer.tsx            ← section-level diff with lock controls
QualityScoreBreakdown.tsx    ← score ring + criteria breakdown
PipelineEventFeed.tsx        ← chronological activity feed
DocGapCard.tsx               ← gap item with actions
PipelineStats.tsx            ← KPI cards + recharts charts
```

### SideNav Extension
Admin items added under existing `SETTINGS_EXTRA_ITEMS`, gated by `isAdmin`:
- Doc Pipeline (`/admin/support/pipeline`)
- Doc Gaps (`/admin/support/gaps`)
- Pipeline Stats (`/admin/support/stats`)

---

## Sprint Plan

| Sprint | Weeks | Focus |
|--------|-------|-------|
| A1 | 1–2 (after S4) | DB migration, state machine, 8 backend routes, auto-approve worker, SideNav integration |
| A2 | 3–4 | All 5 React pages, 6 components, diff viewer, Novu notifications, mobile swipe, charts |
