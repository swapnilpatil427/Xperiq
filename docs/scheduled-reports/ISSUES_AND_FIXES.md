# Intelligence Briefings — Issues and Fixes Synthesis

> **Feature:** Scheduled Intelligence Reports ("Intelligence Briefings")
> **Reviewed by:** Elena Vasquez (Security & Privacy), Roberto Nakamura (Infrastructure/Ops), Diana Okafor (Customer Success/UX)
> **Synthesis date:** 2026-06-29

---

## 1. Executive Summary

The Intelligence Briefings design is architecturally sound in its core scheduling, templating, and LLM narrative generation pipeline. The data model is well-structured, and the phased rollout plan is credible. However, the design has three significant gaps that prevent a safe launch.

First, the security surface is underspecified: LLM-generated narrative is piped into HTML templates without a sanitization step, share links are unauthenticated and unrevocable, and GDPR deletion does not cascade to artifact storage — all three are critical issues. Second, the infrastructure layer lacks the concurrency controls and queue backpressure required to handle even a modest production load without rate-limit spirals or in-process resource contention between PDF rendering and LLM calls. Third, the UX design omits the approval workflow and narrative correction mechanism that any business stakeholder sending Crystal-generated content to executives will require on day one.

The fixes are well-scoped and mostly additive; none require a redesign of the core graph or scheduler. With the must-fix set addressed, the feature is shippable.

---

## 2. Full Issue Registry

