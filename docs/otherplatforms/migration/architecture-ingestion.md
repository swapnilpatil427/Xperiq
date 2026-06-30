# Prism — Architecture

**Status:** Architecture approved by weekly architecture review
**Date:** 2026-06-29
**Owners:** Karthik Nair, Diego Fernández, Sara Müller, Wei Zhang, Aisha Bello

> Canonical technical reference for Prism: ingestion engine, continuous sync, deterministic-first
> mapping, tiered insight, connector SDK. Read with the root `CLAUDE.md` "How the three layers
> collaborate" section — Prism applies that pattern faithfully: **CrystalOS proposes
> (mapping/parity), the app executes (load), the backend is the bridge + system of record, and the
> loop closes with reconciliation + re-enrichment.** Operating-mode strategy:
> [`strategy-and-operating-modes.md`](./strategy-and-operating-modes.md). CrystalOS scaling:
> [`architecture-review.md`](./architecture-review.md).

---

## 1. Design goals

| Goal | How |
|---|---|
| **Exactly-once load** | Natural-key dedupe + upsert under a per-key advisory lock (§4) |
| **Resumable** | Per-stage cursor checkpoints (§3) |
| **Lossless** | Raw staging retained; unmapped → preserved-as-embedded (§3, §6) |
| **Transparent** | Dry-run diff computed before any write (§5) |
| **Rate-limit safe** | Per-connection Redis token buckets (§7) |
| **Multi-tenant isolated** | `org_id` on every row + per-tenant fair-share queues (§10) |
| **Postgres-only** | All state in Postgres; Redis for queues/locks (no Firestore) |
| **Observable** | Prometheus/Grafana/Loki in-stack; ≤60s EXTRACT heartbeat (§10) |

**Three-layer flow.** The frontend wizard (Connect → Select → Map → Dry-run → Approve → Watch →
Reconcile → Insights) talks REST to the backend; the backend orchestrates Redis-backed stage
queues, runs connector workers, persists everything to Postgres, and calls CrystalOS via
`agentsClient` (`X-Internal-Key`) for mapping/parity proposals. It is the single writer of the
credit ledger (re-enrichment cost).

**Boundary rule.** CrystalOS **proposes** mappings + parity findings; it **never** writes canonical
data. The backend loads; the frontend confirms — identical to the Crystal action-proposal contract.

---

## 2. ADR-022 — one append-only log, many consumers

EXTRACT writes every record to **one append-only raw log** (`prism_raw_records`); **bulk migration
and continuous sync are the same consumer reading at different offsets.** Bulk catches up from
offset 0; continuous sync tails the head. TRANSFORM/LOAD/ENRICH are identical for both — they
neither know nor care how a record arrived. This collapses "two pipelines" into one engine + two
ingress shapes, so idempotency, provenance, and observability are unchanged whether data is
bulk-imported or streamed.

---

## 3. Pipeline stages (the spine)

Every import is a pipeline of discrete, independently-retryable, checkpointed stages. A stage reads
input from Postgres, writes output to Postgres, and advances the job state machine.

```
 1. CONNECT      Authenticate; store credential ref (Secret Manager). No data moves.
 2. DISCOVER     Enumerate what exists at source (surveys, lists, locations, apps).
 3. EXTRACT      Pull raw records → append to prism_raw_records (JSONB, verbatim, provenance).
 4. PROFILE      Infer source schema: question types, fields, value distributions.
 5. MAP          CrystalOS schema-mapper proposes source→Xperiq mapping; human confirms.
 6. TRANSFORM    Apply confirmed mapping → canonical staging rows (not yet live).
 7. DRY-RUN      Compute diff: creates/updates/skips/conflicts + metric parity. No writes.
 8. LOAD         On approval: natural-key upsert in batched txns. Original timestamps kept.
 9. RECONCILE    Compare loaded counts + checksums vs source → prism_recon_report.
10. ENRICH       Trigger CrystalOS re-enrichment + insight pipeline on imported data.
11. PUBLISH      Mark survey/source active; emit DataBus invalidation; notify user.
```

Stages 3–10 are background; stages 1, 5 (confirm), 7 (approve) are interactive.

**Raw staging (lossless landing zone).** EXTRACT's first act is to append the **untouched** source
record with provenance, *before* any transform. This makes Prism lossless, re-mappable (replay
TRANSFORM from raw without re-hitting source), and is the basis for ADR-022.

```sql
CREATE TABLE prism_raw_records (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          TEXT NOT NULL,
  job_id          UUID NOT NULL REFERENCES prism_jobs(id),
  connection_id   UUID NOT NULL REFERENCES prism_connections(id),
  source_platform TEXT NOT NULL,              -- 'qualtrics' | 'medallia' | 'yelp' | ...
  record_type     TEXT NOT NULL,              -- 'survey_def' | 'response' | 'contact' | 'review' | ...
  source_record_id TEXT NOT NULL,             -- the source's own id
  payload         JSONB NOT NULL,             -- raw record, verbatim
  payload_hash    TEXT NOT NULL,              -- sha256(payload) for change detection
  ingress         TEXT NOT NULL DEFAULT 'poll', -- 'poll' | 'webhook' | 'backfill' (provenance only)
  poison          BOOLEAN NOT NULL DEFAULT false, -- quarantined; excluded from TRANSFORM (§4)
  extracted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, connection_id, record_type, source_record_id)   -- idempotent extract
);
CREATE INDEX ON prism_raw_records (org_id, job_id);
CREATE INDEX ON prism_raw_records (org_id, connection_id) WHERE poison;  -- DLQ scans
```

`UNIQUE (…, source_record_id)` makes EXTRACT idempotent across both ingress paths: a webhook and a
poll that both observe the same source record collapse to one row. The writer upserts and updates
`payload_hash`/`extracted_at` only when the hash changed (a stable record re-observed is a no-op),
so re-extraction never churns downstream change-detection. Retention follows org policy (default
kept; optionally purged after reconciliation for data-minimization — see
[`security-compliance.md`](./security-compliance.md)).

