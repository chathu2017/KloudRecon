import { useQuery } from '@tanstack/react-query';
import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  Circle,
  Cloud,
  FolderTree,
  GitCompareArrows,
  Globe2,
  Info,
  ListChecks,
  Network,
  PackageX,
  Route,
  Server,
  Shield,
  ShieldCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type * as React from 'react';
import { Link } from 'react-router-dom';
import { ExecutiveSummaryPanel } from '@/features/ai/panels';
import { OverviewCost } from '@/features/cost/OverviewCost';
import { SkyCloud } from '@/components/brand/AzureIcons';
import { LineChart, Meter, ScoreRing } from '@/components/charts/charts';
import { CountUp, Delta, MiniSparkline } from '@/components/charts/primitives';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/misc';
import { ChangeRow } from '@/features/changes/ChangeRow';
import { hasRole } from '@/components/layout/nav';
import { useAsOf } from '@/features/inventory/api';
import { locationLabel, typeInfo } from '@/features/inventory/types';
import { ScanStatusBadge } from '@/features/scans/ScanProgressDrawer';
import type { Finding } from '@/features/security/api';
import { RiskScore, SeverityBadge } from '@/features/security/severity';
import { SEVERITIES, SEVERITY_META } from '@/features/security/severity-meta';
import { useMembers } from '@/features/team/api';
import { api, unwrap, type Schemas } from '@/lib/api/client';
import { useMe } from '@/lib/auth/context';
import { formatDate, formatDateTime, formatElapsed, formatMoney, timeAgo } from '@/lib/format';
import { useUi } from '@/lib/ui-store';
import { cn } from '@/lib/utils';

type Overview = Schemas['OverviewOut'];

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function useOverview() {
  const scanId = useAsOf();
  return useQuery({
    queryKey: ['overview', scanId ?? ''],
    queryFn: () =>
      unwrap(api.GET('/api/v1/overview', { params: { query: scanId ? { scan_id: scanId } : {} } })),
  });
}

function Step({
  done,
  title,
  description,
  action,
}: {
  done: boolean;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <li className="flex items-start gap-3 px-5 py-4">
      {done ? (
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success-strong" aria-label="Done" />
      ) : (
        <Circle className="mt-0.5 size-5 shrink-0 text-subtle" aria-label="To do" />
      )}
      <div className="min-w-0 flex-1">
        <div className={cn('text-sm font-medium', done && 'text-muted line-through')}>{title}</div>
        <p className="mt-0.5 text-sm text-muted">{description}</p>
      </div>
      {action}
    </li>
  );
}

const MODULES = [
  {
    icon: ShieldCheck,
    title: 'Security posture',
    text: 'Attack paths, exposure, identity and 220+ checks mapped to frameworks.',
  },
  {
    icon: Network,
    title: 'Compliance mapping',
    text: 'Checks mapped to CIS, NIST, ISO 27001, PCI DSS and more, with evidence export.',
  },
  {
    icon: BarChart3,
    title: 'Reliability and governance',
    text: 'Well-Architected checks, retirements, quotas, tagging and policy compliance.',
  },
];

