# Experient — Work Tracker
# Updated: 2026-05-12

> **How to use:** Tell Claude "mark P0-1 done and tested" or "start Sprint 1" and the tracker updates automatically.
> Status key: ⬜ Not started · 🔄 In progress · ✅ Done · 🧪 Done + Tested · ⏭️ Skipped

---

## Overall Progress

| Phase | Tasks | Done | Tested | % Complete |
|---|---|---|---|---|
| Phase 0 — Foundation | 12 | 5 | 0 | 42% |
| Phase 1 — Core Completion | 35 | 6 | 0 | 17% |
| Phase 2 — AI Engine | 32 | 0 | 0 | 0% |
| Phase 3 — Billing | 18 | 0 | 0 | 0% |
| Phase 4 — Enterprise | 38 | 0 | 0 | 0% |
| Phase 5 — Integrations | 16 | 0 | 0 | 0% |
| Phase 6 — Scale | 21 | 0 | 0 | 0% |
| Phase 7 — Go-to-Market | 20 | 0 | 0 | 0% |
| Phase 2A — Agentic Skills Foundation | 16 | 0 | 0 | 0% |
| Phase 5A — MCP & Skill Publishing | 12 | 0 | 0 | 0% |
| **Total** | **220** | **8** | **0** | **4%** |

---

## ⚡ Current Recommendation

**Start here → Phase 0, Sprint 0: Foundation**

Nothing else can be built safely until the foundation is solid. The app currently has a broken CSS bug (no Tailwind styles), no tests, a security hole (OpenRouter API key exposed client-side), and no CI pipeline. These compound into technical debt that slows every future sprint.

Estimated time to complete Sprint 0: **3–5 days**

---

## Phase 0 — Foundation
**Sprint 0 · Weeks 1–2 · Goal: Clean foundation, CI green, no security holes**

| ID | Task | Status | Notes |
|---|---|---|---|
| P0-1 | Install `@tailwindcss/vite`, verify all pages render correctly | ✅ | Installed, dev server starts cleanly |
| P0-2 | Add `tsconfig.json`, begin TypeScript migration on `src/lib/` and `src/constants/` | ✅ | Full migration: all 72 .js/.jsx files renamed to .ts/.tsx. 0 type errors. tsconfig.json, vite-env.d.ts, src/types/index.ts created. |
| P0-3 | Install Vitest + React Testing Library | ⬜ | `npm install -D vitest @testing-library/react @testing-library/user-event` |
| P0-4 | Write first 10 unit tests: `i18n`, `routes`, `thresholds`, `useSurveys` (mock Firebase) | ⬜ | |
| P0-5 | Install Playwright, write smoke E2E test: landing → sign-in → surveys | ⬜ | |
| P0-6 | Set up GitHub Actions CI: lint + type-check + unit tests on every PR | ⬜ | |
| P0-7 | Integrate Sentry (frontend + backend) | ⬜ | Free tier |
| P0-8 | Add `ErrorBoundary` component wrapping each page in `App.jsx` | ⬜ | |
| P0-9 | Backend: add Zod request validation on all POST/PUT routes | ✅ | `src/schemas/` + `src/lib/validate.js`; all local POST/PUT routes covered |
| P0-10 | Backend: add rate limiting middleware (`express-rate-limit`) | ✅ | Custom sliding-window limiter (Redis/in-memory). `apiLimiter` (200/15min) on all authenticated routes; `aiLimiter` (20/15min) stacked on `/api/ai` |
| P0-11 | Backend: add structured JSON request logging → Cloud Logging | ⬜ | |
| P0-12 | **SECURITY:** Remove `openrouter.js` from `app/src/lib/` — API key must be server-side only | ✅ | `openrouter.js` only in `functions/src/lib/`, reads `process.env.OPENROUTER_API_KEY` — no frontend reference |

---

## Phase 1 — Core Product Completion
**Sprints 1–3 · Weeks 3–8**

### Sprint 1 — Org & Team Management (Weeks 3–4)

| ID | Task | Status | Notes |
|---|---|---|---|
| 1-1 | Backend: `POST /api/orgs` — create organization | ⬜ | |
| 1-2 | Backend: `GET /api/orgs/me` — get current org | ⬜ | |
| 1-3 | Backend: `PUT /api/orgs/me` — update org name/logo | ⬜ | |
| 1-4 | Backend: `GET /api/orgs/me/members` — list members | ⬜ | |
| 1-5 | Backend: `POST /api/orgs/me/invitations` — invite by email | ⬜ | Uses Clerk Invitations API |
| 1-6 | Backend: `DELETE /api/orgs/me/members/:userId` — remove member | ⬜ | |
| 1-7 | Backend: `PUT /api/orgs/me/members/:userId/role` — update role | ⬜ | |
| 1-8 | Frontend: wire `BrandSettingsPage` to real org API | ⬜ | |
| 1-9 | Frontend: wire team table to real members + invite modal | ⬜ | |
| 1-10 | Frontend: `OnboardingPage` — real Clerk org list | ✅ | `useOrganizationList`, `CreateOrganization` modal, sign-out wired |
| 1-11 | Frontend: org switcher in `SideNav` | ✅ | `OrganizationSwitcher` at bottom of sidenav |
| 1-12 | Tests: org API routes (unit), invite flow (E2E) | ⬜ | |

### Sprint 2 — RBAC, Enterprise Roles & Permissions (Weeks 5–6)

**Goal:** Brands onboard in enterprise mode. An org admin creates the workspace, invites team members, assigns roles. Role gates control who can do what in the app.

