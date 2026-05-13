# Backend Routes

All routes are Express routers mounted in `src/index.js`.
Every route except `public.js` requires authentication via `requireAuth` middleware.
After `requireAuth`, `req.orgId` and `req.userId` are available.

## Route files

### local/surveys.js — /api/surveys
Full CRUD for surveys. Key behaviors:
- LIST: server-side search (q), filters (status, survey_type_id), sort, pagination → returns `{ surveys, total, page, limit, hasMore, stats }`
- stats always unfiltered org-wide: total_surveys, active_surveys, total_responses, avg_nps
- CREATE: requires title; stores questions as JSONB; sets status='draft'
- UPDATE: parameterized; handles lifecycle status transitions (paused_at, closed_at timestamps)
- DELETE: soft-delete (sets deleted_at) — data retained for audit
- PUBLISH: guards against empty surveys; sets status='active', published_at

### local/responses.js (or responses.js) — /api/surveys/:id/responses
- POST: public endpoint for response submission (no auth)
- GET: returns all responses for a survey

### ai.js — /api/ai
- POST /generate-survey: generates survey questions from intent + survey type via OpenRouter
- POST /refine-survey: refines existing questions based on user message
- POST /analyze-insights: runs AI analysis on survey responses

### public.js — /s/:token
Public-facing survey fetch endpoint. No auth. Returns survey data for respondent fill.

### templates.js — /api/templates
Template library CRUD. System templates (is_system=true) are read-only.
clone endpoint duplicates template to org's library.

### workflows.js — /api/workflows
Workflow automation rules. toggle endpoint pauses/resumes without deleting.

## SQL safety rules
- ALWAYS use parameterized queries: `db.query('SELECT * WHERE id = $1', [id])`
- NEVER interpolate user input into SQL strings
- ALWAYS filter `AND deleted_at IS NULL` for surveys
- Status values are constrained by CHECK constraint — validate before inserting
