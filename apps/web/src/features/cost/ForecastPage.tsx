import { EChart } from '@/components/charts/echarts';
import { AlertTriangle, CheckCircle2, Coins, Gauge, OctagonAlert, Target } from 'lucide-react';
import {
  baseOption,
  compactMoney,
  money,
  monthLabel,
  shortDate,
  useChartTheme,
  type ChartTheme,
  softFill,
} from '@/components/charts/theme';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { useForecast, type BudgetOut, type CostForecast } from './api';
import { Delta, Kpi, NoCost } from './components';

/** Band = transparent lower bound + stacked (P90 - P10) area; never a second y-axis. */
function bandSeries(
  name: string,
  lower: (number | null)[],
  upper: (number | null)[],
  t: ChartTheme,
  stack: string,
) {
  return [
    {
      name: `${name} low`,
      type: 'line',
      stack,
      symbol: 'none',
      lineStyle: { opacity: 0 },
      areaStyle: { opacity: 0 },
      tooltip: { show: false },
      data: lower,
      silent: true,
    },
    {
      name,
      type: 'line',
      stack,
      symbol: 'none',
      lineStyle: { opacity: 0 },
      itemStyle: { color: t.band },
      areaStyle: { color: t.band, opacity: 1 },
      data: upper.map((u, i) => (u === null || lower[i] === null ? null : u - (lower[i] ?? 0))),
      silent: true,
    },
  ];
}

function ForecastChart({ data, t }: { data: CostForecast; t: ChartTheme }) {
  const dates = [...data.actual.map((p) => p.date), ...data.forecast.map((p) => p.date)];
  const nA = data.actual.length;
  const pad = (n: number) => Array<null>(n).fill(null);
  const actual = [...data.actual.map((p) => p.cost), ...pad(data.forecast.length)];
  const p50 = [
    ...pad(nA - 1),
    data.actual[nA - 1]?.cost ?? null,
    ...data.forecast.map((p) => p.p50),
  ];
  const p10 = [...pad(nA), ...data.forecast.map((p) => p.p10)];
  const p90 = [...pad(nA), ...data.forecast.map((p) => p.p90)];
  const azureBy = new Map(data.azure.map((p) => [p.date, p.cost]));
  const azure = dates.map((d) => azureBy.get(d) ?? null);
  const option = {
    ...baseOption(t),
    legend: {
      ...(baseOption(t).legend as object),
      show: true,
      bottom: 0,
      left: 0,
      data: [
        'Actual',
        'Forecast (P50)',
        'P10–P90',
        ...(data.azure.length ? ['Azure forecast'] : []),
      ],
    },
    grid: { left: 8, right: 16, top: 16, bottom: 36, containLabel: true },
    tooltip: {
      ...(baseOption(t).tooltip as object),
      trigger: 'axis',
      axisPointer: { type: 'line', lineStyle: { color: t.border } },
      formatter: (items: { axisIndex: number; dataIndex: number }[]) => {
        const i = items[0]?.dataIndex ?? 0;
        const rows: string[] = [`<b>${shortDate(dates[i] ?? '')}</b>`];
        if (actual[i] !== null && actual[i] !== undefined)
          rows.push(`Actual: ${money(actual[i], data.currency)}`);
        if (i >= nA) {
          rows.push(`Forecast: ${money(p50[i], data.currency)}`);
          rows.push(`P10–P90: ${money(p10[i], data.currency)} – ${money(p90[i], data.currency)}`);
        }
        if (azure[i] !== null && azure[i] !== undefined)
          rows.push(`Azure: ${money(azure[i], data.currency)}`);
        return rows.join('<br/>');
      },
    },
    xAxis: {
      ...(baseOption(t).xAxis as object),
      type: 'category',
      boundaryGap: false,
      data: dates.map(shortDate),
    },
    yAxis: {
      ...(baseOption(t).yAxis as object),
      type: 'value',
      scale: true,
      axisLabel: {
        color: t.muted,
        fontSize: 11,
        formatter: (v: number) => compactMoney(v, data.currency),
      },
    },
    series: [
      ...bandSeries('P10–P90', p10, p90, t, 'band'),
      {
        name: 'Actual',
        type: 'line',
        symbol: 'none',
        lineStyle: { width: 2, color: t.series[0] },
        itemStyle: { color: t.series[0] },
        areaStyle: { color: softFill(t) },
        data: actual,
      },
      {
        name: 'Forecast (P50)',
        type: 'line',
        symbol: 'none',
        lineStyle: { width: 2, type: 'dashed', color: t.series[0] },
        itemStyle: { color: t.series[0] },
        data: p50,
        markLine: {
          silent: true,
          symbol: 'none',
          label: { formatter: 'Today', color: t.muted, fontSize: 10 },
          lineStyle: { color: t.subtle, type: 'solid', width: 1 },
          data: [{ xAxis: nA - 1 }],
        },
      },
      ...(data.azure.length
        ? [
            {
              name: 'Azure forecast',
              type: 'line',
              symbol: 'none',
              lineStyle: { width: 1.5, type: 'dotted', color: t.series[1] },
              itemStyle: { color: t.series[1] },
              data: azure,
            },
          ]
        : []),
    ],
  };
  return (
    <EChart option={option} height={340} ariaLabel="Daily cost with forecast and P10 to P90 band" />
  );
}

