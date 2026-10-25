# KloudRecon on one Ubuntu server: deployment plan

Everything on one Linux server: nginx (already installed), the web app, the API, the worker and
PostgreSQL. No Docker. Every process runs under systemd. PostgreSQL keeps its data on the
separate hard disk.

This plan replaces Parts C and D of `docs/02_KLOUDRECON_INFRA_AND_DEPLOYMENT.md` for this
server. The differences from that guide are: nginx instead of Caddy, the web app served from the
same server instead of Azure Static Web Apps, one domain for the app and the API, and the local
sign-in (email codes) instead of Entra External ID.

---

## 0. Read this first

### What you must decide or give me before we start

| # | Item | Notes |
|---|---|---|
| 1 | **The exact domain** | You wrote `kloudreco.com`. If the domain is really `kloudrecon.com`, say so; every command below uses the `DOMAIN` variable so only one line changes. |
| 2 | `www` record | The plan requests a certificate for `DOMAIN` and `www.DOMAIN`. `www` needs its own A (or CNAME) record. If you do not want `www`, drop it in steps 9 and 10. |
| 3 | Ubuntu version | The plan assumes **Ubuntu 24.04** (Python 3.12 and PostgreSQL 16 are in its standard packages). On 22.04 two extra package sources are needed; see Appendix A. |
| 4 | The hard disk device | The name `lsblk` shows for the data disk (for example `/dev/sdb`). Step 3 formats it: **everything on that disk is erased**. |
| 5 | Email for Let's Encrypt | Used by certbot for expiry notices. |
| 6 | Platform owner email | The account that signs in to the Control Center. |
| 7 | Azure values | See "What still lives in Azure" below. |

### What still lives in Azure (and why)

The application refuses to start in production mode (`ENV=prod`) unless customer secrets are kept
in **Azure Key Vault** (`SECRET_STORE=keyvault`). That is a deliberate guard in
`backend/src/kloudrecon/core/config.py`: the client secrets of your customers' Azure connections
must never sit in a file on the server. So "everything on the server" has three exceptions:

| Service | Needed for | Setting |
|---|---|---|
| Azure Key Vault | Customers' Azure client secrets | `SECRET_STORE=keyvault`, `KEY_VAULT_URL` |
| Azure Storage account (Blob) | Scan snapshots, reports, diagrams, exports, logos, database backups | `BLOB_MODE=azure`, `STORAGE_ACCOUNT_URL` |
| Azure Communication Services | Sign-in codes and notification emails (you already use it locally) | `EMAIL_MODE=acs`, `ACS_CONNECTION_STRING` |

Azure OpenAI is optional (`AI_MODE=mock` works without it).

If you want a server with **no** Azure dependency at all, that needs code changes first (an
encrypted secret store on disk and a file-system blob store). Tell me before deployment; do not
work around it by running with `ENV=local` in production, which also turns off other protections.

### How the server signs in to Key Vault and Blob

The code uses `DefaultAzureCredential`. Pick one:

- **The server is an Azure VM:** turn on its system-assigned managed identity and give that
  identity the two roles below. No secret is stored anywhere.
- **The server is anywhere else:** create one app registration ("KloudRecon server"), create a
  client secret for it, give it the two roles, and put `AZURE_TENANT_ID`, `AZURE_CLIENT_ID` and
  `AZURE_CLIENT_SECRET` in the environment file (step 6). That file is then a secret: keep it
  `root:kloudrecon`, mode `640`.

Roles to assign (Azure portal → the resource → Access control (IAM)):

| Resource | Role |
|---|---|
| Key Vault (permission model: Azure RBAC) | Key Vault Secrets Officer |
| Storage account | Storage Blob Data Contributor |

The six blob containers (`snapshots`, `reports`, `exports`, `diagrams`, `branding`,
`db-backups`) are created by the application on first use.

### Layout on the server

