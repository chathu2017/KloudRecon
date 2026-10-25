# 0048 — App and owner console: "depth" (v4)

Date: 2026-10-01

## Context

The owner found the signed-in app and the owner console flat and dated: a full-height sidebar
column, a bar across the top, cards in almost the same color as the page, native check boxes and
select arrows, small icons, and tight text at 13–14px. The request was a modern look with depth
("3D") on every page of both consoles.

## Decision

Visual only, through the shared shell and primitives, so every page of `/app` and `/owner` gets
it without page-by-page edits. The palette and the typefaces (Manrope, JetBrains Mono) stay.

- **Desk and slabs.** The shell sits on `--desk`. `Card` and `EmptyState` use `.card-3d`: a lit
  top edge, a solid lower edge (`--edge`) and a soft drop (`--raise`); hover uses `--raise-hover`.
- **Floating shell.** The sidebar is a rounded floating panel (`.panel-3d`), the top bar a floating
  glass bar (`.topbar-3d` inside `.topbar-fade`). Notices under the bar are rounded strips
  (`.banner-slot`).
- **Keys.** The current page in the sidebar is a lit key (`.nav-key`). Primary buttons have a lower
  edge and travel down when pressed; secondary and subtle buttons use `.btn-key`. Step numbers use
  `.num-key`.
- **Wells.** Inputs, the search trigger and tab tracks are pressed in (`--well`, `.well`); the
  active tab is a raised thumb.
- **Controls.** Check boxes are drawn (base layer); native selects lose the browser arrow
  (`.select-chevron`); scrollbars are thin and token-colored.
- **Text.** Inside `.app-desk` body text is weight 450 with +0.006em tracking; page titles are
  semibold; sidebar section labels are sentence case.

## Consequences

- `--bg` and the marketing pages are unchanged, apart from the shared primary button edge, the
  drawn check boxes and thin scrollbars.
- New tokens exist in both themes: `--desk`, `--edge`, `--key-edge`, `--raise`, `--raise-sm`,
  `--raise-hover`, `--well`, `--card-sheen`, `--grad-panel`.
- A `Card` given a background utility still shows `--card-sheen` on top; that is intended.
