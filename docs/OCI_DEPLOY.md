# Experient — OCI Production Deployment Guide

> **IaC-first**: `terraform apply` provisions all cloud infrastructure. `cloud-init` configures
> the server on first boot. After ~15 minutes you have a running production environment.
> This doc covers first-time setup, security, day-2 operations, and runbooks.

---

## Architecture

```
Internet
   │
   ▼
Cloudflare (free)
  ├─ DDoS protection + CDN
  ├─ SSL termination (edge)
  └─ Proxies to OCI VM
         │
         ▼ port 443 (HTTPS)
   ┌─────────────────────────────────────────────┐
   │  OCI A1 Arm VM  (4 OCPU / 24 GB RAM)        │
   │  Ubuntu 22.04 · Always Free tier            │
   │                                             │
   │  nginx (reverse proxy + SSL + rate limit)   │
   │    ├─ /api/*      → :3001 (Node.js)         │
   │    ├─ /api/public → :3001 (no auth)         │
   │    └─ /           → /app/dist (React SPA)   │
   │                                             │
   │  Node.js backend   (:3001, PM2)             │
   │  Python agents     (:8001, PM2, localhost)  │
   │  PostgreSQL 15     (:5432, localhost only)  │
   │  Redis 7           (:6379, localhost only)  │
   └─────────────────────────────────────────────┘
         │ backups
         ▼
   OCI Object Storage (20 GB free)
```

**Network rules**: Only ports 22, 80, 443 are open externally. Ports 3001, 8001, 5432, and 6379
are bound to 127.0.0.1 — reachable only from within the VM via nginx or PM2.

**No Docker in production**: Services run directly under PM2 (Node.js) and uvicorn (Python).
Reduces overhead and avoids the ARM64 image-build complexity for the Arm VM.

---

## Prerequisites Checklist

Before running any commands, have these ready:

| Item | Where to get it | Time |
|---|---|---|
| OCI account (Always Free) | cloud.oracle.com | 5-30 min (identity verification) |
| Domain name | Cloudflare Registrar (cloudflare.com/products/registrar) | 10 min |
| Cloudflare account | cloudflare.com | 5 min |
| Clerk Pro account | clerk.com → upgrade to Pro ($25/mo) | 10 min |
| OpenRouter API key | openrouter.ai | 5 min |
| Anthropic API key | console.anthropic.com | 5 min |
| OpenAI API key | platform.openai.com | 5 min (for embeddings pipeline) |
| Terraform CLI | `brew install terraform` | 2 min |
| OCI CLI | `brew install oci-cli` | 2 min |
| SSH key pair | `ssh-keygen -t ed25519 -f ~/.ssh/oci_experient` | 1 min |

---

## Part 1 — One-Time Account Setup

### 1.1 OCI API Keys

After creating your OCI account:

```
OCI Console (top-right) → Profile → User Settings → API Keys → Add API Key
→ Generate API Key Pair → Download private key → Add
→ Copy the Configuration File Preview (you'll need tenancy_ocid, user_ocid, fingerprint)
```

Save the private key to `~/.oci/oci_api_key.pem` and run:
```bash
chmod 600 ~/.oci/oci_api_key.pem
oci setup config   # confirms ~/.oci/config is correct
oci iam user get --user-id <your-user-ocid>   # should return your user JSON
```

### 1.2 Find Your Compartment OCID

For most accounts use the root compartment (same as tenancy OCID):
```
OCI Console → Identity → Compartments → root → copy OCID
```

### 1.3 Domain in Cloudflare

1. Buy domain at cloudflare.com/products/registrar — DNS is automatic
2. If you bought elsewhere: Cloudflare → Add a Site → follow nameserver change instructions
3. Wait for Cloudflare to show your domain as "Active" before proceeding

---

## Part 2 — Terraform Deployment

