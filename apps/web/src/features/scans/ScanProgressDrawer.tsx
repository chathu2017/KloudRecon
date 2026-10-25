import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Clock,
  Loader2,
  MinusCircle,
  X,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/misc';
import { formatDateTime, formatElapsed } from '@/lib/format';
import { useUi } from '@/lib/ui-store';
import { cn } from '@/lib/utils';
import { useScan, type ScanStage } from './api';

const SCAN_STATUS: Record<
  string,
  { label: string; tone: NonNullable<BadgeProps['tone']>; icon: LucideIcon }
> = {
  queued: { label: 'Queued', tone: 'neutral', icon: Clock },
  running: { label: 'Running', tone: 'brand', icon: Loader2 },
  succeeded: { label: 'Succeeded', tone: 'success', icon: CheckCircle2 },
  partial: { label: 'Partial', tone: 'warning', icon: AlertTriangle },
  failed: { label: 'Failed', tone: 'danger', icon: XCircle },
};

/** Scan status — icon + label + color. */
export function ScanStatusBadge({ status }: { status: string }) {
  const s = SCAN_STATUS[status] ?? { label: status, tone: 'neutral' as const, icon: Clock };
  const Icon = s.icon;
  return (
    <Badge tone={s.tone}>
      <Icon className={cn(status === 'running' && 'animate-spin')} aria-hidden />
      {s.label}
    </Badge>
  );
}

const STAGE_ICON: Record<string, { icon: LucideIcon; className: string; label: string }> = {
  pending: { icon: CircleDashed, className: 'text-subtle', label: 'Pending' },
  running: { icon: Loader2, className: 'animate-spin text-brand-strong', label: 'Running' },
  succeeded: { icon: CheckCircle2, className: 'text-success-strong', label: 'Done' },
  warning: { icon: AlertTriangle, className: 'text-medium-strong', label: 'Done with warnings' },
  failed: { icon: XCircle, className: 'text-critical-strong', label: 'Failed' },
  skipped: { icon: MinusCircle, className: 'text-subtle', label: 'Skipped' },
};

