# Experient AI Insights — Operations & Economics

> The cost, scale, and operability proof. This document defends the claim that Experient is **cheaper, more manageable, and more scalable** than every legacy XM competitor — using concrete numbers, not adjectives. Synthesized from [ARCHITECTURE.md](ARCHITECTURE.md), grounded in real model pricing as of May 2026.

Wherever this document contradicts the four-stage cloud strategy in `docs/PRODUCT_PLAN.md`, this document is more specific and supersedes it for the Insights surface.

---

## 1. The "boring stack" thesis

> **We will scale to $100M ARR on five primitives: Postgres, Redis, Cloud Run, GCS, and OpenRouter. No Kafka. No microservices fleet. No bespoke ML platform. No data warehouse. No Spark. No Kubernetes (until ARR > $50M). No SRE team (until ARR > $20M).**

Every primitive on that list is what a single engineer can operate from a laptop. Every primitive *not* on that list is what burns the ops budget at Qualtrics, Medallia, and InMoment. **The fewer moving parts, the cheaper we are, and the longer we stay cheap.**

This isn't a constraint. It's a strategic refusal — the operations analogue of the engine refusals in [ENGINE_DECISIONS.md §3](ENGINE_DECISIONS.md).

---

## 2. The unit economics, line by line

### 2.1 Cost of generating one insight

For a "typical" diagnostic insight (e.g., `driver.key` over ~200 responses with 8 questions):

| Step | Operation | Cost |
|---|---|---|
| Embed new responses (already cached for prior pass) | 0 net tokens | $0.000 |
| Compute Shapley regression | Pure Python, CPU on Cloud Run | ~$0.00002 (compute time) |
| Compute CIs via bootstrap (1,000 resamples) | Pure Python | ~$0.00001 |
| Retrieve top-K supporting quotes from pgvector | One indexed query | ~$0.000001 |
| Narrate via Gemini Flash 2.0 | ~800 input tokens, ~250 output tokens | $0.00006 + $0.000075 = **$0.000135** |
| Verifier pass via Gemini Flash 2.0 | ~600 input tokens, ~50 output tokens | $0.000045 + $0.000015 = **$0.000060** |
| Citation validator | Pure code | $0.000001 |
| Postgres insert | <1ms | $0.000001 |
| **Total cost to Experient** | | **~$0.0002** per insight |

We sell that as ~5 credits. At Pro pricing ($199/mo / 10,000 credits) that's $0.10. **Markup: 500×.** Gross margin: 99.96%.

### 2.2 Cost of a full survey regenerate

For a typical survey at peak load (1,000 responses, 12 questions, full DAG including L3/L4):

| Component | Volume | Cost |
|---|---|---|
| Embed new responses (~200 unembedded) | 200 × ~50 tokens | $0.0008 |
| Per-response emotion + ABSA | 200 × 600 input + 80 output tokens | $0.013 |
| BERTopic clustering | CPU-bound, ~5s on Cloud Run | $0.001 |
| LLM topic labeling | 8 clusters × ~400 + 50 tokens | $0.00056 |
| Shapley KDA across 12 predictors | CPU-bound, ~3s | $0.0006 |
| Prophet forecasts (NPS, response velocity) | ~2s | $0.0004 |
| Anomaly detection (changepoint + outlier) | <1s | $0.0001 |
| Predict churn (XGBoost over response features) | ~1s | $0.0002 |
| Generate ~18 insight cards (narrate + verify each) | 18 × ($0.000135 + $0.00006) | $0.0035 |
| **Total** | | **~$0.020** per full regenerate |

A Pro-tier customer running full regenerates every 5 minutes during business hours (12 hrs × 12 regens/hr = 144 regens/day, ~4,300/month) at this scale spends:

```
4,300 regens/month × $0.020 = $86/month in compute
```

We charge them $199/month. **Gross margin: 57% even at the highest realistic load.**

For 95% of customers the load is far lower (full regenerate hourly, ~720/month, ~$14.40/month compute), so blended gross margin is ~92%.

