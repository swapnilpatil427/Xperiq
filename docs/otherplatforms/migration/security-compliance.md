# Prism — Security, Privacy & Governance

**Status:** Approved by Trust Council; legal posture per-source ratified; STRIDE complete
**Date:** 2026-06-29
**Owners:** Rebecca Stern, Faisal Rahman, Anton Petrov, Aisha Bello

> Prism moves customers' **most sensitive** experience data (survey responses, contact directories,
> patient/employee feedback, transcripts) and ingests **third-party content** governed by other
> companies' ToS. Two risk domains: **(1)** protect the customer data we hold; **(2)** ingest only
> third-party data we are **legally permitted** to store/process. Prism concentrates **live read
> credentials to dozens of external systems** + **multi-tenant PII at rest** + a **path into an LLM**
> (CrystalOS) — one connector or isolation flaw is a cross-tenant, cross-platform breach. Every Prism
> surface is **Tier-1**; compliance is **by construction**. This doc is the merged threat model +
> data-governance contract for the whole `raw → canonical → insight` pipeline.
>
> See: [README.md](./README.md) · [strategy-and-operating-modes.md](./strategy-and-operating-modes.md) · [teams.md](./teams.md) · [source-platforms-catalog.md](./source-platforms-catalog.md) · [architecture-ingestion.md](./architecture-ingestion.md) · [operations-runbook.md](./operations-runbook.md) · [architecture-review.md](./architecture-review.md) · [engineering-plan.md](./engineering-plan.md)

---

## 1. Data classification

The **class — not the source** — drives handling. Assigned at PROFILE/MAP (PII detection +
connector hints + mapping confirm), stored on `prism_mappings.field_class`, flagged on the row
where it drives runtime behavior. Class is **monotonic upward** within a session; de-classification
needs data-owner action + audit. Mixed-class rows are handled at field granularity for log/export,
row granularity for erasure/retention.

| Class | Tag | Examples | Handling |
|---|---|---|---|
| **Secrets** | `secret` | Source API tokens, OAuth refresh tokens, `.p8`/SA keys | Secret Manager only; never in Postgres, logs, exports, client, or LLM payloads; referenced by `credential_ref` (§2) |
| **PII / sensitive** | `pii` | Respondent name/email/phone, contact/employee/patient identity, IP/geo | Encrypted at rest; `piiDetected`/`piiTypes` flags; masked in logs/exports; residency-controlled; in erasure scope; minimized in LLM samples |
| **Regulated** | `regulated` | PHI (HIPAA), student records (FERPA), financial | All PII rules **plus** tenant opt-in; BAA where applicable; region-pinned; consent/retention metadata travels with data; statutory floors |
| **Third-party UGC** | `ugc` | Public review content, author handles | Stored only where `legalPosture.mayStoreContent`; AI only where `mayProcessWithAI`; `legal_basis` + attribution per row; license attestation where flagged (§4) — the sharpest risk |
| **Operational** | `operational` | Job ids, counts, checksums, batch ids, provenance, `payload_hash` | Safe to log/metric — no content. The **only** class allowed in Loki/Prometheus |

---

## 2. Credentials, keys & tenant isolation

### 2.1 Credential handling

| Property | Control |
|---|---|
| **Never on the client** | Submitted once to backend over TLS, stored in **Secret Manager**, referenced everywhere by opaque `credential_ref` on `prism_connections`; secret value **never** returned to the frontend (mirrors `FeedbackSource.credentialRef`) |
| **Least privilege** | Connectors request **minimum read scopes** (Qualtrics `read:surveys`/`read:responses`; SurveyMonkey `surveys_read`+`responses_read_detail`; Google `forms.body.readonly`). Never a write scope on a read-only source |
| **Read-only egress** | Read-only against every source; sole exception is the opt-in, separately-scoped *reply-to-review* connector. Connect UI states "Prism never writes to {platform}" |
| **Lifecycle** | One-click revoke = delete secret + disable connection + cancel queued jobs; in-flight stages **fail closed** on next resolve |

### 2.2 Envelope encryption & per-org key hierarchy
```
KMS root (CMK, never exported) ──► per-org KEK (KMS-resident, rotation-versioned)
   │ wraps/unwraps (envelope)
   ▼  DEK (random, per-secret) ──AES-256-GCM (AAD = org_id|connection_id|kek_version)──► ciphertext
Secret Manager entry, org-namespaced path  prism/{org_id}/conn/{connection_id}
   value = { ciphertext, wrapped_dek, kek_version, alg, aad }
```
- **Per-secret DEK** wrapped by the org's **KEK** in KMS; Postgres/SM store only ciphertext +
  `wrapped_dek` + `kek_version` — never plaintext or KEK. **Unwrap-on-use:** the worker asks KMS to
  unwrap only at source egress, decrypts into request-scoped memory, then zeroes/discards.
- **AAD binds ciphertext to `org_id`+`connection_id`+`kek_version`** — a ciphertext lifted into
  another org's path fails GCM auth, so cross-tenant secret substitution is **cryptographically**
  rejected, not merely policy-checked. **One KEK per org** → any DEK/policy compromise is contained
  to one tenant; no shared master key.
- **Rotation cadence (testable):** per-org KEK rotated **≥ annually** + on suspected compromise
  (`rotate-org-KEK` IR action); DEKs single-use; old KEK versions kept **decrypt-only** until all
  secrets re-wrapped, then disabled. Rotation is **online** (no plaintext exposure), audited
  (`action='kek_rotation'`, old/new version, count re-wrapped).