**Clerk role model for Experient:**
- `org:admin` → full control (invite/remove users, manage billing, all survey ops)
- `org:analyst` → create + edit surveys, view all insights (custom Clerk role)
- `org:viewer` → read-only — view surveys and insights, no edits (custom Clerk role)

| ID | Task | Status | Notes |
|---|---|---|---|
| 2-1 | **Clerk Dashboard:** create custom roles `org:analyst` and `org:viewer` under Configure → Organizations → Roles | ⬜ | One-time dashboard setup, not code |
| 2-2 | **Clerk Dashboard:** set `org:admin` permissions: manage_members, manage_billing, delete_organization | ⬜ | One-time dashboard setup |
| 2-3 | Frontend: `usePermissions()` hook — wraps `useOrganization().membership.role`, returns `{ isAdmin, isAnalyst, isViewer, role }` | ⬜ | `src/lib/permissions.ts` |
| 2-4 | Frontend: gate "Create Survey", "Edit Survey", "Delete Survey" actions behind `isAdmin \|\| isAnalyst` | ⬜ | Disable button + show tooltip if no permission |
| 2-5 | Frontend: gate "Invite Member", "Change Role", "Remove Member" behind `isAdmin` only | ⬜ | These are in Settings → Organization tab |
| 2-6 | Frontend: gate "API Keys" tab behind `isAdmin` only | ⬜ | `BrandSettingsPage` |
| 2-7 | Frontend: `<PermissionGate role="admin">` wrapper component — renders children or null | ⬜ | Reusable gate for any restricted UI element |
| 2-8 | Frontend: permission denied banner for viewers who try restricted actions | ⬜ | Friendly "Ask your admin" message |
| 2-9 | Backend: `requireRole(minRole)` middleware — reads Clerk JWT org role claim, blocks 403 if insufficient | ⬜ | Order: viewer < analyst < admin |
| 2-10 | Backend: apply `requireRole('analyst')` on `POST /api/surveys`, `PUT /api/surveys/:id` | ⬜ | |
| 2-11 | Backend: apply `requireRole('admin')` on `POST /api/orgs/me/invitations`, `DELETE /api/orgs/me/members/:id` | ⬜ | |
| 2-12 | Frontend: `src/lib/features.ts` — plan-tier feature flags (free / starter / business / enterprise) | ⬜ | Separate from role gates |
| 2-13 | Frontend: "Enterprise mode" badge in `OnboardingPage` for orgs with ≥5 members or Business+ plan | ⬜ | Visual indicator, not a gate |
| 2-14 | Frontend: upgrade modal triggered at enterprise feature gates (SSO, white-label, audit log) | ⬜ | |
| 2-15 | Tests: role middleware unit test (admin/analyst/viewer × each route), permission hook unit test | ⬜ | |

### Sprint 1C — Survey Lifecycle & UX Polish (Completed 2026-05-12)

**Goal:** Every survey state transition (draft → live → paused → closed → deleted) is operable by a non-technical PM from the survey list. No builder required for lifecycle management.

| ID | Task | Status | Notes |
|---|---|---|---|
| 1C-1 | Backend: `closed_at`, `deleted_at`, soft-delete on surveys route | ✅ | Status transitions with lifecycle timestamps |
| 1C-2 | Backend: survey audit trail — `created_at`, `updated_at`, `updated_by`, `published_at`, `paused_at`, `closed_at`, `deleted_at` | ✅ | Full lifecycle timestamps on every survey row |
| 1C-3 | Frontend: Close Survey modal — clear explanation of what Close vs Pause means | ✅ | `CloseModal` in SurveyActionModal.jsx |
| 1C-4 | Frontend: Reopen Survey modal — reactivate a closed survey from the list | ✅ | `ReopenModal` in SurveyActionModal.jsx |
| 1C-5 | Frontend: Delete Survey modal — soft-delete with 30-day recovery note | ✅ | `DeleteSurveyModal` in SurveyActionModal.jsx |
| 1C-6 | Frontend: overflow "more actions" menu on every survey card (Close, Delete) | ✅ | Shadcn DropdownMenu |
| 1C-7 | Frontend: "Closed" filter tab in survey list | ✅ | Hidden when count = 0 |
| 1C-8 | Frontend: `closed` status badge variant | ✅ | Grey secondary badge |
| 1C-9 | Frontend: 3D page transitions (Framer Motion AnimatePresence) | ✅ | All routes via AnimatedRoutes in App.jsx |
| 1C-10 | Frontend: animated survey question cards in fill page (direction-aware slide) | ✅ | AnimatePresence + custom direction state |
| 1C-11 | Frontend: skeleton loading for survey list (shimmer cards) | ✅ | `SurveyListSkeleton` component |
| 1C-12 | Frontend: overlay loader for publish operation in builder | ✅ | `OverlayLoader` with AnimatePresence |
| 1C-13 | Frontend: "Edit in Builder" passes correct navigation state (intent/fromTemplate/templateId) | ✅ | Fixed in SurveyCreationPage |
| 1C-14 | Frontend: "Launch Survey" directly creates+publishes without going to builder, shows share URL | ✅ | Fixed in SurveyCreationPage |
| 1C-15 | Frontend: Org profile persisted to backend (industry/size/useCase/targetAudience/website/brandDescription) | ✅ | New `org_profiles` table + GET/PUT API |

### Sprint 2B — Survey Data Model (Completed 2026-05-11)

