# Credit System — Implementation Status

**Status:** Built end-to-end and tested (65 tests passing). Ships disabled-by-default behaviour
that is safe in dev (no Clerk = dev-org gets a free account auto-created on first touch).

This documents what was implemented against the design in `CREDIT_SYSTEM.md`,
`METERING_AND_USAGE.md`, and `PRICING_PROPOSAL.md`.

---

## What was built

### Database
- `supabase/migrations/20260625000001_credit_system.sql` — `credit_accounts` (live balance per org)
  + `credit_ledger` (append-only audit) + `updated_at` trigger. **Run this migration before use.**

### Backend (`backend/src`)
| File | Role |
|---|---|
| `lib/creditPlans.ts` | Config: plan allowances + per-action credit costs (all env-overridable) |
| `lib/creditLedger.ts` | Core: atomic `debitCredits` (`SELECT … FOR UPDATE`), `checkCredits`, `grantCredits`, `setPlan`, `setOverage`, lazy monthly reset, usage/ledger queries |
| `lib/payments.ts` | Payment seam: credit-pack catalog, lazy Stripe, `fulfillPurchase`, webhook parse |
| `routes/billing.ts` | `/api/billing/*` — balance, config, usage, ledger, spend-cap, plan, grant, packs, checkout |
| `routes/internal-metering.ts` | `/api/internal/metering/*` — the ledger as a service (X-Internal-Key) |
| `middleware/internalKey.ts` | Constant-time X-Internal-Key gate for service-to-service calls |
| `routes/webhooks/stripe.ts` | Raw-body Stripe webhook → grants credits on `checkout.session.completed` |
| `schemas/billing.ts` | Zod validation for plan/spend-cap/grant/checkout |

**Metering hooks** (check before, debit after success):
- Insight generation — `routes/insights.ts` `POST /:surveyId/generate` (user-initiated triggers only; `stream`/`schedule` auto-runs are bundled/free)
- Crystal turn — all three paths: `routes/insights.ts` REST `/crystal`, `routes/experience.ts` SSE `/:scope/crystal/stream`, and the non-stream `crystalHandler`
- Broadcasts — `routes/outreach.ts` `POST /broadcasts/:id/send` debits per delivered recipient per channel (email 2cr, sms 8cr); pass-through/best-effort (an already-sent broadcast is never clawed back)
- Copilot survey authoring is **not** metered (bundled, by design)

### Frontend (`app/src`)
| File | Role |
|---|---|
| `lib/api.ts` | `getCredits`, `getCreditConfig`, `getCreditUsage`, `getCreditLedger`, `setSpendCap`, `setPlan`, `grantCredits`, `getCreditPacks`, `startCheckout` + types |
| `hooks/useCredits.ts` | Live balance/config; refetches on `'credits'` DataBus invalidation |
| `components/TopBar.tsx` | Credits chip + sheet wired to live balance + cost table; links to Billing |
| `pages/BillingPage.tsx` | **Billing + upgrade/marketing screen**: balance, plan cards (upgrade), credit packs (buy), spend-cap toggle, usage breakdown, ledger, marketing hero |
| `components/CrystalPanel.tsx` | 402 "out of credits" → upgrade prompt; `invalidate('credits')` after each turn |
| `constants/routes.ts`, `App.tsx`, `components/SideNav.tsx`, `locales/en.ts` | Route, nav entry, strings |

---

## Configuration (env)

All optional — sensible defaults match the docs.

```
# Allowances (credits/month)
CREDIT_ALLOWANCE_STARTER=1500
CREDIT_ALLOWANCE_GROWTH=12000
CREDIT_ALLOWANCE_ENTERPRISE=80000
CREDIT_FREE_LIFETIME_GRANT=225

# Per-action costs (credits)
CREDIT_COST_INSIGHT_RUN=50
CREDIT_COST_CRYSTAL_TURN=15
CREDIT_COST_XO_FUSION=200
CREDIT_COST_BROADCAST_EMAIL=2
CREDIT_COST_BROADCAST_SMS=8

CREDIT_PERIOD_DAYS=30
CREDIT_DEFAULT_PLAN=free        # plan for new orgs with no profile; set 'enterprise' in dev to avoid the free cap

# Payments (Stripe) — optional; manual grants work without these
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
APP_URL=https://app.experient...   # for checkout success/cancel redirects
```

