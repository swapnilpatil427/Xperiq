# Intelligence Briefings (Scheduled Reports) — Customer Review
**Reviewer:** Diana Okafor, Customer Success Manager, Enterprise SaaS
**Background:** Former Qualtrics admin, 5 years enterprise XM experience, managing 30 enterprise accounts
**Review date:** June 2026
**Status:** Pre-launch design review — feedback intended for product team prior to GA

---

## 1. Executive Summary

The Intelligence Briefings feature has a solid foundation: Crystal-generated narratives, flexible templates, and a clean delivery model are the right building blocks. But as designed today, this feature will not survive first contact with an enterprise customer. The gaps in approval workflow, report archive, multi-timezone scheduling, and narrative quality feedback are not edge cases — they are the exact workflows that enterprise CX teams run every week. I have seen enterprise customers abandon well-designed features because a single production incident (a wrong number sent to a CFO, a report that could not be found six months later) destroyed confidence. This design has multiple paths to that outcome. The issues below are not requests for polish. They are the difference between a feature that enterprise buyers cite in renewal conversations and one they quietly stop using after the first misfire.

---

## 2. Gap Analysis

### Must Fix

**CX-001 — No approval gate before delivery**
- **Who this affects:** Any report creator sending to executive stakeholders (VP, C-suite, board prep)
- **Description:** There is no `approval_status` field on `report_runs` or `scheduled_reports`. No draft state exists. The closest equivalent — "Preview with live data" — does not gate delivery. When a scheduled run triggers, Crystal's narrative goes directly to all recipients. A single data bug or Crystal hallucination sends a wrong number to a CEO before the CX manager has seen it.
- **Specific fix:** Add `approval_status` (`pending_review | approved | rejected`) to `report_runs`. Add a creator-only "Hold for review" toggle per scheduled report. When enabled: run generates, delivery is paused, creator receives an in-app and email notification with a preview link. Creator approves or rejects within a configurable window (e.g., 4 hours). If no action is taken, a configurable fallback applies (skip run, send anyway, escalate). Add an "Approve and send" button to the preview view at `/reports/:id/view/:runId`.

**CX-002 — One cadence per report, no per-segment scheduling**
- **Who this affects:** Any enterprise team running multiple survey programs (support CSAT daily, product NPS weekly, exec NPS monthly)
- **Description:** The `cadence` field is a single TEXT value per `scheduled_report`. There is no concept of a report collection, a cadence calendar, or per-segment scheduling within one report. A CX team running three programs must create three separate reports, with no way to see them together or understand their combined delivery footprint.
- **Specific fix:** Introduce a "Report Program" container that groups multiple scheduled reports under one name (e.g., "NPS Program — Q3"). Add a cadence calendar view (month grid) showing upcoming deliveries across all active reports. This does not require restructuring the data model immediately — the calendar can be a read-only aggregation view. Longer term, allow one report to define multiple delivery schedules (e.g., daily to ops team, weekly roll-up to leadership).

**CX-003 — No report archive with navigable history**
- **Who this affects:** Any user asked to retrieve a historical report ("send me the April executive brief")
- **Description:** The Run History drawer shows the last 5 runs with status and timestamp. There is no archive view. To find the April 2026 Monthly Executive Brief, a user must paginate through a flat list. For programs running 12+ months, this becomes unusable.
- **Specific fix:** Add `/reports/:id/archive` — a calendar-based or grouped-by-month index of all completed runs. Each entry links to `/reports/:id/view/:runId`. Add a search-by-date-range filter. The web view at `/reports/:id/view/:runId` should show "Previous edition" and "Next edition" navigation. Archive links should respect the same access controls as the report itself.

**CX-004 — No narrative quality feedback loop**
- **Who this affects:** Any report creator who receives a Crystal-generated narrative that is factually wrong, misleading, or off-tone
- **Description:** `highlights JSONB` stores Crystal-selected verbatim quotes. There is no mechanism for the creator to flag incorrect claims, edit the narrative before sending (post-approval), or feed corrections back to Crystal. The weekly narrative quality review described in team processes is an internal operation — it is invisible to the customer and does not improve the specific report that caused the problem.
- **Specific fix:** On the report preview and web view, add a "Flag this section" action per narrative block. Flag types: Incorrect data, Misleading framing, Wrong tone, Other. Flagged sections are stored (linked to `report_run_id` and section ID) and surfaced in an internal quality dashboard. Optionally, allow the creator to provide a corrected version of a flagged claim — this becomes a training signal. At minimum, flagged runs should be excluded from open-rate success metrics.

