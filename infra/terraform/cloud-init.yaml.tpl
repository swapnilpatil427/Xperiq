#cloud-config
# Runs once on first boot (~8-12 min). Watch progress:
#   sudo tail -f /var/log/cloud-init-output.log
#
# Design rules:
#  - write_files: system-level files only (nginx, ssh, fail2ban, /tmp staging)
#    NEVER write into the git repo directory — git clone runs in runcmd and
#    would fail if the target directory already contains files.
#  - runcmd: all installs, git clone, copy staged files, start services.
#  - Terraform escaping: $${VAR} → literal ${VAR}, $$VAR → literal $VAR in output.

package_update: true
package_upgrade: true

packages:
  - unattended-upgrades
  - fail2ban
  - ufw
  - git
  - curl
  - wget
  - gnupg2
  - build-essential
  - software-properties-common
  - apt-transport-https
  - ca-certificates
  - net-tools
  - htop
  - ncdu
  - nginx
  - certbot
  - python3-certbot-nginx
  - iptables-persistent
  - netfilter-persistent

users:
  - name: appuser
    groups: [sudo, www-data]
    shell: /bin/bash
    sudo: "ALL=(ALL) NOPASSWD:/usr/sbin/nginx -s reload,/bin/systemctl reload nginx,/usr/bin/certbot"
    ssh_authorized_keys:
      - ${ssh_public_key}

