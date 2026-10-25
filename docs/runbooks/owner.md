# Owner runbook (platform operations)

For the KloudSchool platform owner. Infrastructure and first deployment: `docs/02_KLOUDRECON_INFRA_AND_DEPLOYMENT.md`
(the "infra guide"). Restore: `docs/runbooks/restore.md`. Go-live: `docs/runbooks/deployment-checklist.md`.

## Daily (5 minutes)

1. **Owner → Approvals**: approve (plan + trial days) or reject (with a reason) new sign-ups. You
   get an in-app and email notification for each one.
2. **Owner → System health**: queued/dead jobs, worker heartbeat (must be *Healthy*), failed scans,
   Azure 429s, AI errors. Retry dead jobs after fixing the cause.
3. Azure Monitor alerts from infra guide A12 page you for API down, worker stopped, disk, memory,
   dead jobs and backup failures — act on those first.

## Weekly

- **Owner → Business**: MRR, trials ending within 7 days (reach out), conversion, churn, AI cost
  per organization (compare with the plan's AI quota).
- `systemctl list-timers | grep kloudrecon` and `journalctl -u kloudrecon-backup -n 20` on the VM:
  the nightly database dump ran; spot-check `db-backups/` in Blob.
- Review **Owner → Audit log** for unusual owner or admin actions.

## Monthly

- VM maintenance window (infra guide E4): `sudo apt update && sudo apt -y upgrade && sudo reboot`.
- **Retirement catalog**: add announced Azure retirements; mark dates *verified* only after
  checking the official announcement.
- Review Dependabot/CodeQL alerts in GitHub; merge updates through CI.
- Quarterly: test a database restore (`docs/runbooks/restore.md`).

## Common tasks

| Task | How |
|---|---|
| Change a customer's plan / extend a trial | Owner → Organizations → the org → Plan and trial end → Save. Clearing the trial end marks a manually billed customer as paid. |
| Convert a trial on manual billing | Assign the paid plan and clear the trial end date (recorded as a conversion) |
| Enterprise with a custom price | Set the plan to Enterprise; set `settings.billing.mrr` for the org if MRR should include it |
| Suspend / reactivate an organization | Owner → Organizations → Suspend / Reactivate (audited) |
| Look at what a customer sees | Organization → **View as organization** (30 minutes, read-only, written to the customer's audit log). Exit with the banner button. |
| Maintenance notice | Owner → Announcements → New (level, time window); customers see a dismissible banner |
| Turn a feature off | Owner → Feature flags (e.g. `ai_chat`); optionally limit to listed organization IDs |
| Adjust an email | Owner → Email templates: plain-text subject and intro; preview before saving |
| Edit plans and limits | Owner → Plans (limits JSON, features JSON, Stripe/Paddle price IDs) |
| Retry a failed background job | Owner → System health → Dead jobs → Retry |
| A customer deleted their organization | Nothing to do: secrets were removed at once, the worker purges the data; the platform audit log keeps "org.deletion_requested" and "org.purged" |

## Billing providers

`BILLING_PROVIDER=manual` (default): you assign plans and invoice outside KloudRecon; customers
use *Request* on a plan (you get a notification).

Switching to Stripe or Paddle:
1. Create products/prices in the provider; put the price IDs on the plans (Owner → Plans).
2. On the VM, as the service user: `sudo -u kloudrecon /opt/kloudrecon/current/backend/.venv/bin/python -m kloudrecon.cli billing-secret stripe-api-key`
   and `... stripe-webhook-secret` (values go to Key Vault; the env file needs
   `KLOUDRECON_ENV_FILE=/etc/kloudrecon/kloudrecon.env` in the environment for CLI use).
3. In the provider, add the webhook endpoint
   `https://api.azurerec.kloudschool.com/api/v1/public/billing/stripe/webhook` (or `/paddle/`) for
   subscription and invoice/transaction events.
4. Set `BILLING_PROVIDER=stripe` in `/etc/kloudrecon/kloudrecon.env` and restart the API and
   worker (`sudo systemctl restart kloudrecon-api kloudrecon-worker`).
Failed payments give `BILLING_GRACE_DAYS` (7) of full access, then read-only.

## AI

- Production uses `AI_MODE=azure` with the VM's managed identity (infra guide A7/A10).
- If Azure OpenAI is unavailable or rate-limited, customers get the grounded standard summaries
  (labelled *Standard*) and chat returns a friendly error; nothing breaks.
- Token prices for cost tracking: `AI_PRICE_*` settings.

## Before each release

On a developer PC with the stack running and the demo seeded:

```powershell
cd apps\web; npm run e2e
cd ..\..\backend; .\.venv\Scripts\python.exe ..\scripts\perf_check.py
```

Then push to `main`; CI runs; approve the deployment (infra guide E1). Rollback: infra guide E2.

## Incident quick reference

| Symptom | First checks |
|---|---|
| Site up, API errors | `systemctl status kloudrecon-api`, `journalctl -u kloudrecon-api -n 100` |
| Scans stuck in *Queued* | Worker heartbeat on System health; `systemctl status kloudrecon-worker` |
| Many *Throttled* scans | Azure 429s on System health; scans retry automatically with backoff |
| Emails missing | ACS domain verification; dead `notify.email` jobs |
| PDF reports fail | `playwright install chromium` done (infra guide C8)? `PLAYWRIGHT_BROWSERS_PATH` set? |
| Webhooks failing for one customer | Their integration shows *Failed* with the HTTP code in Settings → Alerts → Channels |
| Disk filling up | `df -h`; scan retention runs daily; old `cost_daily` partitions older than 13 months are dropped |

More in infra guide E6.