- **Zero plaintext at rest, enforced:** `prism_connections` holds only `credential_ref` + non-secret
  metadata; CI fails on a secret-shaped column/value in `prism_*`; Pino redaction drops
  `authorization`/`token`/`refresh_token`/`p8`/`private_key`/`client_secret`/`credential`;
  `gitleaks`/`trufflehog` on every PR + pre-receive hook block merge; fixtures use synthetic creds.

### 2.3 OAuth refresh, rotation, expiry mid-job

Long-lived continuous-sync (CDC) tokens are the highest-exposure credential. Default refresh-token
lifetime is **capped to provider minimum**; idle connections (no sync ≥ 90d) are flagged for
re-consent.

| Concern | Handling |
|---|---|
| **Storage** | Refresh token via the §2.2 envelope flow; never in Postgres / to client |
| **Proactive rotation** | Backend rotates access tokens ahead of expiry; for rotating-refresh providers the new refresh token replaces the secret **atomically** (single SM version write) and the old version is revoked at the provider |
| **Rotation cadence** | Access tokens refreshed at ≤ 75% of TTL; long-lived refresh tokens re-minted on every rotating-refresh response; non-rotating providers re-consented at ≤ provider-max or 90d idle |
| **Expiry mid-job** (incl. CDC long-lived) | EXTRACT detects 401/expired, transparently refreshes, **resumes from `cursor`** — no restart/loss; refresh fail → `awaiting_input` + "re-authenticate", never silent |
| **Provider revoked us** | `invalid_grant` on refresh → connection `needs_reauth`, audited, user notified; queued jobs cancelled |
| **Apple `.p8` / Google SA JSON** | Single envelope-encrypted secret; short-lived ASC JWT (≤ 20 min) minted **in memory** at call time; `.p8`/SA never touch disk or logs |

### 2.4 Tenant isolation — enforced at every layer

`org_id` on every Prism + canonical row; `requireAuth` sets `req.orgId` from the Clerk org claim;
**no route accepts `org_id` from body/query/header**; resource fetches are `(id, org_id)` composite.

| Layer | Mechanism | Failure mode closed |
|---|---|---|
| **API** | token-derived `req.orgId`; composite `(id, org_id)` lookups | IDOR → 404 |
| **Queues (Redis)** | org-partitioned lanes (key prefix per `org_id`); job-body `org_id` must match lane | Cross-tenant job pickup |
| **Secret Manager** | org-namespaced paths; resolver asserts prefix == job `org_id`; per-org KEK; GCM AAD bind (§2.2) | Resolving another org's `credential_ref` |
| **Postgres** | `org_id NOT NULL` everywhere; every query org-scoped; natural-key unique index `(org_id, …)` | Cross-tenant read/write/upsert collision |
| **CrystalOS** | `org_id` in body set by backend post-auth; operates only on rows the backend passes | AI processing of another org's data |
| **DataBus** | invalidation events org-scoped | Cross-tenant cache/UI leak |

> **404, not 403, on cross-org access** — 403 confirms existence (an oracle). Any `(id, org_id)`
> miss returns **404** so attackers can't enumerate other tenants' ids.

- **DB backstop (under eval):** Postgres **Row-Level Security** keyed on a session GUC
  (`SET app.org_id`) so a missing `WHERE org_id` *still* returns nothing; app-layer scoping stays
  primary. No `org_id`-less indexes on tenant data.
- Per-tenant queues double as a blast-radius boundary — one tenant's job can never read another's
  raw records or credentials.

---

## 3. Threat model

STRIDE = **S**poofing · **T**ampering · **R**epudiation · **I**nfo-disclosure · **D**enial · **E**levation.

### 3.1 Assets (ranked by blast radius) & actors

| # | Asset | Why | Severity |
|---|---|---|---|
| 1 | **Source credentials** (Secret Manager) | one token = read access to a customer's entire external account, off-platform, silently | **Catastrophic** |
| 2 | **Cross-tenant data** (Postgres raw + canonical, Redis queues) | defeats the multi-tenant promise | **Catastrophic** |
| 3 | **PII / regulated content** (`prism_raw_records.payload` JSONB, canonical) | GDPR/HIPAA/FERPA notification | **Severe** |
| 4 | **CrystalOS internal channel** (`X-Internal-Key`) | invoke skills directly, bypass `legalPosture`, exfil via prompts | **Severe** |
| 5 | **Content where ToS forbids storage/AI** | storing it *is* the violation | **High legal** |
| 6 | **Audit trail / provenance** (`audit_logs`, `metadata.prism`) | tampering hides the rest | **High** |

**Actors:** external unauthenticated; **authenticated malicious tenant (primary adversary)**;
malicious source / poisoned content; compromised dependency/connector; malicious/compromised
insider; compromised external source account.

### 3.2 Trust boundaries
```
INTERNET ─ Frontend wizard (Clerk JWT, no secrets) │ Webhook senders (HMAC)
══ TB-1 edge auth: every request → single org_id BEFORE business logic; webhooks auth by HMAC ══
/api/prism (Express): Clerk→req.orgId · Zod strict · org-scoped only · HMAC raw-body · rate/quota · audit
══ TB-2 app↔data/AI: app tier is the ONLY writer; Redis/PG/CrystalOS never trust inbound org_id ══
Redis (org-namespaced)   Postgres (org_id every row)   CrystalOS (X-Internal-Key, private net)
Ingestion workers (EXTRACT/TRANSFORM/LOAD): resolve credential_ref at use, into memory only
══ TB-3 secret access: only the worker executing a stage for a connection may resolve its ref ══
Secret Manager (envelope, per-org KMS) ─► EGRESS → source APIs (READ-ONLY, allowlisted hosts)
══ TB-4 source egress: outbound only to per-source allowlist; returning content is HOSTILE ══
```

