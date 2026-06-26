# Testing the Credit System + Stripe (dev / staging / prod)

How to test Experient's credit system locally, how to wire Stripe across three
environments, and how the industry tests usage/credit pricing. Companion to
`docs/pricing/IMPLEMENTATION.md`.

---

## Part 1 — Local testing (no Stripe required)

The credit system runs **fully without Stripe**. Stripe is only the money rail for
buying credit packs; the ledger, metering, spend caps, plans, and manual grants all work
locally on their own.

### 1.1 Apply the migration

Migrations are incremental and tracked in `schema_migrations`; the new file is picked up
automatically:

```bash
# from repo root (Docker Postgres must be up)
npm run migrate            # runs scripts/migrate.js → applies supabase/migrations/*.sql in order
# verify
psql postgresql://postgres:postgres@localhost:5432/experient -c "\d credit_accounts" -c "\d credit_ledger"
```

### 1.2 Dev config (`backend/.env`)

```
# Avoid hitting the free lifetime cap (225 cr) while developing:
CREDIT_DEFAULT_PLAN=enterprise        # new dev-org gets 80,000 cr/mo

# (optional) shorten the period to test monthly reset quickly — see 1.6
# CREDIT_PERIOD_DAYS=30
```

In dev mode (no `CLERK_SECRET_KEY`) every request is `dev-user` / `dev-org`, so the account
auto-creates on first touch. No Stripe vars needed for Part 1.

### 1.3 Start the stack

```bash
npm run dev            # docker up + migrate + backend(:3001) + app(:5173) + crystalos(:8001)
```

### 1.4 Exercise the API (curl)

```bash
B=http://localhost:3001/api/billing

curl $B/config        | jq        # cost table, allowances, prices
curl $B/credits       | jq        # live balance (auto-creates the account)

# Manual top-up (stand-in for a purchase) — billing:manage
curl -XPOST $B/grant -H 'content-type: application/json' -d '{"credits":1000,"note":"dev top-up"}' | jq

# Spend cap: turn overage ON up to 5,000 cr
curl -XPUT $B/spend-cap -H 'content-type: application/json' -d '{"overage_enabled":true,"overage_ceiling":5000}' | jq

# Change plan (resets allowance to the new tier)
curl -XPOST $B/plan -H 'content-type: application/json' -d '{"plan_tier":"growth"}' | jq

# Usage + ledger
curl "$B/usage" | jq
curl "$B/ledger?limit=10" | jq
```

### 1.5 Exercise metering end-to-end (the real value)

1. Open the app (`:5173`) → the **credits chip** (top-right) shows your balance.
2. Ask **Crystal** a question → after the answer, the chip drops by **15** (a Crystal turn).
3. **Generate insights** on a survey → drops by **50**.
4. Drain the balance (set plan to `free`, or grant a tiny amount, then keep asking) → Crystal
   shows the **"out of credits → upgrade"** message (the 402 paywall). The chip turns
   amber → red as it depletes.
5. Open **Settings → Billing & Credits** → balance, plan cards, packs, spend-cap toggle,
   usage breakdown, ledger all render live.
6. Re-grant credits → chip and page update (DataBus `invalidate('credits')`).

### 1.6 Test the monthly reset

The reset is lazy (fires on the next balance read after the period elapses). To test without
waiting 30 days, age the period in the DB:

```bash
psql $DATABASE_URL -c "UPDATE credit_accounts SET period_start = NOW() - INTERVAL '31 days' WHERE org_id='dev-org';"
curl http://localhost:3001/api/billing/credits | jq   # allowance_remaining is back to full; a 'allowance_reset' ledger row is written
```

### 1.7 Test the internal metering service (service-to-service)

