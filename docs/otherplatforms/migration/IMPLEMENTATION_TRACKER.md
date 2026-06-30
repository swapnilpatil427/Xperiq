# Prism — Implementation Tracker (TEMPORARY / working)

**Status:** 🚧 In progress · **Started:** 2026-06-29 · **Owner:** orchestration (Anders Holm + team)
**Purpose:** drive the end-to-end build so **no functionality is left**. Docs are already done
([README.md](./README.md)); this tracks *code*. Delete when implementation is merged & green.

> ⚠️ **Verification constraint:** the dev sandbox shell cannot spawn (`E2BIG`), so this code is
> written to match conventions but **NOT run/built/tested here**. Every item marked ✅ means
> "code written & self-consistent," NOT "executed." A build + `tsc --noEmit` + tests +
> migrations pass on a real machine is the final gate (tracked as V1–V5).

**Legend:** ⬜ todo · 🔧 in progress · ✅ code written (unverified) · 🧪 verified · ⛔ blocked

---

## W0 — Foundations & contracts
- ✅ W0.1 Extract exact codebase conventions — captured (db `query/pool`, `validate`+Zod, `requireAuth/requireRole`, `agentsClient`, `ROUTES/toPath`, `useApi`+coerce, DataBus, locales, skill dirs auto-register, FastAPI + `crystalos/lib/db`). *Implementers must confirm exact symbol names in their layer.*
- ✅ W0.2 Shared contract `backend/src/types/prism.ts` — entities (match migrations), PrismConnector + manifest, SDK helper sigs, API DTOs. **Read-only for implementers.**
- ⬜ W0.3 Mirror FE types in `app/src/types/prism.ts` — *Elena*

## W1 — Database ✅ (3 migrations written; ⚠ verify filename-prefix style + `unified_feedback` view column names on a real machine)
- ⬜ W1.1 `prism_connections` (+ `mode`, `history_window`, `credential_ref`, status) — *Diego*
- ⬜ W1.2 `prism_jobs` (state machine, cursor, counts, error)
- ⬜ W1.3 `prism_raw_records` (lossless log, payload_hash, `ingress`, `poison`, source_observed_at, unique extract key, DLQ index)
- ⬜ W1.4 `prism_mappings` (versioned, schema_shape_hash)
- ⬜ W1.5 `prism_dryrun_report`, `prism_recon_report`
- ⬜ W1.6 `prism_sync_state` (cursor, lag, freshness_slo, poll_cadence, consecutive_fail, webhook_secret_ref, paused)
- ⬜ W1.7 `insight_checkpoints_v2` bitemporal cols (period_start/end, as_of, superseded_at) — additive if table exists
- ⬜ W1.8 `prism_record_errors` (poison/DLQ)
- ⬜ W1.9 `unified_feedback` view/table (responses + signals) + `feedback_provenance` / `insight_response_citations`
- ⬜ W1.10 Canonical-table additions: `responses`/`signals` `metadata.prism` partial unique nat-key indexes; `surveys.metric_method`
- ⬜ W1.11 Identity graph tables (`prism_identity_edges`, `xperiq_person_id`)

## W2 — Backend ingestion engine (`backend/src/lib/prism/`)
- ⬜ W2.1 `connector.ts` — `PrismConnector` interface + manifest types + SDK helper signatures
- ⬜ W2.2 `engine.ts` — pipeline orchestrator (stages CONNECT…PUBLISH), job state machine, Redis queues
- ⬜ W2.3 `extract.ts` + raw-log writer (idempotent, hash-aware, provenance, advisory-lock guard)
- ⬜ W2.4 `transform.ts` — apply mapping → canonical staging
- ⬜ W2.5 `load.ts` — natural-key upsert (advisory lock + source-time monotonicity guard), batched txns, COPY→staging→MERGE path
- ⬜ W2.6 `reconcile.ts` — counts + checksums vs source → recon report
- ⬜ W2.7 `dryrun.ts` — diff + metric parity + parity explainer
- ⬜ W2.8 `ratelimit.ts` — Redis token bucket per connection
- ⬜ W2.9 `backpressure.ts` — staging watermarks + fair queuing
- ⬜ W2.10 `helpers/` — exportPoll, paginate, parseFile (CSV/SPSS/XLSX/JSON), webhookReceiver(HMAC), oauthFlow, withRetry

