# KloudRecon design system (v3, "Reference")

The look of the product in one page. Decision: `docs/decisions/0044-reference-redesign.md`.
Visual reference: `docs/ui/reference/finpay-reference.png` (style only; none of its brand,
logos or numbers are used). Match notes: `docs/ui/REFERENCE_MATCH.md`. Bug audit:
`docs/ui/UI_AUDIT.md`. Earlier systems: v2 "Survey" (`docs/decisions/0042`, `0043`,
`docs/ui/after-v2/`) and v1 (`0041`, `docs/ui/after/`).

## Current palette and depth (v5 "Altitude", decision 0049)

The sections below describe the structure; the colors are now the Altitude set in
`styles/tokens.css`: midnight indigo ink `#141A3A`, cobalt `#3D4FE0` (dark mode periwinkle
`#7D8FFF`), cyan partner `#0A78B8`, page `#F2F4FB`, amber signal `#C7741A`, "low" severity teal.
Where older text says petrol or teal, read ink and cobalt. The sidebar is a midnight panel in both
themes (`data-theme="dark"` subtree) with a cobalt key (`--key-bg`, `--key-fg`); the desk has a
faint survey grid (`--desk-grid`); headings are weight 650; the eyebrow is sentence case.

## Idea

Calm, premium and minimal: a light gray-teal page, white cards, deep petrol navy ink and one
muted teal accent. Lots of white space, large medium-weight headings, soft wide shadows or none,
and a few quiet diagonal shapes. In the app the data is the hero; marketing pages follow the
reference's section rhythm.

- One accent. Teal marks actions, links, the active nav item, icons, eyebrows, chart lines and
  the featured plan. Severity colors only mean severity.
- Type does the hierarchy: medium-weight headings, small uppercase teal eyebrows above section
  headings, generous line height for body text.
- Depth by surface, not decoration: white on gray-teal, 1px borders in the app, soft wide
  shadows for things that float or overlap.
- Motion is short (150–250ms), happens once, and always has a static final state.

## Where things live

| What | File |
|---|---|
| Colors, radii, shadows, motion timings (light + dark) | `apps/web/src/styles/tokens.css` (the only theme file) |
| Contrast test (110 pairs, both themes) | `apps/web/src/styles/tokens.test.ts` |
| Tailwind mapping, type scale, `.display-1/2/3`, `.eyebrow`, `.lede`, `.kpi-value`, `.surface-card`, `.mk-container`, `.mk-section`, `.hover-lift`, reveal, skeleton, keyframes, global wrap/grid rules | `apps/web/src/styles/index.css` |
| Fonts + metric-matched fallbacks | `apps/web/src/styles/fonts.css`, `public/fonts` (`npm run fonts:sync`) |
| Base components | `apps/web/src/components/ui/*` |
| Marketing blocks: `Eyebrow`, `SectionHeader`, `Diagonals`, `PageIntro` | `apps/web/src/pages/public/marketing.tsx` |
| Count-up, sparkline, delta; score gauge, meters, `LineChart` | `components/charts/primitives.tsx`, `components/charts/charts.tsx` |
| ECharts theme and `softFill()` | `components/charts/theme.ts` |
| Route error screen | `apps/web/src/app/RouteFallbacks.tsx` (`RouteError`) |
| PDF reports (unchanged in v3) | `backend/src/kloudrecon/reports/document.py`, `charts.py` |

Never write a color in a component. Add a token to `tokens.css` (both themes), map it in
`index.css` if it needs a utility, and extend `tokens.test.ts` if it carries text.

## Color

| Token | Light | Dark | Use |
|---|---|---|---|
| `bg` | `#F3F7F8` | `#0B2530` | page (gray-teal / petrol) |
| `surface` · `surface-2` · `surface-3` | `#FFF` · `#EEF4F5` · `#E0EAED` | `#10303D` · `#143845` · `#1A4250` | cards · bento tiles, hover fills · tracks |
| `border` · `border-strong` | `#DDE7EA` · `#C3D2D7` | `#1D4452` · `#2B5765` | dividers · inputs, secondary buttons |
| `text` · `text-muted` · `text-subtle` | `#0B3A4A` · `#46626D` · `#56707B` | `#E6F0F2` · `#A3BCC4` · `#8FA9B2` | petrol ink |
| `brand` (muted teal) | `#247F8B` (white text, 4.69:1) | `#3AA3AF` (dark text) | buttons, active nav, focus, the Pro tile |
| `brand-strong` · `brand-soft` · `brand-tint` | `#1F6F7A` · `#E2F0F2` · `#CFE5E9` | `#6CC5CF` · `#133D48` · `#17505C` | teal text · tints, icon backgrounds · stronger tint |
| `ink` · `ink-fg` | `#0B3A4A` · white | `#E6F0F2` · `#0B2530` | dark buttons ("Scan now"), inverted in dark mode |
| `map-*` | petrol `#0B3A4A`, cards `#114656`, text `#F2F8F9`, muted `#A9C4CB`, teal `#7CC9D2` | `#0F3A48` / `#144655` | petrol bands (How it works, CTA box, auth aside), dark in both themes |
| `shape` · `shape-strong` · `shape-on-brand` | teal at 7% / 11%, white at 8% | teal at 6% / 10% | the diagonal decoration |
| `chart-1…8` | `#2B8A96` teal first, then blue, amber, violet, green, rose, sky, slate | lifted versions | series; `chart-fill` / `chart-fill-end` for the soft fill under a line |
| `seq-1…6` | teal ramp | teal ramp | heatmaps, diagram cost overlay |

