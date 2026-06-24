# Alerts & Intelligence System — Design Documents

This directory contains the full design specification for the Experient Alerts & Intelligence System.

## Documents

- [ALERTS_SYSTEM.md](./ALERTS_SYSTEM.md) — Full design: 36 alert types, engine architecture, DB schema, API, Crystal integration, UX, competitive analysis

## Summary

The Alerts System transforms Experient from a passive data repository into an active intelligence partner that proactively surfaces what matters.

**36 alert types across 7 categories:**
- **Score** (S-01 to S-07): NPS drops/rises, CSAT, CES, segment divergence
- **Volume** (V-01 to V-06): Response rate, quota milestones, survey expiry
- **Topics** (T-01 to T-07): Emerging topics, sentiment shifts, verbatim escalation
- **Crystal AI** (AI-01 to AI-06): Anomalies, predictive alerts, cross-survey correlation
- **Operational** (O-01 to O-05): Pipeline failures, credit limits, exports
- **Benchmarking** (B-01 to B-03): Industry benchmark crossings
- **Compliance** (C-01 to C-02): PII detection, retention limits

**Key differentiator:** Crystal AI narrates every alert — not just "NPS dropped" but *why* it dropped, with verbatim evidence and recommended action. No competitor does this.

**Stack:** Redis Streams + Postgres + Crystal AI (3-layer anomaly detection: Z-score + PELT changepoint + LLM narration)