### Job model & state machine

```sql
CREATE TABLE prism_jobs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        TEXT NOT NULL,
  connection_id UUID NOT NULL,
  kind          TEXT NOT NULL,   -- 'migration' | 'sync' | 'backfill'
  stage         TEXT NOT NULL,   -- current pipeline stage
  status        TEXT NOT NULL,   -- queued|running|awaiting_input|paused|complete|partial|failed
  cursor        JSONB,           -- resumable extraction cursor / page token
  counts        JSONB NOT NULL DEFAULT '{}', -- {discovered,extracted,transformed,loaded,skipped,failed,poison}
  error         JSONB,           -- last error {stage, message, retryable}
  triggered_by  TEXT NOT NULL,   -- 'user' | 'schedule' | 'webhook'
  created_by    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ      -- soft-delete (platform rule)
);
```

```
queued → running ─(needs mapping)→ awaiting_input ─(confirmed)→ running
   │                ─(needs approval)→ awaiting_input ─(approved)→ running
   ▼                                                         │
 failed ◄─(non-retryable)─ running ─(all stages done)─► complete
   ▲                         │
   └──(retryable, backoff)───┘   running ─(some records failed)─► partial
```

`cursor` makes EXTRACT resumable (page token / export-progress handle) so a crashed worker resumes
mid-stream, not from scratch. `partial` is reached when records were quarantined as poison (§4) or
some batches failed non-fatally; the job carries the failed/poison counts and never silently
"completes" over lost records.

### Operating modes shape the pipeline

Each connection carries a `mode` (full model:
[`strategy-and-operating-modes.md`](./strategy-and-operating-modes.md)). **New data is always
checkpointed in real time, in every mode — there is no setting for that.** `history_window` (1–12 mo)
only controls **how much existing history is also checkpointed**.

| Mode | Pipeline | History | Intelligence |
|---|---|---|---|
| **Augment** | Continuous sync only (§4.1) | No full history stored — rolling buffer of live feed | Tier A on new data. Lightest path; data stays in the incumbent |
| **Ingest** | Full pipeline over **all** history | All history landed | **Tiered** (§8): new data + `history_window` live, older history in paced batches, deep past on-demand — a 50M-row import never triggers 50M up-front enrichments |
| **Migrate** | Ingest + dated cutover to system-of-record ([`operations-runbook.md`](./operations-runbook.md)) | All history landed | Same as Ingest |

A connection moves Augment → Ingest → Migrate without re-connecting; the insight trail carries
forward.

---

## 4. Idempotency & exactly-once load

**Natural key.** Every canonical row carries `(source_platform, source_record_id)` in a provenance
column; loads are UPSERTs keyed on it via a unique partial index.

```sql
INSERT INTO responses (id, survey_id, org_id, answers, respondent, submitted_at, metadata)
VALUES ($1,$2,$3,$4,$5,$6,
        jsonb_build_object('prism', jsonb_build_object(
          'source_platform',$7,'source_record_id',$8,
          'import_batch_id',$9,'imported_at',now())))
ON CONFLICT (org_id, prism_natural_key)         -- unique partial index
DO UPDATE SET answers = EXCLUDED.answers, ...    -- re-run = update, never duplicate
WHERE responses.payload_hash IS DISTINCT FROM EXCLUDED.payload_hash;  -- skip no-op rewrites

CREATE UNIQUE INDEX responses_prism_nat_key
  ON responses (org_id, (metadata->'prism'->>'source_platform'),
                        (metadata->'prism'->>'source_record_id'))
  WHERE metadata ? 'prism' AND deleted_at IS NULL;
```

**Concurrent backfill + live write to the same key.** Tier-A live sync and a Tier-B backfill can
target the same natural key simultaneously (e.g. a backfill of period *P* races a webhook editing a
record in *P*). The unique index guarantees **no duplicate row**, but last-writer-wins on the
`answers` payload would let a *stale backfill* clobber a *fresher live edit*. Two rules make the
merge deterministic regardless of arrival order:

1. **Per-key serialization.** Each upsert takes `pg_advisory_xact_lock(hashtext(org_id||natural_key))`
   so concurrent writers to one key serialize inside their batch transaction — no lost-update on the
   row.
2. **Source-time monotonicity.** The `DO UPDATE` only overwrites when the incoming record's source
   timestamp (`observedAt`, persisted as `source_observed_at`) is **≥** the stored one:
   `WHERE EXCLUDED.source_observed_at >= responses.source_observed_at`. A late-arriving backfill row
   describing an *older* state is therefore dropped as a no-op, never overwriting the live edit. Ties
   (equal source time) resolve by `payload_hash` equality → no-op.

This is exactly-once **by effect**: the final row reflects the newest source state for that key,
independent of how many times or in what order it was loaded.

**Batched transactions.** Load in all-or-nothing batches (e.g. 500 rows); `import_batch_id` ties a
batch to a job. A batch is the unit of retry and the unit of lost-work on crash (§10).

**Poison-record handling.** A record that repeatedly fails TRANSFORM/LOAD (malformed payload,
unrecoverable mapping error, oversize blob) must not wedge the consumer or fail the whole batch. The
log consumer applies a bounded retry then quarantines:

| Step | Behavior |
|---|---|
| Transient fail | Retry in place with exp. backoff + jitter (cursor-safe), up to N attempts |
| Exhausted retries | Mark `prism_raw_records.poison = true`, record `{stage, error}` on the job, increment `counts.poison`; **skip** the record so the batch and consumer proceed |
| Quarantine visibility | Poison rows are a dead-letter set surfaced in the dry-run/recon report and an alert; the job ends `partial`, never falsely `complete` |
| Recovery | After a connector fix or mapping edit, poison rows are **replayable** (clear flag, re-TRANSFORM from raw) — no source re-hit |