function BacktestChart({ data, t }: { data: CostForecast; t: ChartTheme }) {
  const pts = data.backtest;
  const option = {
    ...baseOption(t),
    legend: {
      ...(baseOption(t).legend as object),
      show: true,
      bottom: 0,
      left: 0,
      data: ['Actual', 'Backtest forecast', 'Outlier day'],
    },
    grid: { left: 8, right: 16, top: 12, bottom: 36, containLabel: true },
    tooltip: {
      ...(baseOption(t).tooltip as object),
      trigger: 'axis',
      valueFormatter: (v: number | null) => (v === null ? '—' : money(v, data.currency)),
    },
    xAxis: {
      ...(baseOption(t).xAxis as object),
      type: 'category',
      boundaryGap: false,
      data: pts.map((p) => shortDate(p.date)),
    },
    yAxis: {
      ...(baseOption(t).yAxis as object),
      type: 'value',
      scale: true,
      axisLabel: {
        color: t.muted,
        fontSize: 11,
        formatter: (v: number) => compactMoney(v, data.currency),
      },
    },
    series: [
      ...bandSeries(
        'Backtest band',
        pts.map((p) => p.p10),
        pts.map((p) => p.p90),
        t,
        'bt',
      ),
      {
        name: 'Actual',
        type: 'line',
        symbol: 'none',
        lineStyle: { width: 2, color: t.series[0] },
        itemStyle: { color: t.series[0] },
        data: pts.map((p) => p.actual),
      },
      {
        name: 'Backtest forecast',
        type: 'line',
        symbol: 'none',
        lineStyle: { width: 2, type: 'dashed', color: t.series[2] },
        itemStyle: { color: t.series[2] },
        data: pts.map((p) => p.p50),
      },
      {
        name: 'Outlier day',
        type: 'line',
        symbol: 'diamond',
        symbolSize: 10,
        showAllSymbol: true,
        lineStyle: { opacity: 0 },
        itemStyle: { color: t.critical, borderColor: t.surface, borderWidth: 2 },
        data: pts.map((p) => (p.outlier ? p.actual : null)),
      },
    ],
  };
  return (
    <EChart
      option={option}
      height={240}
      ariaLabel="Backtest: forecast of the last 30 days against actual cost"
    />
  );
}