export function StageList({ stages }: { stages: ScanStage[] }) {
  return (
    <ol aria-label="Scan stages" className="divide-y divide-border rounded-lg border border-border">
      {stages.map((stage) => {
        const s = STAGE_ICON[stage.status] ?? STAGE_ICON.pending;
        if (!s) return null;
        const Icon = s.icon;
        return (
          <li key={stage.stage} className="flex items-start gap-3 px-4 py-3">
            <Icon className={cn('mt-0.5 size-4 shrink-0', s.className)} aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2 text-sm font-medium">
                <span>
                  {stage.title}
                  {stage.optional && <span className="ml-1.5 text-xs text-subtle">optional</span>}
                  <span className="sr-only">: {s.label}</span>
                </span>
                {stage.items !== null && stage.items > 0 && stage.status !== 'running' && (
                  <span className="text-xs tabular text-muted">{stage.items.toLocaleString()}</span>
                )}
              </div>
              {stage.message && <p className="mt-0.5 text-sm text-muted">{stage.message}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function ProgressBar({ value, status }: { value: number; status: string }) {
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      aria-label="Scan progress"
      className="h-2 w-full overflow-hidden rounded-full bg-surface-2"
    >
      <div
        className={cn(
          'h-full rounded-full transition-[width] duration-500',
          status === 'failed' ? 'bg-critical' : status === 'partial' ? 'bg-medium' : 'bg-brand',
        )}
        style={{ width: `${Math.max(2, value)}%` }}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string | undefined }) {
  return (
    <div className="rounded-md border border-border px-3 py-2">
      <div className="text-xs text-muted">{label}</div>
      <div className="text-lg font-semibold tabular">
        {typeof value === 'number' ? value.toLocaleString() : (value ?? '—')}
      </div>
    </div>
  );
}

function num(stats: Record<string, unknown>, key: string): number | undefined {
  const v = stats[key];
  return typeof v === 'number' ? v : undefined;
}

/** Right-side sheet with the live stage checklist of one scan (plan 8.4). */
export function ScanProgressDrawer() {
  const scanId = useUi((s) => s.scanDrawerId);
  const open = useUi((s) => s.openScanDrawer);
  const { data: scan, isPending } = useScan(scanId);
  const done = scan && ['succeeded', 'partial', 'failed'].includes(scan.status);
  const stats = scan?.stats ?? {};
  const changes = (stats.changes ?? {}) as Record<string, unknown>;
  const partial = Array.isArray(scan?.error?.partial) ? (scan.error.partial as string[]) : [];
  const failure = typeof scan?.error?.message === 'string' ? scan.error.message : null;

  return (
    <DialogPrimitive.Root open={!!scanId} onOpenChange={(v) => !v && open(null)}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-overlay" />
        <DialogPrimitive.Content className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-border bg-surface shadow-lg focus:outline-none data-[state=open]:animate-[kr-slide-in-right_250ms_var(--ease-out)]">
          <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
            <div className="min-w-0">
              <DialogPrimitive.Title className="font-display text-lg font-semibold">
                {scan ? `Scan #${scan.sequence}` : 'Scan'}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="truncate text-sm text-muted">
                {scan?.connection_name ?? 'Azure connection'} ·{' '}
                {scan ? formatDateTime(scan.started_at ?? scan.created_at) : ''}
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Close">
                <X />
              </Button>
            </DialogPrimitive.Close>
          </div>
          <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
            {isPending || !scan ? (
              <Skeleton className="h-72" />
            ) : (
              <>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <ScanStatusBadge status={scan.status} />
                    <span className="text-sm tabular text-muted">{scan.progress}%</span>
                  </div>
                  <ProgressBar value={scan.progress} status={scan.status} />
                  {scan.status === 'queued' && (
                    <p className="text-sm text-muted">Waiting for a worker to pick up the scan…</p>
                  )}
                </div>
                {failure && (
                  <div
                    role="alert"
                    className="rounded-md border border-critical/30 bg-critical-soft p-3 text-sm text-critical-strong"
                  >
                    {failure}
                  </div>
                )}
                {partial.length > 0 && (
                  <div className="rounded-md border border-medium/30 bg-medium-soft p-3 text-sm">
                    <div className="font-medium text-medium-strong">Some optional steps did not run</div>
                    <ul className="mt-1 list-disc pl-5 text-muted">
                      {partial.map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {done && scan.status !== 'failed' && (
                  <div className="grid grid-cols-2 gap-2">
                    <Stat label="Resources" value={num(stats, 'resources')} />
                    <Stat label="Subscriptions" value={num(stats, 'subscriptions')} />
                    <Stat
                      label="Changes"
                      value={
                        changes.baseline === true
                          ? 'Baseline'
                          : (num(changes, 'created') ?? 0) +
                            (num(changes, 'deleted') ?? 0) +
                            (num(changes, 'modified') ?? 0)
                      }
                    />
                    <Stat label="Risky changes" value={num(changes, 'risky') ?? 0} />
                  </div>
                )}
                <StageList stages={scan.stages} />
                {done && (
                  <p className="text-xs text-muted">
                    Took {formatElapsed(num(stats, 'duration_ms') ?? 0)}
                    {typeof (stats.azure as Record<string, unknown> | undefined)?.throttled ===
                      'number' &&
                      ` · ${String((stats.azure as Record<string, number>).throttled)} throttled requests`}
                  </p>
                )}
              </>
            )}
          </div>
          {done && scan.status !== 'failed' && (
            <div className="flex gap-2 border-t border-border px-5 py-3">
              <Button asChild className="flex-1" onClick={() => open(null)}>
                <Link to="/app/inventory">View inventory</Link>
              </Button>
              <Button asChild variant="secondary" className="flex-1" onClick={() => open(null)}>
                <Link to="/app/changes">View changes</Link>
              </Button>
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
