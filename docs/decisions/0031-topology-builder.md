# 0031 — Topology builder and diagram views

**Status:** accepted · Phase 4, step 4

- **Graph.** The normalized graph (`diagrams/model.py`) has groups (nested containers:
  management group, subscription, region, resource group, VNet, subnet, application, tier,
  category), nodes (a resource, an aggregate of one type, or an external entity: Internet,
  on-premises) and typed edges. The edge kinds are the plan's list plus `exposure` (Internet →
  public endpoint) and `connection` (VPN / ExpressRoute). Edges may point at a container (VNet
  peering, VNet integration into a subnet, UDRs from a VNet to the firewall).
- **Folding.** NICs, attached disks and public IPs fold into their VM (a public IP becomes a
  badge). Extensions, DNS VNet links, network watchers and SQL databases fold into their parent
  (the SQL server shows its database count). NSGs and route tables become subnet badges. Private
  DNS zones are one aggregate node per subscription with DNS links to the VNets. Unattached disks
  and IPs stay visible in the resource group view.
- **Aggregation.** More than 5 resources of one type in one container become one aggregate node
  whose `members` the UI can expand. The data-flow view aggregates per application and type, from
  3 resources.
- **Hub detection.** A hub is a VNet that contains an Azure Firewall or a virtual network gateway,
  or that is peered with two or more VNets, at least one of them a leaf. Spokes are the other
  peered VNets. Cross-region peering is labelled "global peering".
- **Data flow.** Ingress (Front Door, Application Gateway, API Management) → applications (App
  Service, Container Apps, AKS, VMs, scale sets) → data (databases, storage, Key Vault,
  messaging). Links come from load balancer / App Gateway backends, RBAC grants of the app's
  managed identities at resource or resource group scope (subscription-wide grants are left out,
  since they would link everything), private endpoints in the app's VNet, and a shared `app` tag.
- **Hierarchy.** Stage 19 maps each subscription to the deepest management group listing it
  (`management_group_subscriptions`) and stores the `hierarchy` artifact. Without management group
  access, subscriptions hang under the tenant root.
- **Storage.** Stage 19 stores all seven views as gzip JSON in Blob (`diagrams` container), with
  one `diagrams` row each. The API builds and caches missing views on demand (older scans, another
  tag for the application view). Overlays (cost, open findings, exposure, attack paths, changes
  with ghosts of removed resources) are computed per request, keyed by ARM ID. With several
  connections, a view shows the latest scan of the first connection (one tenant per picture).