**Goal:** Design a flexible, globally-compatible survey/response data model before any further backend work. All survey routes, analytics, and distribution features build on this foundation.

| ID | Task | Status | Notes |
|---|---|---|---|
| 2B-1 | Research all survey types across leading platforms (Medallia, InMoment, Typeform, SurveyMonkey, LimeSurvey) | ✅ | 15 survey types, 30+ question types catalogued |
| 2B-2 | Research all contextual enrichment data (IP, geo, device, network, session, UTM, behavioral, quality signals) | ✅ | Full schema designed |
| 2B-3 | Design distributed storage architecture: Firestore (operational) + BigQuery (analytics) + Firebase Storage (binaries) | ✅ | Split-write, no ETL |
| 2B-4 | Write `SURVEY_DATA_MODEL.md` — full TypeScript interface definitions, collection hierarchy, indexes, migration guide | ✅ | At root of Experient/ repo |

### Sprint 3 — Analytics & Dashboard Completion (Weeks 7–8)

| ID | Task | Status | Notes |
|---|---|---|---|
| 3-1 | Backend: `GET /api/surveys/:id/analytics` — aggregated stats | ⬜ | |
| 3-2 | Backend: `GET /api/orgs/me/analytics` — org-level rollup | ⬜ | |
| 3-3 | Frontend: wire `ResponseDashboardPage` to real analytics | ⬜ | Replace hardcoded 84.6%, NPS 74 |
| 3-4 | Frontend: wire `InsightsDashboardPage` KPI cards to real data | ⬜ | |
| 3-5 | Frontend: wire `AdvancedInsightsPage` to real insights API | ⬜ | |
| 3-6 | Frontend: time-series chart in `ResponseDashboardPage` (recharts) | ⬜ | |
| 3-7 | Frontend: response volume sparklines on `SurveysListPage` | ⬜ | |
| 3-8 | Frontend: empty states for all pages | ⬜ | |
| 3-9 | Tests: analytics aggregation unit tests, dashboard E2E | ⬜ | |

### Sprint 3B — Distribution & Notifications (PM Gap Backlog)

**Goal:** Close the distribution gap between Experient and established platforms (SurveyMonkey et al.). A survey that can only be shared as a bare URL is fundamentally less valuable than one with channels, scheduling, and lifecycle notifications.

| ID | Task | Status | Notes |
|---|---|---|---|
| 3B-1 | Backend: `POST /api/surveys/:id/distribute` — record distribution event (channel, sent_at, audience size) | ⬜ | Foundation for tracking reach |
| 3B-2 | Backend: `POST /api/surveys/:id/channels/email` — send via SendGrid/Resend to a list of emails | ⬜ | Attach org branding, unsubscribe footer |
| 3B-3 | Backend: QR code generation endpoint for any survey | ⬜ | `qrcode` npm package, return base64 PNG |
| 3B-4 | Frontend: Distribution panel in builder (share link + QR + email channel) | ⬜ | Replace bare share URL in publish success |
| 3B-5 | Backend: `POST /api/surveys/:id/schedule` — schedule auto-open at a future datetime | ⬜ | Cloud Tasks + survey status update |
| 3B-6 | Backend: Response milestone webhook — notify when N responses hit a threshold | ⬜ | Fires to configured endpoint or Slack |
| 3B-7 | Frontend: Notification settings in BrandSettingsPage — Slack webhook URL, email for alerts | ⬜ | Per-org notification config |
| 3B-8 | Backend: `POST /api/contacts` — upload CSV of contacts, parse into `org_contacts` table | ⬜ | Foundation for targeted sends |
| 3B-9 | Frontend: Contacts page — upload CSV, view list, tag by segment | ⬜ | Required for email distribution channel |
| 3B-10 | Backend: NPS respondent timeline — track same contact across multiple survey runs | ⬜ | `contact_id` FK on responses table |
| 3B-11 | Frontend: NPS trend view per respondent in ResponseDashboardPage | ⬜ | "John moved from detractor → passive" |
| 3B-12 | Backend: Custom domain for survey fill page (CNAME support via Cloudflare) | ⬜ | Enterprise feature — `feedback.yourbrand.com` |

---

## Phase 2 — AI Differentiation Engine
**Sprints 4–7 · Weeks 9–16**

### Sprint 4 — AI Upgrade & Model Strategy (Weeks 9–10)

| ID | Task | Status | Notes |
|---|---|---|---|
| 4-1 | Switch to `claude-3.5-haiku` for paid tiers via OpenRouter | ⬜ | |
| 4-2 | Backend: model selection by plan tier | ⬜ | |
| 4-3 | Backend: AI request queue with retry + exponential backoff | ⬜ | |
| 4-4 | Backend: AI response caching (24h, Firestore) | ⬜ | |
| 4-5 | Frontend: AI Copilot real streaming in `SurveyBuilderPage` (SSE) | ⬜ | |
| 4-6 | Backend: `POST /api/ai/improve-question` | ⬜ | |
| 4-7 | Backend: `POST /api/ai/suggest-followup` | ⬜ | |
| 4-8 | Backend: `POST /api/ai/translate-survey` | ⬜ | |

### Sprint 5 — Predictive Intelligence (Weeks 11–12)

