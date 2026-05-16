# Experient — GCP Production Deployment Guide

> Covers: Cloud SQL, Cloud Run (backend + agents), Cloud Pub/Sub, Cloud Scheduler,
> Secret Manager, Artifact Registry, VPC, and cost estimates.
> See also: `docs/TRACKER.md` → Phase 2: AI Insights Pipeline (v2) for task status.

---

## Prerequisites

- `gcloud` CLI installed and authenticated (`gcloud auth login`)
- Active GCP project with billing enabled
- Docker installed locally (for image builds)
- `psql` client available (for running migrations)
- Cloud SQL Auth Proxy binary ([download](https://cloud.google.com/sql/docs/postgres/sql-proxy))

```bash
# Set your project once — all commands below inherit this
gcloud config set project YOUR_PROJECT_ID
export PROJECT_ID=$(gcloud config get-value project)
export REGION=us-central1
```

---

## 1. Enable Required APIs

Run this once per project. Safe to re-run.

```bash
gcloud services enable \
  run.googleapis.com \
  sql-component.googleapis.com \
  sqladmin.googleapis.com \
  pubsub.googleapis.com \
  secretmanager.googleapis.com \
  cloudscheduler.googleapis.com \
  artifactregistry.googleapis.com \
  vpcaccess.googleapis.com \
  cloudresourcemanager.googleapis.com
```

---

## 2. Cloud SQL — Postgres 15 + pgvector

### 2a. Create the instance

```bash
gcloud sql instances create experient-db \
  --database-version=POSTGRES_15 \
  --tier=db-g1-small \
  --region=$REGION \
  --database-flags=cloudsql.enable_pgvector=on \
  --storage-auto-increase \
  --backup-start-time=03:00 \
  --availability-type=zonal
```

> Note: `cloudsql.enable_pgvector=on` enables the pgvector extension. The `CREATE EXTENSION IF NOT EXISTS vector;` call in the migrations will succeed once this flag is set.

### 2b. Create database and user

```bash
gcloud sql databases create experient --instance=experient-db

# Set a strong password — store it in Secret Manager (step 3) immediately
gcloud sql users create experient \
  --instance=experient-db \
  --password=CHANGE_ME_USE_SECRET_MANAGER
```

### 2c. Get the instance connection name

```bash
gcloud sql instances describe experient-db \
  --format="value(connectionName)"
# Output: YOUR_PROJECT_ID:us-central1:experient-db
```

### 2d. Run migrations via Cloud SQL Auth Proxy

```bash
# Start the proxy in the background
./cloud-sql-proxy YOUR_PROJECT_ID:us-central1:experient-db \
  --port=5432 &

# Run all migrations in order
export DB_URL="postgres://experient:YOUR_PASSWORD@localhost:5432/experient"
for f in $(ls supabase/migrations/*.sql | sort); do
  echo "Running $f ..."
  psql "$DB_URL" < "$f"
done

# Stop the proxy when done
kill %1
```

---

## 3. Secret Manager

Store all sensitive values here. Cloud Run services reference them with `--set-secrets`.

```bash
# Create each secret (run once)
gcloud secrets create DATABASE_URL       --replication-policy=automatic
gcloud secrets create ANTHROPIC_API_KEY  --replication-policy=automatic
gcloud secrets create OPENAI_API_KEY     --replication-policy=automatic
gcloud secrets create OPENROUTER_API_KEY --replication-policy=automatic
gcloud secrets create AGENTS_INTERNAL_KEY --replication-policy=automatic
gcloud secrets create CLERK_SECRET_KEY   --replication-policy=automatic

# Populate each secret with its value
echo -n "postgres://experient:PASSWORD@/experient?host=/cloudsql/YOUR_PROJECT_ID:us-central1:experient-db" \
  | gcloud secrets versions add DATABASE_URL --data-file=-

echo -n "sk-ant-..." \
  | gcloud secrets versions add ANTHROPIC_API_KEY --data-file=-

echo -n "sk-..." \
  | gcloud secrets versions add OPENAI_API_KEY --data-file=-

echo -n "sk-or-..." \
  | gcloud secrets versions add OPENROUTER_API_KEY --data-file=-

# Generate a random internal key for agent service auth
openssl rand -hex 32 \
  | gcloud secrets versions add AGENTS_INTERNAL_KEY --data-file=-

echo -n "sk_live_..." \
  | gcloud secrets versions add CLERK_SECRET_KEY --data-file=-
```

> The `DATABASE_URL` for Cloud Run uses the Unix socket path (`?host=/cloudsql/...`) rather than a TCP host. Cloud Run's built-in Cloud SQL connector handles the socket when you pass `--add-cloudsql-instances`.

---

## 4. Artifact Registry — Docker Image Repository

```bash
# Create one repository for all Experient images
gcloud artifacts repositories create experient \
  --repository-format=docker \
  --location=$REGION \
  --description="Experient service images"

# Configure Docker to authenticate with Artifact Registry
gcloud auth configure-docker ${REGION}-docker.pkg.dev

# Build and push backend image
docker build -t ${REGION}-docker.pkg.dev/$PROJECT_ID/experient/backend:latest \
  -f backend/Dockerfile backend/
docker push ${REGION}-docker.pkg.dev/$PROJECT_ID/experient/backend:latest

# Build and push agents image
docker build -t ${REGION}-docker.pkg.dev/$PROJECT_ID/experient/agents:latest \
  -f agents/Dockerfile agents/
docker push ${REGION}-docker.pkg.dev/$PROJECT_ID/experient/agents:latest
```

---

## 5. Cloud Pub/Sub — Event Bus

Replaces Redis Streams for the insight pipeline event bus when `EVENT_BUS=pubsub`.

```bash
# Create the topic
gcloud pubsub topics create insight-events

# Create the pull subscription (agents service consumes from here)
gcloud pubsub subscriptions create insight-consumers \
  --topic=insight-events \
  --ack-deadline=60 \
  --message-retention-duration=7d \
  --expiration-period=never
```

### Code changes needed for Pub/Sub

**`agents/consumers/event_bus.py`** — already abstracted; switching is an env var:

```bash
# Set in Cloud Run deploy (see step 7)
EVENT_BUS=pubsub
```

**`agents/consumers/_pubsub.py`** — create this file in the agents service:

```python
# agents/consumers/_pubsub.py
# Google Cloud Pub/Sub consumer — activated when EVENT_BUS=pubsub

from google.cloud import pubsub_v1
import os, json

PROJECT_ID = os.environ["GOOGLE_CLOUD_PROJECT"]
SUBSCRIPTION = os.environ.get("PUBSUB_SUBSCRIPTION", "insight-consumers")

def consume_events(handler):
    """Pull messages from Pub/Sub and dispatch to handler."""
    subscriber = pubsub_v1.SubscriberClient()
    subscription_path = subscriber.subscription_path(PROJECT_ID, SUBSCRIPTION)

    def callback(message):
        try:
            data = json.loads(message.data.decode("utf-8"))
            handler(data)
            message.ack()
        except Exception as e:
            print(f"[pubsub] handler error: {e}")
            message.nack()

    streaming_pull = subscriber.subscribe(subscription_path, callback=callback)
    print(f"[pubsub] Listening on {subscription_path}")
    return streaming_pull  # caller must call .result() to block

# Required package: google-cloud-pubsub
# Add to agents/requirements.txt: google-cloud-pubsub>=2.21.0
```

**`backend/src/lib/redisStream.js`** — publish side, add Pub/Sub path:

```javascript
// When EVENT_BUS=pubsub, publish via Cloud Pub/Sub REST API
// instead of Redis XADD. The agents service subscribes via pull.
if (process.env.EVENT_BUS === 'pubsub') {
  const { PubSub } = require('@google-cloud/pubsub');
  const pubsub = new PubSub();
  const topic = pubsub.topic(process.env.PUBSUB_TOPIC || 'insight-events');
  await topic.publishMessage({ json: payload });
} else {
  // existing Redis XADD path
  await redis.xadd('insight-events', '*', 'data', JSON.stringify(payload));
}
// Required package: @google-cloud/pubsub
// Add to backend/package.json: "@google-cloud/pubsub": "^4.x"
```

---

## 6. Cloud Run — Backend Service

```bash
# Grant Cloud Run SA access to secrets and Cloud SQL
export BACKEND_SA="experient-backend@$PROJECT_ID.iam.gserviceaccount.com"
gcloud iam service-accounts create experient-backend \
  --display-name="Experient Backend Service"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$BACKEND_SA" \
  --role="roles/cloudsql.client"

for SECRET in DATABASE_URL ANTHROPIC_API_KEY OPENROUTER_API_KEY CLERK_SECRET_KEY AGENTS_INTERNAL_KEY; do
  gcloud secrets add-iam-policy-binding $SECRET \
    --member="serviceAccount:$BACKEND_SA" \
    --role="roles/secretmanager.secretAccessor"
done

# Deploy
gcloud run deploy experient-backend \
  --image=${REGION}-docker.pkg.dev/$PROJECT_ID/experient/backend:latest \
  --platform=managed \
  --region=$REGION \
  --service-account=$BACKEND_SA \
  --add-cloudsql-instances=$PROJECT_ID:$REGION:experient-db \
  --set-env-vars="NODE_ENV=production,EVENT_BUS=pubsub,PUBSUB_TOPIC=insight-events" \
  --set-secrets="\
DATABASE_URL=DATABASE_URL:latest,\
ANTHROPIC_API_KEY=ANTHROPIC_API_KEY:latest,\
OPENROUTER_API_KEY=OPENROUTER_API_KEY:latest,\
CLERK_SECRET_KEY=CLERK_SECRET_KEY:latest,\
AGENTS_INTERNAL_KEY=AGENTS_INTERNAL_KEY:latest" \
  --min-instances=1 \
  --max-instances=10 \
  --concurrency=100 \
  --timeout=60 \
  --port=5001
```

After deploy, note the service URL and update DNS:

```bash
gcloud run services describe experient-backend \
  --region=$REGION \
  --format="value(status.url)"
# → https://experient-backend-HASH-uc.a.run.app
```

Map `api.experient.ai` to this URL via a Cloud Run domain mapping or Cloudflare CNAME.

---

## 7. Cloud Run — Agents Service

```bash
# Service account for agents
export AGENTS_SA="experient-agents@$PROJECT_ID.iam.gserviceaccount.com"
gcloud iam service-accounts create experient-agents \
  --display-name="Experient Agents Service"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$AGENTS_SA" \
  --role="roles/cloudsql.client"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:$AGENTS_SA" \
  --role="roles/pubsub.subscriber"

for SECRET in DATABASE_URL ANTHROPIC_API_KEY OPENAI_API_KEY AGENTS_INTERNAL_KEY; do
  gcloud secrets add-iam-policy-binding $SECRET \
    --member="serviceAccount:$AGENTS_SA" \
    --role="roles/secretmanager.secretAccessor"
done

# Get backend URL for inter-service calls
BACKEND_URL=$(gcloud run services describe experient-backend \
  --region=$REGION --format="value(status.url)")

# Deploy
gcloud run deploy experient-agents \
  --image=${REGION}-docker.pkg.dev/$PROJECT_ID/experient/agents:latest \
  --platform=managed \
  --region=$REGION \
  --service-account=$AGENTS_SA \
  --add-cloudsql-instances=$PROJECT_ID:$REGION:experient-db \
  --set-env-vars="\
AGENTS_ENV=prod,\
EVENT_BUS=pubsub,\
ENABLE_STREAM_CONSUMER=true,\
PUBSUB_SUBSCRIPTION=insight-consumers,\
GOOGLE_CLOUD_PROJECT=$PROJECT_ID,\
BACKEND_URL=$BACKEND_URL" \
  --set-secrets="\
ANTHROPIC_API_KEY=ANTHROPIC_API_KEY:latest,\
OPENAI_API_KEY=OPENAI_API_KEY:latest,\
AGENTS_DB_DSN=DATABASE_URL:latest,\
AGENTS_INTERNAL_KEY=AGENTS_INTERNAL_KEY:latest" \
  --min-instances=1 \
  --max-instances=5 \
  --cpu=2 \
  --memory=2Gi \
  --concurrency=10 \
  --timeout=300 \
  --port=8001
```

> `--min-instances=1` prevents cold starts for the stream consumer. `--cpu=2` is recommended because insight generation (embedding + LLM calls) is CPU-bound for the surrounding orchestration logic.

After deploy, wire the backend to the agents URL:

```bash
AGENTS_URL=$(gcloud run services describe experient-agents \
  --region=$REGION --format="value(status.url)")

gcloud run services update experient-backend \
  --region=$REGION \
  --update-env-vars="AGENTS_URL=$AGENTS_URL"
```

---

## 8. Cloud Scheduler — Periodic Insight Generation

Cloud Scheduler calls the agents service on a timer to trigger insight regeneration for active surveys.

```bash
# Get the agents service URL
AGENTS_URL=$(gcloud run services describe experient-agents \
  --region=$REGION --format="value(status.url)")

# Get the internal key for authenticating scheduler → agents
INTERNAL_KEY=$(gcloud secrets versions access latest --secret=AGENTS_INTERNAL_KEY)

# Paid tier: every 5 minutes
gcloud scheduler jobs create http insight-scheduler-paid \
  --schedule="*/5 * * * *" \
  --uri="$AGENTS_URL/scheduler/tick" \
  --message-body='{"tier":"paid"}' \
  --headers="Content-Type=application/json,X-Internal-Key=$INTERNAL_KEY" \
  --http-method=POST \
  --time-zone="UTC" \
  --location=$REGION \
  --oidc-service-account-email=$AGENTS_SA

# Free tier: hourly
gcloud scheduler jobs create http insight-scheduler-free \
  --schedule="0 * * * *" \
  --uri="$AGENTS_URL/scheduler/tick" \
  --message-body='{"tier":"free"}' \
  --headers="Content-Type=application/json,X-Internal-Key=$INTERNAL_KEY" \
  --http-method=POST \
  --time-zone="UTC" \
  --location=$REGION \
  --oidc-service-account-email=$AGENTS_SA
```

> Use OIDC authentication (`--oidc-service-account-email`) so the scheduler token is automatically verified by Cloud Run's built-in IAM check — no need to pass the `X-Internal-Key` header in production if you use this approach. Keep `X-Internal-Key` as a secondary check inside the handler for defense-in-depth.

---

## 9. VPC Connector (Cloud Run → Cloud SQL Private IP)

For production, connect via private IP instead of the Unix socket path to improve latency and avoid the Cloud SQL Auth Proxy overhead.

```bash
# Create a VPC connector in the same region
gcloud compute networks vpc-access connectors create experient-connector \
  --region=$REGION \
  --range=10.8.0.0/28

# Update both Cloud Run services to use it
for SERVICE in experient-backend experient-agents; do
  gcloud run services update $SERVICE \
    --region=$REGION \
    --vpc-connector=experient-connector \
    --vpc-egress=private-ranges-only
done
```

Then update `DATABASE_URL` secret to use the private IP instead of the Unix socket:

```bash
# Get the private IP of the Cloud SQL instance
gcloud sql instances describe experient-db \
  --format="value(ipAddresses[0].ipAddress)"

# Update the secret
echo -n "postgres://experient:PASSWORD@PRIVATE_IP:5432/experient" \
  | gcloud secrets versions add DATABASE_URL --data-file=-
```

---

## Scaling Considerations

### Cloud Run auto-scaling
- `--min-instances=1` on the agents service prevents cold start delays for the Pub/Sub pull consumer. Without it, the stream consumer won't be running between requests.
- `--min-instances=1` on the backend service ensures the first user of the day doesn't wait 10+ seconds.
- `--max-instances=10` on backend / `--max-instances=5` on agents keeps costs bounded. Adjust based on observed concurrency.

### pgvector IVFFlat index maintenance
- The IVFFlat index (`lists=100`) is built at index creation time. After large bulk inserts (e.g. importing thousands of historical responses), run:
  ```sql
  VACUUM ANALYZE response_embeddings;
  -- Then rebuild the index to account for new data distribution:
  REINDEX INDEX CONCURRENTLY response_embeddings_embedding_ivfflat;
  ```
- Consider upgrading to an HNSW index (`USING hnsw`) at 10M+ vectors for better recall without needing `VACUUM` rebuilds. Cloud SQL Postgres 15 supports HNSW via pgvector ≥0.5.0.

### Insight generation CPU usage
- Insight generation is CPU-bound on the agents side (embedding batch calls, LLM orchestration, numpy clustering for topic grouping). `--cpu=2` is recommended as a baseline.
- Monitor Cloud Run CPU utilization in Cloud Monitoring. If >70% sustained, increase to `--cpu=4` or scale out via `--max-instances`.

### High-volume Pub/Sub (>1000 responses/hour)
- The default pull delivery (`insight-consumers` subscription) introduces up to 1 second of additional latency per batch.
- At high volume, switch to **push delivery**: Cloud Pub/Sub pushes directly to the agents service HTTP endpoint, eliminating the pull loop latency.
  ```bash
  gcloud pubsub subscriptions modify-push-config insight-consumers \
    --push-endpoint="$AGENTS_URL/pubsub/push" \
    --push-auth-service-account=$AGENTS_SA
  ```
- Add an `/pubsub/push` POST route to the agents service that processes the message and returns 200 to acknowledge.

### Database connection pooling
- Cloud Run scales instances horizontally; each instance opens its own DB connection pool. At `--max-instances=10` with a pool size of 10, you get 100 connections. The `db-g1-small` tier allows ~25 connections.
- Use PgBouncer (via Cloud SQL's built-in connection pooling, or a sidecar) or reduce pool size per instance to 2–3 when running many instances.
- Set `?pool_size=3&max_overflow=2` in the agents service DSN for SQLAlchemy.

---

## Cost Estimate

| Component | Configuration | Estimated Monthly Cost |
|---|---|---|
| Cloud SQL | db-g1-small, us-central1, zonal, 10GB SSD | ~$10 |
| Cloud Run — Backend | 1 min instance, 1 vCPU, 512MB, ~1000 req/day | ~$8–15 |
| Cloud Run — Agents | 1 min instance, 2 vCPU, 2GB, ~500 invocations/day | ~$10–20 |
| Cloud Pub/Sub | ~1M messages/month | ~$0.04 |
| Secret Manager | 6 secrets, ~1000 access/day | ~$0.03 |
| Cloud Scheduler | 2 jobs | ~$0.10 |
| Artifact Registry | ~2GB storage | ~$0.20 |
| Cloud Monitoring | Default free tier | $0 |
| OpenAI embeddings | text-embedding-3-small @ $0.02/1M tokens | ~$1–5 |
| Anthropic Claude | claude-haiku-4-5, ~$0.05–0.10 per insight run | ~$5–15 |
| **Total** | Moderate usage (~500 surveys, 10K responses/mo) | **~$35–65/month** |

> Costs scale primarily with LLM API usage. At high volume (100K+ responses/month), OpenAI embedding costs and Anthropic narration costs will dominate. Consider batching embeddings and caching insight runs aggressively (the `insight_hash` + `time_window` unique index enables upsert-based caching at the DB layer).

---

## Deployment Checklist

Before going live, verify:

- [ ] All 6 secrets populated in Secret Manager and version `latest` is set
- [ ] Cloud SQL migration ran cleanly — check `\dt` lists all tables including `survey_topics`, `crystal_threads`, `insight_stream_offsets`
- [ ] pgvector extension active: `SELECT * FROM pg_extension WHERE extname = 'vector';`
- [ ] Both Cloud Run services show status `ACTIVE` and respond to health checks
- [ ] `GET $BACKEND_URL/api/health` returns `{"status":"ok"}`
- [ ] `GET $AGENTS_URL/health` returns `{"status":"ok"}`
- [ ] Cloud Scheduler jobs show next run time in Cloud Console
- [ ] Pub/Sub subscription `insight-consumers` has 0 undelivered messages after a test publish
- [ ] `SKIP_AUTH` is NOT set (or is explicitly `false`) in production env vars
- [ ] `NODE_ENV=production` set on backend Cloud Run service
- [ ] Sentry DSN env vars set (`VITE_SENTRY_DSN` on frontend build, `SENTRY_DSN` on backend)
