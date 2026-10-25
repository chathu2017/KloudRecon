# 0044 — Reference-based redesign (v3) and full UI bug audit

**Context.** The owner asked for a clean, modern, minimal and fully responsive redesign of the
marketing site, customer app, owner console and public demo that closely follows a supplied
visual reference (`docs/ui/reference/finpay-reference.png`), plus a bug audit of every route.
Visual/UX only: no API calls, routes, business logic, plans, prices or text meaning change. The
owner asked not to be asked questions; the choices below were made without asking.

**Decision.**

- **Direction.** "Reference" replaces "Survey" (decisions 0042/0043): light gray-teal page
  (`#F3F7F8`), white cards, deep petrol navy ink (`#0B3A4A`) for headings, dark bands and the
  CTA box, and one muted teal accent. The teal fill is `#247F8B` (not the reference's
  `#2B8A96`) because white button text on `#2B8A96` is only 4.06:1; `#247F8B` gives 4.69:1 and
  is visually the same color. `#2B8A96` is kept for chart lines (non-text, ≥ 3:1). Dark mode
  uses petrol surfaces (`#0B2530` / `#10303D` / `#143845`) with the teal lifted to `#3AA3AF` and
  dark text on it. Severity hues are softened (e.g. critical `#D14343`, high `#D7702A`) but keep
  their AA pairs. 110 contrast pairs are checked in `tokens.test.ts`.
- **Type.** Manrope (OFL, variable 200–800) for display and text, self-hosted woff2, preloaded,
  with a metric-matched Arial fallback computed from the font tables (size-adjust 104.6%,
  ascent 101.9%, descent 28.7%). Chosen over Satoshi/General Sans because it ships through
  `@fontsource-variable` with a clear OFL license and the existing `fonts:sync` pipeline.
  Headings are medium weight (500), large and slightly tight; KPI values are Manrope 500
  tabular (JetBrains Mono stays only for IDs, resource names and code). PDF reports keep their
  own embedded fonts (backend untouched).
- **Shape and depth.** Cards 16px radius, CTA box and feature card 24px, buttons and inputs 8px,
  badges pill-shaped. Very soft, wide shadows (`--shadow-card`, `--shadow-lg`,
  `--shadow-float`); the inner "highlight" is retired (token kept as a no-op so old class
  strings still compile).
- **Decoration.** Only large, quiet diagonal bands (`Diagonals` in `pages/public/marketing.tsx`)
  in the hero, page intros, auth aside and on the featured Pro plan. The topographic contour
  map, the attack-route SVG and all marketing screenshots are removed (they caused the known
  overflow, legibility and broken-image problems). The hero product view is now built in
  HTML/CSS (score card + risk card + "Scan now"), labelled "Example scan", using the demo's
  real rule titles; its numbers match the grade bands (78 = B).
- **Landing structure** follows the reference section by section: nav → hero with email +
  trial button and a trust row (no logos) → overlapping white feature card → "Why KloudRecon"
  bento (220+ checks, read-only connect flow, savings trend in the reference chart style) →
  petrol "How it works" band with outlined numerals → true stats (~3 min, 8 frameworks, 7 report
  types) → comparison (cards on phones) → pricing tiles (Pro as the teal tile) → FAQ → dark CTA
  box → footer. The audience strip and the separate trust band are folded into the stats header
  and bento. Only true facts are used; no customer logos, counts or testimonials.
- **Footer social icons.** KloudSchool has no social accounts on record, so inventing links
  would be false. The footer's "Follow us" shows one icon: the KloudSchool website.
- **Hero email field.** It continues to `/signup?email=…`; the dev sign-in form pre-fills the
  address. With Entra, Microsoft asks for the address itself (no auth logic changed).
- **App.** Same tokens everywhere. Light, airy sidebar (white, teal active pill, uppercase
  section labels) and a page-colored top bar without blur. Line charts use the reference style
  (teal line over a soft vertical teal gradient, `softFill()` in `charts/theme.ts`, and the
  SVG `LineChart`). Touch targets are ≥ 44px on coarse pointers (`pointer-coarse:` on buttons,
  inputs, menu items, nav links).
- **Bug fixes that change behavior only visually.** Global `overflow-wrap: break-word` on text
  elements and `min-width: 0` on grid items inside `#main` (these fixed the sideways scrolling
  on Threat signals, Forecast and Showback at 375px); a styled route error screen replaces the
  router's developer message (chunk-load failures after a deploy say "A new version is
  available" and offer a reload); skip link on public pages; `aria-controls` on the mobile menu.
- **Motion.** 150–250ms everywhere. Sections fade and slide in once on scroll (250ms), cards
  lift 2px on hover (pointer devices only), the hero cards fade up once. The hero text is not
  animated: it is the LCP element, and animating it cost ~2s of LCP on mobile. Everything
  respects `prefers-reduced-motion`.
- **Audit tooling.** `e2e/capture/audit.spec.ts` screenshots every route (public, account
  states, all app and owner pages, detail pages, command palette, drawer, chat, mobile nav,
  public demo) at 375/768/1024/1440/1920 in light and dark and writes a JSON report of overflow,
  broken images and console errors. Screenshots are JPEG (quality 55) to keep the committed
  sets small. `e2e/layout.spec.ts` (part of `npm run e2e`) guards every route against broken
  images and sideways scrolling at the five widths.

**Consequences.** `docs/ui/DESIGN_SYSTEM.md` describes v3. The marketing screenshot pipeline
(`marketing-shots.spec.ts`, `npm run images`, `src/assets/product`) is removed because the
marketing site no longer uses screenshots. Lighthouse (landing, mobile): Performance 98–100,
Accessibility 100, CLS 0.