| ID | Task | Status | Notes |
|---|---|---|---|
| 5-1 | Backend: `POST /api/ai/predict-nps` | ⬜ | |
| 5-2 | Backend: `POST /api/ai/detect-anomalies` | ⬜ | |
| 5-3 | Backend: `GET /api/surveys/:id/trends` — velocity + sentiment drift | ⬜ | |
| 5-4 | Frontend: trend chart in `AdvancedInsightsPage` | ⬜ | |
| 5-5 | Backend: `POST /api/ai/root-cause` — explain sentiment spikes | ⬜ | |
| 5-6 | Frontend: Signal Intelligence panel in `InsightsDashboardPage` | ⬜ | |
| 5-7 | Backend: Firestore trigger evaluates workflow conditions on new insights | ⬜ | Completes workflow execution |

### Sprint 6 — Natural Language Query Interface (Weeks 13–14)

| ID | Task | Status | Notes |
|---|---|---|---|
| 6-1 | Backend: `POST /api/ai/query` — plain English question → structured answer | ⬜ | **The moat feature** |
| 6-2 | Frontend: AI Query Bar (Cmd+K) in `InsightsDashboardPage` | ⬜ | |
| 6-3 | Backend: conversation history per query session | ⬜ | |
| 6-4 | Frontend: query history, last 10 with shareable links | ⬜ | |
| 6-5 | Backend: `POST /api/ai/executive-summary` | ⬜ | |
| 6-6 | Frontend: Executive Summary modal + PDF export | ⬜ | |

### Sprint 7 — Smart Collection & Adaptive Surveys (Weeks 15–16)

| ID | Task | Status | Notes |
|---|---|---|---|
| 7-1 | Backend: `POST /api/surveys/:id/logic` — save branching logic | ⬜ | |
| 7-2 | Frontend: visual branching logic builder in `SurveyBuilderPage` | ⬜ | |
| 7-3 | Frontend: `SurveyFillPage` — evaluate branching logic client-side | ⬜ | |
| 7-4 | Backend: `POST /api/ai/adaptive-questions` — real-time next question | ⬜ | |
| 7-5 | Frontend: adaptive mode toggle in `SurveyFillPage` | ⬜ | |
| 7-6 | Backend: question piping (`{{Q1_answer}}` syntax) | ⬜ | |
| 7-7 | Frontend: piping token picker in `SurveyBuilderPage` | ⬜ | |
| 7-8 | Backend: survey quotas (stop at N responses per segment) | ⬜ | |
| 7-9 | Backend: response deduplication (browser fingerprint) | ⬜ | |

### Sprint 7A — Agentic Skills Foundation (Weeks 16–17)
**Goal:** Make every Experient capability callable by an AI agent. Define the four skills, build the executor layer, wire Cmd+K to route intent across skills. This sprint ships before billing so credit costs per skill call can be correctly priced in Sprint 8.

**Design principle:** Every skill is spec'd by a PM in plain English first. Engineering builds to the spec, not the other way around. Each skill exposes exactly 5 natural-language actions. The AI fills in parameters — users never see a form.

**The four Experient skills:**
| Skill | What the agent can do |
|---|---|
| Survey Skill | create, edit, publish, pause, inspect a survey |
| Distribution Skill | distribute, check status, send reminders, close, preview |
| Dashboard & Tools Skill | get insights, ask a question (NLQ), generate report, compare surveys, get NPS |
| Workflow Skill | create, list, pause/resume, test, get execution log |

| ID | Task | Status | Notes |
|---|---|---|---|
| 7A-1 | **PM Spec: Survey Skill** — write the skill contract: 5 actions, input/output schema, credit cost, error cases. Review + sign off before 7A-5. | ⬜ | Deliverable: `docs/skills/survey-skill.md` |
| 7A-2 | **PM Spec: Distribution Skill** — same format | ⬜ | Deliverable: `docs/skills/distribution-skill.md` |
| 7A-3 | **PM Spec: Dashboard & Tools Skill** — same format | ⬜ | Deliverable: `docs/skills/dashboard-skill.md` |
| 7A-4 | **PM Spec: Workflow Skill** — same format | ⬜ | Deliverable: `docs/skills/workflow-skill.md` |
| 7A-5 | **PM Review session:** walk all four specs together, validate simplicity, cut anything that requires >1 parameter the AI can't infer. Merge and sign off. | ⬜ | Gate: no implementation until this passes |
| 7A-6 | Backend: Skill registry — `GET /api/skills` returns all available skills with their schemas (MCP-compatible tool format) | ⬜ | Foundation for MCP server in Sprint 15A |
| 7A-7 | Backend: Skill executor service — routes natural language intent + context to the right skill action, returns structured response | ⬜ | `functions/src/skills/executor.ts` |
| 7A-8 | Backend: Survey Skill executor — implements the 5 actions from the PM spec, wraps existing survey API | ⬜ | |
| 7A-9 | Backend: Distribution Skill executor — implements the 5 actions, wraps collection API | ⬜ | |
| 7A-10 | Backend: Dashboard Skill executor — implements the 5 actions, wraps analytics + NLQ API | ⬜ | |
| 7A-11 | Backend: Workflow Skill executor — implements the 5 actions, wraps workflow API | ⬜ | |
| 7A-12 | Backend: Credit metering per skill call — each action has a credit cost from the PM spec; deduct atomically | ⬜ | Feeds directly into Sprint 8 billing |
| 7A-13 | Frontend: extend Cmd+K (Sprint 6-2) to route across all four skills, not just NLQ | ⬜ | "Create a survey about onboarding" → Survey Skill |
| 7A-14 | Frontend: Skill result cards — each skill returns a typed response rendered as an action card (e.g. new survey card, distribution status card) | ⬜ | Not raw text — structured, actionable UI |
| 7A-15 | Frontend: Skill attribution line on every AI-generated action ("Created by Survey Skill · 10 credits") | ⬜ | Transparency + credit awareness |
| 7A-16 | Tests: each skill executor unit tested against PM spec (every action, error path, credit deduction) | ⬜ | |