### 3.3 Condensed STRIDE (highest-severity threat per component)

| Component | Top threat(s) | Mitigation |
|---|---|---|
| **Frontend** | (I) secrets leak into SPA; (T) tamper approve payload | Credentials write-only to server, `credential_ref` opaque, API never returns secret values; server re-derives `org_id` + re-validates dry-run report |
| **`/api/prism`** | (I) IDOR to another org; (T) mass-assignment; (E) hit internal proxy | Every query `WHERE org_id=req.orgId`, `(id,org_id)` composite → **404** (no oracle); **Zod `strict()`**, `org_id`/`credential_ref`/`status` server-set; `X-Internal-Key` routes on a separate non-public path |
| **Workers** | (D) 50M-row migration starves all; (I) cross-tenant via shared memory; (T) poisoned record | Weighted-fair per-`org_id` queues + backpressure; one job/slot, credential request-scoped & zeroed; raw verbatim + `payload_hash`, pure TRANSFORM (no eval), natural-key UPSERT in txns |
| **Raw staging** | (I) densest PII store; (E) store display-only content | Encryption at rest, org-scoped only, default **purge-after-reconcile**, logs ids/counts only; engine **refuses to write content** when `mayStoreContent=false` (join key only) |
| **Secret Manager** | (I) plaintext on disk/heap/logs; (E) one compromise → all orgs | **Zero plaintext at rest** (envelope, §2.2), request-scoped memory, log redaction; per-org KEK + GCM AAD → DEK compromise contained to one tenant |
| **CrystalOS** | (E) prompt-injection steers a skill; (I) over-sending to model | **Propose-only** (never writes canonical), content delimited as untrusted data, constrained-schema output validated by backend; only **schema + masked samples**, **credentials never sent**, provider under DPA |
| **Source egress** | (E) SSRF pivot to internal net; (D) trip source rate-limit / ban | Allowlist denies RFC-1918/link-local/metadata, DNS-rebind pinning, no arbitrary URL fetch; per-`connection_id` token-bucket, backoff+jitter on 429/503, cursor resume |

### 3.4 Isolation test plan (CI-gating, first-class deliverable)

Tenant isolation is verified by an explicit suite, not assumed. Each test asserts the **closed**
failure mode, not merely "works for one tenant."

| Test | Method | Pass condition |
|---|---|---|
| **Isolation suite** | For every route + worker stage, create Org-A & Org-B data, auth as B | **Zero** A rows readable/writable/enqueueable/resolvable (jobs, connections, raw, mappings, dry-run/recon, secrets, enrich) |
| **`org_id` fuzz** | Inject `org_id` into bodies/queries/headers — other orgs', empty, null, SQLi, type confusion, array | Always **ignored** in favor of token-derived `org_id`; never 500 |
| **IDOR sweep** | Enumerate sibling resource ids across orgs | **404 everywhere** (never 403, never 200) |
| **Secret-resolution** | Org-B worker attempts to unwrap Org-A's DEK / resolve its `credential_ref` | KMS unwrap **fails** (AAD mismatch) and resolver rejects on path prefix |
| **Negative migration** | A record claiming another org's `source_record_id` | Does **not** upsert (natural key is `org_id`-prefixed) |
| **RLS backstop** | Run a deliberately `WHERE org_id`-less query under `SET app.org_id` | Returns **zero** rows |

### 3.5 Egress / SSRF — `guardedFetch`
Every connector fetch goes through one guard. **No user-supplied fetch URL anywhere** — endpoints
are derived from connector code + validated resource ids. The allowlist is per-connector and
**exact-host** (no wildcard suffixes, no regex).
```typescript
async function guardedFetch(connector, urlFromConnectorCode) {
  const u = new URL(urlFromConnectorCode);                  // never from req body
  assert(u.protocol === 'https:' && (u.port === '' || u.port === '443')); // HTTPS:443 only
  assert(connector.meta.egressAllowlist.includes(u.hostname));  // exact host match, no suffix glob
  const ip = await resolvePinned(u.hostname);               // pin the resolved IP to defeat DNS rebind
  assert(isPublicUnicast(ip));                              // deny RFC-1918/loopback/link-local/169.254/::1/CGNAT
  return fetch(u, { redirect: 'manual', headers: stripHopByHop(),
                    signal: AbortSignal.timeout(EGRESS_TIMEOUT_MS) });
  // any 3xx → re-run the FULL guard on Location (host allowlist + IP pin) before following
}
```
- **No `file://`/`gopher://`/`ftp://`/`data:`**; connection reuse pinned to the validated IP;
  egress timeout caps slow-loris exfil; metadata endpoints (`169.254.169.254`, `fd00:ec2::254`)
  explicitly denied even if a connector mis-declares them.

### 3.6 Webhook ingress (the new CDC path)

CDC webhooks are the **only inbound write path that is not behind Clerk** — hardened accordingly.

| Control | Specification (testable) |
|---|---|
| **Algorithm** | HMAC-**SHA-256** over the **raw request bytes**; receiver mounts the raw body **before `express.json()`** (Clerk/Stripe pattern), parses only **after** verify |
| **Constant-time compare** | `crypto.timingSafeEqual`; length-checked first; never `===` on signatures |
| **Per-tenant key binding** | Each connection has its **own** webhook signing secret (envelope-stored); the receiver selects the key by `connection_id` from the URL/header path, then verifies — a signature valid for one tenant is invalid for another |
| **Timestamp tolerance** | Signed payload carries a timestamp; reject if `abs(now − ts) > 300s` (5-min skew window); the timestamp is **inside** the HMAC so it can't be altered |
| **Replay window + nonce** | Signed `nonce` (or provider event-id) cached in Redis with **TTL = tolerance window**; a seen nonce → reject (idempotent 200 to the sender, no re-enqueue) |
| **Tenant resolution** | webhook → `connection_id` → `org_id` server-side; **never** trust an `org_id`/tenant field in the payload |
| **No SSRF via content** | A webhook body enqueues an extraction job keyed by `connection_id`; payload values never become a fetch URL or host |
| **Abuse** | Per-connection enqueue rate-limit + quota; malformed/oversized body rejected pre-parse |