Severity (softened): `critical #D14343`, `high #D7702A`, `medium #AB8100`, `low #3D7CC4`,
`info #6B8791`, `success #2F8A5A`. Each has a fill (icons, bars, dots; ≥ 3:1), `-soft` (badge
background) and `-strong` (text; ≥ 4.5:1). Solid critical fills use `text-on-critical`.

Petrol bands use the `map-*` utilities directly (`bg-map-bg text-map-text`, eyebrow
`text-map-brand`, outline button `variant="inverse"`); they no longer switch `data-theme`.
`page-dark:` still exists for things that must follow the page theme (theme toggle icon).

## Type

| Role | Font | Where |
|---|---|---|
| Display + text | Manrope 400–700 (variable) | everything; headings at 500 (marketing) or 500–600 (app) |
| Mono | JetBrains Mono 400–500 | IDs, resource names, code, emails in tables |

Scale: app body 14px (`base`), 15px (`md`), card titles 15px/600, section titles 18px, page
titles 28px/500 tight; KPI values `.kpi-value` (30px/500, tabular). Marketing: H1
`.display-1` 38–64px/500, H2 `.display-2` 28–42px/500, card headings `.display-3` 22–28px/500,
body `.lede` 17px/28px (≤ 58ch), eyebrow `.eyebrow` 12px/600 uppercase 0.1em teal. Numbers use
tabular figures everywhere (`.tabular`, tables, `[data-numeric]`). Long strings wrap
(`overflow-wrap: break-word` on text elements).

## Shape, depth, spacing

- Radii: 6px (`rounded-sm`), 8px buttons and inputs (`rounded-md`), 12px (`rounded-lg`),
  16px cards, tiles and drawers' inner cards (`rounded-xl`), 24px the overlapping feature card,
  the CTA box and dialogs (`rounded-2xl`). Badges are pills.
- Shadows: `--shadow-card` (barely there), `--shadow-md` (menus, hover lift), `--shadow-lg`
  (dialogs, the feature card), `--shadow-float` (hero cards), `--glow-sm` / `--glow` (hover).
  Glass, glow and gradients follow the section "Glass, glow and motion" below (decision 0045).
- App: content max 1440px; 16–32px padding; top bar 64px on the page color; sidebar 256px, white,
  36px items (44px on touch), teal pill for the active item, uppercase 11px section labels.
- Marketing: `.mk-container` (1200px content, 16/24px gutters), `.mk-section` (72px, 112px
  on large screens). Rhythm: gray-teal hero → white body → one petrol band → gray FAQ → white
  CTA box and footer.
- Touch: every control is at least 44px on coarse pointers (`pointer-coarse:` utilities).
- Icons: lucide, 16px in the app (stroke 1.6–1.75), 18px in the sidebar; marketing icons sit in
  `.icon-tile` (48px tile, 24px icon) or `.icon-tile-lg` (56px, 28px) with a tint (`tile-sky`,
  `tile-green`, `tile-amber`). `AzureLogo` (official mark) only for the customer's Azure;
  `SkyCloud` for "cloud" (`components/brand/AzureIcons.tsx`).
- Public header: 72px on desktop, 64px on phones, translucent with backdrop blur.

## Motion

| Token | Value | Use |
|---|---|---|
| `--dur-fast` | 150ms | hover, press, color changes |
| `--dur` | 200ms | dialogs, menus, overlays, card hover lift |
| `--dur-slow` | 250ms | drawers, section reveal on scroll |
| `--ease-out` | `cubic-bezier(0.22, 1, 0.36, 1)` | everything that enters |