write_files:
  # ── SSH hardening ─────────────────────────────────────────────────────────────
  - path: /etc/ssh/sshd_config.d/99-hardening.conf
    permissions: "0644"
    content: |
      PermitRootLogin no
      PasswordAuthentication no
      PubkeyAuthentication yes
      MaxAuthTries 3
      ClientAliveInterval 300
      ClientAliveCountMax 2
      AllowUsers ubuntu appuser

  # ── fail2ban ──────────────────────────────────────────────────────────────────
  - path: /etc/fail2ban/jail.local
    permissions: "0644"
    content: |
      [DEFAULT]
      bantime  = 3600
      findtime = 600
      maxretry = 5

      [sshd]
      enabled = true
      port    = ssh
      logpath = %(sshd_log)s
      backend = %(syslog_backend)s

      [nginx-req-limit]
      enabled  = true
      filter   = nginx-req-limit
      logpath  = /var/log/nginx/error.log
      maxretry = 10

  # ── Postgres init SQL (staged, run in runcmd after postgres install) ───────────
  - path: /tmp/pg-init.sql
    permissions: "0600"
    content: |
      CREATE USER appuser WITH PASSWORD '${db_password}';
      CREATE DATABASE experient OWNER appuser;
      GRANT ALL PRIVILEGES ON DATABASE experient TO appuser;
      \connect experient
      GRANT ALL ON SCHEMA public TO appuser;
      CREATE EXTENSION IF NOT EXISTS "vector";
      CREATE EXTENSION IF NOT EXISTS "pgcrypto";

  # ── Bootstrap nginx: HTTP only, no SSL required ───────────────────────────────
  # Used until setup-ssl.sh switches to the HTTPS config.
  # Serves certbot ACME challenge + proxies API — so the app works over HTTP
  # temporarily (Cloudflare handles HTTPS at the edge).
  - path: /tmp/nginx-bootstrap.conf
    permissions: "0644"
    content: |
      server {
          listen 80 default_server;
          listen [::]:80 default_server;
          server_name _;

          # Certbot ACME challenge (HTTP-01)
          location /.well-known/acme-challenge/ {
              root /var/www/certbot;
          }

          location /api/ {
              proxy_pass         http://127.0.0.1:3001;
              proxy_http_version 1.1;
              proxy_set_header   Host              $$host;
              proxy_set_header   X-Real-IP         $$remote_addr;
              proxy_set_header   X-Forwarded-For   $$proxy_add_x_forwarded_for;
              proxy_set_header   X-Forwarded-Proto $$scheme;
              proxy_set_header   Connection        "";
              proxy_read_timeout 120s;
          }

          root /home/appuser/app/app/dist;
          index index.html;
          location / {
              try_files $$uri $$uri/ /index.html;
          }
      }

  # ── Full HTTPS nginx (staged, installed by setup-ssl.sh after certbot) ─────────
  - path: /tmp/nginx-https.conf
    permissions: "0644"
    content: |
      limit_req_zone $$binary_remote_addr zone=api:10m    rate=30r/m;
      limit_req_zone $$binary_remote_addr zone=public:10m rate=60r/m;

      server {
          listen 80;
          listen [::]:80;
          server_name ${domain} www.${domain};
          return 301 https://$$host$$request_uri;
      }

      server {
          listen 443 ssl http2;
          listen [::]:443 ssl http2;
          server_name ${domain} www.${domain};

          ssl_certificate     /etc/letsencrypt/live/${domain}/fullchain.pem;
          ssl_certificate_key /etc/letsencrypt/live/${domain}/privkey.pem;
          include             /etc/letsencrypt/options-ssl-nginx.conf;
          ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;

          # Security headers
          add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
          add_header X-Content-Type-Options    "nosniff" always;
          add_header X-Frame-Options           "SAMEORIGIN" always;
          add_header X-XSS-Protection          "1; mode=block" always;
          add_header Referrer-Policy           "strict-origin-when-cross-origin" always;
          add_header Permissions-Policy        "camera=(), microphone=(), geolocation=()" always;

          # Authenticated API routes
          location /api/ {
              limit_req zone=api burst=20 nodelay;
              proxy_pass         http://127.0.0.1:3001;
              proxy_http_version 1.1;
              proxy_set_header   Host              $$host;
              proxy_set_header   X-Real-IP         $$remote_addr;
              proxy_set_header   X-Forwarded-For   $$proxy_add_x_forwarded_for;
              proxy_set_header   X-Forwarded-Proto $$scheme;
              proxy_set_header   Connection        "";
              proxy_connect_timeout  10s;
              proxy_send_timeout    120s;
              proxy_read_timeout    120s;
          }

          # Public survey endpoints (higher rate limit)
          location /api/public/ {
              limit_req zone=public burst=30 nodelay;
              proxy_pass         http://127.0.0.1:3001;
              proxy_http_version 1.1;
              proxy_set_header   Host              $$host;
              proxy_set_header   X-Real-IP         $$remote_addr;
              proxy_set_header   X-Forwarded-For   $$proxy_add_x_forwarded_for;
              proxy_set_header   X-Forwarded-Proto $$scheme;
              proxy_set_header   Connection        "";
          }

          # Frontend (React SPA)
          root /home/appuser/app/app/dist;
          index index.html;

          location / {
              try_files $$uri $$uri/ /index.html;
              location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2|woff|ttf)$$ {
                  expires 1y;
                  add_header Cache-Control "public, immutable";
                  access_log off;
              }
          }

          # Block sensitive paths
          location ~ /\.git        { deny all; return 404; }
          location ~ /\.env        { deny all; return 404; }
          location ~ /ecosystem    { deny all; return 404; }
          location ~* \.(sql|log|bak|sh|conf)$$ { deny all; return 404; }
      }

  # ── App .env (staged to /tmp, copied to repo after git clone) ─────────────────
  - path: /tmp/app.env
    permissions: "0600"
    content: |
      NODE_ENV=production
      BACKEND=local
      PORT=3001

      # CORS — must match your frontend URL exactly (no trailing slash)
      ALLOWED_ORIGIN=https://${domain}

      DATABASE_URL=postgresql://appuser:${db_password}@localhost:5432/experient

      REDIS_URL=redis://:${redis_password}@localhost:6379

      CLERK_SECRET_KEY=${clerk_secret_key}

      OPENROUTER_API_KEY=${openrouter_api_key}
      ANTHROPIC_API_KEY=${anthropic_api_key}
      OPENAI_API_KEY=${openai_api_key}

      AGENTS_INTERNAL_KEY=${agents_internal_key}
      AGENTS_URL=http://localhost:8001
      AGENTS_PORT=8001
      AGENTS_HOST=0.0.0.0
      AGENTS_ENV=prod
      AGENTS_DB_DSN=postgresql://appuser:${db_password}@localhost:5432/experient

      SENTRY_DSN=${sentry_dsn}

  # ── PM2 ecosystem (staged to /tmp, copied after git clone) ────────────────────
  - path: /tmp/ecosystem.config.cjs
    permissions: "0644"
    content: |
      module.exports = {
        apps: [
          {
            name: 'backend',
            cwd: '/home/appuser/app/backend',
            script: 'src/index.js',
            instances: 1,
            autorestart: true,
            watch: false,
            max_memory_restart: '512M',
            error_file: '/home/appuser/logs/backend-err.log',
            out_file:   '/home/appuser/logs/backend-out.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
          },
          {
            name: 'agents',
            cwd: '/home/appuser/app/agents',
            script: 'venv/bin/uvicorn',
            interpreter: 'none',
            args: 'main:app --host 127.0.0.1 --port 8001 --workers 2',
            autorestart: true,
            watch: false,
            max_memory_restart: '1G',
            env: {
              PYTHONPATH: '/home/appuser/app',
              PYTHONUNBUFFERED: '1',
            },
            error_file: '/home/appuser/logs/agents-err.log',
            out_file:   '/home/appuser/logs/agents-out.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
          },
        ],
      };

  # ── Daily backup script (staged to /tmp, installed in runcmd) ─────────────────
  - path: /tmp/backup.sh
    permissions: "0750"
    content: |
      #!/bin/bash
      set -euo pipefail
      DATE=$$(date +%Y%m%d_%H%M%S)
      BACKUP_FILE="/tmp/experient_$${DATE}.sql.gz"
      PGPASSWORD="${db_password}" pg_dump -h localhost -U appuser experient | gzip > "$$BACKUP_FILE"
      if command -v oci &>/dev/null; then
        NAMESPACE=$$(oci os ns get --query 'data' --raw-output 2>/dev/null || echo "")
        [ -n "$$NAMESPACE" ] && oci os object put \
          --bucket-name experient-backups \
          --name "postgres/$${DATE}.sql.gz" \
          --file "$$BACKUP_FILE" --force
      fi
      rm -f "$$BACKUP_FILE"
      echo "Backup complete: $${DATE}"

  # ── SSL setup script (run manually once after DNS propagates) ─────────────────
  - path: /tmp/setup-ssl.sh
    permissions: "0750"
    content: |
      #!/bin/bash
      # Run AFTER Cloudflare DNS A record has propagated to this VM's IP.
      # Check first: dig +short ${domain} — should return this server's public IP.
      set -euo pipefail
      echo "=== Running certbot for ${domain} ==="
      certbot certonly --nginx \
        -d ${domain} -d www.${domain} \
        --non-interactive --agree-tos \
        -m "admin@${domain}"
      echo "=== Installing HTTPS nginx config ==="
      cp /tmp/nginx-https.conf /etc/nginx/sites-available/experient
      nginx -t
      systemctl reload nginx
      echo "=== SSL setup complete. Visit https://${domain} ==="

