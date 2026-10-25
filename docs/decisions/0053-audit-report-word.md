# 0053 — Audit report as a Word document

Date: 2026-10-04

## Context

The seven reports are PDFs. The owner asked for one complete audit document that a customer can
edit, sign and hand to management or an auditor: a branded cover, an approval page, contents, a
summary, general information, all findings, recommendations and, after them, a financial summary.
The request said ".doc"; the old binary format is not practical to generate.

## Decision

An eighth report type, `audit` ("Azure Audit Report"), delivered as `.docx`. The PDF reports are
unchanged.

- **One content model, two renderers.** `ReportDoc` now records every block as data
  (`Section.blocks`) next to its HTML. `reports/word.py` writes Word from the blocks, so the audit
  report reuses the PDF builders and the numbers always agree. `reports/audit.py` adds what an
  audit document needs.
- **Layout.** Page 1: full-page cover in the style of the sign-in artwork (midnight field, radar
  rings), with the report name, organisation, date, data date and scope, rendered by the browser
  as a picture placed behind the page. Page 2: document control and approval (prepared by,
  reviewed by, report approved by: name, signature, date), distribution list and a
  confidentiality statement. Page 3: contents (a Word TOC field; its cached result lists the
  sections, Word fills in page numbers on update). Then: executive summary, general information,
  environment overview, security findings, compliance, reliability and governance, cost analysis,
  recommendations, financial summary, appendices (findings register, inventory, scope and method,
  glossary). Header and footer ("Confidential", page X of Y) on every page except the cover.
- **Approval names** are optional fields of the request (`prepared_by`, `reviewed_by`,
  `approved_by`); empty ones print as blank lines.
- **One savings figure.** The executive summary, cost analysis, recommendations and financial
  summary all quote `audit.identified_savings()`: the best saving per resource, by category, the
  same rule as the recommendations headline.
- **Pictures.** Charts and diagrams are screenshots of the report's HTML figures
  (`render.capture_images`). Without a browser (`REPORT_RENDERER=minipdf`, tests) the document has
  a text cover and figure captions only.
- **No migration.** The format follows from the type (`Report.format`); the file is stored as
  `<org>/<report>.docx` and downloaded through the same signed link.
- **Dependency.** `python-docx` (MIT) with `lxml`, approved by the owner.
- White-label and the trial watermark follow the existing rules (logo and colour on the cover on
  Pro; "TRIAL" on the cover and in the header).

## Consequences

- The cover text is part of the picture and cannot be edited in Word; everything else can.
- `Report.pages` is empty for Word documents (Word lays out the pages).
- Fonts: the body uses Segoe UI (falls back to the reader's default sans on other systems).
- Checked by opening the generated demo report in Word 16: 39 pages, contents updated, cover
  full-bleed, tables readable.