### 3.7 Input / parsing defenses
Prism parses untrusted CSV/Excel/SPSS/QSF/triple-S + arbitrary source JSON — the top RCE/DoS surface.
Parsed output is **data, never instructions** (no eval; no SQL templating — parameterized only; no
prompt interpolation).

| Vector | Defense |
|---|---|
| **Parser RCE** | Sandboxed worker (isolated process, dropped privs, no net, no FS write outside scratch); never eval/macro |
| **Size exhaustion** | Hard per-file + per-upload caps; **stream-parse** (bounded buffers); row/col caps |
| **Zip bomb** | Decompression-ratio cap **and** absolute-output-size cap; abort on threshold; bound nested-entry count + recursion depth |
| **XXE** | XML parser with **DTD + external-entity + parameter-entity resolution disabled**; no `SYSTEM`/`DOCTYPE` |
| **CSV/Excel formula injection** | Sanitize on **export** (prefix `=`/`+`/`-`/`@`/tab/CR with `'`); on import, cells are inert data, never evaluated |
| **Type confusion / polyglot** | Verify magic bytes match the declared type; reject mismatch (no content-type trust) |
| **Zip-slip path traversal** | Normalize each entry path, reject any resolving outside the scratch dir; reject absolute paths + symlinks |
| **Pathological JSON** | Depth + key-count + size limits before writing raw; bounded `payload_hash` compute; reject duplicate-key bombs |

### 3.8 Per-tenant abuse / DoS (protect Xperiq's own capacity)

| Control | Detail |
|---|---|
| **Per-tenant API rate limits** | Token-bucket per `org_id` (existing `rateLimiter`); tighter budgets for discover/dry-run/enrich |
| **Per-tenant quotas** | Caps on active connections, queued/running jobs, concurrent migrations, monthly enrichment credits (single-writer ledger) |
| **Job concurrency caps** | Weighted-fair per-`org_id` queues; per-org max concurrent stages |
| **Worker resource caps** | EXTRACT by source buckets; LOAD by PG budget; per-job memory/time; sandboxed-parser CPU/time |
| **Expensive-import guardrails** | Discovery estimates size; oversized → explicit confirm (+ services gate above threshold); dry-run cost surfaced |
| **Backpressure** | Staging-depth watermark throttles EXTRACT when LOAD lags |
| **Queue-flood protection** | Enqueue rate-limited + quota-checked at API; a tenant cannot fill another's lane |

### 3.9 AI-specific risks (CrystalOS path)

| Risk | Control (testable) |
|---|---|
| **Over-sending to model** | MAP/ENRICH receive **schema + masked samples**, not full datasets (existing PII-detection enrichment); a payload-shape assertion in CI caps sample size + confirms masking |
| **Posture bypass** | ENRICH honors `legalPosture`: `mayProcessWithAI=false` sources (Yelp, Places, TripAdvisor — display-only) are **never** sent; engine refuses; an isolation/posture test asserts no display-only content ever reaches the agents client |
| **Prompt injection** | Imported text is attacker-controllable → passed as **delimited untrusted data** (system prompt states it is data, never commands); **constrained outputs** (fixed schema: mappings/taxonomy/parity), backend validates + discards off-contract; **propose-only boundary** (a hijacked skill can at most return a proposal a human must confirm); mapping/enrich skills have **no tools** that read secrets or make egress calls |
| **Credentials to LLM** | **Never** sent to any LLM — CI asserts the agents-client payload shape **excludes** secret-shaped fields |
| **Log leakage** | CrystalOS logs ids/counts only; eval prompt/response logs redacted + ACL'd |

### 3.10 Supply chain / SBOM & insider threat

