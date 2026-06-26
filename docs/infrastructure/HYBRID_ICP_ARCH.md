# Hybrid ICP + OCI/GCP Architecture

**Status:** Research
**Last updated:** 2026-06-23
**Scope:** Architecture design for a hybrid deployment that combines ICP (Internet Computer Protocol by DFINITY) as a trust and data sovereignty layer with OCI/GCP as the primary compute layer.

---

## Overview

Experient's stack is compute-heavy and latency-sensitive: LangGraph insight pipelines, Crystal AI real-time streaming, Redis-backed progressive tier triggers, and pgvector semantic search. These workloads require conventional cloud infrastructure with predictable latency and Docker container support.

ICP (DFINITY Internet Computer) is a blockchain-native cloud that offers unique capabilities no conventional cloud can match: tamperproof on-chain data via certified variables, VetKeys threshold cryptography for user-owned encrypted data, and native token economics via SNS (Service Nervous System). These capabilities are powerful for trust, compliance, and creator economy use cases — but ICP cannot run LangGraph, FastAPI, or streaming SSE due to WebAssembly constraints and per-call consensus latency (2-5 seconds per HTTP outcall).

The hybrid approach: **ICP owns trust, OCI/GCP owns compute.**

ICP is never in the request path for Crystal AI or insight generation. It is written to asynchronously, as a fire-and-forget commit after compute work is done on OCI/GCP.

---

## Core Principle: Responsibility Split

| Responsibility | Platform | Rationale |
|---------------|----------|-----------|
| LLM inference (OpenRouter/Anthropic) | OCI/GCP | No consensus latency; streaming SSE required |
| LangGraph insight pipeline | OCI/GCP | Python, stateful DAG, pgvector, Redis |
| Crystal ReAct streaming agent | OCI/GCP | SSE streaming incompatible with ICP |
| Postgres + pgvector (memory layer) | OCI/GCP | Standard SQL required; pgvector extension |
| Redis (rate limiting, streams) | OCI/GCP | Sub-millisecond latency required |
| Node.js backend API | OCI/GCP | Express, Clerk auth, pg driver |
| React frontend CDN | GCP (Firebase Hosting) | Already deployed |
| **Insight audit trail** | **ICP** | Tamperproof, immutable, publicly verifiable |
| **SKILL.md skill marketplace** | **ICP** | Version-controlled, on-chain royalties |
| **Respondent data sovereignty** | **ICP** | VetKeys encrypted, user-owned |
| **Token economics** | **ICP** | SNS DAO, skill author royalties |

---

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                        ICP — Trust Layer                             │
│                                                                      │
│  ┌─────────────────┐  ┌──────────────────┐  ┌────────────────────┐  │
│  │ insight_audit   │  │ skill_marketplace│  │ respondent_data    │  │
│  │ canister        │  │ canister         │  │ canister           │  │
│  │                 │  │                  │  │                    │  │
│  │ - insight hash  │  │ - SKILL.md files │  │ - VetKeys encrypted│  │
│  │ - trust score   │  │ - version history│  │   response blobs   │  │
│  │ - timestamp     │  │ - usage counters │  │ - owner: respondent│  │
│  │ - immutable log │  │ - author royalties│  │ - org can query    │  │
│  └────────▲────────┘  └────────▲─────────┘  └────────▲───────────┘  │
│           │ commit              │ publish/invoke        │ store/verify │
└───────────┼─────────────────────┼──────────────────────┼─────────────┘
            │ async               │ async                 │ async
            │ fire-and-forget     │                       │
