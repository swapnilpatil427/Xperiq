# Experient — Complete Product & Go-to-Market Plan
# AI-Era Experience Management Platform

**Vision:** The world's first AI-native experience management platform — and the first to be fully agentic. Not a survey tool with AI bolted on. An intelligence layer that happens to collect feedback, packaged as four AI skills any agent can use. Beats Qualtrics, SurveyMonkey, Medallia, and InMoment by being 10× simpler, 100× cheaper, natively AI, and callable from anywhere.

**Status at plan creation:** 2026-05-07
**Updated:** 2026-05-11 — Agentic Skills direction added
**Target global launch:** Q1 2027
**Total sprints:** 22 × 2-week sprints = 44 weeks (Sprint 7A + 15A added)

---

## The Agentic Skills Strategy

Experient is not just a product you log in to. It is a **skill layer for AI agents**.

Every capability is packaged as one of four skills. These skills are callable from Claude, GPT, custom enterprise agents, Claude Code, and any MCP-compatible system. Internally, the same skills power the in-app Cmd+K interface. Externally, they become the go-to-market vector — teams already using AI adopt Experient by adding four tools to their agent config.

### The Four Experient Skills

| Skill | What any AI agent can do with it |
|---|---|
| **Survey Skill** | Create, edit, publish, pause, inspect a survey — entirely in natural language |
| **Distribution Skill** | Distribute via email/SMS/link/embed, check response status, send reminders |
| **Dashboard & Tools Skill** | Get insights, ask questions in plain English, generate reports, compare surveys, get NPS trend |
| **Workflow Skill** | Create automations from plain-English triggers + actions, list, pause/resume, test, view logs |

### PM-First Skill Design Principle

All four skills are designed by PMs before any code is written. Each PM spec answers:
1. What are the exactly 5 things this skill can do?
2. What is the minimum an AI needs to provide as input (everything else is inferred)?
3. What does the skill return — and how does the UI render it as an action card?
4. How many credits does each action cost?
5. What happens when the action fails — what does the AI hear?

**Gate rule:** No engineering starts on a skill until the PM spec is reviewed and signed off.

### Why This Wins GTM

- Qualtrics, Medallia, SurveyMonkey have no skills layer. Zero.
- Teams using Claude internally can add Experient in 30 seconds via MCP config.
- Demo is a 60-second video of Claude doing survey → distribute → insights → workflow with no UI.
- This becomes the hook for ProductHunt, HN, developer communities, and enterprise sales.
- It also future-proofs the product: as AI agents become the primary interface for enterprise software, Experient is already positioned as the intelligence skill, not an app that competes with agents.

---

## Why We Win the AI Race

| Dimension | Qualtrics | SurveyMonkey | Medallia | InMoment | **Experient** |
|---|---|---|---|---|---|
| Pricing model | Seat license ($$$) | Seat license ($$) | Enterprise contract | Enterprise contract | **Credits — pay per signal** |
| AI | Bolted-on, GPT wrapper | Basic, superficial | Heavy services model | Reports-based | **Native intelligence layer** |
| Time to first insight | Weeks (implementation) | Days | Months | Months | **< 5 minutes** |
| Self-serve | Partial | Yes | No | No | **Fully self-serve** |
| Natural language creation | No | No | No | No | **Everything in plain English** |
| Predictive | Limited | No | Some | Some | **Real-time predictive signals** |
| Onboarding | Sales-led | Self-serve | Sales-led | Sales-led | **AI-guided, instant** |
| Data residency | US/EU with contract | US | US/EU | US | **US/EU/APAC at tier** |
| Developer API | Limited | Limited | No | No | **First-class, documented** |
| Agentic / MCP skills | No | No | No | No | **Four native skills, MCP-published** |
| Callable from Claude/GPT | No | No | No | No | **Yes — 30-second setup** |

---

## Credit-Based Pricing Model

### How Credits Work
Credits are the universal currency. Every action consumes credits. No seat licenses. No per-survey limits. Pay for what you use.

### Credit Costs (production targets)
| Action | Credits |
|---|---|
| 1 response collected | 1 credit |
| AI survey generation (1 survey) | 10 credits |
| AI insight analysis run | 25 credits |
| AI topic reclustering | 15 credits |
| Export (PDF report) | 5 credits |
| Export (CSV/Excel) | 2 credits |
| Workflow trigger execution | 1 credit |
| API call (external) | 0.5 credits |
| Real-time alert | 0.5 credits |
| White-label report render | 10 credits |
| Translation (per language per survey) | 20 credits |
| Predictive NPS model run | 50 credits |
| Anomaly detection scan | 10 credits |

### Pricing Tiers

#### Free — $0/month
- 500 credits/month (resets)
- 1 workspace
- 3 active surveys
- 1 user
- Community support
- Experient branding on surveys
- Purpose: PLG top of funnel

#### Starter — $49/month
- 5,000 credits/month
- 1 workspace
- Unlimited surveys
- 3 users
- Email support (48h SLA)
- Custom survey branding
- CSV export
- Target: Individuals, startups

#### Growth — $199/month
- 25,000 credits/month
- 3 workspaces
- Unlimited surveys
- 15 users
- AI features fully enabled
- Slack + email integrations
- PDF reports
- Priority support (24h SLA)
- API access
- Target: Growing teams, SMB

