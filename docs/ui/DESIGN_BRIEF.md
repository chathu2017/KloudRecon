# KloudRecon design brief (UI v2)

Written with the `frontend-design` and `ui-ux-pro-max` skills. It sets the direction for the
v2 redesign; `docs/ui/DESIGN_SYSTEM.md` holds the resulting tokens and rules, and
`docs/decisions/0042-visual-direction.md` records which direction won and why.

## What the product is

KloudRecon connects to a customer's Azure tenant with the Reader role and maps it: every
resource, how the network is wired, who can reach what, which paths lead from the internet to
sensitive data, what it costs and what to fix first. The word that matters is **recon**:
surveying unknown ground, drawing the map, marking the dangerous routes.

## Audience

| Who | What they need to feel in 3 seconds | What they do in the app |
|---|---|---|
| Azure consultants and MSPs | "I can hand this to a client." Polished, white-label, serious. | Run assessments across many tenants, export reports. |
| Cloud and security leads | "This finds real risk, not noise." Precise, calm, credible. | Triage findings and attack paths, track the score. |
| FinOps and finance | "The numbers are right." Legible, tabular, trustworthy. | Read cost trends, savings, forecasts. |

All three are experts who look at dense data all day. They distrust hype and reward clarity.

## Brand personality

**Precise. Watchful. Assured.**

- *Precise*: exact numbers, aligned tables, crisp lines. Nothing vague or decorative.
- *Watchful*: the product is always surveying; there is a sense of a live map being kept.
- *Assured*: confident type and a calm palette; never alarmist, never "hacker" theatre.

## Research notes (ui-ux-pro-max)

- `--design-system "B2B cloud security SaaS dashboard enterprise"` returned the generic
  B2B baseline (trust blue `#2563EB`, orange CTA, Plus Jakarta Sans, glassmorphism). Useful as
  a floor for contrast and CTA rules; rejected as a look because it is the default answer for
  any SaaS.
- `--domain product "cybersecurity platform"` suggests "Cyberpunk + OLED dark, matrix green".
  Rejected: that is exactly the hacker theatre enterprise buyers distrust (and acid green on
  black is a known generated-design tell).
- `--domain landing`: **Real-Time / Operations Landing** (hero with a live product preview,
  status colors separate from brand, pause/static final state under reduced motion) and
  **Trust & Authority** (proof, transparent pricing, security badges). KloudRecon's landing
  combines both.
- `--domain style "data-dense dashboard"`: 12-column grid, KPI row, sticky table headers,
  36–40px rows, hover rows, dense but readable type. Used for the app.
- `--domain chart`: line charts for trends; distinguish series by line style and direct
  labels, never hue alone.
- `--domain ux`: honor `prefers-reduced-motion` with the final state; lazy-load below-fold
  media; reserve space (CLS < 0.1); format numbers with separators.
- Font pairings from the database (Space Grotesk + DM Sans, Fira Code + Fira Sans, Inter)
  are the common defaults; the pairings below were chosen by hand from open-license families.

## Design principles

1. **The map is the motif.** The product draws maps of Azure estates, so the brand does too:
   one signature visual (not scattered decoration) shows an estate being surveyed and a
   dangerous route being found.
2. **Spend boldness once per screen.** A characterful display face and one signature visual
   on marketing pages; everything else quiet. In the app the data is the hero.
3. **Numbers are first-class.** Mono tabular figures, large KPI values, deltas with direction,
   sparklines. A finance lead must trust every digit.
4. **Depth by layering, not decoration.** Surfaces step up in tone with 1px borders and a faint
   inner highlight; shadows only where something floats. Dark mode is designed, not inverted.
5. **Color means something.** Brand color for action and the signature route; severity colors
   only for severity; neutrals for everything else. AA contrast in both themes, tested.
6. **Motion answers or reveals once.** One orchestrated hero moment, count-up on KPIs,
   150–250ms feedback on interaction. Reduced motion shows the final state.

## Three directions

Each is a static preview in `docs/ui/directions/` (hero + a dashboard view, light and dark),
screenshotted with Playwright into the same folder.

### A — Survey (cartographic recon)

- **Type:** Bricolage Grotesque (display, with optical sizing: sharp and characterful at 72px,
  calm at 20px) · Instrument Sans (text) · JetBrains Mono (numbers, IDs).
- **Palette:** Deep survey navy `#0B1A28` · Signal teal `#0E8C80` (dark `#3ED3C0`) ·
  Beacon amber `#B86E00` (dark `#F2B04A`) · Paper `#F4F6F5` · Contour grey `#C9D3D1`.
- **Motif:** topographic contour lines of an "estate", with the attack path drawn as a
  surveyed route between waypoints (internet → VM → identity → Key Vault).
- **Layout:** left-aligned hero over a dark navy field in both themes; product screenshots
  layered at a slight angle on the contour map.

### B — Blueprint (architecture drafting)

- **Type:** Geist (display and text) · Geist Mono.
- **Palette:** Blueprint cobalt `#2447C8` · Drafting cyan `#0A8FB0` · Blueprint navy
  `#0A1633` · White `#FFFFFF` · Grid line `#DCE3F5`.
- **Motif:** a fine drafting grid with dimension lines; an architecture diagram with data
  dots flowing along edges.
- **Layout:** centered hero, diagram below, very clean Swiss rhythm.

### C — Sweep (radar console)

- **Type:** Schibsted Grotesk (display, heavy) · Onest (text) · Geist Mono.
- **Palette:** Graphite `#111315` · Saffron `#E0A100` (light `#8A5A00`) · Steel `#2A2F36` ·
  Fog `#F3F3F1` · Signal white `#F7F7F5`.
- **Motif:** the logo's swept quadrant becomes a radar sweep with blips for findings.
- **Layout:** dark-first console aesthetic; split hero with the radar on the right.

## Review against generic defaults (frontend-design pass 2)

- **B** is the closest to "any developer SaaS": Geist + cobalt + grid reads like a Vercel or
  Linear derivative, and cobalt collides with the `low` severity blue. Kept as the safe
  control.
- **C** has a real idea (the radar ties to the logo) but saffron collides with `medium`
  severity amber, a dark-first console risks the "near-black + one bright accent" tell, and a
  light theme with saffron needs dark button text, which weakens the CTA.
- **A** comes from the subject (recon = surveying and mapping), keeps brand teal clear of
  every severity hue (critical red, high orange, medium amber, low blue, success green), and
  its motif doubles as the product's actual output (a map with a dangerous route). The first
  draft of A used a cream paper and a serif display; both were changed (cool paper, grotesque
  display) because cream + serif is a known generated-design default.
