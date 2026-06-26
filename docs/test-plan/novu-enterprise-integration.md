# Novu Enterprise Integration — Customer Testing Guide

**Feature:** Enterprise communication infrastructure (Sprints 1–5)
**Starting condition:** Zero data, dev mode (no Clerk required)
**Date:** 2026-06-24

---

## 1. Environment Setup

Start these in order:

```bash
# Terminal 1 — Postgres + Redis
docker-compose up -d

# Terminal 2 — Backend API (port 3001)
cd backend && npm start

# Terminal 3 — Frontend (port 5173)
cd app && nvm use 20 && npm run dev

# Terminal 4 — CrystalOS (only for AI flows)
cd crystalos && make run-dev
```

Verify: `http://localhost:3001/api/health` → `{ "status": "ok" }`.
Open `http://localhost:5173` — no login prompt in dev mode (automatically `super_admin`).

---

## 2. User Roles and Permissions

| Role | Contacts | PII | Segments | Cases | Broadcasts | Approve Broadcasts | Analytics |
|---|---|---|---|---|---|---|---|
| **super_admin** | Full | Unmasked | Full | Full | Create + Send | Yes (only role) | Yes |
| **admin** | Full | Unmasked | Full | Full | Create + Send | No | Yes |
| **cx_manager** | Full | Unmasked | Full | Full | Create (no approve) | No | Yes |
| **analyst** | Read only | Masked | None | Read | None | No | Yes |
| **survey_creator** | Owned | Masked | None | Owned | Transactional only | No | Owned |
| **report_viewer** | No | No | No | No | No | No | No |
| **member** | No | No | No | No | No | No | No |

Dev mode = super_admin. Role-boundary tests require Clerk configured with real test accounts.

---

## 3. Test Flows

Run in order — each flow builds on the previous one.

---

### FLOW 1 — Survey Creation
**URL:** `/app/surveys` → Create Survey

1. Click **Create Survey**
2. Choose "Start from scratch" or pick the NPS template
3. Name: `NPS Feedback — Q3 2026`
4. Enter the builder. Add 3 questions:
   - Q1 — NPS: "How likely are you to recommend us? (0–10)"
   - Q2 — Open Text: "What is the main reason for your score?"
   - Q3 — Multiple Choice: "Which area matters most?" | Options: Support, Product Quality, Pricing, Speed
5. Click **Save** then **Publish**

✅ Survey appears in list with "Active" badge. Shareable token URL available in Distribute panel.

---

### FLOW 2 — Create Contacts
**URL:** `/app/contacts`

1. Click **Add Contact** (top-right)
2. Import modal opens — paste this CSV:
   ```
   name,email,account_name
   Alice Johnson,alice@acme.com,Acme Corp
   Bob Smith,bob@globex.com,Globex Industries
   Carol Lee,carol@initech.com,Initech
   ```
3. Click **Import Contacts**

✅ 3 contacts appear with names and emails. Each shows "Consent Pending" badge.

4. Click **View Contact** on Alice → tabs: Activity (empty), Segments (empty), Responses (empty)

**PII masking test** (analyst role required):
Contact list shows "Protected" + lock icon for names, `****` for email.

---

### FLOW 3 — Contact Segments
**URL:** `/app/contacts/segments`

1. Click **New Segment** → Sheet slides in
2. Fill: Name: `Acme Corp Contacts`, Dynamic: ON
3. Add Condition: Field: `Account Name` | Operator: `contains` | Value: `Acme`
4. Live preview shows 1 contact
5. Click **Save**
6. Click the **refresh** icon on the segment card → contact count updates

✅ Segment card shows "1 contact", "Dynamic", last evaluated time.

---

### FLOW 4 — CRM Sync via CSV URL
**URL:** `/app/settings/connections`

1. Click **New Connection** → 4-step wizard
2. Step 1: Select **CSV from URL**
3. Step 2: Name: `Test CSV Sync`. Paste a publicly accessible CSV URL
4. Step 3: Accept default field mappings
5. Step 4: Schedule: Manual → **Save**
6. Click **Sync Now** → click **View Logs** → log shows `status: completed`, fetched/created counts

✅ Contacts from CSV appear in `/app/contacts`.
⚠️ If URL unreachable: log shows `status: failed` — correct behavior.

---

### FLOW 5 — Submit Anonymous Survey Responses
**URL:** `/s/:token` (from Distribute panel)

Open in a **private/incognito window** (simulates anonymous respondent):