function GetStarted({ isAdmin }: { isAdmin: boolean }) {
  const members = useMembers();
  const teamInvited = (members.data?.length ?? 0) > 1;
  return (
    <>
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Get started</CardTitle>
            <CardDescription>Four steps to your first KloudRecon assessment.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ol className="divide-y divide-border border-t border-border">
              <Step done title="Account approved" description="Your organization is active." />
              <Step
                done={false}
                title="Connect Azure read-only"
                description="Create an app registration with the Reader role. We guide you step by step."
                action={
                  isAdmin && (
                    <Button asChild size="sm">
                      <Link to="/app/settings/connections/new">
                        <Cloud /> Connect
                      </Link>
                    </Button>
                  )
                }
              />
              <Step
                done={false}
                title="Run your first scan"
                description="It starts automatically after the connection validates."
              />
              <Step
                done={teamInvited}
                title="Invite your team"
                description="Add admins, members and read-only viewers."
                action={
                  !teamInvited && (
                    <Button asChild size="sm" variant="secondary">
                      <Link to="/app/settings/team">
                        <Users /> Invite
                      </Link>
                    </Button>
                  )
                }
              />
            </ol>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Read-only by design</CardTitle>
            <CardDescription>
              KloudRecon needs the Reader role only. Reader cannot read secrets, keys, app settings
              or data, and your client secret is stored only in Key Vault.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              to="/security"
              className="inline-flex items-center gap-1 text-sm font-medium text-brand-strong hover:underline"
            >
              How we keep your data safe <ArrowRight className="size-3.5" />
            </Link>
          </CardContent>
        </Card>
      </div>
      <h2 className="mb-4 mt-10 text-xl font-semibold tracking-[-0.02em]">What your first scan gives you</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {MODULES.map((m) => (
          <Card key={m.title} className="p-5">
            <span className="icon-tile">
              <m.icon aria-hidden />
            </span>
            <div className="mt-4 text-[16px] font-semibold">{m.title}</div>
            <p className="mt-1 text-sm text-muted">{m.text}</p>
          </Card>
        ))}
      </div>
    </>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  format,
  hint,
  to,
  spark,
  delta,
  tone,
}: {
  icon: LucideIcon | typeof SkyCloud;
  label: string;
  value: number | string;
  format?: (n: number) => string;
  hint?: React.ReactNode;
  to?: string;
  spark?: number[];
  delta?: React.ReactNode;
  tone?: 'critical' | 'success';
}) {
  const body = (
    <Card
      className={cn(
        'group relative h-full p-4',
        to &&
          'transition-[border-color,box-shadow,transform] duration-150 hover:-translate-y-px hover:border-border-strong hover:shadow-[var(--highlight),var(--shadow-md)]',
      )}
    >
      <div className="flex items-center gap-2.5 text-xs font-semibold text-muted">
        <span className="icon-tile icon-tile-sm">
          <Icon aria-hidden />
        </span>
        <span className="truncate">{label}</span>
        {to && (
          <ArrowUpRight
            className="ml-auto size-3.5 shrink-0 text-subtle opacity-0 transition-opacity duration-150 group-hover:opacity-100"
            aria-hidden
          />
        )}
      </div>
      <div
        className={cn(
          'mt-2.5 kpi-value',
          tone === 'critical' && 'text-critical-strong',
          tone === 'success' && 'text-success-strong',
        )}
      >
        {typeof value === 'number' ? <CountUp value={value} {...(format ? { format } : {})} /> : value}
      </div>
      {(hint !== undefined || delta !== undefined || spark) && (
        <div className="mt-1.5 flex min-h-5 items-center gap-2 text-xs text-muted">
          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            {delta}
            {hint}
          </span>
          {spark && (
            <MiniSparkline
              values={spark}
              tone={tone === 'critical' ? 'critical' : 'brand'}
              className="h-5 w-14"
            />
          )}
        </div>
      )}
    </Card>
  );
  return to ? (
    <Link to={to} className="rounded-lg focus-visible:outline-2">
      {body}
    </Link>
  ) : (
    body
  );
}

/** Section heading inside the dashboard: 18px, with an optional link on the right. */
function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-3 mt-2 flex items-end justify-between gap-3">
      <h2 className="text-lg font-semibold">{children}</h2>
      {action}
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2)
    return <p className="text-sm text-muted">Trend appears after two scans.</p>;
  const w = 320;
  const h = 64;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - 6 - ((v - min) / span) * (h - 12);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="h-16 w-full text-brand-strong"
      role="img"
      aria-label={`Resource count over the last ${values.length} scans: from ${values[0] ?? 0} to ${values[values.length - 1] ?? 0}`}
      preserveAspectRatio="none"
    >
      <polyline
        points={`0,${h} ${pts.join(' ')} ${w},${h}`}
        className="fill-brand-soft stroke-none"
      />
      <polyline points={pts.join(' ')} fill="none" stroke="currentColor" strokeWidth={2} />
    </svg>
  );
}

