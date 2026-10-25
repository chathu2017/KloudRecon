import { Ban, CheckCircle2, Clock, XCircle, type LucideIcon } from 'lucide-react';
import { Badge, type BadgeProps } from '@/components/ui/badge';

const MAP: Record<
  string,
  { label: string; tone: NonNullable<BadgeProps['tone']>; icon: LucideIcon }
> = {
  active: { label: 'Active', tone: 'success', icon: CheckCircle2 },
  pending_approval: { label: 'Pending approval', tone: 'warning', icon: Clock },
  rejected: { label: 'Rejected', tone: 'danger', icon: XCircle },
  suspended: { label: 'Suspended', tone: 'neutral', icon: Ban },
};

/** Account / organization status — always icon + label + color (plan 14.3). */
export function StatusBadge({ status }: { status: string }) {
  const entry = MAP[status] ?? { label: status, tone: 'neutral' as const, icon: Clock };
  const Icon = entry.icon;
  return (
    <Badge tone={entry.tone}>
      <Icon aria-hidden />
      {entry.label}
    </Badge>
  );
}