---

### Should Fix

**CX-005 — Multi-timezone scheduling not supported**
- **Who this affects:** Global teams with regional sub-teams wanting delivery at local business hours
- **Description:** The `scheduled_reports` schema has a single cadence and presumably a single send time. There is no per-recipient timezone configuration. A support manager with teams in EMEA, Americas, and APAC cannot schedule one report to arrive at 8am for each region.
- **Specific fix:** Add `delivery_timezone TEXT` to `report_recipients` (or a recipient group). Allow schedule definition in "recipient local time" mode. At run time, generate one report artifact and fan out deliveries according to each recipient's timezone offset. This is a backend scheduling concern, not a Crystal concern — the narrative is identical; only delivery timing varies.

**CX-006 — Recipient management lacks groups and self-service**
- **Who this affects:** Admins managing reports for large teams; recipients who want to opt in or change delivery preferences
- **Description:** Recipients are added one at a time via a combobox. There are no recipient groups (e.g., "CX Leadership" as a saved distribution list). External email recipients have no authorization verification. Recipients cannot add themselves or update their delivery channel without going through the report creator. The opt-out (`unsubscribed_at`) is one-directional — there is no opt-in flow.
- **Specific fix:** Add a `recipient_groups` table. Allow admins to define named groups with org member sync. Add group import to the recipient combobox. Add a self-service recipient portal (token-gated link) where recipients can update their delivery channel, pause delivery, or unsubscribe without involving the report creator.

**CX-007 — No engagement visibility beyond delivery status**
- **Who this affects:** Report creators who need to know whether stakeholders are reading the briefings
- **Description:** The delivery channel tracks sent/bounced. Email open rate is tracked via SendGrid at an aggregate level (GTM target: >= 38%). But there is no per-recipient engagement view. The report creator cannot tell whether the CEO opened the monthly brief or whether it landed in spam. "View full dashboard" click-through is not tracked.
- **Specific fix:** Surface per-recipient open and click-through data on the Run History detail view. Show engagement trend over time on the report detail page. Add an engagement health indicator (e.g., "3 of 8 recipients have not opened the last 4 editions") so creators can proactively follow up or verify delivery.

**CX-008 — Custom KPI thresholds not supported in template_overrides**
- **Who this affects:** Enterprise CX managers who want conditional formatting or alert-only delivery based on metric movement
- **Description:** `template_overrides JSONB` supports section show/hide and tone. It does not support threshold rules (e.g., "show NPS in red if below 30") or conditional delivery (e.g., "only send if NPS changes by more than 5 points"). These are standard in enterprise reporting and directly reduce alert fatigue.
- **Specific fix:** Extend `template_overrides` to include a `kpi_rules` array. Each rule: `{ metric, operator, threshold, display_action }` where `display_action` can be `highlight_red`, `highlight_green`, `add_alert_banner`, or `suppress_section`. Add a separate `delivery_conditions` field: `{ condition: "metric_change_exceeds", metric: "nps", delta: 5 }` — run generates normally but delivery is suppressed if the condition is not met.

**CX-009 — Shareable links have no audit trail or revocation**
- **Who this affects:** Any organization with data governance requirements; security-conscious enterprise buyers
- **Description:** The 30-day shareable link at `/reports/:id/view/:runId` (from the DESIGN spec) has no access log, no record of who the link was shared with, and no revocation mechanism. The report creator has no way to invalidate a link sent to a departed employee or a wrong email address. This is a data governance gap that will surface in enterprise security reviews.
- **Specific fix:** Log every link share event (who shared, when, recipient email if provided). Add a "Manage links" panel on the run view showing active links with a revoke button. Apply link expiry as a hard cutoff server-side (not just UI-gated). Consider adding optional password protection for links shared outside the org.

**CX-010 — No on-demand Crystal report generation via chat**
- **Who this affects:** Power users who want to generate a one-off briefing without setting up a scheduled report
- **Description:** Phase 5 introduces an MCP skill `generate_report(scope, template)` that surfaces as an action proposal card in Crystal chat. This is close to on-demand generation but is not the same as a conversational flow. A user cannot say "Generate a weekly NPS briefing for our Mobile surveys and send it to me now" and have Crystal handle the full flow — scope selection, template selection, recipient confirmation, and delivery — without leaving the chat. The MCP skill generates a proposal; the user must still navigate to the Reports section to confirm and send.
- **Specific fix:** Extend the MCP skill to support a full conversational fulfillment path: Crystal confirms scope and recipients within chat, generates the report, shows a preview inline (or links to the preview), and allows the user to approve delivery from within the conversation. This collapses the gap between "I asked Crystal" and "the report was sent."