```bash
KEY=dev-internal-key-change-in-prod   # = AGENTS_INTERNAL_KEY in dev
M=http://localhost:3001/api/internal/metering

curl -XPOST $M/check -H "X-Internal-Key: $KEY" -H 'content-type: application/json' \
  -d '{"org_id":"dev-org","action":"crystal_turn"}' | jq
curl -XPOST $M/debit -H "X-Internal-Key: $KEY" -H 'content-type: application/json' \
  -d '{"org_id":"dev-org","action":"insight_run","ref":"manual-test"}' | jq
curl $M/balance/dev-org -H "X-Internal-Key: $KEY" | jq
# wrong/no key → 401
curl -XPOST $M/check -H 'content-type: application/json' -d '{"org_id":"dev-org","action":"crystal_turn"}' -w '%{http_code}\n'
```

### 1.8 Automated tests

```bash
cd backend && nvm use 22 && npx vitest run src/__tests__/creditLedger.test.js src/__tests__/billing.test.js src/__tests__/internalMetering.test.js src/__tests__/payments.test.js
cd app && nvm use 20 && npx vitest run src/__tests__/pages/BillingPage.test.tsx
```

---

## Part 2 — Stripe across dev / staging / production

### 2.1 What Stripe does (and doesn't) here

- **Does:** one-time **credit-pack purchases** via Checkout (`mode: 'payment'`). On payment
  success, the webhook grants credits.