| Path | Content | Owner |
|---|---|---|
| `/opt/kloudrecon/app` | The code you copy (backend, apps/web, deploy, scripts) | `kloudrecon` |
| `/opt/kloudrecon/current` | Symlink to `app` (the systemd units use this path) | root |
| `/opt/kloudrecon/app/backend/.venv` | Python virtual environment, created on the server | `kloudrecon` |
| `/opt/kloudrecon/ms-playwright` | Chromium for PDF and Word reports | `kloudrecon` |
| `/var/www/kloudrecon` | The built web app that nginx serves | root, world-readable |
| `/etc/kloudrecon/kloudrecon.env` | Settings | `root:kloudrecon`, `640` |
| `/data/postgresql/16/main` | PostgreSQL data, on the hard disk | `postgres` |

### Services after deployment

| systemd unit | What | Listens on |
|---|---|---|
| `nginx` | HTTPS, static web app, proxy to the API | 80, 443 |
| `kloudrecon-api` | FastAPI on gunicorn | 127.0.0.1:8000 |
| `kloudrecon-worker` | Scans, reports, scheduler, emails | none |
| `kloudrecon-backup.timer` | Nightly database dump to Blob | none |
| `postgresql@16-main` | Database | localhost and unix socket |
| `certbot.timer` | Certificate renewal | none |

Only ports 22, 80 and 443 are open to the internet.

---

## 1. Copy the code to the server

Copy the project folder **without** these: `.venv`, `node_modules`, `apps/web/dist`,
`backend/.env`, `apps/web/.env.local`, `backend/.local-secrets`, `.git`, `__pycache__`, `e2e/.results`.
Your local `.env` files hold local settings and must not go to the server.

From Git Bash on Windows (one archive, then one copy):

```bash
cd "/d/Web Projects Live"
tar --exclude='.venv' --exclude='node_modules' --exclude='dist' --exclude='.git' \
    --exclude='__pycache__' --exclude='.local-secrets' --exclude='backend/.env' \
    --exclude='apps/web/.env.local' --exclude='.results' --exclude='.report' \
    -czf kloudrecon.tar.gz KloudRecon
scp kloudrecon.tar.gz <user>@<server-ip>:/tmp/
```

Everything from here runs on the server, in one SSH session, as a user with `sudo`.

```bash
# set these once per SSH session; every later step uses them
export DOMAIN=kloudreco.com            # <- confirm the spelling
export LE_EMAIL=<your-email>           # Let's Encrypt notices
export OWNER_EMAIL=<owner-email>       # Control Center account
```

## 2. Packages

```bash
sudo apt update && sudo apt -y upgrade
sudo apt -y install python3.12 python3.12-venv python3-pip build-essential libpq-dev \
    postgresql-16 postgresql-contrib-16 postgresql-client-16 \
    certbot python3-certbot-nginx ufw rsync curl ca-certificates dos2unix unattended-upgrades
# Node.js 22 (builds the web app; not needed at run time)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt -y install nodejs
python3.12 --version && node --version && psql --version && nginx -v
sudo timedatectl set-timezone UTC      # the backup timer and the scheduler assume UTC
```