#### Business — $599/month
- 100,000 credits/month
- Unlimited workspaces
- Unlimited users
- SSO (SAML/OIDC)
- Advanced RBAC
- Audit logs (90 days)
- Data residency (US or EU)
- Salesforce + HubSpot integration
- SLA: 99.9% uptime, 8h support
- Dedicated CSM (quarterly)
- Target: Mid-market, 50-500 person companies

#### Enterprise — Custom
- Unlimited credits (or large prepaid block)
- Multi-org hierarchy
- Custom data residency
- SCIM provisioning
- SOC 2 Type II report
- GDPR DPA
- Audit logs (1 year+)
- Custom AI model fine-tuning
- Dedicated infrastructure option
- 99.99% SLA
- Named CSM + TAM
- Custom integrations
- White-label option
- Procurement/PO billing
- Target: Fortune 1000, government

### Credit Add-Ons
- 1,000 credits: $12
- 10,000 credits: $99
- 100,000 credits: $799
- 1,000,000 credits: Custom

### Credit Management Features (must build)
- Real-time credit balance dashboard
- Credit consumption breakdown by feature/survey
- Low-balance alerts (configurable threshold)
- Auto-recharge option (buy credits when balance < X)
- Credit expiry: monthly credits expire, purchased credits never expire
- Admin can allocate credits to sub-teams
- Credit audit log (who used what, when)

---

## Sprint Plan

### Phase 0 — Foundation (Sprint 0, Weeks 1–2)
**Goal:** Stop technical debt from compounding. Establish quality baseline.

#### Tasks
- [ ] **P0-1** Fix Tailwind CSS v4 Vite plugin installation and verify all pages render correctly locally
- [ ] **P0-2** Set up TypeScript: add `tsconfig.json`, rename files incrementally (start with `src/lib/`, `src/constants/`, `src/hooks/`)
- [ ] **P0-3** Add Vitest + React Testing Library (`npm install -D vitest @testing-library/react @testing-library/user-event`)
- [ ] **P0-4** Add first 10 unit tests: `i18n.test.ts`, `routes.test.ts`, `thresholds.test.ts`, `useSurveys.test.ts` (mock Firebase)
- [ ] **P0-5** Set up Playwright for E2E: `npm install -D @playwright/test` — write smoke test for landing → sign-in → surveys list
- [ ] **P0-6** Set up GitHub Actions CI pipeline: lint + type-check + unit tests on every PR
- [ ] **P0-7** Set up error monitoring: integrate Sentry (frontend + backend) — free tier sufficient for now
- [ ] **P0-8** Add `ErrorBoundary` component wrapping each page in `App.jsx`
- [ ] **P0-9** Backend: add request validation middleware using `zod` on all POST/PUT routes
- [ ] **P0-10** Backend: add rate limiting middleware (`express-rate-limit`) — 100 req/min per IP on public routes, 1000 req/min per org on auth routes
- [ ] **P0-11** Backend: add request logging middleware (structured JSON logs → Cloud Logging)
- [ ] **P0-12** Remove `openrouter.js` client-side file from `app/src/lib/` — API key must only live in Cloud Functions

**Deliverable:** Clean foundation. CI green. No API key leaks.

---

### Phase 1 — Core Product Completion (Sprints 1–3, Weeks 3–8)

#### Sprint 1 — Org & Team Management (Weeks 3–4)

**Backend tasks:**
- [ ] **1-1** `POST /api/orgs` — create organization (called on first Clerk sign-in)
- [ ] **1-2** `GET /api/orgs/me` — get current org details
- [ ] **1-3** `PUT /api/orgs/me` — update org (name, logo URL, settings)
- [ ] **1-4** `GET /api/orgs/me/members` — list org members
- [ ] **1-5** `POST /api/orgs/me/invitations` — invite member by email (use Clerk Invitations API)
- [ ] **1-6** `DELETE /api/orgs/me/members/:userId` — remove member
- [ ] **1-7** `PUT /api/orgs/me/members/:userId/role` — update member role

**Frontend tasks:**
- [ ] **1-8** Wire `BrandSettingsPage` to real org API (`GET/PUT /api/orgs/me`)
- [ ] **1-9** Wire team table to real members API — invite user modal → Clerk invitation
- [ ] **1-10** `OnboardingPage` — wire to real Clerk org creation; show real workspaces from Clerk `getOrganizationList()`
- [ ] **1-11** Add org switcher to `SideNav` for multi-org users

**Tests:**
- [ ] **1-12** Unit tests for org API routes (mock Firestore)
- [ ] **1-13** E2E test: invite a member flow

---

#### Sprint 2 — RBAC & Permissions (Weeks 5–6)

**Roles:** Owner > Admin > Editor > Analyst > Viewer

| Permission | Owner | Admin | Editor | Analyst | Viewer |
|---|---|---|---|---|---|
| Create/delete surveys | ✅ | ✅ | ✅ | ❌ | ❌ |
| Edit surveys | ✅ | ✅ | ✅ | ❌ | ❌ |
| View responses | ✅ | ✅ | ✅ | ✅ | ✅ |
| Run AI analysis | ✅ | ✅ | ✅ | ✅ | ❌ |
| Export data | ✅ | ✅ | ✅ | ✅ | ❌ |
| Manage team | ✅ | ✅ | ❌ | ❌ | ❌ |
| Manage billing | ✅ | ❌ | ❌ | ❌ | ❌ |
| Create workflows | ✅ | ✅ | ✅ | ❌ | ❌ |
| View billing | ✅ | ✅ | ❌ | ❌ | ❌ |
| Delete org | ✅ | ❌ | ❌ | ❌ | ❌ |