┌───────────┼─────────────────────┼──────────────────────┼─────────────┐
│           │    OCI/GCP — Compute Layer                  │             │
│           │                     │                       │             │
│  ┌────────┴──────────────────────┴───────────────────────┴──────────┐ │
│  │                    CrystalOS (FastAPI + LangGraph)               │ │
│  │                                                                  │ │
│  │  node_publish ──► commit insight hash to ICP audit canister      │ │
│  │  skill_runtime ──► record_invocation on ICP marketplace canister │ │
│  │  response ingest ──► hash + store encrypted blob on ICP          │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌─────────────────┐  ┌──────────────────┐  ┌────────────────────┐  │
│  │ Node.js backend │  │ Postgres + pgvec │  │ Redis              │  │
│  │ Express API     │  │ Primary datastore│  │ Rate limiting      │  │
│  │ Clerk auth      │  │ LangGraph chkpts │  │ Streams + cache    │  │
│  └─────────────────┘  └──────────────────┘  └────────────────────┘  │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │ Firebase Hosting — React frontend (already GCP)                 │ │
│  └─────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

---

## ICP Canisters

### Canister 1: `insight_audit` (Motoko)

**Triggered by:** `node_publish` in `crystalos/graphs/insights.py`, after Postgres writes complete.

**Purpose:** Provides a tamperproof, publicly verifiable record that an insight run produced a specific result at a specific time. No Experient employee can retroactively alter it.

**Interface:**

```motoko
actor InsightAudit {
    type Commit = {
        surveyId   : Text;
        orgId      : Text;
        runId      : Text;
        hash       : Text;   // SHA-256 of full insight JSON (sorted keys)
        trustScore : Nat;
        timestamp  : Int;    // nanoseconds since epoch
    };

    // Append-only log. Only Experient's service principal can write.
    stable var log : [(Text, Commit)] = [];

    public shared(msg) func commit(c : Commit) : async () {
        assert(msg.caller == EXPERIENT_SERVICE_PRINCIPAL);
        log := Array.append(log, [(c.runId, c)]);
    };

    // Free query — anyone can verify without paying cycles
    public query func verify(runId : Text) : async ?Commit {
        Array.find(log, func(e : (Text, Commit)) : Bool { e.0 == runId })?.1
    };

    public query func getByOrg(orgId : Text) : async [Commit] {
        Array.map(
            Array.filter(log, func(e : (Text, Commit)) : Bool { e.1.orgId == orgId }),
            func(e : (Text, Commit)) : Commit { e.1 }
        )
    };
}
```

**Data committed per insight run:**

```json
{
  "surveyId": "srv_abc123",
  "orgId": "org_xyz",
  "runId": "run_2026-06-23-001",
  "hash": "sha256:e3b0c44298fc1c149afb...",
  "trustScore": 84,
  "timestamp": 1750636800000000000
}
```

**Enterprise value:** An org can prove to auditors, regulators, or customers: *"Our Q2 NPS insights published on 2026-06-23 with trust score 84/100 have not been modified."* Relevant for GDPR Article 5 (accuracy), SOC 2 change management controls, and enterprise VoC program governance.

**Estimated cost:** ~$0.65 to deploy. ~$1–2/month at 10,000 insight runs/month.

---

### Canister 2: `skill_marketplace` (Rust)

**Triggered by:** EVALS.md quality gate pass in CrystalOS skill CI; usage logged per invocation by `skill_runtime.py`.

**Purpose:** Immutable, versioned registry of SKILL.md files. Third-party contributors publish skills; Experient runs the EVALS.md gate; passing skills are committed on-chain with their quality score. Usage counters enable on-chain royalty distribution in Phase 4.

**Data model:**

```rust
#[derive(CandidType, Deserialize, Clone)]
pub struct SkillRecord {
    pub id           : String,       // e.g. "nps_analysis/v2"
    pub name         : String,
    pub category     : String,       // "nps" | "csat" | "ces" | "custom"
    pub content      : String,       // full SKILL.md text
    pub content_hash : String,       // SHA-256 of content
    pub author       : Principal,    // ICP identity of contributor
    pub eval_score   : u8,           // EVALS.md gate score (0-100)
    pub version      : u32,
    pub published_at : u64,          // nanoseconds
    pub usage_count  : u64,
}

#[update]
fn publish_skill(skill: SkillRecord) -> Result<String, String>;
// Only callable by Experient service principal or authorized contributors.
// Stores content in stable memory, appends version to history.

#[update]
fn record_invocation(skill_id: String, org_id: String) -> ();
// Atomic usage_count increment. Called by CrystalOS skill_runtime after each skill run.
// In Phase 4: also credits author's token balance.

#[query]
fn get_skill(skill_id: String) -> Option<SkillRecord>;

#[query]
fn list_skills(category: Option<String>, min_eval_score: Option<u8>) -> Vec<SkillSummary>;

#[query]
fn get_skill_history(skill_name: String) -> Vec<SkillRecord>;
// Returns all published versions, oldest first. Immutable history.
```