| # | ID | Found By | Severity | Title | Description | Exact Fix | Files Affected |
|---|-----|----------|----------|-------|-------------|-----------|----------------|
| 1 | SEC-001 | Elena Vasquez | Critical | LLM output HTML injection in emails | Crystal may quote respondent verbatims containing XSS payloads directly into Jinja2 templates without escaping. | Enable `autoescape=True` on all Jinja2 Environment instances and add a post-processing step to HTML-escape Crystal narrative content derived from verbatims before template insertion. | `crystalos/shared/email_renderer.py`, `crystalos/templates/email/base.html.j2` |
| 2 | SEC-002 | Elena Vasquez | Critical | PII in report artifacts without encryption or deletion | `report_artifacts.highlights` stores inline verbatim quotes and respondent IDs; GDPR deletion of a response row does not scrub existing artifacts. | Store respondent_id references in highlights, not inline quotes; resolve at render time. Add a scrubbing job triggered on response deletion. Add column-level encryption for `html_content`, `narrative_text`, and `highlights`. | `supabase/migrations/`, `backend/src/db/reportArtifacts.ts`, `crystalos/graphs/report_generation.py` |
| 3 | SEC-003 | Elena Vasquez | Critical | Recipient email spoofing | `POST /api/reports/:id/recipients` accepts external email addresses without validating membership in the org, enabling delivery of confidential NPS data to outsiders. | Add `recipient_domain_mode` to `scheduled_reports` (default `'org_only'`), restricting recipients to org-verified domain or existing Clerk users. External overrides require explicit admin action with audit log entry. | `backend/src/routes/reports.ts`, `supabase/migrations/`, `app/src/components/reports/builder/StepDelivery.tsx` |
| 4 | SEC-004 | Elena Vasquez | High | Email header injection | User-supplied strings (org name, survey name, report name) are interpolated into email Subject headers without stripping CRLF characters. | Strip `\r`, `\n`, `\0` from all user-supplied strings before interpolation into email headers. Post-process `generate_narrative`'s `subject_line` output with the same sanitizer. | `backend/src/services/emailDelivery.ts`, `crystalos/graphs/report_generation.py` |
| 5 | SEC-005 | Elena Vasquez | High | Unsigned artifact preview URLs and PDF storage keys | `pdf_storage_key` is stored as a permanent path; PDF download links never expire. Artifact content returned without confirming artifact-level org isolation. | Generate presigned URLs (5-minute expiry) at API call time, not at storage time. Verify `report_artifacts.org_id = req.orgId` on all artifact fetch paths independently of the parent `scheduled_reports.org_id` check. | `backend/src/routes/reports.ts`, `backend/src/db/reportArtifacts.ts` |
| 6 | SEC-006 | Elena Vasquez | High | Missing SendGrid webhook signature verification | The inbound SendGrid event webhook has no signature verification, allowing an attacker to POST fake bounce/unsubscribe events. | Implement `@sendgrid/eventwebhook` signature verification on all inbound SendGrid webhook requests; return 401 on failure. Add `SENDGRID_WEBHOOK_SIGNING_SECRET` to `.env.example` and `docs/ENV_VARS.md`. | `backend/src/routes/webhooks.ts` (new), `backend/.env.example`, `docs/ENV_VARS.md` |
| 7 | SEC-007 | Elena Vasquez | High | 30-day unauthenticated share links expose org data | Share links are valid 30 days, require no auth, expose NPS scores and verbatim quotes, and cannot be revoked. | Replace with token-gated links backed by a `report_shares` table containing `expires_at`, `created_by_user_id`, and `revoked_at`. Log every access (IP, timestamp). Add a revocation endpoint for the report creator. | `supabase/migrations/`, `backend/src/routes/reports.ts`, `app/src/pages/reports/[id]/view/[runId].tsx` |
| 8 | SEC-008 | Elena Vasquez | Medium | Permanent unsubscribe tokens with no re-subscribe flow | Unsubscribe tokens never expire and there is no re-subscribe path; accidental unsubscribes are irreversible. | Notify the report creator on any unsubscribe event. Add a `GET /api/reports/resubscribe/:token` endpoint (separate token sent in the unsubscribe confirmation email). Log unsubscribe events with timestamp and user agent. | `backend/src/routes/reports.ts`, `backend/src/services/emailDelivery.ts` |
| 9 | SEC-009 | Elena Vasquez | Medium | `metricPayload` exposed in preview API response | The preview endpoint returns full aggregated metric data in `metricPayload` for "debugging," creating a data leak risk if the endpoint's auth is relaxed. | Remove `metricPayload` from the public preview response. Add a separate `GET /api/reports/:id/runs/:runId/debug` endpoint gated to the `admin` role only. | `backend/src/routes/reports.ts` |
| 10 | SEC-010 | Elena Vasquez | Medium | No recipient verification for external emails | External email addresses added as recipients are never verified for ownership; the added address receives org data without confirming intent. | For external (non-org-member) recipients, send a one-time confirmation email before any report delivery. Store `confirmation_token` and `confirmed_at` on `report_recipients`. | `supabase/migrations/`, `backend/src/routes/reports.ts`, `backend/src/services/emailDelivery.ts` |
| 11 | SEC-011 | Elena Vasquez | Low | GET-based unsubscribe mutation | `GET /api/reports/unsubscribe/:token` performs a state mutation on a GET request, susceptible to CSRF via embedded image URLs. | Change the actual mutation to `POST /api/reports/unsubscribe/:token`. The GET endpoint renders a confirmation page whose form POSTs to the mutation endpoint. | `backend/src/routes/reports.ts` |
| 12 | SEC-012 | Elena Vasquez | Low | No Content-Security-Policy on artifact HTML previews | HTML artifacts served in-app via iframe carry no CSP header, allowing the iframe content to execute scripts. | Serve artifact HTML with `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; img-src data: https:;` on all preview response paths. | `backend/src/routes/reports.ts` |
| 13 | OPS-001 | Roberto Nakamura | P0 | No generation queue | No concurrency cap on LLM calls; at peak load (5,000 simultaneous reports) this causes provider rate limiting, cost spikes, and CrystalOS OOM. | Implement a BullMQ (Redis-backed) job queue for report generation with `concurrency: 20` for narrative generation and `concurrency: 3` for PDF generation. | `backend/src/services/reportQueue.ts` (new), `backend/src/services/reportScheduler.ts` |
| 14 | OPS-002 | Roberto Nakamura | P0 | PDF generation in-process with LLM graph | Playwright/Chromium (~500 MB RAM, 30s/render) runs inside the same CrystalOS process as LLM calls, causing resource contention and instability. | Extract PDF generation into a dedicated sidecar service. The `render_pdf` graph node calls `POST /render-pdf` on the sidecar (configurable pool of 3 Chromium instances) rather than spawning Playwright in-process. | `crystalos/graphs/report_generation.py`, `docker/pdf-renderer/` (new), `docker-compose.yml` |
| 15 | OPS-003 | Roberto Nakamura | P1 | CrystalOS single point of failure | No fallback if CrystalOS is down; scheduled reports silently fail to deliver. | Add a fallback mode in `enqueueReportRun`: if the CrystalOS healthcheck fails, generate a data-only report (KPI row + metric table, no narrative) from Redis-cached metrics and deliver it with a "Crystal narrative unavailable" notice. | `backend/src/services/reportScheduler.ts`, `backend/src/services/reportFallback.ts` (new) |
| 16 | OPS-004 | Roberto Nakamura | P1 | Run deduplication gap | No unique constraint on `(scheduled_report_id, scheduled_for_time)`; Redis lock expiry could allow duplicate runs for the same scheduled slot. | Add a `scheduled_for_time TIMESTAMPTZ NOT NULL` column to `report_runs` and a `UNIQUE (scheduled_report_id, scheduled_for_time)` constraint. | `supabase/migrations/` |
| 17 | OPS-005 | Roberto Nakamura | P1 | Email bounce handling absent | No handler for SendGrid bounce events; bounced recipients remain active, causing continued delivery attempts to invalid addresses. | Implement `POST /api/webhooks/sendgrid` handler for `bounce` and `dropped` events: set `report_recipients.is_active = false` and notify the report creator. | `backend/src/routes/webhooks.ts` |
| 18 | OPS-006 | Roberto Nakamura | P1 | No per-org LLM rate limiting or cost cap | No per-org limit on report generation; a single org can generate 100 LLM calls per week with no cost ceiling. | Add a `reports_generated_this_month` counter to org metrics. Enforce plan limits (Growth: 5, Growth+: 50, Enterprise: unlimited). Add `monthly_generation_budget_usd` to org settings. | `backend/src/db/organizations.ts`, `backend/src/routes/reports.ts` |
| 19 | OPS-007 | Roberto Nakamura | P1 | Synchronous preview blocks HTTP connection | `POST /api/reports/:id/run-now?preview_only=true` holds the HTTP connection open for 5-12 seconds, degrading API gateway performance. | Make preview async: return a `previewRunId` immediately (202 Accepted). Frontend polls `GET /api/reports/:id/runs/:runId/preview-status` until `status = 'ready'`. | `backend/src/routes/reports.ts`, `app/src/hooks/useReportPreview.ts` |
| 20 | OPS-008 | Roberto Nakamura | P2 | `LIMIT 100` scheduler cap | With 1,000+ due reports, the scheduler processes only 100 per tick, causing reports to fall 10+ minutes behind schedule. | Increase `LIMIT 100` to `LIMIT 500` (backpressure handled by the BullMQ queue). Emit a `report.scheduler.lag_seconds` metric; alert if P95 lag exceeds 120 seconds. | `crystalos/scheduler/report_scheduler.py` |
| 21 | OPS-009 | Roberto Nakamura | P2 | DST transition testing gap | `croniter` handles DST correctly, but there are no tests covering fall-back (double-fire risk) or spring-forward (skip risk) scenarios. | Add unit tests for DST transitions: (a) clocks fall back — run does not fire twice; (b) clocks spring forward — run fires at the next valid time. | `crystalos/tests/test_report_scheduler.py` (new) |
| 22 | OPS-010 | Roberto Nakamura | P2 | Artifact storage backend unspecified | No decision on storage provider; no file size limits; no pruning job specification. | Adopt Supabase Storage for consistency with the existing stack. Add size constants (`MAX_ARTIFACT_HTML_SIZE_KB = 512`, `MAX_ARTIFACT_PDF_SIZE_MB = 25`). Add a pruning cron: `DELETE FROM report_artifacts WHERE expires_at < now()` plus matching object deletion. | `backend/src/services/artifactStorage.ts` (new), `docs/ENV_VARS.md` |
| 23 | OPS-011 | Roberto Nakamura | P2 | No observability for generation pipeline | No tracing, metrics, or alerting on the report generation graph. | Add OpenTelemetry spans per graph node. Emit `report.generation.duration_ms`, `report.delivery.success_rate`, `report.artifact.size_bytes`. Alert on generation P99 > 30s, delivery success rate < 99%, scheduler lag > 120s. | `crystalos/graphs/report_generation.py`, `backend/src/services/reportScheduler.ts` |
| 24 | CX-001 | Diana Okafor | Must Fix | No approval workflow before delivery | No mechanism to review Crystal's narrative before it is sent to external stakeholders; the report auto-delivers on schedule regardless of content quality. | Add `approval_mode BOOLEAN NOT NULL DEFAULT false` to `scheduled_reports`. When true, completed runs set `status = 'pending_approval'`. Add `POST /api/reports/:id/runs/:runId/approve` and `reject` endpoints; notify creator on readiness. | `supabase/migrations/`, `backend/src/routes/reports.ts`, `app/src/pages/reports/[id].tsx` |
| 25 | CX-002 | Diana Okafor | Must Fix | No narrative correction mechanism | When Crystal generates a factually wrong sentence, there is no way to correct it or flag it for future improvement. | Add `narrative_overrides JSONB` to `report_artifacts`. In the web view, expose an admin-only "Edit Crystal's narrative" control. Store `{ original, corrected, corrected_by_user_id, corrected_at }` per override and feed corrections back into the Crystal quality pipeline. | `supabase/migrations/`, `backend/src/routes/reports.ts`, `app/src/pages/reports/[id]/view/[runId].tsx` |
| 26 | CX-003 | Diana Okafor | Must Fix | No report archive or historical browsing | Run History is paginated but not organized; there is no way to browse prior reports by month or quarter. | Add `GET /api/reports/:id/archive` returning runs grouped by month. Add an Archive view with a month/calendar selector to the report detail page. | `backend/src/routes/reports.ts`, `app/src/pages/reports/[id].tsx` |
| 27 | CX-004 | Diana Okafor | Must Fix | No engagement analytics | Delivery status shows sent/failed but no opens or click-throughs; report creators cannot tell if their reports are being read. | Use SendGrid open/click webhook events to populate a `report_delivery_events` table. Show per-recipient engagement ("Sarah Chen: opened 2 hours after delivery") in the Run History drawer. | `supabase/migrations/`, `backend/src/routes/webhooks.ts`, `app/src/components/reports/RunHistoryDrawer.tsx` |
| 28 | CX-005 | Diana Okafor | Must Fix | Crystal on-demand report from chat not designed | Phase 5 MCP skill is proposed as a confirm-card but the full conversational flow (natural language scope to pre-filled report card) is not specified or tested. | Extend the MCP skill to parse natural language scope. Document the full conversation flow and test cases in `crystalos/skills/generate_report/SKILL.md`. | `crystalos/skills/generate_report/SKILL.md` |
| 29 | CX-006 | Diana Okafor | Should Fix | Recipient management too basic | No recipient groups, no Slack integration, and no self-service add/remove for recipients. | Add a `recipient_groups` concept (saved lists). Add a token-gated `GET /api/reports/manage/:token` endpoint sent with each delivery for self-service add/remove. | `supabase/migrations/`, `backend/src/routes/reports.ts` |
| 30 | CX-007 | Diana Okafor | Should Fix | No custom KPI thresholds | No way to configure warning/critical thresholds for KPI cells (e.g., NPS < 30 = red). | Add `kpi_thresholds JSONB` to `template_overrides`. The `render_html` node applies threshold rules to color KPI cells. Expose threshold configuration in the builder's StepTemplate component. | `crystalos/graphs/report_generation.py`, `app/src/components/reports/builder/StepTemplate.tsx` |
| 31 | CX-008 | Diana Okafor | Should Fix | No per-recipient timezone delivery | All recipients receive the report at the same delivery time; no per-recipient timezone override. | Add `delivery_timezone TEXT` to `report_recipients`. The scheduler computes delivery time per-recipient, overriding the report-level timezone for the per-recipient email fan-out. | `supabase/migrations/`, `crystalos/scheduler/report_scheduler.py` |
| 32 | CX-009 | Diana Okafor | Should Fix | Report sharing has no audit trail | 30-day share links generate no access log; there is no visibility into who has viewed shared reports. | Implement `report_shares` table with per-access log (`accessed_at`, IP). Resolved in full by SEC-007. | `supabase/migrations/`, `backend/src/routes/reports.ts` |
| 33 | CX-010 | Diana Okafor | Nice to Have | Custom header branding below Enterprise tier | Org logo in email header is Enterprise-only; Growth+ customers have no branding option. | Add `header_logo_url TEXT` to `scheduled_reports` for Growth+ tier. Allow upload to Supabase Storage. Reference the URL in the email base template. | `supabase/migrations/`, `backend/src/routes/reports.ts`, `crystalos/templates/email/base.html.j2` |

