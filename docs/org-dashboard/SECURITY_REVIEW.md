# Xperiq Command Center — Security Review

**Reviewer:** Dr. Rafi Goldstein, Security Architect (ex-Cloudflare, ex-Auth0)  
**Review date:** 2026-06-29  
**Documents reviewed:**  
- `docs/org-dashboard/ARCHITECTURE.md` (Dariusz Kowalski, 2026-06-29)  
- `docs/org-dashboard/DESIGN.md` (Marcus Osei, 2026-06-29)  
**Scope:** Xperiq Command Center — all data model, API, WebSocket, real-time, CrystalOS, and UI components described in the above documents  
**Classification:** Internal — restricted to engineering, security, and legal  

---

## 1. Executive Summary

**Verdict: CONDITIONAL — Not approved for launch in current state.**

The Command Center architecture is well-structured at the macro level. The decision to derive `org_id` from the authenticated Clerk session rather than from client-supplied query parameters is the right call and reflects real security instinct. The use of materialized views as read targets (rather than direct response table scans) also reduces the blast radius of certain injection scenarios.

That said, this feature has **three issues that I consider launch blockers** and nine additional findings that I would require fixed or formally risk-accepted before go-live. The blockers are:

1. **No JWT re-validation on WebSocket messages.** The architecture document specifies that auth happens once, at connection time. A token stolen after connection establishment, or a token that expires mid-session, grants continued access. For a real-time channel broadcasting live response data, anomaly alerts, and executive briefs, this is unacceptable.

2. **Redis pub/sub channel names are guessable and not access-controlled.** The channel pattern `org:{org_id}:responses` using a well-known UUID allows any backend service or misconfigured subscriber to receive another org's event stream. There is no subscriber authentication or channel authorization described in the architecture.

3. **Crystal briefs store verbatim respondent quotes in `org_crystal_briefs.brief_text` and `recommendations[].rationale` without a hard structural guarantee that these are never included.** The GDPR right-to-erasure path from `survey_responses` does not cascade to `org_crystal_briefs`. This is a legal exposure, not merely a bug.

Everything else in this review is a high-priority engineering issue. The three items above must be resolved before this feature handles production traffic.

---

## 2. Threat Model

### 2.1 Attack Surface Diagram

```
                         ┌─────────────────────────────────────────────────────────────┐
                         │                   PUBLIC INTERNET                            │
                         └───────────────────────┬─────────────────────────────────────┘
                                                 │
                              HTTPS/WSS (TLS 1.2+)
                                                 │
                         ┌───────────────────────▼─────────────────────────────────────┐
                         │               CLERK AUTH BOUNDARY                            │
                         │   JWT validation (RS256), org_id claim extraction            │
                         │   ⚠ WebSocket: validated ONCE at connect, not per-message   │
                         └───────────────────────┬─────────────────────────────────────┘
                                                 │
                         ┌───────────────────────▼─────────────────────────────────────┐
                         │              EXPRESS API (backend)                           │
                         │                                                              │
                         │  REST endpoints (8):                                         │
                         │   GET  /api/org/dashboard                                    │
                         │   GET  /api/org/dashboard/trends                             │
                         │   GET  /api/org/dashboard/programs      ⚠ tagGroupId param  │
                         │   GET  /api/org/dashboard/topics                             │
                         │   GET  /api/org/dashboard/alerts                             │
                         │   PATCH /api/org/dashboard/alerts/:alertId/acknowledge       │
                         │   GET  /api/org/dashboard/crystal-brief                      │
                         │   POST /api/org/dashboard/crystal-brief/regenerate           │
                         │   GET  /api/org/health-score                                 │
                         │                                                              │
                         │  WebSocket:                                                  │
                         │   WS  /api/org/dashboard/live   ⚠ no per-message auth       │
                         └──────┬─────────────────────────┬───────────────────────────┘
                                │                         │
              ┌─────────────────▼──────────┐  ┌──────────▼──────────────────────────────┐
              │        POSTGRES            │  │           REDIS                          │
              │                            │  │                                          │
              │  Source tables (read-only):│  │  Cache keys: org:{id}:*                  │
              │   surveys                  │  │  Pub/sub channels: org:{id}:responses    │
              │   survey_responses         │  │                    org:{id}:alerts       │
              │   survey_topics            │  │                    org:{id}:health       │
              │   tag_groups               │  │  ⚠ Channel names are guessable UUIDs    │
              │                            │  │  ⚠ No subscriber ACL                    │
              │  Aggregation layer:        │  └─────────────────────────────────────────┘
              │   org_metrics_daily (MV)   │
              │   org_metrics_weekly (MV)  │  ┌──────────────────────────────────────────┐
              │   tag_group_metrics (MV)   │  │           CRYSTALOS                      │
              │   survey_health_summary(MV)│  │                                          │
              │   org_topic_trends         │  │  /graphs/org-brief (LangGraph DAG)       │
              │   org_health_score         │  │  ⚠ LLM input includes raw topic labels   │
              │   org_crystal_briefs       │  │  ⚠ Output stored without PII scrub      │
              │  ⚠ pg_cron: no input sanit │  │  ⚠ input_snapshot stored in JSONB       │
              │  ⚠ MV refresh timing attack│  └──────────────────────────────────────────┘
              └────────────────────────────┘
```

### 2.2 Trust Boundaries

| Boundary | Enforced | Mechanism | Gap |
|---|---|---|---|
| Internet → Express API | Yes | TLS + Clerk JWT | WebSocket lacks per-message re-auth |
| Express → Postgres | Partial | Connection credentials | `pg_cron` jobs run as superuser |
| Express → Redis | None | Network-level only | No AUTH, no channel ACL |
| Express → CrystalOS | Partial | `X-Internal-Key` header | Key rotation policy not documented |
| CrystalOS → Postgres | Partial | Separate DB credentials | Same DB, no row-level isolation |
| org A data → org B | Partial | `org_id` WHERE clauses | Redis channel names are guessable |
| War Room URL → public | None | No access controls on share URL | Deep-linkable state, no auth check |