---

## Phase 3 — Billing & Credit System
**Sprints 8–9 · Weeks 17–20**

### Sprint 8 — Stripe Integration & Credit Engine (Weeks 17–18)

| ID | Task | Status | Notes |
|---|---|---|---|
| 8-1 | Create Stripe account, configure products/prices for all tiers | ⬜ | |
| 8-2 | Backend: `POST /api/billing/checkout` — Stripe Checkout session | ⬜ | |
| 8-3 | Backend: `POST /api/billing/portal` — Stripe Customer Portal | ⬜ | |
| 8-4 | Backend: Stripe webhook handler — all subscription events | ⬜ | |
| 8-5 | Firestore: `orgs/{orgId}/billing` document schema | ⬜ | |
| 8-6 | Backend: `CreditLedger` service — atomic deduction with Firestore transactions | ⬜ | **Core billing logic** |
| 8-7 | Backend: `requireCredits(amount)` middleware | ⬜ | |
| 8-8 | Backend: monthly credit reset Cloud Scheduler job | ⬜ | |
| 8-9 | Backend: auto-recharge logic | ⬜ | |

### Sprint 9 — Billing UI & Credit Dashboard (Weeks 19–20)

| ID | Task | Status | Notes |
|---|---|---|---|
| 9-1 | Frontend: `BillingPage` — plan, credits, usage | ⬜ | |
| 9-2 | Frontend: credit usage breakdown chart | ⬜ | |
| 9-3 | Frontend: low credit alert banner (site-wide) | ⬜ | |
| 9-4 | Frontend: upgrade modal at every feature gate | ⬜ | |
| 9-5 | Frontend: credit purchase modal | ⬜ | |
| 9-6 | Frontend: invoice history table | ⬜ | |
| 9-7 | Frontend: auto-recharge settings | ⬜ | |
| 9-8 | Add `ROUTES.BILLING` to navigation | ⬜ | |
| 9-9 | Tests: webhook handler unit tests, credit race condition test | ⬜ | |

---

## Phase 4 — Enterprise Readiness
**Sprints 10–13 · Weeks 21–28**

### Sprint 10 — SSO & Advanced Auth (Weeks 21–22)

| ID | Task | Status | Notes |
|---|---|---|---|
| 10-1 | Enable Clerk SAML SSO for Business/Enterprise | ⬜ | |
| 10-2 | Enable Clerk OIDC SSO | ⬜ | |
| 10-3 | Backend: SCIM 2.0 provisioning endpoint | ⬜ | |
| 10-4 | Frontend: SSO tab in `BrandSettingsPage` | ⬜ | |
| 10-5 | MFA enforcement setting per org | ⬜ | |
| 10-6 | Configurable session timeout per org | ⬜ | |
| 10-7 | IP allowlist setting | ⬜ | |
| 10-8 | Tests: SAML SSO E2E with mock IdP | ⬜ | |

### Sprint 11 — Audit Logs & Compliance (Weeks 23–24)

| ID | Task | Status | Notes |
|---|---|---|---|
| 11-1 | Backend: audit log service — every write emits event | ⬜ | |
| 11-2 | Backend: `GET /api/audit-log` — paginated, filterable | ⬜ | |
| 11-3 | Frontend: Audit Log page in Settings | ⬜ | |
| 11-4 | Backend: data export endpoint (GDPR portability) | ⬜ | |
| 11-5 | Backend: org data deletion (GDPR erasure, 30-day grace) | ⬜ | |
| 11-6 | Privacy: respondent anonymization after N days | ⬜ | |
| 11-7 | Data residency: EU region deployment + routing | ⬜ | |
| 11-8 | GDPR consent checkbox option on `SurveyFillPage` | ⬜ | |
| 11-9 | Cookie consent banner for public survey pages | ⬜ | |
| 11-10 | SOC 2 evidence collection checklist (process, not code) | ⬜ | |

### Sprint 12 — White-Label & Custom Domains (Weeks 25–26)

| ID | Task | Status | Notes |
|---|---|---|---|
| 12-1 | Backend: org branding document (colors, logo, font, domain) | ⬜ | |
| 12-2 | Frontend: `SurveyFillPage` reads org branding dynamically | ⬜ | |
| 12-3 | Custom domain for survey collection (`surveys.yourcorp.com`) | ⬜ | |
| 12-4 | White-label email templates via Clerk + SendGrid | ⬜ | |
| 12-5 | Backend: `GET /api/public/brand/:orgSlug` | ⬜ | |
| 12-6 | Frontend: full branding editor in `BrandSettingsPage` | ⬜ | |
| 12-7 | Backend: Firebase Storage signed URL for logo upload | ⬜ | |
| 12-8 | White-label PDF report export (org branding) | ⬜ | |

### Sprint 13 — Enterprise API & Developer Experience (Weeks 27–28)