### 2.1 Configure Variables

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars` — fill in every value. See comments in the file.
Generate secrets locally:
```bash
openssl rand -hex 24   # use for db_password
openssl rand -hex 24   # use for redis_password
openssl rand -hex 32   # use for agents_internal_key
```

> **Security**: `terraform.tfvars` is gitignored. Never commit it.
> After `terraform apply`, secrets are embedded in the VM's cloud-init
> and written to `/home/appuser/app/.env` with `chmod 600`.

### 2.2 Initialize and Apply

```bash
terraform init
terraform plan    # review: 1 VCN, 1 security list, 1 subnet, 1 IGW,
                  #         1 route table, 1 A1 VM, 1 Object Storage bucket
terraform apply   # type 'yes'
```

Takes ~2 minutes. Outputs the VM public IP:
```
vm_public_ip = "123.456.789.0"
vm_ssh_command = "ssh -i ~/.ssh/oci_experient appuser@123.456.789.0"
```

### 2.3 Watch cloud-init Progress

```bash
# SSH in and tail the setup log
ssh -i ~/.ssh/oci_experient appuser@YOUR_VM_IP \
  'sudo tail -f /var/log/cloud-init-output.log'
```

Expected output after ~10 minutes:
```
=== cloud-init complete ===
=== Next: point DNS A record to this VM, then run: /home/appuser/setup-ssl.sh ===
```

Verify services started:
```bash
ssh appuser@YOUR_VM_IP 'pm2 status'
# ┌─ backend  online ─┐
# └─ agents   online ─┘

ssh appuser@YOUR_VM_IP 'curl -s http://localhost:3001/api/health'
# {"status":"ok","version":"2.0.0","backend":"local","db":"ok"}
```

---

## Part 3 — DNS Setup (Cloudflare)

### 3.1 Add DNS Records

In Cloudflare DNS for `yourdomain.com`:

| Type | Name | Content | Proxy | TTL |
|---|---|---|---|---|
| `A` | `@` | `YOUR_VM_IP` | ✅ Proxied (orange) | Auto |
| `A` | `www` | `YOUR_VM_IP` | ✅ Proxied (orange) | Auto |
| `CNAME` | `auth` | `frontend.clerk.accounts.dev` | ❌ DNS only (grey) | Auto |

> The orange cloud proxy hides your real server IP and adds Cloudflare's
> DDoS protection. `auth` must be grey (DNS only) because Clerk requires a
> direct TLS connection to verify the custom domain.

### 3.2 Cloudflare Security Settings

```
SSL/TLS → Overview → Mode: Full (strict)
SSL/TLS → Edge Certificates:
  Always Use HTTPS: ON
  HSTS: ON (max-age=31536000, includeSubDomains, Preload)
  Minimum TLS Version: TLS 1.2
  TLS 1.3: ON

Security → Settings:
  Security Level: Medium
  Bot Fight Mode: ON

Speed → Optimization:
  Auto Minify: JS + CSS + HTML
  Brotli: ON
```

### 3.3 Check DNS Propagation

```bash
# Should return YOUR_VM_IP
dig +short yourdomain.com
dig +short www.yourdomain.com

# auth subdomain — should return frontend.clerk.accounts.dev
dig +short auth.yourdomain.com CNAME
```

Cloudflare DNS propagates in ~1-5 minutes when bought through Cloudflare Registrar.

---

## Part 4 — SSL Certificate

Once DNS is propagated and points to your VM:

```bash
ssh appuser@YOUR_VM_IP '/home/appuser/setup-ssl.sh'
```

This script:
1. Runs `certbot certonly --nginx` for your domain + www
2. Switches nginx from the bootstrap HTTP config to the full HTTPS config
3. Reloads nginx

After this runs:
- HTTP → HTTPS redirect is active
- Let's Encrypt cert is installed (valid 90 days, auto-renews at 30 days)
- Security headers are active (HSTS, X-Frame-Options, etc.)

Verify:
```bash
curl -I https://yourdomain.com/api/health
# HTTP/2 200
# strict-transport-security: max-age=31536000; ...

# SSL quality check — should score A+
open https://www.ssllabs.com/ssltest/analyze.html?d=yourdomain.com
```

---

## Part 5 — Frontend Build & Deploy

Build locally with production env vars:

```bash
# Create app/.env.production (gitignored)
cat > app/.env.production << EOF
VITE_API_URL=https://yourdomain.com
VITE_CLERK_PUBLISHABLE_KEY=pk_live_...
VITE_FIREBASE_API_KEY=AIzaSy...
VITE_FIREBASE_AUTH_DOMAIN=experient-prod.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=experient-prod
VITE_FIREBASE_STORAGE_BUCKET=experient-prod.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123
VITE_SENTRY_DSN=https://...@sentry.io/...
EOF

