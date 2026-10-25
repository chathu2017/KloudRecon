# 0033 — Architecture document data

**Status:** accepted · Phase 4, step 7

- **One scan, one source.** `services/architecture_doc.py` builds the document from the same
  scan and the same `Topology` the diagram views use (`GET /api/v1/diagrams/document?scan_id=`),
  so text, tables and diagrams always agree. The time machine works the same way as the views.
- **Narrative is templated, not AI.** Each section's paragraphs are written from computed facts
  (counts, names, placement, hubs and spokes, primary region, tag coverage, link kinds). The
  sentences are deterministic, testable and contain no invented detail. The Phase 5 AI
  Architecture Review can add commentary on top of this data.
- **Sections:** overview, management groups and subscriptions, network topology, hub and spoke,
  network address plan, regions, resource groups, applications, data flow, components, and
  security and cost at a glance. Each view section names its `view`, so a renderer can embed the
  diagram.
- **Address plan.** Per VNet: role (hub/spoke/standalone), address space, addresses allocated to
  subnets, peerings and DNS servers. Per subnet: prefix, usable addresses (Azure reserves 5),
  addresses in use (the subnet's `ipConfigurations` when ARM returns them, otherwise the NICs and
  private endpoints attached to it), NSG, route table and delegation. Checks: overlapping address
  spaces between VNets and on-premises ranges (local network gateways), subnets 80% or more used,
  and subnets without an NSG (except GatewaySubnet, AzureFirewallSubnet,
  AzureFirewallManagementSubnet and RouteServerSubnet).
- **Components** are the drawn resources (after folding), by category, with SKU and the last 30
  days of cost; at most 250 rows per category (the full list is in Inventory).
- **Web page** `/app/diagrams/document` embeds each view as an image produced by the SVG
  exporter (same scene, layout and renderer), laid out only when the figure scrolls near the
  viewport and redrawn when the theme changes. The PDF version is the Architecture report in
  Phase 5, built from this data.
- **Labels.** `diagrams/classify.py` now has readable labels for the common network, integration,
  data and AI types (for example "Azure Firewall" instead of "Azurefirewalls"), which also
  improves the region view.
