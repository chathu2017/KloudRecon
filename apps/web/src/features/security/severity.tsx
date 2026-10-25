import { CircleDot } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { FINDING_STATUS, SEVERITY, SEVERITY_META } from './severity-meta';

/** Severity is always icon + label + color (plan 14.3). */
export function SeverityBadge({ severity, className }: { severity: string; className?: string }) {
  const s = SEVERITY[severity] ?? SEVERITY_META.info;
  const Icon = s.icon;
  return (
    <Badge tone={s.tone} className={className}>
      <Icon aria-hidden />
      {s.label}
    </Badge>
  );
}

export function FindingStatusBadge({ status }: { status: string }) {
  const s = FINDING_STATUS[status] ?? { label: status, tone: 'neutral' as const, icon: CircleDot };
  const Icon = s.icon;
  return (
    <Badge tone={s.tone}>
      <Icon aria-hidden />
      {s.label}
    </Badge>
  );
}

/** Risk score 0-100 as a number with a small bar. */
export function RiskScore({ score, className }: { score: number; className?: string }) {
  const tone =
    score >= 85 ? 'bg-critical' : score >= 65 ? 'bg-high' : score >= 40 ? 'bg-medium' : 'bg-low';
  return (
    <span className={cn('inline-flex items-center gap-2', className)} title={`Risk score ${score} of 100`}>
      <span className="tabular w-7 text-right text-sm font-medium">{score}</span>
      <span className="h-1.5 w-12 overflow-hidden rounded-full bg-surface-3" aria-hidden>
        <span className={cn('block h-full rounded-full', tone)} style={{ width: `${Math.max(4, score)}%` }} />
      </span>
    </span>
  );
}