1. Response 1: NPS = 8, Open text: "The product is solid but docs are thin.", Multiple choice: Product Quality → Submit
2. Response 2: NPS = 3, Open text: "Support response times are too slow." → Submit

✅ Responses appear in `/app/surveys/:id/responses` as "Anonymous".

---

### FLOW 6 — Auto-Link Anonymous → Identified

Submit a 3rd response in the same incognito window:

1. Open text: `My email is alice@acme.com — the product is great.`
2. Submit

3. Navigate to Alice Johnson's Contact Detail → **Activity** tab

✅ Timeline shows linked response with a blue "Auto" badge.

---

### FLOW 7 — CX Cases
**URL:** `/app/cases`

**Create from Contact Detail:**
1. View Contact → Alice Johnson → click **Create Case** (in page header)
2. Redirected to `/app/cases/:caseId`

**Work the case:**
3. Case card shows: severity stripe, SLA countdown (72h), "Open" badge, "No owner"
4. Assign owner: Type `Alice Manager` in Reassign Owner field → Enter
5. Change status: Dropdown → "In Progress" → audit entry added
6. Add note: `Contacted Alice to follow up.` → **Add Note** → timeline entry appears
7. Escalate: Dropdown → "Escalated" → badge turns red

✅ Full audit trail in center timeline. Contact linked in right column.

⚠️ Known gap: "Create Case" button on the Cases list page itself has no handler. Create cases from Contact Detail only.

---

### FLOW 8 — Ownership Routing
**URL:** `/app/settings/ownership`

1. **Add Rule:**
   - Match Value: `Acme Corp Contacts` | Match Type: `exact`
   - Owner Label: `Alice Manager` | Owner User ID: `user-cx-alice`
   - Priority: `100`
2. **Save Rule** — appears in table
3. **Test Route** panel:
   - Input `Acme Corp Contacts` → green: "Matched: Alice Manager"
   - Input `Unknown Segment` → gray: "No matching rule found"

✅ New cases for contacts in this segment auto-assign to Alice Manager.

---

### FLOW 9 — Crystal AI Insights
*Requires CrystalOS running + OPENROUTER_API_KEY*

1. Navigate to `/app/insights`
2. Click **Generate Insights** → pipeline runs (30–90s)
3. Insight cards appear (descriptive, diagnostic, predictive layers)
4. Open Crystal panel (◆ Crystal in sidebar or ⌘K)
5. Ask: `Why did respondents give low NPS scores?`
6. Crystal streams a cited response
7. If an action proposal card appears: click **Apply** to execute, **Dismiss** to decline

✅ Streamed cited responses. Proposals execute without mutating without confirmation.

---

### FLOW 10 — Broadcasts (Create → Approve → Send)
**URL:** `/app/broadcasts`

**Part A — Create (cx_manager or super_admin):**

1. Click **New Broadcast** → 4-step Sheet:
   - Step 1: Name: `Q3 NPS Follow-up`
   - Step 2: Audience: Segment → select `Acme Corp Contacts`
   - Step 3: Channels: check **email**
   - Step 4: Subject: `We noticed your feedback` | Body: `Hi, we saw your recent response and want to follow up.` | CTA: `Share Feedback`
2. Click **Submit Broadcast**

✅ Status badge: "Awaiting Approval" (amber). Stat card "Pending: 1" updates.

**Part B — Approve (super_admin only):**

3. Click **Approvals** → `/app/broadcasts/approval`
4. Pending tab shows broadcast with expiry countdown + preview
5. Click **Approve** → confirmation dialog shows recipient count → **Approve**

**Part C — Send:**

6. In "Approved" tab → click **Send Now**
7. Status: `sending` → `sent`. Audit trail shows: Created → Approved → Sent

✅ Without Novu: status reaches `sent` in DB, no emails sent.
✅ With Novu: contacts receive emails.

**Reject path:** Click **Reject** → enter reason → confirm. Status = "Rejected". No send fires.

---

### FLOW 11 — Suppression List

Add via API (no dedicated UI page yet):

```bash
# Add suppression
curl -X POST http://localhost:3001/api/outreach/suppression \
  -H "Content-Type: application/json" \
  -d '{"email": "carol@initech.com", "channel": "email", "reason": "unsubscribe"}'

# Verify suppression
curl -X POST http://localhost:3001/api/outreach/suppression/check \
  -H "Content-Type: application/json" \
  -d '{"email": "carol@initech.com", "channel": "email"}'
# → { "suppressed": true }
```

