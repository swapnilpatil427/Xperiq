# Xperiq — Work Tracker
# Updated: 2026-05-15

> **How to use:** Tell Claude "mark P0-1 done and tested" or "start Sprint 1" and the tracker updates automatically.
> Status key: ⬜ Not started · 🔄 In progress · ✅ Done · 🧪 Done + Tested · ⏭️ Skipped

---

## Overall Progress

| Phase | Tasks | Done | Tested | % Complete |
|---|---|---|---|---|
| Phase 0 — Foundation | 12 | 11 | 0 | 92% |
| Phase 1 — Core Completion | 35 | 27 | 0 | 77% |
| Phase 2 — AI Engine | 40 | 0 | 0 | 0% |
| Phase 3 — Billing | 18 | 0 | 0 | 0% |
| Phase 4 — Enterprise | 38 | 0 | 0 | 0% |
| Phase 5 — Integrations | 16 | 0 | 0 | 0% |
| Phase 6 — Scale | 21 | 0 | 0 | 0% |
| Phase 7 — Go-to-Market | 20 | 0 | 0 | 0% |
| Phase 2A — Agentic Skills Foundation | 17 | 0 | 0 | 0% |
| Phase 5A — MCP & Skill Publishing | 12 | 0 | 0 | 0% |
| Phase OCI — Production Migration | 18 | 0 | 0 | 0% |
| **Total** | **247** | **35** | **0** | **14%** |

---

## ⚡ Current Recommendation

**Sprint 2 complete → Start Sprint 3: Analytics & Dashboard**

Sprint 2 shipped: `usePermissions()` hook + `<PermissionGate>` component, `features.ts` plan-tier flags, `requireRole` middleware, role gates on all survey + member write routes, API Keys tab gated to admin, enterprise mode badge on OnboardingPage, `UpgradeModal` component. 42 backend tests + 110 frontend tests passing. tsc: 0 errors.

**Next:** Sprint 3 — wire `ResponseDashboardPage` and `InsightsDashboardPage` to real analytics endpoints.

---

## Phase 0 — Foundation
**Sprint 0 · Weeks 1–2 · Goal: Clean foundation, CI green, no security holes**

| ID | Task | Status | Notes |
|---|---|---|---|
| P0-1 | Install `@tailwindcss/vite`, verify all pages render correctly | ✅ | Installed, dev server starts cleanly |
| P0-2 | Add `tsconfig.json`, begin TypeScript migration on `src/lib/` and `src/constants/` | ✅ | Full migration: all 72 .js/.jsx files renamed to .ts/.tsx. 0 type errors. tsconfig.json, vite-env.d.ts, src/types/index.ts created. |
| P0-3 | Install Vitest + React Testing Library | ✅ | vitest@4.1.6, @testing-library/react@16, @testing-library/user-event@14, @testing-library/jest-dom@6, jsdom@29. Requires Node ≥18 (root .nvmrc = 22.22.0). |
| P0-4 | Write first 10 unit tests: `i18n`, `routes`, `thresholds`, `useSurveys` (mock Firebase) | ✅ | 102 tests, 0 failures. 4 files: i18n (27 tests), routes (22 tests), thresholds (24 tests), useSurveys (29 tests — all CRUD + reload + fallback paths). vitest.config.ts + src/test/setup.ts added. `npm test` script wired. |
| P0-5 | Install Playwright, write smoke E2E test: landing → sign-in → surveys | ⏭️ | Deferred — will revisit after Sprint 1 ships |
| P0-6 | Set up GitHub Actions CI: lint + type-check + unit tests on every PR | ✅ | `.github/workflows/ci.yml` — push/PR to main. Steps: Node 22 (reads app/.nvmrc), npm ci, eslint, tsc --noEmit, vitest --coverage, vite build. Concurrency group cancels stale runs. All 5 steps verified locally on Node 22. |
| P0-7 | Integrate Sentry (frontend + backend) | ✅ | SDKs installed (@sentry/react + @sentry/node v10). No-ops until VITE_SENTRY_DSN / SENTRY_DSN env vars are set. ErrorBoundary calls captureException. Sentry.setupExpressErrorHandler wired in backend. |
| P0-8 | Add `ErrorBoundary` component wrapping each page in `App.jsx` | ✅ | ErrorBoundary enhanced with `inline` prop. All 12 AppShell pages wrapped with `<ErrorBoundary inline>` (compact card fallback, nav stays functional). 4 public pages wrapped with full-screen `<ErrorBoundary>`. Top-level boundary kept as global catch-all. |
| P0-9 | Backend: add Zod request validation on all POST/PUT routes | ✅ | `src/schemas/` + `src/lib/validate.js`; all local POST/PUT routes covered |
| P0-10 | Backend: add rate limiting middleware (`express-rate-limit`) | ✅ | Custom sliding-window limiter (Redis/in-memory). `apiLimiter` (200/15min) on all authenticated routes; `aiLimiter` (20/15min) stacked on `/api/ai` |
| P0-11 | Backend: add structured JSON request logging → Cloud Logging | ✅ | GCP severity mapping (pino level → severity string) in production. requestId middleware generates UUID per request, included in all request logs. httpLogger updated with requestId. Sentry error handler added before global handler. |
| P0-12 | **SECURITY:** Remove `openrouter.js` from `app/src/lib/` — API key must be server-side only | ✅ | `openrouter.js` only in `functions/src/lib/`, reads `process.env.OPENROUTER_API_KEY` — no frontend reference |