---

### Detailed Fix Specifications

**SEC-001 — LLM output HTML injection**
- Instantiate all Jinja2 `Environment` objects in `email_renderer.py` with `autoescape=select_autoescape(['html', 'xml'])` or `autoescape=True`.
- Add a `sanitize_narrative_content(text: str) -> str` utility in `crystalos/shared/` that calls `html.escape()` on any string segment derived from user verbatim input before it is passed to a template variable.
- The `generate_narrative` graph node must tag its output with a `source: 'verbatim'` marker so the post-processor knows which fields to escape.
- Add a regression test: inject `<script>alert(1)</script>` as an open-text response and assert the rendered HTML contains `&lt;script&gt;`, not a live tag.

**SEC-002 — PII in report artifacts without encryption or deletion**
- Change `highlights JSONB` schema from `{ quote: string, respondent_id: string }` to `{ respondent_id: UUID, metric_context: string }`. Resolve the quote at render time via a join against the live responses table.
- Implement `scrub_artifact(artifact_id, deleted_respondent_id)` in `backend/src/db/reportArtifacts.ts`: sets `html_content = NULL`, `narrative_text = NULL`, and removes the matching entry from `highlights`, then triggers a regeneration of the static artifact from the scrubbed data.
- Add a database trigger or application-layer hook on `survey_responses` soft-deletes (`deleted_at IS NOT NULL`) to enqueue the artifact scrub job.
- Apply column-level encryption (Supabase Vault or `pgcrypto`) to `html_content`, `narrative_text`, and `highlights` columns; document the key management strategy in `docs/ENV_VARS.md`.