### 2.3 Attacker Profiles

**Malicious org member (insider threat):** A member of Org A who wants to access Org B's data. They have a valid Clerk token for Org A. They know the Xperiq API surface.

**Disgruntled employee / service account compromise:** Access to the backend's Redis connection string or internal network. Can subscribe to any `org:{id}:*` pub/sub channel.

**Competitor scraping executive intelligence:** Using a War Room public URL (if shared), passively consuming KPI data, NPS trends, and Crystal briefs without authentication.

**Data subject exercising GDPR rights:** Submits a deletion request. Their verbatim responses are deleted from `survey_responses` but their text may survive in `org_crystal_briefs.brief_text` or `recommendations[].rationale`.

**Score manipulation (frustrated CX team lead):** Submits synthetic high-NPS, high-sentiment responses to inflate the org health score before a board meeting.

---

## 3. Vulnerability Findings

### Finding 001 — CRITICAL — WebSocket JWT Validated Only at Connection Time

**CVSS 3.1:** 8.8 (AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N)

**Description:**  
The architecture document `backend/src/services/org-realtime.service.ts` states: "A client joins a room by authenticating — their org_id is extracted from the Clerk token on connection." There is no description of any subsequent validation. Once authenticated, the WebSocket connection remains open indefinitely (heartbeat keeps it alive). The Clerk JWT has a standard short TTL (typically 60 seconds for session tokens, longer for refresh tokens). After token expiry, the server does not re-check the token — the connection persists.

**Exploit scenario:**  
1. Attacker authenticates as a legitimate user in Org A. WebSocket connection is established.  
2. Attacker's Clerk session is revoked (e.g., the user is terminated, or the session is invalidated via the Clerk dashboard).  
3. The WebSocket connection remains open. The attacker continues to receive `response_received`, `anomaly_detected`, `crystal_brief_ready`, and `health_score_updated` events for the org.  
4. If the attacker can obtain any other org's `org_id` (trivially exposed in the `response_received` payload's `orgId` field), they could attempt to subscribe to that org's `subscribe_survey` channel from their existing authenticated connection.

**Exact fix:**  
In `backend/src/services/org-realtime.service.ts`, implement periodic re-validation:
```typescript
// On each incoming message from the client, verify the token hasn't been revoked
// Use Clerk's verifyToken() with a short cache TTL (30s max)
// On heartbeat (pong received from client), also re-validate

const TOKEN_REVALIDATION_INTERVAL_MS = 60_000; // 60 seconds

ws.on('message', async (raw) => {
  const msg = JSON.parse(raw.toString());
  const now = Date.now();
  if (now - connectionState.lastTokenCheck > TOKEN_REVALIDATION_INTERVAL_MS) {
    try {
      await clerkClient.verifyToken(connectionState.token);
      connectionState.lastTokenCheck = now;
    } catch {
      ws.close(4401, 'token_expired');
      return;
    }
  }
  // ... handle message
});
```
Additionally, register a Clerk webhook for `session.revoked` events and close any matching WebSocket connections immediately.

---

### Finding 002 — CRITICAL — Redis Pub/Sub Has No Subscriber Authentication or Channel ACL

**CVSS 3.1:** 8.1 (AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:N/A:N)

**Description:**  
The Redis pub/sub channel names follow the pattern `org:{org_id}:responses`, `org:{org_id}:alerts`, and `org:{org_id}:health`. These names are UUIDs — but UUIDs are not secrets. The `org_id` is present in every WebSocket message payload (`response_received` includes `orgId: string`), in every database row, and in every URL in the application. Any process with access to the Redis instance can subscribe to `org:*:alerts` using a PSUBSCRIBE wildcard and receive real-time events for all organizations.

The architecture does not describe Redis AUTH, TLS on the Redis connection, or network-level isolation for the Redis instance.

**Exploit scenario:**  
1. Attacker gains access to the backend container network (e.g., via a compromised sidecar, a misconfigured service account, or a server-side request forgery vulnerability elsewhere in the app).  
2. `redis-cli -h <redis-host> PSUBSCRIBE "org:*:alerts"` — instantly receives all anomaly alerts and Crystal brief notifications for every organization.  
3. Attacker can reconstruct org health state in real-time from `health_score_updated` events across all orgs, enabling competitive intelligence extraction.

**Exact fix:**  
1. Enable Redis AUTH (`requirepass`) and store the password in a secret manager (not in `.env`).  
2. Enable TLS on the Redis connection string in `backend/src/` (use `ioredis` `tls` config option).  
3. Implement channel-level message signing: when `publish_brief` node in `crystalos/graphs/org_brief_graph.py` publishes to `org:{org_id}:alerts`, include an HMAC-SHA256 signature of `org_id + timestamp + event_type` using a shared secret. The WebSocket server verifies the signature before forwarding to the client. This prevents a rogue process from injecting events into a channel.  
4. Document the Redis network policy — the Redis port must not be reachable from outside the backend private subnet.

---

### Finding 003 — CRITICAL — Crystal Briefs Store LLM-Generated Text That May Contain Verbatim PII Without a GDPR Deletion Cascade

**CVSS 3.1:** 7.5 (AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N)  
**Regulatory:** GDPR Article 17 (right to erasure), CCPA Section 1798.105

**Description:**  
The `synthesize_narrative` node in `crystalos/graphs/org_brief_graph.py` passes `top_programs_text` and `signals_text` to an LLM. These inputs are derived from `org_metrics_weekly`, `survey_health_summary`, and `org_topic_trends`. The `org_topic_trends` table stores `topic_label` values that originate from `survey_topics.topic_label` — which is computed from `survey_responses`. The `signals_text` block in the LLM prompt includes the signal description text, which in Signal 1 reads `"3 of your {N} programs show simultaneous negative sentiment this week"` — that is safe. However, the `USER_PROMPT` template includes `{top_programs_text}`, whose content is built from `ranked_programs` list — specifically from `RankedProgram` objects that include survey-level data.