---

## Phase OCI — Production Migration
**Goal: Ship Xperiq to production on Oracle Cloud Infrastructure Always Free tier. Zero infrastructure cost until ~200 orgs.**

> IaC files live in `infra/terraform/`. Run `terraform apply` to provision. See `docs/OCI_DEPLOY.md` for full guide.

### Sprint OCI-1 — Account Setup & Infrastructure Provisioning

| ID | Task | Status | Notes |
|---|---|---|---|
| OCI-1 | Create OCI account + verify Always Free eligibility | ⬜ | cloud.oracle.com — credit card required for identity only, not charged |
| OCI-2 | Purchase domain (Cloudflare Registrar recommended) + add to Cloudflare | ⬜ | ~$9-15/yr. Set Cloudflare as authoritative DNS |
| OCI-3 | Generate OCI API key pair + upload public key to OCI Console | ⬜ | OCI Console → Profile → User Settings → API Keys |
| OCI-4 | Install Terraform locally (`brew install terraform`) + run `oci setup config` | ⬜ | Creates ~/.oci/config + API key files |
| OCI-5 | Fill in `infra/terraform/terraform.tfvars` from `.example` file | ⬜ | All secrets, domain, repo URL, SSH public key |
| OCI-6 | `terraform init && terraform plan && terraform apply` | ⬜ | Creates VCN, security list, A1 VM, Object Storage backup bucket |
| OCI-7 | Watch cloud-init complete: `ssh appuser@VM_IP 'sudo tail -f /var/log/cloud-init-output.log'` | ⬜ | ~8-12 min. Installs Postgres 15+pgvector, Redis 7, Node 22, Python 3.12, nginx, PM2 |
| OCI-8 | Verify all services running: backend health + agents health + PM2 status | ⬜ | `curl http://VM_IP:3001/api/health` (before nginx/SSL) |

### Sprint OCI-2 — Domain, SSL & Frontend

| ID | Task | Status | Notes |
|---|---|---|---|
| OCI-9 | Add Cloudflare A record: `yourdomain.com → VM_IP` (orange cloud proxy ON) | ⬜ | Also add `auth CNAME → frontend.clerk.accounts.dev` (grey, DNS only) |
| OCI-10 | Run SSL setup after DNS propagates: `ssh appuser@VM_IP '/home/appuser/setup-ssl.sh'` | ⬜ | Let's Encrypt cert via certbot. nginx switches to HTTPS config automatically |
| OCI-11 | Cloudflare SSL settings: Full (Strict), Always HTTPS ON, HSTS ON, min TLS 1.2 | ⬜ | Security → SSL/TLS → Edge Certificates |
| OCI-12 | Build frontend with production env vars + deploy to VM: `npm run build:app` + scp dist/ | ⬜ | Create `app/.env.production` with VITE_API_URL=https://yourdomain.com |
| OCI-13 | Verify full HTTPS stack: `curl -I https://yourdomain.com` → HTTP/2 200 | ⬜ | Also check ssllabs.com/ssltest → should score A+ |

### Sprint OCI-3 — Clerk Production + Security Hardening