**CrystalOS integration** — two-tier skill lookup in `skill_runtime.py`:

```python
async def get_skill_config(skill_name: str) -> SkillConfig:
    # Fast path: bundled built-in skills (local filesystem, zero latency)
    if skill_name in BUNDLED_SKILLS:
        return BUNDLED_SKILLS[skill_name]

    # Community path: ICP marketplace (cached in Redis L1 for 1 hour)
    cached = await redis.get(f"icp_skill:{skill_name}")
    if cached:
        return SkillConfig.parse_raw(cached)

    record = await icp_client.get_skill(skill_name)
    if record:
        await redis.setex(f"icp_skill:{skill_name}", 3600, record.json())
        return SkillConfig.from_record(record)

    raise SkillNotFoundError(skill_name)
```

**Contributor flow:**
1. Developer submits a SKILL.md file via PR or contributor portal
2. CI runs `EVALS.md` quality gate automatically
3. If `eval_score >= 72`, skill is auto-published to ICP marketplace canister
4. Skill becomes discoverable by all CrystalOS deployments
5. Usage counter increments on every invocation across all orgs

---

### Canister 3: `respondent_data` (Rust + VetKeys)

**Status:** Design now, implement when VetKeys reaches ICP mainnet (estimated late 2026). Ship Phase 1 (hash-only receipt) now.

**Purpose:** Respondents own their survey response. The org can query it but cannot delete or alter it. Complies with GDPR right to erasure (respondent triggers their own deletion from the canister, which fires a webhook to the backend to soft-delete from Postgres).

**Phase 1 (ships now — no VetKeys needed):** Store only the response hash on-chain as a tamperproof receipt. Respondent gets a receipt URL they can share to prove their response was received.

```rust
#[update]
fn store_receipt(survey_id: String, response_hash: String, 
                 respondent_anon_id: String) -> String;
// Returns receipt_id. Anonymous — no PII stored.

#[query]
fn verify_receipt(receipt_id: String) -> Option<Receipt>;
```

**Phase 3 (VetKeys mainnet):** Full encrypted response storage.

```
Flow with VetKeys:
1. Respondent's browser fetches a VetKey derived from:
      (respondent's Internet Identity principal) + (survey_id)
2. Response encrypted client-side before transmission
3. Encrypted blob stored in: (a) this canister, (b) Postgres on OCI/GCP
4. Org backend holds a service VetKey that can decrypt responses it owns
5. Respondent deletion: respondent calls canister directly → canister deletes blob
     → canister fires webhook to backend → backend soft-deletes from Postgres
```

**GDPR mapping:**
- Right of access (Art. 15): respondent queries their canister entry
- Right to erasure (Art. 17): respondent deletes their canister entry
- Data portability (Art. 20): respondent exports their encrypted blob
- No Experient engineer can access respondent data without the org's service key

---

## Connection Bridges

### How OCI/GCP calls ICP

ICP provides HTTP gateways and official agent libraries. Both sides of the Experient stack have first-class support.

**From CrystalOS (Python) — `ic-py`:**