## W3 — Continuous sync / CDC (I1)
- ⬜ W3.1 `sync/engine.ts` — capability negotiation (push/poll), prism_sync_state, freshness SLO, adaptive cadence
- ⬜ W3.2 `sync/webhook.ts` — HMAC-SHA256 raw-body receiver, ±300s + replay cache, per-tenant key, tenant resolution
- ⬜ W3.3 `sync/poll.ts` — cursor poll + trust-but-verify reconcile backstop
- ⬜ W3.4 Augment rolling-buffer retention

## W4 — Mapping (I2, deterministic-first)
- ⬜ W4.1 `mapping/resolver.ts` — 3-layer (L1 type-map → L2 org memory by schema-shape-hash → L3 LLM residual)
- ⬜ W4.2 `mapping/typemaps/*.ts` — per-connector deterministic type maps (qualtrics, typeform, surveymonkey, forms, csv)
- ⬜ W4.3 schema-shape-hash + collision-safe equality; drift → delta re-map
- ⬜ W4.4 value/scale rescale rules; lossless preserve-as-embedded

## W5 — Connectors (`backend/src/lib/prism/connectors/`)
- ✅ W5.1 `file.ts` — CSV/JSON native (XLSX/SPSS/QSF/triple_s stubbed in helper); registry `listConnectorMetas()` for FE gallery
- ✅ W5.2 `typeform.ts` — OAuth, forms+responses (paginate), push capture; TODO(verify): oauth token plumbing
- ✅ W5.3 `qualtrics.ts` — export-poll + survey-definitions + mailinglists; TODO(verify): export ZIP streamed parse for 50M, export body params
- ✅ W5.4 `surveymonkey.ts`, `googleforms.ts`
- ✅ W5.5 owned-review: `gbp.ts`, `apple_asc.ts`, `google_play.ts`, `trustpilot.ts` (trustpilot AI-gated until licence); `displayOnlyMetas.ts` (Yelp/Places/TripAdvisor display-only + Glassdoor/Amazon excluded — gallery metas, no extract); `connectorMetas` alias added

## W6 — Backend API ✅ (written; depends on engine exports — alignment msg sent to engine agent)
- ✅ W6.1–6.8 `routes/prism.ts` (full surface, org-scoped 404, soft-delete, NUMERIC-safe), `routes/prismWebhooks.ts` (raw-body HMAC + timingSafeEqual), `schemas/prism.ts` (Zod `.strict()`), `index.ts` mounts (4 surgical edits). ⚠ engine fn names reconciled via SendMessage.

## W7 — CrystalOS (`crystalos/skills/` + service)
- ✅ W7.1 `schema-mapper/` skill (SKILL+EVALS+EXAMPLES; hard-fail evals)
- ✅ W7.2 `taxonomy-mapper/` skill
- ✅ W7.3 `metric-parity/` skill (+ parity explainer); plugin.json registered
- 🔧 W7.4 `enrichment_version` stamp/skip helper ✅; decoupled queue-backed worker tier ⬜ (deferred → `crystalos/skills/PRISM_NOTES.md`, needs running pipeline)
- ✅ W7.5 `tools/prism_feedback.py` — `get_unified_feedback` + `get_insight_sources` (graceful fallback until migrations land)
- 🔧 W7.6 tiered orchestration + bitemporal checkpoint writes ⬜ (deferred → PRISM_NOTES)
- 🔧 W7.7 Tier-1 hardening (pgBouncer, LLM semaphore, BudgetExceeded≠circuit, consumer groups, Redis run_registry) ⬜ (deferred → PRISM_NOTES, gated on load tests)
- ⓘ Follow-up: register the 2 tools in `crystal/registry.py` for the ReAct path (noted in PRISM_NOTES)