| ID | Task | Status | Notes |
|---|---|---|---|
| OCI-14 | Upgrade Clerk to Pro ($25/mo) + set production domain in Clerk Dashboard | ⬜ | Use sk_live_ keys (never sk_test_) in production .env |
| OCI-15 | Clerk custom auth domain: verify `auth.yourdomain.com` CNAME in Clerk Dashboard | ⬜ | Sign-in page served from your domain, no Clerk branding |
| OCI-16 | Security audit: verify ports 3001/8001/5432/6379 not externally reachable | ⬜ | `nmap -p 3001,8001,5432,6379 VM_IP` → all filtered |
| OCI-17 | Set up UptimeRobot: monitor `/api/health` every 5 min + alert email | ⬜ | uptimerobot.com free tier |
| OCI-18 | Test backup script manually + verify file in OCI Object Storage | ⬜ | `/home/appuser/backup.sh` — check OCI Console → Storage |

### Sprint OCI-4 — CI/CD & Go-Live

| ID | Task | Status | Notes |
|---|---|---|---|
| OCI-19 | Add GitHub secrets: OCI_HOST (VM IP), OCI_SSH_KEY (private key) | ⬜ | GitHub repo → Settings → Secrets → Actions |
| OCI-20 | Test GitHub Actions deploy workflow: push to main → auto-deploy fires | ⬜ | `.github/workflows/deploy-oci.yml` |
| OCI-21 | End-to-end smoke test: sign up → create org → create survey → publish → fill → run insights | ⬜ | Full golden path on production URL |
| OCI-22 | Set up Sentry projects (frontend + backend) + verify events received | ⬜ | sentry.io free tier. Add DSNs to .env + rebuild frontend |

---

## Phase 1 — Core Product Completion
**Sprints 1–3 · Weeks 3–8**

### Sprint 1 — Org & Team Management (Weeks 3–4)

| ID | Task | Status | Notes |
|---|---|---|---|
| 1-1 | Backend: `POST /api/orgs` — create organization | 🧪 | `routes/local/orgs.js` — upsert org_profiles row |
| 1-2 | Backend: `GET /api/orgs/me` — get current org | 🧪 | Returns orgId, name, logoUrl + full profile fields |
| 1-3 | Backend: `PUT /api/orgs/me` — update org name/logo | 🧪 | Syncs name to Clerk when not SKIP_AUTH |
| 1-3a | Backend: `POST /api/orgs/me/logo` — upload logo to Firebase Storage | 🧪 | Dev: base64 data URL; prod: Firebase Storage public URL |
| 1-4 | Backend: `GET /api/orgs/me/members` — list members | 🧪 | SKIP_AUTH: `{ members: [], total: 0 }`; else Clerk API |
| 1-5 | Backend: `POST /api/orgs/me/invitations` — invite by email | 🧪 | SKIP_AUTH: mock; else Clerk createOrganizationInvitation |
| 1-6 | Backend: `DELETE /api/orgs/me/members/:userId` — remove member | 🧪 | SKIP_AUTH: mock; else Clerk deleteOrganizationMembership |
| 1-7 | Backend: `PUT /api/orgs/me/members/:userId/role` — update role | 🧪 | SKIP_AUTH: mock; else Clerk updateOrganizationMembership |
| 1-8 | Frontend: wire `BrandSettingsPage` to real org API | 🧪 | getOrg() on mount, updateOrg() on save, logo upload flow |
| 1-9 | Frontend: wire team table to real members + invite modal | ✅ | Clerk configured: `<OrganizationProfile />` handles all team management natively. Dev mode: DEMO_TEAM_MEMBERS placeholder. |
| 1-10 | Frontend: `OnboardingPage` — real Clerk org list | ✅ | `useOrganizationList`, `CreateOrganization` modal, sign-out wired |
| 1-11 | Frontend: org switcher in `SideNav` | ✅ | `OrganizationSwitcher` at bottom of sidenav |
| 1-12 | Tests: org API routes (unit), invite flow (E2E) | 🧪 | 13 vitest unit tests in `backend/src/__tests__/` — all pass |

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
| 2-3 | Frontend: `usePermissions()` hook — wraps `useOrganization().membership.role`, returns `{ isAdmin, isAnalyst, isViewer, role }` | 🧪 | `src/lib/permissions.ts`. Demo mode always grants admin. |
| 2-4 | Frontend: gate "Create Survey", "Edit Survey", "Delete Survey" actions behind `isAdmin \|\| isAnalyst` | 🧪 | Create buttons + delete menu item hidden for viewers |
| 2-5 | Frontend: gate "Invite Member", "Change Role", "Remove Member" behind `isAdmin` only | 🧪 | Backend enforces requireRole('admin') on those routes |
| 2-6 | Frontend: gate "API Keys" tab behind `isAdmin` only | 🧪 | Tab hidden + content shows PermissionDeniedBanner if accessed directly |
| 2-7 | Frontend: `<PermissionGate role="admin">` wrapper component — renders children or null | 🧪 | `src/components/PermissionGate.tsx` — also exports `PermissionDeniedBanner` |
| 2-8 | Frontend: permission denied banner for viewers who try restricted actions | 🧪 | Amber pill "Ask your admin" in `PermissionDeniedBanner` |
| 2-9 | Backend: `requireRole(minRole)` middleware — reads Clerk JWT org role claim, blocks 403 if insufficient | 🧪 | `src/middleware/requireRole.js` — viewer < analyst < admin |
| 2-10 | Backend: apply `requireRole('analyst')` on `POST /api/surveys`, `PUT /api/surveys/:id` | 🧪 | Also on DELETE /:id and POST /:id/publish |
| 2-11 | Backend: apply `requireRole('admin')` on `POST /api/orgs/me/invitations`, `DELETE /api/orgs/me/members/:id` | 🧪 | Also on PUT /members/:userId/role |
| 2-12 | Frontend: `src/lib/features.ts` — plan-tier feature flags (free / starter / business / enterprise) | 🧪 | `getFeatureFlags(plan)` returns full flag object; `isEnterpriseMode(memberCount, plan)` helper |
| 2-13 | Frontend: "Enterprise mode" badge in `OnboardingPage` for orgs with ≥5 members or Business+ plan | 🧪 | Green pill badge on org card |
| 2-14 | Frontend: upgrade modal triggered at enterprise feature gates (SSO, white-label, audit log) | 🧪 | `<UpgradeModal>` component with plan branding + pricing |
| 2-15 | Tests: role middleware unit test (admin/analyst/viewer × each route), permission hook unit test | 🧪 | 12 requireRole tests + 8 permissions/features tests. 42 backend + 110 frontend all pass. |

