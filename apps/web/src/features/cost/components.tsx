import * as React from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  CircleDot,
  Minus,
  Tag,
  type LucideIcon,
} from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { PageHeader, Tooltip } from '@/components/ui/misc';
import { money } from '@/components/charts/theme';
import { ResourceDrawer } from '@/features/inventory/ResourceDrawer';
import { cn } from '@/lib/utils';
import { useTrackSaving, type SavingsIn } from './api';

const TABS: { to: string; label: string; end?: boolean }[] = [
  { to: '/app/cost', label: 'Explorer', end: true },
  { to: '/app/cost/forecast', label: 'Forecast & budgets' },
  { to: '/app/cost/anomalies', label: 'Anomalies' },
  { to: '/app/cost/rightsizing', label: 'Rightsizing' },
  { to: '/app/cost/waste', label: 'Waste' },
  { to: '/app/cost/commitments', label: 'Commitments' },
  { to: '/app/cost/whatif', label: 'What-if' },
  { to: '/app/cost/showback', label: 'Showback' },
  { to: '/app/cost/savings', label: 'Savings tracker' },
];

/** Cost & FinOps shell: page title and the module's sub-navigation. */
export function CostLayout() {
  return (
    <>
      <PageHeader
        title="Cost & FinOps"
        description="Actual and amortized spend, forecasts, anomalies and savings from rightsizing, waste and commitments."
      />
      <nav
        aria-label="Cost & FinOps"
        className="-mx-1 mb-6 flex gap-1 overflow-x-auto border-b border-border pb-px pr-6 [mask-image:linear-gradient(to_right,black_calc(100%-28px),transparent)] [scrollbar-width:none] md:pr-0 md:[mask-image:none]"
      >
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              cn(
                'relative flex min-h-10 shrink-0 items-center rounded-md px-3 text-sm font-medium text-muted transition-colors hover:text-text pointer-coarse:min-h-11',
                isActive &&
                  'text-brand-strong after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-brand',
              )
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
      <ResourceDrawer />
    </>
  );
}

export function Kpi({
  icon: Icon,
  label,
  value,
  hint,
  tone,
}: {
  icon?: LucideIcon;
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: 'success' | 'critical';
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-muted">
        {Icon && <Icon className="size-3.5" aria-hidden />}
        {label}
      </div>
      <div
        className={cn(
          'mt-2 kpi-value',
          tone === 'success' && 'text-success-strong',
          tone === 'critical' && 'text-critical-strong',
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </Card>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  size = 'md',
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex rounded-md border border-border bg-surface-2 p-0.5"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'whitespace-nowrap rounded px-2.5 font-medium text-muted transition-colors hover:text-text',
            size === 'sm' ? 'h-7 text-xs' : 'h-8 text-sm',
            value === o.value && 'bg-surface text-text shadow-sm',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Change against a previous value; spend going up is shown as the "bad" direction. */
export function Delta({
  pct,
  value,
  currency,
  inverse = false,
}: {
  pct?: number | null;
  value?: number;
  currency?: string;
  inverse?: boolean;
}) {
  if ((pct === null || pct === undefined) && value === undefined)
    return <span className="text-muted">—</span>;
  const n = pct ?? value ?? 0;
  const up = n > 0.05;
  const down = n < -0.05;
  const bad = inverse ? down : up;
  const Icon = up ? ArrowUpRight : down ? ArrowDownRight : Minus;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 tabular',
        bad ? 'text-critical-strong' : up || down ? 'text-success-strong' : 'text-muted',
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {pct !== undefined && pct !== null
        ? `${Math.abs(pct).toFixed(1)}%`
        : money(Math.abs(value ?? 0), currency)}
      <span className="sr-only">{up ? 'increase' : down ? 'decrease' : 'no change'}</span>
    </span>
  );
}

export function ConfidenceBadge({ value }: { value: string }) {
  const tone = value === 'high' ? 'success' : value === 'medium' ? 'warning' : 'neutral';
  return (
    <Badge tone={tone}>
      <CircleDot aria-hidden /> {value[0]?.toUpperCase()}
      {value.slice(1)} confidence
    </Badge>
  );
}

export function PriceSource({ source }: { source: string }) {
  return source === 'retail' ? (
    <Tooltip content="Priced with the Azure Retail Prices API (cached).">
      <span className="inline-flex">
        <Badge tone="brand">
          <Tag aria-hidden /> Retail price
        </Badge>
      </span>
    </Tooltip>
  ) : (
    <Tooltip content="Built-in list price estimate (the Retail Prices API had no answer or is off).">
      <span className="inline-flex">
        <Badge tone="neutral">
          <Tag aria-hidden /> Catalog estimate
        </Badge>
      </span>
    </Tooltip>
  );
}

export function TrackButton({
  body,
  tracked,
  disabled,
}: {
  body: SavingsIn;
  tracked: boolean;
  disabled?: boolean;
}) {
  const track = useTrackSaving();
  if (tracked) {
    return (
      <Badge tone="success">
        <CheckCircle2 aria-hidden /> Tracked
      </Badge>
    );
  }
  return (
    <Button
      size="sm"
      variant="secondary"
      loading={track.isPending}
      disabled={disabled}
      title="I implemented this: track the realized saving from later cost data"
      onClick={() => track.mutate(body)}
    >
      <Check aria-hidden /> Track saving
    </Button>
  );
}

export function SkuChange({ from, to }: { from: string; to: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap font-mono text-xs">
      <span className="rounded bg-surface-2 px-1.5 py-0.5">{from}</span>
      <span aria-hidden className="text-subtle">
        →
      </span>
      <span className="sr-only">to</span>
      <span className="rounded bg-success-soft px-1.5 py-0.5 text-success-strong">{to}</span>
    </span>
  );
}

/** A 0-100% utilization bar with its value (P95). */
export function UsageBar({ value, label }: { value: number | null | undefined; label: string }) {
  if (value === null || value === undefined)
    return <span className="text-xs text-subtle">{label}: n/a</span>;
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="flex items-center gap-2" title={`${label} P95 ${v.toFixed(0)}%`}>
      <span className="w-9 text-[11px] text-muted">{label}</span>
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-2">
        <div
          className={cn('h-full rounded-full', v >= 80 ? 'bg-high' : 'bg-brand')}
          style={{ width: `${v}%` }}
        />
      </div>
      <span className="w-8 text-right text-[11px] tabular text-muted">{v.toFixed(0)}%</span>
    </div>
  );
}

export function NoCost() {
  return (
    <Card className="flex flex-col items-center gap-2 px-6 py-14 text-center">
      <h3 className="text-lg font-semibold">No cost data yet</h3>
      <p className="max-w-md text-sm text-muted">
        Cost Management data is imported by the next scan (13 months on the first scan). The app
        registration needs the Cost Management Reader role.
      </p>
    </Card>
  );
}