- [ ] **2-1** Store roles in Clerk org membership metadata
- [ ] **2-2** Add `requireRole(minRole)` middleware to backend routes
- [ ] **2-3** Frontend: `usePermissions()` hook — returns boolean flags per action
- [ ] **2-4** All UI buttons/actions gated by `usePermissions()` — hide or disable based on role
- [ ] **2-5** Permission denied page/state component
- [ ] **2-6** Feature flags system: `src/lib/features.ts` — boolean flags per plan tier (e.g., `canUseSSO`, `canExportPDF`, `hasAdvancedAI`)
- [ ] **2-7** Plan enforcement: check plan tier before allowing credit-consuming actions; show upgrade modal if insufficient plan

---

#### Sprint 3 — Analytics & Dashboard Completion (Weeks 7–8)

- [ ] **3-1** Backend: `GET /api/surveys/:id/analytics` — return aggregated stats: total responses, completion rate, avg time, NPS distribution, response rate over time
- [ ] **3-2** Backend: `GET /api/orgs/me/analytics` — org-level rollup: all surveys, total responses, active surveys count, top performing survey
- [ ] **3-3** Wire `ResponseDashboardPage` to real analytics endpoint (replace hardcoded 84.6%, NPS 74, etc.)
- [ ] **3-4** Wire `InsightsDashboardPage` KPI cards (NPS, CSAT, sentiment bars) to real data
- [ ] **3-5** Wire `AdvancedInsightsPage` to real insights from `GET /api/surveys/:id/insights`
- [ ] **3-6** Add recharts time-series chart to `ResponseDashboardPage` — responses over time (already in dependencies)
- [ ] **3-7** Add response volume sparklines to `SurveysListPage` cards
- [ ] **3-8** Empty states for all pages (no surveys, no responses, no insights)
- [ ] **3-9** Tests: unit tests for analytics aggregation logic, E2E for dashboard load

---

### Phase 2 — AI Differentiation Engine (Sprints 4–7, Weeks 9–16)
**Goal:** Build the features that no competitor has. This is the moat.

#### Sprint 4 — AI Upgrade & Model Strategy (Weeks 9–10)

- [ ] **4-1** Switch OpenRouter model to `anthropic/claude-3.5-haiku` for production (better JSON reliability, faster) with `meta-llama/llama-3.1-8b-instruct:free` as free-tier fallback
- [ ] **4-2** Backend: add model selection logic based on org plan tier (free → Llama, paid → Claude Haiku, enterprise → Claude Sonnet)
- [ ] **4-3** Backend: AI request queue with retry logic — wrap all OpenRouter calls with exponential backoff, 3 retries
- [ ] **4-4** Backend: AI response caching — cache identical prompts in Firestore for 24h to reduce API costs
- [ ] **4-5** Frontend: AI Copilot panel in `SurveyBuilderPage` — real streaming responses (use SSE endpoint)
- [ ] **4-6** Backend: `POST /api/ai/improve-question` — take existing question, return improved version with explanation
- [ ] **4-7** Backend: `POST /api/ai/suggest-followup` — given a question type and response pattern, suggest a follow-up question
- [ ] **4-8** Backend: `POST /api/ai/translate-survey` — translate all question text to target language (consumes translation credits)

---

#### Sprint 5 — Predictive Intelligence (Weeks 11–12)

- [ ] **5-1** Backend: `POST /api/ai/predict-nps` — given current response velocity and sentiment trend, predict NPS at 100/500/1000 responses
- [ ] **5-2** Backend: `POST /api/ai/detect-anomalies` — compare current response batch to historical baseline, flag statistical anomalies
- [ ] **5-3** Backend: `GET /api/surveys/:id/trends` — response velocity over time, sentiment drift, NPS trend line
- [ ] **5-4** Frontend: Trend chart in `AdvancedInsightsPage` — NPS over time, sentiment drift visualization
- [ ] **5-5** Backend: `POST /api/ai/root-cause` — given a negative sentiment spike, identify probable root causes from open-text responses
- [ ] **5-6** Frontend: `InsightsDashboardPage` — "Signal Intelligence" panel showing predicted NPS + anomaly alerts
- [ ] **5-7** Backend: Firestore trigger — on each new insights document, evaluate workflow conditions and fire matching workflow actions

---

#### Sprint 6 — Natural Language Query Interface (Weeks 13–14)

This is the most differentiated feature. "Ask your data a question in plain English."

- [ ] **6-1** Backend: `POST /api/ai/query` — natural language question about survey data → structured answer with supporting quotes
  - Example: "Why are users unhappy with onboarding?" → paragraph + top 5 supporting responses
  - Example: "What changed between last month and this month?" → comparison analysis
  - Example: "Which customer segment has the highest churn risk?" → segmented breakdown
- [ ] **6-2** Frontend: `InsightsDashboardPage` — AI Query Bar (floating, Cmd+K accessible) — full-screen modal with chat-like interface
- [ ] **6-3** Backend: conversation history per query session (context-aware follow-up questions)
- [ ] **6-4** Frontend: Query history — last 10 queries with answers, shareable link per query
- [ ] **6-5** Backend: `POST /api/ai/executive-summary` — generate a one-page board-ready summary: key findings, recommended actions, risk areas
- [ ] **6-6** Frontend: Executive Summary modal in `ResponseDashboardPage` with PDF export