function BarList({ rows }: { rows: { key: string; label: React.ReactNode; count: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">{r.label}</span>
            <span className="tabular text-muted">{r.count.toLocaleString()}</span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-brand"
              style={{ width: `${(r.count / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

const SEVERITY: Record<string, { icon: LucideIcon; className: string; label: string }> = {
  high: { icon: AlertTriangle, className: 'text-critical-strong', label: 'High' },
  medium: { icon: AlertTriangle, className: 'text-medium-strong', label: 'Medium' },
  low: { icon: Info, className: 'text-info-strong', label: 'Low' },
};

interface SecurityBlock {
  score: Record<
    'overall' | 'security' | 'cost' | 'reliability' | 'operations' | 'performance' | 'governance',
    number | null
  > & {
    grade: string | null;
  };
  secure_score: number | null;
  critical_risks: number;
  high_risks: number;
  exposed: number;
  attack_paths: number;
  open_findings: number;
  by_severity: Record<string, number | undefined>;
  potential_savings: number;
  compliance: {
    framework: string;
    name: string;
    percent: number | null;
    controls_failing: number;
  } | null;
  top_risks: Finding[];
  score_history: {
    scan_id: string;
    started_at: string | null;
    overall: number | null;
    security: number | null;
  }[];
}

const PILLARS = [
  ['security', 'Security'],
  ['reliability', 'Reliability'],
  ['cost', 'Cost'],
  ['operations', 'Operations'],
  ['performance', 'Performance'],
  ['governance', 'Governance'],
] as const;

function SecurityPosture({ sec }: { sec: SecurityBlock }) {
  const history = sec.score_history;
  const compliance = sec.compliance;
  const overall = history.map((h) => h.overall).filter((v): v is number => typeof v === 'number');
  const prev = overall.length > 1 ? overall[overall.length - 2] : undefined;
  const scoreDelta = sec.score.overall !== null && prev !== undefined ? sec.score.overall - prev : null;
  return (
    <>
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,5fr)_minmax(0,8fr)]">
        <Card className="relative overflow-hidden">
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>KloudRecon score</CardTitle>
                <CardDescription>
                  Weighted across the Well-Architected pillars and governance.
                </CardDescription>
              </div>
              {scoreDelta !== null && (
                <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted">
                  <Delta value={scoreDelta} /> vs previous scan
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
              <ScoreRing
                score={sec.score.overall}
                label={sec.score.grade ? `Grade ${sec.score.grade}` : undefined}
              />
              <ul className="w-full min-w-0 flex-1 space-y-2.5">
                {PILLARS.map(([key, label]) => (
                  <li key={key}>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted">{label}</span>
                      <span className="font-mono font-medium tabular">{sec.score[key] ?? '—'}</span>
                    </div>
                    <Meter value={sec.score[key]} className="mt-1" />
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Kpi
            icon={AlertOctagon}
            label="Critical risks"
            value={sec.critical_risks}
            {...(sec.critical_risks ? { tone: 'critical' as const } : {})}
            hint={`${sec.high_risks} high`}
            to="/app/security/findings?severity=critical&pillar=security"
          />
          <Kpi icon={Route} label="Attack paths" value={sec.attack_paths} to="/app/security/attack-paths" />
          <Kpi
            icon={Globe2}
            label="Internet-exposed"
            value={sec.exposed}
            hint="resources"
            to="/app/security/exposure"
          />
          <Kpi
            icon={ShieldCheck}
            label={compliance ? `${compliance.name} compliance` : 'Compliance'}
            value={compliance?.percent == null ? '—' : compliance.percent}
            format={percent}
            hint={
              compliance
                ? `${compliance.controls_failing} control(s) failing`
                : 'no framework selected'
            }
            to={
              compliance
                ? `/app/security/compliance/${compliance.framework}`
                : '/app/security/compliance'
            }
          />
          <Kpi
            icon={Shield}
            label="Defender secure score"
            value={sec.secure_score === null ? '—' : Math.round(sec.secure_score)}
            format={percent}
            to="/app/security/coverage"
          />
          <Kpi
            icon={ListChecks}
            label="Open findings"
            value={sec.open_findings}
            {...(sec.potential_savings > 0
              ? { hint: `${formatMoney(sec.potential_savings)}/mo potential savings` }
              : {})}
            to="/app/security/findings"
          />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <Card className="overflow-hidden xl:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Top security risks</CardTitle>
              <Link
                to="/app/security/findings?pillar=security"
                className="text-sm font-semibold text-brand-strong hover:underline"
              >
                View all
              </Link>
            </div>
            <CardDescription>
              {sec.open_findings === 0
                ? 'No open findings.'
                : SEVERITIES.filter((k) => sec.by_severity[k]).map((k, i) => (
                    <span key={k}>
                      {i > 0 && ' · '}
                      <span className={SEVERITY_META[k].text}>{sec.by_severity[k]}</span>{' '}
                      {SEVERITY_META[k].label.toLowerCase()}
                    </span>
                  ))}
            </CardDescription>
          </CardHeader>
          {sec.top_risks.length === 0 ? (
            <CardContent>
              <p className="flex items-center gap-2 text-sm text-muted">
                <CheckCircle2 className="size-4 text-success-strong" aria-hidden /> No open security risks.
              </p>
            </CardContent>
          ) : (
            <ol className="divide-y divide-border border-t border-border">
              {sec.top_risks.map((f) => (
                <li key={f.id}>
                  <Link
                    to={`/app/security/findings/${f.id}`}
                    className="flex items-center gap-3 px-5 py-2.5 transition-colors duration-100 hover:bg-surface-2"
                  >
                    <SeverityBadge severity={f.severity} className="w-[4.75rem] shrink-0 justify-center" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{f.title}</span>
                      <span className="block truncate font-mono text-xs text-muted">{f.resource_name}</span>
                    </span>
                    <RiskScore score={f.risk_score} className="hidden sm:inline-flex" />
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </Card>
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>Score over time</CardTitle>
            <CardDescription>Overall KloudRecon score per scan.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col">
            <LineChart
              className="flex-1"
              values={history.map((h) => h.overall)}
              labels={history.map((h) => (h.started_at ? formatDate(h.started_at) : ''))}
              ariaLabel={`Overall score over the last ${history.length} scans`}
            />
          </CardContent>
          <CardContent className="mt-auto border-t border-border pt-4">
            <SeverityMix counts={sec.by_severity} total={sec.open_findings} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}

/** Open findings by severity: one stacked bar plus a labelled count per severity. */
function SeverityMix({ counts, total }: { counts: Record<string, number | undefined>; total: number }) {
  const rows = SEVERITIES.map((k) => ({ k, n: counts[k] ?? 0 }));
  const sum = Math.max(1, rows.reduce((a, r) => a + r.n, 0));
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between text-xs">
        <span className="font-semibold text-muted">Open findings by severity</span>
        <span className="font-mono font-medium tabular">{total.toLocaleString()}</span>
      </div>
      <div className="flex h-2 gap-0.5 overflow-hidden rounded-full" aria-hidden>
        {rows
          .filter((r) => r.n > 0)
          .map((r) => (
            <div key={r.k} className={SEVERITY_META[r.k].bg} style={{ width: `${(r.n / sum) * 100}%` }} />
          ))}
      </div>
      <ul className="mt-3 grid grid-cols-5 gap-1 text-center">
        {rows.map((r) => (
          <li key={r.k}>
            <Link
              to={`/app/security/findings?severity=${r.k}`}
              className="block rounded-md py-1 transition-colors duration-100 hover:bg-surface-2"
            >
              <span className={cn('block font-mono text-sm font-medium tabular', SEVERITY_META[r.k].text)}>
                {r.n.toLocaleString()}
              </span>
              <span className="block text-[11px] text-muted">{SEVERITY_META[r.k].label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function percent(n: number): string {
  return `${Math.round(n)}%`;
}

function Dashboard({ data }: { data: Overview }) {
  const openDrawer = useUi((s) => s.openScanDrawer);
  const scan = data.active_scan ?? data.latest_scan;
  const c = data.counts;
  const since = data.changes_since_last_scan;
  const sinceTotal = (since.created ?? 0) + (since.deleted ?? 0) + (since.modified ?? 0);
  const delta = data.resource_delta;
  const estate = (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi
          icon={Server}
          label="Resources"
          value={c.resources ?? 0}
          spark={data.history.map((h) => Number(h.resources ?? 0))}
          hint={
            delta === null
              ? `${c.types ?? 0} types`
              : `${delta >= 0 ? '+' : ''}${delta} since previous scan`
          }
          to="/app/inventory"
        />
        <Kpi
          icon={SkyCloud}
          label="Subscriptions"
          value={c.subscriptions ?? 0}
          to="/app/settings/connections"
        />
        <Kpi icon={FolderTree} label="Resource groups" value={c.resource_groups ?? 0} />
        <Kpi icon={Globe2} label="Locations" value={c.locations ?? 0} />
        <Kpi
          icon={GitCompareArrows}
          label="Changes"
          value={sinceTotal}
          hint={
            since.risky ? (
              <>
                since last scan · <span className="text-critical-strong">{since.risky} risky</span>
              </>
            ) : (
              'since last scan'
            )
          }
          to="/app/changes"
        />
        <Kpi
          icon={PackageX}
          label="Orphaned / unused"
          value={c.orphans ?? 0}
          to="/app/inventory?tab=orphans"
        />
      </div>
  );
  return (
    <div className="space-y-3">
      {data.security ? (
        <>
          <SecurityPosture sec={data.security as unknown as SecurityBlock} />
          <ExecutiveSummaryPanel />
        </>
      ) : (
        estate
      )}

      <div className="pt-5">
        <OverviewCost />
      </div>

      {data.security && (
        <div className="pt-5">
          <SectionTitle>Estate</SectionTitle>
          {estate}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Scan status</CardTitle>
            <CardDescription>
              {data.connections.length} connection{data.connections.length === 1 ? '' : 's'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {scan ? (
              <button
                type="button"
                onClick={() => openDrawer(scan.id)}
                className="w-full rounded-md border border-border p-3 text-left transition-colors hover:bg-surface-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">
                    Scan #{scan.sequence} · {scan.connection_name}
                  </span>
                  <ScanStatusBadge status={scan.status} />
                </div>
                <div className="mt-1 text-xs text-muted">
                  {scan.status === 'running' || scan.status === 'queued'
                    ? `${scan.progress}% · started ${timeAgo(scan.started_at ?? scan.created_at)}`
                    : `Finished ${formatDateTime(scan.finished_at)}${
                        typeof scan.stats.duration_ms === 'number'
                          ? ` · took ${formatElapsed(scan.stats.duration_ms)}`
                          : ''
                      }`}
                </div>
                {(scan.status === 'running' || scan.status === 'queued') && (
                  <div className="mt-2 h-1.5 rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full bg-brand transition-[width]"
                      style={{ width: `${Math.max(3, scan.progress)}%` }}
                    />
                  </div>
                )}
              </button>
            ) : (
              <p className="text-sm text-muted">No finished scan yet.</p>
            )}
            <div>
              <div className="mb-1 text-xs font-medium text-muted">Resources over time</div>
              <Sparkline values={data.history.map((h) => Number(h.resources ?? 0))} />
            </div>
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Needs attention</CardTitle>
            <CardDescription>
              Connection health, risky changes and unused resources.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {data.attention.length === 0 ? (
              <div className="flex items-center gap-2 border-t border-border px-5 py-4 text-sm text-muted">
                <CheckCircle2 className="size-4 text-success-strong" aria-hidden /> All clear.
              </div>
            ) : (
              <ul className="divide-y divide-border border-t border-border">
                {data.attention.map((a) => {
                  const sev = SEVERITY[String(a.severity)] ?? SEVERITY.low;
                  if (!sev) return null;
                  const Icon = sev.icon;
                  return (
                    <li key={String(a.title)}>
                      <Link
                        to={String(a.link)}
                        className="flex items-start gap-3 px-5 py-3 transition-colors hover:bg-surface-2"
                      >
                        <Icon className={cn('mt-0.5 size-4 shrink-0', sev.className)} aria-hidden />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium">
                            {String(a.title)}
                            <span className="sr-only"> ({sev.label})</span>
                          </span>
                          <span className="block text-sm text-muted">{String(a.detail)}</span>
                        </span>
                        <ArrowRight className="mt-0.5 size-4 text-subtle" aria-hidden />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Top resource types</CardTitle>
          </CardHeader>
          <CardContent>
            <BarList
              rows={data.by_type.map((t) => {
                const info = typeInfo(String(t.type));
                const Icon = info.icon;
                return {
                  key: String(t.type),
                  count: Number(t.count),
                  label: (
                    <Link
                      to={`/app/inventory?type=${encodeURIComponent(String(t.type))}`}
                      className="inline-flex items-center gap-2 hover:text-brand-strong"
                    >
                      <Icon className="size-3.5 text-muted" aria-hidden />
                      {info.label}
                    </Link>
                  ),
                };
              })}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Where it runs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <BarList
              rows={data.by_location.map((l) => ({
                key: String(l.location),
                count: Number(l.count),
                label: locationLabel(String(l.location)),
              }))}
            />
            <div>
              <div className="mb-2 text-xs font-medium text-muted">
                Subscriptions
              </div>
              <BarList
                rows={data.by_subscription.map((s) => ({
                  key: String(s.subscription_id),
                  count: Number(s.count),
                  label: String(s.name),
                }))}
              />
            </div>
          </CardContent>
        </Card>
        <Card className="overflow-hidden">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Recent changes</CardTitle>
              <Link to="/app/changes" className="text-sm font-medium text-brand-strong hover:underline">
                View all
              </Link>
            </div>
          </CardHeader>
          {data.recent_changes.length === 0 ? (
            <CardContent>
              <p className="text-sm text-muted">No changes recorded yet.</p>
            </CardContent>
          ) : (
            <ol className="divide-y divide-border border-t border-border">
              {data.recent_changes.map((ch) => (
                <ChangeRow key={ch.id} change={ch} showDate />
              ))}
            </ol>
          )}
        </Card>
      </div>
    </div>
  );
}

export function OverviewPage() {
  const { data: me } = useMe();
  const { data, isPending } = useOverview();
  const firstName = (me?.name ?? '').split(' ')[0] || 'there';
  const isAdmin = hasRole(me?.user?.org_role, 'admin');
  const empty = data && data.connections.length === 0;

  return (
    <>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-muted">{me?.org?.name}</p>
          <h1 className="mt-1 text-3xl font-bold tracking-[-0.03em]">
            {greeting()}, {firstName}
          </h1>
        </div>
        {empty && isAdmin && (
          <Button asChild>
            <Link to="/app/settings/connections/new">
              <Cloud /> Connect Azure
            </Link>
          </Button>
        )}
      </div>
      {isPending || !data ? (
        <div
          className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,5fr)_minmax(0,8fr)]"
          role="status"
          aria-busy="true"
          aria-label="Loading overview"
        >
          <Skeleton className="h-64" />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-[118px]" />
            ))}
          </div>
          <Skeleton className="h-72 xl:col-span-2" />
        </div>
      ) : empty ? (
        <GetStarted isAdmin={isAdmin} />
      ) : (
        <Dashboard data={data} />
      )}
    </>
  );
}
