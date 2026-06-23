# Dashboard — Design Documents

This directory contains the full design specification for the Experient Dashboard.

## Documents

- [DASHBOARD_DESIGN.md](./DASHBOARD_DESIGN.md) — Full design: 4 layouts, 25+ widgets, filtering, Crystal AI integration, competitive analysis, roadmap

## Summary

Experient's Dashboard is the first in the XM market to put AI narrative front-and-center — Crystal writes the story, charts provide the evidence.

**4 Dashboard layouts:**
- Executive Summary — Monday morning briefing, Crystal's 3-paragraph narrative
- Analyst — Deep analysis, segment comparison, statistical significance
- Operations — Survey health matrix, AI pipeline status, data freshness
- Insights — Crystal insight feed, action tracker, discovery timeline

**25+ widgets** including Crystal AI widgets: Narrative Card, Prediction Panel, Action Board, Anomaly Timeline, "What Changed."

**Key differentiators vs. Qualtrics/Medallia:**
- Crystal narrates every dashboard (unique)
- Predictive overlays on trend charts (unique)
- "Ask Crystal about this chart" on every widget (unique)
- Cross-survey correlation visible in one view (unique)
- Crystal Action Board: tells you *what to do*, not just what happened

**Stack:** React + Recharts + D3.js + Socket.IO (WebSocket) + Postgres materialized views