More critically, the design document specifies that the Emerging Topics chip drawer shows **"3 sample verbatim quotes from responses mentioning this topic."** While this is a frontend feature (not stored in `org_crystal_briefs`), the architecture for the Crystal brief narrows this gap: the LLM has `top_topics: list[TopicRow]` in the `OrgMetricsSnapshot` input. If `TopicRow` includes any verbatim sample (as is common in topic modeling pipelines), those samples are passed to the LLM and may appear verbatim in `brief_text`.

The `org_crystal_briefs` table has `ON DELETE CASCADE` for the `org_id` foreign key — but not for individual respondent records. When a data subject's `survey_responses` row is deleted (GDPR erasure), the text the LLM derived from their response may remain in `org_crystal_briefs.brief_text` indefinitely.

Additionally, `input_snapshot JSONB` explicitly stores "the org metrics snapshot used as input" — this snapshot contains `critical_surveys`, `attention_surveys`, `top_topics`, all of which may embed PII-derived text.

**Exploit scenario:**  
1. Data subject submits a response containing: "The onboarding team lead John Smith was dismissive and unhelpful."  
2. NLP pipeline extracts topic "John Smith dismissive onboarding" — stored in `survey_topics.topic_label`.  
3. Crystal brief generation includes this topic in the LLM prompt. LLM generates: "Your Onboarding program saw negative feedback about John Smith's communication style."  
4. Data subject submits GDPR erasure request. `survey_responses` row is deleted. `survey_topics` row is deleted (if cascaded). But `org_crystal_briefs.brief_text` still contains the named individual's information.  
5. Xperiq is liable under GDPR Article 17.

**Exact fix:**  
1. Enforce a structural rule in the `OrgMetricsSnapshot` type and the `TopicRow` type: **no verbatim text from `survey_responses` may be included.** Topic labels must be categorical/aggregated labels (e.g., "onboarding friction") not free-form text derived from a single response. Add a validation step in `aggregate_org_metrics` node that asserts no field in the snapshot exceeds 100 characters of free-form text.  
2. Set a retention policy on `org_crystal_briefs`: rows older than 90 days should be deleted. Add a pg_cron job:  
   ```sql
   SELECT cron.schedule(
     'purge-old-crystal-briefs',
     '0 4 * * 0',
     $$DELETE FROM org_crystal_briefs WHERE generated_at < NOW() - INTERVAL '90 days'$$
   );
   ```
3. Add a `gdpr_purge_at` column to `org_crystal_briefs` set to `NOW() + INTERVAL '30 days'` whenever the brief is generated. Add a hook in the erasure pipeline that, when a data subject's responses are deleted, immediately sets `gdpr_purge_at = NOW()` on any `org_crystal_briefs` row for that `org_id` if the brief was generated within the last 90 days.  
4. Explicitly prohibit `input_snapshot` from storing any data that is not already irreversibly aggregated (i.e., numeric aggregates only). Update the column comment in `supabase/migrations/20260101000007_org_crystal_briefs.sql`.

---

### Finding 004 — HIGH — Health Score Can Be Gamed by Submitting Synthetic High-NPS Responses

**CVSS 3.1:** 6.5 (AV:N/AC:L/PR:L/UI:N/S:U/C:N/I:H/A:N)

**Description:**  
The `org_health_score.total_score` computation derives `response_velocity_score` as `LEAST(response_velocity / 3.0, 1)`, where `response_velocity` comes from `org_metrics_daily.response_velocity`. `response_velocity` is calculated as the ratio of 24-hour responses to the 7-day daily average. An attacker with access to a survey distribution URL (or the API `POST /api/responses` endpoint, which is not part of this review but is a source table contributor) can submit a flood of synthetic high-NPS, high-sentiment responses to:

1. Drive `nps_score` toward 1.0 (the formula is `LEAST(GREATEST((avg_nps + 100) / 200.0, 0), 1)` — a burst of NPS=100 responses dominates the average).
2. Drive `response_velocity_score` toward 1.0 by inflating the 24-hour count.
3. Suppress `anomaly_free_score` suppression would require triggering anomalies, but this component only contributes 10% weight.

A single user submitting 50 responses with NPS=100 across an org's surveys within 24 hours can materially inflate `total_score`.

**Exploit scenario:**  
1. A CX manager at the org, concerned about an upcoming board review, creates 50 accounts (or uses the API directly) and submits NPS=100 responses to each active survey.  
2. Within 15 minutes (next `refresh-org-metrics-daily` cycle), `org_metrics_daily` incorporates the synthetic data.  
3. Within 3 hours (next `compute-org-health-scores` cycle at 03:00 UTC), `org_health_score.total_score` has jumped from 42 to 71.  
4. The board review shows a "Healthy" org with a rising trend.

**Exact fix:**  
1. Add a `is_synthetic` or `quality_flag` column to `survey_responses` with a backend-enforced heuristic: responses from the same IP address within 60 seconds, or from freshly-created accounts (< 24 hours old), are flagged. The `compute_all_org_health_scores()` stored procedure must exclude flagged responses.  
2. In `compute_all_org_health_scores()`, add an outlier detection step: if the 24-hour NPS average deviates more than 2 standard deviations from the 30-day rolling average, cap the `nps_score` contribution to the 30-day mean rather than the 24-hour mean.  
3. Rate-limit the response submission API per authenticated user (or per IP for unauthenticated/public surveys).  
4. Document the anomaly detection signals to include "NPS spike from single IP range" in the `detect_org_signals` node of `crystalos/graphs/org_brief_graph.py`.

---

### Finding 005 — HIGH — `tagGroupId` Query Parameter in GET /api/org/dashboard/programs Is Not Validated Against the Authenticated Org

**CVSS 3.1:** 7.1 (AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N)

