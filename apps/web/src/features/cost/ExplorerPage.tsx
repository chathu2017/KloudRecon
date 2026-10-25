import { EChart } from '@/components/charts/echarts';
import * as React from 'react';
import { CalendarRange, Coins, Filter, TrendingUp, X } from 'lucide-react';
import {
  baseOption,
  compactMoney,
  money,
  monthLabel,
  shortDate,
  useChartTheme,
  type ChartTheme,
} from '@/components/charts/theme';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, NativeSelect } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { useResourceParam } from '@/features/inventory/useResourceParam';
import { typeInfo } from '@/features/inventory/types';
import { ApiError } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import {
  useExplorer,
  type CostExplorer,
  type CostMetric,
  type CostRange,
  type ExplorerParams,
} from './api';
import { Delta, Kpi, NoCost, Segmented } from './components';

const GROUPS: { value: string; label: string; filter?: keyof ExplorerParams }[] = [
  { value: 'service', label: 'Service', filter: 'service' },
  { value: 'resource_group', label: 'Resource group', filter: 'resource_group' },
  { value: 'subscription', label: 'Subscription', filter: 'subscription_id' },
  { value: 'location', label: 'Location', filter: 'location' },
  { value: 'meter', label: 'Meter category', filter: 'meter' },
  { value: 'resource', label: 'Resource' },
];
const RANGES: { value: CostRange; label: string }[] = [
  { value: '7d', label: '7D' },
  { value: '30d', label: '30D' },
  { value: '90d', label: '90D' },
  { value: 'mtd', label: 'MTD' },
  { value: '6m', label: '6M' },
  { value: '12m', label: '12M' },
  { value: 'custom', label: 'Custom' },
];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const FILTER_LABEL: Record<string, string> = {
  service: 'Service',
  resource_group: 'Resource group',
  subscription_id: 'Subscription',
  location: 'Location',
  meter: 'Meter',
};

type Filters = Pick<
  ExplorerParams,
  'service' | 'resource_group' | 'subscription_id' | 'location' | 'meter'
>;

function colorFor(t: ChartTheme, keys: string[], key: string): string {
  const i = keys.indexOf(key);
  return i >= 0 && i < t.series.length ? (t.series[i] ?? t.subtle) : t.subtle;
}

function withAlpha(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m?.[1]) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function StackedArea({ data, t }: { data: CostExplorer; t: ChartTheme }) {
  const keys = data.series_keys.map((s) => s.key);
  const option = {
    ...baseOption(t),
    legend: { ...(baseOption(t).legend as object), show: true, bottom: 0, left: 0 },
    grid: { left: 8, right: 16, top: 12, bottom: 36, containLabel: true },
    tooltip: {
      ...(baseOption(t).tooltip as object),
      trigger: 'axis',
      axisPointer: { type: 'line', lineStyle: { color: t.border } },
      valueFormatter: (v: number) => money(v, data.currency),
      order: 'valueDesc',
    },
    xAxis: {
      ...(baseOption(t).xAxis as object),
      type: 'category',
      boundaryGap: false,
      data: data.daily.map((d) => shortDate(d.date)),
    },
    yAxis: {
      ...(baseOption(t).yAxis as object),
      type: 'value',
      axisLabel: {
        color: t.muted,
        fontSize: 11,
        formatter: (v: number) => compactMoney(v, data.currency),
      },
    },
    series: data.series_keys.map((s) => ({
      name: s.label,
      type: 'line',
      stack: 'total',
      symbol: 'none',
      // a thin surface-colored line separates the stacked bands (spacer rule)
      lineStyle: { width: 1, color: t.surface },
      itemStyle: { color: colorFor(t, keys, s.key) },
      areaStyle: { color: colorFor(t, keys, s.key), opacity: 0.9 },
      emphasis: { focus: 'series' },
      data: data.daily.map((d) => d.values[s.key] ?? 0),
    })),
  };
  return (
    <EChart
      option={option}
      height={320}
      ariaLabel={`Daily ${data.metric} cost by ${data.group_by}`}
    />
  );
}

