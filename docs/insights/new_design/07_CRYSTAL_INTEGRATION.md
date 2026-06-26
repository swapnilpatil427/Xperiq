# Crystal Integration — Reports, Documents & Deep Links

> Crystal **reads** pipeline output; it does not mutate insight state. Extends existing tool pattern in `crystalos/agents/crystal.py` and `CrystalPanel.tsx`.

---

## 1. Goals

1. User asks: *"Show me the full insight report from last Tuesday"* → Crystal returns **document summary + URL**
2. User asks: *"What changed since the last automated update?"* → Crystal cites **checkpoint delta** with sources
3. User asks: *"Open Sarah's board prep report"* → Crystal resolves manual report by label
4. Action proposal: *"Generate Expert report for last 30 days"* → confirm card → `POST /runs`

---

## 2. New Crystal tools

### `get_insight_trail`

**Phase availability:** Phase 4 (requires Trail UI routes and `insight_checkpoints_v2` parent chain)

```python
async def get_insight_trail(
    survey_id: str,
    lane: Literal["all", "automated", "manual"] = "all",
    limit: int = 10,
) -> dict:
    """List checkpoint/report nodes for survey."""
```

Returns:

```json
{
  "nodes": [
    {
      "id": "uuid",
      "type": "checkpoint",
      "lane": "automated",
      "checkpoint_number": 14,
      "created_at": "...",
      "created_by": "system:stream",
      "summary": "NPS 41 (−3.2) · 2 emerged themes",
      "url": "/experience/surveys/{id}/intelligence/trail/{checkpointId}",
      "meaningful_delta": true
    }
  ]
}
```

### `get_checkpoint_detail`

**Phase availability:** Phase 0.5+ (queries `survey_insight_checkpoints`; `delta_from_prior` available after Phase 0.5 ships)

```python
async def get_checkpoint_detail(checkpoint_id: str) -> dict:
    """Full delta, lineage, and digest for one checkpoint."""
```

Includes `delta_from_prior`, `prior_checkpoint_refs`, `new_response_count`, citations count.

### `get_insight_report`

**Phase availability:** Phase 3 (requires `insight_reports` table and manual run modes)

```python
async def get_insight_report(
    survey_id: str,
    report_id: str | None = None,
    checkpoint_id: str | None = None,
) -> dict:
    """
    Return report summary + URL for chat rendering or deep-link handoff.
    survey_id is required. report_id or checkpoint_id are optional filters;
    if neither is provided, returns the latest report for the survey.
    """
```

Returns:

```json
{
  "title": "Insight Report · Checkpoint #14",
  "run_mode": "automated_incremental",
  "created_at": "...",
  "created_by": "system:stream",
  "executive_summary": "...",
  "themes": [...],
  "insights": [...],
  "citations_count": 47,
  "document_url": "/experience/surveys/{surveyId}/intelligence/trail/{checkpointId}",
  "download_url": "/api/insights/{surveyId}/trail/{checkpointId}/report",
  "render_hint": "document"
}
```

### `get_recent_checkpoints` (Phase 0.5)

**Purpose:** Returns the most recent N checkpoints for a survey, ordered by checkpoint_number DESC.
Used in Phase 0.5 for Crystal trajectory queries. Does NOT walk the parent chain (no `parent_checkpoint_id` in Phase 0.5).

**Signature:**
```python
async def get_recent_checkpoints(survey_id: str, limit: int = 5) -> list[dict]:
```

**Returns:**
```python
[
  {
    "checkpoint_number": int,
    "created_at": str,          # ISO date string
    "nps": float | None,
    "trigger": str,             # e.g. "stream", "scheduler"
    "response_count_delta": int | None,
    "delta_summary": {          # from delta_from_prior column; None if legacy checkpoint
      "nps_delta": float | None,
      "trend_direction": str | None,
      "topics_emerged": list[str],
      "topics_resolved": list[str],
    } | None,
  },
  ...  # oldest last in list (most recent first)
]
```

