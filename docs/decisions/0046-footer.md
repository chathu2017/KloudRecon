# 0046 — Footer redesign and social links

**Context.** The owner asked for a modern footer on the public site: glass look, hover
animations, a larger logo and brand name, and "Follow us" with a website and a LinkedIn icon in
the site's colors. Nothing else was to change.

**Decision.**

- The footer is one glass panel (`.glass`, 24px radius) over a drifting `.aurora` wash on the
  page color. Logo `size="xl"` (36px mark, 30–34px wordmark); the mark turns a quarter on hover.
- Three link columns (Product, Company, Legal) at 15px; links turn teal and slide right behind a
  short gradient dash (`.footer-link`). "Follow us" sits under the brand text with two 48px
  buttons (`.social-link`): on hover they fill with the brand gradient, lift and glow.
- The copyright and the trademark notice share one row on desktop and stack on phones.
- **LinkedIn address.** Decision 0044 showed only the website because no social account was on
  record. The owner now asks for LinkedIn, so the link points to
  `https://www.linkedin.com/company/kloudschool`. This address is an assumption and must be
  confirmed (or corrected in `SOCIAL` in `pages/public/PublicLayout.tsx`) before go-live.
- lucide no longer ships brand icons, so the LinkedIn glyph is a small inline SVG.