**Description:**  
The `GET /api/org/dashboard/programs` endpoint accepts `tagGroupId: UUID` as an optional query parameter. The architecture states that `org_id` is extracted from the Clerk session and never accepted from the client. However, `tagGroupId` is accepted from the client. If the backend implementation filters `survey_health_summary` with `WHERE tag_group_id = :tagGroupId` without also asserting `WHERE org_id = :sessionOrgId`, an attacker can supply a `tagGroupId` that belongs to a different organization and receive that organization's program health data.

This is a classic IDOR (Insecure Direct Object Reference). The architecture document does not show the SQL for this endpoint, and given the explicit statement that `org_id` is never accepted from the client, it is possible the developer assumes the `tagGroupId` filter is safe. It is not safe unless it is joined against the org's own `tag_groups` table.

**Exact fix:**  
In the backend handler for `GET /api/org/dashboard/programs`, the SQL must be:
```sql
SELECT shs.*
FROM survey_health_summary shs
JOIN surveys s ON s.id = shs.survey_id
JOIN tag_groups tg ON tg.id = shs.tag_group_id
WHERE shs.org_id = $1           -- from session, never client
  AND ($2::uuid IS NULL OR (tg.id = $2 AND tg.org_id = $1))  -- tagGroupId must belong to this org
ORDER BY ...
```
The critical guard is `tg.org_id = $1` — this ensures that even if an attacker provides a foreign `tagGroupId`, the join fails because the tag group does not belong to their org.  
Add an integration test in the backend test suite that:
1. Creates Org A and Org B with separate tag groups.
2. Authenticates as Org A.
3. Requests `/api/org/dashboard/programs?tagGroupId=<org_B_tag_group_id>`.
4. Asserts a 400 or empty result, not Org B's data.

---

### Finding 006 — HIGH — War Room Mode State Is Stored in localStorage and Exposed via Deep Links Without Auth Check

**CVSS 3.1:** 6.1 (AV:N/AC:L/PR:N/UI:R/S:C/C:H/I:N/A:N)

**Description:**  
The architecture document states: "State is passed via URL params so every level is deep-linkable and shareable." The design document confirms that War Room Mode persists in `localStorage` as `org_dashboard_dark_mode: boolean` and that drill-down state is shareable via URL params. There is no description of any access control mechanism for these deep links.

A URL such as `/org/dashboard?tagGroupId=<uuid>&surveyId=<uuid>` encodes enough context to identify the specific program being reviewed. If a user copies and pastes this URL to a non-authenticated recipient (e.g., shares via Slack), the recipient is presented with an authentication challenge — but if the recipient is already authenticated as a member of a different organization, the URL params may expose the existence of specific `survey_id` and `tag_group_id` values from the sharer's organization.

More directly: the `CrystalBriefCard`'s "Ask follow-up" button pre-populates the Crystal command bar with `"org:${orgId} — asking about the weekly brief"`. If this string is visible in the URL or in a shareable link, it leaks the `orgId`.

**Exact fix:**  
1. The URL params for drill-down navigation (`tagGroupId`, `surveyId`) must be validated on the receiving page against the authenticated session's org. A 403 should be returned if the resource does not belong to the session org — not a 404 (which would confirm the resource exists).  
2. The Crystal command bar pre-population string `"org:${orgId} — asking about the weekly brief"` must not include the raw `orgId`. Use an internal reference token that is meaningless to an observer.  
3. Add a server-side check on all pages that accept URL params referencing org resources: validate that the referenced resource's `org_id` matches the session `org_id` before rendering.

---

### Finding 007 — HIGH — `PATCH /api/org/dashboard/alerts/:alertId/acknowledge` Does Not Validate alertId Ownership

**CVSS 3.1:** 6.5 (AV:N/AC:L/PR:L/UI:N/S:U/C:N/I:H/A:N)

**Description:**  
The `PATCH /api/org/dashboard/alerts/:alertId/acknowledge` endpoint takes `alertId` as a URL path parameter. The architecture does not explicitly state that `alertId` is validated against the session org's ownership. The implementation risk is that a backend developer might write:

```sql
UPDATE survey_anomalies SET acknowledged_at = NOW() WHERE id = $1
```

without the `AND org_id = $2` guard. An attacker from Org A who knows or guesses a `alertId` UUID from Org B can acknowledge (suppress) alerts for another organization.

Alert suppression is a meaningful action: it affects `anomaly_free_score` in `org_health_score` (weight 10%) and removes the alert from Org B's `AnomalyAlerts` sidebar, potentially hiding a real issue.

**Exploit scenario:**  
1. Attacker brute-forces or enumerates alert UUIDs (UUIDs are not brute-forceable with random generation, but may be predictable if sequential or if obtained via a prior data exposure).  
2. `PATCH /api/org/dashboard/alerts/<org_B_alert_id>/acknowledge` — the alert is suppressed in Org B's dashboard without Org B's knowledge.  
3. `compute_all_org_health_scores()` runs at 03:00 UTC — Org B's `anomaly_free_score` increases because the acknowledged alert is no longer counted as open.

