# KloudRecon user guide

*KloudRecon for Azure by KloudSchool — Recon your Azure. Secure it. Optimize it.*

KloudRecon connects to Azure **read-only** and shows, in one place, what you have, how secure it
is, what it costs, how reliable it is and what to fix first. It never changes anything in your
Azure environment and never reads data-plane content (no secrets, keys, files or database rows).

## 1. Getting started

Want to look around first? **View live demo** on the home page opens a read-only tour of a
sample company with synthetic data — no sign-up needed.

1. **Sign up** at https://app.azurerec.kloudschool.com with your work email, verify it and set up
   MFA.
2. **Complete your profile** (company, role, what you want to achieve). Your account is then
   reviewed by KloudSchool — you see *Your account is under review* and get an email when it is
   approved (usually within one business day).
3. **Connect Azure**: Settings → Connections → *Add connection*. The wizard shows two ways to
   create a read-only app registration (Azure portal steps or one Cloud Shell command). Paste the
   **Directory (tenant) ID**, **Application (client) ID** and the client secret **Value** (not the
   Secret ID), then *Save & validate*.
   - **Core (required):** the *Reader* role on the subscriptions or a management group.
   - **Identity (optional):** Microsoft Graph application permissions for Entra ID posture.
   - **Commitments (optional):** Reservations Reader for reservation and savings plan use.
   The checklist tells you exactly what works and what is missing. The first scan starts
   automatically; you can follow it live.
4. The secret is stored in Azure Key Vault and never shown again (only its expiry). You get
   reminders 30, 14, 7 and 1 days before it expires — use *Replace secret*.

## 2. Everyday use

| Where | What for |
|---|---|
| **Overview** | KloudRecon Score (A–E) and pillar scores, cost this month and forecast, potential savings, top risks and savings, the AI executive summary, what changed |
| **Inventory** | Every resource with filters, tags, cost and findings; the resource drawer; orphaned and unused resources; CSV/Excel export; Ctrl/Cmd+K search |
| **Changes** | Added/removed/modified resources and who did it (Activity Log); risky changes highlighted; compare two scans |
| **Diagrams** | Seven architecture views (network, hub-and-spoke, resource group, application, data flow, region, hierarchy) with official Azure icons; overlays for security, attack paths, cost, findings and changes; exports to PNG, SVG, PDF and draw.io; the architecture document |
| **Security** | Findings ranked by risk, attack paths, internet exposure, identity (RBAC and Entra ID), vulnerabilities, threat signals, coverage, compliance frameworks |
| **Reliability / Governance** | Well-Architected checks, retirements and quotas; required tags, naming, allowed regions and SKUs, policy compliance |
| **Cost & FinOps** | Cost explorer, forecast and budgets, anomalies with root cause, rightsizing, waste, commitments, what-if, showback, savings tracker |
| **Recommendations** | One prioritized backlog (impact × confidence ÷ effort) as a table or Kanban board; copy as a Jira/Azure DevOps ticket |
| **Server health** | Health checks of Windows and Linux servers from a read-only script you run on the server and paste in: disks, memory, patches, vulnerabilities, errors, security settings; Word report per server or for all |
| **Reports** | Seven PDF reports (see below) and the audit report as an editable Word document, on demand or scheduled |

**Scans** run daily at the hour you choose (Settings → Connections) and on demand with **Scan
now** (once per 15 minutes per connection). The clock icon in the top bar shows the product **as
of an earlier scan** (time machine).

### Working findings
Open a finding to see why it matters, the evidence, and how to fix it (portal, Azure CLI,
PowerShell, Bicep, Terraform), plus an Azure Policy to prevent it coming back and an AI remediation
guide. Assign it, set a due date, comment, or request an **exception** (reason, approver, expiry).
Findings resolve automatically when a later scan no longer sees the problem.

### Ask KloudRecon (AI)
Press **Ask KloudRecon** (or Ctrl+J) and ask in plain language: *"Why is our bill higher this
month?"*, *"Which resources are exposed to the internet?"*, *"What should we fix first?"*. Answers
come only from your scan data and cite the findings and resources they use (click the small
labels). The AI cannot change anything. AI summaries on the Overview, attack paths, finding and
architecture pages work the same way. Admins can hide names and IP addresses from the AI in
**Settings → AI**; AI messages count against your plan's monthly quota.

## 3. Reports

| Report | For |
|---|---|
| Executive one-pager | Leadership: score, top risks, spend and savings on one page |
| Full assessment | Consultants and IT: every chapter |
| Security & attack paths | Security teams: exposure, attack paths, fix plan, vulnerabilities |
| Compliance audit pack | Audit/GRC: controls **mapped** to one framework with evidence (KloudRecon maps controls; it does not certify) |
| FinOps | Finance: trend, forecast, anomalies, rightsizing, waste, commitments, showback |
| Architecture document | Architects: diagrams, address plan, components, Well-Architected review |
| Changes report | Operations: what changed, who changed it, which changes are risky |

Download links are valid for 15 minutes. On Pro and Enterprise, **Settings → Report branding**
adds your logo, colour and "Prepared by" (white-label) and **Reports → Schedules** emails a report
weekly or monthly to members of your organization.

## 4. Alerts

**Settings → Alerts** decides who hears about new critical risks, new attack paths, risky changes,
cost anomalies, budgets forecast to be exceeded, failed scans and expiring secrets — in the app,
by email, or (Pro+) in **Microsoft Teams**, **Slack** or your own **signed webhook**. Webhook
requests carry `X-KloudRecon-Signature: t=<unix>,v1=<HMAC-SHA256 of "t.body">` computed with the
signing secret shown when you add the channel; reject requests older than 5 minutes. Use *Test*
to check a channel and the *Delivery log* to see what was sent.

## 5. Team and roles

Settings → Team: invite colleagues (the invitation link is valid for 7 days).

| Role | Can |
|---|---|
| Owner | Everything, including billing and deleting the organization |
| Admin | Connections, settings, team, alerts, branding |
| Member | View everything, run scans, work findings and recommendations, create reports |
| Viewer | Read-only |

## 6. Plans and billing

**Settings → Billing & plan** shows your plan, what you use against its limits, and the other
plans. During a trial a banner counts down the days. If a trial ends or a payment stays overdue
after the grace period, the organization becomes **read-only**: everything stays visible, but new
scans, AI answers, reports and changes are paused until a plan is active again. Nothing is
deleted.

## 7. Your data

- KloudRecon stores metadata, configuration, metrics and cost only. Client secrets and webhook
  URLs live in Azure Key Vault.
- Deleting a connection deletes its secret and its data.
- **Delete organization** (Owner, Settings → Billing & plan → Danger zone) deletes every stored
  secret immediately, signs everyone out and purges all data and files.
- Settings → Audit log (Admins) shows who did what, including any read-only support view by
  KloudSchool.
