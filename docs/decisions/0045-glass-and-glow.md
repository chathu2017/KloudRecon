# 0045 — Glass, glow and motion pass (v3.1)

**Context.** After the reference redesign (decision 0044) the owner asked for a "next level"
finish on every page and section: hover effects, glow, animations, a glass look, more color
mixing, the real Azure icon for Azure, a sky cloud icon for "cloud", and a review of icon and
header sizes. Decision 0044 said "no glow, no blur, no gradients as decoration"; this request
replaces that rule. Visual only: no API calls, routes, logic, plans, prices or text meaning change.

**Decision.**

- **Color mixing.** The teal gets one partner, a sky blue (`--brand-2` `#2874BD`, dark
  `#62A8EA`; white text on it is 4.9:1). They mix in `--grad-brand` (primary buttons, the Pro
  tile, the hero risk card, the score bar, the active sidebar marker), `--grad-text` (hero and
  page-intro headlines, petrol → teal → sky) and `--grad-number` (the 220+ and stats numbers).
  Feature icon tiles take four soft tints from existing semantic pairs (teal, sky, green, amber).
- **Aurora.** `.aurora` is a decorative layer of four radial washes (teal, sky, a little violet)
  that drifts slowly (24s, transform only). It sits behind the hero, page intros, the petrol
  "How it works" band, the CTA box, the compliance box, the auth aside and, very quietly
  (`.aurora-app`, fixed, masked), at the top of every app and owner page. Radial gradients, not
  `filter: blur`, so it costs nothing to paint.
- **Glass.** `.glass` (72% surface, 16px backdrop blur, light inner edge) for the hero score
  card, the trial form and the Azure chip; `.glass-dark` for the step cards on the petrol band;
  the public header and the app top bar are translucent page color with backdrop blur. Glass is
  only used where something colorful sits behind it, and backgrounds stay ≥ 66% opaque so text
  contrast is the same as on the solid surface.
- **Glow and hover.** `Card`, `EmptyState`, marketing tiles, plan tiles, FAQ items and the
  comparison table are `.glow-card`: on hover the border turns teal, a teal/sky glow appears and
  a soft spotlight follows the pointer (`lib/spotlight.ts`, one passive listener, mouse only).
  The spotlight pseudo-element exists only while hovering, so axe's contrast checks are not
  weakened by a covering pseudo-element. `.hover-lift` now rises 4px. Primary buttons lift 1px,
  glow and get one light sheen; arrow icons nudge (`.btn-arrow`). Sidebar icons scale on hover.
- **Motion.** Hero cards float against each other (`.float-a/.float-b`), the critical finding
  pulses, dots travel from Azure to KloudRecon in the connect tile, the savings line draws itself
  when revealed (`.draw-line`), section reveals are slightly deeper (18px + scale). In the app,
  cards and page headers rise 10px into place when they mount (`.rise-in`, transform only, so
  text is never semi-transparent while tests or screen readers look at it). The hero text is
  still never animated (LCP). Everything stops under `prefers-reduced-motion`.
- **Azure and cloud icons.** `components/brand/AzureIcons.tsx`: `AzureLogo` is the official mark
  from Microsoft's Azure architecture icon set already in the repo
  (`public/azure-icons/other/azure-a.svg`), inlined; it is used only to refer to the customer's
  Azure (hero chip "Built for Microsoft Azure", the example scan card, the connect tile).
  `SkyCloud` is our own sky-blue cloud for "cloud" (connect tile, Subscriptions KPI, owner health
  scans). Buttons keep monochrome icons, because a blue mark on a teal-blue button is illegible.
  The footer keeps the trademark notice.
- **Sizes.** Public header 72px on desktop (64px on phones) with a larger logo (24px mark, 21px
  wordmark), 15px nav links with a gradient underline and 40px buttons. Marketing icons sit in
  `.icon-tile` (48px tile / 24px icon) or `.icon-tile-lg` (56px / 28px). Sidebar icons 18px,
  KPI label icons 16px, empty-state tiles 44px / 22px.
- **Test helper.** `e2e/helpers.ts::signIn` matches the "Email" label exactly. `vite preview`
  serves the prerendered landing page for a moment on SPA routes, and the landing page's
  "Work email" field also matched the loose label.

**Consequences.** `docs/ui/DESIGN_SYSTEM.md` has a "Glass, glow and motion" section; the
contrast test covers the new `--brand-2` pairs. New colors and effects still come only from
`tokens.css` and the classes in `index.css`.
