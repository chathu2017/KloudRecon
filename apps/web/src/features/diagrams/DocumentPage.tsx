/**
 * Architecture document (plan 9.3): narrative per view with the diagram embedded, the network
 * address plan and component tables. The same data feeds the PDF report in Phase 5.
 */
import { AlertTriangle, ArrowLeft, ChevronRight, ExternalLink, FileText, Network } from 'lucide-react';
import * as React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, PageHeader, Skeleton } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { ArchitectureReviewPanel } from '@/features/ai/panels';
import { formatDateTime, formatMoney, formatNumber } from '@/lib/format';
import { resolveTheme, useTheme } from '@/lib/theme';
import { useUi } from '@/lib/ui-store';
import { cn } from '@/lib/utils';

/** Dense, non-wrapping document tables (they scroll sideways on narrow screens). */
const DENSE = 'text-[13px] [&_td]:whitespace-nowrap [&_td]:px-3 [&_td]:py-1.5 [&_th]:whitespace-nowrap [&_th]:px-3 [&_th]:py-2';
import {
  useArchitectureDocument,
  useDiagram,
  VIEWS,
  type ArchitectureDocument,
  type ComponentTable,
  type DocSection,
  type ViewName,
  type VnetPlan,
} from './api';
import { toSvg } from './export';
import { layoutScene } from './layout';
import { autoCollapse, buildScene } from './scene';

type Security = {
  score?: { overall: number; grade: string };
  open_findings?: number;
  by_severity?: Record<string, number>;
  exposed?: number;
  attack_paths?: number;
  compliance?: { name: string; percent: number; controls_failing: number } | null;
  top_risks?: string[];
};

type Cost = {
  data_through?: string | null;
  last30_actual?: number;
  forecast_month_end?: number | null;
  potential_savings?: number;
  open_anomalies?: number;
  by_category?: { label: string; monthly_cost: number }[];
};

/** Starts work only once the element scrolls near the viewport. */
function useNearViewport<T extends Element>(): [React.RefObject<T>, boolean] {
  const ref = React.useRef<T>(null);
  const [near, setNear] = React.useState(false);
  React.useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    if (typeof IntersectionObserver === 'undefined') {
      const id = window.setTimeout(() => setNear(true), 0);
      return () => window.clearTimeout(id);
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setNear(true);
    }, { rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  }, [near]);
  return [ref, near];
}