Firewall:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw --force enable
sudo ufw status
```

## 3. Hard disk for PostgreSQL

Skip the format if the disk is already formatted and mounted; then only make sure it is mounted
at `/data` and in `/etc/fstab`.

```bash
lsblk -f                                  # find the data disk, for example sdb, with no mountpoint
export DISK=/dev/<device>                 # <- the WHOLE disk you want to use. It will be erased.
sudo mkfs.ext4 -L kloudrecon-data "$DISK"
sudo mkdir -p /data
echo "UUID=$(sudo blkid -s UUID -o value "$DISK")  /data  ext4  defaults,noatime,nofail  0  2" | sudo tee -a /etc/fstab
sudo mount -a && df -h /data              # must show the disk mounted on /data
```

Move the PostgreSQL cluster to the disk. On a fresh server the default cluster is empty, so it is
recreated on the new path (nothing is lost). **Do not run this on a server whose PostgreSQL
already holds data you need.**

```bash
sudo systemctl stop postgresql
sudo pg_dropcluster --stop 16 main
sudo mkdir -p /data/postgresql
sudo chown postgres:postgres /data/postgresql
sudo pg_createcluster 16 main --datadir=/data/postgresql/16/main --locale=C.UTF-8 --encoding=UTF8
```

PostgreSQL must wait for the disk at boot, and must not start on an empty mount point:

```bash
sudo mkdir -p /etc/systemd/system/postgresql@16-main.service.d
sudo tee /etc/systemd/system/postgresql@16-main.service.d/data-disk.conf >/dev/null <<'EOF'
[Unit]
RequiresMountsFor=/data
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now postgresql@16-main
sudo -u postgres psql -Atc "show data_directory"      # must print /data/postgresql/16/main
```

## 4. Service user and code

```bash
sudo adduser --system --group --home /opt/kloudrecon --shell /usr/sbin/nologin kloudrecon
sudo mkdir -p /opt/kloudrecon /etc/kloudrecon /var/www/kloudrecon
sudo tar -xzf /tmp/kloudrecon.tar.gz -C /opt/kloudrecon
sudo mv /opt/kloudrecon/KloudRecon /opt/kloudrecon/app
sudo ln -sfn /opt/kloudrecon/app /opt/kloudrecon/current
# files that came from Windows may have CRLF line endings; shell scripts must be LF
sudo find /opt/kloudrecon/app -type f \( -name '*.sh' -o -name 'kloudrecon-activate' -o -name '*.service' -o -name '*.timer' -o -name '*.conf' -o -name '*.sql' -o -name '*.snippet' \) -exec dos2unix -q {} +
sudo chown -R kloudrecon:kloudrecon /opt/kloudrecon
```

## 5. Database roles and settings

Peer authentication: the Linux user `kloudrecon` may connect as two database roles, so no
database password exists anywhere.

```bash
cd /opt/kloudrecon/app/deploy/postgres
sudo -u postgres psql -f init.sql
# the peer rule must come first in pg_hba.conf
sudo sed -i '1i local   kloudrecon   kloudrecon_app,kloudrecon_owner   peer map=kloudrecon' /etc/postgresql/16/main/pg_hba.conf
cat pg_ident.snippet | grep -v '^#' | sudo tee -a /etc/postgresql/16/main/pg_ident.conf
sudo cp tuning.conf /etc/postgresql/16/main/conf.d/kloudrecon.conf
```

`tuning.conf` is sized for 8 GB of memory. Before restarting, set `shared_buffers` to about a
quarter of the server's memory and `effective_cache_size` to about three quarters
(`sudo nano /etc/postgresql/16/main/conf.d/kloudrecon.conf`; `free -g` shows the memory). On a
spinning hard disk also change `random_page_cost` to `4` and `effective_io_concurrency` to `2`;
keep the shipped values on SSD.

```bash
sudo systemctl restart postgresql@16-main
sudo -u kloudrecon psql "postgresql://kloudrecon_owner@/kloudrecon?host=/var/run/postgresql" -Atc "select current_user"   # kloudrecon_owner
sudo -u kloudrecon psql "postgresql://kloudrecon_app@/kloudrecon?host=/var/run/postgresql" -Atc "select current_user"     # kloudrecon_app
```

## 6. Environment file

```bash
sudo tee /etc/kloudrecon/kloudrecon.env >/dev/null <<EOF
ENV=prod
AUTH_MODE=local
LOG_LEVEL=INFO
LOG_FORMAT=json
DATABASE_URL=postgresql+psycopg://kloudrecon_app@/kloudrecon?host=/var/run/postgresql
DATABASE_MIGRATION_URL=postgresql+psycopg://kloudrecon_owner@/kloudrecon?host=/var/run/postgresql
PUBLIC_APP_URL=https://$DOMAIN
PUBLIC_API_URL=https://$DOMAIN
CORS_ALLOWED_ORIGINS=https://$DOMAIN
BOOTSTRAP_OWNER_EMAILS=$OWNER_EMAIL
SECRET_STORE=keyvault
KEY_VAULT_URL=https://<your-key-vault>.vault.azure.net/
BLOB_MODE=azure
STORAGE_ACCOUNT_URL=https://<your-storage-account>.blob.core.windows.net
EMAIL_MODE=acs
ACS_CONNECTION_STRING=<acs connection string>
EMAIL_SENDER=DoNotReply@<your verified sender domain>
EMAIL_SENDER_NAME=KloudRecon
AI_MODE=mock
REPORT_RENDERER=playwright
REPORT_LINK_MINUTES=15
WORKER_CONCURRENCY=2
RATE_LIMIT_DEFAULT=300/minute
RUN_SCHEDULER=true
DEMO_MODE=true
BILLING_PROVIDER=manual
PRICES_MODE=retail
PLAYWRIGHT_BROWSERS_PATH=/opt/kloudrecon/ms-playwright
PYTHONDONTWRITEBYTECODE=1
# Only when the server is NOT an Azure VM with a managed identity (see section 0):
# AZURE_TENANT_ID=<tenant id>
# AZURE_CLIENT_ID=<client id of the "KloudRecon server" app registration>
# AZURE_CLIENT_SECRET=<its client secret>
# Optional sign-in buttons (redirect URI: https://$DOMAIN/api/v1/auth/sso/<google|microsoft>/callback):
# GOOGLE_CLIENT_ID=
# GOOGLE_CLIENT_SECRET=
# MICROSOFT_CLIENT_ID=
# MICROSOFT_CLIENT_SECRET=
EOF
sudo nano /etc/kloudrecon/kloudrecon.env          # replace every <...> value
sudo chown root:kloudrecon /etc/kloudrecon/kloudrecon.env
sudo chmod 640 /etc/kloudrecon/kloudrecon.env
```

Notes:

- The app and the API share one domain, so `PUBLIC_APP_URL` and `PUBLIC_API_URL` are the same.
- `AI_MODE=mock` gives template answers. For Azure OpenAI set `AI_MODE=azure`, `AOAI_ENDPOINT`,
  `AOAI_DEPLOYMENT_MAIN`, `AOAI_DEPLOYMENT_MINI`, `AOAI_API_VERSION`, and give the server identity
  the "Cognitive Services OpenAI User" role.
- If you use "Continue with Microsoft" or Google, add the redirect URI shown in the file to the
  app registration / OAuth client. The one registered for `localhost` does not work here.
- The sender address must belong to a domain verified in Azure Communication Services.

## 7. Backend: virtual environment, Chromium, database schema

```bash
cd /opt/kloudrecon/app/backend
sudo -u kloudrecon python3.12 -m venv .venv
sudo -u kloudrecon .venv/bin/pip install --upgrade pip
sudo -u kloudrecon .venv/bin/pip install .
# Chromium for PDF and Word reports: system libraries as root, the browser as the service user
sudo .venv/bin/playwright install-deps chromium
sudo install -d -o kloudrecon -g kloudrecon -m 0750 /opt/kloudrecon/ms-playwright
sudo -u kloudrecon env PLAYWRIGHT_BROWSERS_PATH=/opt/kloudrecon/ms-playwright HOME=/opt/kloudrecon .venv/bin/playwright install chromium
```

`pip install .` (not `-e`, no `[dev]`) installs the application into the virtual environment.
The systemd units run with `WorkingDirectory=/opt/kloudrecon/current/backend`, and Alembic reads
`alembic.ini` from there.

Create the schema, the plans and the owner. `KRENV` is the prefix for every command-line task:

```bash
KRENV="sudo -u kloudrecon env KLOUDRECON_ENV_FILE=/etc/kloudrecon/kloudrecon.env HOME=/opt/kloudrecon"
$KRENV .venv/bin/alembic upgrade head
$KRENV .venv/bin/python -m kloudrecon.cli seed-plans
$KRENV .venv/bin/python -m kloudrecon.cli create-owner "$OWNER_EMAIL"
$KRENV .venv/bin/python -m kloudrecon.cli set-owner-password "$OWNER_EMAIL"    # asks twice, shows nothing
$KRENV .venv/bin/python -m kloudrecon.cli --help                               # lists the other tasks
```

If any of these fails with a Key Vault or Storage error, the server identity or its roles are
wrong (section 0). Fix that before going on.

Do **not** run `seed-dev` on this server: it creates test accounts.

## 8. Web app: build and publish

The web app is built once on the server and copied to the folder nginx serves.

```bash
cd /opt/kloudrecon/app/apps/web
sudo -u kloudrecon tee .env.production >/dev/null <<'EOF'
VITE_API_BASE_URL=
VITE_AUTH_MODE=local
VITE_APPINSIGHTS_CONNECTION_STRING=
EOF
sudo -u kloudrecon env HOME=/opt/kloudrecon npm ci
# the build prerenders the public pages with a headless browser (its system libraries came in step 7)
sudo -u kloudrecon env HOME=/opt/kloudrecon npx playwright install chromium
sudo -u kloudrecon env HOME=/opt/kloudrecon npm run build      # must end with "verified ... hydrates cleanly"
sudo rsync -a --delete dist/ /var/www/kloudrecon/
sudo rm -f /var/www/kloudrecon/staticwebapp.config.json      # Azure Static Web Apps file, not used here
sudo chown -R root:root /var/www/kloudrecon && sudo chmod -R a+rX /var/www/kloudrecon
ls /var/www/kloudrecon      # app.html index.html assets azure-icons fonts pricing security ...
```

`VITE_API_BASE_URL` is empty on purpose: the browser calls `/api` on the same domain.

If the server has less than 2 GB of memory and the build is killed, build on your PC
(`npm run build` with the same `.env.production`) and copy `dist/` to `/var/www/kloudrecon/`
instead.

## 9. nginx

Write the site. This first version is HTTP only; certbot adds the certificate in step 10.

```bash
sudo tee /etc/nginx/sites-available/kloudrecon >/dev/null <<EOF
# KloudRecon: static web app + reverse proxy to the API on 127.0.0.1:8000
upstream kloudrecon_api {
    server 127.0.0.1:8000;
    keepalive 16;
}