---

#### Sprint 7 — Smart Collection & Adaptive Surveys (Weeks 15–16)

- [ ] **7-1** Backend: `POST /api/surveys/:id/logic` — save conditional branching logic (show Q3 only if Q1 answer is X)
- [ ] **7-2** Frontend: `SurveyBuilderPage` — visual branching logic builder (drag + condition picker)
- [ ] **7-3** Frontend: `SurveyFillPage` — evaluate branching logic client-side, skip hidden questions
- [ ] **7-4** Backend: `POST /api/ai/adaptive-questions` — given previous answers in a session, suggest the most valuable next question dynamically (real-time adaptive survey)
- [ ] **7-5** Frontend: `SurveyFillPage` — adaptive mode toggle: AI selects next question in real-time based on previous answers
- [ ] **7-6** Backend: question piping — reference previous answers in subsequent question text (`{{Q1_answer}}` syntax)
- [ ] **7-7** Frontend: `SurveyBuilderPage` — piping token picker
- [ ] **7-8** Backend: survey quotas — stop collection when N responses reached per segment
- [ ] **7-9** Backend: response deduplication — fingerprint respondents by browser/IP to prevent duplicate submissions (configurable)

---

### Phase 3 — Billing & Credit System (Sprints 8–9, Weeks 17–20)

#### Sprint 8 — Stripe Integration & Credit Engine (Weeks 17–18)

- [ ] **8-1** Create Stripe account, configure products and prices for all 4 tiers + credit add-on packages
- [ ] **8-2** Backend: `POST /api/billing/checkout` — create Stripe Checkout session for plan upgrade or credit purchase
- [ ] **8-3** Backend: `POST /api/billing/portal` — create Stripe Customer Portal session (manage subscription, invoices, payment method)
- [ ] **8-4** Backend: Stripe webhook handler (`/api/billing/webhook`) — handle `checkout.session.completed`, `invoice.paid`, `customer.subscription.updated`, `customer.subscription.deleted`
- [ ] **8-5** Firestore: `orgs/{orgId}/billing` document — `plan`, `credits_remaining`, `credits_total`, `stripe_customer_id`, `stripe_subscription_id`, `next_reset_date`
- [ ] **8-6** Backend: `CreditLedger` service — atomic credit deduction with Firestore transactions, prevents negative balance, records every debit/credit with reason + timestamp
- [ ] **8-7** Backend: middleware `requireCredits(amount)` — check balance before expensive operations, return `402 Payment Required` if insufficient
- [ ] **8-8** Backend: monthly credit reset Cloud Scheduler job — resets monthly credits on billing cycle date
- [ ] **8-9** Backend: auto-recharge logic — if org has auto-recharge enabled and balance < threshold, trigger Stripe charge automatically

---

#### Sprint 9 — Billing UI & Credit Dashboard (Weeks 19–20)

- [ ] **9-1** Frontend: `BillingPage` (new page) — current plan, credit balance gauge, usage breakdown, upgrade/downgrade buttons
- [ ] **9-2** Frontend: Credit usage breakdown chart — credits consumed by feature type over last 30 days (recharts pie + bar)
- [ ] **9-3** Frontend: Low credit alert banner — appears site-wide when < 10% of monthly credits remain
- [ ] **9-4** Frontend: Upgrade modal — triggered by any feature gate; shows plan comparison, "Upgrade to unlock" CTA
- [ ] **9-5** Frontend: Credit purchase modal — quick-buy credit packs without changing plan
- [ ] **9-6** Frontend: Invoice history table — links to Stripe-hosted invoices
- [ ] **9-7** Frontend: Auto-recharge settings — enable/disable, threshold amount, recharge amount
- [ ] **9-8** Add `ROUTES.BILLING` to nav (gear icon or Settings submenu)
- [ ] **9-9** Tests: billing webhook handler unit tests (mock Stripe events), credit deduction race condition test

---

### Phase 4 — Enterprise Readiness (Sprints 10–13, Weeks 21–28)

#### Sprint 10 — SSO & Advanced Auth (Weeks 21–22)

- [ ] **10-1** Enable Clerk SAML SSO for Business/Enterprise tiers — configure in Clerk dashboard, gate behind feature flag
- [ ] **10-2** Enable Clerk OIDC SSO
- [ ] **10-3** Backend + Frontend: SCIM 2.0 provisioning endpoint (`/api/scim/v2/`) — auto-provision/deprovision users from enterprise IdP (Okta, Azure AD, Google Workspace)
- [ ] **10-4** Frontend: `BrandSettingsPage` SSO tab — SAML metadata URL input, test connection, enable/disable
- [ ] **10-5** MFA enforcement setting per org (require all members to have MFA)
- [ ] **10-6** Session management: configurable session timeout per org
- [ ] **10-7** IP allowlist: org setting to restrict access to specific IP ranges
- [ ] **10-8** Tests: SAML SSO flow E2E test with mock IdP

---

#### Sprint 11 — Audit Logs & Compliance (Weeks 23–24)

- [ ] **11-1** Backend: audit log service — every write operation emits an audit event to `orgs/{orgId}/auditLog/` collection
  - Events: survey created/updated/deleted, response viewed/exported, member invited/removed, role changed, billing changed, SSO configured, settings changed
  - Fields: `timestamp`, `actor` (userId + email), `action`, `resource`, `resourceId`, `ip`, `userAgent`, `metadata`
