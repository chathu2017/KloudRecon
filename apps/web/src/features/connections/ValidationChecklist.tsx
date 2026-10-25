import { AlertTriangle, CheckCircle2, CircleDashed, Loader2, XCircle } from 'lucide-react';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ValidationCheck } from './api';
import { PENDING_CHECKS } from './content';

const STATUS: Record<
  ValidationCheck['status'],
  { icon: typeof CheckCircle2; className: string; label: string }
> = {
  pass: { icon: CheckCircle2, className: 'text-success-strong', label: 'Passed' },
  warn: { icon: AlertTriangle, className: 'text-medium-strong', label: 'Warning' },
  fail: { icon: XCircle, className: 'text-critical-strong', label: 'Failed' },
  skip: { icon: CircleDashed, className: 'text-subtle', label: 'Skipped' },
};

export function ValidationChecklist({
  checks,
  pending = false,
  className,
}: {
  checks?: ValidationCheck[] | undefined;
  pending?: boolean;
  className?: string;
}) {
  if (pending || !checks) {
    return (
      <ol
        aria-busy
        className={cn('divide-y divide-border rounded-lg border border-border', className)}
      >
        {PENDING_CHECKS.map((label, i) => (
          <li key={label} className="flex items-center gap-3 px-4 py-3 text-sm">
            {i === 0 ? (
              <Loader2 className="size-4 animate-spin text-brand-strong" aria-hidden />
            ) : (
              <CircleDashed className="size-4 text-subtle" aria-hidden />
            )}
            <span className={i === 0 ? 'text-text' : 'text-muted'}>{label}</span>
          </li>
        ))}
      </ol>
    );
  }
  return (
    <ol
      aria-label="Validation checklist"
      className={cn('divide-y divide-border rounded-lg border border-border', className)}
    >
      {checks.map((check) => {
        const s = STATUS[check.status];
        const Icon = s.icon;
        return (
          <li key={check.key} className="flex items-start gap-3 px-4 py-3">
            <Icon className={cn('mt-0.5 size-4 shrink-0', s.className)} aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">
                {check.label}
                <span className="sr-only">: {s.label}</span>
              </div>
              {check.message && <p className="mt-0.5 text-sm text-muted">{check.message}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

const CONN_STATUS: Record<string, { label: string; tone: NonNullable<BadgeProps['tone']> }> = {
  valid: { label: 'Valid', tone: 'success' },
  partially_valid: { label: 'Valid with warnings', tone: 'warning' },
  invalid: { label: 'Invalid', tone: 'danger' },
  pending: { label: 'Not validated', tone: 'neutral' },
};

/** Connection status — icon + label + color. */
export function ConnectionStatusBadge({ status }: { status: string }) {
  const s = CONN_STATUS[status] ?? { label: status, tone: 'neutral' as const };
  const Icon =
    status === 'valid'
      ? CheckCircle2
      : status === 'partially_valid'
        ? AlertTriangle
        : status === 'invalid'
          ? XCircle
          : CircleDashed;
  return (
    <Badge tone={s.tone}>
      <Icon aria-hidden />
      {s.label}
    </Badge>
  );
}

/** "•••••••• (expires in N days)" — the secret itself is never shown. */
export function SecretSummary({
  stored,
  daysLeft,
}: {
  stored: boolean;
  daysLeft: number | null | undefined;
}) {
  if (!stored) return <span className="text-muted">No secret</span>;
  const unknown = daysLeft === null || daysLeft === undefined;
  const tone = unknown
    ? 'text-muted'
    : daysLeft < 0
      ? 'text-critical-strong'
      : daysLeft <= 30
        ? 'text-medium-strong'
        : 'text-muted';
  const text = unknown
    ? 'expiry not set'
    : daysLeft < 0
      ? `expired ${Math.abs(daysLeft)} day${Math.abs(daysLeft) === 1 ? '' : 's'} ago`
      : `expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`;
  return (
    <span className="whitespace-nowrap">
      <span className="font-mono" aria-label="Secret stored">
        ••••••••
      </span>{' '}
      <span className={tone}>({text})</span>
    </span>
  );
}