server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN www.$DOMAIN;

    root /var/www/kloudrecon;
    index index.html;
    client_max_body_size 10m;
    server_tokens off;

    gzip on;
    gzip_comp_level 5;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml font/woff2;

    # security headers (the same set the app was designed with; connect-src is same-origin here)
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
    add_header X-Frame-Options "DENY" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'" always;

    # API, including Server-Sent Events (live scan progress, chat): never buffer
    location /api/ {
        proxy_pass http://kloudrecon_api;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host \$host;
        # the app trusts the first address from the local proxy: send the real client only
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 3600s;
        proxy_send_timeout 300s;
    }

    # hashed build files never change
    location /assets/ {
        add_header Cache-Control "public, max-age=31536000, immutable" always;
        add_header X-Content-Type-Options "nosniff" always;
        try_files \$uri =404;
    }
    location ~* ^/(azure-icons|fonts)/ {
        add_header Cache-Control "public, max-age=604800" always;
        add_header X-Content-Type-Options "nosniff" always;
        try_files \$uri =404;
    }

    # pages: prerendered public pages (/, /pricing, /security), everything else is the app shell
    location / {
        add_header Cache-Control "no-cache" always;
        add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
        add_header X-Content-Type-Options "nosniff" always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;
        add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
        add_header X-Frame-Options "DENY" always;
        add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'" always;
        try_files \$uri \$uri/index.html /app.html;
    }
}
EOF
sudo ln -sfn /etc/nginx/sites-available/kloudrecon /etc/nginx/sites-enabled/kloudrecon
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

