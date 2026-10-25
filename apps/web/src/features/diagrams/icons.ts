/**
 * Resource type → official Microsoft Azure Architecture Icon (V24, `public/azure-icons`).
 * Paths are relative to the icon folder; unknown types fall back to the generic "All resources"
 * icon. Keep this the only place that knows icon file names (the draw.io and SVG exports use it).
 */
export const ICON_BASE = '/azure-icons/';
export const FALLBACK_ICON = 'general/all-resources.svg';

export const RESOURCE_ICONS: Record<string, string> = {
  // compute
  'microsoft.compute/virtualmachines': 'compute/virtual-machine.svg',
  'microsoft.compute/virtualmachinescalesets': 'compute/vm-scale-sets.svg',
  'microsoft.compute/disks': 'compute/disks.svg',
  'microsoft.compute/snapshots': 'compute/disks-snapshots.svg',
  'microsoft.compute/availabilitysets': 'compute/availability-sets.svg',
  // containers & web
  'microsoft.containerservice/managedclusters': 'containers/kubernetes-services.svg',
  'microsoft.containerregistry/registries': 'containers/container-registries.svg',
  'microsoft.app/managedenvironments': 'other/container-apps-environments.svg',
  'microsoft.app/containerapps': 'other/worker-container-app.svg',
  'microsoft.web/sites': 'app-services/app-services.svg',
  'microsoft.web/sites/functionapp': 'compute/function-apps.svg',
  'microsoft.web/serverfarms': 'app-services/app-service-plans.svg',
  'microsoft.apimanagement/service': 'integration/api-management-services.svg',
  // networking
  'microsoft.network/virtualnetworks': 'networking/virtual-networks.svg',
  'microsoft.network/azurefirewalls': 'networking/firewalls.svg',
  'microsoft.network/firewallpolicies': 'networking/azure-firewall-policy.svg',
  'microsoft.network/virtualnetworkgateways': 'networking/virtual-network-gateways.svg',
  'microsoft.network/localnetworkgateways': 'networking/local-network-gateways.svg',
  'microsoft.network/connections': 'networking/connections.svg',
  'microsoft.network/bastionhosts': 'networking/bastions.svg',
  'microsoft.network/applicationgateways': 'networking/application-gateways.svg',
  'microsoft.network/applicationgatewaywebapplicationfirewallpolicies': 'networking/web-application-firewall-policieswaf.svg',
  'microsoft.network/frontdoorwebapplicationfirewallpolicies': 'networking/web-application-firewall-policieswaf.svg',
  'microsoft.network/loadbalancers': 'networking/load-balancers.svg',
  'microsoft.network/privateendpoints': 'other/private-endpoints.svg',
  'microsoft.network/privatednszones': 'networking/dns-zones.svg',
  'microsoft.network/dnszones': 'networking/dns-zones.svg',
  'microsoft.network/publicipaddresses': 'networking/public-ip-addresses.svg',
  'microsoft.network/networksecuritygroups': 'networking/network-security-groups.svg',
  'microsoft.network/routetables': 'networking/route-tables.svg',
  'microsoft.network/natgateways': 'networking/nat.svg',
  'microsoft.network/networkinterfaces': 'networking/network-interfaces.svg',
  'microsoft.network/networkwatchers': 'networking/network-watcher.svg',
  'microsoft.network/frontdoors': 'networking/front-door-and-cdn-profiles.svg',
  'microsoft.cdn/profiles': 'networking/front-door-and-cdn-profiles.svg',
  // data & storage
  'microsoft.storage/storageaccounts': 'storage/storage-accounts.svg',
  'microsoft.sql/servers': 'databases/sql-server.svg',
  'microsoft.sql/servers/databases': 'databases/sql-database.svg',
  'microsoft.sql/managedinstances': 'databases/sql-managed-instance.svg',
  'microsoft.dbforpostgresql/flexibleservers': 'databases/azure-database-postgresql-server.svg',
  'microsoft.dbformysql/flexibleservers': 'databases/azure-database-mysql-server.svg',
  'microsoft.documentdb/databaseaccounts': 'databases/azure-cosmos-db.svg',
  'microsoft.cache/redis': 'databases/cache-redis.svg',
  // security & identity
  'microsoft.keyvault/vaults': 'security/key-vaults.svg',
  'microsoft.managedidentity/userassignedidentities': 'identity/managed-identities.svg',
  // monitoring & management
  'microsoft.operationalinsights/workspaces': 'monitor/log-analytics-workspaces.svg',
  'microsoft.insights/components': 'monitor/application-insights.svg',
  'microsoft.insights/actiongroups': 'management-and-governance/alerts.svg',
  'microsoft.recoveryservices/vaults': 'management-and-governance/recovery-services-vaults.svg',
  'microsoft.automation/automationaccounts': 'management-and-governance/automation-accounts.svg',
  // integration
  'microsoft.eventhub/namespaces': 'analytics/event-hubs.svg',
  'microsoft.servicebus/namespaces': 'integration/azure-service-bus.svg',
  'microsoft.datafactory/factories': 'databases/data-factories.svg',
  // hierarchy & containers
  'microsoft.resources/subscriptions': 'general/subscriptions.svg',
  'microsoft.management/managementgroups': 'general/management-groups.svg',
  'external/onprem': 'general/server-farm.svg',
};

/** Icons shown in container headers (group kind → icon). */
export const GROUP_ICONS: Record<string, string> = {
  subscription: 'general/subscriptions.svg',
  rg: 'general/resource-groups.svg',
  vnet: 'networking/virtual-networks.svg',
  subnet: 'networking/subnet.svg',
  region: 'general/region-management.svg',
  mg: 'general/management-groups.svg',
  machine: 'compute/virtual-machine.svg',
};

export function iconPath(type: string, kind?: string): string {
  const key = type.toLowerCase();
  if (kind && RESOURCE_ICONS[`${key}/${kind.toLowerCase()}`]) return RESOURCE_ICONS[`${key}/${kind.toLowerCase()}`] ?? FALLBACK_ICON;
  return RESOURCE_ICONS[key] ?? FALLBACK_ICON;
}

export function iconUrl(type: string, kind?: string): string {
  return ICON_BASE + iconPath(type, kind);
}

export function groupIconUrl(kind: string): string | null {
  const path = GROUP_ICONS[kind];
  return path ? ICON_BASE + path : null;
}
