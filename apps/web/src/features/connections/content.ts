/** Static wizard content (plan 7.2 / 7.3). */

export const TIERS = [
  {
    key: 'core',
    title: 'Core',
    badge: 'Required',
    grant: 'Reader role on subscriptions or a management group',
    unlocks:
      'Inventory, changes, diagrams, security checks, attack paths, RBAC analysis, Defender, Advisor and Policy import, cost, rightsizing, reliability and governance.',
  },
  {
    key: 'identity',
    title: 'Identity',
    badge: 'Optional',
    grant: 'Microsoft Graph application permissions with admin consent (listed below)',
    unlocks:
      'Entra ID posture: MFA coverage, Conditional Access gaps, admins, guests, stale or expiring app credentials. Some reports need Entra ID P1/P2.',
  },
  {
    key: 'commitments',
    title: 'Commitments',
    badge: 'Optional',
    grant: 'Reservations Reader (tenant level) and/or Billing Reader',
    unlocks: 'Utilization of your existing reservations and savings plans.',
  },
] as const;

export type TierKey = (typeof TIERS)[number]['key'];

export const GRAPH_PERMISSIONS = [
  'User.Read.All',
  'Group.Read.All',
  'Application.Read.All',
  'Policy.Read.All',
  'RoleManagement.Read.Directory',
  'AuditLog.Read.All',
];

export const PORTAL_STEPS = [
  {
    title: 'Create an app registration',
    text: 'Microsoft Entra ID → App registrations → New registration. Name it "KloudRecon-Reader", choose "Accounts in this organizational directory only" (single tenant) and register.',
  },
  {
    title: 'Copy the IDs',
    text: 'On the Overview page, copy the Application (client) ID and the Directory (tenant) ID.',
  },
  {
    title: 'Create a client secret',
    text: 'Certificates & secrets → New client secret → 12 months. Copy the Value column right away (it is shown only once). Do not copy the Secret ID.',
  },
  {
    title: 'Assign the Reader role',
    text: 'Open your subscription (or management group) → Access control (IAM) → Add role assignment → Reader → Members: select "KloudRecon-Reader" → Review + assign.',
  },
  {
    title: 'Optional: Identity tier',
    text: 'App registration → API permissions → Add a permission → Microsoft Graph → Application permissions → add the permissions below → Grant admin consent.',
  },
];

export function cliCommands(subscriptionId: string): string {
  const sub = subscriptionId.trim() || '<SUBSCRIPTION_ID>';
  return [
    '# Azure Cloud Shell (Bash): creates the app, a 1-year secret and the Reader role.',
    `az ad sp create-for-rbac --name "KloudRecon-Reader" --role Reader --scopes /subscriptions/${sub} --years 1`,
    '',
    '# The output shows appId (Client ID), password (secret Value) and tenant (Tenant ID).',
    '# More subscriptions: assign Reader to the same app.',
    'az role assignment create --assignee <APP_ID> --role Reader --scope /subscriptions/<OTHER_SUBSCRIPTION_ID>',
    '',
    '# Or a whole management group:',
    'az role assignment create --assignee <APP_ID> --role Reader --scope /providers/Microsoft.Management/managementGroups/<MG_ID>',
  ].join('\n');
}

export const KNOWN_LIMITS = [
  'New role assignments take 5–10 minutes to apply. If no subscriptions show up, wait and validate again.',
  'CSP subscriptions may not expose cost data to the customer tenant.',
  'Sponsorship and Free Trial subscriptions have limited Cost Management API support.',
  'KloudRecon never needs write access. Reader cannot read secrets, keys, app settings or data.',
];

/** Placeholder rows while Save & Validate runs (the request is synchronous, ~25 s max). */
export const PENDING_CHECKS = [
  'Sign in with the app registration',
  'Find subscriptions',
  'Check effective permissions (read-only)',
  'Query Azure Resource Graph',
  'Read Cost Management data (last 7 days)',
  'Read Microsoft Defender secure score',
];
