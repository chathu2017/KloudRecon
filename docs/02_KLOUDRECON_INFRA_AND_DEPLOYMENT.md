# KloudRecon for Azure — Infrastructure, DNS, Deployment & Local Development Guide

> Companion to `01_KLOUDRECON_PRODUCT_PLAN.md`.
> **Everything in Azure is created manually by you** in the Azure Portal. GitHub Actions only deploys code.
> Portal menus and prices change. If a label differs, look for the nearby equivalent, and verify prices in the Azure Pricing Calculator.

**For Claude Code:** do not create IaC. Generate the `deploy/` files and workflows exactly as described in Part D, and the local development setup in Part F.

---

## 0. Overview

| Component | Where it runs |
|---|---|
| Web app (React) | **Azure Static Web Apps** → `https://app.azurerec.kloudschool.com` |
| API + worker (Python) + PostgreSQL 16 | **One Ubuntu 24.04 VM**, systemd services, Caddy HTTPS → `https://api.azurerec.kloudschool.com` |
| Customer secrets | Azure Key Vault |
| Files, reports, DB backups | Azure Blob Storage |
| Email | Azure Communication Services → `donotreply@azurerec.kloudschool.com` |
| AI | Azure OpenAI |
| Login | Microsoft Entra External ID |
| Monitoring | Application Insights (+ VM metrics) |
| VM backup | Azure Backup (Recovery Services vault) |
| CI/CD | GitHub Actions: tests on GitHub runners; backend deploy by a **self-hosted runner on the VM**; web deploy to Static Web Apps |

```
VS Code ──push──► GitHub ──CI (tests)──► Deploy workflow
                                   ├─ backend: self-hosted runner on VM → new release → migrate → switch → restart → health check (auto rollback)
                                   └─ web: build React → Static Web Apps
```

### Why the web app is on `app.azurerec.kloudschool.com` and not `azurerec.kloudschool.com`
Email requires TXT (SPF/verification) records on `azurerec.kloudschool.com`. DNS doesn't allow a CNAME on a name that also has other records. So the website uses `app.`, the API uses `api.`, and email uses the bare `azurerec.kloudschool.com`.

### Monthly cost (approximate, verify in the calculator)
| Item | Choice | ≈ USD/month |
|---|---|---|
| VM | **Standard_B2ms** (2 vCPU, 8 GB) — upgrade to D2as_v5/D4as_v5 when busy | 60–70 |
| OS disk | Premium SSD 64 GB (P6) | ~10 |
| Data disk (PostgreSQL) | Premium SSD 128 GB (P10) | ~20 |
| Public IP | Standard, static | ~4 |
| Azure Backup | Daily, 14-day retention | ~10–15 |
| Static Web Apps | **Standard** (SLA) — Free also works | 9 (or 0) |
| Storage (Blob) | Standard LRS/ZRS | ~2–10 |
| Key Vault | Standard | ~1 |
| Log Analytics + App Insights | small volume, 30-day retention | ~5–15 |
| Communication Services Email | per email | ~1 |
| Azure OpenAI | per token | usage |
| **Total** | | **≈ $120–160 + AI** |

**Uptime:** a single VM with Premium SSD on all disks has a 99.9% Azure SLA. That covers Azure's infrastructure. Keeping the OS, PostgreSQL and backups healthy is your job, and this guide automates most of it.

---

## 1. Naming

| Resource | Name |
|---|---|
| Resource group | `rg-kloudrecon-prod` |
| Virtual network / subnet | `vnet-kloudrecon-prod` (10.40.0.0/16) / `snet-vm` (10.40.1.0/24) |
| Network security group | `nsg-kloudrecon-vm` |
| VM | `vm-kloudrecon-prod` |
| Public IP | `pip-kloudrecon-vm` |
| Data disk | `disk-kloudrecon-pgdata` |
| Key Vault | `kv-kloudrecon-prod` (globally unique — add a suffix if taken) |
| Storage account | `stkloudreconprod` (globally unique) |
| Communication Services / Email service | `acs-kloudrecon-prod` / `ecs-kloudrecon-prod` |
| Azure OpenAI | `aoai-kloudrecon-prod` |
| Static Web App | `swa-kloudrecon-prod` |
| Log Analytics / App Insights | `log-kloudrecon-prod` / `appi-kloudrecon-prod` |
| Recovery Services vault | `rsv-kloudrecon-prod` |
| External ID tenant | `kloudreconid` (domain `kloudreconid.onmicrosoft.com`, login `kloudreconid.ciamlogin.com`) |

Tags on everything: `app=kloudrecon`, `env=prod`, `owner=kloudschool`.

**Region:** one region close to your customers where Azure OpenAI models are available. Keep all resources there.

Keep a private notepad (not in Git) for values marked 📝.

---

# PART A — Azure resources (manual, in this order)

## A1. Resource group
Portal → **Resource groups → Create** → `rg-kloudrecon-prod`, region, tags.

Check **Subscription → Resource providers**. These must be Registered: `Microsoft.Compute`, `Microsoft.Network`, `Microsoft.Storage`, `Microsoft.KeyVault`, `Microsoft.Web`, `Microsoft.CognitiveServices`, `Microsoft.Communication`, `Microsoft.OperationalInsights`, `Microsoft.Insights`, `Microsoft.RecoveryServices`.