**When to use:** Crystal analyst should use this tool when:
- User asks "what changed since last time?" or "what's trending?"
- User asks about NPS trajectory or recent direction
- User asks "how many checkpoints have we had?"

**Limitations:** Returns up to `limit` checkpoints ordered by number. This is NOT a linked-list walk — gaps in checkpoint_number (due to skipped writes) do not cause traversal errors, but the "chain" is not verified to be contiguous. Use `get_checkpoint_chain` (Phase 1+) for verified ancestry traversal.

**Example Crystal response pattern:**
User: "Has our NPS been improving or declining?"
Crystal calls `get_recent_checkpoints(survey_id, limit=5)` →
Returns 5 checkpoints with NPS: 44, 47, 46, 44, 41 (newest last)
Crystal narrates: "NPS has declined from 47 to 41 over the last 5 checkpoints (Jun 10–Jun 25). The most recent update shows a 3.2-point drop."

---

### `get_checkpoint_chain` (Phase 1+)

> **Phase dependency:** `get_checkpoint_chain` requires the `parent_checkpoint_id` column on `insight_checkpoints_v2`, which is added in **Phase 1**. This tool is NOT available in Phase 0.5. Use `get_recent_checkpoints` instead for Phase 0.5 Crystal trajectory queries.

```python
async def get_checkpoint_chain(
    survey_id: str,
    lookback: int = 5,
    lane: Literal["automated", "manual", "all"] = "automated",
) -> dict:
    """
    Return the last N checkpoints in the verified ancestor chain with summary fields.
    Used by Crystal to show trajectory: NPS delta, theme emergence, timestamps.
    Walks parent_checkpoint_id chain from the latest node (Phase 1+ only).
    Unlike get_recent_checkpoints, this performs a verified linked-list walk via
    parent_checkpoint_id, not an ordered-bag query. Requires insight_checkpoints_v2.
    """
```

Returns:

```json
{
  "checkpoints": [
    {
      "id": "uuid",
      "checkpoint_number": 14,
      "lane": "automated",
      "created_at": "...",
      "nps": 41.0,
      "nps_delta": -3.2,
      "new_response_count": 12,
      "meaningful_delta": true,
      "summary": "NPS 41 (−3.2) · 2 emerged themes",
      "url": "/experience/surveys/{id}/intelligence/trail/{checkpointId}"
    }
  ],
  "total_returned": 5
}
```

### `compare_checkpoints`

**Phase availability:** Phase 4 (requires Trail comparison view and `insight_checkpoints_v2`)

```python
async def compare_checkpoints(checkpoint_id_a: str, checkpoint_id_b: str) -> dict:
    """Side-by-side delta for Crystal narration."""
```

### `get_insight_settings` (read-only for Crystal)

**Phase availability:** Phase 2 (requires `survey_insight_settings` table)

Returns effective lookback/thresholds so Crystal can explain behavior: *"Your survey uses 5 prior checkpoints by default."*

---

## 3. Chat rendering — document mode

When `render_hint === "document"`:

**CrystalPanel** renders `InsightDocumentCard`:

```
┌─────────────────────────────────────────────────────────────────────────┐
│ 📄 Insight Report · Automated · Jun 24, 2026                            │
│ NPS 41 (−3.2) · 12 new responses · 8 insights                           │
├─────────────────────────────────────────────────────────────────────────┤
│ Executive summary (first 400 chars)...                                  │
│                                                                         │
│ Emerged: Billing confusion · Declining: Slow login                      │
│                                                                         │
│ [Open full report →]                                                    │
└─────────────────────────────────────────────────────────────────────────┘
```

- **Open full report** → `document_url` (in-app route)
- Long content not inlined in chat — **summary + link** (performance)

Reuse existing citation chips for inline quotes when Crystal narrates with sources.

---

## 4. Intent routing (Crystal system prompt addition)

