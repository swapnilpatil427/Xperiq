# Notifications — Design Documents

This directory contains the full design specification for the Experient Notification Service.

## Documents

- [NOTIFICATION_SERVICE.md](./NOTIFICATION_SERVICE.md) — Full design: architecture, schema, API, UX, Crystal integration, scalability

## Summary

The Notification Service brings real-time intelligence delivery to Experient. Instead of users polling the dashboard, Experient proactively surfaces what matters — enriched with Crystal AI narration explaining *why* something happened.

**Key capabilities:**
- In-app notification center with unread badge
- Real-time WebSocket delivery (< 2s latency)
- Crystal-narrated notifications (AI-explained events)
- Smart suppression (relevance scoring, rate limits)
- Email digest (daily/weekly)
- Slack/Teams (roadmap)
- 25+ notification types across surveys, scores, Crystal AI, and operations

**Stack:** Redis Streams + Postgres + Socket.IO + React