cd app && npm run build:app

# Deploy to VM
scp -r dist/ appuser@YOUR_VM_IP:/home/appuser/app/app/dist/

# Reload nginx to pick up new static files
ssh appuser@YOUR_VM_IP 'sudo systemctl reload nginx'
```

Verify:
```bash
curl -I https://yourdomain.com
# HTTP/2 200
# content-type: text/html
```

---

## Part 6 — Clerk Production Setup

### 6.1 Production Instance

1. clerk.com → your application → **Configure** tab
2. **Domains** → Add domain: `https://yourdomain.com`
3. **Authentication** → Enable Email/Password + any OAuth providers
4. Confirm your `CLERK_SECRET_KEY` in `.env` is `sk_live_...` (not `sk_test_`)

### 6.2 Custom Auth Domain

1. Clerk Dashboard → **Domains** → **Add satellite domain** → `auth.yourdomain.com`
2. Clerk shows a required CNAME — already set in Part 3
3. Click **Verify** — takes up to 5 minutes

After verification, your sign-in page is served from `auth.yourdomain.com` with no Clerk branding.

### 6.3 Verify JWT Auth

```bash
# Should return 401 with no token
curl https://yourdomain.com/api/surveys
# {"error":"Missing authorization header"}

# Should return 200 after sign-in (grab JWT from browser DevTools → Application → Clerk)
curl -H "Authorization: Bearer <token>" https://yourdomain.com/api/surveys
# {"surveys": [...]}
```

---

## Part 7 — CI/CD (GitHub Actions)

### 7.1 Add GitHub Secrets

`GitHub repo → Settings → Secrets → Actions → New repository secret`

| Secret | Value |
|---|---|
| `OCI_HOST` | VM public IP |
| `OCI_SSH_KEY` | Private key contents: `cat ~/.ssh/oci_experient` |
| `OCI_HOST_DOMAIN` | `yourdomain.com` (used for smoke test) |
| `VITE_API_URL` | `https://yourdomain.com` |
| `VITE_CLERK_PUBLISHABLE_KEY` | `pk_live_...` |
| `VITE_FIREBASE_API_KEY` | Firebase config value |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase config value |
| `VITE_FIREBASE_PROJECT_ID` | Firebase config value |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase config value |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase config value |
| `VITE_FIREBASE_APP_ID` | Firebase config value |
| `VITE_SENTRY_DSN` | Sentry DSN (optional) |

### 7.2 How the Pipeline Works

```
Push to main
  │
  ├─ [test] Frontend lint + typecheck + tests + backend syntax
  │
  ├─ [build-frontend] npm run build:app with production env → artifact
  │
  └─ [deploy]
       ├─ SSH: git pull + npm ci + migrate + pip install + pm2 reload
       ├─ SCP: upload dist/ artifact → /home/appuser/app/app/dist/
       ├─ SSH: sudo systemctl reload nginx
       └─ Smoke test: curl /api/health → must return HTTP 200
```

### 7.3 Manual Deploy (without GitHub Actions)

```bash
ssh appuser@YOUR_VM_IP '
  set -e
  cd /home/appuser/app
  git pull origin main
  cd backend && npm ci --omit=dev && cd ..
  DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-) node scripts/migrate.js
  cd agents && source venv/bin/activate && pip install -r requirements.txt -q && cd ..
  pm2 reload all --update-env
'
```

---

## Security Reference

### What's Hardened and Why