- **Doesn't (today):** plan subscriptions. Plan tiers are managed **internally** (`/plan`), so
  there are **no Stripe subscriptions, no proration, no test clocks** to worry about yet. (If we
  later move plan billing to Stripe subscriptions, Part 3's test-clock guidance applies.)

Implication: setup is simple — no per-environment Stripe Price IDs to sync, because Checkout uses
inline `price_data` from `CREDIT_PACKS`.

### 2.2 The one rule: Test mode for dev+staging, Live mode for prod

Stripe gives every account two parallel worlds with **separate keys, data, and webhooks**:

| Env | Stripe mode | Secret key | Webhook secret | Cards |
|---|---|---|---|---|
| **dev (local)** | Test | `sk_test_…` | from Stripe CLI (`whsec_…`) | test cards (4242…) |
| **staging** | Test (ideally a separate **Sandbox**) | `sk_test_…` | from a Dashboard webhook → staging URL | test cards |
| **production** | Live | `sk_live_…` | from a Dashboard webhook → prod URL | real cards |

**Best practice — use Stripe Sandboxes** (Dashboard → sandbox switcher) to get *isolated* test
environments so dev and staging don't pollute each other's customers/payments. One Sandbox for
dev, one for staging; Live for prod. Each has its own keys + webhook endpoints.

Use **restricted API keys** (Dashboard → API keys → create restricted key) scoped to just
Checkout + Webhooks, rather than the full secret key, in staging/prod.

### 2.3 Per-environment env vars

These three are all the code needs (see `lib/payments.ts`, `routes/webhooks/stripe.ts`):

```
STRIPE_SECRET_KEY=sk_test_… | sk_live_…
STRIPE_WEBHOOK_SECRET=whsec_…
APP_URL=http://localhost:5173 | https://staging.experient… | https://app.experient…
```

Store them per environment — never in git:
- **dev:** `backend/.env` (gitignored)
- **staging/prod (Fly.io):** `fly secrets set STRIPE_SECRET_KEY=… STRIPE_WEBHOOK_SECRET=… APP_URL=… -a <app-name>`

Also install the SDK in the backend image: `cd backend && npm i stripe`. Until installed +
keys set, `/checkout` returns `501 PAYMENTS_NOT_CONFIGURED` and the manual `/grant` path is used.

### 2.4 Dev: Stripe CLI (local webhook forwarding)

Webhooks can't reach `localhost`, so forward them with the Stripe CLI:

```bash
brew install stripe/stripe-cli/stripe        # or scoop/apt
stripe login                                  # links to your account (pick the dev Sandbox)

# Forward Stripe events to the local backend; prints a whsec_… to use as STRIPE_WEBHOOK_SECRET
stripe listen --forward-to localhost:3001/webhooks/stripe
# → copy the "Signing secret (whsec_…)" into backend/.env, restart backend

# In another terminal, exercise the flow:
#  - in the app: Billing & Credits → Buy a pack → Stripe test checkout → card 4242 4242 4242 4242, any future expiry, any CVC
#  - or fire an event directly:
stripe trigger checkout.session.completed
```

After a successful test payment, confirm the grant landed:

```bash
curl http://localhost:3001/api/billing/ledger | jq '.entries[0]'   # action_type:"grant", source:"pack"
```

**Test cards:** `4242 4242 4242 4242` (success), `4000 0000 0000 0002` (decline),
`4000 0025 0000 3155` (requires 3DS auth). Full list: stripe.com/docs/testing.

### 2.5 Staging / production: Dashboard webhooks

For deployed environments the CLI isn't used — register a webhook endpoint in the Stripe
Dashboard (in the matching mode/Sandbox):

1. Dashboard → Developers → Webhooks → **Add endpoint**.
2. URL: `https://<staging-or-prod-host>/webhooks/stripe`.
3. Events: **`checkout.session.completed`** (the only one we handle).
4. Copy the endpoint's **Signing secret** → set as `STRIPE_WEBHOOK_SECRET` for that env.
5. Repeat separately for staging (Test/Sandbox) and prod (Live) — they have different secrets.

### 2.6 Mimicking the ENTIRE flow in staging (dummy cards)

Yes — staging uses Stripe **Test mode**, and **test cards exercise the complete, real flow**.
The code path is byte-for-byte identical to production; only the keys (test vs live) and the
card numbers differ. No real money moves, and test cards are the *only* cards that work in test
mode (real cards are rejected), so there's zero risk of a real charge.

End-to-end on staging:

1. App (staging) → **Billing & Credits → Buy** a pack → `POST /api/billing/checkout` creates a
   **real (test-mode) Checkout Session** and returns its URL.
2. Browser redirects to Stripe's **hosted checkout page** (real Stripe UI) → pay with
   `4242 4242 4242 4242`, any future expiry, any CVC, any ZIP.
3. Stripe fires a **real `checkout.session.completed` webhook** → staging `/webhooks/stripe` →
   signature verified → `fulfillPurchase` grants the pack credits.
4. Browser redirects back to `${APP_URL}/app/settings/billing?purchase=success`.
5. Balance + ledger update (a `grant` / `source:pack` entry appears).

You can mimic **every branch**, not just the happy path:

| Scenario | Test card / action | Expected |
|---|---|---|
| Successful purchase | `4242 4242 4242 4242` | webhook → credits granted, balance up |
| Card declined | `4000 0000 0000 0002` | no `session.completed`, **no** grant |
| Requires 3DS auth | `4000 0025 0000 3155` | 3DS challenge → on approve, granted |
| Insufficient funds | `4000 0000 0000 9995` | declined, no grant |
| Duplicate webhook (idempotency) | Dashboard → resend the event | **no** double-grant (`grantExists` guard) |
| Refund (optional) | refund the test payment in Dashboard | (we don't auto-claw-back credits — by design) |

Requirements for staging to receive the webhook: staging must be **publicly reachable** and have
a **Dashboard webhook endpoint** pointing at `https://<staging-host>/webhooks/stripe` (Test/Sandbox
mode) — see 2.5. (Locally you'd use the Stripe CLI instead — see 2.4.) Everything else is identical
to prod, which is exactly why staging is a faithful rehearsal.

### 2.7 Pre-launch checklist (prod)

- [ ] `npm i stripe` baked into the backend image
- [ ] Live `STRIPE_SECRET_KEY` + Live `STRIPE_WEBHOOK_SECRET` set via `fly secrets`
- [ ] Prod webhook endpoint registered (Live mode) → `checkout.session.completed`
- [ ] `APP_URL` = prod app URL (Checkout redirects)
- [ ] Idempotency verified (resend a webhook → no double grant; see 3.2)
- [ ] Reconciliation job/alert in place (see 3.3)
- [ ] A test purchase in Live mode with a real card, refunded, confirms end-to-end

---

## Part 3 — How the industry tests usage / credit pricing

Patterns used by Stripe-billing shops and usage-billing platforms (Metronome, Orb, Lago) and
AI companies (OpenAI/Anthropic-style metering):

### 3.1 Test mode + CLI replay (table stakes)
Stripe **Test mode** + **Stripe CLI** (`stripe listen`, `stripe trigger`, `stripe events resend`)
is the standard local loop. Sandboxes isolate parallel test environments. Never test against Live.

### 3.2 Idempotency / replay testing
Payment webhooks are **at-least-once** — they get redelivered. The industry standard is to make
fulfilment idempotent on a stable key and **test it by replaying the same event**:
```bash
stripe events resend <evt_id>      # or trigger the same event twice
```
We do this: `fulfillPurchase` checks `grantExists(org, paymentRef)` before granting. The test
`payments.test.js → "fulfilment is idempotent"` asserts a duplicate doesn't double-credit.

### 3.3 Reconciliation (the practice teams most often skip)
Run a periodic job that **reconciles the internal ledger against the payment provider**: sum of
Stripe payments vs sum of `grant` ledger entries per org; alert on drift. For consumption,
reconcile metered events (our `credit_ledger` debits) against the source-of-truth usage logs
(CrystalOS `ai_operation_logs`). Drift = a metering bug.

### 3.4 Shadow / dry-run metering before enforcing
Mature teams roll out metering in **log-only mode first**: meter and record, but don't block,
for a few weeks; compare projected charges against expectations; *then* flip enforcement on. This
catches over/under-charging before any customer is denied. (Recommended next step for us: a
`CREDIT_ENFORCE` flag that turns the 402 into a logged warning — ask me to add it.)

### 3.5 Concurrency / double-spend tests
Usage ledgers must not double-spend or go negative under concurrent calls. The standard test
fires N parallel debits at one account and asserts the final balance equals start − N×cost (no
lost updates). Our `debitCredits` uses `SELECT … FOR UPDATE`; the unit tests cover the
allowance→pack→overage math and the insufficient/ceiling paths.

### 3.6 Invariant / property testing
Assert invariants that must always hold:
- balance never drops below `−overage_ceiling` (or 0 when overage off),
- `Σ ledger.credits` reconciles with account balance changes,
- a metered action either fully debits or fully fails (no partial debit). Our debit is atomic in
  one transaction — partial debits are impossible by construction.

### 3.7 Time simulation (when subscriptions exist)
For *subscription / recurring* billing, Stripe **Test Clocks** fast-forward a customer through
renewals, trials, and proration without waiting real time. We don't need this yet (plans are
internal, packs are one-time), but it's the standard tool the day we move plan billing to Stripe.
Our internal monthly reset is tested by aging `period_start` (see 1.6) — the same idea, simpler.

### 3.8 Synthetic monitoring + alerts (prod)
Alert on: unexpected negative balances, spikes in `*_debit_failed` logs, webhook signature
failures, and reconciliation drift. Usage-billing platforms expose these as first-class
dashboards; we can emit Prometheus counters from the metering hooks for the same coverage.

### 3.9 Customer-facing controls are part of the test surface
Spend caps, usage alerts, and "what's my worst-case bill?" are tested as product features, not
just billing internals — because the #1 complaint about usage pricing (Intercom Fin, early Jasper)
is *surprise bills*. We test the spend-cap on/off and overage-ceiling paths directly.

---

## TL;DR

- **Local:** run the migration, set `CREDIT_DEFAULT_PLAN=enterprise`, `npm run dev`, and watch the
  chip move as you use Crystal/insights. No Stripe needed.
- **Stripe:** Test mode + Stripe CLI for dev, Test/Sandbox + Dashboard webhook for staging, Live +
  Dashboard webhook for prod — three sets of `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` /
  `APP_URL`, stored as Fly secrets, never in git. `npm i stripe` to activate.
- **Industry:** test-mode + CLI replay, idempotent fulfilment (we have it), reconciliation jobs,
  shadow/dry-run before enforcing, concurrency + invariant tests, and (for subscriptions) test clocks.
