# KloudRecon for Azure — Product & Implementation Plan
*by KloudSchool* · "Recon your Azure. Secure it. Optimize it."

> This is the single source of truth for building the product. The infrastructure is created manually by the owner using `02_KLOUDRECON_INFRA_AND_DEPLOYMENT.md`.

---

## 0. Instructions for Claude Code (read first)

1. Build the product in **5 phases** (Section 22). Finish a phase and pass its acceptance criteria before starting the next. **After Phase 5, the complete product must run locally.**
2. **Do not change the tech stack** (Section 3).
3. **Do not ask the owner questions.** When something is unclear, choose the most reasonable option that fits this plan, and record it in `docs/decisions/NNNN-title.md` (short).
4. **No Infrastructure-as-Code** (no Bicep, Terraform, ARM, Pulumi, azd). You *do* write the server config files the owner installs by hand: systemd units, Caddyfile, sudoers file, activation script, backup timer, all in `deploy/`.
5. **Commit after each meaningful step** (Conventional Commits). **Never `git push`**; the owner pushes.
6. Each phase is large. Split it into the numbered steps given in Section 22, commit after each step, and keep the **"Progress" section in `CLAUDE.md`** up to date. A new session must be able to continue from it.
7. Every phase includes code, Alembic migrations, tests, and docs updates. Run lint, type checks and tests, and fix all errors before you say a phase is done.
8. **Never log or return secrets.** Customer client secrets are write-only once saved.
9. Every tenant query is filtered by `org_id`, and **PostgreSQL Row-Level Security** is enforced as a second layer.
10. All Azure SDK calls sit behind interfaces, so tests and **Demo Mode** run without Azure.
11. **Copyright rule for compliance content:** reference framework controls by their **ID only** (e.g., "CIS 6.1", "NIST AC-2"). Write all titles and descriptions in our own words. Never copy benchmark or standard text. Say "mapped to", never "certified".
12. The UI must look **clean, professional, enterprise-grade**, in light and dark mode (Section 14).

---

## 1. Brand & Product Overview

| Item | Value |
|---|---|
| Product name | **KloudRecon** (full: **KloudRecon for Azure**) |
| Company / publisher | KloudSchool |
| Tagline | Recon your Azure. Secure it. Optimize it. |
| Web app URL | `https://app.azurerec.kloudschool.com` |
| API URL | `https://api.azurerec.kloudschool.com` |
| Email sender | `donotreply@azurerec.kloudschool.com` (Azure Communication Services) |
| Code / package name | `kloudrecon` |

"for Azure" is used as a descriptive phrase only. The brand word is **KloudRecon**.

### 1.1 What it does
A customer connects their Azure environment **read-only** in about 3 minutes and gets the following in one place:
- full inventory with change history
- superb architecture diagrams built with the official Azure icons
- **deep security posture**: attack paths, identity analysis, compliance frameworks, threat signals
- FinOps with forecasting and rightsizing
- Well-Architected and reliability checks
- governance
- AI analyst and chat
- audit-ready PDF reports

### 1.2 Personas
| Persona | Need |
|---|---|
| Consultant / MSP | Fast client assessments, white-label reports, many tenants |
| IT / cloud manager | "What do we have? Is it secure? Why is the bill high?" |
| Security lead | Real risks, attack paths, compliance evidence |
| FinOps / finance | Trends, forecast, savings, showback |

### 1.3 Roles
| Role | Scope | Abilities |
|---|---|---|
| **Platform Owner** (KloudSchool) | Owner console `/owner` | Approve/reject registrations, plans, orgs, users, read-only customer view (audited), system health, AI cost, MRR, announcements, feature flags, email templates, retirement catalog |
| Org Owner | Customer org | Everything in the org, billing, delete org |
| Org Admin | Customer org | Connections, settings, team |
| Org Member | Customer org | View everything, run scans, manage findings |
| Org Viewer | Customer org | Read-only |

### 1.4 Registration & approval rules
1. The customer signs up (email verification, then MFA).
2. They complete a profile (company, country, job title, phone, company size, use case, terms acceptance).
3. Their status becomes `pending_approval` and they see the **"Your account is under review"** page.
4. The owner gets an in-app and email notification, then **Approves** (choosing plan + trial days) or **Rejects** (with a reason).
5. On approval: status becomes `active` and the customer gets a welcome email. On rejection: they get an email and a rejected page.
6. Invited team members join an already-approved org directly.

---

## 2. Architecture

### 2.1 Production
```mermaid
flowchart LR
  U[Browser] -->|HTTPS| SWA[Azure Static Web Apps\napp.azurerec.kloudschool.com\nReact SPA]
  U -->|HTTPS + Bearer token| CADDY[Caddy on Linux VM\napi.azurerec.kloudschool.com]
  U -. sign in .-> EXT[Microsoft Entra External ID]
  subgraph VM[Azure Linux VM - Ubuntu 24.04 - systemd]
    CADDY --> API[kloudrecon-api.service\ngunicorn + uvicorn :8000]
    API <--> PG[(PostgreSQL 16\nsystemd, local socket)]
    WK[kloudrecon-worker.service\njobs + scheduler] <--> PG
    PG -. LISTEN/NOTIFY .-> API
    BK[kloudrecon-backup.timer\nnightly pg_dump]
  end
  API & WK -->|managed identity| KV[Key Vault\ncustomer secrets]
  API & WK -->|managed identity| BLOB[(Blob Storage\nsnapshots, reports, backups)]
  WK -->|managed identity| AOAI[Azure OpenAI]
  WK -->|managed identity| ACS[Communication Services Email\ndonotreply@azurerec.kloudschool.com]
  WK -->|customer SP, read-only| CUST[(Customer Azure tenants\nARM, Resource Graph, Cost, Monitor,\nAdvisor, Defender, Policy, Graph opt.)]
  BK --> BLOB
  API & WK --> APPI[Application Insights]
```

Key principles:
- **No Docker in production.** Python runs in a venv under systemd, and PostgreSQL is installed natively.
- **Heavy work runs only in the worker**, through a PostgreSQL job queue. The API only does a short credential validation against Azure.
- **Live updates:** the worker writes events, PostgreSQL `NOTIFY` wakes the API, and the API pushes them to the browser as **Server-Sent Events (SSE)**.
- **The VM's system-assigned managed identity** accesses Key Vault, Blob, OpenAI and ACS, so no keys are stored anywhere.
- **PostgreSQL is reached through the local Unix socket with peer authentication**, so no database passwords exist.

### 2.2 Local development
```mermaid
flowchart LR
  B[Browser localhost:5173] --> VITE[Vite dev server\nnpm run dev]
  VITE -->|proxy /api| UV[uvicorn --reload :8000]
  W[python -m kloudrecon.worker.main]
  subgraph Docker[docker compose -f docker-compose.dev.yml]
    PG[(postgres:16 :5432)]
    AZ[Azurite blob :10000]
    MP[Mailpit SMTP :1025 UI :8025]
  end
  UV & W --> PG & AZ & MP
  W -. optional .-> AOAI[Azure OpenAI via az login]
```
Locally, Docker runs **only** the supporting services: PostgreSQL, Azurite and Mailpit. The API, worker and React app run directly with uvicorn, Python and Node.

---

## 3. Technology Stack (final)

