import { ArrowLeft, Check, ClipboardCopy, Download, FileText, RefreshCw, ShieldCheck, ShieldQuestion, ShieldX } from 'lucide-react';
import * as React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ScoreRing } from '@/components/charts/charts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { NativeSelect, Textarea } from '@/components/ui/input';
import { EmptyState, PageHeader, Skeleton } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { hasRole } from '@/components/layout/nav';
import { SeverityBadge } from '@/features/security/severity';
import { useCreateReport } from '@/features/reports/api';
import { useMe } from '@/lib/auth/context';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useSaveCheck, useScript, useServer } from './api';
import { asSummary, gigabytes, STATUS_LABEL, STATUS_TONE, type HealthSummary } from './health';

/** How full something is: the bar grows with use and turns amber, then red. */
function Usage({ pct, className }: { pct: number; className?: string }) {
  const v = Math.max(0, Math.min(100, pct));
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-surface-2', className)} aria-hidden>
      <div className={cn('h-full rounded-full', v >= 90 ? 'bg-critical' : v >= 80 ? 'bg-high' : 'bg-brand')} style={{ width: `${v}%` }} />
    </div>
  );
}

function Stat({ label, value, hint, bar }: { label: string; value: React.ReactNode; hint?: string; bar?: number }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular tracking-tight">{value}</div>
      {bar !== undefined && <Usage pct={bar} className="mt-2" />}
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}