| Surface | Control |
|---|---|
| **First-party deps** | Lockfiles committed; `npm audit` + Dependabot/Renovate; pinned; build fails on high/critical w/o waiver |
| **CrystalOS (Python)** | Pinned lock; `pip-audit`; same gating |
| **Dependency integrity** | Install with lockfile-pinned integrity hashes (`npm ci --ignore-scripts` where feasible; `pip --require-hashes`); no install-time scripts from unpinned sources |
| **SBOM** | CycloneDX per build (backend + CrystalOS + app), stored as a signed release artifact for IR |
| **Connector review** | Mandatory security review vs SDK checklist + counsel-signed `legalPosture` before catalog; two-reviewer sign-off on connector code |
| **Third-party connectors** | Run in the **same sandbox** as parsers (§3.7): no ambient credential access (only their own connection's `credential_ref`), egress restricted to declared allowlist. Untrusted code until reviewed |
| **CI integrity** | Signed commits; protected `main`; secret-scanning; least-privilege CI tokens; no prod secrets in CI; distroless/scanned, digest-pinned base images |
| **Insider / exfil** | Workers resolve only their job's org secrets; no standing human read on raw PII; prod DB broker-mediated + logged; quarterly access reviews; time-boxed dual-authorized break-glass; anomaly alerts (bulk raw reads, secret-resolution spikes, cross-org attempts=0, export volume) |

> **Structural anti-exfil:** no shared master key (§2.2), no cross-tenant query path (§2.4), egress
> can only reach sources (§3.5). An insider/compromised worker is contained to one tenant + its hosts.

### 3.11 Pen-test, bug-bounty & secure SDLC

| Activity | Cadence / gate |
|---|---|
| **Threat-model review** | GA, then **quarterly** + on any new trust boundary (auth kind, egress class, AI flow); new review connector → re-run egress + AI |
| **Pre-launch pen-test** | Independent, scoped to isolation/IDOR, SSRF/egress, parser abuse, credentials, **webhook HMAC/replay**, prompt injection |
| **Recurring pen-test** | Annual + on material change |
| **Bug bounty** | In platform-program scope at launch; cross-tenant read & credential disclosure = **critical**-tier |
| **Automated regression** | Isolation + `org_id` fuzz + IDOR sweep + egress-guard + webhook-replay + parser-abuse tests in CI on every PR |
| **Incident response** | Connector-scoped runbooks (revoke-all-for-source, rotate-org-KEK, purge-org-raw); SBOM + audit support forensics — see [operations-runbook.md](./operations-runbook.md) |

---

## 4. Third-party data: per-source legal posture (the sharp edge)

> **Finding:** for public reviews the only universally compliant pattern is **first-party** —
> ingest reviews for properties the customer *owns* (their Google Business locations, Trustpilot
> profile, own apps), via per-org OAuth. Most platforms' ToS **forbid storing/caching** third-party
> review content, and several (**Yelp, Trustpilot, G2**) **explicitly forbid feeding content to
> AI/LLMs** without a written license. Since Prism feeds Crystal, GenAI clauses are the top hazard.

Every connector declares a `legalPosture`; the engine **enforces** it in code (refuses to write
content or call CrystalOS when forbidden) — a `display_only` source can only power a live widget
(store join key, fetch at render, attribute, never persist).

```typescript
type LegalPosture = {
  basis: 'first_party_owned' | 'public_api_licensed' | 'display_only' | 'no_compliant_path';
  mayStoreContent: boolean;       // false → store join key only, never text
  mayProcessWithAI: boolean;      // false → never send to CrystalOS/any LLM
  attributionRequired: boolean;   // render source link/logo
  cacheTtlHours?: number;         // e.g. Yelp 24h, Places 0 (Place ID only)
  requiresLicenseFlag: boolean;   // org must attest a data license before enabling
  notes: string;                  // cite the governing ToS clause
};
```

### Per-source ruling (ratified — business/legal posture, unchanged)

| Source | Basis | Store? | AI/Crystal? | Verdict |
|---|---|---|---|---|
| **Google Business Profile** (owned, OAuth `business.manage`) | first_party_owned | ✅ | ✅ | **Ship.** Access needs Google approval; default quota 0 until granted |
| **Google Places** (any place, ≤5 reviews) | display_only | ❌ (Place ID) | ❌ | Live display only; Maps terms ban caching |
| **Yelp Fusion** (≤3 truncated) | display_only | ❌ (24h cap) | ❌ | Live widget only; **explicit GenAI ban** → no Crystal unless licensed |
| **Trustpilot** (own profile, OAuth) | first_party_owned | ✅ | ⚠ license | **Ship** for owned profile; confirm AI under data licence |
| **G2** | public_api_licensed | ⚠ contract | ⚠ written waiver | Only under paid contract w/ AI restriction waived in writing |
| **Capterra / Gartner Digital Markets** | no_compliant_path | ❌ | ❌ | Embeds only; no programmatic ingestion |
| **Apple App Store** (own apps, ASC API) | first_party_owned | ✅ | ✅ | **Ship.** RSS = sampling only, unofficial |
| **Google Play** (own apps, Reply API + GCS export) | first_party_owned | ✅ | ✅ | **Ship.** API ≈ 7 days → use GCS export for history |
| **TripAdvisor** (≤5 snippets) | display_only | ❌ (location_id) | ❌ | Live display only; caching banned |
| **Glassdoor** | no_compliant_path | ❌ | ❌ | **Exclude** — API enterprise-only/closed; never scrape |
| **Amazon reviews** | no_compliant_path | ❌ | ❌ | **Exclude** — no reviews API; ToS bans scraping |

**Survey/XM sources** (Qualtrics, Medallia, SurveyMonkey, Typeform, Forms…) are **first-party by
definition** — customer owns the data + authorizes export → `first_party_owned`, full store + AI.
The hazard is concentrated in public reviews, which is why review connectors are gated.

**Operating rules:** (1) **API-only, never scrape** (no undocumented/unofficial endpoints in prod);
(2) **license attestation** for `requiresLicenseFlag` sources before enable, recorded per record;
(3) **provenance + basis on every stored review**; (4) **counsel sign-off (Faisal) gates** adding
any review source — posture documented in [source-platforms-catalog.md](./source-platforms-catalog.md).

---

## 5. Governance — lineage, retention, erasure, posture register

### 5.1 Governance goals & roles
Every datapoint, at any time: **where from? what kind? how long? were we allowed?** — answered from
stored metadata, or the bar is not met.

| Role | Who | Responsibility |
|---|---|---|
| **Controller** | The customer (org) | Purpose & means; decides retention, residency, consent, erasure |
| **Processor** | Xperiq | Processes on documented instructions only; provides governance controls; no repurposing |
| **Sub-processors** | Source platforms, LLM/transcription/object-storage/KMS providers | Flow-down DPA terms (§5.7) |
| **Data Owner (per org)** | Named org admin (`data_owner`) | Accountable human; approves imports, retention, residency, erasure |
| **DPO / Privacy Counsel** | Faisal (Xperiq); customer DPO | Gate for new sub-processors, special categories, cross-border |

### 5.2 Data lineage ("where did this number come from?")
Unbroken lineage carried **in-band** on `metadata.prism` + `job_id`/`import_batch_id`/`mapping_version`
— plain-SQL queryable, survives backups (no separate ledger).
```
source record ──EXTRACT(verbatim)──► prism_raw_records (payload JSONB + payload_hash,
                                       natural key (org_id, source_platform, source_record_id), job_id)
   ──TRANSFORM (prism_mappings v=N)──► canonical responses/signals/contacts/surveys
       metadata.prism = {source_platform, source_record_id, import_batch_id, imported_at,
                         mapping_version, legal_basis};  submitted_at = original source time
   ──ENRICH(CrystalOS)──► AIEnrichment (enrichmentVersion + provenance chip)
   ──INSIGHT──► insights / insight_checkpoints_v2 (citations → response/signal ids)
audit_logs ◀── every stage writes a content-free event (actor, action, ids)
```
- **Forward** (source record → all canonical + insight) and **backward** ("number" → cited responses
  → `metadata.prism` → raw payload → job/batch/mapping/importer) both queryable org-scoped.
- **UI:** provenance **chip** per imported row/insight; **drawer** ("View source record") renders the
  full path; **metric provenance** links a displayed NPS/CSAT to its `survey.metric_method` (§5.5).

### 5.3 Retention matrix
Per data class **and** per pipeline table; defaults conservative (minimization); controller
configures within bounds. **Legal hold overrides every purge** (incl. DSAR erasure) until released.

| Table | Default | Configurable | Notes |
|---|---|---|---|
| `prism_raw_records` | `purge_after_reconcile` | ✅ → `keep` | Purges once RECONCILE passes; `keep` retains for replay/remap |
| `responses`/`signals`/`contacts` | Org retention policy | ✅ | Imported rows = same retention as native; `submitted_at` anchors age |
| Enrichment | Tied to parent row | inherits | Purged with parent; re-derivable while text exists |
| `insights`/`checkpoints_v2` | Org retention | ✅ | Survive parent purge as aggregates unless they cite erased subjects |
| `prism_jobs`/`mappings`/`recon_report` | Long (audit) | ⚠ | Content-free; proves reproducibility & reconciliation |
| `audit_logs` | **Immutable, long** | ❌ append-only | Content-free; never purged by Prism jobs |

| Class | Default | Purge trigger | Override |
|---|---|---|---|
| `secret` | Connection lifetime | Delete/revoke (immediate) | n/a |
| `pii` | Org policy | Age-based job OR DSAR (§5.4) | Legal hold |
| `regulated` | Org policy + statutory minimum | Age-based, **never before** statutory floor | Legal hold; floor cannot be undercut |
| `ugc` | `cacheTtlHours` or org policy | TTL (display-only) / org policy (owned) | License revocation → immediate purge |
| `operational` | Operational-log window | Age-based | — |

Automated org-scoped purge jobs soft-delete (`deleted_at`) then hard-purge after a grace window;
every purge writes a content-free `audit_logs` event. Legal hold suspends the sweep:
```sql
UPDATE responses SET deleted_at = now()
WHERE org_id=$1 AND deleted_at IS NULL AND submitted_at < $2   -- source-time age threshold
  AND NOT EXISTS (SELECT 1 FROM legal_holds h WHERE h.org_id=responses.org_id
        AND h.released_at IS NULL
        AND (h.scope='org' OR h.subject_key = responses.respondent->>'identity_key'));
```

### 5.4 DSAR / right-to-erasure workflow
Provenance + natural key make this **targeted**, not a full-table scan; reaches canonical + raw +
derived.
1. **Locate** — resolve subject to a stable `identity_key` (email→phone→external id; same resolver
   as contact dedup), enumerate every canonical row (responses/signals/contacts) for that key
   org-scoped, then the **raw** records behind them via `metadata.prism` natural key.
2. **Access (Art.15/CCPA know)** — package located rows + provenance + source payloads into a
   subject-access export (subject's PII rendered; other subjects redacted); audited.
3. **Soft-delete** all located canonical rows (`deleted_at=now()`) — instantly removed from all
   queries + insight inputs (`deleted_at IS NULL` filter).
4. **Propagate to derived** — enrichment deleted with parent; insights/checkpoints citing erased
   rows flagged stale + **re-derived** without the erased data (aggregates that don't single out the
   subject persist; no insight may keep quoting an erased verbatim).
5. **Purge raw** (or confirm already purged under `purge_after_reconcile`), then **hard-purge** the
   soft-deleted canonical rows after the grace window.
6. **Audit:** `action='erasure'`, hashed `identity_key`, affected table+row ids, batch/job ids,
   actor, lawful basis — content-free.
- **Backups:** encrypted, access-controlled, **not restored to prod without replaying the deletion
  log** (the erasure event replays on restore so a backup can't resurrect a subject); retention
  window disclosed to the controller.
- **Constraints:** statutory **retention floors** (HIPAA/FERPA/financial) can **block** erasure of
  `regulated` data until the floor passes — surfaced to the controller, not silently resolved; a
  `legal_hold` **wins** any erasure conflict (suspends until released), audited.

### 5.5 Mapping/schema versioning + metric-method governance
- **Versioned mappings:** `prism_mappings` is **append-only** (`UNIQUE(org_id, connection_id,
  mapping_version)`); a remap creates `N+1`, prior versions never overwritten; every row carries
  `metadata.prism.mapping_version`. **Replay:** `(raw payload, mapping_version, schema version)`
  deterministically reproduces any row — remap replays TRANSFORM **without re-hitting source or
  duplicating** (idempotent natural-key UPSERT; requires raw retention=`keep`, else fresh extract).
  Schema evolves via additive/JSONB migrations; a mapping spec is pinned to its target schema version.
- **Metric-method governance:** `survey.settings.metric_method` is the **registry of record** for how
  each metric is computed (NPS index, CSAT def, rounding, passive/partial, source-match), applied to
  **both imported and future** responses. Only a **data owner/survey admin** may change it; **CrystalOS
  may propose (`metric-parity` skill), never write** — propose → preview before/after delta on the
  historical series → confirm → audit (`action='metric_method_change'`, old/new method, actor, delta).
  A migration isn't "reconciled" until every metric matches source or has an acknowledged, audited
  method difference (part of the signed reconciliation report).

### 5.6 Consent & special categories
**Consent + retention metadata are embedded data, not config** — they live on the row so any copy/
export/partial migration carries the obligation; never only in a settings blob that could drift.
Every row carries `metadata.prism.legal_basis` (first-party: controller's collection basis; `ugc`:
the connector's `legalPosture` basis). Consent **withdrawal** runs the erasure workflow scoped to the
consent's purpose.

| Regime | Trigger | Preserved & enforced |
|---|---|---|
| **IRB / research consent** | Source exposes consent/IRB fields | Consent record embedded on the response; IRB-protocol retention attached; processing limited to consented purposes |
| **FERPA** | EDU tenant / `regulated` | Tagged `regulated`; statutory floor honored; access role-limited; consent/directory-info flags preserved |
| **HIPAA** | Health tenant / `regulated` | BAA before enabling; PHI region-pinned + minimized; enrichment honors PHI flags; authorization metadata embedded |

### 5.7 Residency, sub-processors & legal-posture register
- **Data residency:** a connection inherits its org's region; `prism_raw_records`, canonical rows,
  object storage, and **EXTRACT/LOAD/ENRICH workers** (incl. in-region CrystalOS models) all run
  in-region. **No pipeline stage crosses regions**; backups stay in-region; cross-region replication
  disabled for pinned tenants — enforced at **worker-scheduling + storage layer** (a job whose target
  region ≠ org region is **refused**, not best-effort). Keyed off `org_id`; EDU/health/financial may
  **require** a lock. Supported prod regions **[⚠ verify prod]** before any residency commitment.
- **Sub-processors / DPA:** each new sub-processor (source platforms; LLM/AI providers — class-
  permitted data only, no-training terms; transcription; object storage; KMS) under a DPA with
  **flow-down** of security/confidentiality/sub-processing/deletion/residency/audit; requires
  **Counsel sign-off + controller notice**; per-connector list surfaced to the controller (enabling a
  connector that adds a sub-processor is explicit in the connect UI).
- **Legal-posture register:** governance owns the register (connector `meta.legalPosture` + catalog),
  the **license attestation** (`prism_connections.license_attestation` — who/when/license ref,
  required for `requiresLicenseFlag`), and the **per-row basis stamp** (`metadata.prism.legal_basis`
  — proves per datapoint why we could store it; `display_only` never reaches canonical). Connect/enable
  + each attestation are audited.
- **Data catalog:** a Postgres view over `prism_*` + canonical (no separate store, can't drift) — per
  import: source, dataset, row counts, date span, classes present, `legal_basis`, region, mapping
  version, import date, **data owner**; org-scoped only (no cross-tenant discovery).

### 5.8 I6 — reversible identity graph (governance angle)
Cross-source identity resolution (the `identity_key` resolver above) is **reversible / un-mergeable**:
identities are *linked* via the graph, never destructively merged, so a link can be **un-done** —
GDPR-safe. This keeps DSAR erasure precise (delete one subject without collapsing others), lets a
wrong link be corrected without data loss, and preserves per-source provenance after resolution.
Org-scoped, stamped into lineage like every other node.

---

## 6. Auditability & compliance control mapping

Every Prism action (connect/extract/approve/load/reconcile/erase/metric-change) writes `audit_logs`
with `actor_id`, `org_id`, `action`, `resource`, `resource_id`, content-free metadata (counts, ids,
checksums); SM access + KMS unwrap/rotation feed the same trail. The **signed reconciliation report**
(counts + checksums + metric parity) is an immutable retained artifact. Logs (Pino → Loki) carry
ids/counts only — never content/PII.

| Framework / req | Implementing Prism control(s) |
|---|---|
| **SOC 2 — CC6.1 access** | Clerk + per-request `org_id` (§2.4); per-org KMS isolation (§2.2); least-privilege worker IAM |
| **SOC 2 — Confidentiality** | Envelope encryption + zero-plaintext-at-rest (§2.2); encryption at rest for raw/canonical |
| **SOC 2 — Availability / CC7** | Rate limits, quotas, fair queues, backpressure (§3.8); monitoring; [operations-runbook.md](./operations-runbook.md) |
| **SOC 2 — CC7.2/7.3 monitoring & response** | `audit_logs` + SM/KMS logs; anomaly alerts; IR runbooks (§3.10–3.11) |
| **ISO 27001 — A.9 access** | `org_id` enforcement every layer + isolation tests (§2.4, §3.4) |
| **ISO 27001 — A.10 cryptography** | KMS envelope encryption, per-org KEK + GCM AAD, key rotation (§2.2–2.3) |
| **ISO 27001 — A.12.6/A.14 secure dev & vuln mgmt** | Secure SDLC, SAST, dep-audit, SBOM, pen-test (§3.10–3.11) |
| **ISO 27001 — A.13 network** | Egress allowlist, SSRF/metadata denial, HTTPS-only, webhook HMAC (§3.5–3.6) |
| **ISO 27001 — A.15 suppliers** | Connector review + sandboxing; third-party connector as untrusted code (§3.10) |
| **GDPR Art. 5 (minimization)** | PII masking before LLM (§3.9); purge-after-reconcile raw (§5.3) |
| **GDPR Art. 17 (erasure)** | Provenance-targeted soft-delete→purge across canonical+raw, audited (§5.4) |
| **GDPR Art. 25 (by design)** | `legalPosture` in code; propose-only AI; isolation by construction (§2.4, §3.9) |
| **GDPR Art. 28 / sub-processing** | CrystalOS + provider under DPA; minimized flow; recorded (§5.7) |
| **GDPR Art. 32 (security)** | Encryption, access control, isolation testing, IR (§2, §3.4, §3.11) |
| **HIPAA — §164.312(a) access** | Per-org isolation + least privilege + audited access; region-pinning PHI (§2.4, §5.7) |
| **HIPAA — §164.312(b) audit** | `audit_logs` on every action incl. AI processing (§6) |
| **HIPAA — §164.312(e) transmission** | TLS everywhere; egress cert validation; internal channel private + keyed |
| **HIPAA — §164.502 minimum necessary + BAA** | PHI minimized/masked to LLM; BAA gate; `mayProcessWithAI` honored |
| **FERPA — education records** | Student records `regulated`; consent/retention preserved; same isolation+audit+minimization |
| **Source ToS / GenAI clauses** | Enforced in code via `legalPosture` (§4) — the Prism-specific addition |

---

## 7. Acceptance criteria (gating — Prism does not ship unless all pass)

**Security — identity & isolation**
- [ ] Every route derives `org_id` from the Clerk token; **no** route accepts `org_id` from input
- [ ] Isolation suite + `org_id` fuzz + IDOR sweep + RLS-backstop pass in CI; cross-org access returns **404**
- [ ] Queue lanes, SM paths, natural-key indexes all `org_id`-prefixed

**Security — credentials & keys**
- [ ] Envelope encryption (KMS-wrapped DEK), per-org KEK, GCM AAD bind, zero plaintext at rest verified
- [ ] KEK rotation (≥ annual + on-compromise) re-wraps online + audited; old versions decrypt-only then disabled
- [ ] OAuth refresh/rotation (≤ 75% TTL) + mid-job re-auth + one-click revoke implemented & tested
- [ ] Apple `.p8` / Google SA keys unwrapped-on-use, never persisted/logged
- [ ] Secret-scanning + log redaction in CI; build fails on a hit

**Security — egress, input, AI**
- [ ] Per-source **exact-host** egress allowlist; RFC-1918/metadata denied; no user fetch URLs; redirects re-validated
- [ ] Webhook receivers verify HMAC-SHA-256 on raw body, constant-time, per-tenant key, ±300s timestamp, nonce-replay reject
- [ ] Parsers sandboxed (no net/FS/exec); size/zip-bomb/XXE/formula-injection/zip-slip defenses verified
- [ ] Only schema + masked samples reach CrystalOS; credentials never sent (CI-asserted)
- [ ] `mayProcessWithAI=false` sources never reach the agents client (tested); MAP/ENRICH output schema-validated; propose-only holds; prompt-injection cases covered

**Security — process**
- [ ] Connector code + `legalPosture` security-reviewed (two-reviewer) & counsel-signed before catalog
- [ ] SBOM produced; dep-audit + SAST + integrity-hash install gating; pre-GA pen-test closed (no open critical/high)
- [ ] Audit events for connect/extract/approve/load/reconcile/delete (content-free); TM review scheduled

**Governance — lineage, classification, retention, erasure**
- [ ] Every canonical row carries full `metadata.prism`; forward+backward lineage queryable; "where did this number come from" resolves in the UI
- [ ] Any row reproducible from `(raw, mapping_version, schema version)`; remap replays without re-hitting source/duplicating
- [ ] Every mapped field has a class; PII detection ran; `secret`/`regulated`/`ugc` gates enforced in code; logs/metrics = `operational` only
- [ ] Retention set per class + per table; raw defaults `purge_after_reconcile`; purge jobs run + audited; legal hold overrides; statutory floors honored
- [ ] DSAR access + erasure locate across responses/signals/contacts/raw, soft-delete→propagate→purge, content-free audit; legal-hold wins conflicts; backups cannot resurrect an erased subject

**Governance — metric, consent, residency, posture, catalog**
- [ ] `metric_method` set; changes owner-only, preview delta, audited; reconciliation gates on parity
- [ ] IRB/FERPA/HIPAA consent + retention preserved as embedded data; lawful basis stamped per row
- [ ] Connection/data/workers region-pinned; no cross-region; supported regions **[⚠ verify prod]** confirmed
- [ ] Sub-processors enumerated, under DPA flow-down, disclosed to the controller
- [ ] `legalPosture` recorded; license attestation stored where required; `legal_basis` per row; counsel sign-off on review sources
- [ ] Dataset cataloged with owner + provenance; org-scoped discovery only; catalog is a Postgres view

---

> **Bottom line:** Prism's security rests on three structural properties that make whole classes of
> attack impossible rather than merely monitored — **(1)** secrets are envelope-encrypted with a
> **per-org key**, AAD-bound to their tenant, and never leave KMS in plaintext; **(2)** there is
> **no cross-tenant query, queue, or secret path**, continuously tested; **(3)** workers can **only
> egress to allowlisted source hosts** and CrystalOS can **only propose**. Governance makes the data
> flowing through them **accountable** — traceable, classified, retainable, erasable, reproducible,
> and lawful by construction. Everything else hardens, audits, and proves those properties.