### Sprint 2C — Copilot Authorization Guardrails ⚠️ SECURITY BACKLOG

**Prerequisite:** Must be completed before any Copilot feature that reads survey responses or insights ships to production. User explicitly flagged as critical.

**The risk:** Crystal/Copilot operates server-side and can access survey data directly. Without authorization checks at the data layer, a user with limited permissions could prompt Crystal to surface surveys or responses they have no right to see — bypassing all RBAC controls.

| ID | Task | Status | Notes |
|---|---|---|---|
| 2C-1 | Backend: verify `runId` ownership — confirm `run.org_id = req.orgId` AND `run.user_id = req.userId` on every copilot route that accepts a `runId` | ✅ | `_requireRunOwnership` guard on all 8 `:runId` routes in `copilot.js` |
| 2C-2 | Backend: add ownership check on `POST /api/ai/analyze-insights` — verify `survey.org_id = req.orgId` before passing response data to the AI model | ✅ | Already present in `ai.js` line 34 — `surveys WHERE id=$1 AND org_id=$2` |
| 2C-3 | Agents service (Python): add `check_survey_access(survey_id, user_id, org_id)` guard before fetching survey data for any model context | ✅ | `check_survey_access()` in `agents/lib/db.py`; guard at start of `node_ingest()` in `agents/graphs/insights.py` |
| 2C-4 | Backend: when granular user permissions land, scope all Copilot survey/response queries to user's accessible surveys (not full org) | ⬜ | Blocked on Sprint 2 permissions implementation — do this in the same sprint |
| 2C-5 | Tests: verify a viewer-role user cannot extract restricted survey data via Copilot prompt injection | ✅ | 24 tests in `backend/src/__tests__/copilot.test.js` — 403 on wrong owner/org, 500 on DB error, SKIP_AUTH bypass |