Because the verbatim payload is retained, no poison record is ever lost — it is isolated, counted,
alerted, and replayable.

**Replay safety.** EXTRACT is idempotent (raw unique key) and LOAD is idempotent + monotonic
(natural-key upsert with source-time guard) → **the entire pipeline is replayable**; re-running a
completed job is a no-op diff.

**Provenance** stamped on every imported row makes imports idempotent, traceable, and erasable:

```jsonc
"metadata": { "prism": {
  "source_platform": "qualtrics", "source_record_id": "R_3x9...",  // → natural key
  "source_survey_id": "SV_abc...", "import_batch_id": "batch_2026-06-29T...",
  "imported_at": "2026-06-29T12:00:00Z", "source_observed_at": "2026-06-12T08:14:00Z",
  "mapping_version": 3, "connector_version": "1.2.0", "legal_basis": "first_party_owned"
}}
```

---

## 5. Dry-run diff (the trust engine)

Before LOAD, TRANSFORM output is compared against canonical tables into a structured diff the UI
renders — nothing is written until the user approves; conflicts (keep-source / keep-existing /
create-new) must be resolved first:

```jsonc
{
  "summary": { "create": 48211, "update": 132, "skip_duplicate": 0, "conflict": 3 },
  "metric_parity": [
    { "metric": "nps", "source_value": 42, "prism_computed": 42, "match": true },
    { "metric": "csat", "source_value": 4.31, "prism_computed": 4.30, "match": false,
      "delta": -0.01, "reason": "rounding: source rounds half-up" }
  ],
  "unmapped_fields": [ { "source_field": "Q17_custom", "action": "preserved_as_embedded_data" } ],
  "timestamp_continuity": { "earliest": "2019-01-04", "latest": "2026-06-28", "gaps": [] },
  "conflicts": [ { "source_record_id": "R_abc", "reason": "natural_key exists, different payload_hash" } ]
}
```

### Continuous-sync (CDC) subsystem — *required for Augment* (ADR-017)

Per ADR-022, bulk and continuous sync share TRANSFORM/LOAD/ENRICH; continuous sync adds *scheduling
+ capture* on top of the existing engine (idempotency, provenance, observability unchanged). Augment
**depends entirely on it** — without it Augment is a slide, not an architecture
([`architecture-review.md`](./architecture-review.md) I1).

**Capture mode per source** (declared in the connector manifest):

| Mode | Mechanism | Examples |
|---|---|---|
| **Push (preferred)** | Native webhooks / event subscriptions → HMAC-verified receiver (raw body before `express.json()`) → enqueue. New ingress passes a connector-cert security gate: HMAC + replay protection + tenant binding | Qualtrics event subscriptions, SurveyMonkey / Typeform webhooks, Medallia Omni Exporter |
| **Poll + cursor (fallback)** | Scheduled incremental pulls on the source's modified/created cursor; adaptive cadence inside the rate budget (§7) | Qualtrics `continuationToken`, Typeform `since/until`, Google Forms `timestamp` + Pub/Sub watch (7-day renewal) |

**Webhook + poll race / idempotency.** Push and poll are not mutually exclusive — poll runs as a
**reconciling backstop** under push (a webhook can be dropped, delayed, or replayed). Three guarantees
keep overlap safe:

1. **One ingress queue.** `webhookReceiver` and `paginate`/`exportPoll` both enqueue onto the same
   per-connection extract queue; downstream cannot tell push from poll.
2. **EXTRACT-level dedupe.** The raw unique key (§3) collapses a webhook and a poll that observe the
   same `source_record_id`; the hash-aware writer makes a re-observation a no-op. An out-of-order
   replay (old webhook arriving after a newer poll) is dropped by the same hash/source-time check.
3. **Cursor advances on observation, not delivery.** The poll cursor advances only after the page's
   records are durably appended to `prism_raw_records`, so a crash between fetch and append re-polls
   the same window safely (at-least-once capture → exactly-once effect via §4).
4. **Webhook replay window.** The receiver rejects (HMAC) and dedupes (event-id + timestamp inside a
   short replay window) before enqueue, so a maliciously or accidentally replayed webhook never
   reaches EXTRACT twice with effect.

**`prism_sync_state`** (one row per connection) drives scheduling, freshness SLOs, and lag alerts:

```sql
CREATE TABLE prism_sync_state (
  org_id           TEXT NOT NULL,
  connection_id    UUID NOT NULL,
  record_type      TEXT NOT NULL,            -- sync cursor is per (connection, record_type)
  capture_mode     TEXT NOT NULL,            -- 'push' | 'poll' | 'push+poll'
  last_cursor      JSONB,                    -- incremental delta marker (continuationToken/since/...)
  last_synced_at   TIMESTAMPTZ,              -- last successful append from this stream
  last_event_at    TIMESTAMPTZ,             -- newest source-observed time seen (lag = now - this)
  lag_seconds      INT,                      -- materialized for alerting
  freshness_slo_s  INT NOT NULL,             -- push: 300; poll: cadence + 1 interval
  poll_cadence_s   INT,                      -- adaptive within rate budget (§7); null for pure push
  consecutive_fail INT NOT NULL DEFAULT 0,   -- drives backoff + circuit-break → alert
  webhook_secret_ref TEXT,                   -- Secret Manager ref for HMAC verify
  paused           BOOLEAN NOT NULL DEFAULT false,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (connection_id, record_type)
);
```

Freshness SLO: push < 5 min; poll < cadence + 1 interval. Breach → freshness/lag alert
([`operations-runbook.md`](./operations-runbook.md)).

