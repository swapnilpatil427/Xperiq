# Platform Gap Tracker — Examples

## Example invocations

```
/platform-gap-tracker
```
Full scan of all open gaps against current codebase state. Updates MARKET_GAPS.md.

```
/platform-gap-tracker --gap GAP-011
```
Check a specific gap only (SMS distribution). Useful after a targeted feature sprint.

```
/platform-gap-tracker --since 2026-05-01
```
Only check gaps where migrations or routes were modified since this date.

## What a good run looks like

After a sprint that shipped the notification service real-time delivery:

```json
{
  "closed": [],
  "partially_closed": [
    {
      "gap_id": "GAP-related: Notification WebSocket",
      "what_exists": "Socket.IO installed in package.json, socket server initialized in backend/src/index.js, useSocket.ts hook created in app",
      "what_remains": "Event Engine (separate service) not yet deployed — notifications delivered via polling fallback only",
      "estimated_completion": "Next sprint"
    }
  ],
  "summary": "Sprint 1 notifications work is in progress. WebSocket infrastructure is in place but Event Engine service is not yet running. 26 of 26 strategic gaps remain open. Recommend GAP-006 (Web Intercept SDK) as next sprint given its high impact-to-effort ratio."
}
```

## What a bad run looks like (and why it fails eval)

```json
{
  "closed": [
    {
      "gap_id": "GAP-001",
      "evidence": "Found compliance-related comments in backend/src/middleware/auth.js",
      "notes": "Auth middleware handles access control which is part of SOC 2"
    }
  ]
}
```
**Fails because:** GAP-001 is SOC 2 Type II certification. No amount of code closes this gap — it requires an external auditor, a 6-month observation period, and a signed certification. Auth middleware is not evidence of SOC 2 compliance.