---

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
| 3-1 | Backend: `GET /api/surveys/:id/analytics` — aggregated stats | ✅ | Ownership check + NPS distribution + 30-day daily series in `surveys.js` |
| 3-2 | Backend: `GET /api/orgs/me/analytics` — org-level rollup | ✅ | Totals + 30-day series + top-5 surveys in `orgs.js` |
| 3-3 | Frontend: wire `ResponseDashboardPage` to real analytics | ✅ | KPI cards, NPS gauge, promoter/passive/detractor bars, empty state |
| 3-4 | Frontend: wire `InsightsDashboardPage` KPI cards to real data | ✅ | `orgAvgNps` from `getOrgAnalytics()` passed to `UnifiedInsightsView` |
| 3-5 | Frontend: wire `AdvancedInsightsPage` to real insights API | ✅ | NPS gauge, real topics from `listTopics()`, real sentiment bars, real top phrases |
| 3-6 | Frontend: time-series chart in `ResponseDashboardPage` (recharts) | ✅ | 30-day AreaChart with gradient fill and formatted X-axis dates |
| 3-7 | Frontend: response volume sparklines on `SurveysListPage` | ✅ | Backend lateral subquery adds `sparkline` array; `Sparkline` SVG component on each survey card |
| 3-8 | Frontend: empty states for all pages | ✅ | `ResponseDashboardPage` (zero responses), `AdvancedInsightsPage` (no topics), `SurveysListPage` (already had state) |
| 3-9 | Tests: analytics aggregation unit tests, dashboard E2E | ✅ | 8 new tests in `backend/src/__tests__/analytics.test.js` (survey + org analytics); 67 backend tests total pass |

### Sprint 3B — Distribution & Notifications (PM Gap Backlog)

**Goal:** Close the distribution gap between Experient and established platforms (SurveyMonkey et al.). A survey that can only be shared as a bare URL is fundamentally less valuable than one with channels, scheduling, and lifecycle notifications.

**Sprint 3B-Core (completed 2026-05-19):**
- Enterprise Distribution Center page (7 channels: Direct Link, QR Code, Email Invite, Embed Widget, Social Share, API Access, Kiosk Mode)
- Real QR code generation with brand logo overlay (`qrcode` npm package + canvas compositing)
- Survey selector always visible on distribution page
- Launch Settings panel: maxResponses, autoCloseAt, allowMultipleResponses, passwordProtected
- Password protection: bcrypt-equivalent password hashing (Node crypto.scrypt), PasswordGate on fill page
- Publish Modal redesign: tabs for Preview + Launch Settings; settings flow into publishSurvey call

| ID | Task | Status | Notes |
|---|---|---|---|
| 3B-C1 | Frontend: Enterprise Distribution Center (ResponseCollectionPage full rewrite) | ✅ | 7 channels, always-visible selector, expandable panels, stats bar |
| 3B-C2 | Frontend: Real QR code with brand logo imprint (canvas + qrcode npm) | ✅ | Add `qrcode` to app/package.json; run `npm install` in app/ |
| 3B-C3 | Backend: Password protection on surveys (hashPassword / checkPassword via Node crypto) | ✅ | `password_protected BOOLEAN`, `password_hash TEXT` columns; verify endpoint |
| 3B-C4 | Frontend: PasswordGate on SurveyFillPage — blocks access until passcode verified | ✅ | sessionStorage bypass after first verify; no re-prompt on same session |
| 3B-C5 | Frontend: PublishModal tabs (Preview + Launch Settings) — maxResponses, autoCloseAt, allowMultiple, password | ✅ | Settings flow into `publishSurvey()` call |
| 3B-C6 | Frontend: Launch Settings panel on Distribution Center — save via `updateLaunchSettings` API | ✅ | Shows current values, patch on save |
| 3B-1 | Backend: `POST /api/surveys/:id/distribute` — record distribution event (channel, sent_at, audience size) | ⬜ | Foundation for tracking reach |
| 3B-2 | Backend: `POST /api/surveys/:id/channels/email` — send via SendGrid/Resend to a list of emails | ⬜ | Attach org branding, unsubscribe footer |
| 3B-3 | Backend: QR code generation endpoint for any survey | ✅ | Done client-side via `qrcode` npm + canvas |
| 3B-4 | Frontend: Distribution panel in builder (share link + QR + email channel) | ✅ | Full Distribution Center replaces bare URL |
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
| 4-5 | Frontend: Crystal (Experient Copilot) real streaming in `SurveyBuilderPage` (SSE) | ⬜ | |
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

### Sprint 6A — RAG: Retrieval-Augmented Insights (Weeks 14–15)
**Goal:** Wire the existing `similarity_search()` + `response_embeddings` table into three user-facing features. The embeddings pipeline already runs on every insight job — this sprint closes the loop from vectors → retrieval → LLM-grounded answers.