### 2.3 Cost of an NLQ question (Cmd+K)

| Step | Volume | Cost |
|---|---|---|
| Embed the question | ~30 tokens | $0.0000023 |
| Retrieve relevant insights + quotes via pgvector | <1ms | $0.000001 |
| LLM answer with citations | ~2,000 input + 300 output tokens | $0.00015 + $0.00009 = **$0.00024** |
| Verifier | ~1,500 + 50 tokens | $0.000115 + $0.000015 = $0.00013 |
| **Total** | | **~$0.0004** per NLQ |

A heavy user firing 100 NLQ questions per day spends us $0.04/day = $1.20/month. We charge 1 credit per NLQ; at Pro, that's effectively free for the user but profitable for us. **Margin: ~95%.**

### 2.4 Cost of storage per org

| Asset | Per response | At 100K responses | At 10M responses |
|---|---|---|---|
| Response row (JSONB) | ~2 KB | 200 MB | 20 GB |
| Embedding (1,536 dim float32 + metadata) | ~7 KB | 700 MB | 70 GB |
| Insight row (avg) | ~3 KB × 50 insights generated over lifetime | 150 MB | 15 GB |
| Audit log row (long-form) | ~5 KB × 50 | 250 MB | 25 GB |
| **Per-org total** | | **~1.3 GB** | **~130 GB** |

Cloud SQL Postgres at GCP: ~$0.17/GB/month for storage. **$0.22/month per 100K-response org**, **$22/month per 10M-response org**.

Plus a roughly equal cost for backup + WAL retention. **Worst-case storage cost: $44/month for a 10M-response org**, which would be paying us at minimum $1,000/month at Pro / Enterprise tier. **Storage margin >99%.**

---

## 3. Why competitors structurally cannot match

This is the most important section in this document. Cheapness is not a marketing pose; it's a *structural property of our stack vs. theirs.*

### 3.1 Qualtrics' cost-to-serve includes

- **Clarabridge NLP stack** (acquired 2021): ~150+ industry-tuned models, separate processing pipeline, ML engineers maintaining each
- **Lexalytics** (via InMoment/PG acquisition): another ~31 per-language models, separate pipeline
- **Press Ganey patient-experience pipelines** (vertical-specific, regulated)
- **Operational data warehouse** (their "Experience Data Records" tier): petabytes of customer data, dedicated warehouse engineering team
- **Forsta legacy stack** (different again): being slowly migrated
- **An implementation services org of >1,000 people** (per public Qualtrics filings before LTM): billable hours, but also cost of underutilized bench
- **A field sales org sized for $300K-ACV deals**: AEs, SEs, BDRs
- **A customer success org sized for white-glove enterprise**: dedicated CSMs per logo
- **Multi-region operations** with on-prem options for healthcare and government

Their reported gross margin (pre-acquisition, public filings) was ~80%. That's *with* $5/response pricing. Their per-response cost is structurally higher than ours by roughly **two orders of magnitude** because we don't carry any of those line items.

### 3.2 Medallia's cost-to-serve includes

- **Medallia Speech**: their own voice-transcription pipeline (alternative to commodity Whisper / Deepgram), with the ML team to maintain it
- **Digital Experience Analytics (DXA)**: session-replay + behavioral telemetry, a separate product within the platform
- **A roster of 30+ direct social/review-site connectors** maintained as point-to-point integrations
- **Hundreds of pre-existing ML models** they describe in marketing — each one is a maintenance liability
- A services org broadly comparable to Qualtrics'
- A "platform-of-platforms" architecture from a decade of acquisitions

Same outcome: they carry cost we don't.

### 3.3 The Experient line items we are happily missing