/** Step 1 and 2: the script to run on the server, and the box for what it printed. */
function CollectCard({ serverId, canEdit, hasCheck }: { serverId: string; canEdit: boolean; hasCheck: boolean }) {
  const { data: script, isPending } = useScript(serverId);
  const save = useSaveCheck(serverId);
  const [output, setOutput] = React.useState('');
  const [copied, setCopied] = React.useState(false);
  const copy = async () => {
    if (!script) return;
    try {
      await navigator.clipboard.writeText(script.script);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Copy is not available here. Use Download instead.');
    }
  };
  const download = () => {
    if (!script) return;
    const url = URL.createObjectURL(new Blob([script.script], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = script.filename;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>{hasCheck ? 'Run a new check' : 'Run the health check'}</CardTitle>
        <CardDescription>
          The script only reads information. It changes nothing on the server, sends nothing anywhere and does not read passwords, files or command lines.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">1. Run this {script?.language === 'powershell' ? 'PowerShell' : 'Bash'} script on the server</h3>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => void copy()} disabled={!script}>
                {copied ? <Check aria-hidden /> : <ClipboardCopy aria-hidden />} {copied ? 'Copied' : 'Copy script'}
              </Button>
              <Button size="sm" variant="secondary" onClick={download} disabled={!script}>
                <Download aria-hidden /> Download
              </Button>
            </div>
          </div>
          {isPending ? (
            <Skeleton className="h-40" />
          ) : (
            <>
              <ol className="mb-3 list-decimal space-y-1 pl-5 text-sm text-muted">
                {script?.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
              <pre
                tabIndex={0}
                aria-label="Collection script"
                className="well max-h-64 overflow-auto rounded-lg border border-border p-3 font-mono text-xs leading-5 text-text focus-visible:outline-2 focus-visible:outline-brand"
              >
                {script?.script}
              </pre>
            </>
          )}
        </div>
        <div>
          <label htmlFor="server-output" className="mb-2 block text-sm font-semibold">
            2. Paste the output here
          </label>
          <Textarea
            id="server-output"
            className="min-h-40 font-mono text-xs"
            placeholder={'{\n  "schema": "kloudrecon...",\n  ...\n}'}
            value={output}
            onChange={(e) => setOutput(e.target.value)}
            disabled={!canEdit}
            spellCheck={false}
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted">Paste everything the script printed (the JSON). It is stored with this server and turned into the health report.</p>
            <Button loading={save.isPending} disabled={!canEdit || output.trim().length < 2} onClick={() => save.mutate(output, { onSuccess: () => setOutput('') })}>
              <RefreshCw aria-hidden /> Save and build report
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const CHECK_ICON = { pass: ShieldCheck, fail: ShieldX, unknown: ShieldQuestion } as const;
const CHECK_CLASS = { pass: 'text-success-strong', fail: 'text-critical-strong', unknown: 'text-subtle' } as const;

function Report({ s }: { s: HealthSummary }) {
  const p = s.patches;
  const fullest = s.disks.reduce((m, d) => Math.max(m, d.used_pct), 0);
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-col gap-5 p-5 md:flex-row md:items-center">
          <ScoreRing score={s.score} label={`Grade ${s.grade}`} size={124} stroke={9} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={STATUS_TONE[s.status]}>{STATUS_LABEL[s.status]}</Badge>
              {!s.complete && <Badge tone="warning">Partial: not run as {s.platform === 'windows' ? 'administrator' : 'root'}</Badge>}
            </div>
            <h2 className="mt-2 text-lg font-semibold">{s.os.name || 'Unknown operating system'}</h2>
            <p className="text-sm text-muted">
              {[s.os.hostname, s.os.kernel, s.os.architecture, s.os.virtualization].filter(Boolean).join(' · ')}
            </p>
            <p className="mt-2 text-sm">
              <span className="font-semibold text-critical-strong">{s.counts.critical ?? 0} critical</span>,{' '}
              <span className="font-semibold text-high-strong">{s.counts.high ?? 0} high</span>, {s.counts.medium ?? 0} medium and {s.counts.low ?? 0} low findings.
              {s.os.lifecycle.end_of_support && ` Vendor support ends ${s.os.lifecycle.end_of_support}.`}
            </p>
          </div>
        </CardContent>
      </Card>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Memory" value={`${Math.round(s.memory.used_pct)}% used`} hint={`${gigabytes(s.memory.available)} free of ${gigabytes(s.memory.total)}`} bar={s.memory.used_pct} />
        <Stat label="Fullest disk" value={`${Math.round(fullest)}% used`} hint={`${s.disks.length} disk${s.disks.length === 1 ? '' : 's'}`} bar={fullest} />
        <Stat label="Security updates missing" value={p.checked ? p.security : 'Unknown'} hint={p.checked ? `${p.critical} critical · ${p.pending} updates in total` : 'The update service could not be read'} />
        <Stat label="Uptime" value={s.os.uptime_days === null ? '—' : `${Math.round(s.os.uptime_days)} days`} hint={p.reboot_pending ? 'A restart is pending' : `CPU load ${Math.round(s.cpu.load_pct)}% on ${s.cpu.cores} cores`} />
      </div>
      <Tabs defaultValue="findings">
        <TabsList>
          <TabsTrigger value="findings">Findings</TabsTrigger>
          <TabsTrigger value="capacity">Disks and memory</TabsTrigger>
          <TabsTrigger value="patches">Patches</TabsTrigger>
          <TabsTrigger value="vulnerabilities">Vulnerabilities</TabsTrigger>
          <TabsTrigger value="logs">Errors and warnings</TabsTrigger>
          <TabsTrigger value="security">Security settings</TabsTrigger>
        </TabsList>
        <TabsContent value="findings">
          {s.findings.length === 0 ? (
            <EmptyState icon={<ShieldCheck />} title="No findings" description="This server passed every check in the health report." />
          ) : (
            <Card>
              <Table>
                <THead>
                  <TR>
                    <TH>Severity</TH>
                    <TH>Area</TH>
                    <TH>Finding</TH>
                    <TH>What to do</TH>
                  </TR>
                </THead>
                <TBody>
                  {s.findings.map((f) => (
                    <TR key={f.id}>
                      <TD>
                        <SeverityBadge severity={f.severity} />
                      </TD>
                      <TD className="text-muted">{f.area}</TD>
                      <TD className="max-w-sm">
                        <span className="block font-medium">{f.title}</span>
                        <span className="block text-xs text-muted">{f.detail}</span>
                      </TD>
                      <TD className="max-w-md text-sm">{f.recommendation}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </Card>
          )}
        </TabsContent>
        <TabsContent value="capacity">
          <Card>
            <Table>
              <THead>
                <TR>
                  <TH>Disk or mount</TH>
                  <TH>File system</TH>
                  <TH className="text-right">Size</TH>
                  <TH className="text-right">Free</TH>
                  <TH>Used</TH>
                </TR>
              </THead>
              <TBody>
                {s.disks.map((d) => (
                  <TR key={d.mount}>
                    <TD className="font-mono text-xs">{d.mount}</TD>
                    <TD className="text-muted">{d.filesystem}</TD>
                    <TD className="text-right tabular">{gigabytes(d.size)}</TD>
                    <TD className="text-right tabular">{gigabytes(d.free)}</TD>
                    <TD className="w-48">
                      <div className="flex items-center gap-2">
                        <span className={cn('w-10 text-right text-sm font-medium tabular', d.used_pct >= 90 ? 'text-critical-strong' : d.used_pct >= 80 ? 'text-high-strong' : '')}>{Math.round(d.used_pct)}%</span>
                        <Usage pct={d.used_pct} className="w-24" />
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <CardContent className="grid gap-3 border-t border-border pt-4 text-sm sm:grid-cols-3">
              <div>
                <div className="text-xs text-muted">Processor</div>
                <div className="font-medium">{s.cpu.model || '—'}</div>
                <div className="text-xs text-muted">{s.cpu.cores} cores, load {Math.round(s.cpu.load_pct)}% at check time</div>
              </div>
              <div>
                <div className="text-xs text-muted">Memory</div>
                <div className="font-medium tabular">{gigabytes(s.memory.total)}, {Math.round(s.memory.used_pct)}% used</div>
              </div>
              <div>
                <div className="text-xs text-muted">{s.platform === 'windows' ? 'Page file' : 'Swap'}</div>
                <div className="font-medium tabular">{gigabytes(s.memory.swap_total)}, {Math.round(s.memory.swap_used_pct)}% used</div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="patches">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted">
                {p.checked
                  ? `${p.pending} update${p.pending === 1 ? '' : 's'} pending, ${p.security} of them security updates. Last update installed: ${p.last_patched ?? 'unknown'}${p.days_since_patch !== null ? ` (${p.days_since_patch} days ago)` : ''}.`
                  : 'The pending updates could not be read on this server, so its patch state is unknown.'}
              </CardTitle>
            </CardHeader>
            {p.items.length > 0 && (
              <Table>
                <THead>
                  <TR>
                    <TH>Update</TH>
                    <TH>ID</TH>
                    <TH>Severity</TH>
                    <TH>CVEs</TH>
                  </TR>
                </THead>
                <TBody>
                  {p.items.slice(0, 150).map((i) => (
                    <TR key={`${i.name}-${i.id}`}>
                      <TD className="max-w-md truncate" title={i.name}>
                        {i.name}
                      </TD>
                      <TD className="font-mono text-xs">{i.id}</TD>
                      <TD>{i.security ? <Badge tone={i.severity.toLowerCase() === 'critical' ? 'danger' : 'high'}>{i.severity || 'Security'}</Badge> : <span className="text-subtle">—</span>}</TD>
                      <TD className="max-w-xs truncate font-mono text-xs" title={i.cves.join(', ')}>
                        {i.cves.slice(0, 3).join(', ')}
                        {i.cves.length > 3 ? ` +${i.cves.length - 3}` : ''}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </Card>
        </TabsContent>
        <TabsContent value="vulnerabilities">
          {s.vulnerabilities.length === 0 ? (
            <EmptyState icon={<ShieldCheck />} title="No known vulnerability named" description="The pending updates of this server name no CVE or security advisory. Servers that could not read their update service show nothing here." />
          ) : (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted">Vulnerabilities that the pending updates fix, as named by the operating system&apos;s own update service.</CardTitle>
              </CardHeader>
              <Table>
                <THead>
                  <TR>
                    <TH>Identifier</TH>
                    <TH>Severity</TH>
                    <TH>Fixed by</TH>
                  </TR>
                </THead>
                <TBody>
                  {s.vulnerabilities.slice(0, 200).map((v) => (
                    <TR key={`${v.id}-${v.source}`}>
                      <TD className="font-mono text-xs">
                        {v.id.startsWith('CVE-') ? (
                          <a href={`https://www.cve.org/CVERecord?id=${v.id}`} target="_blank" rel="noreferrer" className="font-medium text-brand-strong hover:underline">
                            {v.id}
                          </a>
                        ) : (
                          v.id
                        )}
                      </TD>
                      <TD>{v.severity}</TD>
                      <TD className="max-w-md truncate font-mono text-xs" title={v.source}>
                        {v.source}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </Card>
          )}
        </TabsContent>
        <TabsContent value="logs">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted">
                Last 7 days: {s.logs.critical.toLocaleString()} critical, {s.logs.errors.toLocaleString()} errors, {s.logs.warnings.toLocaleString()} warnings.
              </CardTitle>
            </CardHeader>
            {s.logs.top.length > 0 && (
              <Table>
                <THead>
                  <TR>
                    <TH>Source</TH>
                    <TH className="text-right">Count</TH>
                    <TH>Last seen</TH>
                    <TH>Message</TH>
                  </TR>
                </THead>
                <TBody>
                  {s.logs.top.map((e) => (
                    <TR key={`${e.source}-${e.message}`}>
                      <TD className="max-w-48 truncate" title={e.source}>
                        {e.source}
                      </TD>
                      <TD className="text-right tabular">{e.count}</TD>
                      <TD className="whitespace-nowrap text-xs text-muted">{e.last.slice(0, 16).replace('T', ' ')}</TD>
                      <TD className="max-w-xl text-xs">{e.message}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
            {s.services.failed.length > 0 && (
              <CardContent className="border-t border-border pt-4">
                <h3 className="mb-2 text-sm font-semibold">Services that are not running</h3>
                <ul className="flex flex-wrap gap-2">
                  {s.services.failed.map((f) => (
                    <li key={f.name}>
                      <Badge tone="warning">{f.display_name || f.name}</Badge>
                    </li>
                  ))}
                </ul>
              </CardContent>
            )}
          </Card>
        </TabsContent>
        <TabsContent value="security">
          <Card>
            <ul className="divide-y divide-border">
              {s.security.map((c) => {
                const Icon = CHECK_ICON[c.status];
                return (
                  <li key={c.key} className="flex items-start gap-3 px-5 py-3">
                    <Icon className={cn('mt-0.5 size-4 shrink-0', CHECK_CLASS[c.status])} aria-hidden />
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{c.label}</div>
                      <div className="text-xs text-muted">{c.status === 'pass' ? 'Passed' : c.status === 'fail' ? 'Failed' : 'Could not be checked'}{c.detail ? `: ${c.detail}` : ''}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
            {s.network.listening.length > 0 && (
              <CardContent className="border-t border-border pt-4">
                <h3 className="mb-2 text-sm font-semibold">Listening ports</h3>
                <div className="flex flex-wrap gap-1.5">
                  {s.network.listening.slice(0, 60).map((x) => (
                    <span key={`${x.protocol}-${x.address}-${x.port}`} className="rounded-md border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-xs" title={`${x.address} ${x.process}`}>
                      {x.port}
                      {x.process ? ` ${x.process}` : ''}
                    </span>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export function ServerDetailPage() {
  const { serverId } = useParams();
  const navigate = useNavigate();
  const { data: me } = useMe();
  const canEdit = hasRole(me?.user?.org_role, 'member');
  const [checkId, setCheckId] = React.useState<string | undefined>(undefined);
  const { data, isPending, isError } = useServer(serverId, checkId);
  const report = useCreateReport();
  const summary = asSummary(data?.check?.summary);
  if (isError) {
    return <EmptyState icon={<ShieldX />} tone="error" title="Server not found" description="It may have been removed." action={<Link to="/app/server-health" className="text-sm font-semibold text-brand-strong hover:underline">Back to Server health</Link>} />;
  }
  return (
    <>
      <Link to="/app/server-health" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-muted hover:text-text">
        <ArrowLeft className="size-4" aria-hidden /> Server health
      </Link>
      <PageHeader
        title={data?.name ?? 'Server'}
        description={data ? `${data.os_label}. ${data.check ? `Checked ${formatDateTime(data.check.collected_at ?? data.check.created_at)}.` : 'Not checked yet.'}` : undefined}
        actions={
          data?.check && (
            <>
              {data.history.length > 1 && (
                <NativeSelect className="w-56" aria-label="Health check to show" value={data.check.id} onChange={(e) => setCheckId(e.target.value)}>
                  {data.history.map((h, i) => (
                    <option key={h.id} value={h.id}>
                      {i === 0 ? 'Latest: ' : ''}
                      {formatDateTime(h.collected_at ?? h.created_at)} (score {h.score})
                    </option>
                  ))}
                </NativeSelect>
              )}
              {canEdit && (
                <Button
                  variant="secondary"
                  loading={report.isPending}
                  onClick={() => report.mutate({ type: 'server_health', server_ids: [data.id] }, { onSuccess: () => void navigate('/app/reports') })}
                >
                  <FileText aria-hidden /> Word report
                </Button>
              )}
            </>
          )
        }
      />
      {isPending ? (
        <Skeleton className="h-96" />
      ) : (
        <div className="space-y-6">
          {summary ? <Report s={summary} /> : null}
          {serverId && <CollectCard serverId={serverId} canEdit={canEdit} hasCheck={!!summary} />}
        </div>
      )}
    </>
  );
}