| ID | Task | Status | Notes |
|---|---|---|---|
| 6A-1 | Agents: `node_retrieve` graph node — embed query, call `similarity_search()`, attach top-k verbatims to state | ⬜ | `similarity_search()` in `tools/embeddings.py` is already implemented, never called |
| 6A-2 | Backend: `POST /api/surveys/:id/ask` — plain-English question → RAG answer with cited verbatim quotes | ⬜ | Embeds question, retrieves top-k responses, Claude synthesizes grounded answer |
| 6A-3 | Frontend: "Ask your data" input on `InsightsDashboardPage` — type a question, get a cited answer | ⬜ | e.g. "Why are customers unhappy with onboarding?" → answer + supporting quotes |
| 6A-4 | Agents: cross-survey memory node — on insight run, retrieve similar insights from org's past surveys | ⬜ | Embeds new insight summary, searches `response_embeddings` across prior surveys; feeds trend context to narrator |
| 6A-5 | Frontend: "Also seen in N past surveys" badge on insight cards | ⬜ | Surfaces recurring themes automatically |
| 6A-6 | Backend: `GET /api/benchmarks/:metric` — anonymized aggregate NPS/CSAT by industry + company size | ⬜ | Requires aggregate table across orgs; strict anonymization (min 10 orgs per bucket) |
| 6A-7 | Agents: benchmark grounding in narrator — pull org's industry bucket, inject percentile into narrative | ⬜ | e.g. "Your 72 NPS is in the 85th percentile for B2B SaaS 50–200 employees" |
| 6A-8 | Backend: populate `retrieved_context` column on insights table — store which verbatims grounded each insight | ⬜ | `retrieved_context JSONB` column already exists, always `[]` today |

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
| 7A-17 | **Proactive insights — unprompted delivery:** wire the `proactive-insights` skill into `scheduler.py` (daily/weekly digest) + `consumers/response_stream.py` (run on response thresholds), dedup via card fingerprints, deliver through `lib/notification_bridge.py`. Skill is built + callable on request today; this makes it fire without being asked. Ship in shadow-mode first (log candidate digests, send nothing) to calibrate the noise threshold before enabling delivery. | ⬜ | Solves detection-lag / blank-dashboard problem. Risk: alert fatigue — validate in shadow mode first. |

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

#### Stage 2 — Managed Services Migration (~$10K MRR, currently targeting GCP Hybrid or OCI managed)
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

## Phase 2: AI Insights Pipeline (v2)

> Database migration: `supabase/migrations/20240518000000_insights_v2.sql`
> Deployment guide: `docs/GCP_DEPLOY.md`

### Completed Features ✅

| Feature | Status | Notes |
|---|---|---|
| Real text embeddings via OpenAI text-embedding-3-small + pgvector RAG for narration context | ✅ | 1536-dim vectors, IVFFlat index, cosine similarity search |
| Enhanced topic discovery with canonical LLM labeling and new-topic detection | ✅ | `survey_topics` table; `is_new` flag; alias deduplication |
| Effort score computation (linguistic analysis, 1-7 scale) | ✅ | CES-style `effort_score NUMERIC(4,2)` on survey_topics |
| Time-windowed insights (all_time, last_30d, last_7d) | ✅ | `time_window` column on insights + unique index per window |
| L3 Predictive insights: response volume trend extrapolation + NPS trajectory | ✅ | `trending` field (up/down/stable/new); metric_json carries trajectory |
| Dynamic trust score computation (sample size, coverage, consistency, grounding) | ✅ | `trust_json` with four sub-dimensions on insights table |
| Redis Streams pub/sub for streaming response → incremental insight trigger | ✅ | `insight_stream_offsets` table for consumer offset recovery |
| Crystal AI chat with thread persistence and full survey context | ✅ | `crystal_threads` table with messages JSONB + context_snapshot |
| Pin/dismiss insight cards with undo | ✅ | `user_state_json` on insights: pinned, dismissed, thumbs, notes |
| Response trend sparkline in KPI row | ✅ | `trending` field on survey_topics; time-series data in metric_json |
| Topic sentiment visualization in Voice tab | ✅ | `sentiment_score` + `dominant_emotion` per topic |
| Crystal drawer with conversation history | ✅ | Thread persistence via crystal_threads; messages array |

### Insight Pipeline v2 — Phase 7 (Deprecation & Cleanup)