| Layer | Choice |
|---|---|
| Frontend | React 18 + TypeScript (strict) + Vite |
| UI | Tailwind CSS + shadcn/ui (Radix), lucide-react icons, sonner toasts, cmdk command palette, framer-motion (subtle) |
| Charts | Apache ECharts (`echarts-for-react`) |
| Diagrams | React Flow (`@xyflow/react`) + `elkjs` + official Microsoft Azure Architecture Icons |
| Data | TanStack Query, TanStack Table + Virtual, react-hook-form + zod, Zustand (UI state only) |
| Auth (web) | `@azure/msal-browser` + `@azure/msal-react` (Entra External ID) |
| Realtime (web) | `@microsoft/fetch-event-source` (SSE with Authorization header) |
| Backend | Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2.x, **psycopg 3**, Alembic |
| Prod server | gunicorn + uvicorn workers behind **Caddy** (automatic HTTPS) on the VM, managed by systemd |
| Local server | `uvicorn --reload` |
| Job queue | Own PostgreSQL queue (`jobs` table, `FOR UPDATE SKIP LOCKED`, advisory locks) |
| Scheduler | APScheduler inside the worker, guarded by `pg_try_advisory_lock` |
| Analytics | `statsmodels` (forecast), `networkx` (attack paths / graph), `pandas` where useful |
| Azure SDKs | azure-identity, azure-mgmt-resourcegraph, azure-mgmt-costmanagement, azure-mgmt-advisor, azure-mgmt-security, azure-mgmt-policyinsights, azure-mgmt-monitor, azure-mgmt-network, azure-mgmt-resource, azure-mgmt-subscription, azure-keyvault-secrets, azure-storage-blob, azure-communication-email, msgraph via REST (httpx) |
| AI | Azure OpenAI (`openai` SDK, `AzureOpenAI`, Entra auth), structured outputs |
| PDF | Playwright (Chromium), headless print of a report route |
| Database | **PostgreSQL 16** (JSONB, RLS, monthly partitioning for cost data) |
| Files | Azure Blob Storage (Azurite locally) |
| Secrets | Azure Key Vault (local encrypted file in development) |
| Email | Azure Communication Services Email (Mailpit SMTP locally) |
| Identity | Microsoft Entra External ID (dev fake login locally) |
| Observability | `azure-monitor-opentelemetry`, structlog JSON logs (journald on the VM) |
| Tests | pytest, pytest-asyncio, httpx, vitest + Testing Library, Playwright E2E |
| Quality | ruff, mypy, eslint, prettier, pip-audit, npm audit |

---

## 4. Repository Structure

```
kloudrecon/
├─ apps/web/                          # React SPA
│  ├─ public/azure-icons/             # Microsoft Azure Architecture Icons (owner downloads)
│  ├─ public/staticwebapp.config.json
│  └─ src/
│     ├─ app/ (router, providers, shells)   ├─ components/ui/  ├─ components/charts/
│     ├─ components/diagram/                ├─ features/<module>/
│     ├─ lib/ (api client, msal, sse, format)  ├─ styles/ (tokens.css)  └─ pages/
├─ backend/
│  ├─ pyproject.toml   ├─ alembic.ini   ├─ alembic/
│  ├─ src/kloudrecon/
│  │  ├─ api/ (FastAPI app + routers v1)     ├─ core/ (config, db, rls, security, logging, errors)
│  │  ├─ domain/ (models, schemas)           ├─ services/ (business + infra interfaces)
│  │  ├─ azure/ (customer-facing Azure clients: graph, cost, monitor, activity, advisor, defender, policy, msgraph)
│  │  ├─ scan/ (pipeline + stages)           ├─ jobs/ (queue, scheduler)
│  │  ├─ rules/ (engine + catalog/*.yaml + python rules)
│  │  ├─ security/ (attack paths, exposure, ciem, risk)
│  │  ├─ finops/ (aggregation, forecast, anomalies, rightsizing, whatif)
│  │  ├─ diagram/ (topology builder, views, drawio export)
│  │  ├─ ai/ (prompts/*.md, tools, redaction, cost tracking)
│  │  ├─ reports/ (templates, playwright renderer)
│  │  ├─ notify/ (sse events, email, webhooks)
│  │  ├─ ops/ (backup, maintenance CLI)      ├─ demo/ (demo tenant generator)
│  │  ├─ worker/ (entrypoint)                └─ cli.py (kloudrecon CLI: seed-demo, create-owner, ...)
│  └─ tests/
├─ deploy/                            # server config the owner installs manually (NOT IaC)
│  ├─ systemd/ kloudrecon-api.service, kloudrecon-worker.service,
│  │           kloudrecon-backup.service, kloudrecon-backup.timer
│  ├─ caddy/Caddyfile
│  ├─ sudoers/kloudrecon-deploy
│  ├─ bin/kloudrecon-activate          # root-owned release activation + rollback script
│  ├─ postgres/ (pg_hba snippet, pg_ident snippet, tuning.conf, init.sql)
│  └─ env/kloudrecon.env.example
├─ docker-compose.dev.yml             # local only: postgres, azurite, mailpit
├─ scripts/ dev.ps1, dev.sh, reset-db.ps1
├─ .github/workflows/ ci.yml, deploy.yml
├─ docs/ (01/02 plans, decisions/, LOCAL_DEVELOPMENT.md, user-guide.md, runbooks/)
└─ CLAUDE.md
```

---

## 5. Local Development (must work on Windows)

### 5.1 `docker-compose.dev.yml` (supporting services only)
| Service | Image | Ports | Purpose |
|---|---|---|---|
| `postgres` | `postgres:16` | 5432 | DB `kloudrecon`, user/password `kloudrecon`/`kloudrecon` (local only), persistent volume |
| `azurite` | `mcr.microsoft.com/azure-storage/azurite` | 10000 | Blob emulator |
| `mailpit` | `axllent/mailpit` | 1025 (SMTP), 8025 (web UI) | Catch all emails; view them in the browser |

### 5.2 Local modes (env vars)
- `ENV=local`, `AUTH_MODE=dev`: dev login page with seeded users `owner@local.test` (platform owner), `admin@acme.test` (active customer admin), `pending@new.test` (pending). Refuses to start when `ENV=prod`.
- `SECRET_STORE=local`: encrypted file in `backend/.local-secrets/`.
- `EMAIL_MODE=smtp` → Mailpit.
- `BLOB_MODE=azurite`.
- `AI_MODE=mock` (deterministic fake responses) or `AI_MODE=azure` (real Azure OpenAI through `az login` / `DefaultAzureCredential`).
- `DEMO_MODE=true` allows the "Contoso Demo" org with generated data, so every page works without a real Azure subscription.

### 5.3 Commands (write these into `docs/LOCAL_DEVELOPMENT.md` and `scripts/dev.ps1`)
```powershell
# one time
docker compose -f docker-compose.dev.yml up -d
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
copy .env.example .env
alembic upgrade head
python -m kloudrecon.cli seed-dev          # dev users + plans
python -m kloudrecon.cli seed-demo         # Contoso Demo org with full data
playwright install chromium                 # for PDF reports

# every day (3 terminals, or run scripts\dev.ps1)
# 1) API
cd backend; .\.venv\Scripts\Activate.ps1; uvicorn kloudrecon.api.main:app --reload --port 8000
# 2) Worker
cd backend; .\.venv\Scripts\Activate.ps1; python -m kloudrecon.worker.main
# 3) Web
cd apps/web; npm install; npm run dev       # http://localhost:5173
# Emails: http://localhost:8025
```
The Vite dev server proxies `/api` to `http://localhost:8000` locally. In production the SPA calls `VITE_API_BASE_URL`.

---

## 6. Authentication, Registration, Teams