**SEC-003 — Recipient email spoofing**
- Add `recipient_domain_mode TEXT NOT NULL DEFAULT 'org_only'` to `scheduled_reports`.
- In `POST /api/reports/:id/recipients`, validate that the submitted email domain matches `organizations.verified_email_domain` or that the user exists in Clerk for the org. Reject non-matching addresses with a `403` and a descriptive error message when `recipient_domain_mode = 'org_only'`.
- When `recipient_domain_mode = 'external_allowed'` (admin-set), require the request to include an `audit_reason TEXT` field, write the override to an `audit_log` entry, and enable SEC-010 (external email confirmation).
- Expose the `recipient_domain_mode` toggle in the report builder's StepDelivery as an admin-gated control.

**SEC-004 — Email header injection**
- Add a `sanitizeEmailHeader(value: string): string` utility that replaces `\r`, `\n`, and `\0` with a space and trims leading/trailing whitespace.
- Apply this utility to every user-supplied string before it is interpolated into SendGrid's `subject`, `from_name`, and `reply_to` fields in `emailDelivery.ts`.
- In CrystalOS, add a post-processor on the `generate_narrative` node output that runs the same strip logic on the `subject_line` field before it is returned to the backend.

**SEC-005 — Unsigned artifact preview URLs**
- Remove `pdf_storage_key TEXT` as a permanently stored URL. Store `pdf_artifact_path TEXT` (the internal object storage path) and generate a presigned URL with a 5-minute TTL only when the download is requested.
- In the artifact fetch handler, add an explicit `WHERE org_id = $orgId` clause on `report_artifacts` that is independent of the parent `scheduled_reports.org_id` check. This ensures no lateral movement if a `report_artifacts` row is ever orphaned.