- **Update-vs-new + dedup:** `payload_hash` + the natural-key upsert (§4) make webhook/poll overlap
  and edited/late responses safe — they update in place (newest source-time wins), never duplicate.
- **Augment storage:** a **rolling buffer** of synced new data (it *becomes* history over time —
  Augment is **not** stateless). Optional day-1 seed pull of just the `history_window`.

---

## 6. Mapping — deterministic-first, AI for the residual (ADR-018)

Mapping must scale to hundreds of surveys × dozens of questions. We do **not** route every field
through an LLM (slow, costly, a hallucination surface). A **3-layer resolver** keeps human review
proportional to *novelty*, not *volume* ([`architecture-review.md`](./architecture-review.md) I2):

| Layer | What | Coverage |
|---|---|---|
| **1. Connector type map** (default) | Static map shipped per first-party connector (Qualtrics NPS → `nps`; Typeform `opinion_scale` → `rating_numeric`) — a table lookup | ~80–90% of fields, **zero AI, zero human review** |
| **2. Org mapping-memory** | A confirmed mapping keyed by a **schema-shape hash**; structurally similar surveys auto-apply it — 500 near-identical surveys confirm **once**. Stored in `prism_mappings`, keyed on **stable** source ids (Typeform `ref`, Qualtrics QID, SPSS var) so it survives label/order changes | The recurring residual |
| **3. LLM residual** | `schema-mapper` (CrystalOS) runs **only on the ambiguous residual**, proposing `{source_field → target, type, value_rules, confidence, rationale}`, defaulting unknowns to **preserve-as-embedded**. High-confidence groups support **bulk-confirm** | The genuinely novel tail |

**Resolver edge cases (determinism hardening).**

- **Schema-shape-hash collision.** The shape hash is a fast pre-filter, not the match key. Two
  structurally different surveys can hash-collide; a candidate memory mapping is therefore applied
  only after a **full field-set equality check on stable source ids** (ref/QID/SPSS var + type).
  Hash hit + field-set mismatch → treat as a new shape (fall to layer 3), never silently mis-apply.
- **Source-schema drift → re-map the delta only.** PROFILE recomputes the shape hash each run. When
  a known survey changes (added/removed/retyped fields), the resolver **diffs old vs new field sets**
  and re-confirms **only the changed fields** — unchanged fields keep their confirmed mapping (and
  `mapping_version`). Removed fields surface as `unmapped_fields` notes (not silent drops); a *type*
  change on a metric-bearing field is flagged metric-affecting and forces re-confirmation. Whole-survey
  re-mapping is never triggered by a partial drift.
- **Ambiguous deterministic match.** If two static-map entries or two memory mappings both claim a
  field, the deterministic layer **abstains** and routes that field to layer 3 with both candidates
  as context — determinism never guesses between equals.

PROFILE infers source schema + distributions from raw records (for sources without a deterministic
map, and to detect drift). The UI renders proposals as confidence-chipped confirm-cards; the
confirmed mapping persists (versioned) and TRANSFORM applies it; the outcome
(accepted/edited/rejected) feeds the skill's examples (closed loop). **EVALS gate:** every field
mapped or explicitly preserved · metric-bearing fields carry a `metric` · no hallucinated target
ids/options · scale changes flagged as metric-affecting.

### Target model & boundary rule

| Source kind | Canonical target |
|---|---|
| Survey/form definition | `Survey` + `Block[]` + `Question[]` |
| Survey/form submission | `Response` + `Answer` map (keyed by questionId) |
| Review / call / ticket / social post | `Signal` (+ `ReviewSignalMetadata`) |
| Contact / panelist / list member | contact record + embedded data |

**Boundary:** filled-out a form → `Response`; came from any other channel → `Signal`.

### Question-type mapping — highlights

`QuestionType` is rich, so most types map cleanly; the hard/lossy cases:

| Source | Notable mappings & gotchas |
|---|---|
| **Qualtrics** | NPS→`nps` (recompute D/P/P); MC SAVR→`multiple_choice`, MAVR→`checkbox`; Matrix→`likert`/`matrix`; side-by-side→`matrix` (+raw); timing/meta→embedded |
| **SurveyMonkey** | `single`→`multiple_choice`, `multiple`→`checkbox`; ⚠ star/smiley hide under `display_type`; `demographic` composite → split + embedded |
| **Typeform** | key on `field.ref`; `opinion_scale`→`rating_numeric`, `rating`→`rating_stars`; `picture_choice`→`image_choice` (re-host); `group`→`Block`; `payment`/`calendly`→preserve raw |
| **Google Forms** | RADIO/DROP_DOWN→`multiple_choice`/`dropdown`; scale→`rating_numeric`; grid→`matrix`; fileUpload→re-fetch Drive refs; pageBreak→`Block` |
| **Alchemer / Jotform / Forsta** | MaxDiff→`maxdiff`, heatmap→`image_heatmap`; Jotform composite (`control_fullname`) split; Forsta/SPSS triple-S value labels → `ChoiceOption.label`; use `shown` for `Answer.skipped` |
| **Unmapped / exotic** | → **preserve-as-embedded** (response) or `display_text` placeholder + raw in `prism_raw_records`. **Never dropped**; dry-run lists every one |

**Value mapping.** Source answer → matching `Answer` subtype, keyed by mapped `questionId`; option
ids resolve via confirmed option mapping. Scale rescaling (e.g. CSAT 1–7 → 1–5) uses a user-chosen
rule shown as a metric-affecting change; linear default
`out = round((in-inMin)/(inMax-inMin)*(outMax-outMin)+outMin)`. Source submit time →
`submitted_at`/`original_at` (**never** import time). Skipped-vs-unanswered preserved where the
source exposes it. Metric-bearing questions get `metric` set so the insight layer + parity check
treat them correctly.

