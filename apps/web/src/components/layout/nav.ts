import {
  Activity,
  BarChart3,
  BellRing,
  CalendarX,
  Flag,
  HeartPulse,
  Mail,
  Megaphone,
  Cable,
  Bell,
  Building2,
  ClipboardList,
  CreditCard,
  FileText,
  GitCompareArrows,
  Gauge,
  KeyRound,
  Landmark,
  LayoutDashboard,
  Lightbulb,
  Network,
  ScrollText,
  Server,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Bug,
  Code2,
  Route,
  ShieldHalf,
  Siren,
  SlidersHorizontal,
  Sparkles,
  Palette,
  Radar,
  UserCircle,
  Users,
  UserCheck,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  /** Planned module, shown but not yet available (feature-flagged). */
  soon?: boolean;
  /** Minimum org role. */
  minRole?: 'viewer' | 'member' | 'admin' | 'owner';
  badgeKey?: 'pendingApprovals';
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

/** Customer navigation (plan 14.4). Modules from later phases show a "Soon" badge. */
export const appNav: NavSection[] = [
  {
    items: [
      { label: 'Overview', to: '/app', icon: LayoutDashboard },
      { label: 'Inventory', to: '/app/inventory', icon: Server },
      { label: 'Changes', to: '/app/changes', icon: GitCompareArrows },
      { label: 'Diagrams', to: '/app/diagrams', icon: Network },
    ],
  },
  {
    title: 'Security',
    items: [
      { label: 'Findings', to: '/app/security/findings', icon: ShieldAlert },
      { label: 'Attack paths', to: '/app/security/attack-paths', icon: Route },
      { label: 'Exposure', to: '/app/security/exposure', icon: Radar },
      { label: 'Identity', to: '/app/security/identity', icon: KeyRound },
      { label: 'Vulnerabilities', to: '/app/security/vulnerabilities', icon: Bug },
      { label: 'Threat signals', to: '/app/security/threats', icon: Siren },
      { label: 'Coverage', to: '/app/security/coverage', icon: ShieldHalf },
      { label: 'Compliance', to: '/app/security/compliance', icon: ShieldCheck },
    ],
  },
  {
    title: 'Operate',
    items: [
      { label: 'Reliability', to: '/app/reliability', icon: Activity },
      { label: 'Governance', to: '/app/governance', icon: Landmark },
      { label: 'Server health', to: '/app/server-health', icon: HeartPulse },
      { label: 'Cost & FinOps', to: '/app/cost', icon: BarChart3 },
      { label: 'Recommendations', to: '/app/recommendations', icon: Lightbulb },
      { label: 'Reports', to: '/app/reports', icon: FileText },
    ],
  },
  {
    title: 'Settings',
    items: [
      { label: 'Connections', to: '/app/settings/connections', icon: Cable },
      { label: 'Team', to: '/app/settings/team', icon: Users },
      { label: 'Governance', to: '/app/settings/governance', icon: SlidersHorizontal },
      { label: 'Custom rules', to: '/app/settings/custom-rules', icon: Code2 },
      { label: 'Alerts', to: '/app/settings/alerts', icon: BellRing },
      { label: 'AI', to: '/app/settings/ai', icon: Sparkles },
      { label: 'Report branding', to: '/app/settings/branding', icon: Palette },
      { label: 'Billing & plan', to: '/app/settings/billing', icon: CreditCard },
      { label: 'Profile', to: '/app/settings/profile', icon: UserCircle },
      { label: 'Notifications', to: '/app/notifications', icon: Bell },
      { label: 'Audit log', to: '/app/settings/audit', icon: ScrollText, minRole: 'admin' },
    ],
  },
];

/** Platform Owner console (plan 9.13). */
export const ownerNav: NavSection[] = [
  {
    items: [
      { label: 'Overview', to: '/owner', icon: Gauge },
      {
        label: 'Approvals',
        to: '/owner/approvals',
        icon: UserCheck,
        badgeKey: 'pendingApprovals',
      },
      { label: 'Organizations', to: '/owner/orgs', icon: Building2 },
      { label: 'Users', to: '/owner/users', icon: Users },
      { label: 'Plans', to: '/owner/plans', icon: CreditCard },
      { label: 'Business', to: '/owner/business', icon: BarChart3 },
    ],
  },
  {
    title: 'Platform',
    items: [
      { label: 'System health', to: '/owner/health', icon: HeartPulse },
      { label: 'Announcements', to: '/owner/announcements', icon: Megaphone },
      { label: 'Feature flags', to: '/owner/feature-flags', icon: Flag },
      { label: 'Email templates', to: '/owner/email-templates', icon: Mail },
      { label: 'Retirement catalog', to: '/owner/retirements', icon: CalendarX },
      { label: 'Audit log', to: '/owner/audit', icon: ClipboardList },
    ],
  },
  {
    title: 'Account',
    items: [
      { label: 'Notifications', to: '/owner/notifications', icon: Bell },
      { label: 'Settings', to: '/owner/profile', icon: Settings },
    ],
  },
];

export const ROLE_RANK = { viewer: 0, member: 1, admin: 2, owner: 3 } as const;

export function hasRole(role: string | null | undefined, min: keyof typeof ROLE_RANK): boolean {
  if (!role || !(role in ROLE_RANK)) return false;
  return ROLE_RANK[role as keyof typeof ROLE_RANK] >= ROLE_RANK[min];
}