```
When user asks about:
- "latest insight(s)" → get_insights_list (active projection) + mention checkpoint #
- "history" / "timeline" / "trail" → get_insight_trail
- "what changed" / "since last week" → get_checkpoint_detail(latest automated)
- "trajectory" / "trend over checkpoints" → get_recent_checkpoints(survey_id, limit=5) [Phase 0.5] or get_checkpoint_chain(survey_id, lookback=5) [Phase 1+]
- "full report" / "document" / "show report" / "show me the report" / "what does the latest report say"
      → call get_insight_report(survey_id)
      → if report exists within 7 days → action_proposal: view_report
      → if no report within 7 days → action_proposal: generate_intelligence_report
- "Sarah's report" / named report → get_insight_trail(lane=manual) + fuzzy label match
        → then get_insight_report(survey_id, report_id=...)
- "generate" / "deep dive" / "expert" → action_proposal: generate_intelligence_report
- "custom analysis" / "run custom" → respond with text pointing to the Reports section;
        do NOT emit a proposal

Always include document_url when returning a report.
Distinguish automated vs manual in prose.
```

---

## 5. Action proposals

Crystal emits action proposals as structured objects. The frontend renders them as confirm-cards; no mutation occurs until the user explicitly confirms. The three proposal types for the insight pipeline are:

| Proposal type | When emitted | Frontend behavior |
|---|---|---|
| `trigger_manual_insight_run` | User requests Expert/deep-dive run | Confirm dialog → `POST /api/insights/:surveyId/runs` → SSE progress |
| `view_report` | User asks to see a report and one exists within 7 days | Opens report viewer at `url` — no API call needed |
| `generate_intelligence_report` | User asks to see a report but none exists within 7 days; or user explicitly asks to generate one | Confirm dialog showing `estimated_credits` → calls trigger endpoint |

**Decision logic Crystal must apply before emitting a report-related proposal:**

1. Call `get_insight_report(survey_id)` to check for a recent report.
2. If a report exists with `created_at` within the last 7 days → emit `view_report`.
3. If no report within 7 days → emit `generate_intelligence_report`.
4. If the user asks for **Custom Analysis** → respond with text directing them to the Reports section of the product. Do NOT emit any proposal.

---

### `trigger_manual_insight_run`

```json
{
  "type": "trigger_manual_insight_run",
  "survey_id": "...",
  "mode": "manual_expert",
  "window_start": "2026-05-01T00:00:00Z",
  "window_end": "2026-06-24T23:59:59Z",
  "label": "Q2 board prep",
  "preview": {
    "corpus_size": 1240,
    "estimated_minutes": 4,
    "estimated_cost_usd": 0.18
  }
}
```

Frontend confirm card → `POST /api/insights/:surveyId/runs` → SSE progress → on complete, Crystal message with `report_id` URL.

---

### `view_report`

```json
{
  "type": "view_report",
  "report_id": "...",
  "checkpoint_id": "...",
  "url": "/experience/surveys/{surveyId}/intelligence/trail/{checkpointId}",
  "summary": "NPS 41 (−3.2) · 12 new responses · 8 insights — Jun 24, 2026"
}
```

Params:

| Field | Type | Description |
|---|---|---|
| `report_id` | `string` | ID of the existing report |
| `checkpoint_id` | `string \| null` | Checkpoint the report is associated with, if automated |
| `url` | `string` | In-app deep link to the report viewer |
| `summary` | `string` | One-line summary Crystal includes in its prose response |

Frontend behavior: renders a confirm-card with the summary and an "Open report" CTA. On confirm, navigates to `url`. No API call — this is a read-only navigation action.

---

### `generate_intelligence_report`

```json
{
  "type": "generate_intelligence_report",
  "survey_id": "...",
  "estimated_credits": 5
}
```

Params:

| Field | Type | Description |
|---|---|---|
| `survey_id` | `string` | Survey to generate the report for |
| `estimated_credits` | `number` | Credit cost shown in the confirm dialog |

