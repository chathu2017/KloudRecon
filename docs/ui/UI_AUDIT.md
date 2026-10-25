# UI audit — before and after the reference redesign

Decision: `docs/decisions/0044-reference-redesign.md`. Reference: `docs/ui/reference/`.

## Method

1. **Capture.** `apps/web/e2e/capture/audit.spec.ts` loaded every route of the production build
   (prerendered public pages + SPA) at **375, 768, 1024, 1440 and 1920 px** in **light and dark**:
   8 public pages (landing, pricing, security, terms, privacy, sign-in, sign-up, 404), account
   states (onboarding for a new sign-up, under review, an admin with no data), all 43 customer
   app pages including finding, framework and connection detail, all 15 owner console pages
   including organization detail, the command palette, resource drawer, AI chat, mobile
   navigation drawer and the public "View live demo" session. **734 captures** in
   `docs/ui/audit/before/<width>-<theme>/` (JPEG), each with a `report.json` (sideways overflow
   and the elements causing it, broken images, console errors).
2. **Review.** Automated findings from the JSON reports, then a visual pass over contact sheets of
   every page per width/theme and full-size views of the landing page, overview, cost, findings,
   inventory, threats and owner pages; plus a read of `apps/web/src` (tokens, shared components,
   public pages, shells, charts).
3. **Fix and re-check.** The same capture ran on the rebuilt UI (`docs/ui/audit/after/`), and the
   new `e2e/layout.spec.ts` now guards every route against broken images and sideways scrolling
   at all five widths.

Automated results, before: 734 captures, **6 with sideways scrolling** (3 pages × 2 themes at
375px), 0 broken images, 0 console errors. After: see the bottom of this file.

Severity: **Critical** blocks use or misleads; **High** breaks layout or a key page; **Medium**
visibly wrong or hard to use; **Low** polish.

## Issues

