# End-to-End Test Guide — Uncommitted Changes

Test every uncommitted change as a real customer would, start to finish, plus the operational
verification (health, metrics, scheduler). Follow it top to bottom on a clean local environment.

## What you're testing (the uncommitted surface)

| Area | What changed |
|---|---|
| **Credits & Billing** | A full credit economy: balance, metered AI (insight runs, Crystal turns), spend caps, plans, credit packs, Stripe checkout, usage + ledger. New: `creditLedger`, `creditPlans`, `payments`, `billing` + `internal-metering` routes, Stripe webhook, `BillingPage`, `useCredits`, TopBar credits chip, 2 migrations. |
| **Crystal "Ticket"** | The Ticket button on a Crystal answer creates a CX case with full diagnostic provenance; the chat shows an upgrade paywall when out of credits. |
| **Scheduler service** | New deployable (`backend/src/scheduler`): owns `expire-stale-broadcasts`, ledger-integrity reconciliation, COGS/credit measurement, and credit-ledger partition maintenance — with leader election. |
| **Observability** | Credit + scheduler metrics, CrystalOS/node-exporter/cadvisor scrapes, Alertmanager, alert rules, deeper `/api/health`. |
| **CI hygiene** | 46 TS errors + 4 stale tests fixed — invisible to customers, but `tsc` + tests are now green. |

---

## 0. One-time setup (clean environment)

```bash
# 1. Infra (Postgres, Redis, Prometheus, Grafana, Alertmanager, node-exporter, cadvisor)
docker-compose up -d

# 2. Apply migrations — includes the 2 new credit migrations
npm run migrate
#    → 20260625000001_credit_system.sql        (credit_accounts + credit_ledger)
#    → 20260625000002_credit_ledger_partitioning.sql (monthly partitions + functions)

# 3. Verify the credit tables exist + ledger is partitioned
docker exec -i experient-postgres psql -U postgres -d experient -c "\dt credit_*" \
  -c "SELECT relname FROM pg_inherits i JOIN pg_class c ON c.oid=i.inhrelid JOIN pg_class p ON p.oid=i.inhparent WHERE p.relname='credit_ledger';"
#    → credit_accounts, credit_ledger; partitions credit_ledger_default + credit_ledger_YYYY_MM
```

**Dev credit posture — pick one (in `backend/.env`):**
- To test **the paywall** (recommended for a full journey): leave default → new org is **free** (225 lifetime credits ≈ 4 insight runs or 15 Crystal turns). You'll hit the wall and exercise upgrade/top-up.
- To test **freely without limits**: `CREDIT_DEFAULT_PLAN=enterprise` (80,000 credits/mo).

```bash
# 4. Start the app (backend :3001, web :5173, CrystalOS :8001)
npm run dev
# 5. (separate terminal) start the scheduler service
npm --prefix backend run start:scheduler        # :8090
```

Open `http://localhost:5173` — dev mode (no Clerk) signs you in as `dev-org` automatically.

---

## 1. The customer journey (UI, beginning to end)

### 1.1 See your credits
Top-right **credits chip** shows your live balance (e.g. `225 credits` on free). It turns amber
<30% and red <10%. Click it → a sheet shows the allowance bar, per-action costs (insight run 50,
Crystal answer 15, XO-Fusion 200), and **Manage plan & credits** → Billing page.

### 1.2 Build a survey (free — Copilot is bundled, not metered)
`/app/surveys` → Create → use the AI builder (Copilot). **Note the credits chip does NOT move** —
survey authoring is deliberately bundled. Add an NPS + an open-text question, publish.

### 1.3 Collect responses (free, bundled)
Open the share link in an incognito window, submit 3–5 responses (mix high + low NPS, some text).
Credits chip stays put — response collection is bundled.

### 1.4 Generate insights → **−50 credits**
`/app/insights` → **Generate Insights**. When it completes, the credits chip drops by **50**
(an insight run). Re-checking via API: `curl localhost:3001/api/billing/credits | jq .available`.

### 1.5 Ask Crystal → **−15 credits per answer**
Open Crystal (◆) → ask "Why are NPS scores low?". After the streamed answer, the chip drops by
**15**. Ask a few more and watch it tick down.

### 1.6 Create a ticket from an insight (provenance)
On a Crystal answer, click **Ticket**. A CX case is created and you'll see "Case created…".
Open `/app/cases` → the new case's description contains a **Diagnostic context** block (survey,
insight IDs, Crystal message id, scope, brand, org, user, timestamp). Confirm `survey_id` is set.

### 1.7 Run out → the paywall
Keep asking Crystal / generating insights until the balance can't cover the next action. Crystal
replies: **"You're out of AI credits. Open Billing & Credits… to upgrade or add a top-up."** No
crash, no silent failure. (API equivalent: a metered call returns `402 INSUFFICIENT_CREDITS`.)