**SEC-006 — Missing SendGrid webhook signature verification**
- Install `@sendgrid/eventwebhook` in the backend.
- In `backend/src/routes/webhooks.ts`, parse `X-Twilio-Email-Event-Webhook-Signature` and `X-Twilio-Email-Event-Webhook-Timestamp` headers. Use `EventWebhook.verifySource(payload, pubKey, signature, timestamp)`. Return `401` on failure.
- Register `SENDGRID_WEBHOOK_SIGNING_SECRET` in `.env.example` and `docs/ENV_VARS.md` with a note that the key is the ECDSA public key from the SendGrid dashboard.
- Add a test that verifies a tampered payload is rejected with 401.

**SEC-007 — Unauthenticated share links**
- Create a `report_shares` table (see Section 5 for schema).
- Generate `share_token = crypto.randomUUID()` at share creation time; never expose the internal `report_run_id` directly in the share URL.
- On each access of `/reports/share/:token`, insert a row into `report_share_accesses (share_id, accessed_at, ip_address, user_agent)`.
- Add `DELETE /api/reports/:id/shares/:shareId` to revoke a share (sets `revoked_at = now()`). The report web view shows the share token as expired if `revoked_at IS NOT NULL OR expires_at < now()`.

**OPS-001 — No generation queue**
- Create `backend/src/services/reportQueue.ts` defining a BullMQ `Queue` named `report-generation` and a `Worker` that calls `crystalosClient.runGraph('report_generation', payload)`.
- Set `Worker` concurrency to `20` for `narrative_generation` jobs and `3` for `pdf_generation` jobs (separate queues or job types).
- The scheduler enqueues a job rather than calling CrystalOS directly. The worker handles retries (3 attempts, exponential backoff starting at 30 seconds).
- Expose queue depth and worker utilization as metrics (`report.queue.depth`, `report.queue.worker_utilization`) for the OPS-011 observability layer.

**OPS-002 — PDF generation in-process**
- Create `docker/pdf-renderer/` containing a minimal Node.js/Playwright HTTP service exposing `POST /render-pdf { html: string } -> { pdfBuffer: base64 }`.
- In `crystalos/graphs/report_generation.py`, replace the in-process `playwright.chromium.launch()` call in `render_pdf` with an `httpx.post(PDF_RENDERER_URL + '/render-pdf', json={'html': html_content})`.
- Add `PDF_RENDERER_URL` to `backend/.env.example`, `crystalos/.env.example`, and `docs/ENV_VARS.md`.
- The sidecar runs with `CHROMIUM_POOL_SIZE=3` (default). Add a `docker-compose.yml` service entry with `mem_limit: 1.5g`.

**OPS-003 — CrystalOS single point of failure**
- In `reportScheduler.ts`, before enqueuing a generation job, call `GET http://{CRYSTALOS_URL}/health` with a 2-second timeout.
- On failure, invoke `generateFallbackReport(report, metrics)` from `reportFallback.ts`, which assembles a data-only HTML artifact from the pre-computed metric rows in Redis.
- Prepend a notice banner to the fallback artifact: "Crystal narrative unavailable at generation time — showing data only. A corrected report will be delivered when Crystal service resumes."
- Record `run.fallback_used = true` in the `report_runs` row for operational visibility.

**OPS-004 — Run deduplication gap**
- Add `scheduled_for_time TIMESTAMPTZ NOT NULL` to `report_runs`.
- Add `UNIQUE (scheduled_report_id, scheduled_for_time)` constraint.
- In the scheduler INSERT, use `ON CONFLICT (scheduled_report_id, scheduled_for_time) DO NOTHING` so that a duplicate scheduler tick is a no-op rather than an error.

