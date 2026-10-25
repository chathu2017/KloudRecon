import { EChart } from '@/components/charts/echarts';
import * as React from 'react';
import {
  Calculator,
  Download,
  Plus,
  Search,
  Tags,
  Trash2,
  TrendingDown,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  baseOption,
  compactMoney,
  money,
  monthLabel,
  shortDate,
  useChartTheme,
} from '@/components/charts/theme';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, NativeSelect } from '@/components/ui/input';
import { EmptyState, Skeleton } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { typeInfo } from '@/features/inventory/types';
import { useResourceParam } from '@/features/inventory/useResourceParam';
import { useDebounced } from '@/lib/hooks';
import { downloadFile } from '@/lib/download';
import { errorMessage } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import { useAsOf } from '@/features/inventory/api';
import {
  useSavings,
  useShowback,
  useUntrackSaving,
  useWhatIf,
  useWhatIfResources,
  type CostRange,
  type WhatIfOptions,
  type WhatIfScenario,
} from './api';
import { Delta, Kpi, PriceSource, Segmented } from './components';

// ---- what-if ------------------------------------------------------------------------------------
type Kind = WhatIfScenario['kind'];
const KINDS: { value: Kind; label: string }[] = [
  { value: 'resize', label: 'Resize' },
  { value: 'region', label: 'Change region' },
  { value: 'reservation', label: 'Reservation' },
  { value: 'shutdown', label: 'Schedule shutdown' },
];

function stripLabel(s: WhatIfScenario & { label: string }): WhatIfScenario {
  const out: WhatIfScenario & { label?: string } = { ...s };
  delete out.label;
  return out;
}

function allowedKinds(r: WhatIfOptions | undefined): Kind[] {
  if (!r) return [];
  if (r.type === 'microsoft.compute/virtualmachines')
    return ['resize', 'region', 'reservation', 'shutdown'];
  if (r.type === 'microsoft.compute/virtualmachinescalesets')
    return ['resize', 'region', 'reservation'];
  return ['resize', 'region'];
}