## A2. Log Analytics + Application Insights
1. **Log Analytics workspaces → Create** → `log-kloudrecon-prod`. After creation: retention 30 days.
2. **Application Insights → Create** → `appi-kloudrecon-prod`, workspace-based → `log-kloudrecon-prod`.
3. 📝 **Connection string**.

## A3. Virtual network + NSG
1. **Virtual networks → Create** → `vnet-kloudrecon-prod`, address space `10.40.0.0/16`.
   - Subnet `snet-vm` = `10.40.1.0/24`
   - **Service endpoints on `snet-vm`:** `Microsoft.KeyVault`, `Microsoft.Storage`
2. **Network security groups → Create** → `nsg-kloudrecon-vm`. **Inbound rules:**

| Priority | Name | Source | Port | Action |
|---|---|---|---|---|
| 100 | Allow-HTTPS | Any (Internet) | 443 TCP | Allow |
| 110 | Allow-HTTP-ACME | Any (Internet) | 80 TCP | Allow (Let's Encrypt + redirect) |
| 120 | Allow-SSH-MyIP | **Your public IP only** | 22 TCP | Allow |
| (default) | DenyAllInbound | | | Deny |

   Associate the NSG with `snet-vm` (NSG → Subnets → Associate).
   If your home IP changes, update rule 120. (Optional, more secure: Azure Bastion instead of an SSH rule.)

## A4. Virtual machine
**Virtual machines → Create**:
- Name `vm-kloudrecon-prod`, region, **Availability options: No infrastructure redundancy required** (or a zone if you like)
- Image **Ubuntu Server 24.04 LTS – x64 Gen2**
- Size **Standard_B2ms** (you can resize later)
- Authentication: **SSH public key**, username `azureuser`, generate a new key pair → **download the .pem and keep it safe** 📝
- Public inbound ports: **None** (the NSG from A3 controls access)
- **Disks:**
  - OS disk **Premium SSD**, 64 GB, delete with VM = off
  - **Create and attach a new data disk:** `disk-kloudrecon-pgdata`, **Premium SSD 128 GB**, host caching **Read-only**
- **Networking:** VNet `vnet-kloudrecon-prod`, subnet `snet-vm`, **public IP: create new** `pip-kloudrecon-vm` (Standard, **Static**), NIC NSG: **None** (the subnet NSG applies)
- **Management:**
  - **System-assigned managed identity: On**
  - Boot diagnostics: managed storage
  - Auto-shutdown: **Off**
  - **Backup: Enable** → create vault `rsv-kloudrecon-prod`, policy **daily**, retention **14 days** (Enhanced policy if offered)
- **Monitoring:** enable recommended alerts if offered (CPU, available memory, disk).

After creation 📝 **Public IP address** and the VM's **managed identity Object (principal) ID** (VM → Security → Identity).

## A5. Key Vault
**Key vaults → Create** → `kv-kloudrecon-prod`:
- Standard tier, **soft delete 90 days, purge protection ON**
- **Permission model: Azure role-based access control**
- **Networking:** *Allow public access from specific virtual networks and IP addresses* → add `vnet-kloudrecon-prod/snet-vm`, tick **Allow trusted Microsoft services**; add **your IP** if you want to view secrets in the portal.

📝 Vault URI.

## A6. Storage account (Blob)
**Storage accounts → Create** → `stkloudreconprod`:
- Standard, redundancy **ZRS** (or LRS to save cost)
- **Advanced:** secure transfer ON; **allow anonymous blob access OFF**; **storage account key access OFF**; minimum TLS 1.2
- **Networking:** *Enabled from selected virtual networks and IP addresses* → add `snet-vm`; add your IP if you want to browse in the portal
- **Data protection:** blob soft delete 14 days, container soft delete 14 days, versioning ON

After creation → **Containers** (all private): `snapshots`, `reports`, `exports`, `diagrams`, `branding`, `db-backups`.

**Lifecycle management rules:**
- `db-backups/` → delete after **30 days**
- `snapshots/` → delete after **120 days**
- `reports/` → move to Cool after 30 days

📝 Blob endpoint `https://stkloudreconprod.blob.core.windows.net`.

## A7. Azure OpenAI
1. Create an **Azure OpenAI** resource (in the portal it may be listed under Azure AI Foundry / Azure AI services) → `aoai-kloudrecon-prod`.
2. Disable **local (key) authentication** if the option exists.
   CLI alternative: `az resource update --ids <id> --set properties.disableLocalAuth=true`.
3. **AI Foundry portal → Deployments → Deploy model:**
   - a strong current GPT model → deployment name **`gpt-main`**
   - a mini/fast model → **`gpt-mini`**
   - Deployment type: Global Standard (or Standard for regional data processing). Set tokens-per-minute limits.
4. 📝 Endpoint, deployment names, and the latest GA API version.
5. For local development: give **yourself** the role **Cognitive Services OpenAI User** on this resource (IAM), so `az login` works from your PC.

## A8. Email — Azure Communication Services (`donotreply@azurerec.kloudschool.com`)
1. **Email Communication Services → Create** → `ecs-kloudrecon-prod`, data location near you.
2. `ecs-kloudrecon-prod` → **Provision domains → Add a custom domain** → `azurerec.kloudschool.com`.
3. The portal shows DNS records. Add them at your DNS provider (see **Part B**): domain verification **TXT**, **SPF TXT**, **DKIM CNAME** (selector1), **DKIM2 CNAME** (selector2). Click **Verify** for each until all are *Verified*.
4. **Communication Services → Create** → `acs-kloudrecon-prod` (same data location).
5. `acs-kloudrecon-prod` → **Email → Domains → Connect domain** → select `azurerec.kloudschool.com`.
6. Custom domain → **MailFrom addresses** → add `donotreply` (display name **KloudRecon**).
7. 📝 ACS endpoint (e.g., `https://acs-kloudrecon-prod.<region>.communication.azure.com`).

## A9. Static Web App
**Static Web Apps → Create** → `swa-kloudrecon-prod`, plan **Standard** (or Free), **Deployment source: Other**.
After creation:
- 📝 default hostname (e.g., `happy-sky-01234.azurestaticapps.net`)
- **Manage deployment token** → 📝 copy it (goes into GitHub secret `SWA_DEPLOYMENT_TOKEN`)
- **Custom domains → Add → Custom domain on other DNS** → `app.azurerec.kloudschool.com` → add the CNAME shown (Part B) → Validate. SSL is automatic.

## A10. Role assignments for the VM's managed identity
For each row: open the resource → **Access control (IAM) → Add role assignment** → role → **Managed identity → Virtual machine → `vm-kloudrecon-prod`**.

| Resource | Role |
|---|---|
| `kv-kloudrecon-prod` | **Key Vault Secrets Officer** (the API writes/replaces/deletes customer secrets) |
| `stkloudreconprod` | **Storage Blob Data Contributor** |
| `aoai-kloudrecon-prod` | **Cognitive Services OpenAI User** |
| `acs-kloudrecon-prod` | **Contributor** (or the narrower email-send role, if the portal lists one) |

Also give **yourself**: *Key Vault Administrator* (kv) and *Storage Blob Data Reader* (storage) for troubleshooting.

## A11. Microsoft Entra External ID (customer login)
1. **Microsoft Entra admin center → Manage tenants → Create → External** → name "KloudRecon Identity", domain `kloudreconid`. Link it to your subscription.
2. Switch into the new tenant.
3. **App registrations → New** `kloudrecon-api`:
   - Expose an API → Application ID URI `api://kloudrecon-api` → scope `access_as_user`.
   - Manifest: access token version **2**.
   - 📝 Client ID.
4. **App registrations → New** `kloudrecon-web`:
   - Authentication → **Single-page application** → redirect URIs `https://app.azurerec.kloudschool.com` and `http://localhost:5173`.
   - API permissions → My APIs → `kloudrecon-api` → `access_as_user` → **Grant admin consent**.
   - 📝 Client ID.
5. **External Identities → User flows → New** "Sign up and sign in": Email with password (or email OTP), collect Display Name → Applications → add `kloudrecon-web`.
6. Optional: add **Google** and **Microsoft account** identity providers and enable them in the user flow.
7. **Company branding:** KloudRecon logo, colors (#1F5EFF), background.
8. **MFA:** Conditional Access policy requiring MFA (at least for your owner account).
9. 📝 Tenant ID, subdomain `kloudreconid`.

## A12. Budget & alerts
- **Cost Management → Budgets:** scope `rg-kloudrecon-prod`, e.g. $200/month, alerts at 50/80/100% actual and 100% forecast → your email.
- **Monitor → Alerts → Action group** `ag-kloudrecon` (your email/SMS).
- **Alert rules:**

| Alert | Signal | Condition |
|---|---|---|
| API down | App Insights **availability test** (standard) on `https://api.azurerec.kloudschool.com/api/v1/health`, 3 locations, 5 min | fails from 2+ locations |
| VM CPU high | VM metric Percentage CPU | > 85% for 15 min |
| VM memory low | VM metric Available Memory Bytes | < 800 MB for 15 min |
| Worker stopped | App Insights log search: no `worker_heartbeat` event in 10 min | count = 0 |
| Disk space | App Insights custom metric `disk_free_percent` (sent by worker heartbeat) | < 20% |
| Dead jobs | custom metric `jobs_dead` | > 0 |
| Backup failed | Recovery Services vault → Backup alerts | any |

- **Defender for Cloud:** enable at least free Foundational CSPM on your subscription and review recommendations.

---

# PART B — DNS (at the provider that hosts `kloudschool.com`)

Add these records in the DNS zone for **kloudschool.com**. Most providers want the name *relative* to the zone (e.g., `app.azurerec`).

| Purpose | Type | Name (host) | Value | When |
|---|---|---|---|---|
| Web app | **CNAME** | `app.azurerec` | `<your-swa>.azurestaticapps.net` | Step A9 |
| API | **A** | `api.azurerec` | VM public IP | Before VM setup C7 |
| Email domain verification | **TXT** | `azurerec` | `ms-domain-verification=...` (exact value from ACS) | Step A8 |
| Email SPF | **TXT** | `azurerec` | value from ACS (typically `v=spf1 include:spf.protection.outlook.com -all`) | Step A8 |
| Email DKIM 1 | **CNAME** | `selector1-azurecomm-prod-net._domainkey.azurerec` | value from ACS | Step A8 |
| Email DKIM 2 | **CNAME** | `selector2-azurecomm-prod-net._domainkey.azurerec` | value from ACS | Step A8 |
| Email DMARC (recommended) | **TXT** | `_dmarc.azurerec` | `v=DMARC1; p=quarantine; rua=mailto:<your-email>` | after SPF/DKIM verify |

Notes:
- **Never put a CNAME on `azurerec`** itself. It holds the email TXT records.
- If you use **Cloudflare**, set `app.azurerec` and `api.azurerec` to **DNS only (grey cloud)**. Proxying breaks SWA validation and Caddy's certificate issuance.
- If the zone has **CAA** records, allow `letsencrypt.org` (Caddy) and `digicert.com` (Static Web Apps).
- DNS changes can take from minutes up to a few hours. Check with `nslookup api.azurerec.kloudschool.com`.

---

# PART C — VM setup (one time, via SSH)

From your PC (PowerShell):
```powershell
ssh -i C:\path\to\vm-kloudrecon-prod_key.pem azureuser@<VM_PUBLIC_IP>
```
All commands below run on the VM.

## C1. Base system, updates, firewall
```bash
sudo timedatectl set-timezone UTC
sudo apt update && sudo apt -y upgrade
sudo apt -y install unattended-upgrades fail2ban ufw rsync curl git jq \
  python3.12 python3.12-venv python3-pip build-essential
sudo dpkg-reconfigure -plow unattended-upgrades        # choose "Yes" (automatic security updates)

sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
```
Harden SSH (key only):
```bash
sudo sed -i 's/^#\?PasswordAuthentication .*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo sed -i 's/^#\?PermitRootLogin .*/PermitRootLogin no/' /etc/ssh/sshd_config
sudo systemctl restart ssh
```

## C2. Data disk for PostgreSQL (mount BEFORE installing PostgreSQL)
```bash
lsblk        # find the 128G disk with no partitions (often sdc; on some sizes nvme0n2)
DISK=/dev/sdc   # <-- change if different
sudo parted $DISK --script mklabel gpt mkpart primary ext4 0% 100%
sleep 2
sudo mkfs.ext4 -L pgdata ${DISK}1
sudo mkdir -p /var/lib/postgresql
UUID=$(sudo blkid -s UUID -o value ${DISK}1)
echo "UUID=$UUID /var/lib/postgresql ext4 defaults,nofail,noatime 0 2" | sudo tee -a /etc/fstab
sudo mount -a && df -h /var/lib/postgresql
```

## C3. Users and folders
```bash
# service user (runs API + worker), no login
sudo adduser --system --group --home /opt/kloudrecon --shell /usr/sbin/nologin kloudrecon
# GitHub runner user
sudo adduser --disabled-password --gecos "" ghrunner
sudo usermod -aG kloudrecon ghrunner

sudo mkdir -p /opt/kloudrecon/releases /opt/kloudrecon/ms-playwright /etc/kloudrecon
sudo chown ghrunner:kloudrecon /opt/kloudrecon/releases && sudo chmod 2750 /opt/kloudrecon/releases
sudo chown kloudrecon:kloudrecon /opt/kloudrecon/ms-playwright
sudo chown root:kloudrecon /etc/kloudrecon && sudo chmod 750 /etc/kloudrecon
```

## C4. PostgreSQL 16 (systemd, local socket, no passwords)
```bash
sudo apt -y install postgresql postgresql-contrib     # Ubuntu 24.04 → PostgreSQL 16
sudo systemctl enable --now postgresql
psql --version
```
Tuning for 8 GB RAM:
```bash
sudo tee /etc/postgresql/16/main/conf.d/kloudrecon.conf >/dev/null <<'EOF'
listen_addresses = 'localhost'
max_connections = 100
shared_buffers = 2GB
effective_cache_size = 6GB
work_mem = 32MB
maintenance_work_mem = 512MB
wal_compression = on
random_page_cost = 1.1
effective_io_concurrency = 200
checkpoint_completion_target = 0.9
shared_preload_libraries = 'pg_stat_statements'
log_min_duration_statement = 1000
EOF
```
Peer authentication (the OS user `kloudrecon` maps to both DB roles):
```bash
# pg_ident: map OS user -> DB roles
echo "kloudrecon   kloudrecon   kloudrecon_app"   | sudo tee -a /etc/postgresql/16/main/pg_ident.conf
echo "kloudrecon   kloudrecon   kloudrecon_owner" | sudo tee -a /etc/postgresql/16/main/pg_ident.conf
# pg_hba: put our rule at the TOP so it matches first
sudo sed -i '1i local   kloudrecon   kloudrecon_app,kloudrecon_owner   peer map=kloudrecon' /etc/postgresql/16/main/pg_hba.conf
sudo systemctl restart postgresql
```
Roles and database (the same SQL is in `deploy/postgres/init.sql`):
```bash
sudo -u postgres psql <<'EOF'
CREATE ROLE kloudrecon_owner LOGIN BYPASSRLS;   -- migrations + backups
CREATE ROLE kloudrecon_app LOGIN;               -- application, subject to RLS
CREATE DATABASE kloudrecon OWNER kloudrecon_owner;
\c kloudrecon
ALTER SCHEMA public OWNER TO kloudrecon_owner;
GRANT USAGE ON SCHEMA public TO kloudrecon_app;
ALTER DEFAULT PRIVILEGES FOR ROLE kloudrecon_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO kloudrecon_app;
ALTER DEFAULT PRIVILEGES FOR ROLE kloudrecon_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO kloudrecon_app;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
EOF
# test peer login as the service user
sudo -u kloudrecon psql "host=/var/run/postgresql dbname=kloudrecon user=kloudrecon_app" -c "select current_user;"
```

## C5. Environment file (`/etc/kloudrecon/kloudrecon.env`)
```bash
sudo tee /etc/kloudrecon/kloudrecon.env >/dev/null <<'EOF'
ENV=prod
AUTH_MODE=entra
DATABASE_URL=postgresql+psycopg://kloudrecon_app@/kloudrecon?host=/var/run/postgresql
DATABASE_MIGRATION_URL=postgresql+psycopg://kloudrecon_owner@/kloudrecon?host=/var/run/postgresql
PUBLIC_APP_URL=https://app.azurerec.kloudschool.com
PUBLIC_API_URL=https://api.azurerec.kloudschool.com
CORS_ALLOWED_ORIGINS=https://app.azurerec.kloudschool.com
BOOTSTRAP_OWNER_EMAILS=<your-email>
ENTRA_TENANT_ID=<external-id-tenant-id>
ENTRA_TENANT_SUBDOMAIN=kloudreconid
ENTRA_API_CLIENT_ID=<kloudrecon-api client id>
ENTRA_API_AUDIENCE=api://kloudrecon-api
SECRET_STORE=keyvault
KEY_VAULT_URL=https://kv-kloudrecon-prod.vault.azure.net/
BLOB_MODE=azure
STORAGE_ACCOUNT_URL=https://stkloudreconprod.blob.core.windows.net
EMAIL_MODE=acs
ACS_ENDPOINT=<acs endpoint>
EMAIL_SENDER=donotreply@azurerec.kloudschool.com
AI_MODE=azure
AOAI_ENDPOINT=<aoai endpoint>
AOAI_DEPLOYMENT_MAIN=gpt-main
AOAI_DEPLOYMENT_MINI=gpt-mini
AOAI_API_VERSION=<latest GA>
APPLICATIONINSIGHTS_CONNECTION_STRING=<app insights connection string>
WORKER_CONCURRENCY=4
RUN_SCHEDULER=true
DEMO_MODE=true
BILLING_PROVIDER=manual
PLAYWRIGHT_BROWSERS_PATH=/opt/kloudrecon/ms-playwright
PYTHONDONTWRITEBYTECODE=1
EOF
sudo chown root:kloudrecon /etc/kloudrecon/kloudrecon.env
sudo chmod 640 /etc/kloudrecon/kloudrecon.env
```
No secrets are in this file. Azure access uses the VM managed identity, and the database uses peer auth.

## C6. Caddy (HTTPS reverse proxy)
```bash
sudo apt -y install debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt -y install caddy
```
The Caddyfile is installed in C8 from the repo (`deploy/caddy/Caddyfile`), after the first deployment. The DNS **A record `api.azurerec` must already point to the VM**, so Caddy can get the certificate.

## C7. GitHub self-hosted runner (deploys the backend)
**The repository must be private.**

1. GitHub → repo → **Settings → Actions → Runners → New self-hosted runner → Linux x64**. Keep the page open. It shows a download URL and a **token**.
2. On the VM:
```bash
sudo -iu ghrunner
mkdir actions-runner && cd actions-runner
# paste the "Download" commands from the GitHub page (curl ... tar xzf ...)
./config.sh --url https://github.com/<you>/kloudrecon --token <TOKEN> \
  --name vm-kloudrecon-prod --labels kloudrecon-prod --unattended
exit
cd /home/ghrunner/actions-runner
sudo ./svc.sh install ghrunner
sudo ./svc.sh start
```
3. The runner appears as **Idle** in GitHub.

## C8. First deployment completion (after the first successful Deploy workflow run)
The first run of the deploy workflow puts the code in `/opt/kloudrecon/releases/<sha>`, but it will stop at the activation step because these files aren't installed yet. Install them once, then re-run the workflow:
```bash
REL=$(ls -td /opt/kloudrecon/releases/*/ | head -1)
# activation script + sudoers
sudo install -o root -g root -m 755 $REL/deploy/bin/kloudrecon-activate /usr/local/bin/kloudrecon-activate
sudo install -o root -g root -m 440 $REL/deploy/sudoers/kloudrecon-deploy /etc/sudoers.d/kloudrecon-deploy
sudo visudo -c
# systemd units
sudo cp $REL/deploy/systemd/*.service $REL/deploy/systemd/*.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable kloudrecon-api kloudrecon-worker kloudrecon-backup.timer
# Playwright system libraries (once) + browser
sudo $REL/backend/.venv/bin/playwright install-deps chromium
sudo -u kloudrecon PLAYWRIGHT_BROWSERS_PATH=/opt/kloudrecon/ms-playwright $REL/backend/.venv/bin/playwright install chromium
# Caddy
sudo cp $REL/deploy/caddy/Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy
```
Then GitHub → Actions → **Deploy** → **Re-run all jobs**. Check:
```bash
systemctl status kloudrecon-api kloudrecon-worker --no-pager
curl -s https://api.azurerec.kloudschool.com/api/v1/health
journalctl -u kloudrecon-api -n 50 --no-pager
```
If the files in `deploy/` change later, repeat the matching `install`/`cp` commands. The activation script prints a warning when installed files differ from the release.

## C9. Create the owner account
Sign up at `https://app.azurerec.kloudschool.com` with the email listed in `BOOTSTRAP_OWNER_EMAILS`. You become the Platform Owner automatically, and `/owner` becomes available.

---

# PART D — GitHub repository & workflows

## D1. Repository
1. Create a **private** repo `kloudrecon`, and push from VS Code (Source Control → Publish Branch).
2. **Settings → Branches:** protect `main` (require the CI status check, block force pushes).
3. **Settings → Code security:** Dependabot alerts + security updates, secret scanning + push protection, CodeQL default setup.
4. **Settings → Environments → New** `prod` → **Required reviewers: you**. (Every deployment waits for your click.)
5. **Settings → Secrets and variables → Actions:**

| Kind | Name | Value |
|---|---|---|
| Secret | `SWA_DEPLOYMENT_TOKEN` | from A9 |
| Variable | `VITE_API_BASE_URL` | `https://api.azurerec.kloudschool.com` |
| Variable | `VITE_AUTH_MODE` | `entra` |
| Variable | `VITE_ENTRA_SPA_CLIENT_ID` | `kloudrecon-web` client ID |
| Variable | `VITE_ENTRA_TENANT_SUBDOMAIN` | `kloudreconid` |
| Variable | `VITE_ENTRA_API_SCOPE` | `api://kloudrecon-api/access_as_user` |
| Variable | `VITE_APPINSIGHTS_CONNECTION_STRING` | App Insights connection string |

No Azure credentials are stored in GitHub. The backend deploys from the VM itself, and the web app uses the SWA token.

## D2. Workflows (Claude Code generates these)

### `.github/workflows/ci.yml`
```yaml
name: CI
on:
  pull_request:
  push:
    branches: [main]
permissions:
  contents: read
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
jobs:
  backend:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_USER: kloudrecon
          POSTGRES_PASSWORD: kloudrecon
          POSTGRES_DB: kloudrecon_test
        ports: ["5432:5432"]
        options: >-
          --health-cmd "pg_isready -U kloudrecon" --health-interval 5s --health-timeout 5s --health-retries 10
    defaults:
      run:
        working-directory: backend
    env:
      ENV: test
      AUTH_MODE: dev
      AI_MODE: mock
      TEST_DATABASE_URL: postgresql+psycopg://kloudrecon:kloudrecon@localhost:5432/kloudrecon_test
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
          cache: pip
      - run: pip install -e ".[dev]"
      - run: ruff check . && ruff format --check .
      - run: mypy src
      - run: pip-audit
      - run: pytest -q --cov=src --cov-report=term-missing
  frontend:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: apps/web
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: npm
          cache-dependency-path: apps/web/package-lock.json
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run test -- --run
      - run: npm run build
```

### `.github/workflows/deploy.yml`
Runs only after CI succeeds on `main` (or manually), and waits for your approval.
```yaml
name: Deploy
on:
  workflow_run:
    workflows: ["CI"]
    types: [completed]
    branches: [main]
  workflow_dispatch:
concurrency:
  group: deploy-prod
  cancel-in-progress: false
permissions:
  contents: read
jobs:
  backend:
    if: github.event_name == 'workflow_dispatch' || github.event.workflow_run.conclusion == 'success'
    runs-on: [self-hosted, linux, kloudrecon-prod]
    environment: prod
    outputs:
      sha: ${{ steps.meta.outputs.sha }}
    steps:
      - id: meta
        run: echo "sha=${{ github.event.workflow_run.head_sha || github.sha }}" >> "$GITHUB_OUTPUT"
      - uses: actions/checkout@v4
        with:
          ref: ${{ steps.meta.outputs.sha }}
      - name: Build release
        run: |
          set -euo pipefail
          umask 027
          SHA=${{ steps.meta.outputs.sha }}
          REL=/opt/kloudrecon/releases/$SHA
          if [ ! -f "$REL/.built" ]; then
            rm -rf "$REL"; mkdir -p "$REL"
            rsync -a --exclude '.git' --exclude 'apps' --exclude 'node_modules' ./ "$REL/"
            python3.12 -m venv "$REL/backend/.venv"
            "$REL/backend/.venv/bin/pip" install --upgrade pip wheel
            "$REL/backend/.venv/bin/pip" install "$REL/backend"
            touch "$REL/.built"
          fi
      - name: Activate (migrate, switch, restart, health check, auto-rollback)
        run: sudo /usr/local/bin/kloudrecon-activate ${{ steps.meta.outputs.sha }}

  web:
    needs: backend
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ needs.backend.outputs.sha }}
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: npm
          cache-dependency-path: apps/web/package-lock.json
      - name: Build
        working-directory: apps/web
        env:
          VITE_API_BASE_URL: ${{ vars.VITE_API_BASE_URL }}
          VITE_AUTH_MODE: ${{ vars.VITE_AUTH_MODE }}
          VITE_ENTRA_SPA_CLIENT_ID: ${{ vars.VITE_ENTRA_SPA_CLIENT_ID }}
          VITE_ENTRA_TENANT_SUBDOMAIN: ${{ vars.VITE_ENTRA_TENANT_SUBDOMAIN }}
          VITE_ENTRA_API_SCOPE: ${{ vars.VITE_ENTRA_API_SCOPE }}
          VITE_APPINSIGHTS_CONNECTION_STRING: ${{ vars.VITE_APPINSIGHTS_CONNECTION_STRING }}
        run: |
          npm ci
          npm run build
      - uses: Azure/static-web-apps-deploy@v1
        with:
          azure_static_web_apps_api_token: ${{ secrets.SWA_DEPLOYMENT_TOKEN }}
          action: upload
          app_location: apps/web/dist
          skip_app_build: true
          skip_api_build: true
```

### `apps/web/public/staticwebapp.config.json`
```json
{
  "navigationFallback": {
    "rewrite": "/index.html",
    "exclude": ["/assets/*", "/azure-icons/*", "/*.{png,jpg,svg,ico,webp,woff2,txt,json}"]
  },
  "routes": [
    { "route": "/index.html", "headers": { "Cache-Control": "no-cache" } },
    { "route": "/assets/*", "headers": { "Cache-Control": "public, max-age=31536000, immutable" } }
  ],
  "globalHeaders": {
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "X-Frame-Options": "DENY",
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://api.azurerec.kloudschool.com https://*.ciamlogin.com https://login.microsoftonline.com https://*.applicationinsights.azure.com https://*.in.applicationinsights.azure.com https://js.monitor.azure.com; frame-src https://*.ciamlogin.com; frame-ancestors 'none'"
  }
}
```

## D3. Server files Claude Code must generate in `deploy/`
- **`systemd/kloudrecon-api.service`, `kloudrecon-worker.service`, `kloudrecon-backup.service`, `kloudrecon-backup.timer`** — as described in product plan Section 19. `EnvironmentFile=/etc/kloudrecon/kloudrecon.env`, `User=kloudrecon`, working dir under `/opt/kloudrecon/current/backend`.
- **`caddy/Caddyfile`:**
```
{
    email <owner-email-for-letsencrypt>
}
api.azurerec.kloudschool.com {
    encode zstd gzip
    request_body {
        max_size 10MB
    }
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Content-Type-Options "nosniff"
        Referrer-Policy "strict-origin-when-cross-origin"
        -Server
    }
    reverse_proxy 127.0.0.1:8000 {
        flush_interval -1
    }
}
```
- **`sudoers/kloudrecon-deploy`:** `ghrunner ALL=(root) NOPASSWD: /usr/local/bin/kloudrecon-activate`
- **`bin/kloudrecon-activate`** (bash, `set -euo pipefail`; takes a 40-char SHA, validated with a regex). Steps:
  1. Verify `/opt/kloudrecon/releases/<sha>/.built` exists.
  2. Warn if the installed systemd/Caddy/sudoers files differ from the release's `deploy/` files.
  3. Ensure the Playwright Chromium browser exists in `/opt/kloudrecon/ms-playwright` (install as `kloudrecon` if missing).
  4. Run migrations as `kloudrecon`: load the env file, set `DATABASE_URL=$DATABASE_MIGRATION_URL`, run `alembic upgrade head` in `<release>/backend`.
  5. Remember the previous `current` target, then `ln -sfn <release> /opt/kloudrecon/current`.
  6. `systemctl restart kloudrecon-api kloudrecon-worker`.
  7. Poll `http://127.0.0.1:8000/api/v1/health` for up to 60 s.
  8. On failure, restore the previous symlink, restart, and exit 1 (migrations must be backward compatible).
  9. Delete releases older than the newest 5.
- **`postgres/init.sql`** (same as C4), **`pg_hba.snippet`**, **`pg_ident.snippet`**, **`tuning.conf`**.
- **`env/kloudrecon.env.example`** (same keys as C5).

**Migration rule:** migrations run before the new code starts, so they must work with the previous release (expand → deploy → contract).

---

# PART E — Operations

## E1. Everyday deploy
1. Commit in VS Code and push (or merge a PR) to `main`.
2. **CI** runs. If it's green, **Deploy** starts and waits for you: Actions → Deploy → **Review deployments → Approve**.
3. The backend is built on the VM, migrated, activated and health-checked (automatic rollback on failure). Then the web app is deployed to Static Web Apps.

## E2. Rollback
- **Automatic:** the activation script rolls back if the health check fails.
- **Manual:**
```bash
ls -t /opt/kloudrecon/releases
sudo /usr/local/bin/kloudrecon-activate <previous_sha>
```
- **Web:** Actions → Deploy → re-run an older successful run (or run `workflow_dispatch` on an older commit).

## E3. Backups & restore
Backups run automatically:
- **Nightly PostgreSQL dump** → Blob `db-backups/` (30 days), via `kloudrecon-backup.timer`.
- **Daily VM backup** → Recovery Services vault (14 days).

Check the backup timer:
```bash
systemctl list-timers | grep kloudrecon
journalctl -u kloudrecon-backup -n 20 --no-pager
```
**Restore the database** from a dump:
```bash
sudo systemctl stop kloudrecon-api kloudrecon-worker
# download the chosen .dump from Blob (portal → container db-backups → Download) and copy it to the VM, then:
sudo -u kloudrecon pg_restore --clean --if-exists --no-owner \
  -d "host=/var/run/postgresql dbname=kloudrecon user=kloudrecon_owner" /tmp/kloudrecon-YYYYMMDD.dump
sudo systemctl start kloudrecon-api kloudrecon-worker
```
**Restore the whole VM:** Recovery Services vault → Backup items → Restore VM (creates a new VM or disks).
Test a restore once per quarter.

## E4. Updates
- Security updates install automatically (unattended-upgrades).
- Monthly maintenance window:
```bash
sudo apt update && sudo apt -y upgrade
sudo reboot
```
- PostgreSQL minor versions arrive with apt. Major upgrades (16 → 17) are planned separately with `pg_upgradecluster`.

## E5. Useful commands
```bash
systemctl status kloudrecon-api kloudrecon-worker caddy postgresql --no-pager
journalctl -u kloudrecon-worker -f
sudo -u kloudrecon psql "host=/var/run/postgresql dbname=kloudrecon user=kloudrecon_owner"
df -h; free -m; uptime
```

## E6. Troubleshooting
| Problem | Check / fix |
|---|---|
| `api.azurerec...` has no HTTPS | DNS A record correct? Ports 80/443 open (NSG + ufw)? `journalctl -u caddy -n 50`. With Cloudflare, use DNS only |
| 502 from Caddy | API not running: `systemctl status kloudrecon-api`, `journalctl -u kloudrecon-api` |
| Browser CORS error | `CORS_ALLOWED_ORIGINS` must be exactly `https://app.azurerec.kloudschool.com` |
| Login redirect error (AADSTS50011) | Redirect URI missing in `kloudrecon-web` |
| 401 from API after login | `ENTRA_*` values, audience `api://kloudrecon-api`, token version 2 |
| Key Vault / Blob 403 | VM identity role missing (A10), or subnet not allowed in Key Vault/Storage networking |
| Emails not sent / spam | ACS domain fully Verified (SPF + DKIM), MailFrom `donotreply` added, DMARC record present |
| Deploy stuck on "Waiting for a runner" | Runner service stopped: `sudo /home/ghrunner/actions-runner/svc.sh status` |
| Activation says "sudo: a password is required" | sudoers file not installed (C8) |
| Migration failed | See the Actions log; fix forward; the old release keeps running |
| PDF reports fail | Playwright deps/browser (C8 commands), `PLAYWRIGHT_BROWSERS_PATH` |
| High memory | Lower `WORKER_CONCURRENCY` or resize the VM (stop → Size → start) |

---

# PART F — Local development (your PC)

## F1. Install once
- Git, **Python 3.12**, **Node.js 22 LTS**, **Docker Desktop** (WSL 2 backend), VS Code
- Azure CLI (optional, for real AI locally: `az login`)
- Claude Code

## F2. Run the full product locally
```powershell
cd "D:\Web Projects Live\kloudrecon"
docker compose -f docker-compose.dev.yml up -d          # PostgreSQL, Azurite, Mailpit

cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
copy .env.example .env
alembic upgrade head
python -m kloudrecon.cli seed-dev
python -m kloudrecon.cli seed-demo
playwright install chromium
```
Daily (or just run `.\scripts\dev.ps1`):

| Terminal | Command | URL |
|---|---|---|
| 1 API | `cd backend; .\.venv\Scripts\Activate.ps1; uvicorn kloudrecon.api.main:app --reload --port 8000` | http://localhost:8000/api/docs |
| 2 Worker | `cd backend; .\.venv\Scripts\Activate.ps1; python -m kloudrecon.worker.main` | – |
| 3 Web | `cd apps/web; npm install; npm run dev` | http://localhost:5173 |
| Emails | – | http://localhost:8025 (Mailpit) |

Dev logins: `owner@local.test` (owner console), `admin@acme.test` (customer with demo data), `pending@new.test` (waiting for approval).

Reset the local database: `.\scripts\reset-db.ps1`. Stop the services: `docker compose -f docker-compose.dev.yml down` (add `-v` to delete the data).

---

# PART G — Go-live checklist
- [ ] A1–A12 created; 📝 values recorded
- [ ] DNS records (Part B) added; ACS domain **Verified**; SWA custom domain **Validated**
- [ ] VM setup C1–C7 done; runner Idle in GitHub
- [ ] First deploy + C8 completed; `https://api.azurerec.kloudschool.com/api/v1/health` returns OK
- [ ] `https://app.azurerec.kloudschool.com` loads; sign up as owner works; `/owner` visible
- [ ] Test customer: sign up → pending → approve → welcome email received from `donotreply@azurerec.kloudschool.com`
- [ ] Add a test Azure connection (Reader) → scan → all pages populated → PDF report downloads
- [ ] Backup timer ran once; the dump is visible in Blob; VM backup succeeded
- [ ] Alerts + availability test active; budget set
- [ ] SSH open only to your IP; password login disabled; ufw on; unattended-upgrades on
- [ ] Terms, Privacy, and data deletion flow tested