## W8 — Frontend (`app/src/`)
- ⬜ W8.1 Routes in `constants/routes.ts` (PRISM, PRISM_CONNECT, PRISM_JOB, PRISM_JOBS) + nav entry
- ⬜ W8.2 `pages/prism/PrismHomePage.tsx` (connector gallery + recent jobs)
- ⬜ W8.3 `pages/prism/PrismConnectPage.tsx` (auth by authKind + mode/history_window picker)
- ⬜ W8.4 `pages/prism/PrismJobPage.tsx` (stepper host) + stage components: Select, Map, DryRun(Review), Progress, Done
- ⬜ W8.5 components: ConnectorCard, MappingTable, ValueMappingDialog, DryRunDiff, ParityCheck, ImportProgress, ReconciliationPanel
- ⬜ W8.6 `hooks/usePrismConnections.ts`, `usePrismJob.ts` + DataBus invalidation
- ⬜ W8.7 `lib/api.ts` Prism methods (NUMERIC coercion) ; `types/prism.ts`
- ⬜ W8.8 `locales/en.ts` `prism` namespace (no hardcoded strings)
- ⬜ W8.9 Crystal panel integration (mapping proposals, "compute older period", first insight)

## W9 — Cross-cutting
- ✅ W9.1 Security: `secretManager.ts` (KMS envelope, AAD `org_id|connection_id|kek_version`) ✅; `guardedFetch` (SSRF) in engine helpers ✅
- 🔧 W9.2 Observability: `metrics.ts` (prism_* Prometheus) ✅; Pino logs in handlers ✅; OTel spans ⬜ (deferred)
- 🔧 W9.3 Env vars: `docs/ENV_VARS.md` ✅ (+ paste block). ⚠ `.env.example`/`backend/.env.example` **blocked by sandbox `.env.*` deny** — user must paste the block from ENV_VARS.md
- ✅ W9.4 Identity resolution service `lib/prism/identity.ts` (deterministic + recursive-CTE graph, reversible unmerge, GDPR erase, survivorship) — I6
- ✅ W9.5 Tests: backend `__tests__/prism/{helpers,resolver,parity,extract}.test.js` + FE `{PrismHomePage,DryRunDiff}` tests (unrun — shell down); CrystalOS EVALS shipped with skills