- [ ] **11-2** Backend: `GET /api/audit-log` — paginated, filterable by actor/action/date range
- [ ] **11-3** Frontend: Audit Log page in Settings — searchable table, date range picker, export CSV
- [ ] **11-4** Backend: data export endpoint — `POST /api/orgs/me/export` — zip of all org data (surveys, responses, insights) for GDPR right-to-portability
- [ ] **11-5** Backend: data deletion endpoint — `DELETE /api/orgs/me` — complete org data deletion for GDPR right-to-erasure; 30-day grace period with confirmation
- [ ] **11-6** Privacy: respondent anonymization — option to strip IP/fingerprint from responses after N days
- [ ] **11-7** Data residency: Cloud Functions deployment config for EU region (`europe-west1`) — org setting routes all data through EU functions + EU Firestore instance
- [ ] **11-8** Add GDPR consent checkbox to `SurveyFillPage` (optional per survey setting)
- [ ] **11-9** Cookie consent banner for survey public pages
- [ ] **11-10** Prepare SOC 2 Type II evidence collection checklist (vendor, not code — but set up audit trail infrastructure here)

---

#### Sprint 12 — White-Label & Custom Domains (Weeks 25–26)

- [ ] **12-1** Backend: org branding document — `primaryColor`, `logoUrl`, `fontFamily`, `customDomain`, `customEmailDomain`, `removePoweredBy`
- [ ] **12-2** Frontend: `SurveyFillPage` — read org branding from survey document and apply dynamically (custom colors, logo, font)
- [ ] **12-3** Custom domain for survey collection: `surveys.yourcorp.com` → maps to Experient's hosted page with org branding (Firebase Hosting custom domains)
- [ ] **12-4** Frontend: White-label email templates (via Clerk custom email domain + SendGrid)
- [ ] **12-5** Backend: `GET /api/public/brand/:orgSlug` — return branding for white-label rendering without survey token
- [ ] **12-6** Frontend: `BrandSettingsPage` — full branding editor: color picker, logo upload, font selector, preview panel
- [ ] **12-7** Backend: Firebase Storage signed URL for logo upload
- [ ] **12-8** White-label report export: PDF reports use org's branding, not Experient's (Business+ tier)

---

#### Sprint 13 — Enterprise API & Developer Experience (Weeks 27–28)

- [ ] **13-1** API documentation: generate OpenAPI 3.0 spec from existing Express routes (use `swagger-jsdoc` + `swagger-ui-express`)
- [ ] **13-2** API keys: `POST /api/orgs/me/api-keys` — generate scoped API keys (read-only or read-write) with optional expiry
- [ ] **13-3** API key auth middleware — accept `X-API-Key` header as alternative to Clerk JWT (for server-to-server integrations)
- [ ] **13-4** Webhooks: `POST /api/orgs/me/webhooks` — register webhook URLs for events (`response.created`, `insights.generated`, `survey.published`, `workflow.triggered`)
- [ ] **13-5** Webhook delivery: reliable delivery with retry queue (Firestore task queue), signature verification (`X-Experient-Signature` HMAC header)
- [ ] **13-6** Frontend: `BrandSettingsPage` API Keys tab — list keys, create key (show once), revoke key, last used timestamp
- [ ] **13-7** Frontend: Webhooks tab in Settings — list webhooks, add/delete, test delivery, delivery log
- [ ] **13-8** Developer docs site: Docusaurus or Mintlify deployed at `docs.experient.app`
  - Getting started guide
  - Authentication guide
  - API reference (auto-generated from OpenAPI spec)
  - Webhook integration guide
  - SDK quickstart
- [ ] **13-9** JavaScript/TypeScript SDK: `npm install @experient/sdk` — wraps all API calls with TypeScript types

---

### Phase 5 — Integrations & Ecosystem (Sprints 14–15, Weeks 29–32)

#### Sprint 14 — CRM & Business Tool Integrations (Weeks 29–30)

- [ ] **14-1** Slack integration: OAuth flow, send AI summaries to Slack channel on workflow trigger
- [ ] **14-2** Microsoft Teams integration: send alerts via Teams webhook
- [ ] **14-3** Salesforce integration: write NPS scores and sentiment to Salesforce Contact/Account fields; pull contact lists for survey distribution
- [ ] **14-4** HubSpot integration: sync survey responses to HubSpot contacts, trigger workflows from NPS score
- [ ] **14-5** Zendesk integration: create Zendesk tickets from negative NPS responses automatically
- [ ] **14-6** Intercom integration: send in-app surveys triggered by product events
- [ ] **14-7** Zapier connector: publish Experient as a Zapier app (triggers: new response, new insight; actions: create survey, get insights)
- [ ] **14-8** Make (Integromat) module
- [ ] **14-9** Frontend: Integrations page (`ROUTES.INTEGRATIONS`) — OAuth connect flows, integration status, last sync time

---

#### Sprint 15 — Distribution & Collection Channels (Weeks 31–32)

- [ ] **15-1** Email distribution: Resend/SendGrid integration — send personalized survey links to uploaded contact list (CSV import)
- [ ] **15-2** Email analytics: track opens, clicks, completion rate per email campaign
- [ ] **15-3** SMS distribution: Twilio integration — send survey link via SMS (credit-consuming)
- [ ] **15-4** In-app widget: embeddable JavaScript snippet (`<script src="cdn.experient.app/widget.js">`) that shows survey as slide-in panel, triggered by code event
- [ ] **15-5** Kiosk mode: full-screen PWA mode — auto-resets after each submission, ideal for tablets at events
- [ ] **15-6** QR code: real QR generation (replace mock grid) using `qrcode` library, PNG + SVG download
- [ ] **15-7** Anonymous vs. identified responses: respondent identity linking (pass `userId` param in survey URL, store alongside response)
- [ ] **15-8** Survey targeting: show survey only after N product events, or to users matching segment criteria