Why the headers are repeated inside `location /`: nginx drops the server-level `add_header` lines
in any block that has its own `add_header`.

If you later turn on Application Insights in the browser, add its hosts to `connect-src`
(`https://*.applicationinsights.azure.com https://js.monitor.azure.com`).

## 10. HTTPS with certbot

The A record must already point to this server (`dig +short $DOMAIN` must print its IP).

```bash
sudo certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN" --agree-tos -m "$LE_EMAIL" --redirect --no-eff-email
sudo nginx -t && sudo systemctl reload nginx
systemctl list-timers certbot.timer --no-pager      # automatic renewal
sudo certbot renew --dry-run
```

certbot edits the site file: it adds the `listen 443 ssl` lines and a redirect from HTTP to
HTTPS. Without a `www` record, leave out `-d "www.$DOMAIN"` here and remove `www.$DOMAIN` from
`server_name` in step 9.

## 11. systemd services

```bash
cd /opt/kloudrecon/app/deploy/systemd
sudo cp kloudrecon-api.service kloudrecon-worker.service kloudrecon-backup.service kloudrecon-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now kloudrecon-api kloudrecon-worker kloudrecon-backup.timer
systemctl --no-pager status kloudrecon-api kloudrecon-worker | grep -E 'Loaded|Active'
```