Once-only: section fade/slide-in on scroll (`.reveal` inside a `useReveal` root), hero cards
fade up, KPI count-up, gauge fill. Cards with `.hover-lift` rise 2px on hover (pointer devices).
The hero text never animates (it is the LCP element). `prefers-reduced-motion` shows final
states.

## Glass, glow and motion (v3.1, decision 0045)

| Class / token | What it does | Where |
|---|---|---|
| `--grad-brand`, `.btn-brand` | teal → sky gradient | primary buttons, Pro tile, hero risk card, score bar |
| `.text-gradient`, `.text-gradient-number` | petrol → teal → sky text | hero and page-intro H1, big numbers |
| `.aurora` (+ `aurora-dark`, `aurora-app`, `aurora-fade-top`) | drifting teal/sky/violet wash, decorative, no children | hero, intros, petrol bands, CTA, auth aside, app shell |
| `.glass`, `.glass-dark` | translucent surface with backdrop blur | hero card, trial form, Azure chip; step cards on petrol |
| `.glow-card` | teal edge, glow and pointer spotlight on hover | `Card`, `EmptyState`, tiles, plans, FAQ |
| `.hover-lift` | rises 4px with glow | interactive marketing tiles |
| `.rise-in` | 10px rise on mount, transform only | app cards, page headers |
| `.float-a/.float-b`, `.flow-dot`, `.pulse-dot`, `.draw-line` | ambient motion | hero cards, connect tile, critical finding, savings chart |

Rules: glass only over something colorful and never below 66% opacity; nothing with children gets
a permanent covering pseudo-element (axe would stop checking contrast inside it); animate only
`transform` and `opacity` in loops; every loop stops under `prefers-reduced-motion`.

## Components (highlights)

- **Button**: `primary` (teal), `secondary` (bordered white), `outline` (teal border and text:
  "Sign in", plan tiles), `ink` (petrol), `inverse` (outline on petrol bands), `ghost`,
  `subtle`, `danger`, `link`. Marketing buttons carry an `ArrowUpRight` icon.
- **Card**: white, 16px, 1px border, `--shadow-card`. Bento tiles: `bg-surface-2`, no border.
- **KPI card**, **score gauge**, **EmptyState** (compact white card with a teal icon tile;
  `tone="error"` for failures), **Skeleton**, **Command palette**, **Ask KloudRecon**, **Tables**
  (40px rows, hover fill, scroll inside their card on phones) as in v2, restyled by tokens.
- **Charts**: line charts are a teal line over a soft vertical teal gradient (`softFill(t)` for
  ECharts, `LineChart` for SVG); dashed light grid lines; tooltips 12px radius.
- **RouteError**: styled error card for route failures (chunk reload message after deploys).

## Marketing patterns

- Nav: logo left, links centered, outlined "Sign in" + teal "Get started" right, theme toggle.
- Hero: 3-line headline, one sentence, email joined with "Start free trial", "View live demo"
  link, trust checks; right side an HTML/CSS card composition (never screenshots).
- The white feature card overlaps the hero's bottom edge (eyebrow, 2-column header, 3 features
  with thin icons, then reports and AI).
- Bento: stat tile, connect-flow tile, wide chart tile (sample data, labelled).
- Petrol "How it works" band with outlined, fading numerals (a real sequence).
- Stats: true numbers only. Comparison: table from 768px, cards on phones.
- Pricing: light tiles, Pro as the teal tile with diagonal shapes, features on a CSS subgrid.
- FAQ: white accordion cards with chevrons on the gray-teal band. CTA: dark rounded box.
- Public pages are prerendered and hydrated: markup must not depend on the theme or on loaded
  data (render the loading state first; switch theme-specific icons in CSS).

## Checks

- `npm run test -- --run` (includes the token contrast test), `npm run lint`, `npm run typecheck`.
- `npm run build` (includes the prerender and hydration check), then `npm run lighthouse`
  (landing, mobile) and `npm run lighthouse -- / --desktop`.
- `npm run e2e`: axe (WCAG 2.1 AA) in light, dark and on a phone; `layout.spec.ts` (no broken
  images and no sideways scrolling on every route at 375/768/1024/1440/1920); fonts from our
  origin without layout shift.
- Full audit capture: `UI_CAPTURE=1 AUDIT_OUT=../../docs/ui/audit/after npx playwright test
  e2e/capture/audit.spec.ts --project=capture` (optionally `E2E_BASE_URL` for a built copy).
  In Git Bash set `MSYS_NO_PATHCONV=1` when passing paths like `REVIEW_PAGES=/`.