**Logic/piping/scoring (honesty).** Imported where exposed (Typeform full; Qualtrics flow; Forms
partial → `LogicRule`/`displayLogic`/`skipLogic`; Typeform `{{field:ref}}` → `PipingConfig`; scoring
→ `QuestionScoring`). Where not exposed (SurveyMonkey, MS Forms) the dry-run states plainly
*"branching not importable — responses preserved, logic not reconstructed."* (no silent loss).

**Contacts & identity.** Core fields → contact; arbitrary attributes → embedded data (mapped to
org-wide `embeddedDataDefs`). **Dedup** matches normalized email → phone → external id; default is
**merge-preserving**, ambiguous matches flagged for confirmation — no silent merges. (Cross-source
identity graph: ADR-026, §9.)

**Signals.** Owned-property reviews → `Signal`: review id → `content.externalId` +
`source_record_id`; rating → `metadata.rating`; text → `content.rawText`; author →
`author.name`/`socialHandle` (PII-flagged); created/update → `originalAt`/`capturedAt`; platform →
`sourceType`. `legal_basis` stamped from the connector's `legalPosture`; display-only sources never
reach this stage (no `Signal` written).

---

## 7. Connector framework & SDK

A **connector** is a self-contained adapter — the **only** thing written to add a source. The engine
(queues, idempotency, reconciliation, dry-run, UI) is source-agnostic. Goal: *a competent backend
engineer ships a new connector in days.* Author principles: *implement don't orchestrate · declare
don't enforce · stay lossless · be honest.*

### The `PrismConnector` interface (condensed)

```typescript
// backend/src/lib/prism/types.ts
export type Capability =
  | 'survey_def' | 'response' | 'contact' | 'distribution' | 'review' | 'embedded_data';

export type LegalPosture = {
  basis: 'first_party_owned' | 'public_api_licensed' | 'display_only' | 'no_compliant_path';
  mayStoreContent: boolean;     // false → engine stores only the join key, never text
  mayProcessWithAI: boolean;    // false → engine never sends records to CrystalOS
  attributionRequired: boolean; cacheTtlHours?: number; requiresLicenseFlag: boolean;
  notes: string;                // cite the governing ToS clause
};

export type CredentialRef = { ref: string; expiresAt?: string; scopesGranted: string[] };
export type ExtractionMode = 'export-poll' | 'paginate' | 'file' | 'webhook';

export type Cursor = {        // persisted to prism_jobs.cursor verbatim → resumable
  mode: ExtractionMode;
  progressId?: string; fileId?: string;            // export-poll
  pageToken?: string; offset?: number;             // paginate
  byteOffset?: number; rowOffset?: number;         // file
  continuationToken?: string; since?: string;      // incremental delta marker
  emitted?: number;
};

export type RawRecord = {     // the lossless landing unit
  recordType: Capability; sourceRecordId: string;  // source id = idempotency natural key
  payload: unknown;                                // VERBATIM → prism_raw_records.payload
  observedAt?: string;                             // source timestamp → source_observed_at (continuity + §4 monotonicity)
};

export type SourceSchemaProfile = {
  fields: ProfiledField[]; recordType: Capability;
  logicExposed: 'full' | 'partial' | 'none';       // honesty flag → dry-run gap note
};
export type ProfiledField = {
  sourceField: string;        // STABLE key (ref/QID/SPSS var) — mappings bind here
  label?: string; typeHint: TypeHint; metricHint?: MetricHint;
  valueSet?: { code: string|number; label: string; recodeTo?: number }[];
  cardinality?: number; examples?: unknown[];      // PII-minimized samples
};

export interface PrismConnector {
  meta: { platform: string; label: string;
          authKind: 'oauth2'|'api_key'|'service_account'|'file_upload';
          capabilities: Capability[]; legalPosture: LegalPosture; };
  authenticate(input: AuthInput): Promise<CredentialRef>;             // CONNECT
  discover(conn: Connection): AsyncIterable<DiscoveredResource>;      // DISCOVER
  extract(conn: Connection, resource: ResourceRef, cursor?: Cursor):  // EXTRACT (resumable)
    AsyncIterable<{ records: RawRecord[]; nextCursor?: Cursor }>;
  profile(raw: RawRecord[]): SourceSchemaProfile;                     // PROFILE hints
  receiveWebhook?(conn: Connection, req: { headers; rawBody: Buffer }): Promise<RawRecord[]>;
}
```

The author writes only *authenticate, list, pull verbatim, describe*. **MAP, TRANSFORM, DRY-RUN,
LOAD, RECONCILE, ENRICH, PUBLISH are shared engine stages**, driven by `profile()` hints + the
confirmed mapping. `profile()` answers three questions: type hints (canonical question type), metric
hints (parity input — connector *hints*, engine *recomputes*, dry-run shows source-vs-Prism), and
value-set hints (coded choices + labels + recode rules). `logicExposed` feeds the dry-run gap note.

### Manifest (declare, don't enforce)

Everything non-behavioral is **declared** in a Zod-validated manifest — the source of truth for the
token bucket, scope requests, the legal gate, and the resource picker:

```jsonc
{ "platform": "typeform", "label": "Typeform", "version": "1.2.0", "stage": "ga",
  "authKind": "oauth2",
  "oauth": { "authUrl": "...", "tokenUrl": "...",
    "scopes": [ { "scope": "forms:read", "capability": "survey_def", "required": true },
                { "scope": "responses:read", "capability": "response", "required": true } ] },
  "capabilities": ["survey_def","response","embedded_data"],
  "resources": [
    { "resourceType": "form", "recordType": "survey_def", "mode": "paginate" },
    { "resourceType": "form", "recordType": "response", "mode": "paginate",
      "incremental": { "cursorField": "since" } },
    { "resourceType": "form", "recordType": "response", "mode": "webhook" } ],
  "rateLimits": { "scope": "account", "requestsPerWindow": 2, "windowSeconds": 1,
                  "concurrency": 1 },           // 2 req/s shared; bucket conservative by design
  "legalPosture": { "basis": "first_party_owned", "mayStoreContent": true,
                    "mayProcessWithAI": true, "attributionRequired": false,
                    "requiresLicenseFlag": false, "notes": "Customer owns the forms." },
  "apiVersion": { "source": "2023-10" }, "fixtures": { "recordReplayDir": "fixtures/typeform" } }
```

