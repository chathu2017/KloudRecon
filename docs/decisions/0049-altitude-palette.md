# 0049 — "Altitude" palette and stronger depth (v5)

Date: 2026-10-04

## Context

The owner asked for a better color combination for text and surfaces and a more modern,
professional 3D look on the whole site: marketing pages, the workspace (`/app`) and the Control
Center (`/owner`), without touching how anything works.

## Decision

Visual only, through `styles/tokens.css` and the shared classes, so every page follows.

- **Palette.** Petrol and muted teal are replaced by midnight indigo ink (`#141A3A`), one cobalt
  blue accent (`#3D4FE0`; periwinkle `#7D8FFF` in dark mode) with a cyan partner in gradients
  (`#0A78B8`), on a periwinkle-gray page (`#F2F4FB`) with white cards. Warm amber stays the
  sparing signal color. "Low" severity moved from blue to teal so it never reads as the brand.
  Charts, the sequential ramp and diagram tokens follow. All 114 contrast pairs pass in both themes.
- **Depth.** Every shadow is tinted with the ink. Slabs have a thicker lower edge and a close
  contact shadow under a wide ambient one (`--raise`); keys have a 3px lower edge and a shine
  (`--key-shine`) and travel 3px when pressed. The desk carries a faint survey grid that fades out
  down the page (`--desk-grid`, a background layer of `.app-desk`).
- **Sidebar.** A midnight panel in both themes: the sidebar subtree carries `data-theme="dark"`
  and reads the dark tokens. The current page is a cobalt key with white text in both themes
  (`--key-bg`, `--key-fg`, `--key-lower`).
- **Text.** Headings are weight 650 with tighter tracking, page titles bold, KPI values 650.
  The eyebrow label is sentence case without tracking.
- **Outside the web app.** PDF reports, report charts and emails use the same palette; the default
  report color is `#3D4FE0`. Favicon and `theme-color` follow.

## Consequences

- White-label reports with a saved custom color are unchanged; only the default changed.
- Checked on a separate preview database (dev sign-in, demo data): axe (light and dark), the
  layout spec at five widths, and the demo, onboarding and owner journeys.