Navigate to `/app/settings/notification-analytics` → Suppressions panel shows count: 1.

✅ Future broadcasts skip carol@initech.com even if she's in the audience segment.

---

### FLOW 12 — Notification Analytics
**URL:** `/app/settings/notification-analytics`
*(SideNav: bar chart icon — requires `outreach:logs:read` permission)*

1. Toggle period: 7d | 30d | 90d
2. KPI cards: Sent, Delivered %, Opened %, Clicked %, Bounced, Suppressed
   - Without Novu sends: shows 0 or "Demo Data" badge (amber)
3. Channel Breakdown table: one row per channel with rates
4. **Edit a frequency cap:** In Frequency Caps panel → Edit next to "email" → change Max to 2 → **Save**
5. Suppression panel shows count from Flow 11

✅ Real data appears after Novu delivers messages and the delivery webhook fires.

---

### FLOW 13 — Ontology
**URL:** `/app/settings/ontology`

1. View the hierarchical taxonomy of terms
2. If "Add Term" available: add `Wait Time` with parent `Customer Effort`

Ontology terms appear in case `driver_ref` fields and Crystal's classification context.
Main value is visible after Crystal generates insights that reference ontology terms.

---

### FLOW 14 — Crystal Novu Connect
*Requires Novu + CrystalOS*

**Dev mode test (no Novu account needed):**

```bash
curl -X POST http://localhost:3001/api/crystal-novu/message \
  -H "Content-Type: application/json" \
  -d '{
    "subscriberId": "dev-user",
    "orgId": "dev-org",
    "message": "What are the top insights from our latest survey?",
    "channel": "slack",
    "threadId": "test-thread-001"
  }'
```

Response: `{ "received": true }` — CrystalOS processes async and replies via Novu.

**With real Novu:** Configure ACI webhook in Novu dashboard pointing to `https://your-host/api/crystal-novu/message`. Send a Slack DM to the Crystal bot — reply arrives in the same thread.

---

## 4. Permission Boundary Tests

| Test | Expected |
|---|---|
| Analyst navigates to `/app/contacts` | PII masked ("Protected" + "****") |
| Analyst clicks "Add Contact" | 403 Forbidden |
| cx_manager clicks "Approve" on pending broadcast | 403 Forbidden (only super_admin) |
| cx_manager clicks "Anonymize Contact" | Button not shown |
| report_viewer navigates to `/app/contacts` | 403 — empty/error state |
| report_viewer navigates to `/app/broadcasts` | 403 — empty/error state |

---

## 5. Edge Cases

| Scenario | What Happens |
|---|---|
| Contact anonymized | `anonymized_at` stamped, PII nulled. Card shows gray "Anonymized" banner. |
| Broadcast expires (72h) | Status → `expired`. Approve button disabled. Simulate: `UPDATE outreach_broadcasts SET expires_at = NOW() - INTERVAL '1 second' WHERE id = '...'` |
| Segment has 0 contacts | Preview shows 0. Broadcast can still be created. Send completes with 0 deliveries. |
| No NOVU_API_KEY set | Broadcasts reach `sent` in DB, nothing delivered. Analytics shows demo data. |
| Suppressed contact in broadcast | Contact skipped at send time. `isSuppressed()` checked before `triggerWorkflowBulk`. |

---

## 6. What Works Without Novu

| Feature | Without Novu | With Novu |
|---|---|---|
| Contact management, segments, sync | Full | Full |
| CX Cases + Ownership Routing | Full | Full |
| Crystal AI (in-app panel) | Full | Full |
| Broadcast create + approval queue | Full | Full |
| Actual email/SMS/push delivery | Not sent | Delivered |
| Open/click rate analytics | Zero / demo data | Real data |
| Crystal Novu Connect (Slack/Teams) | Test via direct POST only | Full |

---

## 7. Known Gaps

1. **"Create Case" on Cases list page** — button has no handler. Use Contact Detail page instead.
2. **"View Members" on segment cards** — shows all contacts, not filtered to the segment.
3. **Broadcast audience** — UI supports segment targeting only; individual contactId lists not in the UI (backend supports it).
4. **SLA window hardcoded** — 72 hours, not configurable per severity or org.
5. **Suppression management UI** — add/remove is API-only, no dedicated UI page yet.
6. **Analytics = demo data** until Novu delivers at least one real message and the delivery webhook fires.