runcmd:
  # ── Swap (4 GB — safety net even with 24 GB RAM) ──────────────────────────────
  - fallocate -l 4G /swapfile
  - chmod 600 /swapfile
  - mkswap /swapfile
  - swapon /swapfile
  - echo '/swapfile none swap sw 0 0' >> /etc/fstab

  # ── Firewall: UFW (user-space) ─────────────────────────────────────────────────
  - ufw default deny incoming
  - ufw default allow outgoing
  - ufw allow 22/tcp
  - ufw allow 80/tcp
  - ufw allow 443/tcp
  - ufw --force enable

  # ── Firewall: iptables (OCI requires this layer too) ──────────────────────────
  - iptables -I INPUT 6 -m state --state NEW -p tcp --dport 22 -j ACCEPT
  - iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
  - iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
  - netfilter-persistent save

  # ── Node.js 22 ────────────────────────────────────────────────────────────────
  - curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  - apt-get install -y nodejs
  - npm install -g pm2

  # ── Python 3.12 ───────────────────────────────────────────────────────────────
  - add-apt-repository ppa:deadsnakes/ppa -y
  - apt-get update -qq
  - apt-get install -y python3.12 python3.12-venv python3.12-dev

  # ── PostgreSQL 15 + pgvector ──────────────────────────────────────────────────
  - curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /etc/apt/trusted.gpg.d/postgresql.gpg
  - echo "deb [signed-by=/etc/apt/trusted.gpg.d/postgresql.gpg] https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list
  - apt-get update -qq
  - apt-get install -y postgresql-15 postgresql-contrib-15 postgresql-15-pgvector
  - systemctl enable postgresql
  - systemctl start postgresql
  # Performance tuning (append — safer than editing the main conf directly)
  - echo "listen_addresses = 'localhost'" >> /etc/postgresql/15/main/postgresql.conf
  - echo "shared_buffers = 2GB"          >> /etc/postgresql/15/main/postgresql.conf
  - echo "effective_cache_size = 18GB"   >> /etc/postgresql/15/main/postgresql.conf
  - echo "work_mem = 64MB"               >> /etc/postgresql/15/main/postgresql.conf
  - echo "maintenance_work_mem = 512MB"  >> /etc/postgresql/15/main/postgresql.conf
  - echo "wal_buffers = 64MB"            >> /etc/postgresql/15/main/postgresql.conf
  - systemctl restart postgresql
  # Create user, database, extensions
  - sudo -u postgres psql -f /tmp/pg-init.sql

  # ── Redis 7 ───────────────────────────────────────────────────────────────────
  - curl -fsSL https://packages.redis.io/gpg | gpg --dearmor -o /usr/share/keyrings/redis-archive-keyring.gpg
  - echo "deb [signed-by=/usr/share/keyrings/redis-archive-keyring.gpg] https://packages.redis.io/deb $(lsb_release -cs) main" > /etc/apt/sources.list.d/redis.list
  - apt-get update -qq
  - apt-get install -y redis
  - sed -i 's/^# *requirepass .*/requirepass ${redis_password}/' /etc/redis/redis.conf
  - echo "maxmemory 2gb"            >> /etc/redis/redis.conf
  - echo "maxmemory-policy allkeys-lru" >> /etc/redis/redis.conf
  - systemctl enable redis-server
  - systemctl restart redis-server

  # ── App user setup ─────────────────────────────────────────────────────────────
  - mkdir -p /home/appuser/logs
  - chown -R appuser:appuser /home/appuser/logs

  # ── Clone repository ───────────────────────────────────────────────────────────
  # Uses HTTPS. For private repos add ?access_token=... or use a deploy key.
  - sudo -u appuser git clone ${app_repo_url} /home/appuser/app
  - sudo -u appuser bash -c "cd /home/appuser/app && git checkout ${app_branch}"

  # ── Copy staged files into the repo / correct locations ───────────────────────
  - cp /tmp/app.env /home/appuser/app/.env
  - chmod 600 /home/appuser/app/.env
  - chown appuser:appuser /home/appuser/app/.env
  - cp /tmp/ecosystem.config.cjs /home/appuser/app/ecosystem.config.cjs
  - chown appuser:appuser /home/appuser/app/ecosystem.config.cjs
  - cp /tmp/backup.sh /home/appuser/backup.sh
  - chown appuser:appuser /home/appuser/backup.sh
  - cp /tmp/setup-ssl.sh /home/appuser/setup-ssl.sh
  - chown appuser:appuser /home/appuser/setup-ssl.sh

  # ── Backend dependencies ───────────────────────────────────────────────────────
  - sudo -u appuser bash -c "cd /home/appuser/app/backend && npm ci --omit=dev"

  # ── Database migrations ────────────────────────────────────────────────────────
  - sudo -u appuser bash -c "cd /home/appuser/app && DATABASE_URL='postgresql://appuser:${db_password}@localhost:5432/experient' node scripts/migrate.js"

  # ── Python agents virtualenv ───────────────────────────────────────────────────
  - sudo -u appuser bash -c "cd /home/appuser/app/agents && python3.12 -m venv venv && source venv/bin/activate && pip install --upgrade pip -q && pip install -r requirements.txt -q"

  # ── Bootstrap nginx (HTTP only — works before SSL cert exists) ─────────────────
  - mkdir -p /var/www/certbot
  - cp /tmp/nginx-bootstrap.conf /etc/nginx/sites-available/experient
  - ln -sf /etc/nginx/sites-available/experient /etc/nginx/sites-enabled/experient
  - rm -f /etc/nginx/sites-enabled/default
  - nginx -t && systemctl reload nginx

  # ── PM2: start processes + register as systemd service ────────────────────────
  - sudo -u appuser bash -c "cd /home/appuser/app && pm2 start ecosystem.config.cjs"
  - sudo -u appuser pm2 save
  - "env PATH=$PATH:/usr/bin pm2 startup systemd -u appuser --hp /home/appuser | tail -1 | bash"
  - systemctl enable pm2-appuser

  # ── Cron: daily backup at 3 AM ────────────────────────────────────────────────
  - echo "0 3 * * * appuser /home/appuser/backup.sh >> /home/appuser/logs/backup.log 2>&1" > /etc/cron.d/experient-backup

  # ── Security services ──────────────────────────────────────────────────────────
  - systemctl enable fail2ban && systemctl start fail2ban
  - systemctl restart sshd

  # ── Auto security updates ──────────────────────────────────────────────────────
  - dpkg-reconfigure --priority=low unattended-upgrades

  # ── Final ownership pass ───────────────────────────────────────────────────────
  - chown -R appuser:appuser /home/appuser/app

  - echo "=== cloud-init complete ==="
  - echo "=== Next: point DNS A record to this VM, then run: /home/appuser/setup-ssl.sh ==="
