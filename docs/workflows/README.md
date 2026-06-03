# Workflow System — Design Documents

This directory contains the full design specification for the Experient Workflow System.

## Documents

- [WORKFLOW_SYSTEM.md](./WORKFLOW_SYSTEM.md) — Full design: trigger/condition/action taxonomy, visual builder UX, backend engine, Crystal integration, 15 templates, competitive analysis

## Summary

The Workflow System turns Crystal's intelligence into operational reality. Every insight fires an action. Every alert closes a loop.

**Complete taxonomy:**
- **40+ Triggers**: Survey events, score changes, Crystal AI events, schedules, webhooks
- **25+ Conditions**: Score, text, segment, Crystal AI output, date/time
- **50+ Actions**: Notify, Crystal AI, data ops, integrations (Slack, Jira, Salesforce, webhooks)
- **Flow control**: If/Else, Parallel, Delay, Wait, Trigger chaining

**Key differentiator:** Crystal AI is a first-class workflow step — not just a trigger source:
- Crystal **analyzes** trigger data and produces structured output
- Crystal **writes** the Slack/email/Jira message content
- Crystal **classifies** severity and **routes** the workflow
- Crystal makes autonomous decisions about what happens next

**15 pre-built XM templates** including: NPS Recovery, Weekly Executive Digest, Verbatim Escalation, Detractor Follow-Up, Cross-Survey Correlation Alert.

**Integrations:** Slack, Email (SendGrid), Jira, Webhook, PagerDuty, Salesforce, Zapier, ServiceNow

**Stack:** Bull Queue + Redis + Postgres + CrystalOS workflow-action API + React Flow (canvas builder)
