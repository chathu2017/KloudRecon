# 0003 — Tailwind CSS v4 with CSS-first tokens

**Status:** accepted · Phase 1

The plan names Tailwind + shadcn/ui without a version. Tailwind v4 (with `@tailwindcss/vite`) is
current and shadcn/ui supports it. Design tokens from plan Section 14.3 live as CSS variables in
`apps/web/src/styles/tokens.css` and are exposed to Tailwind through `@theme inline`, so
components use `bg-surface`, `text-muted`, `border-border` etc. and never raw hex values.
Components are written in the shadcn style (Radix primitives + `cva`) and checked into
`src/components/ui/`, which is how shadcn/ui is meant to be consumed.