- **Entra External ID** user flow: email + password (or email OTP), email verification, optional Google/Microsoft sign-in, MFA.
- **SPA:** MSAL gets an access token for scope `api://kloudrecon-api/access_as_user`.
- **API:** validates the JWT (issuer `https://<tenant-subdomain>.ciamlogin.com/<tenant-id>/v2.0`, audience, signature via cached JWKS, expiry).
- First call `GET /api/v1/me` returns `profile_incomplete`, then the onboarding form, then `POST /api/v1/onboarding` creates org + user with status `pending_approval`.
- **Access gate:** all data endpoints require `user.status=active` and `org.status=active`. Allowed before approval: `/me`, `/onboarding`, `/health`.
- **Owner bootstrap:** `BOOTSTRAP_OWNER_EMAILS` (comma list) gets `platform_role=owner` on first login. Also available as `kloudrecon.cli create-owner <email>`.
- **Invitations:** token (hashed), 7-day expiry, role, accept after sign-in.
- **Enterprise SSO** (customer's own Entra tenant) is on the roadmap. Design the auth layer so another issuer can be added later.

---

## 7. Azure Connections & Permission Tiers

### 7.1 Customer inputs (Settings → Connections)
Connection name, Directory (tenant) ID, Application (client) ID, **client secret value** (stored only in Key Vault; the DB keeps only the secret name), secret expiry date, scope (all visible subscriptions or selected ones, or a management group).

After saving, the secret is shown only as `•••••••• (expires in N days)`, with a **Replace secret** button.

### 7.2 Permission tiers (show clearly in the wizard)
| Tier | What the customer grants | Unlocks |
|---|---|---|
| **Core (required)** | **Reader** role on subscriptions or a management group | Inventory, changes (Activity Log), diagrams, security checks, attack paths, Azure RBAC analysis, Defender/Advisor/Policy import, vulnerabilities (if Defender is on), cost, metrics-based rightsizing, reliability, governance |
| Identity (optional) | Microsoft Graph **application** permissions with admin consent: `User.Read.All`, `Group.Read.All`, `Application.Read.All`, `Policy.Read.All`, `RoleManagement.Read.Directory`, `AuditLog.Read.All` | Entra ID posture: MFA coverage, Conditional Access gaps, admins, guests, stale/expiring app credentials, principal display names. Some reports need Entra ID P1/P2 licenses (show "not available" gracefully) |
| Commitments (optional) | **Reservations Reader** (tenant level) and/or Billing Reader | Utilization of existing reservations and savings plans |

We **never** need write roles. If write permissions are detected, show a warning with the reason.

Reader cannot read secrets, keys, app settings or data. This is by design, and it's a selling point.

### 7.3 Setup wizard content (copy buttons)
- **Portal steps:**
  1. App registration (single tenant).
  2. Copy the Client ID and Tenant ID.
  3. Create a client secret (12 months) and copy the **Value**.
  4. Go to Subscription or Management group → IAM → Add role assignment → **Reader** → select the app.
  5. (Optional) API permissions → Microsoft Graph → Application permissions (list above) → **Grant admin consent**.
- **Cloud Shell:** `az ad sp create-for-rbac --name "KloudRecon-Reader" --role Reader --scopes /subscriptions/<SUB_ID>`, plus `az role assignment create ...` for more subscriptions.
- Known limits: role propagation takes 5–10 minutes; CSP subscriptions may not expose cost data; sponsorship/free-trial cost API limits.

### 7.4 Save & Validate (synchronous, under 25 s, shown as a checklist)
1. Token acquisition. Friendly errors for `AADSTS7000215` (Secret ID copied instead of Value), `AADSTS7000222` (expired), `AADSTS700016` (app not in tenant), `AADSTS90002` (tenant not found).
2. List subscriptions (0 means the role is missing or still propagating).
3. Effective permissions per subscription (`Microsoft.Authorization/permissions`): confirm read access, warn about write access.
4. Resource Graph test query.
5. Cost Management test query (last 7 days): available, or unavailable with the reason.
6. Defender secure score read.
7. Graph test (if the Identity tier is selected): which permissions work.
8. Save the report; status becomes `valid`, `partially_valid` or `invalid`. If valid, enqueue the **first full scan**.

Secret expiry reminders at 30/14/7/1 days (in-app + email).

---

## 8. Scan Engine (worker)

### 8.1 Job queue (PostgreSQL)
- Table `jobs(id, org_id, type, payload jsonb, status, priority, run_after, attempts, max_attempts, locked_by, locked_at, last_error, created_at, finished_at)`.
- Worker loop: `SELECT ... WHERE status='queued' AND run_after<=now() ORDER BY priority, created_at FOR UPDATE SKIP LOCKED LIMIT 1`.
- **One scan per connection at a time:** `pg_try_advisory_lock(hash(connection_id))`.
- Job types: `scan.full`, `scan.incremental`, `ai.generate`, `report.render`, `notify.email`, `notify.webhook`, `maintenance.*`.
- Retries with exponential backoff + jitter; `dead` status after max attempts, with an owner alert.
- Honor `Retry-After` and `x-ms-ratelimit-*` headers from Azure. Per-tenant concurrency cap.
- Worker concurrency set by `WORKER_CONCURRENCY` (asyncio tasks). Graceful shutdown on SIGTERM (systemd stop).

### 8.2 Triggers
- First scan after validation.
- **Scan now** (at most once per 15 minutes per connection).
- **Scheduled** daily scan at the org's chosen hour. The scheduler runs every 5 minutes behind `pg_try_advisory_lock` and also handles secret reminders, scheduled reports, the weekly AI digest, retention cleanup, and partition maintenance.

### 8.3 Stages (idempotent, each logged in `scan_stage_logs`)
| # | Stage | Source |
|---|---|---|
| 1 | Authenticate | Key Vault secret → `ClientSecretCredential` |
| 2 | Subscriptions & management groups | ARM |
| 3 | Inventory | Resource Graph (`resources`, `resourcecontainers`), paging with `$skipToken`; raw gzip snapshot → Blob |
| 4 | Relationships | Resource Graph: VNets, subnets, NICs, NSGs, route tables, peerings, gateways, private endpoints, LBs, App Gateways, Firewalls, Front Door, App Service VNet integration, AKS, managed identities |
| 5 | RBAC | Resource Graph `authorizationresources` (role assignments + definitions) |
| 6 | Changes | Diff vs previous snapshot, plus Activity Log (last 24 h incremental; 90 days on first scan) for "who changed what" |
| 7 | Defender & vulnerabilities | Secure score, assessments, sub-assessments (CVE), alerts, plan coverage, regulatory compliance (when enabled) |
| 8 | Advisor | All categories |
| 9 | Policy | Non-compliant states summary |
| 10 | Identity (optional) | Microsoft Graph (Section 7.2) |
| 11 | Cost | Cost Management Query: daily **actual + amortized**, grouped by ServiceName, ResourceGroup, ResourceId, Location, MeterCategory; 13 months on first scan (chunked monthly), then re-pull the last 7 days |
| 12 | Forecast & budgets | Internal model + Azure Forecast API; budgets |
| 13 | Metrics | Azure Monitor metrics (30 days, hourly aggregates) for VMs, VMSS, App Service plans, SQL DBs, AKS node pools (CPU, memory where available, DTU/vCore) — batched and rate-limited |
| 14 | Reservations (optional tier) | Utilization + recommendations |
| 15 | Quotas | Compute/network usage vs limits per region in use |
| 16 | Rules engine | All rule packs (Section 10) |
| 17 | Security graph | Exposure engine, attack paths, blast radius, toxic combinations (Section 9.4) |
| 18 | Risk & scores | Section 11 |
| 19 | Diagram build | All views (Section 9.3) → Blob + cache |
| 20 | AI insights | Executive summary, top risks explanation (AI_MODE) |
| 21 | Finalize | Diff vs previous scan (new/resolved findings, cost change, resource changes), notifications, webhooks |

Status is `succeeded`, `partial` (an optional stage failed, with the reason shown), or `failed`. Hard timeout 60 minutes.

### 8.4 Live progress & notifications
The worker inserts into `events` and runs `NOTIFY org_events`. The API `LISTEN`s and streams to `GET /api/v1/events/stream` (SSE, bearer auth, heartbeat every 20 s).

The UI shows a progress drawer with the stage checklist, toasts, a notification bell with unread count, and email per the user's preferences.

### 8.5 Time machine
Every scan keeps its snapshot. The UI lets users view inventory, diagram, findings and scores **as of any scan**, and **compare two scans** (added / removed / changed resources and findings).

---

## 9. Modules

### 9.1 Overview dashboard
- **KloudRecon Score** (0–100, grade A–E) with sub-scores: Security, Cost Efficiency, Reliability, Operational Excellence, Performance, Governance.
- KPI cards:
  - month-to-date cost, forecast month-end vs last month, potential savings
  - critical risks, internet-exposed resources, compliance % (selected framework)
  - resources, subscriptions, Microsoft Secure Score
- **Top 10 risks** and **Top 5 savings**, each with a one-click route to its detail.
- AI executive summary card, and "What changed since last scan".
- Mini charts: cost trend with forecast, findings by severity, score history.

### 9.2 Inventory & changes
- Virtualized table: icon, name, type, RG, subscription, location, SKU, tags, 30-day cost, findings, risk level.
- Filters, saved views, Ctrl/Cmd+K global search, CSV/XLSX export.
- Resource drawer:
  - properties (JSON viewer), tags, cost (90 days), metrics sparkline
  - related resources, findings, attack paths involving it
  - change history, "Open in Azure Portal"
- **Changes page:** timeline of added/deleted/modified resources and who did it (Activity Log caller), filters, and a "risky changes" highlight.
- Orphaned/unused resource list.

### 9.3 Architecture diagrams (flagship; must look superb)
- **Backend topology builder** produces a normalized graph: nodes (resource, group container, external entity such as "Internet") and typed edges (contains, peering, private-endpoint, vnet-integration, lb-backend, route, nsg-attached, identity-uses, rbac-grants, dns, dependency).
- **Views:**
  1. Network topology
  2. Hub-and-spoke (auto-detect hubs via peering degree / gateways / firewalls)
  3. Resource group
  4. Application/workload (group by a configurable tag such as `app` / `workload`)
  5. Data flow (private endpoints, service endpoints, integrations)
  6. Region
  7. Management group & subscription hierarchy
- **Rendering:**
  - React Flow + elkjs layered/orthogonal layout
  - nested group containers styled like Microsoft reference architectures: subscription → VNet → subnet, with soft tinted backgrounds and labeled headers
  - **official Azure icons** via a `type → icon` mapping file (generic fallback icon)
  - clean orthogonal edges, edge labels on hover, legend
- **Overlays (toggle):**
  - Security: internet exposure paths in red, open ports as badges
  - Attack paths: highlight the selected path
  - Cost heatmap
  - Findings badges
  - Changes since last scan (added in green, removed as ghost)
- **Interactions:** hover card, click opens the resource drawer, focus/isolate a node and its neighbors, search, collapse/expand groups, mini-map, zoom to fit, **presentation mode** (full screen, hide controls), sticky-note annotations (saved per org).
- **Timeline:** slider across scans, showing how the architecture changed.
- **Export:** PNG (2× resolution), SVG, PDF, **draw.io (.drawio XML with Azure shape styles)**.
- **Performance:** more than 400 nodes start collapsed at RG/VNet level; target render under 2 s for the demo tenant.
- **Architecture document (auto-generated):** narrative sections per view with embedded diagrams, component tables, and network address plan; exportable as PDF (via Reports).

### 9.4 Security posture (deep)
1. **Configuration checks:** at least **200 checks** (Section 10) across network, identity/RBAC, data (Storage, SQL, Cosmos, Key Vault), compute, App Service/Functions, containers/AKS/ACR, logging/monitoring, backup/DR, keys/secrets/certificates, and Defender coverage.
2. **Compliance frameworks:** CIS Microsoft Azure Foundations, Microsoft Cloud Security Benchmark, ISO/IEC 27001:2022 Annex A, NIST SP 800-53 rev5, PCI DSS v4, SOC 2 TSC, HIPAA Security Rule.
   - Each rule maps to control **IDs**; framework pages show % passed, control drill-down, and failing resources.
   - **Evidence export:** a ZIP containing a CSV and PDF per control.
   - Mapped, not certified.
3. **Network exposure engine:** computes real internet reachability from public IPs, NSG rules (NIC + subnet, evaluated in priority order), LB/NAT rules, App Gateway/Front Door/Firewall DNAT, public PaaS endpoints (public network access / firewall rules). Output: exposed resources, ports, protocols, source ranges, and which rule allows it.
4. **Security graph & attack paths:** a `networkx` graph of Internet → exposed resource → identity (managed identity / service principal) → RBAC role at scope → sensitive target (Key Vault, Storage, SQL, Cosmos, subscription Owner). Path scoring = exposure × exploitability (critical CVEs, missing Defender) × privilege × target sensitivity. Shown as a list plus a diagram highlight.
5. **Blast radius:** for any resource, what an attacker could reach if it were compromised.
6. **Toxic combinations:** predefined combos, e.g. public + critical CVE + privileged identity, public storage + no logging, exposed DB + no firewall + no auditing.
7. **Identity & entitlements (CIEM, Azure RBAC):**
   - Owners/User Access Administrators per scope
   - privileged roles at subscription/management group level
   - wildcard (`*`) custom roles
   - classic administrators if detectable
   - guest/external principals (with the Graph tier)
   - service principals and managed identities with high privileges
   - unused/stale principals (Graph sign-in data when available)
   - role assignment sprawl
   - least-privilege suggestions
8. **Entra ID posture (Identity tier):** MFA registration coverage, admins without MFA, Conditional Access coverage and legacy auth, number of global admins, guest settings, app registrations with secrets expiring or expired or long-lived, apps with high Graph permissions.
9. **Vulnerabilities:** import Defender CVE findings (VMs, containers, SQL) and prioritize by exposure and exploitability. Show "Enable Defender to see vulnerabilities" when it isn't available.
10. **Threat & suspicious change signals:** Defender alerts, plus Activity Log detections: NSG rule opened to the internet, new Owner/UAA assignment, diagnostic settings deleted, Key Vault access changes, public access enabled on storage, firewall rules widened, resource locks removed, mass deletions.
11. **Coverage dashboards:** Defender plans per subscription, diagnostic settings coverage %, Activity Log export, backup coverage, encryption/CMK usage, TLS minimums.
12. **Remediation per finding:**
    - explanation and impact
    - steps for Portal, Azure CLI, PowerShell, Bicep, and Terraform
    - an **Azure Policy definition/initiative suggestion to prevent recurrence**
    - Microsoft docs links
    - AI assist in Phase 5
13. **Workflow:**
    - statuses: open → in progress → resolved (auto when fixed); accepted risk / exception (requires reason, approver, expiry)
    - assignee, due date, SLA by severity, comments
    - MTTR and trend charts
14. **Custom rules (Pro/Enterprise):** customers write Resource Graph KQL checks with severity and mapping; they're validated and run each scan.

### 9.5 Reliability & Well-Architected
- **Well-Architected score** per pillar: Reliability, Security, Cost, Operational Excellence, Performance Efficiency. Each rule has a pillar.
- Reliability checks:
  - availability zones and sets
  - redundancy (LRS in prod)
  - single-instance production workloads
  - SKUs without SLA (Basic/Free tiers in prod)
  - backup and soft delete
  - geo-replication for prod data
  - health probes
- **Retirement & end-of-life tracker:**
  - curated catalog (`rules/catalog/retirements.yaml`: service/SKU, retirement date, source URL, migration hint) matched against inventory
  - Advisor retirement items merged in
  - editable by the owner in the owner console
  - entries whose date isn't verified are marked "verify"
- **Quota usage** warnings (> 80%).

### 9.6 Governance
Required tags, naming regex, allowed regions and SKUs (org settings), Azure Policy compliance summary, resource locks on prod, management group hierarchy, subscription hygiene (empty subscriptions, no budgets, no owners contact).

### 9.7 FinOps
1. **Cost explorer:**
   - actual vs amortized
   - group by service, RG, subscription, tag, location, meter
   - 7d/30d/90d/6m/12m/custom ranges
   - charts: stacked area, month-over-month bars, treemap, top resources, top movers, day-of-week heatmap
2. **Forecast:** ETS/Holt-Winters with weekly seasonality, P10/P50/P90 bands, blended with the Azure forecast, month-end and next-3-month projections, budget burn-down, backtest accuracy (MAPE).
3. **Anomalies:** rolling median + MAD with an absolute threshold, root-cause drill-down (service → resource → meter), alerts.
4. **Rightsizing from metrics:** VMs, VMSS, App Service plans, SQL DB (DTU/vCore) using P95 CPU/memory over 30 days → recommended SKU with the estimated saving (Azure Retail Prices API), confidence, and risk note.
5. **Waste finder:**
   - unattached disks and unused public IPs
   - stopped-not-deallocated VMs
   - empty App Service plans and idle LBs/gateways
   - old snapshots
   - dev/test running 24/7 (schedule savings)
   - storage tiering opportunities
   - Log Analytics retention and ingestion drivers
   - missing Azure Hybrid Benefit
   - previous-generation SKUs
6. **Commitments:** reservation / savings plan recommendations with break-even; utilization of existing ones (optional tier).
7. **What-if simulator:** resize, change region, buy a reservation, or schedule shutdown, priced via the Retail Prices API (cached). Shows monthly and annual impact.
8. **Showback/chargeback:** by tag (team, costcenter, env), tag coverage by cost, untagged cost, CSV export.
9. **Savings tracker:** recommendations marked implemented, with realized savings measured from later cost data.
10. **Cost of risk:** each security finding shows the monthly cost of the affected resource.
11. Currency shown everywhere (billing currency).

### 9.8 Recommendations hub
One prioritized backlog combining rules, Advisor, Defender, Policy, rightsizing, waste, and commitments.
- **Priority = impact** (risk score or savings) × confidence ÷ effort.
- Table and Kanban views, assign/due date/comments, bulk actions.
- "Copy as ticket" (Jira / Azure DevOps markdown) and CSV export.
- Headline: potential savings per month and per year, plus risk reduction.

### 9.9 AI (Azure OpenAI)
- **Executive summary** per scan and a **weekly AI digest** email.
- **AI Security Analyst:** explains attack paths and toxic combinations in plain language, and builds an ordered fix plan.
- **AI Architecture Review:** Well-Architected review of each workload/view, with strengths, risks, and improvements.
- **AI remediation:** a tailored fix per finding type, cached by rule + resource type.
- **"Ask KloudRecon" chat:** available on every page. Read-only tool calling over the latest scan (`search_resources`, `get_resource`, `get_costs`, `get_forecast`, `list_findings`, `get_attack_paths`, `get_compliance`, `get_diagram_summary`, `get_scores`, `get_changes`). Answers cite resources and findings as links; streams via SSE.
- **Guardrails:**
  - numbers come only from the provided data
  - structured outputs validated with Pydantic
  - customer text (names, tags) treated as untrusted data (prompt-injection defense)
  - no write tools
  - optional redaction of names and IPs
  - per-org token and cost tracking, plan quotas, graceful fallback
- Two deployments: `AOAI_DEPLOYMENT_MAIN` (quality) and `AOAI_DEPLOYMENT_MINI` (bulk). Prompts are versioned files in `ai/prompts/`.

### 9.10 Reports (PDF, via Playwright)
- **Report types:**
  1. Executive one-pager
  2. Full Assessment
  3. Security & Attack Paths
  4. **Compliance audit pack** (per framework)
  5. FinOps
  6. Architecture document
  7. Changes report
- Print route `/report/:id` (token-protected, A4): cover with org logo/color (white-label on Pro+), "Prepared by", table of contents, charts, diagram images, tables, appendix.
- Generated by the worker → Blob → 15-minute download link. Scheduled delivery by email (weekly/monthly).

### 9.11 Alerts & integrations
- **Alert rules per org:** new critical risk, attack path created, risky change, cost anomaly, budget forecast exceeded, scan failed, secret expiring.
- **Channels:** in-app, email, Microsoft Teams incoming webhook, Slack webhook, generic webhook (signed with HMAC).
- Ticket export: Jira and Azure DevOps (copy/markdown in v1; API integration on the roadmap).

### 9.12 Settings (customer)
Connections, Subscriptions (enable, set "production"), Team & roles, Notifications & alert rules, Integrations (webhooks), Governance config, Compliance frameworks (choose active ones), AI settings (redaction, digest), Branding (logo/color for reports), Billing & plan, Audit log, Danger zone (delete connection/org).

### 9.13 Owner console (`/owner`)
- **Approval queue** (with wait timer) → approve with plan + trial days / reject with reason; bulk actions.
- **Orgs:** details, members, connections (status only, never secrets), scans, usage, plan, notes, suspend/reactivate, **read-only view as org** (audited, visible banner).
- Users, plans editor, coupon/trial extension.
- **System health:** VM stats (from the API process: CPU, memory, disk, DB size), job queue depth, dead jobs (retry), scan duration by stage, Azure throttling count, AI errors.
- **Business:** MRR, active orgs, trial → paid conversion, churn, AI cost per org.
- Announcements banner, feature flags, email templates editor (safe subset), retirement catalog editor, audit log.

---

## 10. Rules Engine & Catalog

### 10.1 Design
- **Declarative rules** in `rules/catalog/*.yaml` for simple checks. Each has: `id`, `title`, `description` (own words), `category`, `pillar`, `severity`, `resource_types`, a condition (either a Resource Graph **KQL** query returning failing resource IDs, or a JSONPath/expression over stored properties), `remediation` (portal/cli/powershell/bicep/terraform text), `policy_suggestion`, `frameworks` (control IDs only), `references` (Microsoft docs URLs).
- **Python rules** in `rules/python/` for complex checks (NSG evaluation, RBAC analysis, metrics-based ones).
- The engine loads all packs, runs them per scan, and produces findings with evidence (the offending property values).
- Every rule has fixture tests (a pass case and a fail case). A CI check fails if a rule has no tests or no framework mapping.

### 10.2 Minimum catalog size (implement at least)
| Area | Min. rules |
|---|---|
| Network (NSG, public IP, firewall, App Gateway/WAF, DDoS, private endpoints, DNS) | 30 |
| Identity & RBAC (Azure) | 20 |
| Entra ID (Identity tier) | 15 |
| Storage | 15 |
| Databases (SQL, PostgreSQL/MySQL flexible, Cosmos, Redis) | 25 |
| Key Vault, keys, secrets, certificates | 10 |
| Compute (VM, VMSS, disks) | 15 |
| App Service / Functions / Container Apps | 15 |
| Containers (AKS, ACR) | 15 |
| Logging, monitoring, Defender coverage | 15 |
| Backup & DR / reliability | 15 |
| Governance | 10 |
| Cost / waste | 20 |
| **Total** | **≥ 220** |

"Production" detection: tags `env` / `environment` in (prod, production, prd), or a subscription/RG name pattern (configurable), or the "production" flag on a subscription.

---

## 11. Risk Engine & Scores
- **Finding risk score (0–100)** = base severity (critical 90, high 70, medium 45, low 20, info 0) adjusted by: internet exposure (+15), on an attack path (+10), privileged identity involved (+10), sensitive data target (+10), production (+5), critical CVE present (+10), compensating control present (−10). Clamped to 0–100.
- **Pillar scores:** `100 × (1 − Σ open risk weights / Σ max weights of evaluated checks)`.
- **Cost Efficiency** = `100 − min(100, savings / run-rate × 200)`.
- **KloudRecon Score** = Security 30%, Cost 20%, Reliability 20%, Operational Excellence 10%, Performance 5%, Governance 15%. Grades: A ≥ 90, B ≥ 75, C ≥ 60, D ≥ 40, E < 40.
- Every scan stores the scores for trends. Also track MTTR by severity.

---

## 12. Data Model (PostgreSQL 16)

- UUID primary keys (`gen_random_uuid()`), `timestamptz`, JSONB for flexible payloads, GIN indexes on JSONB where filtered.
- **RLS on every tenant table:**
  `USING (org_id = current_setting('app.org_id', true)::uuid OR current_setting('app.system', true) = 'on')`.
  The app sets `SET LOCAL app.org_id` per transaction. System jobs set `app.system=on` only in explicit system code paths.
- **Two DB roles:** `kloudrecon_owner` (owns the schema, runs migrations) and `kloudrecon_app` (DML only, subject to RLS). Tables use `FORCE ROW LEVEL SECURITY`.
- **Large tables:** `cost_daily` is partitioned by month (the maintenance job creates future partitions and drops those older than 13 months); `resource_snapshots` and `events` have retention jobs.

| Table | Key columns |
|---|---|
| plans | code, name, price_monthly, currency, limits jsonb, features jsonb, active |
| organizations | name, country, size, industry, status, plan_id, trial_ends_at, branding jsonb, settings jsonb |
| users | org_id, external_oid, email, name, job_title, phone, org_role, platform_role, status, approved_by/at, rejection_reason, last_login_at, notification_prefs jsonb |
| invitations | org_id, email, role, token_hash, expires_at, accepted_at |
| billing_accounts | org_id, provider, customer_id, subscription_id, status, period_end |
| connections | org_id, name, tenant_id, client_id, kv_secret_name, secret_expires_on, tiers jsonb, status, validation_report jsonb |
| azure_subscriptions | org_id, connection_id, subscription_id, name, state, enabled, is_production, cost_available |
| management_groups | org_id, connection_id, mg_id, name, parent_id |
| jobs | (Section 8.1) |
| scans | org_id, connection_id, trigger, status, stage, progress, started/finished, stats jsonb, error jsonb |
| scan_stage_logs | scan_id, stage, status, started/finished, items, message |
| resources | org_id, scan_id, arm_id, name, type, kind, location, rg, subscription_id, sku jsonb, tags jsonb, properties jsonb, monthly_cost, risk_level |
| resource_edges | org_id, scan_id, source_arm_id, target_arm_id, edge_type, attrs jsonb |
| resource_changes | org_id, scan_id, arm_id, change_type, diff jsonb, caller, occurred_at |
| rbac_assignments | org_id, scan_id, principal_id, principal_type, principal_name, role_name, role_def_id, scope, is_privileged |
| identities_entra | org_id, scan_id, kind, object_id, display_name, attrs jsonb |
| findings | org_id, scan_id, rule_id, source, category, pillar, severity, risk_score, arm_id, title, evidence jsonb, est_monthly_savings, effort, status, assignee_id, due_at, first_seen, last_seen, resolved_at |
| finding_exceptions | org_id, rule_id, arm_id, reason, approved_by, expires_at |
| finding_comments | finding_id, user_id, body |
| compliance_results | org_id, scan_id, framework, control_id, status, passed, failed |
| attack_paths | org_id, scan_id, path jsonb, score, entry_arm_id, target_arm_id, summary |
| vulnerabilities | org_id, scan_id, arm_id, cve, severity, cvss, exploitable, fixed_version |
| security_alerts | org_id, scan_id, source, severity, title, arm_id, detected_at, attrs jsonb |
| cost_daily (partitioned) | org_id, subscription_id, usage_date, arm_id, rg, service, meter_category, location, tags jsonb, cost_actual, cost_amortized, currency |
| cost_forecasts | org_id, scan_id, scope, date, p10, p50, p90, source |
| cost_anomalies | org_id, date, scope, expected, actual, driver jsonb, status |
| budgets | org_id, subscription_id, name, amount, grain, spend, forecast |
| metrics_summary | org_id, scan_id, arm_id, metric, p50, p95, max, period_days |
| rightsizing | org_id, scan_id, arm_id, current_sku, recommended_sku, monthly_saving, confidence |
| savings_tracker | org_id, finding_id, expected, realized, measured_at |
| scores | org_id, scan_id, overall, security, cost, reliability, operations, performance, governance, secure_score |
| diagrams | org_id, scan_id, view, blob_path, node_count |
| diagram_annotations | org_id, view, node_ref, text, position jsonb |
| ai_generations | org_id, scan_id, kind, prompt_version, model, input_hash, tokens_in/out, cost_usd, content jsonb |
| chat_sessions / chat_messages | org_id, user_id / session_id, role, content, tool_calls jsonb |
| reports | org_id, scan_id, type, status, blob_path, schedule jsonb |
| alert_rules / integrations | org_id, type, config jsonb (webhook URL encrypted via SecretStore) |
| events | org_id, user_id, type, payload jsonb, created_at (SSE + notifications) |
| notifications | org_id, user_id, type, title, body, link, read_at |
| custom_rules | org_id, name, kql, severity, mapping jsonb, enabled |
| retirement_catalog | service, sku, date, source_url, hint, verified |
| audit_logs | org_id, actor_id, action, target, ip, user_agent, details jsonb |
| feature_flags / announcements / email_templates | platform tables (no RLS) |

---

## 13. API (REST `/api/v1`, OpenAPI generated; TypeScript types generated with `openapi-typescript`)
Groups:
- **health**
- **me / onboarding**
- **org, team, invitations**
- **connections** (create/validate/replace-secret/delete), **subscriptions**
- **scans** (start, list, detail)
- **events/stream** (SSE)
- **notifications**
- **overview**
- **resources** (list/detail/export), **changes**, **compare**?`from=&to=`
- **diagram**?`view=&scan=`, **annotations**
- **security:** findings (list/detail/update/comment/exception), attack-paths, exposure, identities, vulnerabilities, alerts, coverage, **compliance** (frameworks, controls, evidence export)
- **reliability**, **governance**, **retirements**, **quotas**
- **costs:** summary/daily/breakdown/top/movers/forecast/anomalies/tags/budgets/commitments/**rightsizing**/**whatif**/savings
- **recommendations**
- **ai:** summary, analyst, architecture-review, remediation, chat (SSE)
- **reports:** create/list/download/schedules
- **alerts & integrations**
- **settings**, **custom-rules**, **audit-logs**
- **owner/*:** registrations approve/reject, orgs, users, plans, health, metrics, jobs retry, feature flags, announcements, templates, retirements, audit

Standards:
- Pagination (cursor)
- Error format `{ "error": { "code", "message", "details" } }`
- Request IDs
- Rate limiting per user and IP (slowapi)
- CORS allow-list (`CORS_ALLOWED_ORIGINS`)
- Plan limits enforced server-side (`PlanGuard`)

---

## 14. UI / UX Design System (clean, professional, enterprise)

### 14.1 Direction
Calm, data-dense, and precise, at the level of Linear / Vercel / Datadog / Azure Portal. Lots of whitespace, 1-px borders, subtle shadows, consistent spacing (4-px grid). No heavy gradients inside the app; one tasteful gradient is allowed on the landing hero.

### 14.2 Typography (self-hosted via @fontsource)
- UI: **Inter** variable, `tabular-nums` for all numbers.
- Headings: **Plus Jakarta Sans** 600/700.
- Mono: **JetBrains Mono** (IDs, KQL, CLI, JSON).
- Scale: 12 / 13 / 14 (base) / 16 / 20 / 24 / 30 / 36.

### 14.3 Color tokens
```css
:root{
  --bg:#F7F9FC; --surface:#FFFFFF; --surface-2:#F1F4F9; --border:#E3E8EF;
  --text:#0B1220; --text-muted:#5B6B82;
  --brand:#1F5EFF; --brand-hover:#1A4FD6; --brand-soft:#E6EEFF; --accent:#06B6D4;
  --critical:#D92D20; --high:#E8590C; --medium:#D9A200; --low:#1F5EFF; --info:#6B7A90; --success:#12A150;
  --chart-1:#1F5EFF; --chart-2:#06B6D4; --chart-3:#7C3AED; --chart-4:#12A150; --chart-5:#E8590C; --chart-6:#DB2777; --chart-7:#0EA5E9; --chart-8:#84CC16;
}
[data-theme="dark"]{
  --bg:#0A0F1A; --surface:#101826; --surface-2:#172133; --border:#243044;
  --text:#E6EAF2; --text-muted:#93A1B8; --brand:#4C7DFF; --brand-hover:#6B93FF; --brand-soft:#16264D;
}
```
Severity is always shown as **icon + label + color** (never color alone). One ECharts theme is derived from the tokens (light + dark).

### 14.4 Layout & components
- **Collapsible left sidebar:** Overview, Inventory, Changes, Diagrams, Security (Findings, Attack Paths, Exposure, Identity, Vulnerabilities, Compliance), Reliability, Governance, Cost & FinOps, Recommendations, Reports, Settings. `/owner` for the platform owner.
- **Top bar:** org switcher (consultant mode), connection/subscription filter, scan selector ("as of"), data freshness + Scan now, notifications bell, Ask KloudRecon button, theme toggle, user menu.
- Skeleton loaders, meaningful empty states with next-step buttons, inline help tooltips, keyboard shortcuts, breadcrumbs.
- Tables: sticky headers, column chooser, density toggle, saved views.
- Accessibility: WCAG 2.1 AA, focus rings, aria labels. Responsive to tablet; mobile is read-only.

### 14.5 Public pages
- **Landing:** hero with product screenshot, logos strip placeholder, 3-step "Connect → Scan → Act", feature sections (Security, Diagrams, FinOps, AI, Reports), security & trust ("read-only, Key Vault, no agents"), comparison table, pricing, FAQ, footer with KloudSchool link.
- Also: Pricing, Security/Trust, Terms, Privacy, Login, Sign-up, Onboarding, Under review, Rejected.
- Brand: "KloudRecon" wordmark (text logo in Plus Jakarta Sans with a simple radar/scan-line glyph drawn in SVG), "for Azure" suffix, "by KloudSchool" in the footer.

---

## 15. Platform Security
- Customer secrets only in Key Vault (VM managed identity). Webhook URLs are stored through SecretStore too.
- PostgreSQL: local socket, peer auth, no network listener, two roles, RLS forced, automated tenant-isolation tests.
- API: JWT validation, CORS allow-list, rate limits, security headers (set by Caddy), request size limits, input validation (Pydantic), output encoding, no stack traces to clients.
- **Audit logs** for sensitive actions: connections, secrets, roles, approvals, exports, owner read-only views, exceptions.
- **Data deletion:** deleting a connection deletes its secret and data; deleting an org purges everything within 30 days.
- Dependency scanning (pip-audit, npm audit, Dependabot), CodeQL (GitHub setting).
- **Terms, Privacy, DPA pages:** we collect metadata, configuration, metrics and cost only; never data-plane content.

---

## 16. Observability
- OpenTelemetry → Application Insights (when `APPLICATIONINSIGHTS_CONNECTION_STRING` is set).
- structlog JSON to stdout → journald on the VM. Never log secrets or tokens (redaction filter + test).
- Custom metrics/events: scan duration per stage, Azure 429 count, `jobs_queued`, `jobs_dead`, AI tokens/cost, and a `worker_heartbeat` event every 60 s that also sends `disk_free_percent` (for `/` and `/var/lib/postgresql`), `mem_used_percent` and `cpu_percent` (via `psutil`) — used by Azure alerts and the owner console.
- `GET /api/v1/health` (liveness) and `/api/v1/health/ready` (DB + queue check).

---

## 17. Testing & Demo Mode
- **Backend:** pytest with a real Postgres (docker locally, service container in CI), recorded Azure fixtures, rule tests, RLS/tenant isolation tests, API contract tests. Target ≥ 80% coverage for rules/security/finops/scan.
- **Frontend:** vitest + Testing Library; Playwright E2E for the critical journeys.
- **Demo Mode:** "Contoso Demo" org containing:
  - about 600 resources in hub-spoke networking, AKS, App Services, SQL, Storage, Key Vault
  - realistic misconfigurations and 3 attack paths
  - 13 months of cost with seasonality + 2 anomalies
  - metrics for rightsizing, Activity Log changes, Defender CVEs
  - Entra identity data

  It's used for development, E2E tests, screenshots, and a public "View live demo" button.

---

## 18. Plans & Billing
| Plan | Price | Limits (defaults, editable by owner) |
|---|---|---|
| Trial | Free, 14 days | 1 connection, 3 subscriptions, 3 scans/day, 50 AI messages, reports with watermark |
| Starter | **$10/month** | 1 connection, 5 subscriptions, daily scan, 200 AI messages, all reports, 1 framework |
| Pro | $49/month | 5 connections, 50 subscriptions, all frameworks, custom rules, white-label, scheduled reports, webhooks, 1,000 AI messages |
| Enterprise | Custom | Unlimited, consultant multi-tenant, SSO (roadmap), SLA |

- **Billing provider** abstraction: `manual` (default; the owner assigns the plan when approving) and `stripe` / `paddle` adapters. The provider is chosen in config.
- Webhooks verified, 7-day grace period on failed payment, then read-only mode.

---

## 19. Production Runtime Artifacts (Claude writes; owner installs)
- `deploy/systemd/kloudrecon-api.service`:
  - `User=kloudrecon`, `WorkingDirectory=/opt/kloudrecon/current/backend`, `EnvironmentFile=/etc/kloudrecon/kloudrecon.env`
  - `ExecStart=/opt/kloudrecon/current/backend/.venv/bin/gunicorn kloudrecon.api.main:app -k uvicorn.workers.UvicornWorker -w 3 -b 127.0.0.1:8000 --timeout 120 --graceful-timeout 30`
  - `Restart=always`
  - hardening: `NoNewPrivileges=yes`, `ProtectSystem=full`, `ProtectHome=yes`, `PrivateTmp=yes`
- `deploy/systemd/kloudrecon-worker.service`: `ExecStart=.../.venv/bin/python -m kloudrecon.worker.main`, `KillSignal=SIGTERM`, `TimeoutStopSec=60`, `Restart=always`, `Environment=PLAYWRIGHT_BROWSERS_PATH=/opt/kloudrecon/ms-playwright`.
- `deploy/systemd/kloudrecon-backup.service` + `.timer`: daily 02:30 UTC, runs `python -m kloudrecon.ops.backup` (`pg_dump -Fc` → Blob `db-backups/` with managed identity, keeps 30 days, logs result).
- `deploy/caddy/Caddyfile`: `api.azurerec.kloudschool.com` → `reverse_proxy 127.0.0.1:8000` with `flush_interval -1` (SSE), gzip/zstd, security headers, 10 MB body limit.
- `deploy/bin/kloudrecon-activate <release_sha>` (root-owned, run via sudo by the GitHub runner):
  1. verify the release dir
  2. run `alembic upgrade head` as user `kloudrecon` with the owner DB role
  3. switch the `/opt/kloudrecon/current` symlink
  4. restart api + worker
  5. poll `http://127.0.0.1:8000/api/v1/health` for 60 s
  6. on failure, roll back the symlink and restart
  7. keep the last 5 releases
- `deploy/sudoers/kloudrecon-deploy`: allows the runner user to run only `/usr/local/bin/kloudrecon-activate` without a password.
- `deploy/postgres/`: `init.sql` (roles, database, extensions `pgcrypto`, `pg_stat_statements`), `pg_hba` + `pg_ident` peer-map snippets, `tuning.conf` for 8 GB RAM.
- `deploy/env/kloudrecon.env.example`: all production env vars (Section 20).

---

## 20. Configuration (env vars)
| Variable | Local example | Production example |
|---|---|---|
| `ENV` | `local` | `prod` |
| `AUTH_MODE` | `dev` | `entra` |
| `DATABASE_URL` | `postgresql+psycopg://kloudrecon:kloudrecon@localhost:5432/kloudrecon` | `postgresql+psycopg://kloudrecon_app@/kloudrecon?host=/var/run/postgresql` |
| `DATABASE_MIGRATION_URL` | same as above | `postgresql+psycopg://kloudrecon_owner@/kloudrecon?host=/var/run/postgresql` |
| `PUBLIC_APP_URL` | `http://localhost:5173` | `https://app.azurerec.kloudschool.com` |
| `PUBLIC_API_URL` | `http://localhost:8000` | `https://api.azurerec.kloudschool.com` |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:5173` | `https://app.azurerec.kloudschool.com` |
| `BOOTSTRAP_OWNER_EMAILS` | `owner@local.test` | owner's email |
| `ENTRA_TENANT_ID` / `ENTRA_TENANT_SUBDOMAIN` / `ENTRA_API_CLIENT_ID` / `ENTRA_API_AUDIENCE` | – | from External ID |
| `SECRET_STORE` / `KEY_VAULT_URL` | `local` / – | `keyvault` / `https://kv-kloudrecon-prod.vault.azure.net/` |
| `BLOB_MODE` / `STORAGE_ACCOUNT_URL` / `AZURITE_CONNECTION_STRING` | `azurite` / – / default Azurite string | `azure` / `https://stkloudreconprod.blob.core.windows.net` / – |
| `EMAIL_MODE` / `SMTP_HOST` / `SMTP_PORT` / `ACS_ENDPOINT` / `EMAIL_SENDER` | `smtp` / `localhost` / `1025` / – / `donotreply@azurerec.kloudschool.com` | `acs` / – / – / ACS endpoint / `donotreply@azurerec.kloudschool.com` |
| `AI_MODE` / `AOAI_ENDPOINT` / `AOAI_DEPLOYMENT_MAIN` / `AOAI_DEPLOYMENT_MINI` / `AOAI_API_VERSION` | `mock` | `azure` + values |
| `APPLICATIONINSIGHTS_CONNECTION_STRING` | – | from App Insights |
| `WORKER_CONCURRENCY` | `2` | `4` |
| `RUN_SCHEDULER` | `true` | `true` |
| `DEMO_MODE` | `true` | `true` (public demo org) |
| `BILLING_PROVIDER` | `manual` | `manual` → later `stripe`/`paddle` |
| `PLAYWRIGHT_BROWSERS_PATH` | – | `/opt/kloudrecon/ms-playwright` |
| Web (Vite): `VITE_API_BASE_URL`, `VITE_AUTH_MODE`, `VITE_ENTRA_SPA_CLIENT_ID`, `VITE_ENTRA_TENANT_SUBDOMAIN`, `VITE_ENTRA_API_SCOPE`, `VITE_APPINSIGHTS_CONNECTION_STRING` | `/api`, `dev` | `https://api.azurerec.kloudschool.com`, `entra`, ... |

Keep `.env.example` files complete. Never commit `.env`.

---

## 21. Coding Standards
- **Python:** ruff (lint + format), mypy strict on domain/services/rules/security/finops; routers thin, logic in services; async I/O for Azure calls; tenacity for retries.
- **TypeScript:** strict, no `any`, feature folders, API types generated from OpenAPI, and all colors/spacing from tokens (no ad-hoc hex values in components).
- Conventional Commits; every schema change is an Alembic migration.
- Feature flags for unfinished features.

---

## 22. Phases (5) — steps and acceptance criteria

### Phase 1 — Foundation, Design System, Auth & Owner Approval
**Steps:**
1. Monorepo, tooling, `CLAUDE.md` (with Progress section), `docker-compose.dev.yml`, `.env.example` files, `scripts/dev.ps1` + `dev.sh`, `docs/LOCAL_DEVELOPMENT.md`.
2. Backend core: config, logging with redaction, DB (psycopg + SQLAlchemy), RLS helpers, Alembic baseline, errors, health endpoints, infra interfaces (SecretStore, BlobStore, EmailSender, AI client, job queue, event bus) with local + Azure implementations.
3. Worker skeleton: job loop, scheduler with advisory lock, heartbeat, graceful shutdown.
4. Frontend shell: design tokens, fonts, light/dark, sidebar/top bar, command palette, SSE client, API client from OpenAPI, dev login page.
5. Auth: Entra External ID (MSAL) + `AUTH_MODE=dev`, `/me`, onboarding, pending/rejected pages, access gate.
6. Owner console v1: approval queue (approve with plan + trial / reject with reason), orgs, users, plans, audit log. Emails via EmailSender (Mailpit locally).
7. Teams & invitations, notifications bell (SSE).
8. Public site: landing, pricing, security, terms, privacy with KloudRecon branding.
9. `deploy/` artifacts (Section 19), `staticwebapp.config.json`, and GitHub workflows `ci.yml` + `deploy.yml` exactly as in infra guide Part D.
10. Tests: tenant isolation, access gate, owner-only endpoints; CI green.

**Done when:**
- The local stack runs using the documented commands.
- Dev login works for all three seeded users.
- A new sign-up waits for approval and appears in the owner queue; after approval, the customer receives an email in Mailpit and can reach the app.
- Non-active users get 403 on data APIs.
- All tests and linters pass.

### Phase 2 — Connections, Scan Engine, Inventory, Changes, Demo Mode
**Steps:**
1. Connections wizard (Portal + CLI tabs, permission tiers, limits) and Key Vault/local secret storage.
2. Validation checklist (Section 7.4) with friendly errors; replace/delete secret; subscriptions & management groups.
3. Job queue + scan pipeline framework (stages, logs, retries, throttling, partial status, timeouts).
4. Stages 1–6 (auth, subscriptions/MGs, inventory + snapshot, relationships, RBAC, changes/Activity Log).
5. Live progress drawer (SSE), notifications, scan-completed email, secret expiry reminders, daily schedule.
6. Inventory page + resource drawer + export; Changes timeline; orphaned resources; Compare scans / time machine.
7. Overview v1 (resource counts, changes, scan status).
8. **Demo Mode** generator with the full dataset (Section 17), used by all later phases.

**Done when:**
- A real Reader app registration validates.
- Wrong or expired secrets show the correct messages.
- "Scan now" shows live progress and completes; the inventory count matches the Azure Portal.
- Changes appear after modifying a resource in Azure and rescanning.
- The Demo org works without Azure.
- Secrets never appear in responses or logs (tested).

### Phase 3 — Deep Security, Compliance, Reliability & Governance
**Steps:**
1. Rules engine (YAML + Python), fixture test harness, CI check for tests and mappings.
2. Rule catalog ≥ 220 rules (Section 10.2), in batches by area, each batch with tests.
3. Stages 7–10 (Defender, vulnerabilities, alerts, Advisor, Policy, optional Graph identity).
4. Network exposure engine.
5. Security graph: attack paths, blast radius, toxic combinations.
6. CIEM (Azure RBAC) + Entra posture (Identity tier, graceful when absent).
7. Risk engine + pillar scores + KloudRecon Score + history.
8. Compliance frameworks (IDs only, own wording), control drill-down, evidence export ZIP.
9. Security pages (Findings, Attack Paths, Exposure, Identity, Vulnerabilities, Threat signals, Coverage, Compliance), finding detail with remediation (5 formats) + policy suggestion, workflow (assign, due, SLA, comments, exceptions with approval/expiry), MTTR.
10. Reliability & Well-Architected page, retirement catalog + tracker, quotas; Governance page + settings; custom KQL rules.
11. Overview updated: scores, Top 10 risks, compliance %.

**Done when:**
- ≥ 220 rules, each with passing pass/fail fixture tests and framework mappings.
- The demo tenant shows 3 attack paths with correct highlighting.
- Findings auto-resolve after a fix and rescan.
- The evidence export ZIP opens with correct content.
- Scores and trends display.

### Phase 4 — FinOps & Superb Architecture Diagrams
**Steps:**
1. Stages 11–15 (cost actual + amortized, forecast, budgets, metrics, reservations, quotas).
2. Cost explorer + all charts, forecast (P10–P90, backtest), anomalies with root cause.
3. Rightsizing from metrics, waste finder, commitments, what-if simulator (Retail Prices API), showback, savings tracker, cost of risk.
4. Stage 19 topology builder + all 7 views.
5. Diagram UI: official Azure icons mapping, containers, overlays (security, attack path, cost, findings, changes), interactions, presentation mode, annotations, timeline.
6. Exports: PNG, SVG, PDF, draw.io.
7. Architecture document generator (data for the Phase 5 report).

**Done when:**
- The 30-day cost matches Azure Cost Management (actual) within 1%.
- The forecast band and accuracy show.
- Rightsizing shows savings with SKUs.
- What-if calculates correctly for 3 test cases.
- The demo diagram renders in under 2 s, looks like a professional reference architecture, and the draw.io export opens in diagrams.net.

### Phase 5 — AI, Recommendations, Reports, Alerts, Billing, Hardening (full product)
**Steps:**
1. Recommendations hub (priority, table/Kanban, tickets, savings + risk headline).
2. AI layer: executive summary, AI Security Analyst, Architecture Review, remediation, weekly digest; guardrails, redaction, quotas, cost tracking; `AI_MODE=mock` for tests.
3. "Ask KloudRecon" chat with tool calling, citations, streaming.
4. Reports: all 7 types, print route, Playwright renderer, branding/white-label, schedules.
5. Alert rules + channels (email, Teams, Slack, signed webhook).
6. Plans, PlanGuard, billing provider abstraction (manual + Stripe/Paddle adapter), trial expiry, grace period; owner metrics (MRR, conversion, churn, AI cost).
7. Owner console complete (health, dead jobs retry, announcements, feature flags, templates, retirement editor, read-only org view).
8. Hardening:
   - security review (Section 15), redaction tests
   - performance: dashboard API P95 < 300 ms on demo data; indexes, caching
   - accessibility pass
   - Playwright E2E for the full journey
9. Docs: `LOCAL_DEVELOPMENT.md` (final), user guide, owner runbook, restore runbook, deployment checklist matching the infra guide.

**Done when (the full product runs locally):**
- Following `docs/LOCAL_DEVELOPMENT.md` from a fresh clone gives a working product with Demo Mode and every module.
- The AI works in mock mode and with a real Azure OpenAI.
- All 7 PDF reports generate.
- Alerts are delivered (Mailpit / test webhook).
- Plan limits are enforced.
- The E2E suite passes.
- All tests and linters pass.
- The deploy artifacts and workflows match the infra guide.

---

## 23. Roadmap (after launch)
Enterprise SSO (customer Entra), Azure Lighthouse onboarding, certificate / workload-identity-federation credentials, AWS & GCP connectors, IaC scanning (Bicep/Terraform upload + GitHub), agentless disk vulnerability scanning (optional elevated permission tier), auto-remediation (separate opt-in Contributor connection), Jira/Azure DevOps API integration, public API, Azure Marketplace listing, SOC 2.
