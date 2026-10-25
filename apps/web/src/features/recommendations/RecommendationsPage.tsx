import {
  ArrowUpRight,
  CheckCircle2,
  CircleDot,
  Download,
  ExternalLink,
  Lightbulb,
  PiggyBank,
  PlayCircle,
  Search,
  ShieldAlert,
  Ticket,
  UserPlus,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import * as React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { CopyButton } from '@/components/CopyButton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { EmptyState, PageHeader, Skeleton } from '@/components/ui/misc';
import { Sheet } from '@/components/ui/sheet';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { hasRole } from '@/components/layout/nav';
import { Kpi, Segmented } from '@/features/cost/components';
import { typeInfo } from '@/features/inventory/types';
import { SeverityBadge } from '@/features/security/severity';
import { PILLAR_LABEL } from '@/features/security/severity-meta';
import { useMembers } from '@/features/team/api';
import { errorMessage } from '@/lib/api/client';
import { useMe } from '@/lib/auth/context';
import { downloadFile } from '@/lib/download';
import { formatDate, formatDateTime, formatMoney } from '@/lib/format';
import { useDebounced } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import {
  fetchTicket,
  useAddRecComment,
  useBulkRec,
  useRecComments,
  useRecommendations,
  useUpdateRec,
  type RecBulk,
  type RecFilters,
  type RecUpdate,
  type RecStatus,
  type Recommendation,
} from './api';
import { SOURCE_NAMES } from './meta';


const STATUS: Record<RecStatus, { label: string; icon: LucideIcon; tone: 'neutral' | 'brand' | 'success' | 'warning' }> = {
  open: { label: 'Open', icon: CircleDot, tone: 'neutral' },
  in_progress: { label: 'In progress', icon: PlayCircle, tone: 'brand' },
  done: { label: 'Done', icon: CheckCircle2, tone: 'success' },
  dismissed: { label: 'Dismissed', icon: XCircle, tone: 'warning' },
};
const COLUMNS: RecStatus[] = ['open', 'in_progress', 'done', 'dismissed'];
const BAND_TONE = { P1: 'danger', P2: 'high', P3: 'warning', P4: 'neutral' } as const;
const PAGE = 100;

export function BandBadge({ band, score }: { band: Recommendation['band']; score?: number }) {
  return (
    <Badge tone={BAND_TONE[band]} title={score !== undefined ? `Priority score ${score} of 100` : undefined}>
      {band}
      {score !== undefined && <span className="tabular">· {score}</span>}
    </Badge>
  );
}

function StatusBadge({ status }: { status: RecStatus }) {
  const s = STATUS[status];
  return (
    <Badge tone={s.tone}>
      <s.icon aria-hidden />
      {s.label}
    </Badge>
  );
}

function Impact({ r }: { r: Recommendation }) {
  return (
    <div className="flex flex-col items-start gap-1">
      {r.severity && r.risk_score > 0 && <SeverityBadge severity={r.severity} />}
      {r.monthly_saving > 0 && (
        <span className="text-xs font-medium tabular text-success-strong">
          −{formatMoney(r.monthly_saving, r.currency)}/mo
        </span>
      )}
    </div>
  );
}

function useFilters(): [RecFilters & { view: 'table' | 'board' }, (p: Record<string, string | undefined>) => void] {
  const [params, setParams] = useSearchParams();
  const list = (k: string) => params.get(k)?.split(',').filter(Boolean);
  const kind = params.get('kind');
  const filters: RecFilters & { view: 'table' | 'board' } = {
    q: params.get('q') ?? undefined,
    source: list('source'),
    pillar: list('pillar'),
    band: list('band'),
    status: list('status'),
    kind: kind === 'risk' || kind === 'savings' ? kind : undefined,
    assignee: params.get('assignee') ?? undefined,
    view: params.get('view') === 'board' ? 'board' : 'table',
  };
  const update = (patch: Record<string, string | undefined>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v) next.set(k, v);
          else next.delete(k);
        }
        return next;
      },
      { replace: true },
    );
  return [filters, update];
}