| Layer | Control | Detail |
|---|---|---|
| **SSH** | Key-only auth | `PasswordAuthentication no` in sshd_config |
| **SSH** | Root login disabled | `PermitRootLogin no` |
| **SSH** | Brute-force protection | fail2ban: ban after 5 failed attempts for 1 hour |
| **OS firewall** | UFW default-deny | Only 22, 80, 443 inbound |
| **OS firewall** | iptables (OCI layer) | OCI requires both UFW and iptables rules |
| **nginx** | HSTS preload | `max-age=31536000; includeSubDomains; preload` |
| **nginx** | Security headers | X-Frame-Options, X-Content-Type, Referrer-Policy |
| **nginx** | Rate limiting | 30 req/min (API), 60 req/min (public) |
| **nginx** | Path blocking | `.git`, `.env`, `*.sql`, `*.sh` return 404 |
| **nginx** | No version exposure | `server_tokens off` (default in Ubuntu nginx) |
| **Postgres** | Localhost only | `listen_addresses = 'localhost'` |
| **Postgres** | scram-sha-256 auth | No MD5, no trust for network connections |
| **Postgres** | Least privilege | `appuser` has no SUPERUSER, no CREATEDB |
| **Redis** | Localhost only | `bind 127.0.0.1 -::1` |
| **Redis** | Password required | `requirepass` set, `protected-mode yes` |
| **App** | No root process | All services run as `appuser` |
| **App** | CORS restricted | `ALLOWED_ORIGIN` env var, rejects other origins in prod |
| **App** | Metrics localhost-only | `/api/metrics` returns 403 for non-localhost requests |
| **App** | Auth bypass locked | `SKIP_AUTH` is never set in the cloud-init .env |
| **Secrets** | `.env` permissions | `chmod 600` — readable only by `appuser` |
| **Secrets** | Never in git | `.env` and `terraform.tfvars` are gitignored |
| **SSL** | Let's Encrypt | 90-day cert, auto-renews at 30 days via certbot systemd timer |
| **SSL** | Full (strict) mode | Cloudflare verifies the cert on the OCI VM — no MITM gap |

### Security Audit Commands

Run these any time to verify the posture:

```bash
# External port scan — 3001/8001/5432/6379 must all be "filtered"
nmap -p 22,80,443,3001,8001,5432,6379 YOUR_VM_IP

# Verify .env is not web-accessible
curl -I https://yourdomain.com/.env           # must be 404
curl -I https://yourdomain.com/.git/config    # must be 404

# Verify security headers
curl -sI https://yourdomain.com | grep -i "strict-transport\|x-content\|x-frame\|referrer"

# Verify metrics is localhost-only
curl https://yourdomain.com/api/metrics       # must be 403

# Check fail2ban is active
ssh appuser@YOUR_VM_IP 'sudo fail2ban-client status sshd'

# Check SSL cert expiry
ssh appuser@YOUR_VM_IP 'sudo certbot certificates'
```

---

## Day-2 Operations

### Logs

```bash
# All logs (live)
ssh appuser@YOUR_VM_IP 'pm2 logs'

# Backend only (last 200 lines)
ssh appuser@YOUR_VM_IP 'pm2 logs backend --lines 200'

# Agents only
ssh appuser@YOUR_VM_IP 'pm2 logs agents --lines 100'

# nginx access log
ssh appuser@YOUR_VM_IP 'sudo tail -f /var/log/nginx/access.log'

# nginx error log
ssh appuser@YOUR_VM_IP 'sudo tail -f /var/log/nginx/error.log'

# System journal (OS-level)
ssh appuser@YOUR_VM_IP 'sudo journalctl -u pm2-appuser -f'
```

### Process Management

```bash
# Status
ssh appuser@YOUR_VM_IP 'pm2 status'

# Restart (hard — kills then starts, brief downtime)
ssh appuser@YOUR_VM_IP 'pm2 restart backend'

# Reload (graceful — waits for in-flight requests, zero downtime)
ssh appuser@YOUR_VM_IP 'pm2 reload backend'
ssh appuser@YOUR_VM_IP 'pm2 reload agents'

# Reload both after a deploy
ssh appuser@YOUR_VM_IP 'pm2 reload all --update-env'

# Flush old log files
ssh appuser@YOUR_VM_IP 'pm2 flush'
```

### Update .env Secrets (e.g., rotating API keys)

```bash
ssh appuser@YOUR_VM_IP
nano /home/appuser/app/.env   # edit the value
pm2 reload all --update-env   # reload picks up new env
```