Frontend behavior: renders a confirm-card showing the credit cost. On confirm, calls `POST /api/insights/:surveyId/runs` (same trigger endpoint as `trigger_manual_insight_run`, with `mode: "automated_incremental"`). Shows SSE progress; on complete, Crystal sends a follow-up message with `view_report` proposal for the newly generated report.

---

## 6. Citation context enrichment

Extend `citation_context` SSE event (existing pattern from experience route):

```json
{
  "checkpoints": [{ "id": "...", "number": 14, "summary": "..." }],
  "reports": [{ "id": "...", "label": "Q2 board prep" }],
  "active_checkpoint_id": "..."
}
```

`CrystalPanel.enrichCitationsFromMap()` — add checkpoint/report labels to source chips.

Tool step labels (`locales/en.ts`):

```typescript
get_insight_trail: 'Loading insight history',
get_insight_report: 'Fetching insight report',
get_recent_checkpoints: 'Loading recent checkpoints',   // Phase 0.5
get_checkpoint_chain: 'Loading checkpoint trajectory',  // Phase 1+
compare_checkpoints: 'Comparing checkpoints',
```

---

## 7. Backend proxy (existing pattern)

Checkpoint blob fetch already exists:

- `GET /api/insights/:surveyId/checkpoints/:checkpointId/report`

**v2 aliases:**

- `GET /api/insights/:surveyId/trail/:checkpointId/report`
- `GET /api/insights/:surveyId/reports/:reportId`

CrystalOS tools call Postgres + blob store directly (same as today); frontend uses Express proxy for browser auth.

---

## 8. Example conversations

### What changed?

**User:** What changed since the last insight update?

**Crystal:** (calls `get_checkpoint_detail` on latest automated)

> Since checkpoint **#14** (today at 2:04pm, 12 new responses):
> - **NPS dropped 3.2 points** to 41.0 (was 44.2)
> - **New theme emerged:** "Billing confusion" (8% of volume)
> - **Declining:** "Slow login" (−6pp share)
>
> [Open full report →](/experience/surveys/.../trail/...)

### Full document

**User:** Show me the complete report from the Q2 board prep run.

**Crystal:** (calls `get_insight_trail(lane=manual)`, then `get_insight_report(survey_id, report_id=...)`)

> Here's Sarah's **Expert report** (Apr 1 – Jun 20, 1,240 responses, 38 insights):
> *(document card)*
> [Open full report →](/experience/surveys/.../reports/...)

---

## 9. What Crystal must NOT do

- Mutate checkpoints or active insights
- Trigger automated runs (only manual via confirmed proposal)
- Re-compute metrics in prose (must use tool outputs)

---

## 10. Implementation order

**Implementation order (by phase):**

**Phase 0.5 (implement now):**
1. `get_recent_checkpoints` — ordered-bag checkpoint query, no parent chain

**Phase 1 (after insight_checkpoints_v2 migration):**
2. `get_checkpoint_chain` — verified linked-list walk via parent_checkpoint_id

**Phase 2 (after survey_insight_settings migration):**
3. `get_insight_settings` — survey-level config read

**Phase 3 (after manual run modes ship):**
4. `get_insight_report` — fetch manual Expert/Quick report document
5. `document_url` in responses + `InsightDocumentCard`
6. `view_report` proposal + frontend confirm-card (read-only navigation)
7. `generate_intelligence_report` proposal + confirm dialog with credit preview
8. `trigger_manual_insight_run` proposal (Expert/deep-dive path)

**Phase 4 (after Trail UI and comparison view ship):**
9. `get_insight_trail` — full trail history
10. `get_checkpoint_detail` — single checkpoint deep dive (may be Phase 0.5+ if only reading legacy table data)
11. `compare_checkpoints` — side-by-side checkpoint comparison
12. `view_report` action proposal — opens Trail report viewer