| Line item | Why we don't have it |
|---|---|
| Custom NLP models per language | LLMs cover 60+ languages |
| Services org for implementation | Self-serve onboarding; agentic skills |
| Per-vertical ML models | Adaptive taxonomy adapts at runtime |
| Voice transcription infra | Use Whisper / Deepgram via OpenRouter if we ship voice |
| Data warehouse | Postgres handles us through $50M ARR |
| Dedicated ML platform team | Our "ML team" is OpenRouter |
| Streaming infra (Kafka/Pulsar) | Redis queues are fine until $10M+ ARR |
| K8s + Helm + Argo + Istio | Cloud Run is enough until 100K users |
| Multi-cloud abstraction | GCP, full stop |
| Per-customer single-tenant deployments | Shared multi-tenant Postgres until enterprise |

Each refusal is a permanently lower cost basis.

### 3.4 What this means for the price war

The legacy stacks' gross margins are pinned by their cost basis. They cannot drop their list price below ~$3/response without losing money, given their structural costs (ML, services, voice, vertical depth, sales org). **Our cost per response is roughly $0.0002 to $0.002 depending on analysis depth.** We can drop our price to $0.10/response with a 50% gross margin. **We have a ~30× pricing headroom advantage.** Even if Qualtrics decides to price-war us, they go bankrupt before they catch us.

The "100× cheaper" claim in `docs/PRODUCT_PLAN.md` is conservative. The true ratio is closer to 500× at like-for-like analytical depth. We round to 100× because that's the number procurement teams find believable.

---

## 4. The four-stage scale model with concrete numbers

Mapping `docs/PRODUCT_PLAN.md` cloud strategy to insight engine economics.

### 4.1 Stage 1 — Firebase (now → 10K users, $0–$1M ARR)

```
Firebase Functions (Express API)
Firestore (replaced gradually by Cloud SQL Postgres in mid-stage)
Firebase Hosting (static frontend)
Memorystore Redis (small)
Single-region Cloud SQL Postgres (small instance)
Cloud Run (single small instance for the agents service)
```

| Component | Cost | Notes |
|---|---|---|
| Firebase Functions | ~$0/mo at low volume; ~$10/mo above 2M invocations | Generous free tier |
| Cloud SQL Postgres `db-g1-small` | ~$30/mo | 1.7 GB RAM, 10 GB storage, fine for 100 orgs |
| Memorystore Redis 1 GB | ~$40/mo | Hot LangGraph state, cache |
| Cloud Run (agents service) | ~$10–$30/mo | Scale-to-zero, mostly idle |
| Firebase Hosting + CDN | ~$0–$10/mo | |
| Cloud Storage (audit blobs) | ~$5/mo | Nearline class |
| OpenRouter spend (LLM) | $50–$200/mo at 10K free users | Most are inactive |
| **Total platform cost** | **~$150–$350/mo** | At 10K users / ~1K active |

**Ops headcount:** zero dedicated. The full-stack engineer pages once a quarter when Firebase auto-scales weirdly.

**Revenue at this stage:** ~$50K/mo MRR at typical PLG conversion. **Platform cost is <1% of revenue.**

### 4.2 Stage 2 — Cloud Run + Cloud SQL (10K → 100K users, $1M–$10M ARR)

```
Cloud Run (Express API + agents service, multi-instance)
Cloud SQL Postgres (with read replicas)
Memorystore Redis (HA, larger)
Cloud Storage (audit, exports)
Cloud Tasks (queue for async work; replaces direct Redis-as-queue if needed)
Cloudflare in front
```

| Component | Cost | Notes |
|---|---|---|
| Cloud Run (API + agents) | ~$200–$500/mo | 5–20 instances p99 |
| Cloud SQL Postgres `db-n1-standard-4` + replica | ~$400/mo | 15 GB RAM, 200 GB storage |
| Memorystore Redis HA, 5 GB | ~$200/mo | |
| pgvector ANN indexes | included in SQL | |
| Cloud Storage | ~$50/mo | |
| Cloud Tasks / Pub/Sub | ~$50/mo | |
| Cloudflare Pro | ~$20/mo | CDN, WAF |
| OpenRouter spend | $1,000–$5,000/mo | Scales with paid usage |
| Sentry, observability | ~$200/mo | |
| **Total platform cost** | **~$2,000–$6,500/mo** | At ~50K users / ~10K active |