```python
# crystalos/lib/icp_client.py
from ic.client import Client
from ic.identity import Ed25519Identity
from ic.agent import Agent
from ic.candid import encode, decode
import hashlib, json, time, asyncio

class ICPClient:
    def __init__(self, service_key_pem: str):
        self.agent = Agent(
            Ed25519Identity.from_pem(service_key_pem),
            Client(url="https://ic0.app")
        )
        self.audit_canister_id     = settings.ICP_AUDIT_CANISTER_ID
        self.marketplace_canister_id = settings.ICP_MARKETPLACE_CANISTER_ID

    async def commit_insight(self, survey_id: str, org_id: str, run_id: str,
                              insight_data: dict, trust_score: int) -> None:
        insight_hash = "sha256:" + hashlib.sha256(
            json.dumps(insight_data, sort_keys=True).encode()
        ).hexdigest()
        await self.agent.update_raw(
            self.audit_canister_id, "commit",
            encode([{
                "surveyId": survey_id, "orgId": org_id, "runId": run_id,
                "hash": insight_hash, "trustScore": trust_score,
                "timestamp": time.time_ns()
            }])
        )

    async def record_invocation(self, skill_id: str, org_id: str) -> None:
        await self.agent.update_raw(
            self.marketplace_canister_id, "recordInvocation",
            encode([{"skillId": skill_id, "orgId": org_id}])
        )
```

**Integration point in `graphs/insights.py` — `node_publish`:**

```python
async def node_publish(state: dict) -> dict:
    # ... existing Postgres writes (unchanged) ...

    # Fire-and-forget — ICP commit does not block pipeline completion
    asyncio.create_task(
        icp_client.commit_insight(
            survey_id=state["survey_id"],
            org_id=state["org_id"],
            run_id=state["run_id"],
            insight_data=state["published_insights"],
            trust_score=state.get("trust_score", 0),
        )
    )
    return state
```

**From Node.js backend (TypeScript) — `@dfinity/agent`:**

```typescript
// backend/src/lib/icpClient.ts
import { Actor, HttpAgent } from "@dfinity/agent";
import { Ed25519KeyIdentity } from "@dfinity/identity";
import { idlFactory as auditIdl } from "./generated/insight_audit.did.js";
import { idlFactory as marketplaceIdl } from "./generated/skill_marketplace.did.js";

const identity = Ed25519KeyIdentity.fromSecretKey(
    Buffer.from(process.env.ICP_SERVICE_KEY_HEX!, "hex")
);
const agent = new HttpAgent({ host: "https://ic0.app", identity });

export const auditCanister = Actor.createActor(auditIdl, {
    agent,
    canisterId: process.env.ICP_AUDIT_CANISTER_ID!,
});

export const marketplaceCanister = Actor.createActor(marketplaceIdl, {
    agent,
    canisterId: process.env.ICP_MARKETPLACE_CANISTER_ID!,
});
```

**Frontend verification endpoint** — add to `backend/src/routes/insights.ts`:

```typescript
// GET /api/insights/:surveyId/audit — returns ICP-verified audit trail for UI
router.get("/:surveyId/audit", requireAuth, async (req, res) => {
    const runs = await auditCanister.getByOrg(req.orgId) as AuditCommit[];
    const surveyRuns = runs.filter(r => r.surveyId === req.params.surveyId);
    res.json({ verified: true, commits: surveyRuns, verifyUrl: "https://ic0.app" });
});
```

This powers a *"Verified on ICP ✓"* badge in the insights UI.

---

## External Tech Stack

### ICP-specific tooling

| Tool | Purpose | Install |
|------|---------|---------|
| **`dfx` CLI** | Deploy canisters, run local ICP replica, manage cycles | `sh -ci "$(curl -fsSL https://internetcomputer.org/install.sh)"` |
| **Local ICP replica** | `dfx start` — full ICP node running locally for dev | Included with dfx |
| **Candid** | ICP interface description language (like Protobuf). Defines canister API. | Part of dfx |
| **`ic-py`** | Python ICP agent — CrystalOS calls to canisters | `pip install ic-py` |
| **`@dfinity/agent`** | JS ICP agent — Node.js backend calls to canisters | `npm install @dfinity/agent @dfinity/identity` |
| **Motoko** | Canister language for `insight_audit` (simple, ships fast) | Bundled with dfx |
| **Rust + `ic-cdk`** | Canister language for `skill_marketplace` and `respondent_data` | `cargo add ic-cdk` |
| **Cycles wallet** | ICP tokens → cycles conversion for mainnet deployment | ICP NNS dapp |