**CX-001 — No approval workflow**
- Add `approval_mode BOOLEAN NOT NULL DEFAULT false` to `scheduled_reports` and `approved_by_user_id UUID`, `approved_at TIMESTAMPTZ`, `rejected_reason TEXT` to `report_runs`.
- The generation graph sets `status = 'pending_approval'` as its terminal state when `approval_mode = true`.
- Add `POST /api/reports/:id/runs/:runId/approve` (sets `status = 'delivered'`, triggers email fan-out) and `POST /api/reports/:id/runs/:runId/reject` (sets `status = 'cancelled'`, records reason).
- Send an in-app notification to `created_by_user_id` when a run reaches `pending_approval`: "Your [Report Name] is ready to review before sending."
- The Run History drawer shows a "Pending Approval" badge with Approve / Reject action buttons for the report creator.

**CX-002 — No narrative correction mechanism**
- Add `narrative_overrides JSONB DEFAULT '[]'` to `report_artifacts`. Schema per element: `{ id: uuid, original: string, corrected: string, corrected_by_user_id: uuid, corrected_at: timestamp }`.
- In `app/src/pages/reports/[id]/view/[runId].tsx`, render each narrative paragraph with an admin-gated inline edit icon that opens a correction modal pre-populated with the original text.
- On save, `PATCH /api/reports/:id/runs/:runId/artifact` appends the override to `narrative_overrides` and returns the updated artifact.
- Periodically (weekly batch job) extract `narrative_overrides` across the org and push them to the Crystal quality pipeline as negative examples.

---

## 3. Priority Matrix

### Must Fix Before Launch

The following issues are launch-blocking. Shipping without each fix creates an unacceptable security, compliance, operational, or user trust risk.

| ID | One-sentence launch-blocking reason |
|----|--------------------------------------|
| SEC-001 | XSS payloads from respondent verbatims execute in email web views and the in-app report viewer, affecting all recipients and potentially stealing session tokens. |
| SEC-002 | Inline PII in artifact storage means GDPR deletion requests cannot be honored; shipping with this violates GDPR Article 17 by design. |
| SEC-003 | Org admins can route confidential customer NPS data and verbatim quotes to external competitors with zero friction or audit trail. |
| SEC-004 | Email header injection allows spam amplification and Bcc exfiltration attacks via the org-name field. |
| SEC-005 | Permanent PDF storage keys mean any shared or leaked URL provides indefinite access to org report artifacts. |
| SEC-006 | Unverified SendGrid webhooks allow an attacker to mark all recipients as bounced or unsubscribed, silencing report delivery for an entire org. |
| SEC-007 | Unauthenticated 30-day share links with no revocation expose executive-level org metrics and customer verbatims to anyone who intercepts the link. |
| OPS-001 | Without a generation queue, a Monday 9am peak causes simultaneous LLM calls from all orgs, triggering provider rate limits and potential $500+/minute cost spikes on day one. |
| OPS-002 | In-process Playwright PDF rendering inside CrystalOS causes OOM crashes under concurrent load, taking down the entire LLM pipeline — not just PDF generation. |
| OPS-004 | Without the deduplication constraint, a Redis lock expiry under load produces duplicate report deliveries to all recipients. |
| CX-001 | Without an approval workflow, Crystal-generated narratives containing factual errors or hallucinations deliver automatically to executives; the first bad delivery will kill adoption. |

### Post-Launch Roadmap

**30 Days (First Sprint Post-Launch)**

- SEC-008: Unsubscribe re-subscribe flow and creator notification
- SEC-009: Remove `metricPayload` from preview endpoint
- SEC-010: External recipient confirmation email
- SEC-011: Convert GET unsubscribe to POST mutation
- SEC-012: CSP header on artifact HTML previews
- OPS-003: CrystalOS fallback (data-only report on service failure)
- OPS-005: SendGrid bounce event handler
- OPS-006: Per-org report generation limits and cost caps
- OPS-007: Async preview endpoint (202 + polling)
- CX-002: Narrative correction mechanism
- CX-004: Engagement analytics (open/click tracking via SendGrid webhooks)

**60 Days (Second Sprint)**

- OPS-008: Scheduler `LIMIT 500` and lag metric alert
- OPS-009: DST transition unit tests
- OPS-010: Artifact storage decision (Supabase Storage), size limits, pruning cron
- OPS-011: OpenTelemetry spans and generation pipeline alerts
- CX-003: Report archive with month/calendar selector
- CX-005: Crystal on-demand report from chat (Phase 5 conversation flow and SKILL.md)
- CX-009: Share link audit trail (resolved by SEC-007 implementation)

**90 Days (Third Sprint)**

