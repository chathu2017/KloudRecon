# Deployment checklist (go-live)

Follows `docs/02_KLOUDRECON_INFRA_AND_DEPLOYMENT.md` (the infra guide) part by part, with the
Phase 5 additions marked **(P5)**. Tick every line before announcing the product.

## Part A — Azure resources (manual)
- [ ] A1 Resource group `rg-kloudrecon-prod`, tags, resource providers registered
- [ ] A2 Log Analytics (30 days) + workspace-based App Insights; connection string noted
- [ ] A3 VNet 10.40.0.0/16, `snet-vm` with Key Vault + Storage service endpoints; NSG: 443, 80,
      22 from **your IP only**
- [ ] A4 VM `vm-kloudrecon-prod` (Ubuntu 24.04, B2ms, Premium OS + 128 GB data disk, static IP,
      **system-assigned identity on**, daily backup to `rsv-kloudrecon-prod`)
- [ ] A5 Key Vault: RBAC, soft delete + **purge protection**, network restricted to `snet-vm`
- [ ] A6 Storage: no anonymous access, **no key access**, TLS 1.2, soft delete + versioning;
      containers `snapshots`, `reports`, `exports`, `diagrams`, `branding`, `db-backups`;
      lifecycle rules
- [ ] A7 Azure OpenAI with local auth disabled; deployments **`gpt-main`** and **`gpt-mini`**;
      endpoint + GA API version noted **(P5: AI summaries, analyst, architecture review,
      remediation, digest, chat)**
- [ ] A8 ACS Email: domain `azurerec.kloudschool.com` **Verified** (TXT, SPF, DKIM ×2), MailFrom
      `donotreply`
- [ ] A9 Static Web App (Standard), deployment token noted, custom domain `app.azurerec…`
- [ ] A10 VM identity roles: Key Vault Secrets Officer, Storage Blob Data Contributor, Cognitive
      Services OpenAI User, ACS Contributor (or email sender)
- [ ] A11 Entra External ID tenant, `kloudrecon-api` (scope `access_as_user`, token v2),
      `kloudrecon-web` (SPA redirect URIs), user flow, branding, **MFA** for your owner account
- [ ] A12 Budget, action group, alerts (API down, CPU, memory, worker heartbeat, disk, dead jobs,
      backup), Defender for Cloud CSPM

## Part B — DNS
- [ ] `app.azurerec` CNAME → SWA; `api.azurerec` A → VM IP
- [ ] Email TXT/SPF/DKIM records; DMARC after verification
- [ ] No CNAME on `azurerec`; Cloudflare set to DNS-only; CAA allows letsencrypt.org + digicert.com

## Part C — VM
- [ ] C1 Updates, unattended-upgrades, ufw (22/80/443), SSH key-only, root login off
- [ ] C2 Data disk mounted at `/var/lib/postgresql` **before** installing PostgreSQL
- [ ] C3 Users `kloudrecon` and `ghrunner`, folders and permissions
- [ ] C4 PostgreSQL 16, tuning, peer maps, roles and database (`deploy/postgres/`)
- [ ] C5 `/etc/kloudrecon/kloudrecon.env` from `deploy/env/kloudrecon.env.example` — **(P5) also
      set** `AI_PRICE_*`, `REPORT_RENDERER=playwright`, `REPORT_LINK_MINUTES=15`,
      `BILLING_GRACE_DAYS=7`, `BILLING_SANDBOX=false`, `RATE_LIMIT_DEFAULT=300/minute`; owner 640
      `root:kloudrecon`; no secrets in the file
- [ ] C6 Caddy installed; DNS A record already live
- [ ] C7 Self-hosted runner `kloudrecon-prod`, **repository private**, runner Idle
- [ ] C8 First deploy completed: activation script + sudoers, systemd units, **Playwright
      system deps + Chromium in `/opt/kloudrecon/ms-playwright` (P5: PDF reports)**, Caddyfile;
      Deploy re-run is green
- [ ] C9 Signed up with the `BOOTSTRAP_OWNER_EMAILS` address → `/owner` visible

## Part D — GitHub
- [ ] D1 Private repo, `main` protected (CI required), Dependabot + secret scanning + push
      protection + CodeQL, environment `prod` with you as required reviewer
- [ ] Secrets/variables: `SWA_DEPLOYMENT_TOKEN`, `VITE_API_BASE_URL`, `VITE_AUTH_MODE=entra`,
      `VITE_ENTRA_SPA_CLIENT_ID`, `VITE_ENTRA_TENANT_SUBDOMAIN`, `VITE_ENTRA_API_SCOPE`,
      `VITE_APPINSIGHTS_CONNECTION_STRING`
- [ ] D2 `ci.yml`, `deploy.yml`, `staticwebapp.config.json` as in the guide (CI additionally runs
      `rules-check`, plan 10.1)

## Phase 5 production settings
- [ ] Plans and prices reviewed (Owner → Plans); limits match what you sell
- [ ] Billing: stay on `BILLING_PROVIDER=manual`, or follow "Billing providers" in
      `docs/runbooks/owner.md` (price IDs, `cli billing-secret`, provider webhook URL)
- [ ] Feature flags reviewed (`ai_chat`, `public_demo`)
- [ ] Email templates reviewed (Owner → Email templates → Preview)
- [ ] Demo organization seeded if you want the public demo: on the VM
      `sudo -u kloudrecon bash -c 'set -a; . /etc/kloudrecon/kloudrecon.env; cd /opt/kloudrecon/current/backend; .venv/bin/python -m kloudrecon.cli seed-demo'`
      (`DEMO_MODE=true`)

## Part G — Go-live acceptance (infra guide G)
- [ ] `https://api.azurerec.kloudschool.com/api/v1/health` returns OK; `/health/ready` shows the
      database, queue and a recent worker heartbeat
- [ ] `https://app.azurerec.kloudschool.com` loads; owner sign-up works; `/owner` visible
- [ ] Test customer: sign up → pending → approve → **welcome email** from
      `donotreply@azurerec.kloudschool.com`
- [ ] Test Azure connection (Reader) → validation checklist green → scan → all pages populated
- [ ] **(P5)** AI: the Overview executive summary says *AI* (not *Standard*); Ask KloudRecon
      answers with citations; Owner → Business shows AI cost
- [ ] **(P5)** Every report type generates; the PDF downloads and the architecture chapters show
      diagrams
- [ ] **(P5)** Alerts: a test Teams/Slack/webhook channel receives *Test*; an email alert arrives
- [ ] **(P5)** Owner console: System health green, View as organization works and is audited
- [ ] Backup timer ran once; dump visible in Blob; VM backup succeeded; restore tested once
      (`docs/runbooks/restore.md`)
- [ ] Alerts + availability test active; budget set
- [ ] SSH open only to your IP; password login disabled; ufw on; unattended-upgrades on
- [ ] Terms, Privacy and the **data deletion flow** tested (delete a test connection; delete a test
      organization from Settings → Billing & plan → Danger zone and confirm it disappears from
      Owner → Organizations)
- [ ] Before each release: `npm run e2e` and `scripts/perf_check.py` pass on a developer PC
      (`docs/runbooks/owner.md`)