**Ops headcount:** 1 platform engineer (could be the same eng doing app work part-time).

**Revenue at this stage:** ~$300K–$1M MRR. **Platform cost is <1% of revenue.**

### 4.3 Stage 3 — Multi-region (100K → 1M users, $10M–$50M ARR)

```
Cloud Run multi-region (us-central1, europe-west1, asia-northeast1)
Cloud SQL Postgres per region (HA + read replica per region)
Per-region Memorystore Redis
Per-region pgvector indexes
Cross-region read federation for global rollups (optional)
Cloudflare anycast routing
```

| Component | Cost | Notes |
|---|---|---|
| Cloud Run × 3 regions | ~$1,500/mo | Combined |
| Cloud SQL × 3 regions (HA + replica each) | ~$3,000/mo | |
| Memorystore × 3 regions | ~$600/mo | |
| Cloud Storage + replication | ~$300/mo | |
| Cloudflare Business | ~$200/mo | |
| OpenRouter spend | $10,000–$30,000/mo | |
| Observability | ~$1,000/mo | Datadog or Grafana Cloud |
| **Total platform cost** | **~$16,000–$36,000/mo** | At ~500K users |

**Ops headcount:** 2 platform engineers + 1 part-time SRE on-call rotation.

**Revenue at this stage:** ~$1M–$4M MRR. **Platform cost is <1% of revenue.** Notice the platform cost as a fraction of revenue stays roughly flat.

### 4.4 Stage 4 — Enterprise scale (1M+ users, $50M+ ARR)

```
Same architecture as Stage 3, scaled
Cloud SQL → upgrade to Spanner or AlloyDB if write contention demands
pgvector → consider HNSW or partitioned-by-org indexes
Dedicated single-tenant instances for the 1% of customers who pay for it
SOC 2 Type II, ISO 27001, HIPAA (per vertical), FedRAMP (per government deal)
```

| Component | Cost (rough) |
|---|---|
| Cloud SQL/Spanner global | $20K–$100K/mo |
| Cloud Run global | $10K/mo |
| Memorystore global | $5K/mo |
| OpenRouter | $100K–$500K/mo |
| Single-tenant enterprise instances | Pass-through to customer at premium |
| Observability | $5K/mo |
| **Total platform cost** | **~$140K–$620K/mo** |

**Ops headcount:** ~5 platform engineers, ~2 SREs, security engineer, compliance lead. Total ops team: ~10 people.

**Revenue at this stage:** $50M+ ARR = ~$4M+ MRR. **Platform cost ~10-15% of revenue at the high end** — and that's only because we're at full enterprise breadth.

### 4.5 The compounding insight

**Notice that platform cost as a fraction of revenue stays around 1% through three stages of growth.** This is the structural advantage. Legacy XM's platform cost is closer to 25–30% of revenue (the math: services revenue ~50% of total, services COGS ~30%, platform infra COGS ~10% — leaving the rest for sales, R&D, and margin). **We will have an enduring 20-point gross margin advantage** that we can spend on either (a) lower prices, (b) faster shipping, or (c) higher profit. We pick (b) and (a) for the first three years, (c) starting year four.

---

## 5. Operability — the manageable claim

"Scalable" without "manageable" is a death sentence — most YC-startup horror stories about scale failures are operability failures, not capacity failures. Our deliberate choices for manageability:

### 5.1 Five operational virtues

1. **One process model.** Every service is a Cloud Run container. No mixed-mode "this part is on K8s, that part is on Cloud Functions, the other is on Lambda." A new engineer learns one deployment, one rollback, one log destination.
2. **One database.** Postgres for everything (relational, JSONB documents, vectors, queues until ~10K req/s). When we add Redis it's only for hot caches and rate limits — neither is a source of truth.
3. **One observability stack.** Prometheus + Sentry + Loki (or Cloud Logging) — the existing stack. No 14-tool dashboard sprawl.
4. **One identity system.** Clerk for all auth (user + org). No homegrown JWT, no per-region IdP forks.
5. **One model provider.** OpenRouter brokers the LLM relationships. We swap models behind one config flag.