function MonthlyBars({ data, t }: { data: CostExplorer; t: ChartTheme }) {
  const option = {
    ...baseOption(t),
    legend: { show: false },
    tooltip: {
      ...(baseOption(t).tooltip as object),
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      valueFormatter: (v: number) => money(v, data.currency),
    },
    xAxis: {
      ...(baseOption(t).xAxis as object),
      type: 'category',
      data: data.monthly.map((m) => monthLabel(m.month)),
    },
    yAxis: {
      ...(baseOption(t).yAxis as object),
      type: 'value',
      axisLabel: {
        color: t.muted,
        fontSize: 11,
        formatter: (v: number) => compactMoney(v, data.currency),
      },
    },
    series: [
      {
        name: 'Monthly cost',
        type: 'bar',
        barMaxWidth: 26,
        data: data.monthly.map((m, i) => {
          const prev = data.monthly[i - 1];
          return {
            value: m.cost,
            itemStyle: {
              color: t.series[0],
              opacity: m.partial ? 0.45 : 1,
              borderRadius: [4, 4, 0, 0],
            },
            label: m.partial
              ? { show: true, position: 'top', formatter: 'MTD', color: t.muted, fontSize: 10 }
              : prev
                ? undefined
                : undefined,
          };
        }),
      },
    ],
  };
  return <EChart option={option} height={240} ariaLabel="Month-over-month cost, last 13 months" />;
}

function Treemap({
  data,
  t,
  onPick,
}: {
  data: CostExplorer;
  t: ChartTheme;
  onPick: (key: string) => void;
}) {
  const keys = data.series_keys.map((s) => s.key);
  const option = {
    tooltip: {
      ...(baseOption(t).tooltip as object),
      formatter: (p: { name: string; value: number; data: { share: number } }) =>
        `<b>${p.name}</b><br/>${money(p.value, data.currency)} · ${p.data.share.toFixed(1)}%`,
    },
    series: [
      {
        type: 'treemap',
        roam: false,
        nodeClick: false,
        breadcrumb: { show: false },
        width: '100%',
        height: '100%',
        top: 0,
        left: 0,
        itemStyle: { borderColor: t.surface, borderWidth: 2, gapWidth: 2, borderRadius: 4 },
        // Tinted cells (entity hue at partial opacity) keep text-token labels readable in both themes.
        label: {
          color: t.text,
          fontSize: 11,
          lineHeight: 15,
          overflow: 'truncate',
          position: 'insideTopLeft',
          padding: [6, 8],
          formatter: (p: { name: string; value: number }) =>
            `{name|${p.name}}
${compactMoney(p.value, data.currency)}`,
          rich: { name: { fontWeight: 600, color: t.text, fontSize: 12, lineHeight: 16 } },
        },
        upperLabel: { show: false },
        data: data.groups.slice(0, 30).map((g) => ({
          name: g.label,
          value: g.cost,
          share: g.share,
          key: g.key,
          itemStyle: {
            color: withAlpha(colorFor(t, keys, g.key), t.mode === 'dark' ? 0.45 : 0.3),
            borderColor: t.surface,
          },
        })),
      },
    ],
  };
  return (
    <EChart
      option={option}
      height={240}
      ariaLabel="Cost breakdown treemap"
      onEvents={{ click: (p) => onPick((p as { data?: { key?: string } }).data?.key ?? '') }}
    />
  );
}

function p95(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * 0.95)] ?? 0;
}

function Heatmap({ data, t }: { data: CostExplorer; t: ChartTheme }) {
  const weeks = [...new Set(data.heatmap.map((c) => c.week))].sort();
  const values = data.heatmap.map((c) => c.cost);
  const option = {
    tooltip: {
      ...(baseOption(t).tooltip as object),
      formatter: (p: { data: [number, number, number] }) => {
        const week = weeks[p.data[0]] ?? '';
        const day = new Date(`${week}T00:00:00`);
        day.setDate(day.getDate() + p.data[1]);
        return `${day.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}<br/><b>${money(p.data[2], data.currency)}</b>`;
      },
    },
    grid: { left: 8, right: 8, top: 4, bottom: 44, containLabel: true },
    xAxis: {
      type: 'category',
      data: weeks.map((w) => shortDate(w)),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: t.muted, fontSize: 10 },
      splitArea: { show: false },
    },
    yAxis: {
      type: 'category',
      data: WEEKDAYS,
      inverse: true,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: t.muted, fontSize: 11 },
    },
    visualMap: {
      min: Math.min(...values),
      // capped at P95 so one spike does not flatten the weekly pattern
      max: Math.max(p95(values), 1),
      calculable: false,
      text: ['High', 'Low'],
      orient: 'horizontal',
      left: 'center',
      bottom: 0,
      itemHeight: 140,
      itemWidth: 10,
      inRange: { color: t.seq },
      textStyle: { color: t.muted, fontSize: 10 },
      formatter: (v: number) => compactMoney(v, data.currency),
    },
    series: [
      {
        type: 'heatmap',
        data: data.heatmap.map((c) => [weeks.indexOf(c.week), c.weekday, c.cost]),
        itemStyle: { borderColor: t.surface, borderWidth: 2, borderRadius: 3 },
        emphasis: { itemStyle: { borderColor: t.text, borderWidth: 1 } },
      },
    ],
  };
  return <EChart option={option} height={250} ariaLabel="Daily cost by day of week" />;
}