## W10 — Customer interaction / simpler UX ✅ (the review gaps — built)
- ✅ W10.1 **File upload end-to-end** — `FileDropzone` (drag-drop+pick, progress, a11y); `POST /api/prism/uploads` (raw-body, size-capped, zip-slip-safe) + `lib/prism/uploads.ts`; `helpers.parseFile`→`readUpload` wired; "Drop a CSV/Excel to start" band on Home → straight into wizard.
- ✅ W10.2 **One-click OAuth** — `/api/prism/oauth/:platform/{start,callback}` + `oauthConfig.ts` (typeform/surveymonkey/google/trustpilot) + single-use state (Redis + `prism_oauth_state` migration); FE "Connect with {platform}" button → provider → token stored → wizard. ⚠ TODO(verify): provider token-exchange specifics.
- ✅ W10.3 **Progressive-disclosure connect** — one obvious auth path per source; mode+history in collapsed "Advanced options"; smart default (augment for reviews/streams, ingest else — never `migrate`).
- ✅ W10.4 service-account key via FileDropzone; api-token inline "where do I find this?" help.
- ⚠ Cleanup: delete stray `backend/.tsc-check.sh` AND `app/.tsc-check.sh` (subagents couldn't rm; harmless).

## W11 — Robustness & flexibility (from live testing)
- ✅ W11.1 **FE↔BE contract reconciliation** — 10 mismatches found + fixed; canonical response DTOs in `types/prism.ts` (source of truth); `api.ts` defensive (clear named errors, tolerant of legacy shapes); fixed 2 wrong FE URLs (`/resources`,`/dryrun`); regression tests added. Closed 2 follow-ups: added `GET /api/prism/connectors` route; relaxed `createJobSchema` (`resources` may be empty → discovery-driven). ⚠ unverified (tsc).
- ✅ W11.2 **Format-flexible file parser** — new `backend/src/lib/prism/parsing/` framework: `csv.ts` (RFC-4180 tokenizer: quotes/escapes/embedded newlines/CRLF/BOM/`sep=`/delimiter-sniff, never throws), `dialects.ts` (`qualtrics_csv` [ImportId metadata-row → stable field id; data after metadata], `genericCsv` floor; `selectDialect` always returns one; adding SurveyMonkey/Typeform = one object), `profile.ts` (deterministic type inference). `file.ts` profile/extract + `uploads.ts` header-sniff use it. Bad encoding/empty/ragged → clear error or zero rows, never crash. Tests added. ⚠ unverified (tsc); ⚠ TODO(verify) Qualtrics row signatures vs a live export.

- ✅ W11.3 **Job-page visibility (UX)** — status-aware **stage×status → view** router in `PrismJobPage.tsx` + new `PrismProcessing.tsx` (background-stage panel), per-stage skeletons + inline retry, explicit failed/partial/paused/fallback states, aria-live; locale keys added under `prism`. Never blank. ⚠ unverified (tsc); recommend `PrismJobPage.test.tsx`. Engine-advances-job still a separate verification (now visible if stuck).

## W12 — Production readiness (architect pass: dev/staging/prod + true end-to-end)
- ✅ W12.1 **Object storage** — S3-compatible backend (`@aws-sdk/client-s3`, lazy-import; AES256 SSE; AWS/Tigris/MinIO/GCS-interop via endpoint+force-path-style); local kept for dev; legacy `gcs`→`s3`; org-asserted. ⚠ `npm i @aws-sdk/client-s3` required.
- ✅ W12.2 **Engine worker** (`worker.ts`) — `FOR UPDATE SKIP LOCKED` claim loop, crash-safe/resumable, drives all stages (fixes "stuck at connect"); file happy-path wired; `secretManager.putSecret` + post-EXTRACT purge; booted via index.ts (A4).
  - ✅ FIXED report-schema bug: `reconcile.ts` INSERT now `(org_id,job_id,report)`; `getDryRunReport`/`getReconReport` now `ORDER BY created_at` (was non-existent `generated_at`). (Verified: worker's own dryrun INSERT already matched schema.)
  - ✅ VERIFIED `engine.ts` coherent — worker secret-wiring/`kickWorker` AND CDC sync imports (`ensureLiveSyncJob`/`triggerIngest`/`trimAugmentBuffer`) all present, no clobber.
- ✅ W12.3 **CDC sync scheduler** (`sync/scheduler.ts`) — receive NEW responses: due-based poll + webhook→ingest→LOAD+ENRICH (fixed `handleWebhook` that stamped `job_id:''` violating FK); trust-but-verify reconciling poll; Augment 90d rolling buffer; horizontal-safe Redis claim lock; `registerSync` verified.
- ✅ W12.4 **Per-env config + prod gate** — `config.ts` (APP_ENV dev/staging/prod defaults), fail-fast `validatePrismProductionConfig()` (6 checks: Redis/storage≠local/secrets≠local/AGENTS_INTERNAL_KEY/PUBLIC_API_URL/FRONTEND_URL → exit in staging/prod), `index.ts` boots worker+scheduler (dynamic import, behind flags), ENV_VARS dev/staging/prod matrix, `production-readiness.md` (Fly topology: web=worker OFF + dedicated worker process; E2E smoke = GA gate).
- ⚠ Needs `npm i @aws-sdk/client-s3`; all unverified (shell down) — end-to-end gated on the smoke test.

## W13 — CSV end-to-end dry-run (static trace)
- ✅ Traced FE upload → connection → job → worker (connect/discover/extract/profile/map) → transform → dry-run: **statically coherent**; fixed 2 MAP-quality bugs (discover→extract resources gap; `file_auto` had no typemap → use detected platform / csv map).
- ✅ **LOAD blocker resolved**: import **materializes a Survey** (`survey.ts ensureImportSurvey`, called from `engine.confirmMapping` before resume; title from file/source, questions from confirmed mapping, embedded fields → metadata; idempotent per job via cursor.survey_id). `transform.ts`/`load.ts` stamp `survey_id`; LOAD uses batch `targetSurveyId(job,conn)` → cursor.survey_id. PUBLISH activates the survey → visible in Surveys list. **CSV path now statically coherent step 1→7.** (Optional 1-liner: pass `ctx.surveyId` in `worker.stageTransform` for the per-row stamp — batch fallback already covers it.)
- ⚠ Live-run-only steps remain: CrystalOS enrich call, S3 dep (`npm i @aws-sdk/client-s3`), and the actual tsc/migrate/boot/E2E.

## V — Verification gates (need a real machine; shell is down here)
- ⬜ V1 `cd backend && npm i && npx tsc --noEmit` clean
- ⬜ V2 `cd app && npm i && npx tsc --noEmit && npm run lint && vitest run` clean
- ⬜ V3 migrations apply on local Postgres (docker-compose up)
- ⬜ V4 CrystalOS skills load; `make run-dev` boots
- ⬜ V5 E2E smoke: CSV import connect→map→dryrun→load→reconcile→insight

---

### Round log
- **R1 (2026-06-29):** tracker created; dispatched W0.1 (conventions) + W1 (DB migrations).
- **R2 (2026-06-29):** W0.1 ✅, W0.2 contract ✅, W1 migrations ✅ (3 files, caveats noted). Launched build wave: engine (W2–W4), connectors (W5.1–5.3), API+security+env (W6, W9.1, W9.3), frontend (W8), CrystalOS skills+tools (W7.1–7.3, 7.5, partial 7.4/7.6).
- **R2 results:** ✅ **W2 engine** (11-stage orchestrator, exactly-once load w/ advisory-lock + monotonicity guard, dryrun+parity explainer, ratelimit, backpressure, helpers), ✅ **W3 CDC** (sync engine/webhook/poll), ✅ **W4 mapping** (3-layer resolver + typemaps), ✅ **W5.1–5.3 connectors**, ✅ **W6 API**, ✅ **W7.1–7.3/7.5 CrystalOS skills+tools**, ✅ **W8 frontend** (14 files + 5 edits).
- **R3 (2026-06-29):** dispatched: (a) more connectors W5.4–5.5, (b) identity service W9.4, (c) tests W9.5, (d) AI/MAP integration.
- **R3 results — BUILD CODE-COMPLETE (writable surface):** ✅ W5.4/5.5 (9 storing connectors + display-only metas), ✅ W9.4 identity, ✅ W9.5 tests (unrun), ✅ AI/MAP wiring (CrystalOS `/prism/{map,taxonomy,parity}` via real `SkillRegistry.execute` + `agentsClient.proposeMapping/reconcileTaxonomy/explainParity` + resolver L3 hookup). ~90 files created/edited across DB, backend engine/connectors/API/security/identity, CrystalOS skills+tools+endpoints, frontend wizard, tests.
- **STATUS: all W0–W9 build items ✅ except the by-design deferrals below. NOTHING run/compiled here (shell `E2BIG`). Remaining = the V-gates + the punch list above + deferrals.**
- **Stray file to delete:** `backend/.tsc-check.sh` (a subagent couldn't `rm` it; harmless comment).

### Integration TODOs (real-machine pass — shell is down here)
- agentsClient skill-invoke for schema-mapper → being wired in R3(d); engine resolver degrades to preserve-as-embedded until then.
- `authenticateConnection` must call `secretManager.putSecret` (currently placeholder credential_ref).
- Dependency-gated stubs (need a `npm i`): `helpers.parseFile` XLSX/SPSS/QSF/triple_s; `load.loadBulkCopy` (pg-copy-streams); `getReconReportPdf` (pdfmake).
- FE ↔ API endpoint-name parity: confirm `api.ts` paths match `routes/prism.ts` once `tsc` runs.
- ⚠ `.env.example` blocked by sandbox `.env.*` deny — paste block from `docs/ENV_VARS.md`.
- Deferred (need running pipeline, tracked in `crystalos/skills/PRISM_NOTES.md`): W7.4/7.6/7.7 enrichment-tier + bitemporal writes + Tier-1 hardening; W9.2 OTel spans.
