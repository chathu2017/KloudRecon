# 0041 — UI redesign: calm enterprise look for the marketing site and the app

**Context.** The first UI followed plan Section 14 closely (bright `#1F5EFF` brand, cyan accent,
Inter + Plus Jakarta Sans, a gradient hero, pastel blobs, a grid pattern, eyebrows above every
section, icons in tinted squares and a drawn app mockup). It read as a template rather than a
product for security and finance people. The owner asked for a visual-only redesign: no changes
to API calls, routes, business logic, plans, prices or the meaning of any wording.

**Decision.**
- **One theme file.** `apps/web/src/styles/tokens.css` holds every color, radius and shadow as a
  CSS variable for light and dark (`[data-theme]`). Tailwind utilities map to those variables
  (`styles/index.css`, `@theme inline`); components never use hex values. The only hex outside
  the theme is in standalone outputs that cannot read CSS variables: the diagram exporter
  (`features/diagrams/export.ts`), `public/favicon.svg`, the `theme-color` metas, and the
  server-side PDF/e-mail templates (they copy the light palette).
- **Palette.** Cool slate neutrals (page `#F7F8FA`, surface `#FFFFFF`, border `#E4E7EB`; dark
  `#0E1116` / `#151A21` / `#1C222B`), one accent (`#1F5FBF` light, `#5B9BF5` dark) used only for
  primary buttons, links, active navigation and focus rings. The previous cyan accent is retired
  (`--accent` now aliases the brand). Semantic colors carry meaning only, as a soft background
  with strong text for badges. Dark mode button text is dark (`--brand-fg: #0E1116`) on the
  lighter blue, which passes AA without darkening the accent.
- **Contrast is tested.** `styles/tokens.test.ts` parses `tokens.css` and checks every text/
  background pair (4.5:1) and every fill/chart color against the surface (3:1) in both themes,
  so a future token edit cannot silently break WCAG 2.1 AA. The axe-core E2E audit still runs.
- **Type.** IBM Plex Sans (400/500/600) for everything and IBM Plex Mono (400/500) for numbers,
  IDs and code, self-hosted from `@fontsource` woff2 files copied to `public/fonts`
  (`npm run fonts:sync`), because the CSP is `font-src 'self'`. Only the Latin subset ships.
  The four fonts used above the fold are preloaded, and metric-adjusted local fallback faces
  (`Plex Sans Fallback`, `Plex Mono Fallback`) keep the swap from shifting the layout; an E2E
  test checks for no third-party font requests and a layout-shift score below 0.05. Headings are
  600 with no letter-spacing up to 24px and -0.01em above; KPI values use `.kpi-value` (mono 28px
  tabular).
- **Shape.** 4px grid, 6px radius for cards, inputs and buttons, 4px for badges, 8px for
  screenshots. Borders instead of shadows; shadows only on popovers, menus, sheets and dialogs.
  Icons are lucide at 16px and 1.5–1.75 stroke, muted, never inside a colored square.
- **Logo.** A ring with one swept quadrant (the estate and the scan), two shapes so it still
  reads as a 16px favicon; the ring uses the text color and only the sweep uses the accent. The
  wordmark is plain "KloudRecon" in one color.
- **Marketing site.** Left-aligned hero with a plain H1 (36px mobile, 56px desktop), one
  sentence, two buttons (Start free trial, View live demo) and a trust line; the "How we keep you
  safe" hero button moved to a link in the trust section. Product images are **real screenshots**
  of the seeded Contoso Demo organization (`e2e/capture/marketing-shots.spec.ts` writes
  `src/assets/product/*.png`, light and dark), shown through a `<picture>` that follows the site
  theme, including a manual theme choice. How it works is three numbered steps with a thin line;
  features are alternating text/screenshot rows (security, diagrams, cost, reports) plus a
  smaller AI analyst row; the comparison table has a legend caption and no tinted column;
  pricing cards share rows through CSS subgrid so features and buttons line up, with Pro marked
  by a 1.5px accent border and a small in-card "Most popular" label; the FAQ is a two-column
  layout with chevron disclosure; the final call to action is a neutral band with one sentence
  and one button (its secondary sentence was dropped to meet the one-sentence rule). The footer
  has four columns: Product, Security, Company, Legal. Only the Security page keeps an eyebrow.
- **App.** Content max width 1440px; compact 52px top bar and 32px sidebar items with a 2px
  accent bar for the active item; compact KPI cards; one-line empty states; the owner
  overview's approval queue shrinks to its content; system health shows healthy workers and
  collapses stale heartbeats under "Show N stale workers" with mono IDs and a status dot plus
  text. Severity chips on diagrams use soft/strong pairs (critical keeps a solid fill with
  `--on-critical` text) so they pass contrast in dark mode.
- **Reports and charts.** PDF reports embed IBM Plex as data URIs (`reports/assets/fonts`, SIL
  OFL 1.1), so the print view's CSP gains `font-src data:` and nothing loads from the network. The
  cover gradient band is gone; headings, tables, badges and chart colors use the same palette as
  the app. ECharts uses Plex with mono axis labels; the diagram renderer bundle was rebuilt so
  PDF diagrams use the new tokens. The default report accent (non-white-label) is `#1F5FBF`.

**Consequences.** Customers' own white-label colors are unchanged. `docs/ui/DESIGN_SYSTEM.md`
describes how to use the tokens and components. Screenshots from before and after the redesign
are in `docs/ui/before` and `docs/ui/after` (`e2e/capture/ui-screens.spec.ts` regenerates them).
Plan Section 14's palette values are superseded by this decision; the plan's principles
(accessibility, light/dark, responsive, calm density) still apply.