| ID | Task | Status | Notes |
|---|---|---|---|
| 13-1 | API docs: OpenAPI 3.0 spec (swagger-jsdoc) | ⬜ | |
| 13-2 | Backend: API key management — create, list, revoke | ⬜ | |
| 13-3 | Backend: API key auth middleware (`X-API-Key` header) | ⬜ | |
| 13-4 | Backend: webhook registration endpoint | ⬜ | |
| 13-5 | Backend: webhook delivery with retry + HMAC signature | ⬜ | |
| 13-6 | Frontend: API Keys tab in Settings | ⬜ | |
| 13-7 | Frontend: Webhooks tab in Settings | ⬜ | |
| 13-8 | Developer docs site (Mintlify at `docs.experient.ai`) | ⬜ | |
| 13-9 | JavaScript/TypeScript SDK (`@experient/sdk` on npm) | ⬜ | |

---

## Phase 5 — Integrations & Ecosystem
**Sprints 14–15 · Weeks 29–32**

### Sprint 14 — CRM & Business Tool Integrations (Weeks 29–30)

| ID | Task | Status | Notes |
|---|---|---|---|
| 14-1 | Slack integration (OAuth + workflow alerts) | ⬜ | |
| 14-2 | Microsoft Teams integration | ⬜ | |
| 14-3 | Salesforce integration | ⬜ | |
| 14-4 | HubSpot integration | ⬜ | |
| 14-5 | Zendesk integration (ticket from negative NPS) | ⬜ | |
| 14-6 | Intercom integration (in-app survey triggers) | ⬜ | |
| 14-7 | Zapier connector | ⬜ | |
| 14-8 | Make (Integromat) module | ⬜ | |
| 14-9 | Frontend: Integrations page | ⬜ | |

### Sprint 15 — Distribution Channels (Weeks 31–32)

| ID | Task | Status | Notes |
|---|---|---|---|
| 15-1 | Email distribution (Resend/SendGrid + CSV import) | ⬜ | |
| 15-2 | Email analytics (opens, clicks, completion rate) | ⬜ | |
| 15-3 | SMS distribution via Twilio | ⬜ | |
| 15-4 | Embeddable JS widget (`cdn.experient.ai/widget.js`) | ⬜ | |
| 15-5 | Kiosk mode (full-screen PWA, auto-reset) | ⬜ | |
| 15-6 | Real QR code generation (replace mock grid) | ⬜ | |
| 15-7 | Anonymous vs. identified responses (userId param) | ⬜ | |

### Sprint 15A — MCP Server & Skill Publishing (Weeks 32–33)
**Goal:** Expose the four Experient skills to any AI agent in the world. Claude, GPT, custom enterprise agents — all can use Experient as a tool layer. This is the GTM moment: "Experient is the experience intelligence skill for every AI stack."

**Why this accelerates GTM:** Instead of selling a product, we distribute skills. Any team already using Claude/GPT can add Experient skills with one MCP config. No new UI to learn. Adoption is frictionless.

| ID | Task | Status | Notes |
|---|---|---|---|
| 15A-1 | Backend: MCP server implementation — `functions/src/mcp/server.ts` — wraps the four skill executors from Sprint 7A into MCP-compliant tool definitions | ⬜ | Uses skill schemas from 7A-6 |
| 15A-2 | Backend: MCP auth — API key auth on the MCP endpoint; per-org key from Settings → API Keys | ⬜ | |
| 15A-3 | Backend: MCP tool: `create_survey` — maps to Survey Skill executor | ⬜ | |
| 15A-4 | Backend: MCP tool: `distribute_survey` — maps to Distribution Skill | ⬜ | |
| 15A-5 | Backend: MCP tool: `get_insights` — maps to Dashboard Skill | ⬜ | |
| 15A-6 | Backend: MCP tool: `manage_workflow` — maps to Workflow Skill | ⬜ | |
| 15A-7 | Backend: MCP tool: `ask_experient` — free-form NLQ routed to best skill | ⬜ | The "one tool to rule them all" for casual agents |
| 15A-8 | Frontend: Settings → API Keys tab — "Connect to Claude / Claude Code" copy-paste MCP config block | ⬜ | Lowers setup friction to 30 seconds |
| 15A-9 | Publish to Claude skill marketplace — submit four skills + descriptions | ⬜ | Discovery channel: Claude users find Experient |
| 15A-10 | Developer docs: MCP quickstart guide — 3 steps, first skill call in <5 minutes | ⬜ | `docs.experient.ai/mcp` |
| 15A-11 | Demo: full agentic cycle in <60 seconds — "create a product NPS survey, distribute to Slack, get insights, create an alert workflow" via Claude Code + Experient MCP | ⬜ | **The GTM demo video** |
| 15A-12 | Tests: MCP endpoint integration tests, auth failure cases, credit deduction per tool call | ⬜ | |

---

## Phase 6 — Scale & Global Infrastructure
**Sprints 16–17 · Weeks 33–36**
**Cloud: GCP only. Fly.io not used. See PRODUCT_PLAN.md → Cloud & Infrastructure Strategy.**

### Sprint 16 — Performance & Reliability (Weeks 33–34)

| ID | Task | Status | Notes |
|---|---|---|---|
| 16-1 | Frontend: React.lazy() + Suspense for all page components | ⬜ | Fixes 880kB Three.js on all pages |
| 16-2 | Frontend: proper react-router (replace useState router) | ⬜ | |
| 16-3 | Frontend: React.memo + useCallback on heavy components | ⬜ | |
| 16-4 | Backend: cursor-based pagination on all list endpoints | ⬜ | |
| 16-5 | Backend: Upstash Redis caching for org settings + survey schemas | ⬜ | |
| 16-6 | Backend: Cloud Tasks queue for AI operations | ⬜ | |
| 16-7 | Load testing: k6 scripts, validate 10k concurrent users | ⬜ | |
| 16-8 | Frontend: Lighthouse CI in GitHub Actions (score ≥ 90) | ⬜ | |

