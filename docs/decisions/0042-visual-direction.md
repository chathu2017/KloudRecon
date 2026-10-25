# 0042 — Visual direction for UI v2: "Survey"

**Context.** The owner found the 0041 design too plain and asked for a premium, distinctive
look (the feel of Wiz, Linear, Vercel, Stripe, Datadog) that is still trustworthy for
enterprise buyers, chosen with the `frontend-design` and `ui-ux-pro-max` skills. The brief,
research notes and the three candidate directions are in `docs/ui/DESIGN_BRIEF.md`; previews
and screenshots are in `docs/ui/directions/` (`build_previews.py`, `a-survey-*.png`,
`b-blueprint-*.png`, `c-sweep-*.png`).

**Options.**
- **A — Survey:** Bricolage Grotesque + Instrument Sans + JetBrains Mono; deep survey navy,
  signal teal, beacon amber; a topographic contour map with the attack path drawn as a
  surveyed route.
- **B — Blueprint:** Geist + Geist Mono; cobalt on a drafting grid; an architecture diagram
  with flowing dots.
- **C — Sweep:** Schibsted Grotesk + Onest + Geist Mono; graphite and saffron; a radar sweep
  with finding blips.

**Decision: A — Survey.**

- *Grounded in the subject.* "Recon" means surveying ground and marking routes. The motif is
  what the product actually produces (a map of the estate with the dangerous path from the
  internet to a Key Vault), so it explains the product instead of decorating it.
- *Distinct from the category.* Security and cloud tools cluster around blue/purple (Wiz,
  Datadog, Snyk) or black and white (Vercel). Teal on deep navy with a characterful grotesque
  is recognisable without being loud. B read as a Geist/Vercel derivative in review.
- *Color does not fight meaning.* Brand teal and amber sit apart from every severity hue:
  critical red, high orange, medium ochre, low blue, success green. B's cobalt collides with
  `low`; C's saffron collides with `medium`.
- *Both themes are first-class.* The hero is a deep navy "map table" in both themes, which
  gives the landing page its premium weight; the app has a cool paper light theme and a
  layered navy dark theme (not black). C was dark-first and fell into the "near-black with one
  bright accent" default the frontend-design skill warns about.
- *Checklists.* Against ui-ux-pro-max's pre-delivery checklist and the frontend-design
  anti-pattern list, A needed two fixes found in the first screenshot review: the route and
  its labels crossed the headline (moved to the upper right, contours masked behind the copy)
  and the display tracking was too tight (letters touched; relaxed to -0.012em at weight 640).

**Consequences.**
- Fonts (all SIL OFL 1.1, self-hosted, variable woff2): Bricolage Grotesque for display
  (optical sizing), Instrument Sans for text, JetBrains Mono for numbers and IDs. IBM Plex is
  retired; `docs/ui/DESIGN_SYSTEM.md` is rewritten for v2 and supersedes the palette and type
  parts of decision 0041 (its principles of one theme file, tested contrast and no hard-coded
  colors still apply).
- Gradients are allowed only in two places, both part of this direction: the soft teal glow
  behind the hero product shots and the final call-to-action band. Never gradient text.
- Motion: the route draws itself once on load (static under reduced motion), marketing
  sections reveal once on scroll, KPI values count up, interactive feedback is 150–250ms.
