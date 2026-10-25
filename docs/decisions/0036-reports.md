# 0036 — PDF reports: server-rendered HTML, Playwright, signed links

**Context.** Plan 9.10: 7 report types, a token-protected A4 print route, Playwright rendering
in the worker, branding / white-label, 15-minute download links and scheduled email delivery.

**Decision.**
- **HTML is built on the server** (`reports/document.py` + `reports/content.py`) from the same
  services as the UI, with SVG charts drawn in Python (`reports/charts.py`). No dependency on the
  web app being deployed or reachable from the VM; the page is self-contained (inline CSS, data
  URIs), and Playwright loads it with `set_content`, blocks every network request and waits for
  `window.__reportReady` before `page.pdf(A4)` with a "page X of Y" footer.
- **Diagram figures** in the architecture chapters use the app's own scene + ELK layout + SVG
  export code, bundled into `backend/src/kloudrecon/reports/assets/diagram-renderer.js`
  (`npm run build:renderer` in `apps/web`, committed because deployments do not build the web
  app on the VM). When the bundle is missing, reports keep their tables.
- **Print route**: `GET /api/v1/public/reports/{id}/print?token=` returns the stored HTML with a
  strict CSP (`default-src 'none'`, inline styles/scripts only, `frame-ancestors 'none'`).
  **Download**: `GET /api/v1/public/reports/{id}/download?token=` streams the PDF from Blob. Both
  sit under `/public/` because the signed token is the authorization (the storage account is
  VNet-restricted, so browsers cannot use Blob SAS links). `POST /reports/{id}/link` issues a
  token valid for `REPORT_LINK_MINUTES` (15) and writes an audit entry.
- **Signing key**: a random 256-bit platform secret created on first use in the SecretStore
  (`platform-signing-key`, Key Vault in production) — no secret in the env file.
- **Branding**: company name for everyone; logo (PNG/JPEG ≤ 512 KB, magic bytes checked, stored in
  Blob `branding/`), accent colour (`#RRGGBB` only, it is injected into CSS) and "Prepared by" are
  white-label features (Pro+). Setting "Prepared by" removes the KloudRecon mark from the cover.
  Trial reports carry a "TRIAL" watermark (`reports_watermark` feature).
- **Schedules** (Pro+ `scheduled_reports`): weekly (weekday) or monthly (day 1–28) at an hour
  UTC; recipients must be active members of the organization (no mail relay to outsiders). The
  scheduler tick queues due reports; the worker emails the PDF as an attachment (≤ 9 MB, else a
  link to Reports).
- **Tests** run with `REPORT_RENDERER=minipdf` (text-only PDF, no browser); local and production
  use Playwright's Chromium (`playwright install chromium`, infra guide C8).
