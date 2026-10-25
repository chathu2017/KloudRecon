# Local development

KloudRecon runs fully on a Windows PC. Docker runs **only** the supporting services
(PostgreSQL, Azurite, Mailpit). The API, worker and web app run directly with uvicorn, Python and
Node. With Demo Mode every module works without an Azure subscription.

| Service | How it runs | URL |
|---|---|---|
| PostgreSQL 16 | Docker (`postgres:16`) | `localhost:5432` (db `kloudrecon`, test db `kloudrecon_test`) |
| Azurite (Blob) | Docker | `http://127.0.0.1:10000` |
| Mailpit | Docker | SMTP `localhost:1025`, UI http://localhost:8025 |
| API | `uvicorn --reload` | http://localhost:8000/api/docs |
| Worker | `python -m kloudrecon.worker.main` (jobs, scheduler, PDF rendering, emails, webhooks) | — |
| Web | `npm run dev` (Vite, proxies `/api` → `:8000`) | http://localhost:5173 |

## Install once

- Git, **Python 3.12** (`py -3.12 --version`), **Node.js 22 LTS** or newer, **Docker Desktop**
  (WSL 2 backend), VS Code.
- Optional: Azure CLI (`az login`) for real Azure OpenAI with `AI_MODE=azure`.

## First run from a fresh clone (PowerShell)

```powershell
git clone <your-repo-url> kloudrecon
cd kloudrecon
docker compose -f docker-compose.dev.yml up -d --wait     # PostgreSQL, Azurite, Mailpit

cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
copy .env.example .env
alembic upgrade head
python -m kloudrecon.cli seed-dev        # plans + dev users
python -m kloudrecon.cli seed-demo       # Contoso Demo org, synthetic tenant, 4 scans (~15 s)
playwright install chromium              # PDF reports (the worker prints them with Chromium)
cd ..

cd apps\web
npm install
copy .env.example .env.local
cd ..\..
```

Then start everything with `.\scripts\dev.ps1` (it repeats the idempotent steps above and opens
the API, worker and web app in three windows), or use three terminals:

```powershell
# 1) API
cd backend; .\.venv\Scripts\Activate.ps1; uvicorn kloudrecon.api.main:app --reload --timeout-graceful-shutdown 3 --port 8000
# 2) Worker
cd backend; .\.venv\Scripts\Activate.ps1; python -m kloudrecon.worker.main
# 3) Web
cd apps\web; npm run dev
```

Open http://localhost:5173 and sign in as `demo@contoso.test`.

## Real sign-in (`AUTH_MODE=local`, decision 0047)

The local system currently runs in this mode: `AUTH_MODE=local` in `backend/.env` and
`VITE_AUTH_MODE=local` in `apps/web/.env.local` (the two must match).

- **Customers ("Workspace")**: email, then a 6-digit code sent to that address. An unknown
  address is a new sign-up: code, onboarding form, then your approval in the owner console.
- **Platform owner ("Control Center")**: email + password, then a 6-digit code.
- Codes are emailed. Until Azure Communication Services is configured they arrive in Mailpit:
  http://localhost:8025.
- Set or change the owner password (hidden prompt, stored as a scrypt hash):
  `python -m kloudrecon.cli set-owner-password <email>`; the address must also be in
  `BOOTSTRAP_OWNER_EMAILS`.
- **Azure Communication Services**: in `backend/.env` set `EMAIL_MODE=acs`,
  `ACS_CONNECTION_STRING=<connection string>` and `EMAIL_SENDER=DoNotReply@<verified domain>`,
  restart the API and worker, then test with
  `python -m kloudrecon.integrations.communication_email you@example.com`. The client lives in
  `backend/src/kloudrecon/integrations/communication_email.py` (the one file to replace).
- **Google / Microsoft buttons**: set `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` and/or
  `MICROSOFT_CLIENT_ID` + `MICROSOFT_CLIENT_SECRET`; register the redirect URI
  `http://localhost:8000/api/v1/auth/sso/<google|microsoft>/callback`. With
  `SSO_REQUIRE_OTP=true` (default) a provider sign-in is still confirmed with an emailed code.
- The database has no dev or demo accounts in this mode. The public "View live demo" appears
  again after `python -m kloudrecon.cli seed-demo`.
- **Automated tests**: backend tests force `AUTH_MODE=dev` themselves. For E2E, switch both env
  files back to `dev`, run `seed-dev` and `seed-demo`, restart the stack and rebuild the web app.

## Dev logins (`AUTH_MODE=dev`)

Open http://localhost:5173/login.