- CX-006: Recipient groups and self-service add/remove
- CX-007: Custom KPI thresholds in template builder
- CX-008: Per-recipient timezone delivery
- CX-010: Growth+ tier custom header branding

---

## 4. Updated Architecture Decisions

### Decision 1: Presigned Artifact URLs

**Problem it solves:** SEC-005 — PDF storage keys stored as permanent paths create indefinite access links.

**Before:** `report_artifacts.pdf_storage_key TEXT` stores the full GCS/S3 object path. The download endpoint returns this path or a direct URL. Links never expire.

**After:** `report_artifacts.pdf_artifact_path TEXT` stores only the internal object path. The download endpoint calls `storage.generatePresignedUrl(path, { expiresIn: 300 })` at request time and returns the temporary URL. No permanent download URL is ever stored or returned.

**Migration path:** Rename the column in a non-breaking migration (`ALTER TABLE report_artifacts RENAME COLUMN pdf_storage_key TO pdf_artifact_path`). Deploy the updated endpoint handler before the migration completes, using a feature flag to switch between the old and new URL generation paths. No data migration required.

---

### Decision 2: HTML Sanitization Pipeline for LLM Output

**Problem it solves:** SEC-001 — Crystal narrative derived from verbatims may contain XSS payloads that execute in HTML artifact templates.

**Before:** Crystal narrative text is passed directly as a Jinja2 template variable. Autoescape is not explicitly set.

**After:** All Jinja2 `Environment` instances use `autoescape=True`. A `sanitize_narrative_content(text: str) -> str` function using `html.escape()` is applied to any string segment tagged with `source: 'verbatim'` before template rendering. Crystal graph nodes annotate their output fields with a provenance tag (`'verbatim'` vs `'generated'`) so the sanitizer knows what to escape.

**Migration path:** Add the `sanitize_narrative_content` utility and provenance tagging to the graph in one PR. Update all `Environment` instantiations in the same PR. Deploy to staging and run the XSS regression test suite before merging.

---

### Decision 3: BullMQ Generation Queue with Concurrency Control

**Problem it solves:** OPS-001 and OPS-002 — No backpressure on LLM calls or PDF rendering causes cost spikes, rate limiting, and OOM crashes at peak load.

**Before:** `reportScheduler.ts` calls CrystalOS directly for each due report. PDF generation runs inside the same CrystalOS process as LLM calls.

**After:** `reportScheduler.ts` enqueues a `report-generation` job per due report into a BullMQ queue backed by the existing Redis instance. A pool of 20 narrative workers and 3 PDF workers process jobs concurrently. PDF generation is handled by a separate `pdf-renderer` sidecar service (Docker). The BullMQ queue provides retry logic, dead-letter storage, and queue depth metrics.

**Migration path:** Deploy `reportQueue.ts` and the `pdf-renderer` sidecar alongside the existing direct-call path. Switch the scheduler to queue-based dispatch behind a feature flag. Monitor queue depth and worker utilization for one week before retiring the direct-call path.

---

### Decision 4: Approval Workflow State Machine

**Problem it solves:** CX-001 — Crystal narratives auto-deliver to executives without any human review gate.

**Before:** Report generation graph terminal state is `'delivered'`. No human gate exists.

**After:** `scheduled_reports.approval_mode BOOLEAN` controls routing. When `true`, the graph terminal state is `'pending_approval'`. The state machine for `report_runs.status` becomes: `queued -> generating -> pending_approval -> (approved -> delivered | rejected -> cancelled)`. The creator receives an in-app notification at `pending_approval`. `POST /approve` transitions to `delivered` and triggers the email fan-out; `POST /reject` transitions to `cancelled` with a required `reason` field.

**Migration path:** Add the new columns and status values in a migration. Add the `approve` and `reject` endpoints. Wire the frontend notification. `approval_mode` defaults to `false`, so existing report behavior is unchanged. Teams opt in per-report.

---

### Decision 5: Recipient Verification and Domain Allowlist

**Problem it solves:** SEC-003 and SEC-010 — Any email address can receive confidential org reports; external addresses are never verified.

**Before:** `POST /api/reports/:id/recipients` accepts any email with no domain or ownership check.

**After:** `scheduled_reports.recipient_domain_mode` (default `'org_only'`) gates the recipient add endpoint. For `'org_only'`, the backend validates the email domain against `organizations.verified_email_domain` or checks Clerk org membership. For `'external_allowed'` (admin override), the backend sends a one-time confirmation email to the external address; the recipient is `is_active = false` until `confirmed_at` is set. This is enforced at the API layer, not the UI layer, so it cannot be bypassed by API clients.

**Migration path:** Add `recipient_domain_mode` column to `scheduled_reports` with a default of `'org_only'`. Add `confirmation_token UUID` and `confirmed_at TIMESTAMPTZ` to `report_recipients`. Deploy the updated route handler. Existing recipients are grandfathered as confirmed (set `confirmed_at = created_at` for existing rows in the migration).