The API unit starts 3 gunicorn workers. On a server with 2 CPU cores or fewer change `-w 3` to
`-w 2` in `/etc/systemd/system/kloudrecon-api.service`, then `sudo systemctl daemon-reload &&
sudo systemctl restart kloudrecon-api`.

Do not install `deploy/caddy/Caddyfile`, `deploy/sudoers/kloudrecon-deploy` or
`deploy/bin/kloudrecon-activate`: they belong to the Caddy and GitHub-runner setup this plan does
not use.

## 12. Check that it works

```bash
curl -fsS http://127.0.0.1:8000/api/v1/health/ready && echo           # API and database
curl -fsS https://$DOMAIN/api/v1/health && echo                       # through nginx and HTTPS
curl -sI https://$DOMAIN/ | grep -iE 'HTTP/|strict-transport|content-security'
curl -s -o /dev/null -w '%{http_code}\n' https://$DOMAIN/app/security/findings   # 200 (the app shell)
journalctl -u kloudrecon-worker -n 20 --no-pager | grep -c worker_heartbeat      # at least 1 after a minute
sudo systemctl start kloudrecon-backup && journalctl -u kloudrecon-backup -n 5 --no-pager   # first backup to Blob
```

Then in a browser:

1. Open `https://DOMAIN`. The landing page loads with the padlock.
2. Sign in at `/login` → **Control Center** with the owner email, the password from step 7 and
   the code that arrives by email. If no email arrives, the ACS settings or the sender domain are
   wrong (`journalctl -u kloudrecon-api -n 50`).
3. Create a test customer account, approve it in the Control Center, connect an Azure tenant and
   run a scan. This proves Key Vault (the secret is stored), Blob (the snapshot is written) and
   the worker.
4. Generate one PDF report and one Word report. This proves Chromium works on the server.

## 13. Updating to a new version

Copy the new code the same way as in step 1, then:

```bash
export DOMAIN=kloudreco.com
sudo tar -xzf /tmp/kloudrecon.tar.gz -C /tmp
sudo rsync -a --delete --exclude 'backend/.venv' --exclude 'apps/web/node_modules' \
     --exclude 'apps/web/.env.production' /tmp/KloudRecon/ /opt/kloudrecon/app/
sudo find /opt/kloudrecon/app -type f \( -name '*.sh' -o -name '*.service' -o -name '*.timer' -o -name '*.conf' -o -name '*.sql' \) -exec dos2unix -q {} +
sudo chown -R kloudrecon:kloudrecon /opt/kloudrecon/app
cd /opt/kloudrecon/app/backend
KRENV="sudo -u kloudrecon env KLOUDRECON_ENV_FILE=/etc/kloudrecon/kloudrecon.env HOME=/opt/kloudrecon"
sudo -u kloudrecon .venv/bin/pip install .
$KRENV .venv/bin/alembic upgrade head               # database changes first
cd ../apps/web
sudo -u kloudrecon env HOME=/opt/kloudrecon npm ci
sudo -u kloudrecon env HOME=/opt/kloudrecon npx playwright install chromium
sudo -u kloudrecon env HOME=/opt/kloudrecon npm run build
sudo rsync -a --delete dist/ /var/www/kloudrecon/ && sudo rm -f /var/www/kloudrecon/staticwebapp.config.json
sudo systemctl restart kloudrecon-api kloudrecon-worker
curl -fsS https://$DOMAIN/api/v1/health/ready && echo
```

If a unit file in `deploy/systemd/` changed, copy it again (step 11) and run
`sudo systemctl daemon-reload` before the restart. Restarting the worker stops a scan that is
running; it is picked up again, but update when no scan is in progress if you can.

Rolling back: keep the previous `kloudrecon.tar.gz`. Restore the code from it and repeat the
steps above, **without** `alembic upgrade head` (migrations only go forward; they are written to
be compatible with the previous version).