---

## Enabling Stripe (when ready)

1. `cd backend && npm i stripe`
2. Set `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`.
3. Point a Stripe webhook at `POST /webhooks/stripe` (event: `checkout.session.completed`).
4. Done — `/api/billing/checkout` returns a live Checkout URL; the webhook grants credits on payment.

Until then: `POST /api/billing/grant` (billing:manage) is the manual top-up path, and `/checkout` returns `501 PAYMENTS_NOT_CONFIGURED`.

---

## Metering as a service (for CrystalOS / future services)

The ledger is callable over HTTP with the shared internal key — no separate deployable, but
liftable into one later with zero call-site changes:

```
POST /api/internal/metering/check   { org_id, action }            → { ok, available, required }
POST /api/internal/metering/debit   { org_id, action, ref?, ... } → balance | 402
GET  /api/internal/metering/balance/:orgId                        → balance
Header: X-Internal-Key: <AGENTS_INTERNAL_KEY>
```

`action` ∈ `insight_run | crystal_turn | xo_fusion | broadcast_email | broadcast_sms` (or pass explicit `credits`).

---

## Tests (65 passing)

Backend (`nvm use 22 && npx vitest run`):
- `creditLedger.test.js` (12) — consumption order, overage/ceiling, checks, grants, plan changes
- `billing.test.js` (12) — route wiring, permission gating, validation, error mapping
- `internalMetering.test.js` (6) — key gating, action→cost, 402 mapping
- `payments.test.js` (5) — catalog, not-configured guard, fulfilment
- `cxCases.test.js` (25) — includes the case-provenance regression

Frontend (`nvm use 20 && npx vitest run`):
- `pages/BillingPage.test.tsx` (5) — balance, plans, spend cap, packs/checkout

---

## Audit fixes (post-build hardening)

- **Concurrent first-touch double-grant** — `getOrCreateAccount` switched from `ON CONFLICT DO UPDATE
  … RETURNING` (which returns a row to *both* racers) to `ON CONFLICT DO NOTHING … RETURNING` +
  re-select, so only the creating request writes the free-tier grant ledger entry.
- **Stripe webhook idempotency** — `fulfillPurchase` now checks `grantExists(org, paymentRef)` before
  granting, so a duplicate `checkout.session.completed` event can't double-credit.
- **Configurable default plan** — `CREDIT_DEFAULT_PLAN` (default `free`) for orgs with no profile.
- **Broadcast metering** — wired into the send path (was a documented-but-unwired gap).
- **Test isolation** — credit test files that mock `creditLedger` now clean up the shared require
  cache (`afterAll`) so they don't leak into route tests that use the real module.

## Known follow-ups (not blocking)

- **Insight-run debit timing:** debited at successful enqueue (not pipeline completion). A
  CrystalOS→backend completion callback would make it exact; current approach is pre-checked
  and safe (only a rare concurrent race logs a warning).
- **XO-Fusion charged as a Crystal turn (15cr), not 200cr:** XO-Fusion runs *inside* a Crystal turn
  (the `xo-fusion-advisor` skill), and metering happens in the backend before the routed skill is
  known. Charging the 200cr premium needs the CrystalOS response to report the skill used, then a
  differential debit. Cost constant exists; differential charging is not yet wired.
- **Cost-Down Dividend** (auto allowance increases as COGS/credit falls) is designed in the docs;
  the COGS feed exists (CrystalOS `ai_operation_logs`) but the periodic policy job is not yet wired.

## Pre-existing issues found during audit (NOT part of the credit system)

- `copilot.test.js`, `members.test.js`, `users.test.js` — 4 tests fail because they set `SKIP_AUTH=true`
  while the prior-session auth refactor switched the code to `DEV_MODE` (no `CLERK_SECRET_KEY`). These
  tests are stale against that refactor and reproduce independently of any credit code. They should be
  updated to the `DEV_MODE` model (separate from this work).
- `CrystalPanel.test.tsx` — pre-existing failures from the earlier panel rewrite; unrelated to credits.