---

### Nice to Have

**CX-011 — Custom branding limited to Enterprise tier**
- **Who this affects:** Growth+ customers who send reports to internal executives and want a professional presentation
- **Description:** Custom logo and branding is an Enterprise-only white-label feature. Growth+ customers cannot add a company logo or header image to reports shared with their VP or board. Even a simple "upload header image" option would significantly improve perceived quality.
- **Specific fix:** Add a "Report header image" upload to the report settings (non-white-label, no domain replacement). This is cosmetic and does not require the full white-label infrastructure. Gate it at Growth+ to maintain Enterprise tier differentiation while meeting the basic presentation need.

---

## 3. Customer Journey Scenarios

### Scenario 1: The Monday Morning CEO Brief

Sarah, Director of CX at a 500-person B2B SaaS company, wants to send a Monthly Executive Summary to her CEO and CRO. She sets up the report on a Friday, adds both executives as recipients, and schedules it for the first Monday of each month at 7am.

The first automated run fires on Monday morning while Sarah is commuting. Crystal has generated the narrative from the previous month's data. Unknown to Sarah, there was a data pipeline delay last Thursday — one of the three NPS surveys did not finish processing, so the aggregate NPS calculation is based on 60% of the expected responses. Crystal's narrative reads "NPS holds steady at 52" when the true value (once the remaining responses load) will be 47.

Sarah has no way to intercept this. There is no approval gate, no "hold for creator review" toggle, and no notification that the run has fired. The CEO reads "NPS holds steady at 52" in a board prep meeting. Two hours later, the pipeline finishes processing and the real number appears in the dashboard. Sarah now has to send a correction email to her CEO.

**Gaps exposed:** No approval gate (CX-001). No data freshness indicator on the report — the narrative does not show what percentage of the expected response volume was included in the calculation, nor does it flag "data may be incomplete." No recall mechanism — once sent, the link remains active and shows the wrong number until the 30-day expiry, with no way to redirect the link to a corrected run. This scenario represents the most common category of enterprise reporting incidents: correct tooling, correct setup, wrong data timing.

---

### Scenario 2: The Support Team Daily CSAT Digest

Marcus, a Support Operations Manager, wants a daily CSAT digest for his team. He has three regional teams: EMEA (London), Americas (Chicago), and APAC (Sydney). Each team should receive their regional CSAT data — not the global aggregate — at 8am local time.

Marcus creates the report and immediately hits two walls. First, there is one cadence per report and one send time. He cannot define "8am London / 8am Chicago / 8am Sydney" — these are three different UTC offsets. He creates three separate reports, one per region. Second, he wants to filter each report to show only the CSAT data for that region's ticket queue. If the survey data is tagged by region, he can potentially use tag filters at the template level — but it is not clear whether `template_overrides` supports a data scope filter (e.g., "only include responses where region_tag = APAC"). There is no documented data scoping field in `template_overrides`.

He now has three reports, each requiring separate maintenance. When he adds a new team member in APAC, he must update the APAC report's recipient list manually. Six months later, Marcus leaves the company. The new ops manager has no visibility into why there are three identically named reports, what filter settings differentiate them, or who originally set them up.

**Gaps exposed:** No per-recipient timezone scheduling (CX-005). No documented data scope filter in `template_overrides` — it is unclear how a report scopes its input data beyond the survey level, and this is not addressed anywhere in the current design. No recipient groups (CX-006). No report description or internal notes field that would explain intent to a future admin.

---

### Scenario 3: The Regional NPS Program

A global enterprise runs NPS surveys across five regions: North America, LATAM, EMEA, APAC, and MEA. Each region has a dedicated regional lead, a regional ops team, and a different distribution list. The Global CX Director wants a weekly NPS briefing for each regional lead — same template, same cadence, but scoped to each region's data and delivered to that region's list.

The setup requires creating five separate scheduled reports. There is no "clone with overrides" workflow — each must be built from scratch. There is no template inheritance model where a global report definition can be instantiated per region with only the scope and recipients varying. Across five reports, any change to the template (adding a new section, changing tone) requires five separate edits with no bulk update mechanism.

