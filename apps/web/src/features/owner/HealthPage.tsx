import { Activity, AlertTriangle, Bot, Cpu, Database, HardDrive, MemoryStick, RotateCcw, Server } from 'lucide-react';
import { SkyCloud } from '@/components/brand/AzureIcons';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, PageHeader, Skeleton } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { formatBytes, formatDateTime, formatDuration, formatNumber } from '@/lib/format';
import { useNow } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { Kpi } from './OwnerOverviewPage';
import { useOwnerHealth, useRetryJob } from './platformApi';
import { WorkerList } from './WorkerList';

function Meter({ label, percent, detail, icon }: { label: string; percent: number | null | undefined; detail?: string; icon: React.ReactNode }) {
  const pct = percent ?? 0;
  const tone = pct >= 90 ? 'bg-critical' : pct >= 75 ? 'bg-medium' : 'bg-brand';
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 text-muted [&_svg]:size-4">
          {icon}
          {label}
        </span>
        <span className="font-medium tabular">{percent === null || percent === undefined ? '—' : `${pct.toFixed(0)}%`}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <div className={cn('h-full rounded-full', tone)} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      {detail && <p className="mt-1 text-xs text-muted">{detail}</p>}
    </div>
  );
}

function ms(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return value < 1000 ? `${value} ms` : formatDuration(Math.round(value / 1000));
}

/** System health (plan 9.13): API host, database, job queue, dead jobs, scans, Azure throttling, AI errors. */
export function HealthPage() {
  const { data, isPending } = useOwnerHealth();
  const retry = useRetryJob();
  const now = useNow(30_000);
  if (isPending || !data) {
    return (
      <>
        <PageHeader title="System health" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </>
    );
  }
  const p = data.process;
  const aiErrors = Object.values(data.ai_errors_7d).reduce((a, b) => a + b, 0);
  const scans = Object.values(data.scans_7d).reduce((a, b) => a + b, 0);
  return (
    <>
      <PageHeader title="System health" description={`API host ${p.hostname}. Refreshes every 30 seconds.`} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Queued jobs" value={formatNumber(data.jobs.queued ?? 0)} icon={<Activity />} hint={`${formatNumber(data.jobs.running ?? 0)} running`} />
        <Kpi label="Dead jobs" value={formatNumber(data.jobs.dead ?? 0)} icon={<AlertTriangle />} hint="Failed after all retries" highlight={(data.jobs.dead ?? 0) > 0} />
        <Kpi
          label="Scans (7 days)"
          value={formatNumber(scans)}
          icon={<SkyCloud />}
          hint={`${formatNumber(data.scans_7d.failed ?? 0)} failed · ${formatNumber(data.azure_throttled_7d)} Azure 429s of ${formatNumber(data.azure_requests_7d)} calls`}
        />
        <Kpi
          label="AI calls (7 days)"
          value={formatNumber(data.ai_calls_7d)}
          icon={<Bot />}
          hint={`${formatNumber(aiErrors)} errors · avg ${ms(data.ai_avg_latency_ms)}`}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="size-4 text-brand-strong" aria-hidden /> API host
            </CardTitle>
            <CardDescription>{p.uptime_seconds ? `Process up for ${formatDuration(p.uptime_seconds)}.` : 'Process statistics.'}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Meter label="CPU" percent={p.cpu_percent} icon={<Cpu />} />
            <Meter
              label="Memory"
              percent={p.memory_percent}
              icon={<MemoryStick />}
              detail={p.memory_used_bytes && p.memory_total_bytes ? `${formatBytes(p.memory_used_bytes)} of ${formatBytes(p.memory_total_bytes)}` : undefined}
            />
            {p.disks.map((d) => (
              <Meter
                key={String(d.path)}
                label={`Disk ${String(d.label)} (${String(d.path)})`}
                percent={typeof d.percent === 'number' ? d.percent : null}
                icon={<HardDrive />}
                detail={typeof d.free_bytes === 'number' ? `${formatBytes(d.free_bytes)} free` : undefined}
              />
            ))}
            <p className="flex items-center gap-2 text-sm text-muted">
              <Database className="size-4" aria-hidden /> Database size {formatBytes(p.db_size_bytes)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Workers</CardTitle>
            <CardDescription>Heartbeat every 60 seconds; stale after 3 minutes.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="border-t border-border">
              <WorkerList workers={data.workers} now={now} />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Dead jobs</CardTitle>
          <CardDescription>Jobs that failed after all retries. Fix the cause, then retry.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {data.dead_jobs.length ? (
            <Table>
              <THead>
                <TR>
                  <TH>Job</TH>
                  <TH>Organization</TH>
                  <TH>Last error</TH>
                  <TH>When</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {data.dead_jobs.map((j) => (
                  <TR key={j.id}>
                    <TD className="font-mono text-xs">{j.type}</TD>
                    <TD>{j.org_name ?? '—'}</TD>
                    <TD className="max-w-md truncate text-xs text-muted" title={j.last_error ?? undefined}>
                      {j.last_error ?? '—'}
                    </TD>
                    <TD className="whitespace-nowrap text-xs text-muted">{formatDateTime(j.finished_at ?? j.created_at)}</TD>
                    <TD className="text-right">
                      <Button variant="ghost" size="sm" loading={retry.isPending && retry.variables === j.id} onClick={() => retry.mutate(j.id)}>
                        <RotateCcw /> Retry
                      </Button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          ) : (
            <EmptyState className="m-5" icon={<Activity />} title="No dead jobs" description="Every job finished or is still retrying." />
          )}
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Scan duration by stage (7 days)</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {data.stage_durations.length ? (
            <Table>
              <THead>
                <TR>
                  <TH>Stage</TH>
                  <TH className="text-right">Runs</TH>
                  <TH className="text-right">Failed</TH>
                  <TH className="text-right">Average</TH>
                  <TH className="text-right">P95</TH>
                </TR>
              </THead>
              <TBody>
                {data.stage_durations.map((s) => (
                  <TR key={s.stage}>
                    <TD>{s.title}</TD>
                    <TD className="text-right tabular">{formatNumber(s.runs)}</TD>
                    <TD className={cn('text-right tabular', s.failed > 0 && 'text-critical-strong')}>{formatNumber(s.failed)}</TD>
                    <TD className="text-right tabular">{ms(s.avg_ms)}</TD>
                    <TD className="text-right tabular">{ms(s.p95_ms)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          ) : (
            <p className="p-5 text-sm text-muted">No scans in the last 7 days.</p>
          )}
        </CardContent>
      </Card>
      {aiErrors > 0 && (
        <p className="mt-4 text-xs text-muted">
          AI errors by type: {Object.entries(data.ai_errors_7d).map(([k, v]) => `${k} ${v}`).join(' · ')}
        </p>
      )}
    </>
  );
}