### SDK helpers (the leverage)

The four hard extraction shapes + cross-cutting concerns are libraries the author composes
(`backend/src/lib/prism/sdk/`), so a connector is a manifest + ~3 small functions:

| Helper | Solves | Used by |
|---|---|---|
| `exportPoll()` | request → poll → download → stream-parse (resumes via `progressId`/`fileId`) | Qualtrics, Medallia, Google Play |
| `paginate()` | cursor/page-token/offset loop with per-page checkpointing | Typeform, SurveyMonkey, Forms, GBP |
| `parseFile()` | CSV/SPSS/XLSX/JSON/QSF/triple-S → records (sandboxed worker, size/type-capped) | file uploads, MS Forms export, InMoment SFTP |
| `webhookReceiver()` | HMAC verify (raw body) + replay-window dedupe + enqueue | Typeform, owned-review sync |
| `oauthFlow()` | authorize → exchange → refresh → Secret Manager (author never sees token) | every oauth2 connector |
| `rateLimited()` | Redis token-bucket per `connection_id` from the manifest (auto-applied) | every connector |
| `withRetry()` | exp. backoff + jitter on 429/503, honors `Retry-After`, cursor-safe | every connector |
| `writeRaw()` | provenance-stamped, idempotent raw writer (upserts on the unique key; hash-aware no-op) | every connector |

Stream-parsing means a 50M-row export never loads into memory; `webhookReceiver` enqueues onto the
same per-connection extract queue a poll uses, so webhook and poll modes are indistinguishable
downstream (§5 race rules).

### Lifecycle & versioning

| Concern | Rule |
|---|---|
| **Graduation** | `stage` is a manifest field; engine refuses to expose a connector above its stage to an out-of-allow-list org. **alpha:** interface + replay fixtures, watermarked preview. **beta:** reconciliation passes on fixtures + ≥1 design-partner, posture drafted. **GA:** full certification |
| **Connector semver** (decoupled from platform + source API) | PATCH = bug fix (auto-rollout); MINOR = additive (new capability/mode/optional field — stored mappings stay valid); MAJOR = could alter mapping → requires `mappingMigration` + dry-run **re-confirmation** (never silent reinterpret). `connector_version` stamped on every loaded row |
| **Source API bumps** | Pin `apiVersion.source`; ship the new version behind a capability flag, run both on fixtures, cut over when reconciliation matches. Because EXTRACT writes verbatim and TRANSFORM replays from raw, old jobs are unaffected. Removed source fields surface as `unmapped_fields` notes, not silent drops |

### Build/buy — thin SDK default (I7)

Default to the in-house thin SDK: most sources are simple authenticated REST and a connector is ~a
day with the helpers. Reserve borrowed/self-hosted extractors (their own control plane, secrets,
failure modes, multi-tenancy) for genuinely complex/rare sources where they *clearly* save weeks —
Airbyte earns its keep only there. Keep the SDK interface as the seam so this stays a per-connector
decision ([`architecture-review.md`](./architecture-review.md) I7, ADR-021).

### Certification gates (security + fidelity + legal)

A connector ships when it passes — not when "it runs":

| Gate | Requirement |
|---|---|
| **Least privilege** | minimum read scopes; egress host-restricted (no SSRF) |
| **Secrets** | in Secret Manager via `oauthFlow`; never returned to client; revocable |
| **Legal posture** | defined, **counsel-signed**, engine-enforced; display-only proven unable to store/AI-process |
| **Fidelity — record/replay** | golden source payloads → expected canonical rows match exactly |
| **Fidelity — reconciliation** | loaded counts + answer checksums equal source (the hard, non-negotiable GA gate) |
| **Fidelity — idempotency** | re-running a completed fixture job = no-op dry-run diff |
| **Honesty** | logic/metric gaps surfaced in the dry-run, not dropped |
| **Observability** | ≤60s EXTRACT heartbeat; per-stage metrics labeled by `source_platform` |

**Partner / marketplace [future].** Same interface + manifest + gates whether first-party or
partner-built; what changes is trust/isolation. Verified-partner and community connectors run in a
**sandboxed worker** (no DB/secret/CrystalOS access; egress host-allow-list from the manifest; SDK
surfaces only), and every posture is **counsel-ratified and engine-enforced**, not self-attested. A
marketplace (trust tier + certification badge + reconciliation track record) is the long-term breadth
moat — gated on the sandbox + review pipeline being audited first.

---

## 8. Tiered insight & continuity (the closing half of the seam)

Import → re-derive metrics, map taxonomy, re-enrich text, run the insight pipeline → first insight
on screen → outcomes feed skill quality. Builds on the existing CrystalOS insight pipeline (`POST
/insights/generate`), the `insights` table, and `insight_checkpoints_v2`.

### Metric parity — two tiers (ADR-019, don't over-promise)

Incumbents differ subtly (NPS index vs −100..+100, CSAT top-box vs mean, rounding, passive
handling). Approach: capture the source's reported metric where exposed; compute Prism's own in
DRY-RUN; show both + the delta in the **parity explainer**.

- **Tier 1 — Data fidelity (guaranteed):** raw counts + answer checksums + timestamp continuity
  reconcile **exactly**. This is what the signed reconciliation report certifies and what "no data
  loss" means.