### Rollback

```bash
ssh appuser@YOUR_VM_IP '
  cd /home/appuser/app
  git log --oneline -10        # find the commit hash to roll back to
  git checkout <commit-hash>
  cd backend && npm ci --omit=dev && cd ..
  pm2 reload all
'
```

---

## Backups & Recovery

### Manual Backup

```bash
ssh appuser@YOUR_VM_IP '/home/appuser/backup.sh'
# Creates a timestamped .sql.gz in OCI Object Storage bucket experient-backups
```

### List Backups in OCI

```bash
# On the VM (if OCI CLI configured):
oci os object list --bucket-name experient-backups --query 'data[].name'
```

Or view in OCI Console → Storage → Object Storage → experient-backups.

### Restore from Backup

```bash
# On the VM:
# 1. Download from OCI Object Storage
oci os object get \
  --bucket-name experient-backups \
  --name "postgres/20260101_030000.sql.gz" \
  --file /tmp/restore.sql.gz

# 2. Stop backend to prevent writes during restore
pm2 stop backend

# 3. Restore
PGPASSWORD="$(grep db_password /tmp/..." \
  gunzip -c /tmp/restore.sql.gz | psql -h localhost -U appuser experient

# 4. Restart
pm2 start backend
```

---

## Monitoring Setup

### UptimeRobot (Free, Required)

1. uptimerobot.com → free account → **Add New Monitor**
2. **Monitor 1**: Type HTTPS, URL `https://yourdomain.com/api/health`, interval 5 min
3. **Monitor 2**: Type HTTPS, URL `https://yourdomain.com`, interval 5 min
4. Alert contacts: add your email + Slack webhook if you have one

You'll receive an email within 5 minutes of any outage.

### Sentry (Error Tracking)

1. sentry.io → New Project → Platform: **Node.js** → name: `experient-backend`
2. New Project → Platform: **React** → name: `experient-frontend`
3. Copy DSNs to `/home/appuser/app/.env` as `SENTRY_DSN=...`
4. Rebuild frontend with `VITE_SENTRY_DSN=...` in `.env.production`
5. `pm2 reload backend --update-env` to pick up the backend DSN

### VM Resource Monitoring

```bash
ssh appuser@YOUR_VM_IP '
  echo "=== CPU + Memory ==="
  htop -d 0 -C
  echo "=== Disk ==="
  df -h
  echo "=== Swap ==="
  free -h
  echo "=== PM2 ==="
  pm2 monit
'
```

---

## Troubleshooting

### cloud-init didn't finish / services not running

```bash
ssh appuser@YOUR_VM_IP 'sudo cat /var/log/cloud-init-output.log | grep -i error'
# If it failed partway, you can re-run the failed commands manually.
# cloud-init only runs ONCE automatically — it won't re-run on reboot.
```

### nginx won't start (SSL cert not found)

This happens if you haven't run `setup-ssl.sh` yet — the HTTPS config references certs that don't exist:
```bash
# Check which nginx config is active
ssh appuser@YOUR_VM_IP 'sudo nginx -t'

# If it's the HTTPS config but cert doesn't exist, restore bootstrap config:
ssh appuser@YOUR_VM_IP '
  cp /tmp/nginx-bootstrap.conf /etc/nginx/sites-available/experient
  sudo nginx -t && sudo systemctl restart nginx
'
# Then once DNS is set up: /home/appuser/setup-ssl.sh
```

### OCI A1 "Out of Capacity" error during terraform apply

```
Error: 500-InternalError, Out of host capacity
```

Options:
1. Change `availability_domain_index` in `terraform.tfvars` from `0` to `1` or `2`
2. Try a different region (change `region` in tfvars — requires `terraform apply` against the new region)
3. Try again in a few hours — OCI releases capacity throughout the day

### Backend shows "CORS blocked" in browser

Verify `ALLOWED_ORIGIN` in `/home/appuser/app/.env` exactly matches your domain:
```bash
grep ALLOWED_ORIGIN /home/appuser/app/.env
# ALLOWED_ORIGIN=https://yourdomain.com   ← no trailing slash

pm2 reload backend --update-env
```

