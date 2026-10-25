import { Box, Bug, CalendarClock, ChevronDown, Globe2, Info, RefreshCw, Search, ServerCog, ShieldCheck, Zap } from 'lucide-react';
import * as React from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, NativeSelect } from '@/components/ui/input';
import { EmptyState, PageHeader, Skeleton } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ResourceDrawer } from '@/features/inventory/ResourceDrawer';
import { useResourceParam } from '@/features/inventory/useResourceParam';
import { formatDate } from '@/lib/format';
import { useDebounced } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import type { Schemas } from '@/lib/api/client';
import { useVulnerabilities } from './api';
import { SeverityBadge } from './severity';

type Basic = Schemas['BasicAssessment'];
type Machine = Schemas['MachineAssessment'];

function Stat({ icon: Icon, label, value, hint, tone }: { icon: typeof Bug; label: string; value: React.ReactNode; hint?: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted">
        <Icon className={cn('size-3.5', tone)} aria-hidden /> {label}
      </div>
      <div className="mt-1.5 kpi-value">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </div>
  );
}

const CHECKED: Record<Machine['assessed'], { label: string; tone: 'success' | 'warning' | 'neutral' }> = {
  current: { label: 'Checked', tone: 'success' },
  stale: { label: 'Out of date', tone: 'warning' },
  never: { label: 'Never checked', tone: 'neutral' },
};

function LevelBadge({ level }: { level: Machine['level'] }) {
  if (level === 'ok') {
    return (
      <Badge tone="success">
        <ShieldCheck aria-hidden />
        Up to date
      </Badge>
    );
  }
  return <SeverityBadge severity={level} />;
}

/** Shown while no paid Defender plan is on: what the page covers now and what Defender adds. */
function DefenderNotice() {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-brand-soft px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-2.5">
        <Info className="mt-0.5 size-4 shrink-0 text-brand-strong" aria-hidden />
        <p className="text-text">
          <span className="font-semibold">This is the basic assessment.</span> It works without a paid plan: missing patches from Azure Update Manager, end-of-support software and
          unpinned container images. Turn on Defender for Servers (Plan 2) and Defender for Containers to add findings per CVE and container image scanning; KloudRecon imports them on
          the next scan.
        </p>
      </div>
      <Link to="/app/security/coverage" className="shrink-0 text-sm font-semibold text-brand-strong hover:underline">
        Check Defender coverage
      </Link>
    </div>
  );
}

