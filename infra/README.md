# Experient Infrastructure — OCI + Terraform

## What this automates

`terraform apply` does everything from the manual deployment guide in one command:
- Creates OCI VCN, subnets, security lists, internet gateway
- Provisions a free A1 ARM VM (4 OCPU / 24 GB RAM)
- Creates OCI Object Storage bucket for database backups
- cloud-init on first boot installs and configures:
  - OS hardening (UFW, iptables, fail2ban, SSH key-only auth)
  - PostgreSQL 15 + pgvector + pgcrypto
  - Redis 7 (password-protected, localhost only)
  - Node.js 22 + PM2
  - Python 3.12 + agents virtualenv
  - nginx (reverse proxy config)
  - All app dependencies + database migrations
  - Daily backup cron job

## What requires one manual step after

- **DNS**: Add A record in Cloudflare (you get the IP from `terraform output`)
- **SSL**: Run `/home/appuser/setup-ssl.sh` after DNS propagates
- **Frontend build**: `npm run build:app` + `scp` to server
- **Clerk custom domain**: click "Verify" in Clerk dashboard

## Prerequisites

```bash
# Install Terraform
brew install terraform     # macOS
# or: https://developer.hashicorp.com/terraform/downloads

# Install OCI CLI and configure
brew install oci-cli
oci setup config           # follow prompts — creates ~/.oci/config + API key pair

# Upload the generated API public key to OCI Console:
# Profile → User Settings → API Keys → Add API Key → Paste Public Key
```

## Deploy

```bash
cd infra/terraform

# One-time setup
cp terraform.tfvars.example terraform.tfvars
nano terraform.tfvars          # fill in all values

terraform init
terraform plan                 # review what will be created
terraform apply                # type 'yes' — takes ~2 min to provision

# Outputs the VM IP and next steps automatically
terraform output next_steps
```

## Watch cloud-init progress

```bash
# Connect and tail the setup log (~8-12 min total)
ssh -i ~/.ssh/id_ed25519 appuser@$(terraform output -raw vm_public_ip) \
  'sudo tail -f /var/log/cloud-init-output.log'
```

## After DNS propagates

```bash
# Install SSL certificate (run once)
ssh -i ~/.ssh/id_ed25519 appuser@$(terraform output -raw vm_public_ip) \
  '/home/appuser/setup-ssl.sh'
```

## Deploy frontend

```bash
cd ../../app
npm run build:app
scp -r dist/ appuser@$(cd ../infra/terraform && terraform output -raw vm_public_ip):/home/appuser/app/app/dist/
ssh appuser@$(cd ../infra/terraform && terraform output -raw vm_public_ip) \
  'sudo systemctl reload nginx'
```

## Update application (subsequent deploys)

```bash
ssh appuser@YOUR_VM_IP '
  cd /home/appuser/app
  git pull origin main
  cd backend && npm ci --omit=dev && cd ..
  DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-) node scripts/migrate.js
  cd agents && source venv/bin/activate && pip install -r requirements.txt -q && cd ..
  pm2 reload all
'
```

## Estimated cost

| Resource | Cost |
|---|---|
| OCI A1 VM (4 OCPU / 24 GB) | $0 Always Free |
| OCI Object Storage (backups) | $0 (20 GB Always Free) |
| Clerk Pro | $25/mo |
| AI APIs (OpenRouter + Anthropic) | ~$10-20/mo |
| **Total** | **~$35-45/mo** |