---

### Phase 6 — Scale & Global Infrastructure (Sprints 16–17, Weeks 33–36)

#### Sprint 16 — Performance & Reliability (Weeks 33–34)

- [ ] **16-1** Frontend: React.lazy() + Suspense for all page components — eliminate 880kB Three.js loading on non-landing pages
- [ ] **16-2** Frontend: code splitting by route — each page loads only when navigated to
- [ ] **16-3** Frontend: migrate from custom `useState` router to react-router proper (`<Routes>`, `<Route>`)
- [ ] **16-4** Frontend: add `React.memo` + `useCallback` to heavy components (`InsightsDashboardPage` topic list, chart components)
- [ ] **16-5** Backend: Firestore query pagination on all list endpoints (cursor-based, not offset)
- [ ] **16-6** Backend: Redis (Upstash serverless) for caching frequently-read data — org settings, survey schemas, active workflow conditions
- [ ] **16-7** Backend: Cloud Tasks queue for heavy AI operations — decouple from HTTP request lifecycle, return job ID, poll for completion
- [ ] **16-8** Load testing: k6 scripts for key flows (survey fill, insights fetch, concurrent response submission) — validate 10k concurrent users
- [ ] **16-9** Frontend: Lighthouse CI integrated into GitHub Actions — enforce score ≥ 90 performance, 95 accessibility

---

#### Sprint 17 — Multi-Region & Global Scale (Weeks 35–36)

- [ ] **17-1** Cloud Functions multi-region: deploy to `us-central1` + `europe-west1` + `asia-northeast1` (Tokyo)
- [ ] **17-2** Firestore: provision multi-region instance (`nam5` for US, `eur3` for EU) — org-level data residency routing
- [ ] **17-3** Firebase Hosting: verify global CDN configuration — static assets served from 150+ edge locations
- [ ] **17-4** Custom domain setup: `app.experient.ai`, `api.experient.ai`, `surveys.experient.ai`
- [ ] **17-5** DDOS protection: Cloud Armor rules on Cloud Functions
- [ ] **17-6** Backend: circuit breaker pattern for OpenRouter AI calls — degrade gracefully when AI is down
- [ ] **17-7** Uptime monitoring: set up Google Cloud Monitoring + PagerDuty for on-call alerts
- [ ] **17-8** Disaster recovery runbook: documented recovery procedures for data loss, function outage, Firestore incident
- [ ] **17-9** Status page: `status.experient.ai` via Atlassian Statuspage or BetterUptime

---

### Phase 7 — Go-to-Market Preparation (Sprints 18–19, Weeks 37–40)

#### Sprint 18 — Marketing Site & Content (Weeks 37–38)

**Marketing Website (`experient.ai` — separate from app)**
- [ ] **18-1** Full marketing site: Next.js + Tailwind, hosted on Vercel
  - Homepage (differentiated positioning, above vs. competitors)
  - Pricing page (interactive credit calculator, plan comparison table)
  - Features pages (AI Intelligence, Survey Builder, Insights, Workflows, Integrations, Enterprise)
  - Use cases (Product teams, CX teams, HR, Market research, Healthcare)
  - Customers page (case studies, logos, testimonials — start with 3 design partners)
  - Blog (SEO content, thought leadership)
  - Docs (link to Docusaurus)
  - Security & Compliance page
  - About / Team page
  - Changelog
- [ ] **18-2** SEO: target 50 keywords
  - Primary: "AI survey tool", "experience management platform", "NPS software", "customer feedback AI"
  - Competitive: "Qualtrics alternative", "SurveyMonkey alternative", "Medallia alternative"
  - Long-tail: "AI-powered survey analysis", "automatic NPS analysis", "survey insights AI"
- [ ] **18-3** Programmatic SEO: landing pages for each industry vertical (SaaS, Healthcare, Finance, Retail, Education) — auto-generated from templates with unique content
- [ ] **18-4** Content calendar: 2 blog posts/week for first 6 months
  - Technical: "How AI changes customer feedback analysis"
  - Competitive: "Qualtrics vs Experient — honest comparison"
  - How-to: "Build your first NPS program in 10 minutes"
  - Research: "State of Experience Management 2027"
- [ ] **18-5** Video: 90-second product demo video (Loom-style) — show full flow from AI survey creation to insight generation in under 2 minutes
- [ ] **18-6** Interactive demo: embedded Storylane or Arcade demo on homepage (no sign-up required)
- [ ] **18-7** Product Hunt launch preparation: assets, hunter outreach, launch day coordination

---

#### Sprint 19 — Sales Infrastructure & Launch (Weeks 39–40)

**Sales & CRM Setup:**
- [ ] **19-1** CRM: HubSpot free tier — pipeline stages: Lead → Trial → Qualified → Demo → Proposal → Closed Won/Lost
- [ ] **19-2** Inbound qualification: Typeform or Calendly for demo requests — auto-score based on company size, use case, urgency
- [ ] **19-3** Sales deck: 15-slide pitch for B2B sales motion (problem, solution, differentiation, social proof, pricing, next steps)
- [ ] **19-4** Trial-to-paid playbook: automated email sequence triggered by trial start
  - Day 0: Welcome + getting started guide
  - Day 2: "Have you created your first survey?" nudge
  - Day 5: AI features spotlight
  - Day 10: Case study email
  - Day 14: "Your trial ends soon" + credit offer