| # | Page | Breakpoint | Theme | Severity | Problem | Fix | Status |
|---|---|---|---|---|---|---|---|
| 1 | Landing hero | 1024–1439 | both | High | The hero screenshot is drawn at 128% width with a perspective tilt and the attack-route SVG above it; both run off the right edge and are cut (`kv-contoso-pr…`, half of the app). | Screenshot and route removed; the hero product view is an HTML/CSS card composition sized to its column (`HeroCards`). | Fixed |
| 2 | Landing hero, all marketing images | all | both | High | Known report of broken hero images (alt text in empty panels). Not reproduced locally (0 broken images in 734 captures), but the hero depended on eight lazy/theme-switched WebP files, where any cache or CSP miss shows alt text in an empty frame. | Marketing pages no longer use raster screenshots (no `<img>` on the landing page). `e2e/layout.spec.ts` fails on any broken image on any route. | Fixed |
| 3 | Landing hero, trust band, CTA, auth aside | all | both | High | Topographic contour lines run behind the headline and body text; busy and lowers legibility. | Contour field removed everywhere; only quiet diagonal bands behind the hero cards and on the Pro tile. | Fixed |
| 4 | Threat signals | 375 | both | High | Page scrolls sideways by 89px: ARM operation names such as `Microsoft.Network/networkSecurityGroups/securityRules/write` never wrap. | Global `overflow-wrap: break-word` on text elements. | Fixed |
| 5 | Cost › Forecast & budgets | 375 | both | High | Page scrolls sideways by 64px: grid items keep their min-content width (budget rows, chart), pushing the whole grid wider than the screen. | `#main .grid > * { min-width: 0 }`. | Fixed |
| 6 | Cost › Showback | 375 | both | High | Page scrolls sideways by 74px (same cause: tag-coverage bars and headings in a grid column). | Same grid rule. | Fixed |
| 7 | Every lazily loaded page | all | both | High | If a code chunk fails to load (typically right after a deploy), React Router's developer screen appears ("Unexpected Application Error! … Hey developer 👋"). Seen during the audit. | `RouteError` error element on the public, full-page and in-shell route groups: a styled card that says a new version is available (chunk errors) or that the page could not be shown, with Reload and Go to start. The app shell stays usable. | Fixed |
| 8 | Landing, audience strip | 768–1440 | both | Medium | Four audience labels in uneven columns; "Consultants and MSPs" and "IT and cloud managers" wrap while the others do not; the strip floats between two sections. | Strip removed; the audiences are the subtitle of the "Built for" stats section. | Fixed |
| 9 | Landing | all | both | Medium | Harsh section jumps: dark hero → white strip → gray → white → gray → white → dark trust band → white → gray → dark CTA → dark footer. | Reference rhythm: gray-teal hero, the feature card bridges into white, one petrol band, one gray FAQ band, the CTA as a contained dark box, a white footer. | Fixed |
| 10 | Landing | 1440 | both | Medium | Too much empty space: 120px section padding around large screenshots, page 8,507px tall at 1440px. | 112px sections, compact bento and cards; page ~7,000px tall with more content per screen. | Fixed |
| 11 | Landing hero | 375 | both | Medium | The app screenshot shrinks to 343px wide: unreadable, only decorative. | Hero cards stack under the text at a readable size (score, findings, risk card). | Fixed |
| 12 | Landing comparison | 375–767 | both | Medium | A 680px-wide table scrolls sideways inside the card on phones. | On phones each capability is a card with the three columns as rows; the table shows from 768px. | Fixed |
| 13 | Cost sub-navigation | 375 | both | Medium | Tabs are cut at the screen edge ("Rig…") with no sign they scroll. | Right-edge fade + end padding on small screens, 40–44px tall tabs, teal active state. | Fixed |
| 14 | Overview › Score over time | 1024–1920 | both | Medium | The chart is 96px tall inside a card stretched by its neighbor: ~300px of empty space. | `LineChart` grows to fill the card (min 96px), reference style (teal line, soft teal gradient). | Fixed |
| 15 | App top bar, public header, dialogs | 375–1024 (touch) | both | Medium | Icon buttons are 32px, dialog close 24px, mobile menu links 36px: below the 44px touch target. | `pointer-coarse:` minimums (44px) on buttons, icon buttons, inputs, menu items, nav links; mobile menu links 44px. | Fixed |
| 16 | Public pages | all | both | Medium | No skip link; mobile menu button has no `aria-controls`. | Skip link to `#main`, `aria-controls="mobile-menu"`. | Fixed |
| 17 | App-wide | all | both | Medium | Mixed card radii (8/10/14px), cards with an inner highlight plus shadow, secondary buttons with shadows: looks unfinished next to each other. | One scale: cards 16px, big containers 24px, controls 8px, pills for badges; soft wide shadows only. | Fixed |
| 18 | Pricing (landing + /pricing) | 1024–1920 | light | Medium | The featured Pro plan is a dark navy card with a glow on a light page: jarring. | Pro is the teal tile with diagonal shapes (reference style); other plans are light tiles; features aligned on a subgrid. | Fixed |
| 19 | Landing | all | both | Low | No quick way to start from the hero (two buttons only). | Email field joined with "Start free trial" (continues to sign-up with the address filled in on dev sign-in). | Fixed |
| 20 | Short pages (onboarding, under review, 404) | 1440–1920 | both | Low | Below the body the canvas has no background (black in full-page captures). | `html` gets the page background. | Fixed |
| 21 | Sidebar | all | both | Low | Section labels look like items (same size, weight and color family); active item has a 3px bar that sits outside the list. | Uppercase 11px tracked labels; active item is a teal pill with teal icon and text. | Fixed |
| 22 | Recommendations KPI "Risk reduction" | 375 | both | Low | "13 critical · 95 high" in 32px mono wraps onto two lines. | KPI values are Manrope 30px (narrower); fits on one line at 375px. | Fixed |
| 23 | Landing (mobile) | 375 | both | Low | Hero headline, lede and buttons animate in on load; on a throttled phone this delayed the largest contentful paint to 3.5s. | Hero text is static; only the hero cards fade up once. LCP 1.4s. | Fixed |
| 24 | Tables in narrow cards (framework controls, alert rules, connection scans, vulnerabilities) | 375 | both | Low | Columns compress on phones; long descriptions wrap into narrow columns. | Tables stay inside their own horizontal scroller (no page overflow); read-only mobile use (plan 14.4) makes this acceptable. Revisit with card layouts if phone use grows. | Accepted |
| 25 | Cost explorer (and any table wider than its card) | 375–767 | both | Medium | The table scrolls sideways inside its card, but keyboard users cannot reach the scroller (axe `scrollable-region-focusable`, found by the new phone accessibility test). | `Table` makes its scroller focusable (`tabIndex=0`, named region, focus ring) only while it actually overflows, so desktop tab order is unchanged. | Fixed |

Critical: **0**. High: **7, all fixed**. Medium: **12, all fixed**. Low: **6** (5 fixed, 1 accepted).

## After

The after capture (`docs/ui/audit/after/`, same spec, same 734 page/width/theme combinations on
the rebuilt UI) reports **0 pages with sideways scrolling, 0 broken images and 0 console
errors**. `e2e/layout.spec.ts` checks the same on every route at every width as part of
`npm run e2e`, and the accessibility specs (axe, WCAG 2.1 AA) pass in light, dark and on a
phone.