Two of the regional leads want delivery via Slack, not email. The Slack integration uses a webhook URL — it delivers to a channel, not to a named user. The EMEA lead wants it in their personal Slack DM. This is not supported; the channel webhook model does not support Slack user ID targeting.

Six months in, the MEA region merges with EMEA. The MEA report needs to be decommissioned, its historical runs preserved, and the EMEA report updated to include MEA data. There is no merge or archive workflow. The MEA report can be deactivated (`is_active = false`), but its run history is only accessible through its own report detail page — there is no cross-report grouping to find "all NPS program reports" in one view.

**Gaps exposed:** No template inheritance or clone-with-scope-override workflow. No per-user Slack delivery (CX-006). No cross-report grouping or program-level view (CX-002). No report decommission workflow that preserves history and links it to a successor report.

---

### Scenario 4: The Crisis Response

It is the second Monday of the month. Crystal's Monthly Executive Brief fires at 7am and is delivered to the VP of Customer Experience and four directors before anyone on the CX ops team is at their desk. The brief states: "NPS improved 15 points month-over-month, reaching an all-time high of 61."

The actual NPS is 43 — a 3-point drop. The discrepancy is caused by a data processing bug introduced two days earlier that double-counted a subset of Promoter responses in the aggregation query. The bug was caught at 6am by the data engineering team, but the fix was not deployed until 8am, after the report had already been delivered.

Jordan, the CX manager, arrives at 8:30am to find a Slack message from the VP asking for more detail on the "NPS milestone." Jordan now faces a multi-step crisis with no tooling support. There is no way to flag the sent run as incorrect. The web view link is still active and still shows "NPS improved 15 points." There is no "retract run" or "mark as superseded" action. Jordan cannot push a corrected version of the brief to the same recipients without creating a new ad-hoc report, which will appear as a different report in the UI rather than a correction of the original. The 30-day link has no audit trail showing whether all five recipients have already opened it.

Crystal's narrative was a faithful rendering of corrupted source data — it was not a Crystal reasoning error. But from the recipient's perspective, the briefing was wrong, and the platform provides no mechanism to communicate that fact or issue a correction through the same channel.

**Gaps exposed:** No approval gate (CX-001). No post-delivery "retract or supersede run" action — distinct from the approval gate; this is a correction workflow after delivery has already occurred. No link revocation (CX-009). No data quality indicator showing whether source data was flagged at generation time. No run-level incident annotation that the creator can attach after the fact to document what went wrong.

---

### Scenario 5: The New CX Manager Onboarding

Priya joins as the new CX Manager after her predecessor left without a formal handoff. The organization has seven scheduled reports active. Her first task is to understand what reports exist, what they cover, who receives them, and whether any need updating.

From the Reports list view, Priya can see report names, last run status, and next scheduled run. She cannot see: a description of what each report covers, the data scope (which survey or survey group each report draws from), the reason certain recipients were added, or the history of changes to the report configuration. There is no audit log of who modified a report or when.

She opens the "Exec Monthly NPS Brief" and sees the last 5 run summaries in the Run History drawer. She cannot tell which version of the template was active for each run — if the template was changed two months ago, the old runs are not tagged with a snapshot of the configuration that produced them. She opens one of the older runs and the web view shows the narrative, but there is no metadata panel explaining the data scope, response count included, or which survey version was active at the time of generation.

Three of the seven reports have external email recipients — consultants from a previous project. Priya cannot tell whether these addresses are still valid or whether those consultants should still have access to the org's NPS data. There is no recipient authorization log, no "last opened" timestamp per external recipient, and no bulk recipient audit view.

**Gaps exposed:** No report description or internal notes field (identified in Scenario 2 as well — this is a confirmed recurring need across persona types). No configuration change audit log. No per-run provenance metadata (data scope, response volume, survey version at time of generation). No recipient authorization audit view for external emails — related to CX-009 but specifically about external recipient governance rather than link governance.

---

## 4. Enterprise Reporting Benchmark

The following capabilities are standard in mature enterprise XM platforms and are absent or incomplete in the current Intelligence Briefings design.

**Qualtrics XM — Stats iQ and Executive Reporting:**
- Approval workflows with configurable approver chains are built into the report distribution flow. Reports do not send without explicit sign-off when the approval flag is enabled. The approval interface shows a diff between the current draft and the prior approved version.
- Report versioning: each published report is a named version. Recipients receive "v1.2 — February 2026" and can navigate to prior versions from the same persistent URL.
- Recipient groups sync directly from the organization's SSO directory. When a team changes in the identity provider, the distribution list updates automatically at the next scheduled run without any manual action from the report owner.
- Data recency indicators: every report section displays the data window and the response count included. If response volume is below a configured threshold (e.g., n < 30), the section is flagged with a low-sample warning that is visible to recipients.