- [ ] **19-5** PLG motion: in-app upgrade prompts at every feature gate — show value before asking to upgrade
- [ ] **19-6** Champion program: power users who love the product → case study + LinkedIn post + referral credit (500 credits per referral)

**Advertising:**
- [ ] **19-7** Google Ads: search campaigns for primary keywords + competitor keywords (Qualtrics pricing, SurveyMonkey alternative)
- [ ] **19-8** LinkedIn Ads: target CX managers, VP Product, Head of Research at companies 50-5000 employees
- [ ] **19-9** Reddit: r/CX, r/SaaS, r/ProductManagement — organic presence first, then promoted posts
- [ ] **19-10** G2 / Capterra listings: create profile, incentivize first 20 reviews from design partners
- [ ] **19-11** ProductHunt, BetaList, Hacker News (Show HN) launch posts

**Partnership & Distribution:**
- [ ] **19-12** Salesforce AppExchange listing (Business+ feature — Salesforce integration required)
- [ ] **19-13** HubSpot App Marketplace listing
- [ ] **19-14** Agency partner program: CX consulting firms, market research agencies — reseller discount (20% off, white-label option)
- [ ] **19-15** Analyst outreach: brief Gartner (Magic Quadrant for VoC) and Forrester research teams — provide briefing deck

**Launch Sequence:**
- [ ] **19-16** Design partner program: 10 companies get 6 months free Business tier in exchange for weekly feedback calls + case study
- [ ] **19-17** Beta → GA announcement: blog post + LinkedIn + ProductHunt on same day
- [ ] **19-18** Press outreach: TechCrunch, VentureBeat, CX Today — pitch "AI-native challenger to Qualtrics"
- [ ] **19-19** Launch event: 60-minute webinar "The Future of Experience Management" — live demo + Q&A

---

### Phase 8 — Post-Launch Growth (Sprint 20+, ongoing)

- [ ] **20-1** Customer success: weekly check-ins with Business+ customers, QBRs for Enterprise
- [ ] **20-2** Net Revenue Retention (NRR) target: 110%+ — upsell credits, plan upgrades
- [ ] **20-3** Product-led expansion: workspace-level growth → invite colleagues → org upgrade
- [ ] **20-4** Mobile app: React Native app for response monitoring on-the-go (v2)
- [ ] **20-5** Marketplace: community-built survey templates (NPS, CSAT, onboarding, churn exit, product feedback) — searchable, one-click import
- [ ] **20-6** Benchmarking: anonymous aggregated NPS/CSAT benchmarks by industry — exclusive to Business+ ("Your NPS is 74 vs. industry average of 61")
- [ ] **20-7** Predictive churn model: identify at-risk customers using response patterns — proactive CS outreach
- [ ] **20-8** AI model fine-tuning: allow Enterprise customers to fine-tune topic classification on their own taxonomy (big differentiator vs. Medallia)

---

## Testing Strategy

### Unit Tests (Vitest)
- All business logic in `src/lib/`, `src/hooks/`, `src/constants/`
- All backend route handlers (mock Firestore + Clerk)
- Credit deduction logic (edge cases: zero balance, concurrent deductions)
- AI response parsing (malformed JSON fallback)
- Permission checks for each role × action combination
- Target: 80% coverage on critical paths

### Integration Tests
- Backend: full API route tests using supertest + Firebase emulator
- Frontend: React Testing Library for form submissions, permission gates, credit displays
- Billing: Stripe webhook handler with all event types

### E2E Tests (Playwright)
- Happy path: sign up → create survey → share → submit response → view insights
- Permission flows: viewer cannot create survey, editor cannot manage billing
- Billing: upgrade plan → verify credits updated
- Public survey: fill → submit → thank you screen
- AI generation: create survey from intent → verify questions generated
- Multi-language: switch locale → verify all strings translated

### Performance Tests (k6)
- Survey fill page: 10,000 concurrent users
- Response submission: 1,000 submissions/second burst
- Insights dashboard: 500 concurrent reads

### Security Tests
- OWASP ZAP scan on all API endpoints
- JWT token replay attack prevention
- Rate limiting verification
- Input sanitization (XSS, SQL injection equivalent for Firestore)
- API key scope enforcement

---

## Technology Choices for Scale

| Layer | Technology | Rationale |
|---|---|---|
| Frontend | React 19 + Vite + Tailwind v4 | Fast, modern, component-driven |
| Type safety | TypeScript (migrate incrementally) | Catch bugs before they reach prod |
| State management | React Query (TanStack) | Server-state caching, background refresh, offline support |
| Backend | Cloud Functions v2 + Express | Serverless, auto-scales to 0, global regions |
| Database | Firestore | Real-time, globally distributed, no ops |
| Cache | Upstash Redis (serverless) | Sub-1ms cache for org settings, survey schemas |
| Queue | Cloud Tasks | Async AI processing, webhook delivery |
| Auth | Clerk | SSO, SCIM, MFA without building infra |
| Billing | Stripe | Industry standard, Checkout, Portal, webhooks |
| Email | Resend | Developer-friendly, high deliverability |
| SMS | Twilio | Global SMS, programmable |
| AI | OpenRouter (multi-model routing) | Route to best model per tier/use case |
| Monitoring | Sentry (errors) + Cloud Monitoring (infra) | Full observability |
| Analytics | PostHog (product analytics) | Understand feature usage, funnel |
| CDN | Firebase Hosting (Fastly-backed) | 150+ PoPs globally |
| CI/CD | GitHub Actions | Automated test + deploy on merge |
| Docs | Mintlify | Beautiful developer docs, auto-syncs with OpenAPI |

