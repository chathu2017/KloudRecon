# 0050 — "KloudRecon Draw": the detailed diagram view

Date: 2026-10-04

## Context

The seven diagram views fold detail away on purpose (NICs, disks and public IPs into their VM,
NSGs and route tables into subnet badges). On a small tenant that leaves an almost empty picture:
a few VMs in subnets and a line from the Internet. The owner asked for a detailed drawing with the
real Azure icons and proper connections, as a new tab next to Hierarchy, without touching the
existing views.

## Decision

An eighth view, `draw` ("KloudRecon Draw"), built by `diagrams/draw.py`. The other builders are
unchanged; the view goes through the same API, cache, overlays, notes, timeline and exports.

- **Structure.** Subscription → virtual network → subnet → what lives there; everything outside a
  subnet sits in its resource group. Each VM is a `machine` box holding public IP → NIC → VM →
  disks. An NSG or route table that serves exactly one subnet (or one machine) is drawn inside it
  and named on the subnet; shared ones stay in their resource group with links.
- **Links.** Every relationship the scan knows, each with a label: private and public IP
  addresses, OS / data disk and LUN, NSG and route attachments, routes via a firewall, peering,
  private endpoints, VNet integration, load balancer backends, hosting, logging, identities,
  resource-scope RBAC grants of managed identities, gateway connections, private DNS links,
  internet exposure and on-premises. New link kinds: `attached`, and a style for `nsg-attached`.
- **Still hidden.** VM extensions, Network Watcher, flow logs, DNS link objects and the NICs of
  private endpoints.
- **Large tenants.** A subnet with more than 6 VMs shows them as one expandable node; more than 8
  resources of one type in a container become one expandable node. The demo tenant (585
  resources) gives 165 nodes and about 100 links.
- **Web.** `scene.labels` (true for this view) draws link labels all the time (in the canvas and
  in SVG / PNG / PDF exports) instead of on hover. For layout only, links are oriented Internet →
  virtual networks → resource groups → on-premises (`layout.ts::reversedForLayout`) so containers
  do not stretch across the drawing; arrows keep their real direction. Machine boxes stack in a
  subnet. Other views are laid out exactly as before.

## Consequences

- Older scans have no stored `draw` view; it is built on first request and cached like the others.
- The drawing of a large tenant is large (demo: about 8,900 × 6,900 px); search, focus and
  collapse are the way around it.
- `ViewName` gained `draw` (OpenAPI and generated types updated); the PDF diagram renderer was
  rebuilt (`npm run build:renderer`).