### Postgres connection refused

```bash
ssh appuser@YOUR_VM_IP '
  sudo systemctl status postgresql
  sudo -u postgres psql -c "\l"
  psql -h localhost -U appuser -d experient -c "SELECT 1;"
'
```

### Redis authentication failed

```bash
ssh appuser@YOUR_VM_IP '
  # Test with the password from .env
  REDIS_PASS=$(grep REDIS_URL /home/appuser/app/.env | grep -oP "(?<=:)[^@]+(?=@)")
  redis-cli -a "$REDIS_PASS" ping   # should return PONG
'
```

### SSL cert renewal failing

```bash
ssh appuser@YOUR_VM_IP 'sudo certbot renew --dry-run'
# If it fails, check that port 80 is open and nginx is running
# Certbot uses HTTP-01 challenge on port 80 for renewal
```

### Checking what's eating disk space

```bash
ssh appuser@YOUR_VM_IP '
  df -h /
  du -sh /home/appuser/logs/*  # PM2 logs
  du -sh /var/log/             # System logs
  sudo du -sh /var/lib/postgresql/15/main/  # Database
'
# Truncate PM2 logs if large:
pm2 flush
```

---

## Scaling Guide

### Stage 1 — Current: Single VM (up to ~2,000 concurrent users)

Everything runs on one A1 VM. Bottleneck will be AI API latency and Postgres connection limits before hardware.

**When to move**: PM2 shows CPU > 80% sustained, or Postgres `max_connections` (100) is regularly hit.

### Stage 2 — Add a Second VM (~2,000–10,000 users)

```bash
# In terraform.tfvars: add a second VM definition
# OR: spin up a second Terraform workspace for the DB VM

# Move Postgres + Redis to a dedicated VM (still free if using the 4 OCPU allocation)
# Keep Node backend + Python agents on VM 1
# Add OCI Load Balancer (1 always-free at 10 Mbps, or Flexible at ~$10/mo)
```

### Stage 3 — Managed Services (~10,000+ users, significant revenue)

```
Postgres → Neon Pro ($19/mo) or OCI DB for PostgreSQL
Redis    → Upstash ($8/mo) or OCI Cache ($65/mo)
Backend  → GCP Cloud Run (autoscales from 0 to N)
Agents   → GCP Cloud Run (same)
```

See `docs/TRACKER.md` → Phase 6, Stage 2 for the full task list.

---

## Go-Live Final Checklist

```
Infrastructure
□ terraform apply succeeded — VM is running
□ cloud-init finished — all services online (pm2 status shows all green)
□ Backups: manual /home/appuser/backup.sh ran, file appeared in OCI Object Storage

Network & SSL
□ DNS A records propagated (dig +short yourdomain.com → VM IP)
□ setup-ssl.sh ran — nginx serves HTTPS
□ SSL Labs: https://ssllabs.com/ssltest → A+
□ HTTP → HTTPS redirect works
□ auth.yourdomain.com verified in Clerk Dashboard

Application
□ https://yourdomain.com loads the React app
□ https://yourdomain.com/api/health → {"status":"ok","db":"ok"}
□ Sign-up / sign-in works end-to-end (Clerk Pro keys, sk_live_)
□ Create org → saved to Postgres (check: psql query on VM)
□ Create + publish survey → fill page loads
□ Password-protected survey → gate appears, correct password works
□ Insights run → agents respond (pm2 logs agents)

Security
□ curl https://yourdomain.com/.env → 404
□ curl https://yourdomain.com/api/metrics → 403
□ nmap -p 3001,5432,6379 YOUR_VM_IP → all filtered
□ SKIP_AUTH not set (grep SKIP_AUTH /home/appuser/app/.env → empty)
□ fail2ban active (sudo fail2ban-client status sshd)

CI/CD
□ Push a commit to main → GitHub Actions deploys automatically
□ Smoke test passes in the workflow

Monitoring
□ UptimeRobot monitors both health + homepage
□ Sentry receiving test events (backend + frontend)
□ VM reboot test: sudo reboot → wait 60s → pm2 status shows all green
```