---

## Metrics That Define Success

### Product (measure weekly)
- Time to first survey created: target < 3 minutes
- Time to first insight: target < 10 minutes after 10th response
- AI quality score: user thumbs up/down on AI insights, target > 80% positive
- Survey completion rate on hosted surveys: target > 70%
- Feature adoption: % of users who use AI features within 7 days of sign-up

### Business (measure monthly)
- MRR growth: 20%+ MoM in first year
- Trial → Paid conversion: target 15%+
- Net Revenue Retention (NRR): target 110%+
- CAC: target < $200 for Growth tier, < $5,000 for Business tier
- LTV: target > $2,000 for Growth, > $25,000 for Business
- Churn: target < 3% monthly for Growth, < 1% for Business

### Scale (measure continuously)
- API p99 latency: < 200ms for read, < 500ms for AI endpoints
- Survey fill page load: < 1.5s on 4G mobile
- Uptime: 99.9% for Growth and below, 99.99% for Enterprise
- AI response time: < 8 seconds for insight generation

---

## Pricing Configuration System (Technical)

All pricing is configuration, not code. This allows changing prices without deploys.

### Firestore Document: `/config/pricing`
```json
{
  "tiers": {
    "free":       { "monthlyCredits": 500,    "price": 0,    "maxUsers": 1,  "maxSurveys": 3 },
    "starter":    { "monthlyCredits": 5000,   "price": 49,   "maxUsers": 3,  "maxSurveys": -1 },
    "growth":     { "monthlyCredits": 25000,  "price": 199,  "maxUsers": 15, "maxSurveys": -1 },
    "business":   { "monthlyCredits": 100000, "price": 599,  "maxUsers": -1, "maxSurveys": -1 },
    "enterprise": { "monthlyCredits": -1,     "price": -1,   "maxUsers": -1, "maxSurveys": -1 }
  },
  "creditCosts": {
    "response_collected":   1,
    "ai_survey_generation": 10,
    "ai_insight_analysis":  25,
    "ai_topic_recluster":   15,
    "export_pdf":           5,
    "export_csv":           2,
    "workflow_execution":   1,
    "api_call":             0.5,
    "translation":          20,
    "predictive_nps":       50,
    "anomaly_detection":    10
  },
  "creditPacks": [
    { "credits": 1000,   "price": 12 },
    { "credits": 10000,  "price": 99 },
    { "credits": 100000, "price": 799 }
  ],
  "features": {
    "sso":            ["business", "enterprise"],
    "white_label":    ["business", "enterprise"],
    "data_residency": ["business", "enterprise"],
    "audit_logs":     ["growth", "business", "enterprise"],
    "api_access":     ["growth", "business", "enterprise"],
    "advanced_ai":    ["starter", "growth", "business", "enterprise"],
    "webhooks":       ["growth", "business", "enterprise"],
    "custom_domain":  ["business", "enterprise"],
    "scim":           ["enterprise"],
    "fine_tuning":    ["enterprise"]
  }
}
```

The `features.ts` frontend module reads this at app boot. Changing a price or moving a feature to a lower tier requires only a Firestore document update — no code deploy. A/B testing pricing is trivially supported.

---

## Sprint Summary & Timeline

| Phase | Sprints | Weeks | Deliverable |
|---|---|---|---|
| 0 — Foundation | S0 | 1–2 | CI/CD, testing, TypeScript start, security fixes |
| 1 — Core Completion | S1–S3 | 3–8 | Org/team, RBAC, analytics wired to real data |
| 2 — AI Engine | S4–S7 | 9–16 | Predictive AI, NL query, adaptive surveys |
| 3 — Billing | S8–S9 | 17–20 | Stripe + credit system live |
| 4 — Enterprise | S10–S13 | 21–28 | SSO, audit logs, white-label, API, webhooks |
| 5 — Integrations | S14–S15 | 29–32 | Salesforce, Slack, Zapier, email distribution |
| 6 — Scale | S16–S17 | 33–36 | Multi-region, load tested, performance optimized |
| 7 — GTM | S18–S19 | 37–40 | Marketing site, sales infrastructure, launch |
| 8 — Growth | S20+ | 41+ | Post-launch growth, mobile, marketplace |

**Total time to full enterprise launch: 40 weeks (~Q1 2027)**
**MVP for design partners (Phase 0–3 complete): 20 weeks (~Q4 2026)**

---

## Immediate Next Actions (This Week)

1. Install `@tailwindcss/vite` and verify the app renders correctly
2. Start Sprint 0: set up Vitest, add ErrorBoundary, remove client-side OpenRouter key
3. Create 5 design partner agreements — start with 2–3 companies who currently pay for Qualtrics
4. Register `experient.ai` domain if not already owned
5. Set up Clerk organization (free tier) and Firebase project per `README_SETUP.md`
6. Validate full deploy works end-to-end: `firebase deploy`