### Sprint 17 — Multi-Region & Global Scale (Weeks 35–36)
**Trigger: run when MRR ~$10K or Firestore costs become meaningful. Do not run early.**

#### Stage 2 — Migrate to Cloud Run + Cloud SQL (~$10K MRR)
| ID | Task | Status | Notes |
|---|---|---|---|
| 17-1 | Provision Cloud SQL Postgres (db-g1-small, us-central1) | ⬜ | Run existing supabase/migrations/ to create schema |
| 17-2 | Write + test Firestore → Cloud SQL migration script | ⬜ | Per-org, dry-run in staging first |
| 17-3 | Deploy Express API as Cloud Run service (BACKEND=local) | ⬜ | Same Dockerfile already in repo |
| 17-4 | Cutover: point api.experient.ai at Cloud Run, run migration, sunset Firebase Functions | ⬜ | Reversible: keep Firebase Functions 2 weeks post-cutover |

#### Stage 3 — Global Distribution (~100K users)
| ID | Task | Status | Notes |
|---|---|---|---|
| 17-5 | Cloud Run in europe-west1 + asia-northeast1 + Cloud SQL read replicas | ⬜ | |
| 17-6 | Cloudflare in front of all regions (anycast routing + DDoS) | ⬜ | Replaces need for Cloud Armor |
| 17-7 | Custom domains: app.experient.ai, api.experient.ai, surveys.experient.ai | ⬜ | |
| 17-8 | Firebase Hosting global CDN verification (frontend stays here) | ⬜ | No move needed, already on Fastly CDN |

#### Reliability (both stages)
| ID | Task | Status | Notes |
|---|---|---|---|
| 17-9 | Circuit breaker for OpenRouter AI calls | ⬜ | Degrade gracefully when AI is unavailable |
| 17-10 | Uptime monitoring: Google Cloud Monitoring + PagerDuty | ⬜ | |
| 17-11 | Disaster recovery runbook (Postgres backup restore, Cloud Run rollback) | ⬜ | |
| 17-12 | Status page: status.experient.ai | ⬜ | BetterUptime or Atlassian |

#### Future Watchlist (not tasked yet)
| ID | Task | Status | Notes |
|---|---|---|---|
| 17-W1 | Evaluate Cloudflare Workers + Hyperdrive for edge hot paths | ⬜ | Only if Stage 3 latency is a bottleneck |
| 17-W2 | ICP (DFINITY Internet Computer) — monitor readiness for tamperproof compute | ⬜ | Revisit if enterprise buyers request verifiable data guarantees |

---

## Phase 7 — Go-to-Market
**Sprints 18–19 · Weeks 37–40**

### Sprint 18 — Marketing Site & Content (Weeks 37–38)

| ID | Task | Status | Notes |
|---|---|---|---|
| 18-1 | Full marketing site (Next.js, all pages) | ⬜ | |
| 18-2 | SEO: 50 target keywords mapped to pages | ⬜ | |
| 18-3 | Programmatic SEO landing pages by industry vertical | ⬜ | |
| 18-4 | Content calendar: 2 blog posts/week for 6 months | ⬜ | |
| 18-5 | 90-second product demo video | ⬜ | |
| 18-6 | Interactive demo (Storylane/Arcade, no sign-up needed) | ⬜ | |
| 18-7 | ProductHunt launch assets prepared | ⬜ | |
| 18-8 | **Agentic positioning:** "The world's first AI-native XM skill" — rewrite homepage hero, all 3 feature cards, and meta descriptions around skills + agentic use cases | ⬜ | Not "survey tool." Not "AI features." Skills that any agent can use. |
| 18-9 | 60-second agentic demo video: PM narrates, Claude Code does the full cycle live — survey → distribute → insights → workflow, zero UI clicks | ⬜ | The primary homepage video |
| 18-10 | Programmatic SEO: skill-specific landing pages — "Experient Survey Skill for Claude", "NPS Intelligence Skill", "Automated CX Workflow Skill" | ⬜ | |

### Sprint 19 — Sales Infrastructure & Launch (Weeks 39–40)

| ID | Task | Status | Notes |
|---|---|---|---|
| 19-1 | HubSpot CRM setup with pipeline stages | ⬜ | |
| 19-2 | Inbound demo request qualification flow | ⬜ | |
| 19-3 | Sales deck (15 slides) | ⬜ | |
| 19-4 | Trial-to-paid email sequence (7 emails, automated) | ⬜ | |
| 19-5 | In-app upgrade prompts at feature gates | ⬜ | |
| 19-6 | Champion referral program (500 credits per referral) | ⬜ | |
| 19-7 | Google Ads campaigns (search + competitor keywords) | ⬜ | |
| 19-8 | LinkedIn Ads (CX managers, VP Product at 50–5000 person cos) | ⬜ | |
| 19-9 | Reddit organic presence (r/CX, r/SaaS) | ⬜ | |
| 19-10 | G2 + Capterra profiles, first 20 reviews | ⬜ | |
| 19-11 | ProductHunt + HN launch posts | ⬜ | |
| 19-12 | Salesforce AppExchange listing | ⬜ | |
| 19-13 | HubSpot App Marketplace listing | ⬜ | |
| 19-14 | Agency partner program (reseller discount + white-label) | ⬜ | |
| 19-15 | Gartner + Forrester analyst briefings | ⬜ | |
| 19-16 | 10 design partner agreements (6 months free Business tier) | ⬜ | |
| 19-17 | Beta → GA announcement: blog + LinkedIn + ProductHunt | ⬜ | |
| 19-18 | Press outreach (TechCrunch, VentureBeat, CX Today) | ⬜ | |
| 19-19 | Launch webinar (60 min, live demo + Q&A) | ⬜ | |