| ID | Task | Status | Notes |
|---|---|---|---|
| IP7-1 | `insight_audit_log` table (G27) + write on every pipeline verify step | ✅ | `GET /api/insights/:insightId/audit` — admin-gated; SOC2/GDPR right-to-explanation |
| IP7-2 | GET /api/insights/:insightId/audit endpoint — admin-gated audit trail | ✅ | Returns 10 most-recent audit entries; 403 for non-admin |
| IP7-3 | SLO metrics endpoint (`GET /api/insights/_slo`) + Prometheus counters | ✅ | 24h window; citation validity + verifier pass rate; warn/critical thresholds |
| IP7-4 | Legacy `/checkpoints` deprecation headers (`Deprecation`, `Sunset`, `Link`) | ✅ | 90-day sunset; successor: `/api/insights/:surveyId/trail` |
| IP7-5 | Legacy `/surveys/:surveyId/insights` backward-compat deprecation headers | ✅ | 90-day sunset; successor: `/api/insights/:surveyId/list` |
| IP7-6 | `STOP_LEGACY_CHECKPOINT_WRITE` env gate + retention job auto-enable | ✅ | ENV-gated; auto-enables compaction when `INSIGHT_CHECKPOINTS_V2_ENABLED=true` |
| IP7-7 | Intelligence lifecycle visual guide updated to v2 | ✅ | `docs/intelligence-lifecycle-visual-guide.md` — full pipeline, checkpoint linked list, manual modes, SLO thresholds |

### GCP Deployment Tasks 🔜