### New environment variables

```bash
# crystalos/.env + backend/.env
ICP_SERVICE_KEY_PEM=...          # Ed25519 PEM — Experient's ICP service identity
ICP_SERVICE_KEY_HEX=...          # Hex-encoded version for Node.js
ICP_AUDIT_CANISTER_ID=...        # insight_audit canister ID after mainnet deploy
ICP_MARKETPLACE_CANISTER_ID=...  # skill_marketplace canister ID
ICP_RESPONDENT_CANISTER_ID=...   # respondent_data canister ID (Phase 3)
```

### No new services required

OpenRouter, Anthropic, Clerk, Postgres, Redis, Firebase — all unchanged. ICP is purely additive.

---

## Build Phases

### Phase 1 — Audit Trail (2 weeks, ships with OCI MVP)

**Goal:** Tamperproof insight commits on ICP. "Verified on ICP ✓" badge in insights UI.

Steps:
1. Write `insight_audit` canister in Motoko
2. `dfx deploy --network ic` (mainnet)
3. Add `ic-py` to `crystalos/requirements.txt`
4. Implement `lib/icp_client.py` — `commit_insight()`
5. Add fire-and-forget `commit_insight()` call in `node_publish` (one line)
6. Add `@dfinity/agent` to backend
7. Add `GET /api/insights/:surveyId/audit` endpoint
8. Add "Verified on ICP ✓" badge to insights UI

**Deliverable:** Every insight run is permanently committed on-chain. Any enterprise customer can independently verify their insight history via `https://ic0.app/canister/<canister_id>`.

**Cost:** ~$0.65 one-time deployment. ~$1–2/month at production volume.

---

### Phase 2 — Skill Marketplace (4 weeks, during GCP migration)

**Goal:** SKILL.md skills are version-controlled on-chain. Usage tracked. Foundation for third-party contributors.

Steps:
1. Write `skill_marketplace` canister in Rust
2. Publish all existing bundled SKILL.md files to canister (migration script)
3. Add `record_invocation()` call in `skill_runtime.py` after each skill execution
4. Add `list_skills` endpoint in backend for marketplace browsing UI
5. Build contributor portal — form to submit SKILL.md, CI runs EVALS gate, auto-publishes on pass
6. Add `GET /api/skills/marketplace` endpoint (reads from ICP canister with Redis cache)

**Deliverable:** Skill marketplace is live. Third-party developers can contribute skills. Usage data accumulates on-chain.

---

### Phase 3 — Respondent Data Sovereignty (when VetKeys mainnet-stable, ~late 2026)

**Goal:** Respondents own their encrypted response. GDPR deletion flows through ICP.

Steps:
1. Write `respondent_data` canister in Rust
2. Add Internet Identity as optional respondent auth (alongside anonymous responses)
3. Add client-side VetKeys encryption in the survey fill page (`app/src/pages/SurveyFillPage.tsx`)
4. Add respondent deletion flow: II principal → canister delete → webhook → backend soft-delete
5. Add respondent data export (GDPR Art. 20 portability)

**Pre-VetKeys interim (ships now):** Store SHA-256 response hashes only, as tamperproof receipts. Respondents get a receipt URL. No encrypted content on-chain yet.

---

### Phase 4 — Token Economics (Year 2)

**Goal:** On-chain revenue share for skill contributors. Respondent reward tokens.

Steps:
1. Launch SNS (Service Nervous System) DAO for Experient platform governance
2. Issue `XPER` tokens: skill authors earn per invocation (from `usage_count` in marketplace canister)
3. Survey respondents earn micro-rewards for completing surveys (configurable per org)
4. Org subscription credits denominated in tokens
5. All settlement on-chain — no payment processor dependency for skill royalties

**Prerequisite:** Skill marketplace has adoption (Phase 2 must have community traction).