### 5.2 The 30-second on-call test

A new engineer is paged at 2 AM. Within 30 seconds they should be able to:
- Identify which service failed (Sentry alert tells them)
- Find recent deploys (single Cloud Run console)
- Read logs (single Loki/Cloud Logging query)
- Roll back (one button in Cloud Run)

This is the same test every well-run startup uses. We pass it because we have one of each thing.

### 5.3 The "vanish for a week" test

The founding team should be able to vanish for a week with the product running unattended. This is possible only if:
- Auto-scaling actually works (Cloud Run + Cloud SQL handle this)
- Background jobs are idempotent (yes — every job carries an idempotency key)
- Cost runaway has a cap (yes — per-org daily credit limits + global circuit breakers)
- Security has no manual gates (yes — Clerk for auth, rate limits for everything else)

We pass this test if and only if the engine refusals in [ENGINE_DECISIONS.md](ENGINE_DECISIONS.md) are honored. Each refusal is also an operability win.

### 5.4 Runbook count

We commit to ≤10 production runbooks at Stage 2, ≤25 at Stage 3, ≤50 at Stage 4. **Runbook count is a measure of operational complexity.** Each runbook represents a failure mode someone has to learn. Above 50, a single SRE can't hold the system in their head; they have to specialize, and we've lost the "one engineer can operate everything" virtue.

The standing refusals in [ENGINE_DECISIONS.md §3](ENGINE_DECISIONS.md) directly bound the runbook count. Every refused feature is a runbook never written.

### 5.5 Multi-tenant operational simplicity

A single Postgres database holds all orgs' data, scoped by `org_id`. Backups are global. Restores are global. Migrations apply to everyone in one operation. There is no per-org schema, no per-org instance, no per-org deploy pipeline. **Until we hit the 1% of enterprise customers who pay specifically for dedicated instances, the entire fleet is one logical system.**

This is in deliberate contrast to legacy XM: Qualtrics and Medallia run a hybrid of multi-tenant SaaS plus dozens of dedicated tenant deployments, each with its own quirks. Their operational complexity is a function of their customer mix; ours is a function of the standing refusals.

### 5.6 Disaster recovery posture

| Failure | RTO | RPO | Defense |
|---|---|---|---|
| Cloud Run instance crash | <30s | 0 | Auto-restart |
| Region outage (single region) | <5 min | <1 min | Stage 3+: failover to next region's read replica, manual promote |
| Postgres primary failure | <2 min | <5s | Cloud SQL HA auto-failover to standby |
| Redis loss | <1 min | <60s of cache | Rebuild from cold |
| pgvector index corruption | <60 min | 0 (data intact) | Daily reindex job, manual full rebuild |
| OpenRouter outage | <1 min | 0 | Fall back to direct OpenAI/Anthropic/Google APIs via routing flag |
| Full GCP outage | <4 hr | <30 min | Cold-restore to AWS on standby Terraform (Stage 4) |

The first 6 are auto-recovered. The last is a one-day Terraform exercise for Stage 4. **At Stage 1 and 2, we accept "GCP is down → we are down for hours" because the cost of multi-cloud is far above the expected loss.**

### 5.7 The cost of operating one new customer

When a new org signs up:

- Clerk creates the org (no work for us)
- A row inserted into `orgs` (no work)
- The agents service is ready (no work)
- LLM cost is per-call (no fixed cost)
- Storage is amortized over many orgs (negligible until paid usage)
- **Marginal cost of one new free org: <$0.10/month**

Compare this to Qualtrics: each new logo requires onboarding services hours, a CSM allocation, a dedicated taxonomy setup, a permissioning setup, and an SLA-bearing tenant configuration. **Their cost per logo at acquisition is in the thousands of dollars.** Ours is in the cents. This is the structural advantage made operational.

