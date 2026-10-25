"""Resource classification for diagrams: category, display name, and which resources are folded
into another node instead of being drawn (NICs, disks, extensions, DNS links...)."""

from __future__ import annotations

from typing import Any

CATEGORY: dict[str, str] = {
    "microsoft.compute/virtualmachines": "compute",
    "microsoft.compute/virtualmachinescalesets": "compute",
    "microsoft.compute/availabilitysets": "compute",
    "microsoft.compute/disks": "storage",
    "microsoft.compute/snapshots": "storage",
    "microsoft.containerservice/managedclusters": "containers",
    "microsoft.containerregistry/registries": "containers",
    "microsoft.app/managedenvironments": "containers",
    "microsoft.app/containerapps": "containers",
    "microsoft.web/serverfarms": "web",
    "microsoft.web/sites": "web",
    "microsoft.cdn/profiles": "network",
    "microsoft.network/virtualnetworks": "network",
    "microsoft.network/azurefirewalls": "network",
    "microsoft.network/firewallpolicies": "network",
    "microsoft.network/virtualnetworkgateways": "network",
    "microsoft.network/localnetworkgateways": "network",
    "microsoft.network/connections": "network",
    "microsoft.network/bastionhosts": "network",
    "microsoft.network/applicationgateways": "network",
    "microsoft.network/applicationgatewaywebapplicationfirewallpolicies": "security",
    "microsoft.network/frontdoorwebapplicationfirewallpolicies": "security",
    "microsoft.network/loadbalancers": "network",
    "microsoft.network/privateendpoints": "network",
    "microsoft.network/privatednszones": "network",
    "microsoft.network/publicipaddresses": "network",
    "microsoft.network/networksecuritygroups": "security",
    "microsoft.network/routetables": "network",
    "microsoft.network/natgateways": "network",
    "microsoft.storage/storageaccounts": "storage",
    "microsoft.sql/servers": "data",
    "microsoft.sql/servers/databases": "data",
    "microsoft.dbforpostgresql/flexibleservers": "data",
    "microsoft.dbformysql/flexibleservers": "data",
    "microsoft.documentdb/databaseaccounts": "data",
    "microsoft.cache/redis": "data",
    "microsoft.keyvault/vaults": "security",
    "microsoft.managedidentity/userassignedidentities": "identity",
    "microsoft.operationalinsights/workspaces": "monitoring",
    "microsoft.insights/components": "monitoring",
    "microsoft.insights/actiongroups": "monitoring",
    "microsoft.recoveryservices/vaults": "management",
    "microsoft.automation/automationaccounts": "management",
    "microsoft.eventhub/namespaces": "integration",
    "microsoft.servicebus/namespaces": "integration",
    "microsoft.datafactory/factories": "integration",
}
CATEGORY_LABEL = {
    "compute": "Compute",
    "containers": "Containers",
    "web": "Web & apps",
    "network": "Networking",
    "security": "Security",
    "identity": "Identity",
    "data": "Databases",
    "storage": "Storage",
    "integration": "Integration",
    "monitoring": "Monitoring",
    "management": "Management",
    "other": "Other",
}
CATEGORY_ORDER = list(CATEGORY_LABEL)

