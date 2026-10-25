import { AlertTriangle, Minus, Pencil, Plus, Zap, type LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip } from '@/components/ui/misc';
import type { Change } from '@/features/inventory/api';
import { typeInfo } from '@/features/inventory/types';
import { cn } from '@/lib/utils';
import { FieldDiff } from './FieldDiff';
import { changeFields, operationLabel } from './format';

const KIND: Record<string, { icon: LucideIcon; label: string; className: string }> = {
  created: { icon: Plus, label: 'Created', className: 'bg-success-soft text-success-strong' },
  deleted: { icon: Minus, label: 'Deleted', className: 'bg-critical-soft text-critical-strong' },
  modified: { icon: Pencil, label: 'Modified', className: 'bg-brand-soft text-brand-strong' },
  action: { icon: Zap, label: 'Action', className: 'bg-info-soft text-info-strong' },
};

export function ChangeKindIcon({ change }: { change: Change }) {
  const kind = KIND[change.change_type] ?? KIND.modified;
  if (!kind) return null;
  const Icon = kind.icon;
  return (
    <span
      className={cn(
        'flex size-7 shrink-0 items-center justify-center rounded-full',
        kind.className,
      )}
      aria-label={kind.label}
      role="img"
    >
      <Icon className="size-3.5" aria-hidden />
    </span>
  );
}

export function ChangeRow({
  change,
  onOpenResource,
  showResource = true,
  showDate = false,
}: {
  change: Change;
  onOpenResource?: (armId: string) => void;
  showResource?: boolean;
  showDate?: boolean;
}) {
  const kind = KIND[change.change_type] ?? KIND.modified;
  const fields = changeFields(change);
  const at = new Date(change.occurred_at);
  const time = showDate
    ? at.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const info = typeInfo(change.resource_type);
  return (
    <li
      className={cn(
        'flex gap-3 px-4 py-3',
        change.risky && 'bg-critical-soft/40 shadow-[inset_3px_0_0_var(--critical)]',
      )}
    >
      <ChangeKindIcon change={change} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span className="font-medium">{kind?.label}</span>
          {showResource &&
            (onOpenResource && change.change_type !== 'deleted' ? (
              <button
                type="button"
                className="truncate font-medium text-brand-strong hover:underline"
                onClick={() => onOpenResource(change.arm_id)}
              >
                {change.resource_name}
              </button>
            ) : (
              <span className="truncate font-medium">{change.resource_name}</span>
            ))}
          {showResource && <span className="text-xs text-muted">{info.label}</span>}
          {change.source === 'activity_log' && <Badge tone="neutral">Activity Log</Badge>}
          {change.risky && (
            <Badge tone="danger">
              <AlertTriangle aria-hidden /> Risky
            </Badge>
          )}
        </div>
        {change.risk_reason && <p className="mt-0.5 text-sm text-critical-strong">{change.risk_reason}</p>}
        {fields.length > 0 && (
          <ul className="mt-1 space-y-0.5 font-mono text-xs text-muted">
            {fields.slice(0, 3).map((f) => (
              <FieldDiff key={f.path} path={f.path} before={f.before} after={f.after} />
            ))}
            {fields.length > 3 && <li>+{fields.length - 3} more</li>}
          </ul>
        )}
        {change.operation && fields.length === 0 && (
          <p className="mt-0.5 font-mono text-xs text-muted">{operationLabel(change.operation)}</p>
        )}
        <p className="mt-1 text-xs text-subtle">
          {change.resource_group ? `${change.resource_group} · ` : ''}
          {change.caller ? (
            <Tooltip
              content={
                change.caller_type === 'service_principal'
                  ? 'Service principal (app ID)'
                  : 'Caller from the Activity Log'
              }
            >
              <span className="text-muted">by {change.caller}</span>
            </Tooltip>
          ) : (
            'caller unknown'
          )}
        </p>
      </div>
      <time className="shrink-0 text-xs tabular text-muted" dateTime={change.occurred_at}>
        {time}
      </time>
    </li>
  );
}
