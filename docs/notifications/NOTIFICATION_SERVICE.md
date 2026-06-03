# Notification Service — Design Document

**Version:** 1.0  
**Date:** 2026-06-03  
**Status:** Design  
**Team:** Aria Chen (Engineering Lead), Marcus Williams (Backend), Priya Sharma (UX), James Park (Frontend), Dr. Sofia Rodriguez (Applied Science), David Kim (SRE), Emma Thompson (XM Expert), Carlos Mendez (Enterprise Customer)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Notification Taxonomy](#2-notification-taxonomy)
3. [Architecture Design](#3-architecture-design)
4. [Database Schema](#4-database-schema)
5. [Backend API Design](#5-backend-api-design)
6. [Frontend UX Design](#6-frontend-ux-design)
7. [Crystal AI Integration](#7-crystal-ai-integration)
8. [Delivery Channels & Roadmap](#8-delivery-channels--roadmap)
9. [Docker Integration](#9-docker-integration)
10. [Scalability & Fault Tolerance](#10-scalability--fault-tolerance)
11. [Implementation Roadmap](#11-implementation-roadmap)
12. [Success Metrics](#12-success-metrics)

---

## 1. Executive Summary

### The Problem

Enterprise XM customers log into Experient to discover things that happened hours or days ago. NPS dropped on Tuesday — it's Thursday and no one knew. A survey hit 1,000 responses but the insight report hasn't been triggered. Crystal finished analyzing a surge in negative sentiment but the CX team is still in a meeting discussing last month's data.

**Information latency is the enemy of experience management.**

### What This Solves

The Notification Service brings real-time intelligence delivery to Experient. Rather than requiring users to poll the dashboard, Experient proactively surfaces what matters, when it matters, to the person who needs to act.

> Carlos Mendez (CX Director, Fortune 500): *"I don't log into XM tools looking for insights — I need the insights to find me. When something breaks in the customer experience, I need to know in five minutes, not five days."*

### Business Value

- **Time-to-action reduction**: From hours/days to minutes for critical CX events
- **Engagement lift**: Users who receive notifications return to the platform 3x more frequently (industry benchmark)
- **Competitive differentiation**: Crystal-powered notification narration is unique in the XM market — no competitor sends AI-explained notifications
- **Enterprise retention**: Notification preferences and role-based delivery are a common enterprise procurement requirement

### Scope

- **v1**: In-app notification center + real-time WebSocket delivery + unread badge
- **v1.5**: Email digest (daily/weekly summaries)
- **v2**: Slack/Teams integration
- **v3**: Mobile push, PagerDuty, webhooks

---

## 2. Notification Taxonomy

### 2.1 Notification Priority Levels

| Level | Color | Badge | Use case |
|-------|-------|-------|----------|
| `critical` | Red | Red dot | NPS emergency, data pipeline failure |
| `warning` | Orange | Orange dot | Score drop, response rate decline |
| `info` | Blue | Blue dot | Milestone reached, insight ready |
| `success` | Green | Green dot | Quota achieved, analysis complete |
| `digest` | Gray | None | Scheduled summaries |

### 2.2 Complete Notification Types

#### Survey Lifecycle
| Event | Type | Priority | Who receives |
|-------|------|----------|-------------|
| Survey published | `survey.published` | info | Survey creator |
| Survey closed | `survey.closed` | info | Survey creator, team |
| Survey reaches N responses (25, 50, 100, 500, 1000) | `survey.milestone` | info/success | Survey creator |
| Survey response rate drops below threshold | `survey.response_rate_low` | warning | Survey creator |
| Survey completion rate drops below threshold | `survey.completion_low` | warning | Survey creator |
| Survey closing in 48h | `survey.expiring_soon` | warning | Survey creator |
| Survey closing in 24h | `survey.expiring_critical` | critical | Survey creator, team |
| Quota target reached | `survey.quota_reached` | success | Survey creator, admins |
| New response submitted (with filter — e.g., NPS < 7) | `survey.response_filtered` | warning | Configured recipients |

#### Score & Metric Events
| Event | Type | Priority | Who receives |
|-------|------|----------|-------------|
| NPS drops more than N points vs prior period | `score.nps_drop` | critical | Org admins, CX leaders |
| NPS rises more than N points vs prior period | `score.nps_rise` | success | Org admins, CX leaders |
| NPS crosses threshold (configurable: e.g., below 30) | `score.nps_threshold` | critical | Configured recipients |
| CSAT score drops below threshold | `score.csat_drop` | warning | Configured recipients |
| CES score rises above threshold (higher = worse effort) | `score.ces_spike` | warning | Configured recipients |
| Segment-level score anomaly (mobile NPS vs desktop diverge) | `score.segment_anomaly` | warning | Admins |

#### Crystal AI Events
| Event | Type | Priority | Who receives |
|-------|------|----------|-------------|
| Crystal insight generation complete | `crystal.insight_ready` | info | Survey owner |
| Crystal detected a new topic emerging | `crystal.topic_emerged` | info | Survey owner, admins |
| Crystal detected an anomaly | `crystal.anomaly_detected` | warning | Survey owner, admins |
| Crystal weekly digest ready | `crystal.digest_ready` | digest | All members |
| Crystal confidence crossed threshold (now high enough to surface) | `crystal.confidence_high` | info | Survey owner |
| Crystal predicted NPS will drop within N days | `crystal.prediction_alert` | warning | CX leaders |

#### Team & Collaboration
| Event | Type | Priority | Who receives |
|-------|------|----------|-------------|
| Team member invited | `team.invite` | info | Invitee |
| Survey shared with you | `survey.shared` | info | Recipient |
| Survey comment/annotation added | `survey.comment` | info | Survey owner |
| Export completed | `export.complete` | info | Requester |
| Report generated | `report.ready` | info | Requester |

#### System & Operations
| Event | Type | Priority | Who receives |
|-------|------|----------|-------------|
| Data pipeline sync failure | `system.pipeline_error` | critical | Admins |
| Integration disconnected (e.g., Salesforce sync failed) | `system.integration_error` | warning | Admins |
| AI credits running low (< 20% remaining) | `system.credits_low` | warning | Admins |
| Monthly usage report | `system.usage_report` | digest | Admins |

#### Alert-Linked Notifications
| Event | Type | Priority | Who receives |
|-------|------|----------|-------------|
| Alert rule fired | `alert.fired` | (inherits alert severity) | Alert subscribers |
| Alert acknowledged by team member | `alert.acknowledged` | info | Alert creator |
| Alert resolved | `alert.resolved` | success | Alert subscribers |

---

## 3. Architecture Design

### 3.1 High-Level Data Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        EVENT PRODUCERS                                  │
│                                                                         │
│  [Survey Response Ingested]  [Crystal Analysis Done]  [Score Changed]   │
│          │                          │                       │           │
└──────────┼──────────────────────────┼───────────────────────┼───────────┘
           │                          │                       │
           ▼                          ▼                       ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     NOTIFICATION EVENT BUS                              │
│                     (Redis Streams: notifications:events)               │
│                                                                         │
│  Each event: { type, orgId, userId?, surveyId?, payload, timestamp }    │
└─────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                   NOTIFICATION PROCESSOR                                │
│                   (Node.js worker, consumer group)                      │
│                                                                         │
│  1. Determine recipients (by role, preference, subscription)            │
│  2. Apply deduplication (same event in last 1h? skip)                   │
│  3. Check user preferences (do they want this type?)                    │
│  4. Persist to `notifications` table (Postgres)                         │
│  5. Enqueue delivery tasks                                              │
└─────────────────────────────────────────────────────────────────────────┘
                    │                              │
                    ▼                              ▼
        ┌───────────────────┐          ┌─────────────────────┐
        │  WEBSOCKET GATEWAY│          │   DIGEST SCHEDULER  │
        │  (in-app real-    │          │   (Bull queue, runs  │
        │   time delivery)  │          │    daily/weekly)     │
        └───────────────────┘          └─────────────────────┘
                    │
                    ▼
        ┌───────────────────┐
        │  React Frontend   │
        │  Bell + Panel     │
        └───────────────────┘
```

### 3.2 Component Breakdown

#### Notification Event Bus (Redis Streams)
- Stream key: `notifications:events:{orgId}` (per-org to allow partition by tenant)
- Consumer group: `notification-processor`
- Message fields: `type`, `orgId`, `actorId`, `targetUserIds[]`, `entityType`, `entityId`, `payload` (JSON), `priority`, `timestamp`
- Retention: 24h (events older than 24h need not be re-processed)

#### Notification Processor (Node.js Worker)
- Reads from Redis Streams consumer group
- Looks up active subscribers for each notification type (from `notification_preferences`)
- Applies deduplication: checks Redis for `notif:dedup:{orgId}:{type}:{entityId}` key (TTL 1h for info, 24h for critical)
- Writes to `notifications` Postgres table
- Publishes to `notifications:live:{userId}` Redis channel for WebSocket fanout
- For digest-type notifications: queues into `notification_digests` table

#### WebSocket Gateway
- Socket.IO server on Express (existing backend)
- Authenticated channel per user: user joins room `user:{userId}` on connect
- On new notification persisted: publish to `notifications:live:{userId}` → gateway receives → emits `notification:new` to connected client
- Also emits `notification:count` (unread count update) for badge

#### Digest Scheduler (Bull Queue)
- Daily digest: runs at 8am user's timezone
- Weekly digest: runs Monday 8am
- Collects unsent digest-type notifications from `notification_digests`
- Renders HTML email template (v1.5)
- In v1, generates in-app digest summary card

### 3.3 Fanout Strategy

For org-wide notifications (e.g., "NPS dropped for your organization"):
1. Processor identifies all active users in org with the relevant preference enabled
2. Creates one `notifications` row per recipient (simple — no fan-out table needed at Experient's scale)
3. At 10K+ users per org: switch to a fan-out table with background worker

### 3.4 At-Least-Once Delivery Guarantee

- Redis Streams XACK ensures messages are not lost if processor crashes mid-process
- Messages re-delivered to consumer group after 30s if not acknowledged
- Idempotency: processor checks `notification_dedup` before inserting (upsert with unique constraint on `(org_id, event_type, entity_id, window)`)

---

## 4. Database Schema

All tables use Postgres (existing `experient` database in Docker). Aligned with the soft-delete pattern used across the platform.

```sql
-- Core notification record (one row per user per notification)
CREATE TABLE notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id),
  user_id         UUID NOT NULL REFERENCES users(id),
  
  -- Classification
  type            VARCHAR(64) NOT NULL,    -- e.g. 'survey.milestone', 'crystal.insight_ready'
  priority        VARCHAR(16) NOT NULL DEFAULT 'info',  -- critical|warning|info|success|digest
  
  -- Content
  title           TEXT NOT NULL,
  body            TEXT,
  icon_type       VARCHAR(32),             -- maps to frontend icon set
  action_url      TEXT,                    -- deep link to relevant page
  
  -- Rich payload (Crystal narration, entity references, etc.)
  metadata        JSONB DEFAULT '{}',
  
  -- Entity reference
  entity_type     VARCHAR(32),             -- 'survey', 'insight', 'alert', etc.
  entity_id       TEXT,
  
  -- State
  read_at         TIMESTAMPTZ,
  dismissed_at    TIMESTAMPTZ,
  
  -- Delivery tracking
  delivered_channels  TEXT[] DEFAULT '{}',   -- ['in_app', 'email', 'slack']
  
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ,             -- soft delete
  
  CONSTRAINT notifications_priority_check CHECK (
    priority IN ('critical', 'warning', 'info', 'success', 'digest')
  )
);

CREATE INDEX idx_notifications_user_unread 
  ON notifications(user_id, created_at DESC) 
  WHERE read_at IS NULL AND deleted_at IS NULL;

CREATE INDEX idx_notifications_user_all 
  ON notifications(user_id, created_at DESC) 
  WHERE deleted_at IS NULL;

CREATE INDEX idx_notifications_org_type 
  ON notifications(org_id, type, created_at DESC);


-- User notification preferences (what types they want, which channels)
CREATE TABLE notification_preferences (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id),
  org_id          UUID NOT NULL REFERENCES organizations(id),
  
  notification_type   VARCHAR(64) NOT NULL,  -- matches notification.type
  
  -- Channel preferences
  in_app_enabled      BOOLEAN NOT NULL DEFAULT TRUE,
  email_enabled       BOOLEAN NOT NULL DEFAULT FALSE,
  slack_enabled       BOOLEAN NOT NULL DEFAULT FALSE,
  
  -- Threshold overrides (e.g., only alert if drop > 5 points)
  threshold_config    JSONB DEFAULT '{}',
  
  -- Quiet hours (don't deliver in-app badge outside these hours)
  quiet_hours_start   TIME,
  quiet_hours_end     TIME,
  timezone            VARCHAR(64) DEFAULT 'UTC',
  
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(user_id, org_id, notification_type)
);


-- Digest queue (collect digest-type events for batch delivery)
CREATE TABLE notification_digests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id),
  org_id          UUID NOT NULL REFERENCES organizations(id),
  notification_id UUID REFERENCES notifications(id),
  
  digest_type     VARCHAR(16) NOT NULL DEFAULT 'daily',  -- 'daily' | 'weekly'
  scheduled_for   TIMESTAMPTZ NOT NULL,
  sent_at         TIMESTAMPTZ,
  
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notification_digests_pending 
  ON notification_digests(scheduled_for, sent_at)
  WHERE sent_at IS NULL;


-- Deduplication log (prevent duplicate notifications)
CREATE TABLE notification_dedup (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL,
  event_type      VARCHAR(64) NOT NULL,
  entity_id       TEXT NOT NULL,
  window_start    TIMESTAMPTZ NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL,
  
  UNIQUE(org_id, event_type, entity_id, window_start)
);

CREATE INDEX idx_notification_dedup_expiry ON notification_dedup(expires_at);


-- Notification channel configs (org-level Slack webhook, email settings)
CREATE TABLE notification_channels (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES organizations(id),
  
  channel_type    VARCHAR(32) NOT NULL,   -- 'slack', 'teams', 'email', 'webhook'
  channel_name    VARCHAR(128),
  config          JSONB NOT NULL,         -- webhook_url, api_key, etc. (encrypted at rest)
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);
```

---

## 5. Backend API Design

### 5.1 REST Endpoints

All endpoints require authentication (`Authorization: Bearer <clerk-token>`).

```
GET    /api/notifications
GET    /api/notifications/count
POST   /api/notifications/:id/read
POST   /api/notifications/read-all
DELETE /api/notifications/:id
GET    /api/notifications/preferences
PUT    /api/notifications/preferences
GET    /api/notifications/channels
POST   /api/notifications/channels
PUT    /api/notifications/channels/:id
DELETE /api/notifications/channels/:id
```

### 5.2 Endpoint Specifications

**`GET /api/notifications`**
```
Query params:
  page      int    default 1
  limit     int    default 20, max 100
  unread    bool   filter to unread only
  priority  string filter by priority level
  type      string filter by notification type

Response 200:
{
  "notifications": [
    {
      "id": "uuid",
      "type": "crystal.insight_ready",
      "priority": "info",
      "title": "Crystal analysis complete",
      "body": "Crystal analyzed 312 responses and found 4 key insights for Q4 NPS Survey.",
      "actionUrl": "/surveys/abc123/insights",
      "entityType": "survey",
      "entityId": "abc123",
      "metadata": {
        "crystalSummary": "Shipping delays emerged as the #1 driver of detractor scores.",
        "insightCount": 4
      },
      "readAt": null,
      "createdAt": "2026-06-03T09:14:22Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 47,
    "hasMore": true
  }
}
```

**`GET /api/notifications/count`**
```
Response 200:
{ "unread": 7, "critical": 1 }
```
This is the lightweight endpoint polled by the bell badge (or pushed via WebSocket).

**`POST /api/notifications/:id/read`**
```
Response 200: { "success": true, "readAt": "2026-06-03T..." }
```

**`POST /api/notifications/read-all`**
```
Body: { "before": "2026-06-03T..." }  // optional — mark all before timestamp
Response 200: { "updated": 12 }
```

**`PUT /api/notifications/preferences`**
```
Body:
{
  "preferences": [
    {
      "notificationType": "crystal.insight_ready",
      "inAppEnabled": true,
      "emailEnabled": true,
      "slackEnabled": false
    },
    {
      "notificationType": "score.nps_drop",
      "inAppEnabled": true,
      "emailEnabled": true,
      "thresholdConfig": { "minDrop": 5, "windowDays": 7 }
    }
  ]
}
Response 200: { "updated": 2 }
```

### 5.3 WebSocket Events

Socket.IO events (user authenticated and in room `user:{userId}`):

```
Server → Client:
  notification:new    { notification }       -- new notification arrived
  notification:count  { unread, critical }   -- unread count updated

Client → Server:
  notification:read   { notificationId }     -- mark as read (optimistic)
  notification:subscribe                     -- join personal room
```

### 5.4 Internal Event Publishing

From backend services (survey response handler, Crystal bridge, etc.):

```javascript
// lib/notification-publisher.js
async function publishNotificationEvent(event) {
  await redis.xadd(
    `notifications:events:${event.orgId}`,
    '*',  // auto-generated ID
    'type', event.type,
    'orgId', event.orgId,
    'actorId', event.actorId || '',
    'entityType', event.entityType || '',
    'entityId', event.entityId || '',
    'payload', JSON.stringify(event.payload),
    'priority', event.priority || 'info',
    'timestamp', Date.now().toString()
  );
}

// Usage in survey response handler:
await publishNotificationEvent({
  type: 'survey.milestone',
  orgId: survey.orgId,
  entityType: 'survey',
  entityId: survey.id,
  priority: 'info',
  payload: {
    surveyName: survey.name,
    milestone: 100,
    responseCount: 100
  }
});
```

---

## 6. Frontend UX Design

### 6.1 Notification Bell (Navbar)

```
┌──────────────────────────────────────────────────────────┐
│  Experient          Dashboard  Surveys  Crystal  Insights  🔔7  👤 │
└──────────────────────────────────────────────────────────┘
                                                     ↑
                                              Bell icon with
                                              unread badge (red dot
                                              for critical, blue for
                                              other unread)
```

- Badge shows count up to 99, then "99+"
- Badge color: red if any `critical` unread, otherwise blue
- Click bell → opens notification panel
- Bell has subtle pulse animation when new `critical` notification arrives

### 6.2 Notification Panel

```
┌────────────────────────────────────────┐
│ Notifications              [Mark all read] │
│                                        │
│ ● Today                                │
│ ┌──────────────────────────────────────┐
│ │ 🔴 NPS Alert — Critical      9:14am  │
│ │ NPS dropped 8 points vs last week.   │
│ │ Crystal: "Shipping delays are the    │
│ │ primary driver." → View Dashboard    │
│ └──────────────────────────────────────┘
│ ┌──────────────────────────────────────┐
│ │ 🤖 Crystal Analysis Ready   8:52am  │
│ │ Q4 Survey — 4 insights generated     │
│ │ for 312 responses. → View Insights   │
│ └──────────────────────────────────────┘
│ ┌──────────────────────────────────────┐ ← dimmed (read)
│ │ ✅ Survey Milestone          8:01am  │
│ │ "Customer Onboarding" reached 100    │
│ │ responses.                           │
│ └──────────────────────────────────────┘
│                                        │
│ ● Yesterday                            │
│ ┌──────────────────────────────────────┐ ← dimmed (read)
│ │ ⚠️  Response Rate Warning   4:22pm  │
│ │ "Q4 NPS" response rate is 14%.       │
│ │ Target: 25%. → View Survey           │
│ └──────────────────────────────────────┘
│                                        │
│           [Load more]                  │
└────────────────────────────────────────┘
```

**Panel behavior:**
- 400px wide, slides in from right side of navbar
- Click outside to dismiss
- Infinite scroll (load 20 at a time)
- Click notification → navigate to `actionUrl`, mark as read
- Hover notification → shows "Dismiss" (×) button
- Unread items: white background, left blue border, bold title
- Read items: gray background, normal weight
- Date grouping: Today, Yesterday, This Week, Older

### 6.3 Notification Item States

```
UNREAD:
┌────────────────────────────────────────────┐
│◂ 🔴 [ICON]  Title text — bold             [×]│
│   Body text describing the event              │
│   → Action link          timestamp            │
└────────────────────────────────────────────┘
 ↑ Blue left border

READ:
┌────────────────────────────────────────────┐
│  ⚠️  [ICON]  Title text — normal          [×]│
│   Body text (gray)                            │
│   → Action link          timestamp (gray)     │
└────────────────────────────────────────────┘
 ↑ No border, gray background
```

### 6.4 Notification Icons by Type

| Type pattern | Icon | Color |
|--------------|------|-------|
| `score.nps_drop` / `score.*_drop` | 📉 TrendingDown | Red |
| `score.*_rise` | 📈 TrendingUp | Green |
| `crystal.*` | 🤖 Sparkles | Purple |
| `survey.milestone` | 🎯 Target | Blue |
| `survey.expiring*` | ⏰ Clock | Orange |
| `survey.response_rate_low` | ⚠️ AlertTriangle | Orange |
| `system.*_error` | 🔴 AlertCircle | Red |
| `team.*` | 👥 Users | Blue |
| `export.*` / `report.*` | 📄 FileText | Gray |
| `alert.fired` | 🚨 Bell | (alert severity color) |

### 6.5 Toast Notifications (Real-time)

When a new notification arrives via WebSocket while panel is closed:

```
                                    ┌─────────────────────────────┐
                                    │ 🔴 NPS Alert                │
                                    │ NPS dropped 8 points.       │
                                    │ View Dashboard →             │
                                    └─────────────────────────────┘
                                           ↑ Top-right corner
                                           Auto-dismiss: 5s (critical: 8s)
                                           Click to navigate + mark read
```

- Toast stack: max 3 at a time, oldest dismissed first
- Critical toasts: persist until clicked
- Sound: optional (user preference), subtle chime for critical

### 6.6 Preferences Settings Page

```
┌─────────────────────────────────────────────────────────────┐
│ Settings > Notifications                                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ SCORE & PERFORMANCE                                         │
│ ─────────────────────────────────────────────────────────── │
│ NPS Score Alerts          [In-app ✓] [Email ✓] [Slack  ]   │
│   Alert when NPS drops by more than  [5 ▾] points          │
│   over a window of  [7 days ▾]                             │
│                                                             │
│ CRYSTAL AI                                                  │
│ ─────────────────────────────────────────────────────────── │
│ Insight generated         [In-app ✓] [Email  ] [Slack  ]   │
│ New topic detected        [In-app ✓] [Email  ] [Slack  ]   │
│ Anomaly detected          [In-app ✓] [Email ✓] [Slack  ]   │
│ Weekly digest             [In-app ✓] [Email ✓] [Slack  ]   │
│                                                             │
│ SURVEYS                                                     │
│ ─────────────────────────────────────────────────────────── │
│ Response milestones       [In-app ✓] [Email  ] [Slack  ]   │
│   Notify at:  [25] [50] [100] [500] [1000] responses       │
│ Survey expiring           [In-app ✓] [Email ✓] [Slack  ]   │
│ Response rate warning     [In-app ✓] [Email  ] [Slack  ]   │
│                                                             │
│ QUIET HOURS                                                 │
│ ─────────────────────────────────────────────────────────── │
│ Suppress non-critical from  [10:00 PM ▾] to [7:00 AM ▾]   │
│ Timezone: [America/New_York ▾]                              │
│                                                             │
│                                        [Save preferences]   │
└─────────────────────────────────────────────────────────────┘
```

---

## 7. Crystal AI Integration

### 7.1 Crystal-Triggered Notifications

CrystalOS publishes events to the notification bus when AI pipeline completes:

```python
# crystalos/lib/notification_bridge.py
import redis.asyncio as redis

async def notify_insight_complete(org_id: str, survey_id: str, insight_ids: list, summary: str):
    """Called by Crystal agents when insight generation completes."""
    await redis_client.xadd(
        f"notifications:events:{org_id}",
        {
            "type": "crystal.insight_ready",
            "orgId": org_id,
            "entityType": "survey",
            "entityId": survey_id,
            "priority": "info",
            "payload": json.dumps({
                "insightCount": len(insight_ids),
                "crystalSummary": summary,  # Crystal's own summary of what it found
                "insightIds": insight_ids
            })
        }
    )
```

### 7.2 Crystal Notification Narration

Every notification that Crystal knows about gets a `crystalSummary` field — a 1-2 sentence explanation in plain English, generated by Crystal at the time of event:

- **NPS drop**: *"This week's NPS decline from 42 to 34 is driven by a 3x surge in verbatims mentioning 'shipping delays' — up from 8% to 24% of all responses."*
- **New topic**: *"Crystal detected an emerging topic: 'app crash on checkout'. First appeared Tuesday, now in 12% of responses — tracking upward."*
- **Anomaly**: *"Monday's response volume spiked 4x above baseline. Correlates with a promotional email sent that morning — likely a positive acquisition event."*

This makes Experient's notifications dramatically more actionable than competitors. Users don't just see "NPS dropped" — they see why.

### 7.3 Smart Notification Suppression

Crystal computes a `relevance_score` for each potential notification:
- Factored by: recency, magnitude of change, user's historical engagement with this survey
- If relevance < 0.4: suppress and queue into digest instead
- If user already has 3 unread `info` notifications from same survey: suppress new `info`
- Never suppress `critical` priority

### 7.4 Crystal Weekly Digest Generation

Every Friday at 5pm (user timezone), Crystal generates a weekly intelligence summary:
1. Collects all events from the past 7 days for the org
2. Identifies the top 3 most significant moments (by magnitude + impact)
3. Generates a 200-word narrative summary
4. Adds 3-5 bullet points for key metrics
5. Surfaces as a `crystal.digest_ready` notification + (v1.5) email

---

## 8. Delivery Channels & Roadmap

### v1 — In-App (Now)
- Notification center panel in navbar
- Real-time WebSocket delivery via Socket.IO
- Unread badge count
- Toast for real-time arrivals

### v1.5 — Email Digest (Sprint 5-6)
- Daily digest: "What happened today" email at 8am
- Weekly digest: "Crystal's week in review" every Monday
- Template: HTML email with Crystal summary + top notifications
- Unsubscribe per digest type
- SendGrid integration

### v2 — Slack (Sprint 7-8)
- Per-channel webhook or Slack app
- Users configure which notification types go to Slack
- Crystal narration included in Slack messages
- Formatted with Slack Block Kit (rich cards)

### v3 — Webhooks & Integrations (Sprint 9+)
- Generic webhook: POST JSON to any URL on notification events
- PagerDuty: escalate `critical` notifications
- Microsoft Teams
- Mobile push (React Native if app goes mobile)

---

## 9. Docker Integration

The existing `docker-compose.yml` already includes Redis (if present) or needs it added. No new containers required for v1 — notification processing runs inside the existing Node.js backend process.

### 9.1 Redis Streams Channel Naming

```
notifications:events:{orgId}    -- event ingestion stream (per org)
notifications:live:{userId}     -- pub/sub for WebSocket fanout (per user)
notifications:dedup:{key}       -- deduplication TTL keys
```

### 9.2 Docker Compose Addition (if Redis not present)

```yaml
  redis:
    <<: *built-platform
    image: redis:7-alpine
    container_name: experient-redis
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes --maxmemory 512mb --maxmemory-policy allkeys-lru
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5
    restart: unless-stopped

volumes:
  redis_data:
```

### 9.3 Environment Variables

```env
REDIS_URL=redis://localhost:6379
NOTIFICATION_STREAM_MAXLEN=10000     # max events per stream before trimming
NOTIFICATION_DEDUP_TTL_INFO=3600     # 1 hour dedup for info
NOTIFICATION_DEDUP_TTL_CRITICAL=86400 # 24 hour dedup for critical
NOTIFICATION_WORKER_CONCURRENCY=5    # parallel stream consumer threads
```

---

## 10. Scalability & Fault Tolerance

### 10.1 Redis Streams vs Pub/Sub — Decision

**Chosen: Redis Streams** for event ingestion (producer → processor).
**Redis Pub/Sub** for WebSocket fanout (processor → gateway).

**Why Streams for ingestion:**
- Persistent (messages survive processor restart)
- Consumer groups guarantee at-least-once delivery
- Audit trail of all events
- Backpressure handling (processor falls behind → events queue up, not dropped)

**Why Pub/Sub for WebSocket fanout:**
- Ephemeral is fine (WebSocket clients reconnect and fetch via REST if missed)
- Lower latency
- Simpler fan-out to multiple gateway instances

### 10.2 Failure Modes & Mitigations

| Failure | Impact | Mitigation |
|---------|--------|------------|
| Processor crashes | Notifications delayed, not lost | Consumer group XPENDING + redelivery after 30s |
| Redis down | No real-time delivery | Degraded mode: notifications stored to Postgres, client polls every 30s |
| WebSocket gateway crash | User loses live connection | Client reconnects, fetches missed notifications via REST on reconnect |
| Postgres write fails | Notification lost | Retry 3x with exponential backoff; if all fail: log to Loki for manual recovery |

### 10.3 Circuit Breaker

```javascript
// lib/notification-circuit-breaker.js
const breaker = new CircuitBreaker(deliverNotification, {
  timeout: 5000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000
});

// If external delivery (email/Slack) is down, open circuit
// In-app delivery continues unaffected (different code path)
```

### 10.4 Rate Limiting

Per user per hour:
- `critical`: no limit
- `warning`: max 20/hour (then digest)
- `info`: max 10/hour (then digest)
- `success`: max 5/hour (then suppress)

Per org per hour: max 500 notifications across all users (prevents runaway event loops).

### 10.5 Scale Projections

| Scale | Strategy |
|-------|----------|
| 1-1K users | Single processor, single Redis instance |
| 1K-50K users | Multiple processor instances in consumer group (Redis handles coordination) |
| 50K-500K users | Per-org Redis streams sharded across Redis cluster; horizontal processor scaling |
| 500K+ users | Event streaming to Kafka; processor as dedicated microservice; fan-out with worker pool |

---

## 11. Implementation Roadmap

### Phase 1 — Core In-App Notifications (Sprint 1-2, ~2 weeks)
- [ ] Postgres schema: `notifications`, `notification_preferences`, `notification_dedup`
- [ ] Redis Streams event bus setup
- [ ] Notification processor worker (Node.js)
- [ ] REST API: GET/POST/DELETE notifications, GET count
- [ ] Frontend: bell icon + panel component
- [ ] 5 initial notification types: `survey.milestone`, `survey.expiring_soon`, `crystal.insight_ready`, `score.nps_drop`, `survey.response_rate_low`

### Phase 2 — Real-Time WebSocket Delivery (Sprint 3-4, ~2 weeks)
- [ ] Socket.IO integration in backend
- [ ] Real-time delivery to WebSocket gateway
- [ ] Toast component in React
- [ ] Unread badge with live count
- [ ] All remaining notification types (full taxonomy from Section 2)
- [ ] Crystal narration integration (`crystalSummary` in payload)

### Phase 3 — Preferences + Digest Engine (Sprint 5-6, ~2 weeks)
- [ ] Notification preferences UI
- [ ] Per-type channel preferences (in-app / email / Slack)
- [ ] Threshold configuration (NPS drop amount, window)
- [ ] Daily/weekly digest scheduler (Bull queue)
- [ ] Email digest template (SendGrid)

### Phase 4 — Slack + Webhook (Sprint 7-8, ~2 weeks)
- [ ] Slack workspace connection (OAuth)
- [ ] Channel configuration per notification type
- [ ] Generic webhook connector
- [ ] Notification channel config admin UI

### Phase 5 — Advanced Intelligence (Sprint 9+)
- [ ] Crystal relevance scoring for smart suppression
- [ ] Crystal weekly digest narrative generation
- [ ] PagerDuty escalation for critical
- [ ] Mobile push notifications (if mobile app in scope)

---

## 12. Success Metrics

### Delivery SLOs
- P95 time from event to in-app notification: < 2 seconds
- P99 notification delivery latency: < 10 seconds
- Notification delivery success rate: > 99.9%

### Engagement Targets (30 days post-launch)
- Notification open rate (click-through): > 35% (industry: 15-25%)
- Users with at least 1 preference configured: > 60%
- DAU lift attributable to notification-driven re-engagement: +20%

### Quality Targets
- Notification-to-false-positive rate (notifications users immediately dismiss): < 15%
- User notification preference opt-out rate: < 10%
- Zero `critical` notification duplicates in 30-day window

### Business Impact
- Reduction in time-to-action from CX event to first user response: target -60%
- NPS of the notification feature itself (in quarterly user survey): target > 50

---

*Document prepared by the Notification Service cross-functional team — Experient Platform Design Series, June 2026.*