# Never drawn on their own; folded into the resource that owns them (or shown as badges).
FOLDED = {
    "microsoft.network/networkinterfaces",
    "microsoft.compute/virtualmachines/extensions",
    "microsoft.network/privatednszones/virtualnetworklinks",
    "microsoft.network/networkwatchers",
    "microsoft.network/networkwatchers/flowlogs",
    "microsoft.sql/servers/databases",
}
# Drawn only when not attached to anything (orphans matter in the resource group view).
ATTACHED_ONLY = {
    "microsoft.compute/disks",
    "microsoft.network/publicipaddresses",
}
LABEL: dict[str, tuple[str, str]] = {
    "microsoft.compute/virtualmachines": ("Virtual machine", "Virtual machines"),
    "microsoft.compute/virtualmachinescalesets": ("VM scale set", "VM scale sets"),
    "microsoft.compute/disks": ("Managed disk", "Managed disks"),
    "microsoft.compute/snapshots": ("Snapshot", "Snapshots"),
    "microsoft.compute/availabilitysets": ("Availability set", "Availability sets"),
    "microsoft.network/privateendpoints": ("Private endpoint", "Private endpoints"),
    "microsoft.network/publicipaddresses": ("Public IP", "Public IPs"),
    "microsoft.network/privatednszones": ("Private DNS zone", "Private DNS zones"),
    "microsoft.network/networksecuritygroups": ("NSG", "NSGs"),
    "microsoft.network/routetables": ("Route table", "Route tables"),
    "microsoft.network/loadbalancers": ("Load balancer", "Load balancers"),
    "microsoft.storage/storageaccounts": ("Storage account", "Storage accounts"),
    "microsoft.web/sites": ("App Service", "App Services"),
    "microsoft.web/serverfarms": ("App Service plan", "App Service plans"),
    "microsoft.sql/servers": ("SQL server", "SQL servers"),
    "microsoft.sql/servers/databases": ("SQL database", "SQL databases"),
    "microsoft.keyvault/vaults": ("Key vault", "Key vaults"),
    "microsoft.insights/components": ("Application Insights", "Application Insights"),
    "microsoft.operationalinsights/workspaces": ("Log Analytics", "Log Analytics workspaces"),
    "microsoft.managedidentity/userassignedidentities": ("Managed identity", "Managed identities"),
    "microsoft.app/containerapps": ("Container app", "Container apps"),
    "microsoft.containerservice/managedclusters": ("AKS cluster", "AKS clusters"),
    "microsoft.containerregistry/registries": ("Container registry", "Container registries"),
    "microsoft.documentdb/databaseaccounts": ("Cosmos DB", "Cosmos DB accounts"),
    "microsoft.cache/redis": ("Redis cache", "Redis caches"),
    "microsoft.insights/actiongroups": ("Action group", "Action groups"),
    "microsoft.network/virtualnetworks": ("Virtual network", "Virtual networks"),
    "microsoft.network/networkinterfaces": ("Network interface", "Network interfaces"),
    "microsoft.network/azurefirewalls": ("Azure Firewall", "Azure Firewalls"),
    "microsoft.network/firewallpolicies": ("Firewall policy", "Firewall policies"),
    "microsoft.network/bastionhosts": ("Bastion", "Bastions"),
    "microsoft.network/virtualnetworkgateways": (
        "Virtual network gateway",
        "Virtual network gateways",
    ),
    "microsoft.network/localnetworkgateways": ("Local network gateway", "Local network gateways"),
    "microsoft.network/connections": ("Gateway connection", "Gateway connections"),
    "microsoft.network/expressroutecircuits": ("ExpressRoute circuit", "ExpressRoute circuits"),
    "microsoft.network/applicationgateways": ("Application Gateway", "Application Gateways"),
    "microsoft.network/applicationgatewaywebapplicationfirewallpolicies": (
        "WAF policy",
        "WAF policies",
    ),
    "microsoft.network/frontdoorwebapplicationfirewallpolicies": (
        "Front Door WAF policy",
        "Front Door WAF policies",
    ),
    "microsoft.network/frontdoors": ("Front Door (classic)", "Front Doors (classic)"),
    "microsoft.cdn/profiles": ("Front Door / CDN profile", "Front Door / CDN profiles"),
    "microsoft.network/natgateways": ("NAT gateway", "NAT gateways"),
    "microsoft.network/networkwatchers": ("Network Watcher", "Network Watchers"),
    "microsoft.network/networkwatchers/flowlogs": ("Flow log", "Flow logs"),
    "microsoft.network/privatednszones/virtualnetworklinks": ("DNS VNet link", "DNS VNet links"),
    "microsoft.network/dnszones": ("DNS zone", "DNS zones"),
    "microsoft.network/ddosprotectionplans": ("DDoS protection plan", "DDoS protection plans"),
    "microsoft.network/trafficmanagerprofiles": ("Traffic Manager", "Traffic Manager profiles"),
    "microsoft.compute/virtualmachines/extensions": ("VM extension", "VM extensions"),
    "microsoft.app/managedenvironments": (
        "Container Apps environment",
        "Container Apps environments",
    ),
    "microsoft.automation/automationaccounts": ("Automation account", "Automation accounts"),
    "microsoft.datafactory/factories": ("Data factory", "Data factories"),
    "microsoft.dbforpostgresql/flexibleservers": ("PostgreSQL server", "PostgreSQL servers"),
    "microsoft.dbformysql/flexibleservers": ("MySQL server", "MySQL servers"),
    "microsoft.eventhub/namespaces": ("Event Hubs namespace", "Event Hubs namespaces"),
    "microsoft.servicebus/namespaces": ("Service Bus namespace", "Service Bus namespaces"),
    "microsoft.recoveryservices/vaults": ("Recovery Services vault", "Recovery Services vaults"),
    "microsoft.apimanagement/service": ("API Management", "API Management services"),
    "microsoft.web/staticsites": ("Static web app", "Static web apps"),
    "microsoft.cognitiveservices/accounts": ("Azure AI services", "Azure AI services accounts"),
    "microsoft.search/searchservices": ("AI Search", "AI Search services"),
    "microsoft.synapse/workspaces": ("Synapse workspace", "Synapse workspaces"),
    "microsoft.databricks/workspaces": ("Databricks workspace", "Databricks workspaces"),
    "microsoft.logic/workflows": ("Logic app", "Logic apps"),
    "microsoft.signalrservice/signalr": ("SignalR", "SignalR services"),
    "microsoft.eventgrid/topics": ("Event Grid topic", "Event Grid topics"),
}


