import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  Clock,
  Info,
  PlayCircle,
  ShieldAlert,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react';
import type { BadgeProps } from '@/components/ui/badge';

type Tone = NonNullable<BadgeProps['tone']>;

export const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'] as const;
export type SeverityKey = (typeof SEVERITIES)[number];

interface SeverityMeta {
  label: string;
  tone: Tone;
  icon: LucideIcon;
  text: string;
  bg: string;
}

export const SEVERITY_META: Record<SeverityKey, SeverityMeta> = {
  critical: { label: 'Critical', tone: 'danger', icon: AlertOctagon, text: 'text-critical-strong', bg: 'bg-critical' },
  high: { label: 'High', tone: 'high', icon: AlertTriangle, text: 'text-high-strong', bg: 'bg-high' },
  medium: { label: 'Medium', tone: 'warning', icon: AlertTriangle, text: 'text-medium-strong', bg: 'bg-medium' },
  low: { label: 'Low', tone: 'low', icon: Info, text: 'text-low-strong', bg: 'bg-low' },
  info: { label: 'Info', tone: 'info', icon: CircleDot, text: 'text-info-strong', bg: 'bg-info' },
};

/** Lookup by any severity string (unknown values fall back at the call site). */
export const SEVERITY: Partial<Record<string, SeverityMeta>> = SEVERITY_META;

export const FINDING_STATUS: Record<string, { label: string; tone: Tone; icon: LucideIcon }> = {
  open: { label: 'Open', tone: 'neutral', icon: ShieldAlert },
  in_progress: { label: 'In progress', tone: 'brand', icon: PlayCircle },
  resolved: { label: 'Resolved', tone: 'success', icon: CheckCircle2 },
  accepted_risk: { label: 'Accepted risk', tone: 'warning', icon: ShieldCheck },
  pending: { label: 'Pending approval', tone: 'warning', icon: Clock },
  approved: { label: 'Approved', tone: 'success', icon: CheckCircle2 },
  rejected: { label: 'Rejected', tone: 'danger', icon: AlertOctagon },
  revoked: { label: 'Revoked', tone: 'neutral', icon: CircleDot },
  expired: { label: 'Expired', tone: 'neutral', icon: Clock },
};

export const SOURCE_LABEL: Record<string, string> = {
  rule: 'KloudRecon rule',
  custom: 'Custom rule',
  defender: 'Defender for Cloud',
  advisor: 'Azure Advisor',
  toxic: 'Toxic combination',
};

export const PILLAR_LABEL: Record<string, string> = {
  security: 'Security',
  reliability: 'Reliability',
  cost: 'Cost',
  operations: 'Operational excellence',
  performance: 'Performance',
  governance: 'Governance',
};

export function gradeTone(grade: string | null | undefined): string {
  switch (grade) {
    case 'A':
      return 'text-success-strong';
    case 'B':
      return 'text-low-strong';
    case 'C':
      return 'text-medium-strong';
    case 'D':
      return 'text-high-strong';
    case 'E':
      return 'text-critical-strong';
    default:
      return 'text-muted';
  }
}