export function RecommendationsPage() {
  const [filters, update] = useFilters();
  const [search, setSearch] = React.useState(filters.q ?? '');
  const q = useDebounced(search, 300);
  React.useEffect(() => {
    if ((filters.q ?? '') !== q) update({ q: q || undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync debounced input to the URL
  }, [q]);
  const { view, ...apiFilters } = filters;
  // The board shows every status; the table defaults to the active backlog.
  const query: RecFilters =
    view === 'table' && !apiFilters.status ? { ...apiFilters, status: ['open', 'in_progress'] } : apiFilters;
  const { data, isPending, isError, error } = useRecommendations(query);
  const { data: me } = useMe();
  const canEdit = hasRole(me?.user?.org_role, 'member');
  const [openRef, setOpenRef] = React.useState<string | null>(null);
  const current = data?.items.find((i) => i.ref === openRef) ?? null;

  const exportCsv = () =>
    downloadFile(
      '/api/v1/recommendations/export',
      {
        q: filters.q,
        source: filters.source,
        pillar: filters.pillar,
        band: filters.band,
        status: query.status,
      },
      'kloudrecon-recommendations.csv',
    ).catch((e: unknown) => toast.error(errorMessage(e)));

  const h = data?.headline;
  return (
    <>
      <PageHeader
        title="Recommendations"
        description="One prioritized backlog from security findings, Advisor, Defender, rightsizing, waste and commitments. Priority = impact × confidence ÷ effort."
        actions={
          <Button variant="secondary" onClick={() => void exportCsv()}>
            <Download />
            Export CSV
          </Button>
        }
      />
      {h ? (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            icon={PiggyBank}
            label="Potential savings"
            value={`${formatMoney(h.monthly_savings, h.currency)}/mo`}
            tone="success"
            hint={`${formatMoney(h.yearly_savings, h.currency)} per year`}
          />
          <Kpi
            icon={ShieldAlert}
            label="Risk reduction"
            value={`${h.critical} critical · ${h.high} high`}
            hint={`Top 10 items remove ${h.top10_risk_reduction_pct}% of open risk points`}
          />
          <Kpi
            icon={Lightbulb}
            label="Open recommendations"
            value={h.open_count}
            hint={
              <span className="flex gap-1.5">
                {(['P1', 'P2', 'P3', 'P4'] as const).map((b) => (
                  <span key={b}>
                    {b} <span className="tabular font-medium text-text">{h.by_band[b] ?? 0}</span>
                  </span>
                ))}
              </span>
            }
          />
          <Kpi
            icon={CheckCircle2}
            label="Done (30 days)"
            value={h.by_status.done ?? 0}
            hint={`${h.by_status.in_progress ?? 0} in progress`}
          />
        </div>
      ) : (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted" aria-hidden />
          <Input
            aria-label="Search recommendations"
            placeholder="Search title, resource, rule…"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <NativeSelect
          aria-label="Source"
          className="w-auto"
          value={filters.source?.[0] ?? ''}
          onChange={(e) => update({ source: e.target.value || undefined })}
        >
          <option value="">All sources</option>
          {Object.entries(SOURCE_NAMES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label="Pillar"
          className="w-auto"
          value={filters.pillar?.[0] ?? ''}
          onChange={(e) => update({ pillar: e.target.value || undefined })}
        >
          <option value="">All pillars</option>
          {Object.entries(PILLAR_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </NativeSelect>
        <div className="flex gap-1" role="group" aria-label="Priority band">
          {(['P1', 'P2', 'P3', 'P4'] as const).map((b) => {
            const active = filters.band?.includes(b) ?? false;
            return (
              <Button
                key={b}
                size="sm"
                variant={active ? 'subtle' : 'ghost'}
                aria-pressed={active}
                onClick={() => {
                  const next = new Set(filters.band ?? []);
                  if (active) next.delete(b);
                  else next.add(b);
                  update({ band: [...next].join(',') || undefined });
                }}
              >
                {b}
              </Button>
            );
          })}
        </div>
        <Segmented
          label="Kind"
          size="sm"
          value={filters.kind ?? 'all'}
          onChange={(v) => update({ kind: v === 'all' ? undefined : v })}
          options={[
            { value: 'all', label: 'All' },
            { value: 'risk', label: 'Risk' },
            { value: 'savings', label: 'Savings' },
          ]}
        />
        <div className="ml-auto">
          <Segmented
            label="View"
            size="sm"
            value={view}
            onChange={(v) => update({ view: v === 'board' ? 'board' : undefined })}
            options={[
              { value: 'table', label: 'Table' },
              { value: 'board', label: 'Kanban' },
            ]}
          />
        </div>
      </div>

      {isError ? (
        <EmptyState title="Recommendations could not load" description={errorMessage(error)} />
      ) : isPending ? (
        <Skeleton className="h-96" />
      ) : !data.items.length ? (
        <EmptyState
          icon={<Lightbulb />}
          title={data.headline.open_count ? 'No recommendations match these filters' : 'No recommendations yet'}
          description={
            data.headline.open_count
              ? 'Clear a filter to see more of the backlog.'
              : 'Connect Azure and run a scan: findings, rightsizing, waste and commitments land here.'
          }
          action={
            data.headline.open_count ? undefined : (
              <Button asChild>
                <Link to="/app/settings/connections">Connect Azure</Link>
              </Button>
            )
          }
        />
      ) : view === 'board' ? (
        <Board items={data.items} canEdit={canEdit} onOpen={setOpenRef} />
      ) : (
        <RecTable items={data.items} total={data.total} canEdit={canEdit} onOpen={setOpenRef} meId={me?.user?.id} />
      )}
      <RecDrawer key={openRef ?? 'none'} rec={current} canEdit={canEdit} onClose={() => setOpenRef(null)} />
    </>
  );
}

// ---- table ------------------------------------------------------------------------------------
function RecTable({
  items,
  total,
  canEdit,
  onOpen,
  meId,
}: {
  items: Recommendation[];
  total: number;
  canEdit: boolean;
  onOpen: (ref: string) => void;
  meId: string | undefined;
}) {
  const [shown, setShown] = React.useState(PAGE);
  const [selection, setSelection] = React.useState<{ data: Recommendation[]; refs: Set<string> }>({
    data: items,
    refs: new Set(),
  });
  const selected = selection.data === items ? selection.refs : new Set<string>();
  const setSelected = (refs: Set<string>) => setSelection({ data: items, refs });
  const bulk = useBulkRec();
  const visible = items.slice(0, shown);
  const run = (body: Partial<Omit<RecBulk, 'refs'>>) =>
    bulk.mutate({ refs: [...selected], clear_assignee: false, ...body }, { onSuccess: () => setSelected(new Set()) });

  return (
    <Card>
      {selected.size > 0 && canEdit && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-brand-soft/40 px-4 py-2 text-sm">
          <span className="font-medium">{selected.size} selected</span>
          <Button size="sm" variant="secondary" loading={bulk.isPending} onClick={() => run({ status: 'in_progress' })}>
            <PlayCircle />
            Start
          </Button>
          {meId && (
            <Button size="sm" variant="secondary" loading={bulk.isPending} onClick={() => run({ assignee_id: meId })}>
              <UserPlus />
              Assign to me
            </Button>
          )}
          <Button size="sm" variant="secondary" loading={bulk.isPending} onClick={() => run({ status: 'done' })}>
            <CheckCircle2 />
            Mark done
          </Button>
          <Button size="sm" variant="ghost" loading={bulk.isPending} onClick={() => run({ status: 'dismissed' })}>
            Dismiss
          </Button>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      )}
      <Table>
        <THead>
          <TR>
            {canEdit && (
              <TH className="w-10">
                <input
                  type="checkbox"
                  aria-label="Select all visible"
                  className="size-4 accent-brand"
                  checked={visible.length > 0 && visible.every((i) => selected.has(i.ref))}
                  onChange={(e) => setSelected(e.target.checked ? new Set(visible.map((i) => i.ref)) : new Set())}
                />
              </TH>
            )}
            <TH>Priority</TH>
            <TH>Recommendation</TH>
            <TH>Source</TH>
            <TH>Impact</TH>
            <TH>Effort</TH>
            <TH>Status</TH>
            <TH>Owner</TH>
          </TR>
        </THead>
        <TBody>
          {visible.map((r) => {
            const info = r.resource_type ? typeInfo(r.resource_type) : null;
            return (
              <TR key={r.ref} className="cursor-pointer align-top" onClick={() => onOpen(r.ref)}>
                {canEdit && (
                  <TD onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label={`Select ${r.title}`}
                      className="size-4 accent-brand"
                      checked={selected.has(r.ref)}
                      onChange={(e) => {
                        const next = new Set(selected);
                        if (e.target.checked) next.add(r.ref);
                        else next.delete(r.ref);
                        setSelected(next);
                      }}
                    />
                  </TD>
                )}
                <TD>
                  <BandBadge band={r.band} score={r.priority} />
                </TD>
                <TD className="max-w-md">
                  <button
                    type="button"
                    className="block w-full text-left font-medium hover:underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpen(r.ref);
                    }}
                  >
                    {r.title}
                  </button>
                  {r.resource_name && (
                    <span className="mt-0.5 block truncate text-xs text-muted">
                      {info?.label ?? r.resource_type} · {r.resource_name}
                      {r.resource_group ? ` · ${r.resource_group}` : ''}
                    </span>
                  )}
                </TD>
                <TD className="whitespace-nowrap text-xs text-muted">{SOURCE_NAMES[r.source] ?? r.source}</TD>
                <TD>
                  <Impact r={r} />
                </TD>
                <TD className="text-xs capitalize text-muted">{r.effort}</TD>
                <TD>
                  <StatusBadge status={r.status} />
                </TD>
                <TD className="whitespace-nowrap text-xs">
                  {r.assignee_name ?? <span className="text-subtle">Unassigned</span>}
                  {r.due_at && (
                    <span className={cn('block', r.overdue ? 'font-medium text-critical-strong' : 'text-muted')}>
                      Due {formatDate(r.due_at)}
                    </span>
                  )}
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
      <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-muted">
        <span>
          Showing {visible.length} of {total}
        </span>
        {shown < items.length && (
          <Button size="sm" variant="secondary" onClick={() => setShown((n) => n + PAGE)}>
            Show more
          </Button>
        )}
      </div>
    </Card>
  );
}

// ---- kanban -----------------------------------------------------------------------------------
const CARDS_PER_COLUMN = 40;

function Board({ items, canEdit, onOpen }: { items: Recommendation[]; canEdit: boolean; onOpen: (ref: string) => void }) {
  const updateRec = useUpdateRec();
  const [over, setOver] = React.useState<RecStatus | null>(null);
  const move = (ref: string, status: RecStatus) => {
    const rec = items.find((i) => i.ref === ref);
    if (!rec || rec.status === status) return;
    updateRec.mutate(
      { ref, body: { status, clear_assignee: false, clear_due: false } },
      { onSuccess: () => toast.success(`Moved to ${STATUS[status].label}`) },
    );
  };
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {COLUMNS.map((col) => {
        const cards = items.filter((i) => i.status === col);
        const saving = cards.reduce((s, i) => s + i.monthly_saving, 0);
        const S = STATUS[col];
        return (
          <section
            key={col}
            aria-label={`${S.label} column`}
            onDragOver={(e) => {
              if (!canEdit) return;
              e.preventDefault();
              setOver(col);
            }}
            onDragLeave={() => setOver((o) => (o === col ? null : o))}
            onDrop={(e) => {
              e.preventDefault();
              setOver(null);
              const ref = e.dataTransfer.getData('text/plain');
              if (ref) move(ref, col);
            }}
            className={cn(
              'flex min-h-64 flex-col rounded-lg border border-border bg-surface-2/60 transition-colors',
              over === col && 'border-brand bg-brand-soft/40',
            )}
          >
            <header className="flex items-center gap-2 px-3 py-2.5">
              <S.icon className="size-4 text-muted" aria-hidden />
              <h2 className="text-sm font-semibold">{S.label}</h2>
              <Badge>{cards.length}</Badge>
              {saving > 0 && (
                <span className="ml-auto text-xs tabular text-success-strong">
                  {formatMoney(saving, cards[0]?.currency ?? 'USD')}/mo
                </span>
              )}
            </header>
            <ol className="flex flex-1 flex-col gap-2 px-2 pb-2">
              {cards.slice(0, CARDS_PER_COLUMN).map((r) => (
                <li
                  key={r.ref}
                  draggable={canEdit}
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', r.ref);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  className={cn(
                    'rounded-md border border-border bg-surface p-3 shadow-sm',
                    canEdit && 'cursor-grab active:cursor-grabbing',
                  )}
                >
                  <div className="mb-1.5 flex items-center gap-1.5">
                    <BandBadge band={r.band} />
                    <span className="truncate text-[11px] text-muted">{SOURCE_NAMES[r.source] ?? r.source}</span>
                  </div>
                  <button
                    type="button"
                    className="line-clamp-2 text-left text-sm font-medium hover:underline"
                    onClick={() => onOpen(r.ref)}
                  >
                    {r.title}
                  </button>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <Impact r={r} />
                    {canEdit && (
                      <NativeSelect
                        aria-label={`Move ${r.title}`}
                        className="h-7 w-auto px-2 text-xs"
                        value={r.status}
                        onChange={(e) => move(r.ref, e.target.value as RecStatus)}
                      >
                        {COLUMNS.map((c) => (
                          <option key={c} value={c}>
                            {STATUS[c].label}
                          </option>
                        ))}
                      </NativeSelect>
                    )}
                  </div>
                </li>
              ))}
              {cards.length > CARDS_PER_COLUMN && (
                <li className="px-1 py-2 text-center text-xs text-muted">
                  +{cards.length - CARDS_PER_COLUMN} more · filter to narrow the column
                </li>
              )}
              {!cards.length && <li className="px-1 py-6 text-center text-xs text-subtle">Nothing here</li>}
            </ol>
          </section>
        );
      })}
    </div>
  );
}

// ---- drawer -----------------------------------------------------------------------------------
function RecDrawer({ rec, canEdit, onClose }: { rec: Recommendation | null; canEdit: boolean; onClose: () => void }) {
  const updateRec = useUpdateRec();
  const { data: members } = useMembers();
  const { data: comments } = useRecComments(rec?.ref ?? null);
  const addComment = useAddRecComment();
  const [note, setNote] = React.useState('');
  const [ticket, setTicket] = React.useState<{ format: string; title: string; body: string } | null>(null);
  if (!rec) return <Sheet open={false} onOpenChange={onClose} title="" children={null} />;
  const patch = (body: Partial<RecUpdate>) =>
    updateRec.mutate({ ref: rec.ref, body: { clear_assignee: false, clear_due: false, ...body } });
  const loadTicket = (format: 'jira' | 'ado') =>
    void fetchTicket(rec.ref, format)
      .then(setTicket)
      .catch((e: unknown) => toast.error(errorMessage(e)));

  return (
    <Sheet
      open={!!rec}
      onOpenChange={(v) => !v && onClose()}
      title={rec.title}
      description={`${SOURCE_NAMES[rec.source] ?? rec.source} · ${PILLAR_LABEL[rec.pillar] ?? rec.pillar}`}
    >
      <div className="space-y-6 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <BandBadge band={rec.band} score={rec.priority} />
          <StatusBadge status={rec.status} />
          {rec.severity && rec.risk_score > 0 && <SeverityBadge severity={rec.severity} />}
          <Badge>Effort: {rec.effort}</Badge>
          <Badge>Confidence: {rec.confidence}</Badge>
        </div>

        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Fact label="Impact" value={`${rec.impact}/100`} />
          <Fact label="Risk score" value={rec.risk_score ? `${rec.risk_score}/100` : '—'} />
          <Fact
            label="Saving"
            value={rec.monthly_saving ? `${formatMoney(rec.monthly_saving, rec.currency)}/mo` : '—'}
          />
          <Fact
            label="Per year"
            value={rec.monthly_saving ? formatMoney(rec.monthly_saving * 12, rec.currency) : '—'}
          />
        </dl>

        <section>
          <h3 className="mb-1 text-sm font-semibold">Why it matters</h3>
          <p className="text-sm leading-6 text-muted">{rec.detail}</p>
          {rec.resource_name && (
            <p className="mt-2 text-sm">
              <span className="text-muted">Resource: </span>
              <span className="font-medium">{rec.resource_name}</span>
              {rec.resource_group && <span className="text-muted"> · {rec.resource_group}</span>}
            </p>
          )}
          <Button asChild variant="link" className="mt-2">
            <Link to={rec.link}>
              Open details <ArrowUpRight />
            </Link>
          </Button>
        </section>

        {canEdit && (
          <section className="grid gap-3 sm:grid-cols-3">
            <label className="text-xs font-medium text-muted">
              Status
              <NativeSelect
                className="mt-1"
                value={rec.status}
                onChange={(e) => patch({ status: e.target.value as RecStatus })}
              >
                {COLUMNS.filter((c) => c !== 'dismissed' || !rec.finding_id).map((c) => (
                  <option key={c} value={c}>
                    {STATUS[c].label}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <label className="text-xs font-medium text-muted">
              Assignee
              <NativeSelect
                className="mt-1"
                value={rec.assignee_id ?? ''}
                onChange={(e) =>
                  e.target.value ? patch({ assignee_id: e.target.value }) : patch({ clear_assignee: true })
                }
              >
                <option value="">Unassigned</option>
                {members?.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name || m.email}
                  </option>
                ))}
              </NativeSelect>
            </label>
            <label className="text-xs font-medium text-muted">
              Due date
              <Input
                type="date"
                className="mt-1"
                value={rec.due_at ? rec.due_at.slice(0, 10) : ''}
                onChange={(e) =>
                  e.target.value
                    ? patch({ due_at: new Date(`${e.target.value}T12:00:00Z`).toISOString() })
                    : patch({ clear_due: true })
                }
              />
            </label>
            {rec.finding_id && (
              <p className="text-xs text-muted sm:col-span-3">
                Findings are dismissed with a risk exception (approval and expiry) on the finding page.
              </p>
            )}
          </section>
        )}

        <section>
          <div className="mb-2 flex items-center gap-2">
            <Ticket className="size-4 text-muted" aria-hidden />
            <h3 className="text-sm font-semibold">Copy as ticket</h3>
            <div className="ml-auto flex gap-1">
              <Button size="sm" variant="secondary" onClick={() => loadTicket('jira')}>
                Jira
              </Button>
              <Button size="sm" variant="secondary" onClick={() => loadTicket('ado')}>
                Azure DevOps
              </Button>
            </div>
          </div>
          {ticket && (
            <div className="rounded-md border border-border bg-surface-2">
              <div className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-xs">
                <span className="truncate font-medium">{ticket.title}</span>
                <CopyButton value={ticket.title} label="Title" className="ml-auto" />
                <CopyButton value={ticket.body} label="Body" />
              </div>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap p-3 font-mono text-xs leading-5">{ticket.body}</pre>
            </div>
          )}
        </section>

        <section>
          <h3 className="mb-2 text-sm font-semibold">Activity</h3>
          <ol className="space-y-3">
            {comments?.map((c) => (
              <li key={c.id} className="text-sm">
                <div className="text-xs text-muted">
                  <span className="font-medium text-text">{c.user_name ?? 'KloudRecon'}</span> ·{' '}
                  {formatDateTime(c.created_at)}
                </div>
                <p className={cn('mt-0.5 whitespace-pre-wrap', c.kind === 'event' && 'text-muted')}>{c.body}</p>
              </li>
            ))}
            {comments && !comments.length && <li className="text-sm text-subtle">No activity yet.</li>}
          </ol>
          {canEdit && (
            <form
              className="mt-3 space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!note.trim()) return;
                addComment.mutate({ ref: rec.ref, body: note.trim() }, { onSuccess: () => setNote('') });
              }}
            >
              <Textarea
                aria-label="Add a comment"
                placeholder="Add a comment…"
                className="min-h-16"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <Button type="submit" size="sm" loading={addComment.isPending} disabled={!note.trim()}>
                Comment
              </Button>
            </form>
          )}
        </section>
        {rec.arm_id && (
          <p className="break-all font-mono text-[11px] text-subtle">
            <ExternalLink className="mr-1 inline size-3" aria-hidden />
            {rec.arm_id}
          </p>
        )}
      </div>
    </Sheet>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border p-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 font-semibold tabular">{value}</dd>
    </div>
  );
}
