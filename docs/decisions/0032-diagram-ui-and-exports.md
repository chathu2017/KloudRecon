# 0032 — Diagram UI, icons and exports

**Status:** accepted · Phase 4, steps 5–6

- **Icons.** The official Microsoft Azure Architecture Icons (V24) are copied into
  `apps/web/public/azure-icons/<category>/<slug>.svg` and served as static files, together with
  Microsoft's terms of use and icon FAQ. `features/diagrams/icons.ts` is the single mapping file
  (ARM type → icon path, container kind → icon); unknown types fall back to
  `general/all-resources.svg`. A web test checks that every mapped file exists.
- **Layout.** ELK layered (`INCLUDE_CHILDREN`, orthogonal routing) runs in a Web Worker through
  `elk-api` with `elk-worker.min.js` loaded as a classic worker (`?url`); the bundled build is the
  fallback when workers are unavailable. Unconnected children of a container are packed into a
  balanced grid with invisible helper edges (ids `h:…`), so containers do not become long rows.
  Peering edges are oriented hub → spoke. DNS links and UDRs are container badges instead of
  edges, which keeps the network view readable.
- **Styling.** Containers follow Microsoft reference architectures: subscription (dashed gold),
  region, resource group (grey), VNet (solid green), subnet (dashed green), application/tier
  (blue). All colours come from `--dg-*` tokens with separate dark values. The React Flow node
  type is `container`, not `group`, because React Flow's built-in `group` styling paints a slab.
- **Scale.** Views with more than 400 nodes open with resource groups and VNets collapsed.
  Aggregates expand on click. Layout for the demo views takes 0.2–0.5 s and the first picture
  appears in 0.5–1.3 s.
- **Overlays** (security exposure, attack path with numbered steps and dimming, cost heat on the
  sequential ramp using quantiles, findings, changes with ghosts of removed resources) are
  computed client-side from `overlays` keyed by ARM id, so they toggle without another request
  or layout.
- **Exports** are generated from the scene and its layout, not scraped from the DOM:
  - SVG: icons inlined as data URIs, theme colours resolved to literal values of the current
    theme, title and legend included.
  - PNG: the SVG rasterised at 2×.
  - PDF: a one-page PDF with the diagram as a JPEG (written by hand, about 60 lines, so no PDF
    library is added). The text is not selectable; the SVG export is the vector option.
  - draw.io: mxGraph XML with nested container cells, image shapes carrying the official icons as
    data URIs (the file opens without a shape library) and orthogonal edges with waypoints.
- **Visual review without a dev server.** Playwright serves `apps/web/dist` through request
  interception and proxies `/api` to the local API, so screenshots do not need a Vite process.