function BudgetCard({ b, t }: { b: BudgetOut; t: ChartTheme }) {
  const tone = b.status === 'over' ? 'danger' : b.status === 'at_risk' ? 'warning' : 'success';
  const Icon =
    b.status === 'over' ? OctagonAlert : b.status === 'at_risk' ? AlertTriangle : CheckCircle2;
  const label =
    b.status === 'over'
      ? 'Over budget'
      : b.status === 'at_risk'
        ? 'At risk'
        : 'On track';
  const option = {
    ...baseOption(t),
    grid: { left: 8, right: 12, top: 18, bottom: 8, containLabel: true },
    tooltip: {
      ...(baseOption(t).tooltip as object),
      trigger: 'axis',
      valueFormatter: (v: number | null) => (v === null ? '—' : money(v, b.currency)),
    },
    xAxis: {
      ...(baseOption(t).xAxis as object),
      type: 'category',
      boundaryGap: false,
      data: b.burn.map((p) => new Date(`${p.date}T00:00:00`).getDate()),
      axisLabel: { color: t.muted, fontSize: 10, interval: 6 },
    },
    yAxis: {
      ...(baseOption(t).yAxis as object),
      type: 'value',
      max: (v: { max: number }) => Math.max(v.max, b.amount) * 1.05,
      axisLabel: {
        color: t.muted,
        fontSize: 10,
        formatter: (v: number) => compactMoney(v, b.currency),
      },
    },
    series: [
      {
        name: 'Spend',
        type: 'line',
        symbol: 'none',
        lineStyle: { width: 2, color: t.series[0] },
        areaStyle: { color: softFill(t) },
        itemStyle: { color: t.series[0] },
        data: b.burn.map((p) => p.actual ?? null),
      },
      {
        name: 'Forecast',
        type: 'line',
        symbol: 'none',
        lineStyle: { width: 2, type: 'dashed', color: t.series[0] },
        itemStyle: { color: t.series[0] },
        data: b.burn.map((p) => p.forecast ?? null),
        markLine: {
          silent: true,
          symbol: 'none',
          lineStyle: { color: t.critical, type: 'solid', width: 1 },
          label: {
            formatter: `Budget ${compactMoney(b.amount, b.currency)}`,
            color: t.critical,
            fontSize: 10,
            position: 'insideEndTop',
          },
          data: [{ yAxis: b.amount }],
        },
      },
    ],
  };
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 pb-1">
        <div className="min-w-0">
          <CardTitle className="truncate text-base">{b.subscription_name}</CardTitle>
          <CardDescription className="truncate">
            {b.name} · {money(b.amount, b.currency)} / {b.grain.toLowerCase()}
          </CardDescription>
        </div>
        <Badge tone={tone}>
          <Icon aria-hidden /> {label}
        </Badge>
      </CardHeader>
      <CardContent>
        <EChart
          option={option}
          height={150}
          ariaLabel={`Budget burn-down for ${b.subscription_name}`}
        />
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
          <div>
            <div className="text-muted">Spent</div>
            <div className="font-medium tabular">
              {money(b.spend, b.currency)}{' '}
              <span className="text-muted">({b.percent_used ?? 0}%)</span>
            </div>
          </div>
          <div>
            <div className="text-muted">Month-end forecast</div>
            <div className="font-medium tabular">
              {money(b.forecast, b.currency)}{' '}
              <span className="text-muted">({b.percent_forecast ?? 0}%)</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function ForecastPage() {
  const { data, isPending } = useForecast();
  const t = useChartTheme();
  if (isPending) return <Skeleton className="h-96" />;
  if (!data?.available) return <NoCost />;
  const me = data.month_end;
  const change = data.previous_month
    ? (100 * ((me.p50 ?? 0) - data.previous_month)) / data.previous_month
    : null;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          icon={Target}
          label="Month-end forecast (P50)"
          value={money(me.p50, data.currency)}
          hint={`P10 ${money(me.p10, data.currency)} – P90 ${money(me.p90, data.currency)}`}
        />
        <Kpi
          icon={Coins}
          label="Month to date"
          value={money(me.mtd, data.currency)}
          hint={data.last_actual_date ? `through ${shortDate(data.last_actual_date)}` : undefined}
        />
        <Kpi
          label="vs last month"
          value={<Delta pct={change} />}
          hint={`Last month: ${money(data.previous_month, data.currency)}`}
        />
        <Kpi
          icon={Gauge}
          label="Backtest accuracy (MAPE)"
          value={data.mape_typical !== null ? `${data.mape_typical.toFixed(1)}%` : '—'}
          hint={
            data.outlier_days
              ? `Typical days; ${data.mape?.toFixed(1)}% incl. ${data.outlier_days} outlier day(s)`
              : 'Mean absolute % error over the last 30 days'
          }
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Daily cost forecast</CardTitle>
          <CardDescription>
            Holt-Winters (ETS) with weekly seasonality on {data.history_days} days of actual cost
            {data.azure_available
              ? `, blended ${Math.round(data.azure_weight * 100)}% with the Azure Cost Management forecast`
              : ''}
            . The shaded band is the 80% interval (P10–P90).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ForecastChart data={data} t={t} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Backtest</CardTitle>
            <CardDescription>
              The model refitted without the last 30 days and compared with what happened. Total
              error over the 30 days:{' '}
              {data.month_error !== null
                ? `${data.month_error > 0 ? '+' : ''}${data.month_error.toFixed(1)}%`
                : '—'}
              .
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BacktestChart data={data} t={t} />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Next 3 months</CardTitle>
            <CardDescription>Projected monthly totals with the P10–P90 range.</CardDescription>
          </CardHeader>
          <Table>
            <THead>
              <TR>
                <TH>Month</TH>
                <TH className="text-right">P50</TH>
                <TH className="text-right">P10–P90</TH>
                <TH className="text-right">Last year</TH>
              </TR>
            </THead>
            <TBody>
              {data.months.map((m) => (
                <TR key={m.month}>
                  <TD className="font-medium">{monthLabel(m.month)}</TD>
                  <TD className="text-right tabular">{money(m.p50, data.currency)}</TD>
                  <TD className="text-right text-xs tabular text-muted">
                    {compactMoney(m.p10, data.currency)} – {compactMoney(m.p90, data.currency)}
                  </TD>
                  <TD className="text-right tabular text-muted">
                    {money(m.previous_year, data.currency)}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Budgets</h2>
        {data.budgets.length ? (
          <div className="grid gap-4 md:grid-cols-2">
            {data.budgets.map((b) => (
              <BudgetCard key={b.id} b={b} t={t} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">
            No Azure budgets are defined on the scanned subscriptions.
          </p>
        )}
      </div>
    </div>
  );
}