function MachinesTable({ basic, onOpen }: { basic: Basic; onOpen: (armId: string) => void }) {
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const unknown = basic.summary.never_assessed + basic.summary.stale;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted">Priority rises with missing critical or security patches, internet exposure, open management ports and password sign-in.</CardTitle>
      </CardHeader>
      {!basic.patch_data && (
        <CardContent className="pb-3">
          <p className="rounded-lg bg-medium-soft px-3 py-2 text-sm text-medium-strong">Azure Update Manager results could not be read on the last scan, so patch counts are missing.</p>
        </CardContent>
      )}
      {unknown > 0 && (
        <CardContent className="pb-3">
          <div className="rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm">
            <p className="font-semibold">
              {unknown} machine{unknown === 1 ? ' has' : 's have'} no recent check for missing updates, so {unknown === 1 ? 'its' : 'their'} patch state is unknown.
            </p>
            <p className="mt-1 text-muted">
              Turn on periodic assessment (free): Azure portal, Azure Update Manager, Machines, select the machines, Update settings, set Periodic assessment to Enable. Azure then checks
              every 24 hours and the results appear here on the next scan.
            </p>
          </div>
        </CardContent>
      )}
      <Table>
        <THead>
          <TR>
            <TH>Priority</TH>
            <TH>Machine</TH>
            <TH>Update check</TH>
            <TH>Missing patches</TH>
            <TH>Why</TH>
          </TR>
        </THead>
        <TBody>
          {basic.machines.map((m) => {
            const checked = CHECKED[m.assessed];
            const open = expanded === m.arm_id;
            return (
              <React.Fragment key={m.arm_id}>
                <TR>
                  <TD>
                    <div className="flex items-center gap-2">
                      <LevelBadge level={m.level} />
                      {m.priority > 0 && <span className="text-xs tabular text-muted">{m.priority}</span>}
                    </div>
                  </TD>
                  <TD className="max-w-64">
                    <button type="button" className="block max-w-full truncate text-left font-medium hover:underline" onClick={() => onOpen(m.arm_id)}>
                      {m.name}
                    </button>
                    <span className="block truncate text-xs text-muted">
                      {m.os}
                      {m.image_date ? ` · image built ${formatDate(m.image_date)}` : ''}
                    </span>
                  </TD>
                  <TD>
                    <Badge tone={checked.tone}>{checked.label}</Badge>
                    <span className="mt-0.5 block text-xs text-muted">{m.last_assessed ? formatDate(m.last_assessed) : 'No assessment found'}</span>
                  </TD>
                  <TD>
                    {m.assessed === 'never' ? (
                      <span className="text-sm text-muted">Unknown</span>
                    ) : m.critical + m.security === 0 ? (
                      <span className="text-sm text-success-strong">None</span>
                    ) : (
                      <button
                        type="button"
                        className="flex items-center gap-1.5 text-left text-sm font-medium hover:underline"
                        aria-expanded={open}
                        onClick={() => setExpanded(open ? null : m.arm_id)}
                      >
                        <span className="tabular">
                          {m.critical > 0 && <span className="text-critical-strong">{m.critical} critical</span>}
                          {m.critical > 0 && m.security > 0 && ', '}
                          {m.security > 0 && <span className="text-high-strong">{m.security} security</span>}
                        </span>
                        <ChevronDown className={cn('size-3.5 text-muted transition-transform', open && 'rotate-180')} aria-hidden />
                      </button>
                    )}
                    {m.reboot_pending && <span className="mt-0.5 block text-xs text-medium-strong">Restart pending</span>}
                  </TD>
                  <TD className="max-w-sm text-xs text-muted">{m.reasons.length ? m.reasons.join(' · ') : 'Checked recently, nothing critical or security-related is missing.'}</TD>
                </TR>
                {open && (
                  <TR className="hover:bg-transparent">
                    <TD colSpan={5} className="bg-surface-2">
                      {m.patches.length === 0 ? (
                        <p className="text-sm text-muted">Azure reports the counts but no patch details for this machine.</p>
                      ) : (
                        <ul className="grid gap-1 py-1 text-sm md:grid-cols-2">
                          {m.patches.map((p) => (
                            <li key={`${p.name}-${p.version ?? p.kb ?? ''}`} className="flex items-baseline gap-2">
                              <Badge tone={p.classification === 'Critical' ? 'danger' : 'high'}>{p.classification}</Badge>
                              <span className="min-w-0 truncate" title={p.name}>
                                {p.name}
                                {p.version ? <span className="font-mono text-xs text-muted"> {p.version}</span> : null}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </TD>
                  </TR>
                )}
              </React.Fragment>
            );
          })}
        </TBody>
      </Table>
      {basic.machines.length === 0 && <CardContent className="text-sm text-muted">No virtual machines in the scanned subscriptions.</CardContent>}
    </Card>
  );
}

function LifecycleTable({ basic, onOpen }: { basic: Basic; onOpen: (armId: string) => void }) {
  if (basic.lifecycle.length === 0) {
    return <EmptyState icon={<ShieldCheck />} title="No end-of-support software found" description="Operating system images, runtimes, database engines and Kubernetes versions are all inside vendor support for the next 12 months." />;
  }
  return (
    <Card>
      <Table>
        <THead>
          <TR>
            <TH>Support</TH>
            <TH>Resource</TH>
            <TH>Software</TH>
            <TH>End of support</TH>
            <TH>What to do</TH>
          </TR>
        </THead>
        <TBody>
          {basic.lifecycle.map((x) => (
            <TR key={`${x.arm_id}-${x.software}`}>
              <TD>{x.status === 'ended' ? <Badge tone="danger">Ended</Badge> : <Badge tone={x.status === 'due_90_days' ? 'high' : 'warning'}>{x.days_left} days left</Badge>}</TD>
              <TD className="max-w-56">
                <button type="button" className="block max-w-full truncate text-left font-medium hover:underline" onClick={() => onOpen(x.arm_id)}>
                  {x.name}
                </button>
                {x.exposed && <span className="text-xs text-high-strong">Internet-exposed</span>}
              </TD>
              <TD>{x.software}</TD>
              <TD className="whitespace-nowrap tabular">
                {formatDate(x.end_of_support)}
                {!x.verified && <span className="block text-xs text-subtle">date not verified</span>}
              </TD>
              <TD className="max-w-md text-sm text-muted">
                {x.hint}{' '}
                {x.source_url && (
                  <a href={x.source_url} target="_blank" rel="noreferrer" className="font-medium text-brand-strong hover:underline">
                    Vendor policy
                  </a>
                )}
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </Card>
  );
}

function ImagesTable({ basic, onOpen }: { basic: Basic; onOpen: (armId: string) => void }) {
  if (basic.images.length === 0) {
    return <EmptyState icon={<ShieldCheck />} title="Every container app runs a pinned image" description="No container app uses the latest tag or an image without a tag." />;
  }
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted">
          An image without a fixed version can change on the next restart, and you cannot tell which build (and which vulnerabilities) is running. Deploy a version tag or a digest.
        </CardTitle>
      </CardHeader>
      <Table>
        <THead>
          <TR>
            <TH>Container app</TH>
            <TH>Image</TH>
            <TH>Issue</TH>
          </TR>
        </THead>
        <TBody>
          {basic.images.map((x) => (
            <TR key={`${x.arm_id}-${x.container}`}>
              <TD className="max-w-56">
                <button type="button" className="block max-w-full truncate text-left font-medium hover:underline" onClick={() => onOpen(x.arm_id)}>
                  {x.name}
                </button>
                {x.exposed && <span className="text-xs text-high-strong">Internet-exposed</span>}
              </TD>
              <TD className="max-w-md truncate font-mono text-xs" title={x.image}>
                {x.image}
              </TD>
              <TD>
                <Badge tone="warning">{x.issue === 'latest tag' ? 'Uses latest' : 'No version tag'}</Badge>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </Card>
  );
}

export function VulnerabilitiesPage() {
  const [q, setQ] = React.useState('');
  const [severity, setSeverity] = React.useState('');
  const [tab, setTab] = React.useState<string | null>(null);
  const debounced = useDebounced(q, 300);
  const { data, isPending } = useVulnerabilities(debounced || undefined, severity || undefined);
  const [, open] = useResourceParam();
  const basic = data?.basic ?? null;
  const defender = data?.defender_enabled ?? false;
  // Defender results first when there are any; otherwise the basic assessment
  const active = tab ?? (defender ? 'cve' : 'machines');
  const cveTab = active === 'cve' || active === 'resource';
  return (
    <>
      <PageHeader
        title="Vulnerabilities"
        description="Missing patches, end-of-support software and unpinned images from your read-only connection, plus CVEs from Microsoft Defender for Cloud when it is on. Ranked by internet exposure."
      />
      {isPending ? (
        <Skeleton className="h-96" />
      ) : !data || (!basic && !defender) ? (
        <EmptyState
          icon={<RefreshCw />}
          title="Run a scan to build the assessment"
          description="The basic assessment (missing patches, end-of-support software, unpinned images) is created during a scan. This scan was made before it existed."
        />
      ) : (
        <div className="space-y-4">
          {!defender && <DefenderNotice />}
          {basic && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <Stat icon={ServerCog} label="Machines checked" value={`${basic.summary.assessed}/${basic.summary.machines}`} hint={basic.summary.never_assessed ? `${basic.summary.never_assessed} never checked` : undefined} />
              <Stat icon={Bug} label="Critical patches missing" value={basic.summary.critical_patches.toLocaleString()} tone="text-critical-strong" />
              <Stat icon={Bug} label="Security patches missing" value={basic.summary.security_patches.toLocaleString()} tone="text-high-strong" />
              <Stat icon={CalendarClock} label="End-of-support software" value={basic.summary.end_of_support.toLocaleString()} hint={basic.summary.ending_soon ? `${basic.summary.ending_soon} ending within a year` : undefined} />
              <Stat icon={Box} label="Unpinned images" value={basic.summary.unpinned_images.toLocaleString()} />
            </div>
          )}
          {defender && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <Stat icon={Bug} label="CVEs (Defender)" value={(data.summary.total ?? 0).toLocaleString()} />
              <Stat icon={Zap} label="Exploitable" value={(data.summary.exploitable ?? 0).toLocaleString()} tone="text-critical-strong" />
              <Stat icon={Bug} label="CVSS 9.0+" value={(data.summary.critical ?? 0).toLocaleString()} tone="text-critical-strong" />
              <Stat icon={Globe2} label="On exposed resources" value={(data.summary.exposed ?? 0).toLocaleString()} tone="text-high-strong" />
              <Stat icon={Bug} label="Affected resources" value={(data.summary.resources ?? 0).toLocaleString()} />
            </div>
          )}
          <Tabs value={active} onValueChange={setTab}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <TabsList>
                {defender && <TabsTrigger value="cve">By CVE</TabsTrigger>}
                {defender && <TabsTrigger value="resource">CVE priority</TabsTrigger>}
                {basic && <TabsTrigger value="machines">Machines and patches</TabsTrigger>}
                {basic && <TabsTrigger value="lifecycle">Software lifecycle</TabsTrigger>}
                {basic && <TabsTrigger value="images">Container images</TabsTrigger>}
              </TabsList>
              {defender && cveTab && (
                <div className="flex flex-wrap gap-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 size-4 text-subtle" aria-hidden />
                    <Input className="w-64 pl-8" placeholder="CVE, title or resource" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search vulnerabilities" />
                  </div>
                  <NativeSelect className="w-36" value={severity} onChange={(e) => setSeverity(e.target.value)} aria-label="Severity">
                    <option value="">All severities</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </NativeSelect>
                </div>
              )}
            </div>
            {basic && (
              <>
                <TabsContent value="machines">
                  <MachinesTable basic={basic} onOpen={open} />
                </TabsContent>
                <TabsContent value="lifecycle">
                  <LifecycleTable basic={basic} onOpen={open} />
                </TabsContent>
                <TabsContent value="images">
                  <ImagesTable basic={basic} onOpen={open} />
                </TabsContent>
              </>
            )}
            {defender && (
              <>
                <TabsContent value="cve">
                  <Card>
                    <Table>
                      <THead>
                        <TR>
                          <TH>CVE</TH>
                          <TH>Description</TH>
                          <TH>CVSS</TH>
                          <TH>Exploit</TH>
                          <TH>Resources</TH>
                        </TR>
                      </THead>
                      <TBody>
                        {data.by_cve.map((c) => (
                          <TR key={String(c.cve)}>
                            <TD>
                              <a href={`https://www.cve.org/CVERecord?id=${String(c.cve)}`} target="_blank" rel="noreferrer" className="font-mono text-xs font-medium text-brand-strong hover:underline">
                                {String(c.cve)}
                              </a>
                            </TD>
                            <TD className="max-w-md">{String(c.title)}</TD>
                            <TD className={cn('tabular font-medium', Number(c.cvss) >= 9 ? 'text-critical-strong' : Number(c.cvss) >= 7 ? 'text-high-strong' : '')}>{Number(c.cvss).toFixed(1)}</TD>
                            <TD>
                              {c.exploitable ? (
                                <Badge tone="danger">
                                  <Zap aria-hidden />
                                  Known exploit
                                </Badge>
                              ) : (
                                <span className="text-subtle">—</span>
                              )}
                            </TD>
                            <TD className="tabular">{String(c.resources)}</TD>
                          </TR>
                        ))}
                      </TBody>
                    </Table>
                  </Card>
                </TabsContent>
                <TabsContent value="resource">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted">Priority = CVSS, known exploits and internet exposure</CardTitle>
                    </CardHeader>
                    <Table>
                      <THead>
                        <TR>
                          <TH>Priority</TH>
                          <TH>Resource</TH>
                          <TH>CVE</TH>
                          <TH>Severity</TH>
                          <TH>Fix</TH>
                        </TR>
                      </THead>
                      <TBody>
                        {data.items.slice(0, 300).map((v) => (
                          <TR key={v.id} className="cursor-pointer" onClick={() => open(v.arm_id)}>
                            <TD className="tabular font-medium">{v.priority}</TD>
                            <TD className="max-w-64">
                              <span className="block truncate font-medium">{v.resource_name}</span>
                              <span className="text-xs text-muted">
                                {v.image ?? (v.source === 'vm' ? 'Virtual machine' : 'Container image')}
                                {v.exposed ? ' · internet-exposed' : ''}
                              </span>
                            </TD>
                            <TD className="font-mono text-xs">{v.cve}</TD>
                            <TD>
                              <SeverityBadge severity={v.severity} />
                            </TD>
                            <TD className="text-xs text-muted">{v.patchable ? `Update to ${v.fixed_version ?? 'the latest version'}` : 'No fix yet'}</TD>
                          </TR>
                        ))}
                      </TBody>
                    </Table>
                  </Card>
                </TabsContent>
              </>
            )}
          </Tabs>
        </div>
      )}
      <ResourceDrawer />
    </>
  );
}