export function ExplorerPage() {
  const [metric, setMetric] = React.useState<CostMetric>('actual');
  const [groupBy, setGroupBy] = React.useState('service');
  const [range, setRange] = React.useState<CostRange>('30d');
  const [custom, setCustom] = React.useState({ start: '', end: '' });
  const [filters, setFilters] = React.useState<Filters>({});
  const [showTable, setShowTable] = React.useState(false);
  const [, openResource] = useResourceParam();
  const t = useChartTheme();
  const params: ExplorerParams = {
    metric,
    group_by: groupBy,
    range: range === 'custom' && !custom.start ? '30d' : range,
    ...(range === 'custom' && custom.start
      ? { start: custom.start, end: custom.end || undefined }
      : {}),
    ...filters,
  };
  const { data, isPending, isError, error, isFetching } = useExplorer(params);

  if (isError && error instanceof ApiError && error.status === 404) return <NoCost />;
  const drill = (key: string) => {
    const g = GROUPS.find((x) => x.value === groupBy);
    if (groupBy === 'resource') {
      if (key) openResource(key);
      return;
    }
    if (!g?.filter || !key || key === '__other__') return;
    setFilters((f) => ({ ...f, [g.filter as string]: key }));
    const next = {
      service: 'resource',
      resource_group: 'service',
      subscription: 'resource_group',
      location: 'service',
      meter: 'resource',
    }[groupBy];
    if (next) setGroupBy(next);
  };
  const tagKeys = data?.tag_keys ?? [];
  const days = data ? data.daily.length : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          label="Cost type"
          value={metric}
          onChange={setMetric}
          options={[
            { value: 'actual', label: 'Actual' },
            { value: 'amortized', label: 'Amortized' },
          ]}
        />
        <Segmented label="Period" value={range} onChange={setRange} options={RANGES} />
        {range === 'custom' && (
          <div className="flex items-center gap-1.5">
            <Input
              type="date"
              aria-label="Start date"
              className="h-8 w-38"
              value={custom.start}
              onChange={(e) => setCustom((c) => ({ ...c, start: e.target.value }))}
            />
            <span className="text-muted">–</span>
            <Input
              type="date"
              aria-label="End date"
              className="h-8 w-38"
              value={custom.end}
              onChange={(e) => setCustom((c) => ({ ...c, end: e.target.value }))}
            />
          </div>
        )}
        <label className="ml-auto flex items-center gap-2 text-sm text-muted">
          Group by
          <NativeSelect
            aria-label="Group by"
            className="h-8 w-48"
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value)}
          >
            {GROUPS.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
            {tagKeys.length > 0 && (
              <optgroup label="Tag">
                {tagKeys.map((k) => (
                  <option key={k} value={`tag:${k}`}>
                    Tag: {k}
                  </option>
                ))}
              </optgroup>
            )}
          </NativeSelect>
        </label>
      </div>
      {Object.values(filters).some(Boolean) && (
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="size-4 text-muted" aria-hidden />
          {Object.entries(filters)
            .filter(([, v]) => v)
            .map(([k, v]) => (
              <Badge key={k} tone="brand" className="gap-1.5 py-1">
                {FILTER_LABEL[k]}:{' '}
                {k === 'subscription_id' ? (data?.groups.find((g) => g.key === v)?.label ?? v) : v}
                <button
                  type="button"
                  aria-label={`Remove ${FILTER_LABEL[k]} filter`}
                  onClick={() => setFilters((f) => ({ ...f, [k]: undefined }))}
                >
                  <X className="size-3" />
                </button>
              </Badge>
            ))}
          <Button size="sm" variant="ghost" onClick={() => setFilters({})}>
            Clear
          </Button>
        </div>
      )}

      {isPending || !data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
          <Skeleton className="h-80 sm:col-span-2 lg:col-span-4" />
        </div>
      ) : (
        <div className={cn('space-y-6 transition-opacity', isFetching && 'opacity-70')}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              icon={Coins}
              label={`Total (${metric})`}
              value={money(data.total, data.currency)}
              hint={`${shortDate(data.start)} – ${shortDate(data.end)}`}
            />
            <Kpi
              icon={TrendingUp}
              label="vs previous period"
              value={<Delta pct={data.change_pct} />}
              hint={`Previous: ${money(data.previous_total, data.currency)}`}
            />
            <Kpi
              icon={CalendarRange}
              label="Daily average"
              value={money(days ? data.total / days : 0, data.currency)}
              hint={`${days} days`}
            />
            <Kpi
              label="Data through"
              value={data.data_through ? shortDate(data.data_through) : '—'}
              hint="Cost Management data lags up to 24 h"
            />
          </div>

          <Card>
            <CardHeader className="flex-row items-start justify-between gap-3">
              <div>
                <CardTitle>
                  Daily cost by{' '}
                  {GROUPS.find((g) => g.value === groupBy)?.label.toLowerCase() ??
                    groupBy.replace('tag:', 'tag ')}
                </CardTitle>
                <CardDescription>
                  Top 8 groups; the rest are folded into Other. Click the treemap to drill down.
                </CardDescription>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowTable((v) => !v)}
                aria-pressed={showTable}
              >
                {showTable ? 'Hide table' : 'Show table'}
              </Button>
            </CardHeader>
            <CardContent>
              <StackedArea data={data} t={t} />
              {showTable && (
                <div className="mt-4 max-h-80 overflow-auto rounded-md border border-border">
                  <Table>
                    <THead>
                      <TR>
                        <TH>Group</TH>
                        <TH className="text-right">Cost</TH>
                        <TH className="text-right">Share</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {data.groups.map((g) => (
                        <TR key={g.key}>
                          <TD>{g.label}</TD>
                          <TD className="text-right tabular">{money(g.cost, data.currency, 2)}</TD>
                          <TD className="text-right tabular text-muted">{g.share.toFixed(1)}%</TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Month over month</CardTitle>
                <CardDescription>
                  Last 13 months ({metric}); the current month is month-to-date.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <MonthlyBars data={data} t={t} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Breakdown</CardTitle>
                <CardDescription>
                  Share of the period by{' '}
                  {GROUPS.find((g) => g.value === groupBy)?.label.toLowerCase() ?? 'tag value'}.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Treemap data={data} t={t} onPick={drill} />
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2 [&>*]:min-w-0">
            <Card className="overflow-x-auto">
              <CardHeader>
                <CardTitle>Top resources</CardTitle>
                <CardDescription>Most expensive resources in the period.</CardDescription>
              </CardHeader>
              <Table>
                <THead>
                  <TR>
                    <TH>Resource</TH>
                    <TH className="text-right">Cost</TH>
                    <TH className="w-28">Share</TH>
                  </TR>
                </THead>
                <TBody>
                  {data.top_resources.map((r) => {
                    const info = typeInfo(r.type);
                    const Icon = info.icon;
                    return (
                      <TR
                        key={r.arm_id}
                        className="cursor-pointer hover:bg-surface-2"
                        onClick={() => openResource(r.arm_id)}
                      >
                        <TD>
                          <div className="flex min-w-0 items-center gap-2">
                            <Icon className="size-4 shrink-0 text-muted" aria-hidden />
                            <div className="min-w-0">
                              <div className="truncate font-medium">{r.name}</div>
                              <div className="truncate text-xs text-muted">
                                {info.label} · {r.resource_group}
                              </div>
                            </div>
                          </div>
                        </TD>
                        <TD className="text-right tabular">{money(r.cost, data.currency)}</TD>
                        <TD>
                          <div className="h-1.5 rounded-full bg-surface-2">
                            <div
                              className="h-full rounded-full bg-brand"
                              style={{ width: `${Math.min(100, r.share * 3)}%` }}
                            />
                          </div>
                          <div className="mt-0.5 text-[11px] tabular text-muted">
                            {r.share.toFixed(1)}%
                          </div>
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </Card>
            <Card className="overflow-x-auto">
              <CardHeader>
                <CardTitle>Top movers</CardTitle>
                <CardDescription>Largest changes against the previous {days} days.</CardDescription>
              </CardHeader>
              <Table>
                <THead>
                  <TR>
                    <TH>Group</TH>
                    <TH className="text-right">Previous</TH>
                    <TH className="text-right">Current</TH>
                    <TH className="text-right">Change</TH>
                  </TR>
                </THead>
                <TBody>
                  {data.movers.map((m) => (
                    <TR key={m.key}>
                      <TD className="max-w-48 truncate font-medium">{m.label}</TD>
                      <TD className="text-right tabular text-muted">
                        {money(m.previous, data.currency)}
                      </TD>
                      <TD className="text-right tabular">{money(m.current, data.currency)}</TD>
                      <TD className="text-right">
                        <div className="flex flex-col items-end">
                          <Delta value={m.delta} currency={data.currency} />
                          {m.pct !== null && (
                            <span className="text-[11px] tabular text-muted">
                              {m.pct > 0 ? '+' : ''}
                              {m.pct.toFixed(1)}%
                            </span>
                          )}
                        </div>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Day-of-week pattern</CardTitle>
              <CardDescription>
                Daily cost by week (columns) and weekday (rows); darker is more expensive.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Heatmap data={data} t={t} />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
