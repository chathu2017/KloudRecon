# KloudRecon security review (Phase 5, step 8)

Review of plan Section 15 against the code at the end of Phase 5. Each control lists where it
lives and what verifies it. Re-run this review before major releases.

## Controls

| Control (plan) | Implementation | Verified by |
|---|---|---|
| Customer secrets only in Key Vault, write-only | `services/connections.py` stores the client secret in the SecretStore; the DB keeps the secret name; responses never include it | `test_connections.py` secret-leak tests |
| Webhook URLs through SecretStore too | `services/alerts.py` stores URL + signing secret as one secret; DB keeps the host only | `test_alerts.py::test_integration_url_is_a_secret` |
| Billing provider keys never in env | `cli billing-secret` → SecretStore (`billing-*` names) | decision 0038 |
| Platform signing key (report links, view-as grants) | random 256-bit key created in the SecretStore on first use (`core/signing.py`) | `test_reports.py`, `test_platform.py` |
| PostgreSQL: socket, peer auth, two roles | `deploy/postgres/*`, infra guide C4 | manual (go-live checklist) |
| RLS forced on every org table | migrations ENABLE + FORCE RLS; `RLS_TABLES` | `test_finops.py::test_every_org_table_enforces_rls`, `test_rls_and_queue.py` |
| Tenant isolation | explicit `org_id` filters + RLS | `test_access_gate.py` (every route), module tests per org |
| Access gate / owner-only | `require_active_user`, `require_platform_owner` | `test_access_gate.py` enumerates every OpenAPI route |
| Read-only states (billing) | PlanGuard in the access gate (`org_read_only`) | `test_billing.py` |
| JWT validation | issuer, audience, signature (cached JWKS), expiry (`core/security.py`); dev auth refused in production | `test_auth.py` |
| CORS allow-list | `CORS_ALLOWED_ORIGINS`; custom headers listed explicitly | `test_hardening.py::test_cors_preflight_allows_the_view_as_header` |
| Rate limits | `core/ratelimit.py`: `RATE_LIMIT_DEFAULT` per client IP (X-Forwarded-For trusted only from the local proxy) and per bearer token; health checks exempt; 429 with `Retry-After` | `test_hardening.py` |
| Security headers, body limit | Caddy (HSTS, nosniff, referrer policy, 10 MB), SWA config (CSP, frame-ancestors none), report print route CSP `default-src 'none'` | `deploy/caddy/Caddyfile`, `staticwebapp.config.json`, `test_reports.py` |
| Input validation, output encoding | Pydantic models on every body; HTML emails and reports escape all values; email template overrides are plain text | `test_reports.py` escaping tests, `test_platform.py` |
| No stack traces to clients | error envelope handler (`core/errors.py`) | `test_core.py` |
| SSRF (webhooks) | https only, public addresses only (checked on save and before every delivery), no redirects, Teams/Slack host allow-lists, 10 s timeout | `test_alerts.py::test_webhook_urls_are_validated` |
| Signed outbound webhooks | HMAC-SHA256 over `t.body`, 5-minute tolerance (`alerts.verify_signature`) | `test_alerts.py`, E2E `owner-and-alerts.spec.ts` |
| Signed inbound billing webhooks | Stripe/Paddle signatures, replay window, idempotent by event id | `test_billing.py` |
| AI: prompt injection, grounding | untrusted-text sanitizer, data blocks, number grounding, ref/link allow-lists, read-only tools, redaction | `test_ai_guardrails.py`, `test_ai.py` |
| Audit logs for sensitive actions | connections, secrets, roles, approvals, exports, exceptions, report downloads, integrations, billing, owner actions, read-only org views, org deletion | `audit.record(...)` call sites; tests assert key entries |
| Owner read-only customer view | signed 30-min grant bound to the owner, all writes refused, audited in the customer's log | `test_platform.py` |
| Data deletion | connection deletion removes the secret and cascades data; org deletion removes secrets at once and purges files + rows in the worker | `test_hardening.py` |
| Log redaction | structlog processor: sensitive keys and token-like values (JWT, bearer, SAS, AccountKey, URL passwords, `key=value` secrets, Stripe/Paddle keys, `whsec_`, Slack/Teams webhook URLs) | `test_core.py::test_redact_value_masks_tokens` |
| Dependency scanning | `pip-audit`, `npm audit` in CI; Dependabot, CodeQL and secret scanning are GitHub settings (infra guide D1) | CI |
| Terms / Privacy / DPA | public pages state metadata-only collection | `pages/public/LegalPages.tsx` |

## Residual risks and follow-ups

1. **DNS rebinding window for webhooks.** The host is resolved and checked right before each
   delivery, but httpx resolves again when connecting. An attacker controlling DNS could switch
   to a private address in that window. Mitigations: Teams/Slack are allow-listed Microsoft/Slack
   hosts; generic webhooks are a Pro feature for approved customers; the VM's NSG blocks nothing
   outbound, so consider an egress proxy if generic webhooks are opened widely.
2. **Rate limits are per process** (in-memory windows); with three gunicorn workers the
   effective ceiling is up to three times the setting. Keep Caddy as the only ingress (NSG
   allows 443/80 only) so the forwarded client address can be trusted.
3. **Owner view grants** are bearer-style for 30 minutes inside the owner's browser tab
   (sessionStorage). They are bound to the owner's user id, so a leaked grant is useless without
   the owner's own token.
4. **Email template overrides** allow owner-written plain text in customer emails; only the
   platform owner can edit them and every change is audited.
5. **Public live demo** (`DEMO_MODE=true` + flag `public_demo`): anyone can open a 2-hour read-only
   session into the synthetic Contoso Demo organization; every write is refused for demo tokens
   (`test_hardening.py::test_public_demo_session_is_read_only`). Turn the flag off to hide it.
6. **E2E suite** runs against the local stack, not in GitHub CI; run `npm run e2e` before each
   release (see `docs/runbooks/owner.md`).