| Email | What you get |
|---|---|
| `owner@local.test` | Platform Owner — owner console at `/owner` |
| `admin@acme.test` | Active customer (Acme Corp, Org Owner, **Starter** plan) |
| `pending@new.test` | Registered, waiting for approval |
| `demo@contoso.test` | **Demo Mode**: Contoso Demo (Org Admin, **Pro** plan), ~590 resources, 4 scans |
| `viewer@contoso.test` | Contoso Demo as a read-only Viewer |
| any other email | A brand-new sign-up: onboarding form → "under review" |

Dev login is refused when `ENV=prod`; production uses Microsoft Entra External ID.

## A tour of the product (Demo Mode)

Sign in as `demo@contoso.test`:

- **Overview** — KloudRecon Score and pillars, cost KPIs, top risks and savings, the **AI
  executive summary** (with citations), what changed.
- **Inventory / Changes / Diagrams** — resource drawer, orphaned resources, Compare scans, seven
  diagram views with overlays and exports, the architecture document.
- **Security** — findings with remediation (5 formats + policy + AI remediation guide), attack
  paths with the **AI Security Analyst**, exposure, identity, vulnerabilities, threats, coverage,
  compliance with evidence ZIP.
- **Reliability, Governance, Cost & FinOps, Recommendations** — the full Phase 3–5 modules.
- **Ask KloudRecon** (top bar or Ctrl+J) — chat over the scan data; answers cite findings and
  resources.
- **Reports** — generate any of the 7 PDF reports; download or preview; Schedules tab (Pro).
- **Settings → Alerts** — rules, channels (Teams, Slack, signed webhook), delivery log.
- **Settings → Billing & plan** — plan, usage vs limits, plan options, danger zone.
- Top bar → **Scan now** (the worker must run) opens the live progress drawer; the clock icon is
  the **time machine** ("as of" an older scan).

As `owner@local.test`: approvals, organizations (with **View as organization**, read-only and
audited), plans (limits, features, provider price IDs), **Business** (MRR, conversion, churn, AI
cost), **System health**, announcements, feature flags, email templates, retirement catalog,
audit log.