**Exact fix:**  
In the backend handler for `PATCH /api/org/dashboard/alerts/:alertId/acknowledge`:
```sql
UPDATE survey_anomalies
SET acknowledged_at = NOW(), acknowledged_by = $3  -- add the user's ID
WHERE id = $1
  AND org_id = $2  -- org_id from session, never from request
RETURNING id, acknowledged_at;
```
If the UPDATE returns 0 rows (alert doesn't exist or belongs to another org), return 404 — not 403. Do not reveal whether the resource exists.

---

### Finding 008 — HIGH — pg_cron Jobs Run Stored Procedures Without Input Sanitization Audit

**CVSS 3.1:** 7.6 (AV:N/AC:H/PR:H/UI:N/S:C/C:H/I:H/A:N)

**Description:**  
The architecture defines four pg_cron jobs that call stored procedures:
- `CALL compute_org_topic_trends()`
- `CALL compute_all_org_health_scores()`
- `REFRESH MATERIALIZED VIEW CONCURRENTLY org_metrics_daily`
- `REFRESH MATERIALIZED VIEW CONCURRENTLY org_metrics_weekly`

The stored procedures `compute_org_topic_trends()` and `compute_all_org_health_scores()` are described in comments in the migration files but their full SQL implementations are not shown in the architecture document. The risk is that these procedures read from `org_topic_trends.topic_label` (a TEXT column sourced from `survey_topics.topic_label`, which originates from NLP analysis of free-form `survey_responses` text). If any of these stored procedures use `topic_label` in dynamic SQL (e.g., `EXECUTE format('...' || topic_label || '...')`), a malicious response containing a SQL injection payload in the verbatim text could propagate through the NLP pipeline into the stored procedure.

This is not a direct user-to-SQL injection (the path is: response text → NLP topic extraction → topic_label column → stored procedure dynamic SQL), but it is a second-order injection vector.

**Exact fix:**  
1. Audit `compute_org_topic_trends()` and `compute_all_org_health_scores()` in `supabase/migrations/` to confirm they use no dynamic SQL involving user-derived text columns. All SQL must be fully parameterized.  
2. Add a constraint on `org_topic_trends.topic_label`: `CHECK (topic_label ~ '^[A-Za-z0-9 \-'']+$' AND length(topic_label) <= 200)`. This validates the label before it reaches the stored procedure.  
3. The pg_cron scheduler itself runs as the database superuser. Add a SECURITY DEFINER clause to stored procedures with a restricted search_path to prevent privilege escalation via schema injection:  
   ```sql
   CREATE OR REPLACE FUNCTION compute_all_org_health_scores()
   RETURNS void
   LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path = public, pg_temp
   AS $$ ... $$;
   ```

---

### Finding 009 — HIGH — Materialized View Refresh Timing Creates a Read Window for Stale Cross-Org Data

**CVSS 3.1:** 5.9 (AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:N/A:N)

**Description:**  
The `tag_group_metrics` materialized view joins `survey_responses` to `surveys` to `tag_groups`. A `REFRESH MATERIALIZED VIEW CONCURRENTLY` operation takes a snapshot at the start of the refresh transaction. Between the moment the snapshot is taken and the moment the refresh completes (which could be seconds to minutes for large datasets), new `survey_responses` rows can arrive. These are not included in the refreshed view. This is expected behavior for materialized views.

The security concern is subtler: if `surveys.org_id` or `tag_groups.org_id` is updated (e.g., a survey is moved from one org to another during a merge/migration operation), the materialized view snapshot may contain rows where `tag_group_metrics.org_id` no longer matches the current state of the source tables. During the window between the update and the next view refresh, a user from the old org can receive metrics for a survey that has been reassigned to the new org.

Additionally, `survey_health_summary` joins against `survey_anomalies` (line 243 of the architecture document: `FROM survey_anomalies WHERE resolved_at IS NULL`). This table is not defined in the migrations shown, and its `org_id` enforcement is not audited.

**Exact fix:**  
1. Add a row-level security (RLS) policy on Postgres for the application database user. Even if a materialized view contains a stale `org_id`, the application user should only be able to SELECT rows where `org_id` matches their session. This is defense-in-depth against stale join state:  
   ```sql
   ALTER TABLE org_metrics_daily ENABLE ROW LEVEL SECURITY;
   CREATE POLICY org_isolation ON org_metrics_daily
     USING (org_id = current_setting('app.current_org_id')::uuid);
   ```
   This requires the backend to `SET LOCAL app.current_org_id = $orgId` at the start of each query transaction.  
2. Document that surveys and tag groups must not be moved between organizations without a manual materialized view refresh immediately after the move.  
3. Add `org_id` to the `survey_health_summary` query index and confirm the `survey_anomalies` table has its own `org_id` column with a foreign key to `organizations`.

---

### Finding 010 — MEDIUM — `POST /api/org/dashboard/crystal-brief/regenerate` Has No Rate Limit

**CVSS 3.1:** 5.3 (AV:N/AC:L/PR:L/UI:N/S:U/C:N/I:N/A:H)

**Description:**  
The `POST /api/org/dashboard/crystal-brief/regenerate` endpoint triggers an async job that calls the CrystalOS `/graphs/org-brief` endpoint, which runs a multi-node LangGraph DAG — including an LLM call via OpenRouter. There is no rate limit described in the architecture. Any authenticated user in the org can spam this endpoint, generating LLM API costs and queuing indefinite CrystalOS jobs.

The response is `202: { jobId, estimatedSeconds }` — indicating the backend simply dispatches and returns. Without a per-org rate limit, a single user could submit hundreds of regeneration requests per minute.

**Exact fix:**  
1. Add a per-org rate limit in `backend/src/jobs/crystal-brief.job.ts`: one regeneration request per org per 60 minutes. Store the lock in Redis: `org:{org_id}:brief-regen-lock` with a 3600-second TTL.  
2. Check the lock before dispatching to CrystalOS. Return `429 Too Many Requests` with a `Retry-After` header if the lock exists.  
3. Restrict the regeneration endpoint to org admin role only (not all org members).

---

### Finding 011 — MEDIUM — WebSocket `subscribe_survey` Message Allows Cross-Org Survey Subscription

**CVSS 3.1:** 6.4 (AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N)

**Description:**  
The WebSocket protocol defines a client-to-server message type: `{ type: 'subscribe_survey'; surveyId: string }`. The architecture states the client can subscribe to a specific survey's real-time events for drill-down. The architecture document does not describe any validation that the requested `surveyId` belongs to the authenticated user's `org_id`.

An attacker from Org A who knows a `surveyId` from Org B (which could be obtained from a prior API enumeration or a shared URL) can send this message and potentially receive real-time events for Org B's survey.

**Exact fix:**  
In the WebSocket message handler in `org-realtime.service.ts`, before adding the survey to the subscription:
```typescript
case 'subscribe_survey': {
  const surveyOrgId = await db.query(
    'SELECT org_id FROM surveys WHERE id = $1 AND deleted_at IS NULL',
    [msg.surveyId]
  );
  if (!surveyOrgId.rows[0] || surveyOrgId.rows[0].org_id !== connectionState.orgId) {
    ws.send(JSON.stringify({ type: 'error', code: 'unauthorized_survey' }));
    return;
  }
  connectionState.subscribedSurveys.add(msg.surveyId);
  break;
}
```

---

### Finding 012 — MEDIUM — `GET /api/org/dashboard/crystal-brief` Returns `inputSnapshot` to "Org Admins" Without Defining the Role Check

**CVSS 3.1:** 4.3 (AV:N/AC:L/PR:L/UI:N/S:U/C:L/I:N/A:N)

**Description:**  
The architecture states: `inputSnapshot: object | null — debug — only returned to org admins`. There is no description of how "org admin" is determined. If the role check is missing from the implementation (or implemented incorrectly), all org members can receive the `input_snapshot` JSONB blob — which contains the full `OrgMetricsSnapshot` including `critical_surveys`, `attention_surveys`, and `top_topics` arrays. This is more data than any single non-admin user should receive in a single API response.

Additionally, `input_snapshot` stores the raw metrics snapshot. As documented in Finding 003, this may contain PII-adjacent text from `topic_label` fields.

**Exact fix:**  
1. Define the role check explicitly in the backend handler. Using Clerk's organization roles:  
   ```typescript
   const isAdmin = sessionClaims.org_role === 'org:admin';
   const response = { ...brief };
   if (!isAdmin) {
     delete response.inputSnapshot;
   }
   ```
2. Consider removing `input_snapshot` from the API response entirely and keeping it internal-only (accessible only via a separate admin-gated debug endpoint, not bundled with the standard crystal-brief response).

---

### Finding 013 — MEDIUM — `GET /api/org/dashboard/trends` Accepts Unbounded Date Range Queries

**CVSS 3.1:** 4.3 (AV:N/AC:L/PR:L/UI:N/S:U/C:N/I:N/A:L)

**Description:**  
The `GET /api/org/dashboard/trends` endpoint accepts `range` values of `"7d"`, `"30d"`, `"90d"`, and `"1y"`. However, the backend must validate that the `range` parameter is exactly one of these allowed values. If the validation uses a coercive approach (e.g., `if (range) query += range`), a crafted value like `"10y"` or a SQL fragment would bypass the allowlist.

More practically, even if the allowlist is enforced, `1y` with `granularity=daily` returns 365 rows from `org_metrics_daily` for potentially thousands of orgs simultaneously — a resource-exhaustion concern if called in a tight loop.

**Exact fix:**  
1. Validate `range` against a strict enum server-side: `['7d', '30d', '90d', '1y'].includes(range)` — return 400 if invalid.  
2. For `granularity=daily` with `range=1y`, force the response to weekly granularity (the architecture already notes this default). Document this enforcement in the API contract.  
3. Add a per-user rate limit on the trends endpoint: 60 requests per minute per session.

---

### Finding 014 — LOW — `org_health_score` Uses a Single-Row-Per-Org Upsert That Is Vulnerable to a Race Condition

**CVSS 3.1:** 3.7 (AV:N/AC:H/PR:N/UI:N/S:U/C:N/I:L/A:N)

**Description:**  
The `org_health_score` table has `CONSTRAINT org_health_score_org_unique UNIQUE (org_id)` and is described as "one live row per org, upserted." If `compute_all_org_health_scores()` runs concurrently (e.g., due to a stale pg_cron lock, a manual trigger, and the scheduled 03:00 UTC run all executing simultaneously), two transactions may read the same current `total_score`, both compute an updated score, and both attempt to upsert. The `ON CONFLICT DO UPDATE` semantics in PostgreSQL serialize this safely — but only if the upsert uses `UPDATE SET` directly, not if it deletes and reinserts. The architecture does not show the upsert SQL.

**Exact fix:**  
Confirm that `compute_all_org_health_scores()` uses `INSERT ... ON CONFLICT (org_id) DO UPDATE SET ...` and not `DELETE ... INSERT`. Add an advisory lock at the start of the procedure to prevent concurrent execution:  
```sql
IF NOT pg_try_advisory_xact_lock(hashtext('compute_health_scores')) THEN
  RAISE NOTICE 'Another health score computation is already running, skipping.';
  RETURN;
END IF;
```

---

### Finding 015 — LOW — Emerging Topics Drawer Renders Verbatim Response Quotes Without XSS Sanitization

**CVSS 3.1:** 3.5 (AV:N/AC:L/PR:L/UI:R/S:U/C:L/I:L/A:N)

**Description:**  
The design document specifies that the Emerging Topics chip drawer shows "3 sample verbatim quotes from responses mentioning this topic." These verbatim quotes are sourced from `survey_responses` text — which is user-provided input. If the frontend renders these using `dangerouslySetInnerHTML` (a common mistake when displaying formatted text), a malicious respondent can inject HTML or JavaScript.

**Exact fix:**  
1. Ensure the verbatim quotes are rendered with React's default JSX text rendering (not `dangerouslySetInnerHTML`). React escapes HTML by default; this finding is only a risk if the developer explicitly opts out.  
2. At the API level, strip HTML tags from any verbatim text returned to the frontend using a server-side sanitization step (e.g., `strip-html` or `sanitize-html` with no allowed tags).  
3. Add a Content Security Policy header that disallows `unsafe-inline` scripts.

---

## 4. Security Testing Checklist

### Authentication and Authorization
- [ ] 01. Authenticate as Org A user. Call `GET /api/org/dashboard` with Org B's Clerk token substituted. Assert 401 or 403, never Org B's data.
- [ ] 02. Connect to WebSocket. Expire/revoke the Clerk session mid-connection. Assert the connection is closed within 90 seconds.
- [ ] 03. Connect to WebSocket. Wait 65 seconds without sending a pong. Assert the server closes the connection.
- [ ] 04. Call `GET /api/org/dashboard/programs?tagGroupId=<org_B_tag_group_id>` as an Org A user. Assert empty result or 400, not Org B's programs.
- [ ] 05. Call `PATCH /api/org/dashboard/alerts/<org_B_alert_id>/acknowledge` as an Org A user. Assert 404 or 403, not 200.
- [ ] 06. Call `GET /api/org/dashboard/crystal-brief` as a non-admin org member. Assert `inputSnapshot` is absent from the response.
- [ ] 07. Send `{ type: 'subscribe_survey', surveyId: '<org_B_survey_id>' }` over an authenticated Org A WebSocket. Assert an error response, not a successful subscription.
- [ ] 08. Call `GET /api/org/health-score` with no Authorization header. Assert 401.
- [ ] 09. Call `POST /api/org/dashboard/crystal-brief/regenerate` as a non-admin org member. Assert 403.
- [ ] 10. Call `GET /api/org/dashboard/alerts` as Org A. Assert that alert IDs from Org B are not present in the response.

### Input Validation and Injection
- [ ] 11. Call `GET /api/org/dashboard/trends?range=invalid_value`. Assert 400 with a validation error, not a 500.
- [ ] 12. Call `GET /api/org/dashboard/trends?range=10y`. Assert 400 or a capped/redirected response.
- [ ] 13. Call `GET /api/org/dashboard/programs?sort='; DROP TABLE surveys; --`. Assert 400, not a 500 or SQL error.
- [ ] 14. Call `GET /api/org/dashboard/programs?tagGroupId=not-a-uuid`. Assert 400, not a 500.
- [ ] 15. Submit a survey response with text `<script>alert(1)</script>`. Navigate to the Emerging Topics drawer. Assert the script tag is not executed.
- [ ] 16. Submit a survey response with text containing SQL injection payload: `'; UPDATE org_health_score SET total_score=100 WHERE org_id='`. Verify `org_health_score` is not affected after the next computation run.
- [ ] 17. Call `GET /api/org/dashboard/programs?pageSize=999999`. Assert the page size is capped at 50.
- [ ] 18. Call `GET /api/org/dashboard/alerts?limit=999999`. Assert the limit is capped.
- [ ] 19. Send a WebSocket message with `surveyId` containing a UUID injection: `{ type: 'subscribe_survey', surveyId: "'; SELECT * FROM surveys --" }`. Assert this does not cause a backend error or SQL exception.
- [ ] 20. Send a malformed WebSocket message (invalid JSON). Assert the server does not crash and returns an error frame.

### Real-time and Redis Isolation
- [ ] 21. Verify Redis is configured with `requirepass`. Assert that connecting to Redis without a password fails.
- [ ] 22. Verify Redis is not accessible from outside the backend private network (port scan from a non-backend host).
- [ ] 23. Subscribe to `org:*:alerts` using a Redis CLI from the backend network. Assert that events from different orgs are not mixed or that this subscription is blocked.
- [ ] 24. Publish a fake event to `org:<org_A_id>:alerts` from a test process. Assert that connected Org A WebSocket clients receive the event, but Org B clients do not.
- [ ] 25. Trigger `HMAC verification failure` (if implemented) by tampering with the signature on a Redis pub/sub message. Assert the WebSocket server drops the message and does not forward it.

### Rate Limiting and Denial of Service
- [ ] 26. Call `POST /api/org/dashboard/crystal-brief/regenerate` 10 times in 60 seconds. Assert that requests 2-10 receive 429.
- [ ] 27. Call `GET /api/org/dashboard/trends` 100 times in 60 seconds with valid auth. Assert rate limiting kicks in before request 100.
- [ ] 28. Open 200 simultaneous WebSocket connections to `/api/org/dashboard/live` from the same org. Assert the server handles this without memory exhaustion (load test).
- [ ] 29. Trigger the 15-minute `refresh-org-metrics-daily` pg_cron job manually during a high-read period. Assert reads are not blocked (CONCURRENT refresh).
- [ ] 30. Attempt to manually trigger `compute_all_org_health_scores()` while a pg_cron run is already in progress. Assert the advisory lock prevents duplicate execution.

### GDPR and Data Retention
- [ ] 31. Delete a data subject's `survey_responses` row. Trigger `compute_org_topic_trends()`. Assert no topic_label derived from the deleted response appears in `org_topic_trends`.
- [ ] 32. Delete a data subject's `survey_responses` row. Assert that the corresponding `org_crystal_briefs.brief_text` does not contain their name or verbatim quote.
- [ ] 33. Verify `input_snapshot` in `org_crystal_briefs` contains only numeric aggregates, no verbatim text or individual names.
- [ ] 34. Verify the pg_cron job to purge `org_crystal_briefs` rows older than 90 days exists and runs successfully.
- [ ] 35. Submit a GDPR data export request. Assert that `org_crystal_briefs` data associated with the subject's `org_id` during their membership period is included in the export.

### Transport and Headers
- [ ] 36. Assert that all API responses include `X-Content-Type-Options: nosniff`.
- [ ] 37. Assert that all API responses include `Strict-Transport-Security: max-age=31536000; includeSubDomains`.
- [ ] 38. Assert that the Content Security Policy header disallows `unsafe-inline` for script-src.
- [ ] 39. Assert that WebSocket connections are rejected over `ws://` (unencrypted) in production.
- [ ] 40. Assert that all `pg_cron` scheduled queries log their execution and any errors to a queryable audit log accessible to security engineers.

---

## 5. Compliance Notes

### GDPR (EU General Data Protection Regulation)

**Article 17 — Right to Erasure ("Right to be Forgotten"):**  
The current architecture has a cascading deletion path for `survey_responses` → `survey_topics` (assuming a proper foreign key cascade), but **does not cascade to `org_crystal_briefs`**. This is a direct violation exposure. The `brief_text` and `recommendations[].rationale` fields are LLM-generated text; even if they do not contain verbatim personal data, they are derived from personal data and must be covered by the erasure process. See Finding 003 for the specific fix path.

**Article 5(1)(e) — Storage Limitation:**  
`org_crystal_briefs` has no explicit retention limit in the current schema. GDPR requires data is kept "no longer than is necessary." A 90-day retention policy is a reasonable position for executive briefs; this must be documented in Xperiq's privacy policy and enforced via the pg_cron purge job described in Finding 003.

**Article 32 — Security of Processing:**  
The absence of Redis AUTH and the lack of WebSocket per-message re-validation both constitute inadequate technical measures under Article 32's requirement for "appropriate technical and organisational measures." These must be remediated before the feature handles EU user data.

**Article 25 — Data Protection by Design:**  
The `input_snapshot JSONB` column is described as "for debugging." Storing raw debugging data containing org metrics in a production table without a retention policy or access control is not privacy-by-design. It should either be removed from the production schema or encrypted and time-boxed.

### SOC 2 Type II

**CC6.1 — Logical and Physical Access Controls:**  
The Redis instance as described has no access controls. This fails CC6.1's requirement that "the entity implements logical access security software, infrastructure, and architectures over protected information assets." Redis AUTH and network isolation are required.

**CC6.6 — Security Measures Against Threats from Outside System Boundaries:**  
The WebSocket JWT re-validation gap (Finding 001) means that a revoked credential can continue to access system data. This fails CC6.6's requirement for timely deprovisioning.

**CC9.2 — Risk Mitigation — Vendor Risk:**  
CrystalOS calls OpenRouter (an LLM API proxy) as part of `synthesize_narrative`. The architecture does not describe data processing agreements with OpenRouter, retention policies for LLM API call logs, or data residency guarantees. This must be resolved before SOC 2 audit. All LLM calls must scrub PII from prompts before transmission.

**A1.2 — Capacity and Performance:**  
The pg_cron jobs have no described failure handling. If `compute_all_org_health_scores()` fails silently, `org_health_score.valid_through` may expire without a replacement row, causing stale or absent health scores. SOC 2 availability criteria require monitoring and alerting on scheduled job failures.

### CCPA (California Consumer Privacy Act)

**Section 1798.105 — Right to Deletion:**  
Same structural gap as GDPR Article 17. California consumers have a right to deletion of their personal information. The `org_crystal_briefs` table is an out-of-scope orphan in the current deletion pipeline.

**Section 1798.100 — Right to Know:**  
If Xperiq's privacy notice does not disclose that survey response data is used to train or inform LLM-generated organizational briefs, this is a disclosure gap. The fact that verbatim responses may be fed into LLM prompts (even indirectly through topic labels) should be disclosed.

**Section 1798.150 — Private Right of Action:**  
A data breach involving `org_crystal_briefs` content (e.g., the Redis pub/sub finding being exploited at scale) could trigger the CCPA private right of action for any California resident whose data appears in the leaked briefs. The Redis isolation fix in Finding 002 is a direct CCPA risk mitigation.

---

## 6. Verdict and Launch Conditions

### Final Verdict: CONDITIONAL — Not Approved for Launch

This feature demonstrates strong architectural instincts in several areas: the org_id-from-session enforcement for REST endpoints, the materialized view pattern for read performance, and the three-tier drill-down with URL-based state for shareability. These are good decisions.

However, three launch blockers exist that represent real, exploitable vulnerabilities in a multi-tenant SaaS context:

**The three blockers must be resolved before any production traffic — including limited beta:**

**Blocker 1 (Finding 001):** Implement WebSocket JWT re-validation on a 60-second interval and wire up Clerk session revocation webhooks to close affected connections. Without this, terminated employees or compromised accounts retain live data access indefinitely.

**Blocker 2 (Finding 002):** Enable Redis AUTH, TLS on the Redis connection, and add message signing to the pub/sub channel. Without this, any process with Redis network access can subscribe to all organizations' real-time event streams.

**Blocker 3 (Finding 003):** Enforce a structural prohibition on verbatim text in LLM prompt inputs for the `org_brief_graph`. Implement the 90-day retention pg_cron job for `org_crystal_briefs`. Add the GDPR erasure hook. Without this, the feature is non-compliant with GDPR Article 17 on day one.

**The following findings must be fixed before broad availability (within 30 days of launch):**

- Finding 005: `tagGroupId` ownership validation in `GET /api/org/dashboard/programs`
- Finding 007: `alertId` ownership validation in `PATCH /api/org/dashboard/alerts/:alertId/acknowledge`
- Finding 010: Rate limiting on `POST /api/org/dashboard/crystal-brief/regenerate`
- Finding 011: `subscribe_survey` cross-org validation in the WebSocket handler
- Finding 012: Role check for `inputSnapshot` in `GET /api/org/dashboard/crystal-brief`

**The following findings may be addressed in the 60-day post-launch window with formal risk acceptance:**

- Finding 004: Health score gaming (Medium operational risk, requires product decisions on response quality scoring)
- Finding 006: War Room deep-link access control (Low immediate risk, requires product decision on sharing model)
- Finding 008: pg_cron SQL injection audit (Confirm stored procedures are parameterized — likely a documentation gap, not an implementation gap)
- Finding 009: Materialized view RLS defense-in-depth (Low probability scenario for survey migration race condition)
- Finding 013: Trends endpoint input validation (Enforce the allowlist — straightforward)
- Finding 014: Health score upsert race condition (Confirm ON CONFLICT semantics — likely already correct)
- Finding 015: XSS sanitization on verbatim quotes (Confirm React rendering path — straightforward if no `dangerouslySetInnerHTML`)

---

*This document reflects the state of the feature as described in the architecture and design documents dated 2026-06-29. Any implementation deviation from those documents may introduce additional risks not covered by this review. A re-review is required if the WebSocket architecture, Redis channel design, CrystalOS LLM prompt structure, or GDPR deletion pipeline changes materially.*

*— Dr. Rafi Goldstein*