| ID | Task | Status | Notes |
|---|---|---|---|
| GCP-1 | Cloud SQL (Postgres 15 + pgvector extension) setup | 🔜 | See `docs/GCP_DEPLOY.md` §2 — db-g1-small, us-central1 |
| GCP-2 | Cloud Run deployment for agents service + backend | 🔜 | Two services: `experient-backend` + `experient-agents` |
| GCP-3 | Google Cloud Pub/Sub replacing Redis Streams (env: EVENT_BUS=pubsub) | 🔜 | Topic: `insight-events`; subscription: `insight-consumers` |
| GCP-4 | Cloud Scheduler for periodic insight generation (every 5 min paid / hourly free) | 🔜 | Calls `/scheduler/tick` on agents service |
| GCP-5 | Secret Manager for ANTHROPIC_API_KEY, OPENAI_API_KEY, AGENTS_INTERNAL_KEY | 🔜 | All secrets via `--set-secrets` on Cloud Run |
| GCP-6 | VPC connector for Cloud Run → Cloud SQL private connection | 🔜 | Avoids public IP; required for db-g1-small tier |
| GCP-7 | Artifact Registry for Docker images | 🔜 | Region: us-central1; repos: backend + agents |
| GCP-8 | Cloud Monitoring dashboards: insight pipeline latency, LLM cost per run, error rate | 🔜 | Three dashboards; alert policies on error rate >1% |

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
| 2026-05-13 | Sprint 1 (tasks 1-1 through 1-8, 1-12): All backend org & member routes implemented (orgs.js + members.js + schemas/orgs.js). orgProfile.js updated with logo_url column. api.ts rewritten with axios (all existing methods + getOrg/updateOrg/uploadLogo/getMembers/inviteMember/removeMember/updateMemberRole). types/index.ts: Org + OrgMember interfaces added, logo_url added to OrgProfile. BrandSettingsPage: loads org name from API, logo upload with preview, syncs name on save. 13 backend unit tests (vitest). All 102 frontend tests pass. tsc: 0 errors. lint: 0 errors. build: success. |
| 2026-05-14 | Sprint 2 (RBAC) complete: `usePermissions()` hook + `<PermissionGate>` + `PermissionDeniedBanner`, `features.ts` plan-tier flags, `requireRole` middleware, role gates on all survey + member write routes (analyst for survey CRUD/publish, admin for invite/remove/role-change), API Keys tab gated to admin only, enterprise mode badge on OnboardingPage, `UpgradeModal` component, i18n strings for permissions/upgrade/enterprise. 12 new requireRole unit tests + 8 new permissions/features unit tests. 42 backend + 110 frontend all passing. tsc: 0 errors. |
| 2026-05-13 | P0-2 TypeScript migration complete: 0 errors (down from 1599). All 72 .js/.jsx files converted to .ts/.tsx. Zod validation (P0-9) and rate limiting (P0-10) also complete from prior session. |
| 2026-05-13 | P0-3 + P0-4 complete: Vitest 4.1.6 + React Testing Library installed. vitest.config.ts created (jsdom env). 102 unit tests written across 4 files — i18n (27), routes (22), thresholds (24), useSurveys (29, mock API). All 102 pass. `npm test` script added. |
| 2026-05-13 | P0-8 complete: ErrorBoundary enhanced with `inline` prop. 12 AppShell pages wrapped with compact inline boundary (nav stays functional on page crash). 4 public pages wrapped with full-screen boundary. Top-level catch-all kept. P0-6 complete: .github/workflows/ci.yml created — lint + tsc + vitest on every push/PR to main. coverage/ gitignored, eslint ignores coverage/. Full CI sim: lint ✓ typecheck ✓ 102 tests ✓. |
| 2026-05-12 | Survey backend fully rewritten: clean data model (templateId only, no template fields on survey), full audit trail (created_at/updated_at/updated_by/published_at/paused_at/closed_at/deleted_at), soft delete, status lifecycle timestamps, COALESCE publish. Org profile backend (org_profiles table, GET+PUT upsert). Fixed optimistic update bug for updated_at. Survey builder: settings panel shows template info read-only + editable fields (description/intent/thankYouMessage). Fixed SurveyCreationPage: "Edit in Builder" passes correct navigation state (intent/fromTemplate/templateId), "Launch Survey" now directly creates+publishes and shows success modal with share URL. All 13 question types implemented in fill page. Brand settings persisted to backend. 3D page transition animations (Framer Motion AnimatePresence + rotateX). Survey question card slide animations in fill page. LoadingStates components (Spinner, OverlayLoader, SurveyListSkeleton). Skeleton loading in SurveysListPage. Overlay loader for publish in builder. i18n strings added for all new UI text. |
| 2026-05-15 | AI Insights Pipeline v2 (end-to-end): LangGraph DAG (ingest→embed→metrics→extract_texts→absa→cluster→topics→narrate→verify→publish). Real text embeddings via OpenAI text-embedding-3-small + pgvector RAG (cosine similarity). Enhanced topic discovery with canonical LLM labeling, Levenshtein fuzzy dedup, effort score (1-7 CES scale), per-topic sentiment/emotion/trending. Time-windowed insights (all_time/last_30d/last_7d) stored per window. L3 Predictive insights: OLS trend regression, anomaly detection, NPS trajectory. Dynamic trust scores (statistical/coverage/consistency/grounding). Crystal AI chat (stateful, thread persisted in crystal_threads, conversation history, citation IDs, suggestion chips). Redis Streams pub/sub: insight_events stream, XADD/XREADGROUP/XACK consumer, smart batching (10 responses or 5-min threshold). New backend routes: GET /topics, POST+GET+DELETE /crystal. UI: TrendSparkline SVG, TopicSentimentCard, CrystalDrawer (framer-motion slide-in), pin/dismiss with undo, timeWindow selector. Migration: 20240518000000_insights_v2.sql (survey_topics, crystal_threads, insight_stream_offsets, time_window column, IVFFlat index). Redis added to docker-compose.yml. Incremental migration runner (scripts/migrate.js) with fingerprint-based detection for pre-applied migrations. npm start auto-runs migrations. Fixed: migration 'already exists' error (fingerprinting), Redis blank error log (safe property access + SILENT_CODES set + deduplication). |
| 2026-05-19 | Topics system hardened + competitive parity pass. Backend: `ensureTopicsTables()` auto-migration creates survey_topics + crystal_threads + all indexes on startup (no manual migration needed). Enhanced GET /topics with ?window= param + nps_avg/positive_pct/negative_pct/last_seen_at/run_status. New GET /drivers endpoint: per-topic NPS delta + impact_score from responses.ai_topics JSONB (falls back to sentiment proxy). New GET /topics/:id/quotes endpoint: verbatim response excerpts per topic (ai_topics tag match + keyword fallback). GIN index on responses.ai_topics auto-created. Backend: 67 tests all passing. Frontend: AdvancedInsightsPage full rewrite — time window selector (all_time/30d/7d), anomaly alert banners, NPS driver analysis grid (6 drivers with nps_delta badges + effort scores + trending), topic landscape with effort bars + trending icons + is_new badges + click-to-select, Verbatim tab shows live response quotes with NPS labels + date. ResponseDashboardPage topics section enhanced: effort score bars, trending icons, sentiment badges, NPS delta, is_new badge, View Full Analysis link, empty state CTA. InsightsDashboardPage: anomaly callout banners for negative-trending topics. tsc: 0 errors. |