### 1.8 Billing & Credits page
`/app/settings/billing` (or the chip's CTA). Verify:
- **Balance** card (available, allowance bar, reset date, top-up balance).
- **Spend cap** card — toggle **overage on**, set a ceiling, Save → ask Crystal again; it now
  proceeds past the allowance (up to the ceiling). Toggle back **off** → it pauses at the allowance.
- **Plans** — click **Upgrade** (e.g. Growth) → allowance resets to the new tier; chip jumps.
- **Credit packs** — click **Buy** → with Stripe configured, you're sent to Stripe Checkout
  (see §2); without Stripe, you get "online checkout isn't enabled yet."
- **Usage this period** + **Ledger** — show your insight-run / Crystal-turn / grant entries.

### 1.9 Admin top-up (works without Stripe)
```bash
curl -XPOST localhost:3001/api/billing/grant -H 'content-type: application/json' \
  -d '{"credits":5000,"note":"manual top-up"}' | jq
```
Refresh the page / chip — balance reflects +5000. Crystal works again.

---

## 2. Stripe purchase flow (test cards, end to end)

Full instructions in **`docs/test-plan/credit-system-and-stripe.md`**. Short version (local):
```bash
cd backend && npm i stripe                        # one-time
stripe login                                       # pick a test sandbox
stripe listen --forward-to localhost:3001/webhooks/stripe   # copy the whsec_… into backend/.env → STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET, restart backend
```
Then on the Billing page → **Buy** a pack → pay with `4242 4242 4242 4242` → the webhook grants the
credits → balance updates. Replay the event (`stripe events resend <id>`) → **no double-grant**
(idempotent). Decline card `4000 0000 0000 0002` → no grant.

---

## 3. Operational verification (health, metrics, scheduler — the "track health" goals)

### 3.1 Health endpoints
```bash
curl -s localhost:3001/api/health | jq        # { status:ok, db:ok, redis:ok|not_configured }
curl -s localhost:3001/api/health/live        # liveness (always ok if up)
curl -s localhost:8090/health | jq            # scheduler readiness
```

### 3.2 Scheduler is running its jobs
```bash
curl -s localhost:8090/metrics | grep -E "scheduler_heartbeat|scheduler_is_leader|scheduler_job_runs"
#   scheduler_is_leader 1, heartbeat recent, job_runs_total for expire-stale-broadcasts / reconciliation / cost-down / ledger-maintenance
```
Leadership: start a 2nd scheduler (`SCHEDULER_PORT=8091 npm --prefix backend run start:scheduler`)
→ exactly one reports `scheduler_is_leader 1`; kill the leader → the other takes over within a tick.

### 3.3 Metrics flowing into Prometheus / Grafana
- Prometheus `http://localhost:9090` → Status → Targets: `experient-api`, `crystalos`, `scheduler`,
  `node-exporter`, `cadvisor` all **UP**.
- Query `credit_consumed_total`, `credit_decisions_total`, `credit_invariant_violations`,
  `credit_cogs_per_credit_usd`, `scheduler_heartbeat_timestamp`.
- Grafana `http://localhost:3030` (anonymous viewer) → the Experient dashboard.
- Alertmanager `http://localhost:9093` → no firing alerts on a healthy stack.

### 3.4 Ledger partitioning + retention
```bash
docker exec -i experient-postgres psql -U postgres -d experient \
  -c "SELECT create_credit_ledger_partition((CURRENT_DATE + INTERVAL '3 months')::date);" \
  -c "SELECT drop_old_credit_ledger_partitions(18);"
# the daily credit-ledger-maintenance job does both automatically
```

### 3.5 Internal metering API (service-to-service)
```bash
KEY=dev-internal-key-change-in-prod
curl -s -XPOST localhost:3001/api/internal/metering/check \
  -H "X-Internal-Key: $KEY" -H 'content-type: application/json' \
  -d '{"org_id":"dev-org","action":"crystal_turn"}' | jq
# missing key → 401
```

---

## 4. Automated test suites (CI is green)

```bash
# Backend (Node 22) — 614 tests, 0 TS errors
cd backend && nvm use 22 && npx tsc --noEmit && npm test

# Frontend (Node 20)
cd app && nvm use 20 && npx tsc --noEmit && npx vitest run src/__tests__/pages/BillingPage.test.tsx

# CrystalOS (heartbeat metric only this round) — syntax + suite
cd crystalos && python -m py_compile lib/metrics.py scheduler.py
```

---

## 5. Pass criteria (the customer-visible contract)

- [ ] Survey authoring + response collection **never** consume credits.
- [ ] Insight run = −50, Crystal answer = −15; the chip updates live.
- [ ] Ticket button creates a CX case with a Diagnostic-context block + structured `survey_id`.
- [ ] Out of credits → clear in-chat upgrade paywall (HTTP 402), never a crash.
- [ ] Billing page: balance, plan change (allowance resets), spend-cap on/off, packs, usage, ledger all work.
- [ ] Manual grant and (if configured) Stripe checkout both top up the balance; Stripe replay doesn't double-grant.
- [ ] Scheduler shows a leader + recent heartbeat + job runs; Prometheus targets all UP.
- [ ] `tsc --noEmit` clean; `npm test` green (614 backend).