## 14. Day-to-day operations

| Task | Command |
|---|---|
| Status of everything | `systemctl --no-pager status nginx kloudrecon-api kloudrecon-worker postgresql@16-main` |
| API log | `journalctl -u kloudrecon-api -f` |
| Worker log | `journalctl -u kloudrecon-worker -f` |
| nginx errors | `sudo tail -f /var/log/nginx/error.log` |
| Restart the app | `sudo systemctl restart kloudrecon-api kloudrecon-worker` |
| Backup now | `sudo systemctl start kloudrecon-backup` |
| Backup history | `journalctl -u kloudrecon-backup -n 30 --no-pager` |
| Change the owner password | `$KRENV .venv/bin/python -m kloudrecon.cli set-owner-password "$OWNER_EMAIL"` (in `backend/`) |
| Disk space | `df -h / /data` |
| Database size | `sudo -u postgres psql -Atc "select pg_size_pretty(pg_database_size('kloudrecon'))"` |

Backups: the timer runs `pg_dump` every night at 02:30 UTC, uploads it to the `db-backups`
container and removes dumps older than 30 days. Restoring is described in
`docs/runbooks/restore.md`. The backup lives in Azure, so losing the server or its disk does not
lose the data. Test one restore before you rely on it.

Security updates of the server itself: `sudo dpkg-reconfigure -plow unattended-upgrades` and
answer Yes.

## 15. If something does not work

| Symptom | Likely cause and check |
|---|---|
| `kloudrecon-api` does not start: "SECRET_STORE must be 'keyvault' when ENV=prod" | The environment file still has a local setting. See section 0. |
| API starts, connecting an Azure tenant fails with a Key Vault error | The server identity lacks "Key Vault Secrets Officer", or the vault uses access policies instead of Azure RBAC, or the `AZURE_*` values are wrong. |
| Scans fail at the inventory stage with a Blob error | Missing "Storage Blob Data Contributor" on the storage account, or its firewall blocks the server's IP. |
| 502 Bad Gateway | The API is down: `journalctl -u kloudrecon-api -n 50 --no-pager`. |
| The page loads but sign-in says it cannot reach the server | `PUBLIC_API_URL` or `CORS_ALLOWED_ORIGINS` does not match the address in the browser (for example `www`). |
| No sign-in email | `ACS_CONNECTION_STRING` or `EMAIL_SENDER`; the sender domain must be verified in ACS. |
| Live scan progress does not move until the end | `proxy_buffering off` is missing in the `/api/` block. |
| Reports stay "Generating" or fail | Chromium: repeat the two `playwright` commands in step 7; check `journalctl -u kloudrecon-worker`. |
| `peer authentication failed` | The `pg_hba.conf` line is not first, or `pg_ident.conf` lacks the two map lines; restart PostgreSQL. |
| PostgreSQL does not start after a reboot | The disk is not mounted: `df -h /data`, `sudo mount -a`, check `/etc/fstab`. |
| A shell script fails with `$'\r': command not found` | Windows line endings: run the `dos2unix` line from step 4. |
| certbot fails | The A record does not point here yet, or port 80 is closed: `dig +short $DOMAIN`, `sudo ufw status`. |

---

## Appendix A: Ubuntu 22.04

Python 3.12 and PostgreSQL 16 are not in the standard 22.04 packages. Before step 2:

```bash
sudo add-apt-repository -y ppa:deadsnakes/ppa
sudo install -d /usr/share/postgresql-common/pgdg
sudo curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc
echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" | sudo tee /etc/apt/sources.list.d/pgdg.list
sudo apt update
```

Then continue with step 2. Everything else is the same.

## Appendix B: what was not tested

This plan was written from the code and the existing `deploy/` files. It has not been run on a
server yet. The points most likely to need a small adjustment on the real machine:

- the nginx site after certbot edits it (re-run `sudo nginx -t`);
- the prerender step of `npm run build` on a small server (see step 8);
- the Azure identity and roles (section 0), which cannot be checked from here;
- the PostgreSQL tuning values for this server's memory and disk type (step 5).