The landing page (http://localhost:5173) also shows **View live demo**: a read-only session into
Contoso Demo for visitors (flag `public_demo`).

`python -m kloudrecon.cli seed-demo --reset` regenerates the demo;
`python -m kloudrecon.cli demo-summary` prints what the demo tenant contains.

### Try the approval flow

1. Sign in with a new email, e.g. `jane@contoso.test`, and complete the onboarding form.
2. You land on **Your account is under review**.
3. Sign in as `owner@local.test` → **Approvals** → Approve (plan + trial days).
4. Mailpit (http://localhost:8025) shows the owner's "new registration" and the customer's
   "welcome" email (the worker sends them).
5. Sign in again as `jane@contoso.test` → the app opens with a trial countdown banner.

## AI (`AI_MODE`)

- `AI_MODE=mock` (default): deterministic answers built from the same grounded facts; every AI
  feature works offline and in tests.
- `AI_MODE=azure`: real Azure OpenAI. Set `AOAI_ENDPOINT`, `AOAI_DEPLOYMENT_MAIN`,
  `AOAI_DEPLOYMENT_MINI`, `AOAI_API_VERSION` in `backend/.env`, give yourself the **Cognitive
  Services OpenAI User** role on the resource (infra guide A7) and run `az login`. No keys are
  used. Restart the API and worker.
- Per-org usage and cost: Settings → AI (customer) and Owner → Business (platform).

## PDF reports

The worker renders reports with Playwright's Chromium (`playwright install chromium`, once).
Tests use `REPORT_RENDERER=minipdf` (text-only, no browser). If you change the diagram code,
rebuild the bundled diagram renderer used by the architecture chapters:
`cd apps\web; npm run build:renderer` (commit `backend/src/kloudrecon/reports/assets/diagram-renderer.js`).

## Alerts and webhooks

Rules send in-app notifications and emails (Mailpit) on every plan. Teams/Slack/webhook channels
need Pro (Contoso Demo is on Pro). To see a signed webhook locally:

```powershell
python scripts\webhook_receiver.py --port 9000 --secret <whsec_… shown when you add the channel>
```

Add a **Signed webhook** channel with `http://localhost:9000/hook` (plain http to localhost is
allowed outside production) and press **Test**; the receiver prints the payload and "signature
VALID".

## Billing

`BILLING_PROVIDER=manual` (default): the owner assigns plans; customers send upgrade requests.
To try Stripe (test mode): put a test price ID on a plan (Owner → Plans), store the keys with
`python -m kloudrecon.cli billing-secret stripe-api-key` and `... stripe-webhook-secret`, set
`BILLING_PROVIDER=stripe`, and forward events with the Stripe CLI to
`http://localhost:8000/api/v1/public/billing/stripe/webhook`. Paddle works the same way
(`BILLING_SANDBOX=true` for the sandbox API).

A trial that ends, a payment overdue after the grace period (`BILLING_GRACE_DAYS`) or a canceled
subscription make the organization **read-only** (data visible, no new scans/AI/reports).

## Connect your own Azure test subscription

1. Create a read-only app registration — the wizard shows the exact steps and the one-liner:
   `az ad sp create-for-rbac --name "KloudRecon-Reader" --role Reader --scopes /subscriptions/<SUB_ID> --years 1`
2. Sign in as `admin@acme.test` → **Settings → Connections → Add connection**, paste the tenant
   ID, client ID and the secret **Value**, then **Save & validate**. The first scan starts
   automatically (the worker must run).
3. Locally the secret is stored encrypted in `backend/.local-secrets/` (`SECRET_STORE=local`).
   Acme is on Starter (1 connection, 5 subscriptions): change the plan in the owner console if
   needed.
4. To capture sanitized REST fixtures for tests:
   `cd backend; .\.venv\Scripts\python.exe ..\scripts\record_azure_fixtures.py --name mytenant --tenant <TENANT_ID> --client <CLIENT_ID>`
   (review the file before committing).

## Checks (same as CI)

```powershell
cd backend
ruff check .; ruff format --check .
mypy src
pip-audit
python -m kloudrecon.cli rules-check
pytest -q                     # uses TEST_DATABASE_URL (kloudrecon_test); ~45 minutes

cd ..\apps\web
npm run lint
npm run typecheck
npm run test -- --run
npm run build
npm audit
```

### End-to-end, accessibility and performance (stack running, demo seeded)

```powershell
cd apps\web
npx playwright install chromium          # once, for the E2E runner
npm run e2e                              # 22 journeys: onboarding/approval/email, live demo, every module,
                                         # AI chat, PDF download, alerts → signed webhook, plan
                                         # limits, owner console, read-only org view, org deletion,
                                         # WCAG 2.1 AA (axe, light + dark), phone layout
cd ..\..\backend
.\.venv\Scripts\python.exe ..\scripts\perf_check.py      # P95 < 300 ms on 22 dashboard endpoints
.\.venv\Scripts\python.exe ..\scripts\smoke_local.py     # dev logins, access gate, approval over SSE
.\.venv\Scripts\python.exe ..\scripts\smoke_phase2.py    # Demo Mode, Scan now + SSE
```

The E2E suite writes traces and an HTML report to `apps/web/e2e/.report/` (ignored by Git). The
local `.env` allows 3000 requests/minute so these scripts are not rate-limited (production: 300).

Regenerate the web API types after changing backend schemas:

```powershell
cd backend; python -m kloudrecon.cli export-openapi ..\apps\web\openapi.json
cd ..\apps\web; npm run gen:api
```

## Reset and stop

- Reset the local database: `.\scripts\reset-db.ps1` (stop the API and worker first).
- Stop services: `docker compose -f docker-compose.dev.yml down` (add `-v` to delete the data).

## Database roles locally

The Docker superuser `kloudrecon` owns the tables and runs migrations (like `kloudrecon_owner` in
production). The app connects as `kloudrecon_app`, a normal role, so PostgreSQL Row-Level Security
is enforced exactly as in production. See `docs/decisions/0002-local-app-db-role.md`.

## Troubleshooting

| Problem | Fix |
|---|---|
| Port 5432 already in use | Stop the other PostgreSQL, or change the host port in `docker-compose.dev.yml` and `backend/.env` |
| Web shows "service is not reachable" | The API is not running on :8000 (Vite proxies `/api` to it) |
| `Activate.ps1 cannot be loaded` | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |
| No emails in Mailpit | The worker sends emails; make sure it is running |
| Reports stay "Queued" / fail with a browser error | Start the worker; run `playwright install chromium` in the backend venv |
| AI answers say "standard summary" | Expected with the monthly AI quota used up or when Azure OpenAI is unreachable (graceful fallback) |
| `429 rate_limited` from local scripts | Raise `RATE_LIMIT_DEFAULT` in `backend/.env` |
| `role "kloudrecon_app" does not exist` | The Docker volume predates the init script: `docker compose -f docker-compose.dev.yml down -v` then `up -d` |