def category(rtype: str) -> str:
    return CATEGORY.get(rtype.lower(), "other")


def type_label(rtype: str, plural: bool = False) -> str:
    pair = LABEL.get(rtype.lower())
    if pair:
        return pair[1] if plural else pair[0]
    last = rtype.rsplit("/", 1)[-1]
    words = "".join(f" {c}" if c.isupper() else c for c in last).strip().capitalize()
    return words + ("s" if plural and not words.endswith("s") else "")


def sublabel(r: dict[str, Any]) -> str:
    """A short second line: size, SKU or kind."""
    t = str(r.get("type") or "").lower()
    props = r.get("properties") or {}
    sku = r.get("sku") or {}
    if t == "microsoft.compute/virtualmachines":
        return str((props.get("hardwareProfile") or {}).get("vmSize") or "").replace(
            "Standard_", ""
        )
    if t == "microsoft.compute/virtualmachinescalesets":
        name = str(sku.get("name") or "").replace("Standard_", "")
        return f"{name} x{sku.get('capacity')}" if sku.get("capacity") else name
    if t == "microsoft.web/serverfarms":
        return f"{sku.get('name', '')} x{sku.get('capacity', 1)}"
    if t == "microsoft.containerservice/managedclusters":
        pools = props.get("agentPoolProfiles") or []
        nodes = sum(int(p.get("count") or 0) for p in pools)
        return f"{len(pools)} pools · {nodes} nodes"
    if t == "microsoft.network/azurefirewalls":
        return str((props.get("sku") or {}).get("tier") or sku.get("tier") or "")
    if t == "microsoft.network/virtualnetworkgateways":
        return str(props.get("gatewayType") or "VPN")
    if t == "microsoft.sql/servers/databases":
        return str(sku.get("name") or "")
    if t in ("microsoft.storage/storageaccounts",):
        return str(sku.get("name") or r.get("kind") or "")
    if t == "microsoft.network/privateendpoints":
        return "private endpoint"
    for key in ("tier", "name"):
        if isinstance(sku, dict) and sku.get(key):
            return str(sku[key])
    return str(r.get("kind") or "")


def is_public_facing(rtype: str) -> bool:
    return rtype.lower() in {
        "microsoft.cdn/profiles",
        "microsoft.network/applicationgateways",
        "microsoft.network/azurefirewalls",
        "microsoft.network/frontdoors",
    }
