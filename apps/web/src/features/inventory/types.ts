import {
  Activity,
  AppWindow,
  Archive,
  Blocks,
  Box,
  Boxes,
  Cloud,
  Database,
  Disc,
  Factory,
  FolderOpen,
  Gauge,
  Globe,
  HardDrive,
  KeyRound,
  Layers,
  ListTree,
  Lock,
  MessagesSquare,
  Network,
  PlugZap,
  Route,
  Server,
  Shield,
  ShieldCheck,
  Split,
  Waypoints,
  Workflow,
  type LucideIcon,
} from 'lucide-react';

interface TypeInfo {
  label: string;
  icon: LucideIcon;
}

/** Friendly names and icons for common resource types (official Azure icons arrive with diagrams). */
const TYPES: Record<string, TypeInfo> = {
  'microsoft.compute/virtualmachines': { label: 'Virtual machine', icon: Server },
  'microsoft.compute/virtualmachines/extensions': { label: 'VM extension', icon: Blocks },
  'microsoft.compute/virtualmachinescalesets': { label: 'VM scale set', icon: Boxes },
  'microsoft.compute/disks': { label: 'Managed disk', icon: HardDrive },
  'microsoft.compute/snapshots': { label: 'Disk snapshot', icon: Disc },
  'microsoft.compute/availabilitysets': { label: 'Availability set', icon: Layers },
  'microsoft.network/virtualnetworks': { label: 'Virtual network', icon: Network },
  'microsoft.network/networkinterfaces': { label: 'Network interface', icon: PlugZap },
  'microsoft.network/networksecuritygroups': { label: 'Network security group', icon: Shield },
  'microsoft.network/publicipaddresses': { label: 'Public IP address', icon: Globe },
  'microsoft.network/routetables': { label: 'Route table', icon: Route },
  'microsoft.network/loadbalancers': { label: 'Load balancer', icon: Split },
  'microsoft.network/applicationgateways': { label: 'Application gateway', icon: Split },
  'microsoft.network/azurefirewalls': { label: 'Azure Firewall', icon: ShieldCheck },
  'microsoft.network/firewallpolicies': { label: 'Firewall policy', icon: ShieldCheck },
  'microsoft.network/virtualnetworkgateways': { label: 'Virtual network gateway', icon: Waypoints },
  'microsoft.network/localnetworkgateways': { label: 'Local network gateway', icon: Waypoints },
  'microsoft.network/connections': { label: 'VPN connection', icon: Waypoints },
  'microsoft.network/bastionhosts': { label: 'Bastion', icon: Lock },
  'microsoft.network/privateendpoints': { label: 'Private endpoint', icon: PlugZap },
  'microsoft.network/privatednszones': { label: 'Private DNS zone', icon: ListTree },
  'microsoft.network/privatednszones/virtualnetworklinks': {
    label: 'DNS VNet link',
    icon: ListTree,
  },
  'microsoft.network/networkwatchers': { label: 'Network Watcher', icon: Activity },
  'microsoft.cdn/profiles': { label: 'Front Door / CDN profile', icon: Globe },
  'microsoft.storage/storageaccounts': { label: 'Storage account', icon: Archive },
  'microsoft.keyvault/vaults': { label: 'Key vault', icon: KeyRound },
  'microsoft.sql/servers': { label: 'SQL server', icon: Database },
  'microsoft.sql/servers/databases': { label: 'SQL database', icon: Database },
  'microsoft.dbforpostgresql/flexibleservers': {
    label: 'PostgreSQL flexible server',
    icon: Database,
  },
  'microsoft.documentdb/databaseaccounts': { label: 'Cosmos DB account', icon: Database },
  'microsoft.cache/redis': { label: 'Redis cache', icon: Database },
  'microsoft.web/serverfarms': { label: 'App Service plan', icon: Layers },
  'microsoft.web/sites': { label: 'App Service', icon: AppWindow },
  'microsoft.containerservice/managedclusters': { label: 'Kubernetes service', icon: Boxes },
  'microsoft.containerregistry/registries': { label: 'Container registry', icon: Box },
  'microsoft.app/managedenvironments': { label: 'Container Apps environment', icon: Boxes },
  'microsoft.app/containerapps': { label: 'Container app', icon: Box },
  'microsoft.managedidentity/userassignedidentities': { label: 'Managed identity', icon: KeyRound },
  'microsoft.operationalinsights/workspaces': { label: 'Log Analytics workspace', icon: Gauge },
  'microsoft.insights/components': { label: 'Application Insights', icon: Activity },
  'microsoft.insights/actiongroups': { label: 'Action group', icon: MessagesSquare },
  'microsoft.recoveryservices/vaults': { label: 'Recovery Services vault', icon: Archive },
  'microsoft.automation/automationaccounts': { label: 'Automation account', icon: Workflow },
  'microsoft.eventhub/namespaces': { label: 'Event Hubs namespace', icon: MessagesSquare },
  'microsoft.servicebus/namespaces': { label: 'Service Bus namespace', icon: MessagesSquare },
  'microsoft.datafactory/factories': { label: 'Data factory', icon: Factory },
  'microsoft.resources/resourcegroups': { label: 'Resource group', icon: FolderOpen },
};

function fallbackLabel(type: string): string {
  const last = type.split('/').pop() ?? type;
  const words = last.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/s$/, '');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function typeInfo(type: string | null | undefined): TypeInfo {
  const key = (type ?? '').toLowerCase();
  return TYPES[key] ?? { label: fallbackLabel(key), icon: Cloud };
}

/** "Standard_D4s_v5" etc. Location codes to readable names. */
export function locationLabel(location: string | null | undefined): string {
  if (!location) return '—';
  const map: Record<string, string> = {
    eastus: 'East US',
    eastus2: 'East US 2',
    westus: 'West US',
    westus2: 'West US 2',
    westus3: 'West US 3',
    centralus: 'Central US',
    northeurope: 'North Europe',
    westeurope: 'West Europe',
    uksouth: 'UK South',
    ukwest: 'UK West',
    southeastasia: 'Southeast Asia',
    eastasia: 'East Asia',
    australiaeast: 'Australia East',
    japaneast: 'Japan East',
    canadacentral: 'Canada Central',
    germanywestcentral: 'Germany West Central',
    swedencentral: 'Sweden Central',
    francecentral: 'France Central',
    centralindia: 'Central India',
    brazilsouth: 'Brazil South',
    global: 'Global',
  };
  return map[location] ?? location;
}

export const EDGE_LABELS: Record<string, string> = {
  peering: 'VNet peering',
  subnet_nsg: 'Subnet NSG',
  subnet_route_table: 'Subnet route table',
  in_subnet: 'In subnet',
  public_ip: 'Public IP',
  nic: 'Network interface',
  nsg: 'Network security group',
  disk: 'Disk',
  availability_set: 'Availability set',
  lb_backend: 'Load balancer backend',
  appgw_backend: 'App Gateway backend',
  waf_policy: 'WAF policy',
  firewall_policy: 'Firewall policy',
  gateway: 'Gateway',
  private_link: 'Private link',
  dns_link: 'DNS link',
  hosted_on: 'Hosted on',
  vnet_integration: 'VNet integration',
  kubelet_identity: 'Kubelet identity',
  uses_identity: 'Managed identity',
  logs_to: 'Sends logs to',
  managed_by: 'Managed by',
  child_of: 'Part of',
};