---

## Deployment Structure

```
/icp/                           ← New top-level directory
  dfx.json                      ← ICP canister project config
  canisters/
    insight_audit/
      main.mo                   ← Motoko canister
    skill_marketplace/
      src/
        lib.rs                  ← Rust canister
      Cargo.toml
    respondent_data/
      src/
        lib.rs                  ← Rust canister (Phase 3)
      Cargo.toml
  scripts/
    deploy.sh                   ← mainnet deploy script
    seed_skills.py              ← publishes existing SKILL.md files to marketplace
```

`dfx.json`:

```json
{
  "canisters": {
    "insight_audit": {
      "type": "motoko",
      "main": "canisters/insight_audit/main.mo"
    },
    "skill_marketplace": {
      "type": "rust",
      "package": "skill_marketplace",
      "candid": "canisters/skill_marketplace/skill_marketplace.did"
    },
    "respondent_data": {
      "type": "rust",
      "package": "respondent_data",
      "candid": "canisters/respondent_data/respondent_data.did"
    }
  },
  "networks": {
    "local": { "bind": "127.0.0.1:4943", "type": "ephemeral" },
    "ic":    { "providers": ["https://ic0.app"], "type": "persistent" }
  }
}
```

---

## OCI → GCP Migration Compatibility

The hybrid ICP layer adds zero friction to the OCI → GCP migration. ICP canisters are accessed via HTTPS from `ic0.app` — they're external services, like OpenRouter or Clerk. The `ICP_AUDIT_CANISTER_ID` env var stays the same across OCI and GCP deployments. No data migration, no schema changes, no redeployment of canisters.

Migration steps that involve ICP: **none.**

---

## Cost Model

| Component | OCI MVP cost | GCP Scale cost |
|-----------|-------------|----------------|
| `insight_audit` canister | ~$0.65 deploy + ~$1/month | Same — canister is on ICP, not OCI/GCP |
| `skill_marketplace` canister | ~$1.30 deploy + ~$2/month | Same |
| `respondent_data` canister | ~$1.30 deploy + ~$3/month (storage-heavy) | Same |
| `ic-py` / `@dfinity/agent` | No runtime cost (local libs) | No runtime cost |
| Cycles for update calls (writes) | ~$0.0001 per insight commit | Scales linearly with volume |

ICP canisters are billed in cycles. At 10,000 insight runs/month, the total ICP compute cost is under $5/month. This is not a meaningful cost driver.

---

## Enterprise Positioning

The hybrid architecture enables a differentiation statement no conventional XM platform can match:

> *"Experient's AI insights are cryptographically committed to the Internet Computer blockchain at the moment of generation. Any stakeholder can independently verify that your survey results on a given date showed a specific score and have not been retroactively altered — without trusting Experient's servers. Respondent data is encrypted with keys only the respondent holds."*

This is directly relevant to:
- **Financial services**: SOX and internal audit requirements for data integrity
- **Healthcare**: HIPAA data lineage and immutable audit trails
- **Enterprise VoC programs**: Board-level reporting credibility ("our NPS is auditable")
- **GDPR markets**: Right to erasure and data portability backed by code, not policy

Competitors (Qualtrics, Medallia, SurveyMonkey) have no equivalent. This is a moat that takes 2-3 years to replicate because it requires rearchitecting the trust model from scratch.

---

## Related Documents

- [`docs/GCP_DEPLOY.md`](../GCP_DEPLOY.md) — Stage 2 compute migration guide
- [`docs/OCI_DEPLOY.md`](../OCI_DEPLOY.md) — Stage 1 MVP deployment guide
- [`docs/PLATFORM_ROADMAP.md`](../PLATFORM_ROADMAP.md) — Product roadmap with stage milestones
- [`crystalos/CLAUDE.md`](../../crystalos/CLAUDE.md) — CrystalOS architecture and `node_publish` reference
- [`docs/agent-framework/skills.md`](../agent-framework/skills.md) — SKILL.md format specification