**Medallia Experience Cloud — Signal-Based Reporting:**
- Conditional delivery: reports fire only when metric thresholds are breached (e.g., "send the CSAT alert brief only if 7-day CSAT drops below 3.8"). This eliminates routine noise and ensures recipients treat every delivery as signal rather than scheduled noise.
- Role-based report scoping: a single report definition can be instantiated with different data scopes per recipient role. The EMEA regional lead automatically receives EMEA-scoped data; the global director receives the aggregate. One configuration, N scoped deliveries — no report duplication required.
- Inline corrections: if a data error is discovered after delivery, the platform supports publishing a corrected edition to the same distribution list with a system-generated "correction notice" header. The original link redirects to the correction automatically. The correction workflow is native to the platform, not an out-of-band email.
- Engagement analytics: per-recipient open, click, and time-on-page are surfaced in a delivery analytics tab. Medallia uses this to calculate a "report influence score" — correlating engagement with subsequent action taken in the platform — which becomes a CSM metric for demonstrating ROI.

**Sigma Computing (BI-adjacent, relevant for briefing delivery design):**
- Scheduled exports with recipient-level parameter injection: one report template, delivered to each recipient with their personal data scope pre-applied (each regional lead receives their own territory data). No report duplication required; the scoping logic lives in the template, not the report configuration.
- "Send on change" delivery mode: report fires when the underlying data changes beyond a configured delta. Used for exception-based reporting rather than calendar-based cadence — the platform decides when something is worth reporting, not the calendar.

The current Intelligence Briefings design is calendar-based and creator-scoped. Enterprise XM reporting has largely moved to signal-based, role-scoped, and approval-gated delivery. The feature as designed will satisfy a Growth-tier user sending a weekly digest to a small internal team. It will not satisfy an enterprise CX Director managing a multi-region program with executive stakeholders who have zero tolerance for misfires.

---

## 5. What "Great" Looks Like

**Example 1: The self-healing brief**
A report that knows when its data is suspect. At generation time, Crystal checks whether the input data volume is within expected bounds for the survey and cadence, based on historical run averages. If response volume is more than 20% below the prior-period average, the report is generated but held in a "low-confidence" state rather than delivered immediately. The creator receives a notification: "This month's brief was generated but response volume is 34% below the March average. Review before sending." The creator can approve and send with a caveat note appended to the narrative, request a delayed send (e.g., 24 hours to allow more responses to arrive), or suppress the run. This is not just an approval gate — it is an intelligent approval gate that only triggers when there is a real reason to pause. Normal runs proceed without friction; edge cases get caught before they reach the CEO's inbox.

**Example 2: The role-scoped regional brief**
A single "NPS Weekly Brief" report definition. The creator defines the template once, sets the cadence once, and configures a scope rule: "deliver to each recipient using their assigned region tag as the data filter." Each recipient receives a brief scoped to their region, with a regional narrative generated by Crystal. The global aggregate version is delivered to the Global CX Director. One report to maintain, one template to update when the section structure changes, one place to audit recipients. When a new region is added, the creator adds a recipient with the appropriate region tag — no new report to configure, no parallel maintenance burden. This pattern eliminates the "seven identical reports with one-character differences" anti-pattern that enterprise admins inherit and quietly resent.

**Example 3: The correction-native workflow**
When a report is flagged as containing an error — by the creator or by any recipient — the platform enters a "correction in progress" state. The active web view link shows a banner: "A correction is being prepared for this edition. The updated version will be available here." The creator edits the narrative section with Crystal's assistance to regenerate the flagged claim using corrected source data, reviews the diff against the original, and publishes the correction. All recipients receive a re-delivery notification: "Correction: [Report Name] — [Month]. Please disregard the prior edition." The original run is archived with a "superseded" status and linked to the correction. No out-of-band email from the CX manager required. The platform owns the trust recovery, not the individual. This pattern transforms what would otherwise be a reputation-damaging incident into a demonstration of platform reliability.

---

*This review reflects the perspective of an enterprise CX practitioner with direct experience running multi-region XM programs on Qualtrics and advising enterprise customers on reporting program design. The gaps identified are not speculative — they are the questions enterprise buyers will ask in procurement and the incidents that will drive churn if not addressed before GA.*