---

### Decision 6: GDPR-Compliant Artifact Storage (Reference Storage vs. Inline PII)

**Problem it solves:** SEC-002 — Inline verbatim quotes in `report_artifacts` cannot be scrubbed when a respondent submits a GDPR deletion request.

**Before:** `report_artifacts.highlights JSONB` stores `{ quote: string, respondent_id: string }` inline. `html_content TEXT` embeds rendered verbatims directly. Deleting a `survey_responses` row does not affect existing artifacts.

**After:** `highlights JSONB` stores only `{ respondent_id: UUID, metric_context: string }`. Verbatims are resolved by joining against the live `survey_responses` table at render time. When a response is soft-deleted (`deleted_at IS NOT NULL`), an artifact scrub job is enqueued: it NULLs `html_content` and `narrative_text` for all artifacts that reference the deleted respondent, and sets `artifact_status = 'scrubbed'`. A regeneration job re-renders the artifact from scrubbed data and updates `artifact_status = 'ready'`. Column-level encryption (Supabase Vault) is applied to `html_content`, `narrative_text`, and `highlights` at rest.

**Migration path:** Migrate existing `highlights` JSONB rows to strip inline quotes in a data migration script (one-time). Deploy the updated `report_generation.py` graph that writes references instead of inline quotes. Add the scrub job infrastructure. Apply column encryption in a separate migration after data is migrated (encryption key rotation plan documented in `docs/ENV_VARS.md`).

---

## 5. Revised Data Model Additions

The following SQL captures only the new columns and tables required by the fixes above. The base schema from `DESIGN.md` is unchanged.

```sql
-- OPS-004: Run deduplication + fallback tracking
ALTER TABLE report_runs
  ADD COLUMN scheduled_for_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN fallback_used      BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN approved_by_user_id UUID       REFERENCES auth.users(id),
  ADD COLUMN approved_at        TIMESTAMPTZ,
  ADD COLUMN rejected_reason    TEXT;

ALTER TABLE report_runs
  ADD CONSTRAINT report_runs_dedup UNIQUE (scheduled_report_id, scheduled_for_time);

-- CX-001: Approval workflow + SEC-003: Domain allowlist
ALTER TABLE scheduled_reports
  ADD COLUMN approval_mode        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN recipient_domain_mode TEXT   NOT NULL DEFAULT 'org_only',
  ADD COLUMN header_logo_url      TEXT;             -- CX-010

-- SEC-003 / SEC-010: Recipient verification + CX-008: Per-recipient timezone
ALTER TABLE report_recipients
  ADD COLUMN confirmation_token UUID        DEFAULT gen_random_uuid(),
  ADD COLUMN confirmed_at       TIMESTAMPTZ,
  ADD COLUMN delivery_timezone  TEXT;

-- CX-002: Narrative corrections + SEC-002: Artifact scrubbing + SEC-005: Presigned path
ALTER TABLE report_artifacts
  ADD COLUMN narrative_overrides JSONB       NOT NULL DEFAULT '[]',
  ADD COLUMN artifact_status     TEXT        NOT NULL DEFAULT 'ready',
  ADD COLUMN pdf_artifact_path   TEXT;
-- artifact_status values: 'ready' | 'scrubbed' | 'regenerating'

-- SEC-007: Token-gated share links
CREATE TABLE report_shares (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_run_id  UUID        NOT NULL REFERENCES report_runs(id) ON DELETE CASCADE,
  org_id         UUID        NOT NULL REFERENCES organizations(id),
  share_token    UUID        NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  created_by     UUID        NOT NULL REFERENCES auth.users(id),
  expires_at     TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '30 days',
  revoked_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE report_share_accesses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  share_id    UUID        NOT NULL REFERENCES report_shares(id) ON DELETE CASCADE,
  accessed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip_address  INET,
  user_agent  TEXT
);

-- CX-004: Delivery engagement events
CREATE TABLE report_delivery_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID        NOT NULL REFERENCES report_deliveries(id) ON DELETE CASCADE,
  event_type  TEXT        NOT NULL,  -- 'open' | 'click' | 'bounce' | 'unsubscribe'
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata    JSONB
);

-- OPS-006: Per-org report usage tracking
ALTER TABLE organizations
  ADD COLUMN reports_generated_this_month  INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN monthly_generation_budget_usd NUMERIC(10,2);

-- Indexes for common access patterns
CREATE INDEX report_shares_token_idx
  ON report_shares (share_token)
  WHERE revoked_at IS NULL;

CREATE INDEX report_delivery_events_delivery_idx
  ON report_delivery_events (delivery_id, event_type);

CREATE INDEX report_runs_scheduled_for_idx
  ON report_runs (scheduled_for_time, status);
```