---

## 6. The cost ceiling per org

Every legacy XM platform has a horror story of a customer who ran a poorly-configured query and racked up a massive bill. We pre-empt by design.

### 6.1 Per-org daily credit cap

Hardcoded into the Insight pipeline. Each org has a `daily_credit_limit` (default ~2× their tier monthly average / 30). When the cap is hit:
1. Live mode continues (descriptive insights only)
2. Full regenerates are queued but not executed until midnight reset
3. NLQ falls back to "answer from cached insights" mode (no fresh tool calls)
4. The Insights page shows a banner: "Daily limit reached. Upgrade or wait until midnight reset."

This guarantees: **No customer's bill is ever a surprise.**

### 6.2 Per-org monthly budget guardrails

Customers can set a hard "do not exceed $X/month" cap in settings. Hitting it triggers the same fallback. **This is a feature legacy XM cannot offer because their cost model is bundled into multi-year contracts.**

### 6.3 Global circuit breaker

If OpenRouter spend across all orgs in 24 hours exceeds 2× the moving average, all non-essential calls (refresh-on-load, scheduled regenerates) are paused. Customers see "Insights generating slower than usual" — a soft degradation, not an outage. Engineering is paged.

### 6.4 LLM cost predictability

Our LLM cost is roughly:
```
cost_per_response = (embedding + emotion + ABSA) ≈ $0.0001
cost_per_full_regenerate = ~$0.02
cost_per_NLQ = ~$0.0004
```

These three multipliers, times observed volume, give us a per-org monthly LLM spend prediction within ±15%. **Finance can forecast accurately enough to set pricing tiers that always have positive unit economics.** Compared to legacy XM where COGS is dominated by services hours (unpredictable), this is a dramatic improvement.

---

## 7. Sustained-load benchmark

Concrete capacity numbers, computed against the architecture in [ARCHITECTURE.md](ARCHITECTURE.md).

### 7.1 Per Cloud Run instance (8 vCPU, 16 GB)

| Operation | Sustained throughput |
|---|---|
| Embed + emotion + ABSA per response | ~10/s (LLM-bound) |
| Compute NPS/CSAT update | ~5,000/s (DB-bound) |
| Full DAG regenerate | ~1 every 30s |
| NLQ response | ~5/s (LLM-bound) |

### 7.2 Per Cloud SQL `db-n1-standard-8` (8 vCPU, 30 GB)

| Operation | Sustained throughput |
|---|---|
| Response inserts | ~2,000/s |
| pgvector ANN search top-K=50 across 5M vectors | ~500/s |
| Insight upserts | ~5,000/s |

### 7.3 Capacity per region at Stage 3 with ~10 Cloud Run instances + 1 Cloud SQL

| Metric | Capacity |
|---|---|
| Responses/sec | ~1,000 sustained, ~10,000 burst |
| Full regenerates/min | ~20 sustained |
| NLQ queries/sec | ~50 sustained |
| Vector searches/sec | ~500 sustained |

**Translating to ARR:** at 1,000 responses/sec sustained, that's ~3.6M responses/hour, ~85M/day, ~2.5B/month. At Pro pricing equivalence, the revenue ceiling per region is ~$50M/month. **One region handles a $500M ARR-equivalent workload before we need to horizontally shard within a region.** We will not be there for years.

### 7.4 The headroom

Compared to legacy XM platforms running on bespoke ML infrastructure with services-org overhead, we have:

- **10× more headroom on responses/sec** per dollar of infra
- **100× more headroom on cost-per-insight**
- **Zero ramp-up cost per new customer**

These numbers are why "ready for global scale" is not a hope, it's the default.

---

## 8. The economics in one slide

For the investor deck. Use exactly this slide:

