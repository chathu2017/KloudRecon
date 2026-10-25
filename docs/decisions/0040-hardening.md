# 0040 — Hardening: accessibility tokens, E2E suite, performance budget, org deletion

**Context.** Phase 5 step 8: security review (Section 15) with redaction tests, dashboard API
P95 < 300 ms on demo data, an accessibility pass, and Playwright E2E for the full journey.

**Decision.**
- **Accessibility (WCAG 2.1 AA).** An axe-core audit (`apps/web/e2e/a11y.spec.ts`, light and dark,
  public + customer + owner pages; serious/critical violations fail) found mostly contrast
  problems caused by a few tokens. The plan's hues stay for fills, icons and charts; a
  `*-strong` token family (`brand-strong`, `critical-strong`, `high-strong`, `medium-strong`,
  `success-strong`, `info-strong`) is used for text on tinted and page backgrounds (≥ 4.5:1),
  `--text-subtle` is darker, `--brand-soft` (light) is lighter, and the dark-mode brand fill is
  `#3566EE` so white button text passes. Structural fixes: the approvals tab list points at a
  real tab panel, the inventory grid header is presentational and its scroll region focusable,
  the email template list is a nav of buttons. The diagram canvas is excluded from axe (it is an
  interactive graphic with its own keyboard model and exports).
- **E2E** (`apps/web/e2e`, `@playwright/test`): runs against the real local stack with Demo
  Mode (`npm run e2e`; Vite is started when needed and ignores `e2e/` output so traces do not
  reload pages). Journeys: sign-up → pending → owner approval → welcome email in Mailpit → app;
  the demo tour through every module including the AI chat and a PDF download; alerts to a local
  signed webhook (signature verified in the test); plan gating; owner announcements, health,
  business, feature flag and the read-only org view; accessibility; phone layout (no sideways
  scrolling, navigation). It is not part of GitHub CI (it needs the stack and seeded data); run
  it before a release (runbook).
- **Performance.** `scripts/perf_check.py` measures P50/P95 of 22 dashboard endpoints as the demo
  admin and fails above the budget. All are under 300 ms P95 on a single `uvicorn` process
  (production runs three gunicorn workers); no extra caching was needed.
- **Organization deletion** (was missing; plan 9.12 and Section 15): `DELETE /api/v1/org?confirm=
  <name>` (Org Owner; allowed even when read-only) deletes every stored secret at once, suspends
  the org, tells the platform owner and queues `maintenance.org_purge`, which removes Blob files
  under `<org_id>/` and the organization row (cascading to all tenant tables; logs and jobs are
  cleared explicitly). A platform audit entry without org records request and purge.
- **Public "View live demo"** (plan Section 17; deferred in decision 0020, missing until now):
  `POST /api/v1/public/demo/session` returns a 2-hour HS256 token (issuer `kloudrecon-demo`,
  signed with the platform signing key) for the demo organization's **Viewer**. The API refuses
  every write for that issuer (`demo_read_only`), so the demo cannot run scans, use the AI chat or
  change anything. Shown on the landing page when `DEMO_MODE=true`, the `public_demo` flag is on
  and the demo org exists. The SPA uses a `DemoAuthAdapter` for that tab (sessionStorage).
- **Race-safe defaults.** Default alert rules are inserted with `ON CONFLICT DO NOTHING` on a new
  unique `(org_id, name)` (migration 0013, duplicates removed first).
- **Rate limiting was not active.** slowapi's middleware looks routes up in `app.routes`, which no
  longer contains FastAPI's included-router routes, so every request was exempt. It is replaced
  by `core/ratelimit.py` (ASGI middleware on the same `limits` library): per client IP and per
  bearer token, health checks exempt, `Retry-After` on 429. The client IP comes from
  `X-Forwarded-For` only when the peer is the local proxy; audit logs use the same rule (they
  trusted the header from anyone before).
- **CORS** now allows the `X-KloudRecon-View-As` header (production calls the API cross-origin;
  locally Vite proxies same-origin, which hid the gap).
- **Redaction** also masks `key=value` secrets in free text, Stripe/Paddle keys, `whsec_` signing
  secrets and Slack/Teams webhook URLs (tests in `test_core.py`).
- Residual risks are listed in `docs/security-review.md`.