/** The view drawn exactly like the SVG export (same scene, layout and renderer), as an image. */
function DiagramFigure({ view, scanId }: { view: ViewName; scanId: string | undefined }) {
  const [ref, near] = useNearViewport<HTMLElement>();
  const { data, isError } = useDiagram(view, scanId, 'app', near);
  const theme = resolveTheme(useTheme((s) => s.preference));
  const [figure, setFigure] = React.useState<{ key: string; url: string; width: number; height: number } | null>(null);
  const key = data ? `${data.scan_id}:${view}:${theme}` : '';

  React.useEffect(() => {
    if (!near || !data) return;
    let cancelled = false;
    const scene = buildScene(data.graph, data.overlays, { collapsed: autoCollapse(data.graph), expanded: new Set(), focus: null, ghosts: false });
    layoutScene(scene)
      .then((layout) =>
        toSvg({ title: data.graph.title, subtitle: `Scan #${data.scan_sequence}`, scene, layout, overlay: null, showCost: false, security: false, notes: [] }),
      )
      .then(({ svg, width, height }) => {
        if (!cancelled) setFigure({ key: `${data.scan_id}:${view}:${theme}`, url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, width, height });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [near, data, view, theme]);

  const ready = figure && figure.key === key ? figure : null;
  return (
    <figure ref={ref} className="mt-4">
      <div className="overflow-hidden rounded-lg border border-border bg-[var(--dg-canvas)]">
        {ready ? (
          <Link to={`/app/diagrams?view=${view}`} title="Open the interactive diagram" className="block">
            <img
              src={ready.url}
              alt={`${VIEWS.find((v) => v.key === view)?.label ?? view} diagram`}
              width={ready.width}
              height={ready.height}
              className="mx-auto h-auto max-h-[560px] w-full object-contain"
            />
          </Link>
        ) : isError ? (
          <p className="p-6 text-sm text-muted">The diagram could not be loaded.</p>
        ) : (
          <Skeleton className="h-72 w-full rounded-none" />
        )}
      </div>
      <figcaption className="mt-1.5 flex items-center justify-between text-xs text-muted">
        <span>{VIEWS.find((v) => v.key === view)?.label} view</span>
        <Link to={`/app/diagrams?view=${view}`} className="inline-flex items-center gap-1 text-brand-strong hover:underline">
          Open interactive <ExternalLink className="size-3" aria-hidden />
        </Link>
      </figcaption>
    </figure>
  );
}

function Facts({ facts }: { facts: DocSection['facts'] }) {
  if (!facts.length) return null;
  return (
    <dl className="mt-3 flex flex-wrap gap-2">
      {facts.map((f) => (
        <div key={f.label} className="rounded-md border border-border bg-surface-2 px-2.5 py-1 text-xs">
          <dt className="inline text-muted">{f.label}: </dt>
          <dd className="inline font-semibold tabular text-text">{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function SectionBlock({ section, scanId, index }: { section: DocSection; scanId: string | undefined; index: number }) {
  return (
    <section id={`doc-${section.key}`} className="scroll-mt-20">
      <h2 className="text-xl font-semibold">
        <span className="mr-2 text-muted tabular">{index}.</span>
        {section.title}
      </h2>
      <div className="mt-2 max-w-3xl space-y-2 text-[15px] leading-relaxed text-text">
        {section.paragraphs.map((p) => (
          <p key={p}>{p}</p>
        ))}
      </div>
      {section.key !== 'overview' && <Facts facts={section.facts} />}
      {section.view && <DiagramFigure view={section.view} scanId={scanId} />}
    </section>
  );
}

function Utilization({ value }: { value: number | null | undefined }) {
  if (value === null || value === undefined) return <span className="text-muted">–</span>;
  const pct = Math.min(1, value);
  const tone = pct >= 0.8 ? 'bg-critical' : pct >= 0.6 ? 'bg-medium' : 'bg-brand';
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-2" aria-hidden>
        <span className={cn('block h-full rounded-full', tone)} style={{ width: `${Math.max(2, pct * 100)}%` }} />
      </span>
      <span className="tabular">{Math.round(value * 100)}%</span>
    </span>
  );
}

const ROLE_TONE = { hub: 'brand', spoke: 'success', standalone: 'neutral' } as const;

function VnetCard({ vnet }: { vnet: VnetPlan }) {
  return (
    <Card>
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base">{vnet.name}</CardTitle>
          <Badge tone={ROLE_TONE[vnet.role]}>{vnet.role}</Badge>
          <span className="font-mono text-sm text-muted">{vnet.address_space.join(', ')}</span>
        </div>
        <p className="text-sm text-muted">
          {vnet.subscription} · {vnet.region} · {formatNumber(vnet.allocated)} of {formatNumber(vnet.addresses)} addresses in subnets
          {vnet.peerings.length > 0 && <> · peered with {vnet.peerings.join(', ')}</>}
          {vnet.dns_servers.length > 0 && <> · DNS {vnet.dns_servers.join(', ')}</>}
        </p>
      </CardHeader>
      <CardContent>
        <Table className={DENSE}>
          <THead>
            <TR>
              <TH>Subnet</TH>
              <TH>Prefix</TH>
              <TH className="text-right">Usable</TH>
              <TH className="text-right">In use</TH>
              <TH>Utilization</TH>
              <TH>NSG</TH>
              <TH>Route table</TH>
              <TH>Delegation</TH>
            </TR>
          </THead>
          <TBody>
            {vnet.subnets.map((s) => (
              <TR key={s.name}>
                <TD className="font-medium">{s.name}</TD>
                <TD className="font-mono text-xs">{s.prefix}</TD>
                <TD className="text-right tabular">{s.usable === null ? '–' : formatNumber(s.usable)}</TD>
                <TD className="text-right tabular">{s.in_use}</TD>
                <TD>
                  <Utilization value={s.utilization} />
                </TD>
                <TD className={cn(!s.nsg && 'text-muted')}>{s.nsg ?? '–'}</TD>
                <TD className={cn(!s.route_table && 'text-muted')}>{s.route_table ?? '–'}</TD>
                <TD className={cn('text-xs', !s.delegation && 'text-muted')}>{s.delegation ?? '–'}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function AddressPlanBlock({ doc, index }: { doc: ArchitectureDocument; index: number }) {
  const plan = doc.address_plan;
  const [showAll, setShowAll] = React.useState(false);
  const issues = showAll ? plan.issues : plan.issues.slice(0, 6);
  return (
    <section id="doc-address-plan" className="scroll-mt-20">
      <h2 className="text-xl font-semibold">
        <span className="mr-2 text-muted tabular">{index}.</span>Network address plan
      </h2>
      <p className="mt-2 max-w-3xl text-[15px] leading-relaxed">
        {formatNumber(plan.total_addresses)} IPv4 addresses of address space across {plan.vnets.length} virtual networks, {formatNumber(plan.allocated)} of them
        allocated to subnets. Azure reserves 5 addresses in every subnet; &ldquo;in use&rdquo; counts the IP configurations (network interfaces, private endpoints) attached to the subnet.
        {plan.on_premises.length > 0 && <> On-premises ranges: {plan.on_premises.map((f) => `${f.value} (${f.label})`).join(', ')}.</>}
      </p>
      {plan.issues.length > 0 && (
        <Card className="mt-4">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="size-4 text-medium-strong" aria-hidden /> Address plan checks
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5 text-sm">
              {issues.map((i) => (
                <li key={i.message} className="flex items-start gap-2">
                  <Badge tone={i.severity === 'high' ? 'danger' : i.severity === 'medium' ? 'warning' : 'neutral'} className="mt-px">
                    {i.severity}
                  </Badge>
                  <span>{i.message}</span>
                </li>
              ))}
            </ul>
            {plan.issues.length > 6 && (
              <Button variant="ghost" size="sm" className="mt-2" onClick={() => setShowAll((v) => !v)}>
                {showAll ? 'Show fewer' : `Show all ${plan.issues.length}`}
              </Button>
            )}
          </CardContent>
        </Card>
      )}
      <div className="mt-4 space-y-4">
        {plan.vnets.map((v) => (
          <VnetCard key={v.arm_id} vnet={v} />
        ))}
      </div>
    </section>
  );
}

function ComponentsBlock({ tables, currency, index }: { tables: ComponentTable[]; currency: string; index: number }) {
  return (
    <section id="doc-components" className="scroll-mt-20">
      <h2 className="text-xl font-semibold">
        <span className="mr-2 text-muted tabular">{index}.</span>Components
      </h2>
      <p className="mt-2 max-w-3xl text-[15px] leading-relaxed">
        The components drawn in the diagrams, by category. Network interfaces, disks, extensions and similar parts are counted with the resource they
        belong to. Monthly cost is the last 30 days of amortized cost.
      </p>
      <div className="mt-4 space-y-2">
        {tables.map((t) => (
          <details key={t.category} className="group rounded-xl border border-border bg-surface">
            <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
              <ChevronRight className="size-4 text-muted transition-transform group-open:rotate-90" aria-hidden />
              <span className="font-medium">{t.label}</span>
              <Badge>{t.count}</Badge>
              <span className="ml-auto text-sm tabular text-muted">{t.monthly_cost > 0 ? `${formatMoney(Math.round(t.monthly_cost), currency)} / month` : ''}</span>
            </summary>
            <div className="border-t border-border px-4 pb-3">
              <Table className={DENSE}>
                <THead>
                  <TR>
                    <TH>Name</TH>
                    <TH>Type</TH>
                    <TH>Size / SKU</TH>
                    <TH>Resource group</TH>
                    <TH>Region</TH>
                    <TH className="text-right">Monthly cost</TH>
                  </TR>
                </THead>
                <TBody>
                  {t.rows.map((r) => (
                    <TR key={r.arm_id}>
                      <TD className="font-medium">{r.name}</TD>
                      <TD>{r.type_label}</TD>
                      <TD className="text-muted">{r.sku || '–'}</TD>
                      <TD>{r.resource_group}</TD>
                      <TD>{r.region}</TD>
                      <TD className="text-right tabular">{r.monthly_cost ? formatMoney(Math.round(r.monthly_cost), currency) : '–'}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
              {t.truncated && <p className="mt-2 text-xs text-muted">Showing the first {t.rows.length}; the full list is in Inventory.</p>}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

function PostureBlock({ doc, index }: { doc: ArchitectureDocument; index: number }) {
  const sec = doc.security as Security | null;
  const cost = doc.cost as Cost | null;
  if (!sec && !cost) return null;
  const maxCat = Math.max(1, ...(cost?.by_category ?? []).map((c) => c.monthly_cost));
  return (
    <section id="doc-posture" className="scroll-mt-20">
      <h2 className="text-xl font-semibold">
        <span className="mr-2 text-muted tabular">{index}.</span>Security and cost at a glance
      </h2>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {sec?.score && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Security posture</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>
                KloudRecon Score <span className="font-semibold tabular">{sec.score.overall}</span> ({sec.score.grade}) ·{' '}
                {formatNumber(sec.open_findings ?? 0)} open findings · {sec.exposed ?? 0} internet-exposed · {sec.attack_paths ?? 0} attack paths
              </p>
              <div className="flex flex-wrap gap-1.5">
                {(['critical', 'high', 'medium', 'low'] as const).map((s) => (
                  <Badge key={s} tone={s === 'critical' ? 'danger' : s === 'high' ? 'high' : s === 'medium' ? 'warning' : 'neutral'}>
                    {sec.by_severity?.[s] ?? 0} {s}
                  </Badge>
                ))}
              </div>
              {sec.compliance && (
                <p className="text-muted">
                  {sec.compliance.name}: {sec.compliance.percent}% of mapped controls passing ({sec.compliance.controls_failing} failing).
                </p>
              )}
              {sec.top_risks && sec.top_risks.length > 0 && (
                <div>
                  <p className="mb-1 font-medium">Top risks</p>
                  <ol className="list-decimal space-y-0.5 pl-5">
                    {sec.top_risks.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ol>
                </div>
              )}
              <Link to="/app/security" className="inline-flex items-center gap-1 text-brand-strong hover:underline">
                Security details <ChevronRight className="size-3.5" aria-hidden />
              </Link>
            </CardContent>
          </Card>
        )}
        {cost && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Cost</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>
                <span className="font-semibold tabular">{formatMoney(Math.round(cost.last30_actual ?? 0), doc.currency)}</span> in the last 30 days
                {cost.forecast_month_end ? <> · this month forecast {formatMoney(Math.round(cost.forecast_month_end), doc.currency)}</> : null}
                {cost.potential_savings ? <> · {formatMoney(Math.round(cost.potential_savings), doc.currency)} / month of savings found</> : null}
              </p>
              <ul className="space-y-1.5" aria-label="Monthly cost by category">
                {(cost.by_category ?? []).slice(0, 8).map((c) => (
                  <li key={c.label} className="grid grid-cols-[7.5rem_1fr_5.5rem] items-center gap-2">
                    <span className="truncate">{c.label}</span>
                    <span className="h-2 rounded-full bg-surface-2" aria-hidden>
                      <span className="block h-full rounded-full bg-[var(--chart-1)]" style={{ width: `${Math.max(1, (c.monthly_cost / maxCat) * 100)}%` }} />
                    </span>
                    <span className="text-right tabular text-muted">{formatMoney(Math.round(c.monthly_cost), doc.currency)}</span>
                  </li>
                ))}
              </ul>
              <Link to="/app/cost" className="inline-flex items-center gap-1 text-brand-strong hover:underline">
                Cost explorer <ChevronRight className="size-3.5" aria-hidden />
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </section>
  );
}

export function DocumentPage() {
  const [params] = useSearchParams();
  const globalAsOf = useUi((s) => s.asOfScanId);
  const scanId = params.get('scan') ?? globalAsOf ?? undefined;
  const { data: doc, isPending, isError } = useArchitectureDocument(scanId);

  const back = (
    <Button variant="secondary" size="sm" asChild>
      <Link to="/app/diagrams">
        <ArrowLeft aria-hidden /> Diagrams
      </Link>
    </Button>
  );
  if (isPending) {
    return (
      <div className="space-y-4">
        <PageHeader title="Architecture document" actions={back} />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (isError) {
    return (
      <div>
        <PageHeader title="Architecture document" actions={back} />
        <EmptyState tone="error" icon={<FileText />} title="No document yet" description="The document is generated from a finished scan. Run a scan, then come back." />
      </div>
    );
  }

  const sections = doc.sections;
  // numbered outline: overview, views..., then the address plan, components and posture
  const netIndex = sections.findIndex((s) => s.key === 'hub_spoke') + 1;
  const outline = [
    ...sections.slice(0, netIndex).map((s) => ({ id: `doc-${s.key}`, title: s.title })),
    { id: 'doc-address-plan', title: 'Network address plan' },
    ...sections.slice(netIndex).map((s) => ({ id: `doc-${s.key}`, title: s.title })),
    { id: 'doc-components', title: 'Components' },
    ...(doc.security || doc.cost ? [{ id: 'doc-posture', title: 'Security and cost' }] : []),
  ];
  const num = (id: string) => outline.findIndex((o) => o.id === id) + 1;
  const scanLabel = `Scan #${doc.scan_sequence}${doc.scan_started_at ? ` · ${formatDateTime(doc.scan_started_at)}` : ''}`;

  return (
    <div>
      <PageHeader
        title={doc.title}
        description={`${scanLabel} · generated ${formatDateTime(doc.generated_at)} from read-only data`}
        actions={back}
      />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_14rem]">
        <article className="min-w-0 space-y-10">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-3">
            {doc.summary.map((f) => (
              <div key={f.label} className="rounded-xl border border-border bg-surface px-3 py-2.5">
                <div className="text-xs text-muted">{f.label}</div>
                <div className="mt-0.5 whitespace-nowrap text-lg font-semibold tabular">{f.value}</div>
              </div>
            ))}
          </div>
          {sections.slice(0, netIndex).map((s) => (
            <SectionBlock key={s.key} section={s} scanId={scanId} index={num(`doc-${s.key}`)} />
          ))}
          <AddressPlanBlock doc={doc} index={num('doc-address-plan')} />
          {sections.slice(netIndex).map((s) => (
            <SectionBlock key={s.key} section={s} scanId={scanId} index={num(`doc-${s.key}`)} />
          ))}
          <ComponentsBlock tables={doc.components} currency={doc.currency} index={num('doc-components')} />
          <PostureBlock doc={doc} index={num('doc-posture')} />
          <ArchitectureReviewPanel view="hub_spoke" />
          <p className="flex items-center gap-2 border-t border-border pt-4 text-xs text-muted">
            <Network className="size-3.5" aria-hidden /> A PDF version of this document is part of Reports.
          </p>
        </article>
        <nav aria-label="Document outline" className="hidden lg:block">
          <div className="sticky top-20 space-y-1 text-sm">
            <p className="mb-2 text-xs font-medium text-muted">Contents</p>
            {outline.map((o, i) => (
              <a key={o.id} href={`#${o.id}`} className="flex gap-2 rounded px-2 py-1 text-muted hover:bg-surface-2 hover:text-text">
                <span className="tabular">{i + 1}.</span>
                <span className="truncate">{o.title}</span>
              </a>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}