- **Tier 2 — Computed-metric parity (best-effort, explained):** incumbent *dashboard* numbers apply
  hidden filters/weighting/rolling windows we can't see via API, so we **do not promise to reproduce
  a black-box dashboard number**. We show our number, **explain** any variance, and let the customer
  choose: **match-source** (store a per-survey `metric_method` reproducing the incumbent's
  computation) or **use-Xperiq** (re-baseline, before/after shown).

```jsonc
// survey settings.metric_method — makes parity reproducible & auditable
{ "nps":  { "scale": "0-10", "index": "-100..100", "passives_included": true,
            "partials": "exclude", "rounding": "half_up", "matched_source": "qualtrics" },
  "csat": { "definition": "mean", "scale_in": "1-7", "scale_out": "1-5",
            "rescale": "linear", "rounding": "half_up" } }
```

A migration is "reconciled" when **Tier 1** matches exactly and every Tier-2 metric matches or has an
acknowledged, explained method difference.

### Trend continuity & taxonomy

- **Dates kept:** every response keeps its original `submitted_at`/`original_at`; charts + pipeline
  read it so 2019→2026 renders as one continuous line (no import-day spike). Waves/periods preserved
  into the wave dimension; DRY-RUN reports `timestamp_continuity`.
- **Taxonomy** (`taxonomy-mapper` skill, proposed/human-confirmed): if the source exposes topics,
  import them as a seed taxonomy (`origin: 'imported'`) into `survey_topics` and reconcile against
  existing topics (merge synonyms, flag conflicts); per-response assignments preserved so historical
  topic trends survive. If not, **re-derive** via Xperiq's ABSA + topic-clustering, optionally seeded
  with the customer's known labels. Either way the taxonomy becomes a living, improvable registry.

### Re-enrichment on arrival (the unlock)

After LOAD, the backend triggers (via `agentsClient`) the ENRICH stage — imported open-text,
transcripts, and reviews get the full Xperiq enrichment (sentiment/emotion/intent/topics/entities/
inferred metrics/summaries) the incumbent lacked — then the insight pipeline runs and the first
insight renders on the "Done" screen + Experience view.

- **Credit-costed** (the one metered part of Prism); backend is the single credit-ledger writer;
  `credit_preflight` checks balance and the UI shows an estimate before a backfill.
- **Resumable + idempotent** (keyed by response/signal id + `enrichmentVersion`) — a paused backfill
  resumes without double-charging.
- **Deferrable** ("import now, enrich overnight") so a migration isn't blocked on enrichment.

### Tiered processing (intelligence decoupled from ingestion)

Ingest as much as the customer wants (cheap storage); run expensive Crystal intelligence on a
**tiered** basis so cost tracks value. All tiers reuse Insight Pipeline v2 — Prism adds *time-window
orchestration*, not a new engine.

```
   ◀───────────────────── time ──────────────────────────────────▶
   [  deep past (years)  ][ older history ][ last 1–12mo │ NEW DATA ▶ ]
     Tier C: ON-DEMAND      Tier B: BATCH    Tier A: CHECKPOINTED ALWAYS
     custom-analysis lane   paced snapshots  (history_window)   CHECKPOINTED
     compute on request     per period/wave  real-time          (no setting)
```

- **Tier A — Live checkpointing (real-time).** New data is **always** checkpointed, every mode, no
  setting. The only knob is `history_window` (1–12 mo, default ~3) = how much existing history to
  also checkpoint live.
- **Tier B — Historical backfill (batch snapshots).** History older than the window is processed in
  paced background batches → snapshot checkpoints per period/wave, seeding continuous trend lines.
  Throttled, resumable, deferrable, credit-metered — never blocks the import.
- **Tier C — On-demand (deep past).** Any older window not yet snapshotted is computed on the fly via
  the custom-analysis lane, emitting a checkpoint when specifically requested. Never lost (it's
  ingested), never wasted (not pre-processed).

**Mode interaction:** Augment → Tier A only on the streaming feed; imported topics load as
*reference* so new-data insight speaks the customer's vocabulary (no cold start). Ingest/Migrate → A
+ B + C, topics reconciled into the living registry. A 50M-response import triggers real-time +
window + paced snapshots + on-demand — **not** 50M up-front enrichments; credits scale with
*processed* intelligence, not raw ingestion. (CrystalOS scaling — queue-backed, horizontally-scaled,
per-tenant fairness, isolated from interactive Crystal:
[`architecture-review.md`](./architecture-review.md) I5.)

### Checkpoints v2 & bitemporal lineage (I4, ADR-020)

Imported history seeds the trail rather than masquerading as a live run: the first post-import run
writes a checkpoint with `lane: 'automated'`, `source: 'prism_import'`, and `meaningful_delta` is
computed against the imported baseline so the first live run compares cleanly to history (not zero).
A reviewer always sees "this baseline came from a Qualtrics import on 2026-06-29."

**Bitemporal checkpoints (I4).** Because Tier-A live checkpoints and Tier-B backfill run
**concurrently**, checkpoints carry both **valid-time** (the data period they describe) and
**transaction-time** (when the row was written) — keyed by period, not insertion order:

```sql
CREATE TABLE insight_checkpoints_v2 (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          TEXT NOT NULL,
  survey_id       UUID NOT NULL,
  lane            TEXT NOT NULL,            -- 'automated' | 'custom' | ...
  source          TEXT NOT NULL,            -- 'prism_import' | 'prism_backfill' | 'live'
  -- valid-time: the data period this checkpoint summarizes
  period_start    TIMESTAMPTZ NOT NULL,
  period_end      TIMESTAMPTZ NOT NULL,
  -- transaction-time: when this row became known / was superseded (bitemporal)
  as_of           TIMESTAMPTZ NOT NULL DEFAULT now(),   -- tx-time start
  superseded_at   TIMESTAMPTZ,                          -- null = current version of this period
  payload         JSONB NOT NULL,           -- metrics/insights for the period
  meaningful_delta JSONB,                    -- vs the prior period's current version
  origin          TEXT NOT NULL,            -- 'prism_import' | 'prism_backfill' | 'live'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- one CURRENT version per (survey, lane, period); history kept via superseded_at
  UNIQUE (org_id, survey_id, lane, period_start, period_end, as_of)
);
-- fast "current state of each period" read
CREATE INDEX ON insight_checkpoints_v2 (org_id, survey_id, lane, period_start)
  WHERE superseded_at IS NULL;
```