---

## Phase 8 — Post-Launch Growth (Sprint 20+)

| ID | Task | Status | Notes |
|---|---|---|---|
| 20-1 | Customer success playbook (CS check-ins, QBR template) | ⬜ | |
| 20-2 | NRR tracking dashboard — target 110%+ | ⬜ | |
| 20-3 | Mobile app (React Native) | ⬜ | |
| 20-4 | Survey template marketplace (community + staff picks) | ⬜ | |
| 20-5 | Industry NPS benchmarking (anonymous aggregate) | ⬜ | |
| 20-6 | Predictive churn model for CSM alerts | ⬜ | |
| 20-7 | Enterprise AI fine-tuning on custom taxonomy | ⬜ | |

---

## Completed Tasks Log

*Tasks move here once marked 🧪 Done + Tested. Serves as a verified changelog.*

| ID | Task | Completed | Notes |
|---|---|---|---|
| — | No completed tasks yet | — | Start with P0-1 |

---

## Session History

| Date | Work Done |
|---|---|
| 2026-05-06 | i18n + constants migration for all 12 pages. ROUTES, colors, thresholds, locales/en.js, i18n hook. |
| 2026-05-06 | publishSurvey added to useSurveys. Launch Survey button in SurveyBuilderPage. Firestore index for publishToken. |
| 2026-05-07 | vite.config.js updated to include @tailwindcss/vite plugin (pending npm install). |
| 2026-05-07 | PRODUCT_PLAN.md written. 20-sprint roadmap, credit pricing model, GTM strategy, competitive analysis. |
| 2026-05-07 | TRACKER.md created (this file). |
| 2026-05-11 | Clerk auth end-to-end: fixed redirect flow, auth.jsx signOut, post-sign-in auto-redirect (useLayoutEffect), OnboardingPage with real Clerk org list + CreateOrganization modal, UserButton in TopBar, OrganizationSwitcher in SideNav, OrganizationProfile in Settings. @tailwindcss/vite installed. |
| 2026-05-11 | Sprint 2 expanded with enterprise role model: 3 roles (admin/analyst/viewer), 15 tasks covering Clerk Dashboard config, usePermissions hook, role gates, backend middleware. |
| 2026-05-11 | Agentic Skills strategy added: Sprint 7A (16 tasks — 4 PM specs + skill executor layer + credit metering + Cmd+K routing), Sprint 15A (12 tasks — MCP server, 5 MCP tools, Claude skill marketplace, GTM demo). PRODUCT_PLAN.md updated with agentic vision, four-skill architecture, PM-first design principle, and competitive table. |
| 2026-05-11 | Survey Data Model (Sprint 2B): researched 15 survey types, 30+ question types, all contextual enrichment fields (IP/geo/device/session/UTM/quality signals) across Medallia/InMoment/Typeform and other leading platforms. Designed 3-tier storage architecture (Firestore + BigQuery + Firebase Storage). Wrote SURVEY_DATA_MODEL.md with full TypeScript interfaces (Survey, Question, Block, Response, Answer, Distribution, LogicRule, EmbeddedDataField), collection hierarchy, compound indexes, and migration guide from current minimal schema. |
| 2026-05-11 | Local dev stack simplified: single docker-compose.yml (Postgres + Prometheus + Loki + Grafana), removed Supabase CLI dependency, Pino structured logging with optional Loki push, prom-client metrics with /api/metrics endpoint, Dockerfile + fly.toml added. |
| 2026-05-11 | Cloud strategy decided: GCP only. Fly.toml kept as reference but GCP is the path. Scaling stages documented: Firebase (now) → Cloud Run + Cloud SQL (~$10K MRR) → Cloudflare + Cloud Run (global). ICP added as watchlist item. 7 migration portability principles enforced as code patterns. PRODUCT_PLAN.md and TRACKER.md updated with full strategy. |
| 2026-05-13 | P0-2 TypeScript migration complete: 0 errors (down from 1599). All 72 .js/.jsx files converted to .ts/.tsx. Zod validation (P0-9) and rate limiting (P0-10) also complete from prior session. |
| 2026-05-12 | Survey backend fully rewritten: clean data model (templateId only, no template fields on survey), full audit trail (created_at/updated_at/updated_by/published_at/paused_at/closed_at/deleted_at), soft delete, status lifecycle timestamps, COALESCE publish. Org profile backend (org_profiles table, GET+PUT upsert). Fixed optimistic update bug for updated_at. Survey builder: settings panel shows template info read-only + editable fields (description/intent/thankYouMessage). Fixed SurveyCreationPage: "Edit in Builder" passes correct navigation state (intent/fromTemplate/templateId), "Launch Survey" now directly creates+publishes and shows success modal with share URL. All 13 question types implemented in fill page. Brand settings persisted to backend. 3D page transition animations (Framer Motion AnimatePresence + rotateX). Survey question card slide animations in fill page. LoadingStates components (Spinner, OverlayLoader, SurveyListSkeleton). Skeleton loading in SurveysListPage. Overlay loader for publish in builder. i18n strings added for all new UI text. |