```
COST OF GENERATING ONE INSIGHT

Experient (LLM-native, adaptive taxonomy)        ~$0.0002
Legacy XM (services-heavy, fixed ML pipelines)   ~$1–$5

That's a 5,000–25,000× cost-to-serve advantage.
We sell at a 500× markup. They sell at a ~2× markup.
Even matching their margins, our prices can be 10× lower.

WHY IT'S STRUCTURAL

  Experient                       Legacy XM
  ─────────                       ─────────
  Multilingual LLMs (free)        Per-language NLP models (paid)
  Adaptive taxonomy (free)        Manual taxonomy mgmt (services)
  Self-serve onboarding (free)    Implementation services (paid)
  Pgvector + Postgres (cheap)     Bespoke ML platforms (expensive)
  5 MCP skills (modern)           100+ integrations (legacy)

The gross-margin gap is permanent.
```

---

## 9. The ops headcount commitment

A pledge to investors and the team.

| ARR | Engineering | Ops/SRE | Total platform people |
|---|---|---|---|
| <$1M | 3–5 full-stack engineers | 0 dedicated | 3–5 |
| $1M–$10M | 8–15 full-stack engineers | 1 platform engineer | 9–16 |
| $10M–$50M | 25–40 engineers (~5 platform-focused) | 2 SREs | 27–42 |
| $50M+ | 50–100 engineers (~10 platform-focused) | 4–6 SREs + security + compliance | 60–110 |

Compared to Qualtrics' >2,000-person engineering org pre-acquisition: **we will reach $50M ARR with under 50 engineers**, an absolute level of capital efficiency the legacy XM industry has not seen. The standing refusals in [ENGINE_DECISIONS.md](ENGINE_DECISIONS.md) are the enabling constraint.

---

## 10. Verifying the claim — the public dashboard

To make the cost claim defensible to skeptical buyers, we will publish (in Year 2) a public **cost-per-insight transparency dashboard**: rolling 30-day average cost of generating one insight on our stack. This is a marketing asset and a discipline mechanism simultaneously.

Legacy XM cannot publish a comparable dashboard because their cost-to-serve is dominated by services hours that don't fit on a dashboard. **The transparency is itself the differentiator.**

---

## 11. Risks to the cost story

The honest assessment:

| Risk | Likelihood | Mitigation |
|---|---|---|
| LLM prices rise 5× | Low (industry trend is the opposite) | Re-architect to use smaller models for ABSA/emotion; only narrate with the strong model |
| OpenRouter pricing changes adversely | Medium | Multi-provider fallback; direct contracts with Anthropic/Google possible at scale |
| Pgvector hits scale limits earlier than expected | Low | HNSW upgrade path; or migrate to Qdrant when needed (one-time migration cost) |
| Customer "abuses" credit system | Medium | Daily caps + global circuit breaker already designed |
| GCP egress costs blow up | Low | Cloudflare in front absorbs most CDN load |
| Per-region Postgres becomes a bottleneck | Medium at Stage 4 | Spanner migration plan exists; ~6 weeks of engineering |
| Cross-region replication cost surprises us | Medium | Replicate only insights + audit; not raw responses (those stay regional) |

None of these risks is existential. Each has a known mitigation path. **The cost story is robust.**

---

## 12. The closing summary

Three claims, all defended above:

1. **Cheaper:** Our cost per insight is $0.0002 vs. legacy XM's $1–$5. We have a structural 5,000–25,000× advantage. We charge 100–500× less and still book >85% gross margin.
2. **Manageable:** One process model, one database, one model provider, one identity system. Five primitives. Under 10 runbooks at Stage 2, under 50 at Stage 4. A new engineer is productive in a week.
3. **Scalable:** Per region we have $50M-ARR-equivalent capacity. Three regions = $500M ARR ceiling per architectural generation. No re-architecture needed before $50M ARR.

**The cheapness is not despite the simplicity — it is because of it.** Every refusal we make in [ENGINE_DECISIONS.md](ENGINE_DECISIONS.md) corresponds to a line item competitors carry and we don't. The cost moat is the simplicity moat.
