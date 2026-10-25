# KloudRecon for Azure

**Recon your Azure. Secure it. Optimize it.** *by KloudSchool*

[![License: PolyForm Noncommercial 1.0.0](https://img.shields.io/badge/license-PolyForm%20Noncommercial%201.0.0-blue)](LICENSE)
![Python 3.12](https://img.shields.io/badge/python-3.12-3776AB)
![React 18](https://img.shields.io/badge/react-18-61DAFB)
![PostgreSQL 16](https://img.shields.io/badge/postgresql-16-4169E1)
![Status: MVP](https://img.shields.io/badge/status-MVP-orange)

KloudRecon connects to Microsoft Azure **read-only** and turns one scan into a full picture of
your cloud: inventory, architecture diagrams, security posture, compliance mapping, cost and
FinOps, reliability and governance checks, an AI analyst, and PDF/Word reports. It is a
multi-tenant web application (React + FastAPI + PostgreSQL) that you can run on your own PC in
minutes with **Demo Mode**, without any Azure subscription.

> **Source-available, free for non-commercial use.** You may use, study, modify and share
> KloudRecon for personal, educational, research, non-profit and other non-commercial purposes.
> Commercial use (including selling it, offering it as a paid service, or using it inside a
> business for commercial work) needs a separate license. See [License](#license).

---

## Contents

- [Features](#features)
- [How it works](#how-it-works)
- [Tech stack](#tech-stack)
- [Quick start (Demo Mode)](#quick-start-demo-mode)
- [Connecting a real Azure tenant](#connecting-a-real-azure-tenant)
- [Repository layout](#repository-layout)
- [Running the checks](#running-the-checks)
- [Deployment](#deployment)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [Security](#security)
- [License](#license)
- [Author](#author)

## Features

| Area | What you get |
|---|---|
| **Inventory & changes** | Every resource across subscriptions and management groups, fast filters and search, resource drawer, orphaned resources, change timeline from the Activity Log, CSV/XLSX export, compare scans and a "time machine" view of any past scan |
| **Architecture diagrams** | Eight views (incl. the detailed *KloudRecon Draw* view) built from the scan, official Azure icons, automatic ELK layout, security/cost overlays, attack-path highlighting, presentation mode, exports to SVG, PNG, PDF and draw.io, and a generated architecture document |
| **Security** | 255 built-in rules (network, identity, Entra ID, storage, databases, Key Vault, compute, App Service, containers, monitoring, backup, governance, cost), network exposure engine, attack paths, blast radius and toxic combinations, RBAC/CIEM and Entra posture, Defender for Cloud and Azure Policy import, basic vulnerability assessment without a Defender plan, remediation in five formats, exceptions and MTTR |
| **Compliance** | Findings mapped to common framework control IDs, control drill-down and evidence ZIP export (mapping only, never a certification) |
| **Cost & FinOps** | 13-month cost import, cost explorer, forecast with confidence bands, budgets, anomalies with root cause, rightsizing, waste finder, reservation/commitment advice, what-if pricing (Azure Retail Prices API), showback and a savings tracker |
| **Reliability & governance** | Well-Architected style checks, service retirements, quotas, tagging and naming governance, custom KQL rules |
| **Recommendations** | One prioritised hub (impact × confidence ÷ effort), table and Kanban views, Jira / Azure DevOps tickets |
| **AI analyst** | Executive summary, security analyst, architecture review and the "Ask KloudRecon" chat, grounded in scan facts with citations and guardrails (Azure OpenAI, or a built-in mock for local use) |
| **Reports** | Seven PDF report types plus Word audit and server-health reports, branding/white-label, scheduled email delivery |
| **Alerts** | Rules and channels for in-app, email, Microsoft Teams, Slack and HMAC-signed webhooks |
| **Server health checks** | Read-only collection scripts for Windows and Linux servers; paste the output to get a health report (KloudRecon never connects to your servers) |
| **Platform** | Multi-tenant with PostgreSQL Row-Level Security, owner console (approvals, plans, billing, system health, feature flags, audit log), teams and invitations, light and dark themes, WCAG 2.1 AA checked |

## How it works

```
 Azure (read-only service principal)
   │  ARM · Resource Graph · Cost Management · Monitor · Defender · Policy · Microsoft Graph
   ▼
 Worker ── scan pipeline (inventory → relationships → RBAC → changes → security → rules
   │        → risk → cost → metrics → reservations → quotas → diagrams)
   ▼
 PostgreSQL 16 (Row-Level Security per organization) + Blob storage (snapshots, reports)
   ▲
 FastAPI API (/api/v1, SSE for live progress) ◄── React SPA (Vite, TanStack Query)
```

- KloudRecon only **reads** from Azure. Customer secrets live in Azure Key Vault in production
  (a local encrypted store in development).
- All Azure SDK calls sit behind interfaces, so tests and Demo Mode run without Azure. Demo Mode
  ships a synthetic "Contoso" tenant (~590 resources, cost history, Defender, Advisor, Policy,
  Entra data and four scans).

## Tech stack

| Layer | Technology |
|---|---|
| Web | React 18, TypeScript (strict), Vite, Tailwind CSS v4, Radix UI, TanStack Query, React Flow + ELK, ECharts, MSAL |
| API | Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2, Alembic, psycopg 3 |
| Worker | PostgreSQL job queue (`FOR UPDATE SKIP LOCKED`), APScheduler, Playwright (PDF rendering), python-docx |
| Database | PostgreSQL 16 with Row-Level Security |
| Azure services | Key Vault, Blob Storage, Communication Services (email), Azure OpenAI, Entra External ID, Application Insights |
| Local support services | Docker Compose: PostgreSQL, Azurite, Mailpit |

## Quick start (Demo Mode)

**Prerequisites:** Git, Python 3.12, Node.js 22 LTS or newer, Docker Desktop.

### Windows (PowerShell)

```powershell
git clone https://github.com/chathu2017/KloudRecon.git
cd KloudRecon
docker compose -f docker-compose.dev.yml up -d --wait     # PostgreSQL, Azurite, Mailpit

cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
copy .env.example .env
alembic upgrade head
python -m kloudrecon.cli seed-dev        # plans + development users
python -m kloudrecon.cli seed-demo       # Contoso demo organization with 4 scans
playwright install chromium              # used by the worker to render PDF reports
cd ..\apps\web
npm install
copy .env.example .env.local
cd ..\..

.\scripts\dev.ps1                        # opens the API, worker and web app in 3 windows
```

### macOS / Linux

```bash
git clone https://github.com/chathu2017/KloudRecon.git && cd KloudRecon
docker compose -f docker-compose.dev.yml up -d --wait
cd backend && python3.12 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]" && cp .env.example .env
alembic upgrade head && python -m kloudrecon.cli seed-dev && python -m kloudrecon.cli seed-demo
playwright install chromium
cd ../apps/web && npm install && cp .env.example .env.local && cd ../..
./scripts/dev.sh
```

Then open **http://localhost:5173/login** and pick an account (development sign-in, enabled by
`AUTH_MODE=dev` in the example env files):

| Email | What you get |
|---|---|
| `demo@contoso.test` | Demo Mode: the full product on the synthetic Contoso tenant |
| `owner@local.test` | Platform owner console at `/owner` |
| `admin@acme.test` | An active customer organization |
| any other email | A new sign-up waiting for owner approval |

| Local URL | What |
|---|---|
| http://localhost:5173 | Web app |
| http://localhost:8000/api/docs | API documentation (OpenAPI) |
| http://localhost:8025 | Mailpit (all emails sent locally) |

Full guide, other sign-in modes (`local` email codes, Entra External ID) and troubleshooting:
[`docs/LOCAL_DEVELOPMENT.md`](docs/LOCAL_DEVELOPMENT.md).

## Connecting a real Azure tenant

1. Create an app registration (service principal) in your tenant.
2. Give it **read-only** roles: *Reader* (and optionally *Cost Management Reader*, *Security
   Reader*, *Monitoring Reader*) on the subscriptions or management group you want to scan; add
   Microsoft Graph application permissions for the Entra ID posture checks if you want them.
3. In KloudRecon go to **Connections → Add connection**, follow the wizard (Azure Portal or
   Azure CLI instructions are shown), paste the tenant ID, client ID and secret, and validate.
4. Press **Scan now** and watch the live progress drawer.

The wizard explains each permission tier and what it unlocks. KloudRecon never writes to Azure.

## Repository layout

| Path | What |
|---|---|
| `apps/web` | React single-page app: public site, customer app, owner console |
| `backend/src/kloudrecon` | Python package: `api` (FastAPI), `worker`, `services`, `rules` (security catalog), `security`, `finops`, `diagrams`, `ai`, `reports`, `health`, `cli.py` |
| `backend/alembic` | Database migrations (incl. Row-Level Security policies) |
| `backend/tests` | Backend tests, rule fixtures and recorded Azure responses |
| `deploy` | Server configuration for a single Ubuntu VM (systemd, Caddy, PostgreSQL, sudoers) |
| `docs` | Product plan, infrastructure guide, decisions (ADRs), runbooks, design system, user guide |
| `scripts` | Dev start scripts, smoke and performance checks, webhook receiver |
| `docker-compose.dev.yml` | Local PostgreSQL, Azurite and Mailpit |

## Running the checks

```bash
# backend (from backend/, virtual environment active)
ruff check . && ruff format --check . && mypy src && python -m kloudrecon.cli rules-check && pytest -q

# web (from apps/web/)
npm run lint && npm run typecheck && npm run test -- --run && npm run build
```

The full backend suite takes a while (it runs against a real PostgreSQL test database); run only
one `pytest` session at a time. End-to-end and accessibility tests: `npm run e2e` with the stack
running and the demo seeded. GitHub Actions runs the same checks in
[`.github/workflows/ci.yml`](.github/workflows/ci.yml).

## Deployment

KloudRecon is designed to run on **one Ubuntu 24.04 VM** with systemd (no Docker), with Key
Vault, Blob Storage and Communication Services in Azure. Two guides are included:

- [`docs/02_KLOUDRECON_INFRA_AND_DEPLOYMENT.md`](docs/02_KLOUDRECON_INFRA_AND_DEPLOYMENT.md):
  Caddy + Azure Static Web Apps + GitHub Actions deployment.
- [`docs/runbooks/ubuntu-nginx-deployment.md`](docs/runbooks/ubuntu-nginx-deployment.md):
  everything on one server behind nginx.

Before going live, work through
[`docs/runbooks/deployment-checklist.md`](docs/runbooks/deployment-checklist.md). The
`Deploy` workflow is manual and expects your own self-hosted runner.

## Documentation

- [Product plan](docs/01_KLOUDRECON_PRODUCT_PLAN.md) and [user guide](docs/user-guide.md)
- [Local development](docs/LOCAL_DEVELOPMENT.md)
- [Architecture decisions](docs/decisions/) (ADRs `0001`–`0054`)
- [Design system](docs/ui/DESIGN_SYSTEM.md)
- [Security review](docs/security-review.md)
- Runbooks: [owner](docs/runbooks/owner.md), [restore](docs/runbooks/restore.md)
- [`CLAUDE.md`](CLAUDE.md): build log and coding rules (also used by AI coding assistants)

## Contributing

Issues and pull requests are welcome. Please:

- keep routers thin and business logic in `backend/src/kloudrecon/services/`;
- add an Alembic migration for every schema change, and `org_id` + Row-Level Security for every
  tenant table;
- keep Azure calls behind `services/azure/gateway.py` and add a recorded fixture for tests;
- use TypeScript strict (no `any`) and colors only from `apps/web/src/styles/tokens.css`;
- run the checks above and use [Conventional Commits](https://www.conventionalcommits.org/).

By submitting a contribution you agree that it may be distributed under this project's license,
and that the author may also offer it under a commercial license.

## Security

Please **do not** open a public issue for security problems. Contact the author privately through
[LinkedIn](https://www.linkedin.com/in/niwantha-wickramasingha/) with the details, and allow time
for a fix before disclosure. Never commit `.env` files or real credentials; the repository's
`.gitignore` excludes them.

## License

KloudRecon is licensed under the **[PolyForm Noncommercial License 1.0.0](LICENSE)**.

| You may | You may not (without a commercial license) |
|---|---|
| Use it for personal projects, learning and research | Sell it or sell access to it |
| Use it in schools, universities, charities, non-profits and government institutions | Run it as a paid or commercial SaaS / managed service |
| Read, modify and fork the code | Use it in a company for commercial work |
| Share copies and changes, keeping the license and the `Required Notice` line | Remove the license or copyright notice |

This is a *source-available* license, not an OSI-approved open-source license, because it
restricts commercial use. **Commercial licensing** is available: contact the author on
[LinkedIn](https://www.linkedin.com/in/niwantha-wickramasingha/).

Third-party notices:

- Azure service icons in `apps/web/public/azure-icons/` are © Microsoft and are used under the
  [Microsoft Azure architecture icon terms](https://learn.microsoft.com/azure/architecture/icons/).
  They are not covered by this project's license.
- Fonts in `apps/web/public/fonts/` and `backend/src/kloudrecon/reports/assets/fonts/` are under
  the SIL Open Font License.
- Third-party packages keep their own licenses (`package.json`, `backend/pyproject.toml`).

Microsoft, Azure and related names are trademarks of the Microsoft group of companies.
KloudRecon is an independent project and is not affiliated with or endorsed by Microsoft.

## Author

**Niwantha Wickramasingha**, KloudSchool

- LinkedIn: [linkedin.com/in/niwantha-wickramasingha](https://www.linkedin.com/in/niwantha-wickramasingha/)

If KloudRecon helps you, please star the repository and share your feedback.