**Replay/version semantics.** Recomputing a period never mutates in place: it **inserts a new
version** (`as_of = now()`) and stamps the prior current row `superseded_at = now()`. Readers select
`WHERE superseded_at IS NULL` for the current trail and can time-travel by filtering `as_of`. A slow
backfill filling an earlier period therefore triggers a cheap **relink/recompute** of the adjacent
period's `meaningful_delta` (a new version of the neighbor, not a destructive edit), so a late
historical snapshot never corrupts a newer checkpoint. Backfill rows are tagged
`origin: 'prism_backfill'`; the bitemporal pair (valid-time + transaction-time) makes "what did the
trend look like, as of when, for which period" exactly answerable and fully auditable.

**Trust scoring.** Imported data flows through the same trust framework (citation coverage / sample
size); re-enriched imported text carries a "from imported history" provenance chip (transparency,
not penalty), and low-quality source flags (`contentTooShort`, truncated review snippets) propagate
so scores stay honest.

### CrystalOS skills (the AI half of the seam)

| Skill | Proposes | Eval gate |
|---|---|---|
| `schema-mapper` | source field → Xperiq question/type + value mappings, with confidence | every field mapped or preserved; metric fields carry a `metric`; no hallucinated ids |
| `taxonomy-mapper` | reconcile imported topic labels with the registry (merge/conflict/new) | every label resolved; no silent drops; conflicts flagged |
| `metric-parity` | explanation of a source-vs-Prism delta + recommended method | delta explained with a concrete cause; recommends match vs re-baseline; cites responses |

These emit **proposals**, never writes — the backend executes on confirm and records the outcome, so
the skills improve from real migrations (the same closed loop as every Xperiq AI capability).

---

## 9. Cross-source unification (ADR-026 pointer)

The "unify so Crystal reasons across sources" promise rests on a `unified_feedback` view (responses
+ signals) carrying full provenance, plus an identity graph producing a stable `xperiq_person_id`
(deterministic email→phone→external-id match, probabilistic match proposed-and-confirmed). This is
what lets Crystal answer cross-source questions and powers correct cross-source GDPR erasure. Design
detail: ADR-026 in [`engineering-plan.md`](./engineering-plan.md); identity-resolution sizing in
[`architecture-review.md`](./architecture-review.md) I6.

---

## 10. Concurrency, scale & observability

- **Per-tenant fairness:** queues partitioned by `org_id` (weighted fair queuing) so one large
  migration can't starve other tenants. Separate worker pools for EXTRACT (IO/rate-bound) and LOAD
  (DB-bound).
- **Backpressure (precise):** raw staging is the buffer. LOAD reports its lag (raw rows extracted but
  not yet transformed/loaded) per connection; when lag crosses a **high watermark**, EXTRACT for that
  connection is throttled (token-bucket refill paused) and resumes at a **low watermark**
  (hysteresis), so EXTRACT can never outrun LOAD into unbounded backlog while a transient LOAD slow
  patch self-recovers without thrashing. Per-tenant watermarks keep one tenant's backpressure local.
- **Scale envelope:** ~50M responses / ~40M contacts per migration; ≥5k canonical rows/sec/tenant
  (batched upserts); 100s of concurrent tenant migrations (fair-share bounded); resume granularity
  per-batch (≤500 rows lost-work on crash).
- **Observability** (Prometheus + Grafana + Loki): per-stage records/sec, error rate, queue depth,
  source-429 rate, time-in-stage, reconciliation pass/fail, poison-record count, sync lag — labeled
  by `org_id` + `source_platform`. Structured logs (Pino → Loki) on every stage transition with
  `job_id`/`org_id`/`connection_id`/`import_batch_id` (PII never logged, only ids + counts). Alerts:
  job stuck > SLO, reconciliation mismatch, sustained source-429, load error-rate, poison spike, sync
  freshness/lag. **SLO:** a job never silently stalls — it advances, retries with backoff, or moves to
  `failed`/`awaiting_input`/`partial` with a reason.

---

## 11. New Postgres tables (summary)

| Table | Purpose |
|---|---|
| `prism_connections` | One per authenticated source per org; `credential_ref` only (never secrets); `mode` (`augment`/`ingest`/`migrate`) + `history_window` (1–12 mo; new data always checkpointed, this only controls how much existing history is too) |
| `prism_jobs` | Pipeline state machine (§3) |
| `prism_raw_records` | Lossless append-only raw staging incl. poison quarantine (§3, §4; ADR-022) |
| `prism_sync_state` | Per-connection (per record_type) continuous-sync cursor/lag/freshness/HMAC ref (§5) |
| `prism_mappings` | Confirmed source→Xperiq field/value/taxonomy mappings, versioned, keyed on stable source ids (§6) |
| `prism_dryrun_report` | Computed diff + metric parity for approval (§5) |
| `prism_recon_report` | Post-load reconciliation (counts + checksums vs source) |
| `insight_checkpoints_v2` | Bitemporal insight checkpoints (valid-time + transaction-time; §8, I4) |

All carry `org_id`, `created_at`, `updated_at`, `deleted_at` (soft-delete). Canonical data lands in
the existing `surveys`/`responses`/`signals`/`contacts` tables with a `metadata.prism` provenance
block. API contracts & CrystalOS skill wiring: [`engineering-plan.md`](./engineering-plan.md).
