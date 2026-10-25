import { EChart } from '@/components/charts/echarts';
import * as React from 'react';
import { CheckCircle2, ChevronRight, Eye, Flame, Undo2 } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import {
  baseOption,
  compactMoney,
  money,
  shortDate,
  useChartTheme,
  type ChartTheme,
  softFill,
} from '@/components/charts/theme';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState, Skeleton } from '@/components/ui/misc';
import { useResourceParam } from '@/features/inventory/useResourceParam';
import { cn } from '@/lib/utils';
import { useAnomalies, useUpdateAnomaly, type Anomaly } from './api';
import { Segmented } from './components';

type Status = 'all' | 'open' | 'acknowledged' | 'resolved' | 'expected';
const STATUS_TONE: Record<string, 'danger' | 'warning' | 'success' | 'neutral'> = {
  open: 'danger',
  acknowledged: 'warning',
  resolved: 'success',
  expected: 'neutral',
};

function SpikeChart({ a, t }: { a: Anomaly; t: ChartTheme }) {
  const start = a.series.findIndex((p) => p.date === a.date);
  const end = a.series.findIndex((p) => p.date === a.end_date);
  const option = {
    ...baseOption(t),
    grid: { left: 4, right: 8, top: 8, bottom: 4, containLabel: true },
    tooltip: {
      ...(baseOption(t).tooltip as object),
      trigger: 'axis',
      valueFormatter: (v: number) => money(v, a.currency),
    },
    xAxis: {
      ...(baseOption(t).xAxis as object),
      type: 'category',
      boundaryGap: false,
      data: a.series.map((p) => shortDate(p.date)),
      axisLabel: { color: t.muted, fontSize: 10, interval: 6 },
    },
    yAxis: {
      ...(baseOption(t).yAxis as object),
      type: 'value',
      scale: true,
      axisLabel: {
        color: t.muted,
        fontSize: 10,
        formatter: (v: number) => compactMoney(v, a.currency),
      },
    },
    series: [
      {
        name: 'Daily cost (amortized)',
        type: 'line',
        symbol: 'none',
        lineStyle: { width: 2, color: t.series[0] },
        itemStyle: { color: t.series[0] },
        areaStyle: { color: softFill(t) },
        data: a.series.map((p) => p.cost),
        markArea:
          start >= 0
            ? {
                silent: true,
                itemStyle: { color: t.critical, opacity: 0.12 },
                data: [[{ xAxis: start }, { xAxis: end >= 0 ? end : start }]],
              }
            : undefined,
      },
    ],
  };
  return <EChart option={option} height={150} ariaLabel="Daily cost around the anomaly" />;
}

function RootCause({ a }: { a: Anomaly }) {
  const [, openResource] = useResourceParam();
  const max = Math.max(1, ...a.services.map((s) => Math.abs(s.delta)));
  return (
    <ol className="space-y-3" aria-label="Root cause: service, resource, meter">
      {a.services.slice(0, 3).map((s) => (
        <li key={s.service}>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="font-medium">{s.service}</span>
            <span className="tabular text-critical-strong">+{money(s.delta, a.currency)}</span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-critical"
              style={{ width: `${(100 * Math.max(0, s.delta)) / max}%` }}
            />
          </div>
          <ul className="mt-2 space-y-1.5 border-l border-border pl-3">
            {s.resources.slice(0, 3).map((r) => (
              <li key={r.arm_id} className="text-sm">
                <button
                  type="button"
                  className="flex w-full items-center gap-1.5 text-left hover:underline"
                  onClick={() => r.arm_id && openResource(r.arm_id)}
                >
                  <ChevronRight className="size-3.5 text-subtle" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{r.name}</span>
                  <span className="tabular text-muted">+{money(r.delta, a.currency)}</span>
                </button>
                <div className="ml-5 mt-0.5 flex flex-wrap gap-1.5">
                  {r.meters.map((m) => (
                    <Badge key={m.meter_category} tone="neutral">
                      {m.meter_category} +{compactMoney(m.delta, a.currency)}
                    </Badge>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}

function AnomalyCard({ a, t, highlighted }: { a: Anomaly; t: ChartTheme; highlighted: boolean }) {
  const update = useUpdateAnomaly();
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (highlighted) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [highlighted]);
  const scope = a.scope === 'total' ? 'All spend' : a.scope.replace('service:', 'Service: ');
  return (
    <div ref={ref} className="scroll-mt-20">
      <Card className={cn(highlighted && 'ring-2 ring-brand')}>
        <CardContent className="grid gap-5 p-5 lg:grid-cols-[1fr_1.2fr_1fr]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={STATUS_TONE[a.status] ?? 'neutral'}>
                <Flame aria-hidden /> {a.status[0]?.toUpperCase()}
                {a.status.slice(1)}
              </Badge>
              <span className="text-xs text-muted">{scope}</span>
            </div>
            <div className="mt-3 kpi-value text-critical-strong">
              +{money(a.delta, a.currency)}
            </div>
            <div className="text-sm text-muted">
              {a.pct !== null ? `+${a.pct.toFixed(0)}% ` : ''}over {a.days} day
              {a.days > 1 ? 's' : ''} · {shortDate(a.date)}
              {a.days > 1 ? ` – ${shortDate(a.end_date)}` : ''}
            </div>
            <div className="mt-1 text-xs text-muted tabular">
              Expected {money(a.expected, a.currency)} · actual {money(a.actual, a.currency)}
            </div>
            {a.headline && <p className="mt-3 text-sm">{a.headline}.</p>}
            <div className="mt-4 flex flex-wrap gap-2">
              {a.status === 'open' ? (
                <>
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={update.isPending}
                    onClick={() => update.mutate({ id: a.id, status: 'acknowledged' })}
                  >
                    <Eye aria-hidden /> Acknowledge
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => update.mutate({ id: a.id, status: 'expected' })}
                  >
                    Expected
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => update.mutate({ id: a.id, status: 'open' })}
                >
                  <Undo2 aria-hidden /> Reopen
                </Button>
              )}
              {a.status !== 'resolved' && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => update.mutate({ id: a.id, status: 'resolved' })}
                >
                  <CheckCircle2 aria-hidden /> Resolved
                </Button>
              )}
            </div>
          </div>
          <div className="min-w-0">
            <SpikeChart a={a} t={t} />
          </div>
          <div className="min-w-0">
            <h3 className="mb-2 text-xs font-semibold text-muted">
              Root cause
            </h3>
            <RootCause a={a} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function AnomaliesPage() {
  const [status, setStatus] = React.useState<Status>('all');
  const { data, isPending } = useAnomalies(status === 'all' ? undefined : status);
  const [params] = useSearchParams();
  const t = useChartTheme();
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted">
          Daily amortized cost compared with the same weekday of the previous four weeks (rolling
          median and MAD). New anomalies notify owners and admins.
        </p>
        <Segmented
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'all', label: 'All' },
            { value: 'open', label: 'Open' },
            { value: 'acknowledged', label: 'Acknowledged' },
            { value: 'resolved', label: 'Resolved' },
          ]}
        />
      </div>
      {isPending ? (
        <Skeleton className="h-64" />
      ) : !data?.length ? (
        <EmptyState
          icon={<CheckCircle2 />}
          title="No anomalies"
          description="No unusual spend in the last 90 days."
        />
      ) : (
        data.map((a) => (
          <AnomalyCard key={a.id} a={a} t={t} highlighted={params.get('id') === a.id} />
        ))
      )}
    </div>
  );
}
