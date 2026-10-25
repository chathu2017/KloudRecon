# 0043 — UI v2 design system, motion and marketing performance

**Context.** Decision 0042 chose the "Survey" direction. This records how it became the design
system, what changed in the app and marketing site, and the performance work needed to keep the
richer landing page fast (target: Lighthouse Performance ≥ 90, Accessibility ≥ 95).

**Decision.**

- **One theme file.** `apps/web/src/styles/tokens.css` is rewritten for Survey: cool paper
  neutrals (`#F3F6F5`, white cards, navy ink `#0B1A28`), signal teal brand (`#0A7A70`; dark
  `#3ED3C0` with dark text), beacon amber accent (`#C27A0E` / `#F2B04A`), severity hues kept apart
  from both, layered navy dark theme (`#08131D` → `#0E1B28` → `#132433`, never black), a chart
  palette ordered warm/cool for color-vision deficiencies, and `--map-*` tokens for the always-dark
  "map" bands (header, hero, trust band, final call to action, footer). Depth comes from a faint
  top highlight (`--highlight`) plus soft card shadows; floating things use `--shadow-md/lg`.
  `tokens.test.ts` checks 98 contrast pairs in both themes (all ≥ 4.5:1 for text, ≥ 3:1 for
  fills and the map route).
- **Locally dark bands.** The map bands set `data-theme="dark"` on their own subtree, so every
  component inside (buttons, links, focus rings) uses the dark tokens automatically and stays AA in
  both page themes. A `page-dark:` variant (keyed to `<html>` only) exists for the few places that
  must follow the page theme rather than the nearest band.
- **Type.** Bricolage Grotesque (display, optical sizing), Instrument Sans (text), JetBrains
  Mono (numbers, IDs). Self-hosted variable woff2 (`npm run fonts:sync`), display and text faces
  preloaded, metric-matched fallbacks computed from the font tables (no layout shift). Marketing:
  H1 40–72px (`.display-1`), H2 32–44px (`.display-2`), body 18px (`.lede`, ≤ 62ch). App: page
  title 28px, section title 18px, body 14px, KPI values 32px mono tabular (`.kpi-value`).
- **Motion.** Durations 150/200/250ms with `--ease-out`; dialogs zoom in, drawers slide in,
  menus and tooltips fade; KPI values count up once (`CountUp`); the hero route draws itself once;
  marketing sections reveal once on scroll (`useReveal`, already-visible content never re-hides).
  Everything shows its final state under `prefers-reduced-motion`.
- **App.** New primitives in `components/charts/primitives.tsx` (`CountUp`, `MiniSparkline`,
  `Delta`); the KloudRecon Score is a 270° instrument gauge with ticks; the Overview leads with the
  score and six security KPIs, then top risks beside the score trend and a severity breakdown,
  the AI summary, cost and the estate. Sparklines only where real per-scan history exists
  (resources, score). Designed empty and error states (`EmptyState tone="error"`), shimmer
  skeletons, a launcher-style command palette with key hints, and an assistant-style chat panel
  with styled citations. Fixed on the way: chat Markdown no longer italicizes parts of IDs such
  as `sam_contractor_partner…`, and the executive summary no longer overflows phones on long IDs.
- **Marketing.** Real screenshots of the demo organization in WebP (`npm run images`: full size
  plus a 720px variant, 20 files, ~735 KB total, the hero image 68 KB), a generated contour map
  (`docs/ui/directions/contours.py` → `pages/public/contours.ts`), the attack path as a surveyed
  route, varied feature layouts, a navy trust band, and a featured Pro card on the map field.
- **Prerendered marketing pages.** A client-rendered page paints nothing until ~330 KB of
  JavaScript has loaded, which capped the mobile Lighthouse score around 70 regardless of design.
  `scripts/prerender.mjs` (run by `npm run build`) snapshots `/`, `/pricing` and `/security` from
  the built bundle with headless Chromium, holding API calls open so the snapshot is exactly the
  client's first render. React then **hydrates** it (`src/main.tsx`) instead of replacing it: no
  repaint, no layout shift, no replayed intro animation. On those pages `public/boot.js` starts
  the bundle only after the first contentful paint and the load event, so JavaScript never
  competes with what the visitor sees first; links work before then, and JS-driven controls (the
  mobile menu, the demo button) become active moments later. `dist/app.html` is the untouched
  shell and the navigation fallback for app routes (`staticwebapp.config.json`), so app pages
  never show marketing markup. The deploy workflow installs Chromium and sets
  `PRERENDER=required`; elsewhere the step is skipped with a warning when Chromium is missing
  (the site then simply paints later). To keep hydration valid, public-page markup must not
  depend on the theme or on loaded data in JavaScript: theme-specific images and icons switch in
  CSS (`ProductShot`, `ThemeToggle`), and the demo button is shown while its availability loads.
- **Other performance work.** The app and owner shells are lazy-loaded (not in the public
  bundle); Radix is no longer forced into one chunk; CSS `blur()` and `backdrop-filter` were
  removed from marketing surfaces (costly in software rasterization); the hero image has
  `fetchpriority="high"`, explicit size and a phone-sized variant. `npm run lighthouse` runs the
  audit against the production build.

**Consequences.** New public-page content must render the same markup before and after data
loads (or accept a small hydration fix-up). After UI changes that show in marketing images:
capture (`e2e/capture/marketing-shots.spec.ts`) and `npm run images`. After changing the contour
generator: regenerate `contours.ts`. Visual review uses the production build
(`E2E_BASE_URL=http://localhost:4173`, decision 0032) because it matches what ships.