export function WhatIfPage() {
  const [q, setQ] = React.useState('');
  const debounced = useDebounced(q, 250);
  const resources = useWhatIfResources(debounced);
  const [selected, setSelected] = React.useState<WhatIfOptions | undefined>();
  const [kind, setKind] = React.useState<Kind>('resize');
  const [targetSku, setTargetSku] = React.useState('');
  const [targetRegion, setTargetRegion] = React.useState('westeurope');
  const [term, setTerm] = React.useState<'1y' | '3y'>('1y');
  const [hours, setHours] = React.useState(12);
  const [days, setDays] = React.useState(5);
  const [scenarios, setScenarios] = React.useState<(WhatIfScenario & { label: string })[]>([]);
  const run = useWhatIf();

  const pick = (r: WhatIfOptions) => {
    setSelected(r);
    const kinds = allowedKinds(r);
    if (!kinds.includes(kind)) setKind(kinds[0] ?? 'resize');
    setTargetSku(r.sizes.find((s) => s !== r.sku) ?? '');
  };
  const add = () => {
    if (!selected) return;
    const s: WhatIfScenario & { label: string } = {
      kind,
      arm_id: selected.arm_id,
      label: selected.name,
    };
    if (kind === 'resize') s.target_sku = targetSku;
    if (kind === 'region') s.target_region = targetRegion;
    if (kind === 'reservation') s.term = term;
    if (kind === 'shutdown') {
      s.hours_per_day = hours;
      s.days_per_week = days;
    }
    const next = [...scenarios, s];
    setScenarios(next);
    run.mutate(next.map(stripLabel));
  };
  const remove = (i: number) => {
    const next = scenarios.filter((_, j) => j !== i);
    setScenarios(next);
    if (next.length) run.mutate(next.map(stripLabel));
    else run.reset();
  };
  const result = run.data;
  const kinds = allowedKinds(selected);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_1fr]">
      <Card className="self-start">
        <CardHeader>
          <CardTitle>Build a scenario</CardTitle>
          <CardDescription>
            Pick a resource, choose a change, and add it. Prices: Azure Retail Prices API (cached),
            730 hours per month.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-subtle"
              aria-hidden
            />
            <Input
              className="pl-8"
              placeholder="Search VMs, scale sets, plans, databases"
              aria-label="Search resources"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <ul
            className="max-h-60 space-y-0.5 overflow-auto rounded-md border border-border p-1"
            role="listbox"
            aria-label="Resources"
          >
            {(resources.data ?? []).map((r) => {
              const info = typeInfo(r.type);
              const Icon = info.icon;
              return (
                <li key={r.arm_id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected?.arm_id === r.arm_id}
                    onClick={() => pick(r)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-surface-2',
                      selected?.arm_id === r.arm_id && 'bg-brand-soft text-brand-strong',
                    )}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{r.name}</span>
                    <span className="shrink-0 font-mono text-[11px] text-muted">{r.sku}</span>
                  </button>
                </li>
              );
            })}
            {resources.data?.length === 0 && (
              <li className="px-2 py-3 text-sm text-muted">No matching resources.</li>
            )}
          </ul>
          {selected && (
            <div className="space-y-4 border-t border-border pt-4">
              <div className="text-sm">
                <div className="font-medium">{selected.name}</div>
                <div className="text-xs text-muted">
                  {selected.sku} · {selected.region} · {selected.os}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Scenario">
                {KINDS.filter((k) => kinds.includes(k.value)).map((k) => (
                  <Button
                    key={k.value}
                    size="sm"
                    variant={kind === k.value ? 'subtle' : 'secondary'}
                    role="radio"
                    aria-checked={kind === k.value}
                    onClick={() => setKind(k.value)}
                  >
                    {k.label}
                  </Button>
                ))}
              </div>
              {kind === 'resize' && (
                <label className="block text-sm">
                  New size
                  <NativeSelect
                    className="mt-1"
                    value={targetSku}
                    onChange={(e) => setTargetSku(e.target.value)}
                  >
                    {selected.sizes.map((s) => (
                      <option key={s} value={s} disabled={s === selected.sku}>
                        {s}
                        {s === selected.sku ? ' (current)' : ''}
                      </option>
                    ))}
                  </NativeSelect>
                </label>
              )}
              {kind === 'region' && (
                <label className="block text-sm">
                  Target region
                  <NativeSelect
                    className="mt-1"
                    value={targetRegion}
                    onChange={(e) => setTargetRegion(e.target.value)}
                  >
                    {selected.regions.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </NativeSelect>
                </label>
              )}
              {kind === 'reservation' && (
                <Segmented
                  label="Term"
                  value={term}
                  onChange={setTerm}
                  options={[
                    { value: '1y', label: '1 year' },
                    { value: '3y', label: '3 years' },
                  ]}
                />
              )}
              {kind === 'shutdown' && (
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <label>
                    Hours per day
                    <Input
                      className="mt-1"
                      type="number"
                      min={0}
                      max={24}
                      value={hours}
                      onChange={(e) => setHours(Number(e.target.value))}
                    />
                  </label>
                  <label>
                    Days per week
                    <Input
                      className="mt-1"
                      type="number"
                      min={0}
                      max={7}
                      value={days}
                      onChange={(e) => setDays(Number(e.target.value))}
                    />
                  </label>
                </div>
              )}
              <Button
                className="w-full"
                onClick={add}
                loading={run.isPending}
                disabled={kind === 'resize' && !targetSku}
              >
                <Plus aria-hidden /> Add scenario
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Kpi
            icon={Calculator}
            label="Monthly impact"
            value={
              result ? (
                <span className={result.monthly_delta <= 0 ? 'text-success-strong' : 'text-critical-strong'}>
                  {result.monthly_delta > 0 ? '+' : ''}
                  {money(result.monthly_delta, result.currency, 2)}
                </span>
              ) : (
                '—'
              )
            }
            hint="negative = saving"
          />
          <Kpi
            label="Annual impact"
            value={
              result ? (
                <span className={result.annual_delta <= 0 ? 'text-success-strong' : 'text-critical-strong'}>
                  {result.annual_delta > 0 ? '+' : ''}
                  {money(result.annual_delta, result.currency)}
                </span>
              ) : (
                '—'
              )
            }
            hint={`${scenarios.length} scenario(s)`}
          />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Scenarios</CardTitle>
          </CardHeader>
          {!scenarios.length ? (
            <CardContent>
              <EmptyState
                icon={<Calculator />}
                title="No scenarios yet"
                description="Add a resize, region move, reservation or shutdown schedule to see its monthly and annual impact."
              />
            </CardContent>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Scenario</TH>
                  <TH className="text-right">Now / month</TH>
                  <TH className="text-right">After / month</TH>
                  <TH className="text-right">Monthly</TH>
                  <TH className="text-right">Annual</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {scenarios.map((s, i) => {
                  const r = result?.results[i];
                  return (
                    <TR key={`${s.arm_id}-${i}`} className="align-top">
                      <TD>
                        <div className="font-medium">{r?.description ?? s.kind}</div>
                        <div className="text-xs text-muted">{s.label}</div>
                        {r && (
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <PriceSource source={r.price_source} />
                            {r.notes.map((n) => (
                              <span key={n} className="text-[11px] text-muted">
                                {n}
                              </span>
                            ))}
                          </div>
                        )}
                      </TD>
                      <TD className="text-right tabular text-muted">
                        {r ? money(r.current_monthly, result.currency, 2) : '…'}
                      </TD>
                      <TD className="text-right tabular">
                        {r ? money(r.new_monthly, result.currency, 2) : '…'}
                      </TD>
                      <TD
                        className={cn(
                          'text-right font-semibold tabular',
                          r && (r.monthly_delta <= 0 ? 'text-success-strong' : 'text-critical-strong'),
                        )}
                      >
                        {r
                          ? `${r.monthly_delta > 0 ? '+' : ''}${money(r.monthly_delta, result.currency, 2)}`
                          : ''}
                      </TD>
                      <TD className="text-right tabular text-muted">
                        {r
                          ? `${r.annual_delta > 0 ? '+' : ''}${money(r.annual_delta, result.currency)}`
                          : ''}
                      </TD>
                      <TD>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label="Remove scenario"
                          onClick={() => remove(i)}
                        >
                          <Trash2 />
                        </Button>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </Card>
      </div>
    </div>
  );
}

// ---- showback -----------------------------------------------------------------------------------
export function ShowbackPage() {
  const [key, setKey] = React.useState<string | undefined>();
  const [range, setRange] = React.useState<CostRange>('30d');
  const { data, isPending } = useShowback(key, range);
  const scanId = useAsOf();
  const [, openResource] = useResourceParam();
  const t = useChartTheme();
  if (isPending) return <Skeleton className="h-96" />;
  if (!data) return null;
  const option = {
    ...baseOption(t),
    grid: { left: 8, right: 56, top: 4, bottom: 4, containLabel: true },
    tooltip: {
      ...(baseOption(t).tooltip as object),
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      valueFormatter: (v: number) => money(v, data.currency),
    },
    xAxis: {
      ...(baseOption(t).xAxis as object),
      type: 'value',
      axisLabel: { show: false },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'category',
      inverse: true,
      data: data.groups.slice(0, 12).map((g) => g.value),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: t.text, fontSize: 12 },
    },
    series: [
      {
        type: 'bar',
        barMaxWidth: 16,
        // one series = one color; untagged is shown in a neutral tone
        data: data.groups
          .slice(0, 12)
          .map((g) => ({
            value: g.cost,
            itemStyle: {
              color: g.value === '(untagged)' ? t.subtle : t.series[0],
              borderRadius: [0, 4, 4, 0],
            },
          })),
        label: {
          show: true,
          position: 'right',
          color: t.muted,
          fontSize: 11,
          formatter: (p: { value: number }) => compactMoney(p.value, data.currency),
        },
      },
    ],
  };
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm text-muted">
          Tag
          <NativeSelect
            className="h-8 w-44"
            value={data.key}
            onChange={(e) => setKey(e.target.value)}
            aria-label="Tag key"
          >
            {data.keys.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </NativeSelect>
        </label>
        <Segmented
          label="Period"
          value={range}
          onChange={setRange}
          options={[
            { value: '30d', label: '30D' },
            { value: '90d', label: '90D' },
            { value: 'mtd', label: 'MTD' },
            { value: '12m', label: '12M' },
          ]}
        />
        <Button
          className="ml-auto"
          variant="secondary"
          size="sm"
          onClick={() =>
            void downloadFile(
              '/api/v1/costs/showback/export',
              { key: data.key, range, scan_id: scanId },
              'showback.csv',
            ).catch((e: unknown) => toast.error(errorMessage(e)))
          }
        >
          <Download aria-hidden /> Export CSV
        </Button>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi
          icon={Wallet}
          label={`Allocated by "${data.key}"`}
          value={money(data.tagged, data.currency)}
          hint={`${shortDate(data.start)} – ${shortDate(data.end)} · amortized`}
        />
        <Kpi
          icon={Tags}
          label="Tag coverage by cost"
          value={`${data.coverage_pct.toFixed(1)}%`}
          tone={data.coverage_pct < 80 ? 'critical' : 'success'}
          hint="share of spend carrying the tag"
        />
        <Kpi
          label="Untagged cost"
          value={money(data.untagged, data.currency)}
          hint="cannot be charged back"
        />
      </div>
      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Cost by {data.key}</CardTitle>
            <CardDescription>
              Chargeback view; changes against the previous period of the same length.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EChart
              option={option}
              height={Math.max(160, Math.min(12, data.groups.length) * 30)}
              ariaLabel={`Cost by tag ${data.key}`}
            />
          </CardContent>
          <Table>
            <THead>
              <TR>
                <TH>{data.key}</TH>
                <TH className="text-right">Cost</TH>
                <TH className="text-right">Share</TH>
                <TH className="text-right">Resources</TH>
                <TH className="text-right">Change</TH>
              </TR>
            </THead>
            <TBody>
              {data.groups.map((g) => (
                <TR key={g.value}>
                  <TD className={cn('font-medium', g.value === '(untagged)' && 'text-muted')}>
                    {g.value}
                  </TD>
                  <TD className="text-right tabular">{money(g.cost, data.currency)}</TD>
                  <TD className="text-right tabular text-muted">{g.share.toFixed(1)}%</TD>
                  <TD className="text-right tabular text-muted">{g.resources}</TD>
                  <TD className="text-right">
                    <Delta value={g.delta} currency={data.currency} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Coverage by tag key</CardTitle>
              <CardDescription>Share of spend carrying each tag.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {data.coverage_by_key.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  className="block w-full text-left"
                  onClick={() => setKey(c.key)}
                >
                  <div className="flex justify-between text-sm">
                    <span className={cn(c.key === data.key && 'font-semibold')}>{c.label}</span>
                    <span className="tabular text-muted">{c.share.toFixed(0)}%</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-surface-2">
                    <div
                      className={cn(
                        'h-full rounded-full',
                        c.share >= 80 ? 'bg-success' : c.share >= 50 ? 'bg-medium' : 'bg-critical',
                      )}
                      style={{ width: `${c.share}%` }}
                    />
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Largest untagged</CardTitle>
              <CardDescription>Tag these first to raise coverage.</CardDescription>
            </CardHeader>
            <Table>
              <TBody>
                {data.untagged_top.map((r) => (
                  <TR
                    key={r.arm_id || r.name}
                    className="cursor-pointer hover:bg-surface-2"
                    onClick={() => r.arm_id && openResource(r.arm_id)}
                  >
                    <TD>
                      <div className="truncate font-medium">{r.name}</div>
                      <div className="text-xs text-muted">{typeInfo(r.type).label}</div>
                    </TD>
                    <TD className="text-right tabular">{money(r.cost, data.currency)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ---- savings tracker ------------------------------------------------------------------------------
const STATUS: Record<string, { tone: 'success' | 'warning' | 'neutral'; label: string }> = {
  measured: { tone: 'success', label: 'Measured' },
  tracking: { tone: 'warning', label: 'Measuring' },
  not_measurable: { tone: 'neutral', label: 'Not measurable' },
};

export function SavingsPage() {
  const { data, isPending } = useSavings();
  const untrack = useUntrackSaving();
  const t = useChartTheme();
  if (isPending) return <Skeleton className="h-96" />;
  if (!data?.items.length)
    return (
      <EmptyState
        icon={<TrendingDown />}
        title="No savings tracked yet"
        description="Mark rightsizing, waste or commitment recommendations as implemented; KloudRecon then measures the realized saving from later cost data."
      />
    );
  const option = {
    ...baseOption(t),
    tooltip: {
      ...(baseOption(t).tooltip as object),
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      valueFormatter: (v: number) => money(v, data.currency),
    },
    xAxis: {
      ...(baseOption(t).xAxis as object),
      type: 'category',
      data: data.realized_series.map((m) => monthLabel(m.month)),
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
        name: 'Realized per month',
        type: 'bar',
        barMaxWidth: 28,
        itemStyle: { color: t.success, borderRadius: [4, 4, 0, 0] },
        data: data.realized_series.map((m) => m.cost),
      },
    ],
  };
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi
          icon={TrendingDown}
          label="Realized saving"
          value={money(data.realized_monthly, data.currency)}
          tone="success"
          hint="per month, measured from cost data"
        />
        <Kpi
          label="Expected saving"
          value={money(data.expected_monthly, data.currency)}
          hint="per month, from the recommendations"
        />
        <Kpi
          label="Tracked items"
          value={data.items.length}
          hint={`${data.items.filter((i) => i.status === 'measured').length} measured`}
        />
      </div>
      {data.realized_series.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Realized savings per month</CardTitle>
          </CardHeader>
          <CardContent>
            <EChart option={option} height={200} ariaLabel="Realized savings per month" />
          </CardContent>
        </Card>
      )}
      <Card>
        <Table>
          <THead>
            <TR>
              <TH>Recommendation</TH>
              <TH>Implemented</TH>
              <TH className="text-right">Baseline</TH>
              <TH className="text-right">Expected</TH>
              <TH className="text-right">Realized</TH>
              <TH>Status</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {data.items.map((i) => {
              const st = STATUS[i.status] ?? STATUS.tracking;
              return (
                <TR key={i.id}>
                  <TD>
                    <div className="max-w-md truncate font-medium">{i.title}</div>
                    <div className="text-xs capitalize text-muted">{i.source}</div>
                  </TD>
                  <TD className="text-sm text-muted">
                    {shortDate(i.implemented_at.slice(0, 10))}
                    {i.implemented_by_name ? ` · ${i.implemented_by_name}` : ''}
                  </TD>
                  <TD className="text-right tabular text-muted">
                    {money(i.baseline_monthly, i.currency)}
                  </TD>
                  <TD className="text-right tabular">{money(i.expected_monthly, i.currency)}</TD>
                  <TD className="text-right font-semibold tabular text-success-strong">
                    {i.realized_monthly !== null ? money(i.realized_monthly, i.currency) : '—'}
                  </TD>
                  <TD>
                    <Badge tone={st?.tone}>{st?.label}</Badge>
                    {i.status === 'tracking' && (
                      <div className="mt-0.5 text-[11px] text-muted">
                        {i.days_measured} of 7 days
                      </div>
                    )}
                  </TD>
                  <TD>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Stop tracking"
                      onClick={() => untrack.mutate(i.id)}
                    >
                      <Trash2 />
                    </Button>
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}
