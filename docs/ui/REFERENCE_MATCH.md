# Reference match — landing page vs `finpay-reference.png`

The reference (`docs/ui/reference/finpay-reference.png`, a 1024px-wide page) sets the style:
palette, type, spacing, card shapes, shadows, section order and feel. KloudRecon's content
replaces its content; its brand, logos (Klarna, Coinbase, Instacart) and numbers are not used.
Each round compares a 1440px light screenshot of the landing page with the reference, side by
side at the same width.

## Measured reference style → what we use

| Property | Reference (measured) | KloudRecon |
|---|---|---|
| Page background | gray-teal `~#F3F7F8` in the hero, white below | `--bg #F3F7F8` hero, `--surface #FFF` below |
| Dark color | petrol navy `~#0B3A4A` (band, CTA box, dark button, headings) | `--ink` / `--map-bg #0B3A4A`, `--text #0B3A4A` |
| Accent | muted teal `~#2B8A96` | fills `#247F8B` (white text needs 4.5:1; `#2B8A96` gives 4.06:1), chart line `#2B8A96`, teal text `#1F6F7A` |
| Tints | soft teal for chart fill and icon tiles | `--brand-soft #E2F0F2`, `--chart-fill` (teal 16% → 0) |
| Headings | geometric grotesk, regular/medium, large, slightly tight | Manrope 500, H1 64px / 1.08 / −0.03em at 1440 |
| Eyebrows | tiny uppercase teal labels | `.eyebrow` 12px / 600 / 0.1em / teal |
| Cards | ~16px radius, soft wide shadow or none, generous padding | 16px tiles, 24px feature card and CTA box, padding 32–48px, `--shadow-lg` / none |
| Bento tiles | light gray-teal fill, no border | `bg-surface-2 #EEF4F5`, no border |
| Buttons | small, ~8px radius, teal filled; outlined with ↗ | 36–44px, 8px, teal; `outline` / `inverse` variants with `ArrowUpRight` |
| Decoration | large diagonal light-teal shapes in the hero and the highlighted plan | `Diagonals` (teal 7–11%) in the hero; white 8% on the Pro tile |
| Width | centered, ~1200px content | `.mk-container` 1200px content |

## Round 1

Screenshot: `docs/ui/reference/compare-round1.jpg` (left: reference, right: KloudRecon).

| # | Difference | Fix |
|---|---|---|
| 1 | Hero cards are smaller relative to their column than the reference's invoice + card group (≈32% vs ≈42% of the width). | Composition max width 460 → 540px; score, risk count and findings text scaled up. |
| 2 | Feature card: the description sits at the bottom of the header row; the reference aligns it with the heading. | Header row centered (`md:items-center`). |
| 3 | "Why" heading wraps to two lines; the reference's is one line. | Center headers allow `max-w-3xl`; the bento heading fits one line at ≥ 1024px. |
| 4 | Wide bento tile: text sits at the top; the reference centers it vertically next to the chart. | Left column `justify-center`. |
| 5 | Step numerals are plain outlines; the reference's fade out towards the bottom. | Outline numerals with a top-to-bottom fade mask. |
| 6 | Header has a hairline border over the hero; the reference's header sits on the hero with no line. | The border appears only after the page scrolls (scroll listener in `PublicLayout`). |
| 7 | Footer: copyright and trademark note split left/right; the reference centers the copyright under a divider. | Bottom row centered, stacked. |
| 8 | Wide bento chart was labelled "Monthly cost / Cost trend" with a rising line, which reads as costs going up next to "FinOps that finds money". | Relabelled "Savings tracker / Realized savings" (a real page), still marked "Sample data". |

All eight were fixed before round 2.

## Round 2

Screenshot: `docs/ui/reference/compare-round2.jpg`.

Checked again property by property (palette, heading size and weight, eyebrows, spacing, card
radius and shadow, button shape, alignment, section order). No style differences remain open.
The remaining visible differences are content or rule-driven and intentional:

| Difference | Why it stays |
|---|---|
| The page is longer (feature bullets, a reports + AI row, a comparison, four plans with features, an FAQ). | The brief keeps KloudRecon's content, comparison and all plans/features exactly; the reference is a short template. |
| Trust row with check marks instead of three brand logos. | Never invent customer logos; these are true product facts (Reader role only, no agents, secrets in Key Vault, 14-day trial). |
| Stats are ~3 min, 8 frameworks, 7 report types instead of revenue/customer numbers. | Only true KloudRecon facts. |
| Pricing shows four equal-height tiles with feature lists instead of two short tiles. | Plans, prices and features must stay exactly as they are; the tile style (light tiles, teal featured tile with diagonals, arrow buttons) follows the reference. |
| A comparison section sits between the stats and the plans. | Required by the brief's section mapping (item 7). |
| Teal fills are `#247F8B`, a shade darker than the reference's `#2B8A96`. | White button text needs ≥ 4.5:1 (WCAG AA); `#2B8A96` gives 4.06:1. The chart line keeps `#2B8A96`. |
| The nav has a theme toggle; the footer shows one "Follow us" icon (website). | Light and dark are product features; KloudSchool has no social accounts to link, so none are invented. |
| The bento chart says "Sample data". | It illustrates the savings tracker; it is not a claim about real results. |

Dark mode and phones have no reference; they follow the same tokens (petrol surfaces, the same
teal) and stack the hero cards under the text (`docs/ui/audit/after/`).
