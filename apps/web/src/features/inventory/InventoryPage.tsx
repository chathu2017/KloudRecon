import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDown, ArrowUpDown, Download, PackageX, Search, Server, X } from 'lucide-react';
import * as React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input, NativeSelect } from '@/components/ui/input';
import { EmptyState, PageHeader, Skeleton } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { errorMessage } from '@/lib/api/client';
import { useDebounced } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import {
  downloadInventory,
  useAsOf,
  useFacets,
  useOrphans,
  useResources,
  type InventoryFilters,
  type Resource,
} from './api';
import { ResourceDrawer } from './ResourceDrawer';
import { useResourceParam } from './useResourceParam';
import { locationLabel, typeInfo } from './types';

const ROW_HEIGHT = 52;
const GRID =
  'grid grid-cols-[minmax(16rem,2.2fr)_minmax(10rem,1.2fr)_minmax(9rem,1fr)_8rem_9rem_minmax(8rem,1fr)] gap-4';
const FILTER_KEYS = ['q', 'type', 'resource_group', 'subscription_id', 'location', 'tag', 'sort'];

function useFilters(): [InventoryFilters, (patch: Partial<InventoryFilters>) => void] {
  const [params, setParams] = useSearchParams();
  const filters: InventoryFilters = {};
  for (const key of FILTER_KEYS) {
    const v = params.get(key);
    if (v) (filters as Record<string, string>)[key] = v;
  }
  const update = (patch: Partial<InventoryFilters>) => {
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
  };
  return [filters, update];
}

function TagChips({ tags }: { tags: Record<string, unknown> }) {
  const entries = Object.entries(tags);
  if (!entries.length) return <span className="text-subtle">—</span>;
  const [first] = entries;
  return (
    <span className="flex min-w-0 items-center gap-1">
      {first && (
        <Badge tone="neutral" className="min-w-0 truncate font-normal">
          {first[0]}={String(first[1])}
        </Badge>
      )}
      {entries.length > 1 && <span className="text-xs text-muted">+{entries.length - 1}</span>}
    </span>
  );
}

function ResourceRow({ r, onOpen }: { r: Resource; onOpen: (armId: string) => void }) {
  const info = typeInfo(r.type);
  const Icon = info.icon;
  return (
    <button
      type="button"
      onClick={() => onOpen(r.arm_id)}
      className={cn(
        GRID,
        'h-full w-full items-center border-b border-border px-4 text-left text-sm transition-colors hover:bg-surface-2/60 focus-visible:bg-surface-2',
      )}
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <Icon className="size-4 shrink-0 text-muted" aria-hidden />
        <span className="min-w-0">
          <span className="block truncate font-medium">{r.name}</span>
          <span className="block truncate text-xs text-muted">{info.label}</span>
        </span>
      </span>
      <span className="truncate text-muted">{r.resource_group ?? '—'}</span>
      <span className="truncate text-muted">{r.subscription_name ?? r.subscription_id ?? '—'}</span>
      <span className="truncate text-muted">{locationLabel(r.location)}</span>
      <span className="truncate font-mono text-xs text-muted">{r.sku ?? '—'}</span>
      <TagChips tags={r.tags} />
    </button>
  );
}

type SortKey = NonNullable<InventoryFilters['sort']>;

/** Column header that sorts the list (A to Z; the API sorts ascending). */
function SortHeader({ label, value, sort, onSort }: { label: string; value: SortKey; sort: SortKey; onSort: (v: SortKey) => void }) {
  const active = sort === value;
  return (
    <button
      type="button"
      onClick={() => onSort(value)}
      aria-pressed={active}
      aria-label={`Sort by ${label.toLowerCase()}`}
      className={cn('inline-flex items-center gap-1 text-left hover:text-text', active && 'text-text')}
    >
      {label}
      {active ? <ArrowDown className="size-3.5" aria-hidden /> : <ArrowUpDown className="size-3.5 opacity-60" aria-hidden />}
    </button>
  );
}

function ResourceTable({ filters, onSort }: { filters: InventoryFilters; onSort: (v: SortKey) => void }) {
  const sort: SortKey = filters.sort ?? 'name';
  const { data, isPending, fetchNextPage, hasNextPage, isFetchingNextPage } = useResources(filters);
  const [, openResource] = useResourceParam();
  const rows = React.useMemo(() => data?.pages.flatMap((p) => p.items) ?? [], [data]);
  const total = data?.pages[0]?.total ?? 0;
  const parentRef = React.useRef<HTMLDivElement>(null);
  // eslint-disable-next-line react-hooks/incompatible-library -- TanStack Virtual is not memoizable
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
    initialRect: { width: 1200, height: 640 },
  });
  const items = virtualizer.getVirtualItems();
  const lastIndex = items.length ? (items[items.length - 1]?.index ?? 0) : 0;
  React.useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && lastIndex >= rows.length - 30) {
      void fetchNextPage();
    }
  }, [lastIndex, rows.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (isPending) return <Skeleton className="h-[480px]" />;
  if (!rows.length)
    return <EmptyState icon={<Search />} title="No resources match these filters" />;
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <div className="min-w-[960px]">
          <div
            className={cn(
              GRID,
              'sticky top-0 z-10 h-9 items-center border-b border-border bg-surface px-4 text-xs font-medium text-muted',
            )}
          >
            <SortHeader label="Name" value="name" sort={sort} onSort={onSort} />
            <SortHeader label="Resource group" value="resource_group" sort={sort} onSort={onSort} />
            <SortHeader label="Subscription" value="subscription_id" sort={sort} onSort={onSort} />
            <SortHeader label="Location" value="location" sort={sort} onSort={onSort} />
            <span>SKU / size</span>
            <span>Tags</span>
          </div>
          <div
            ref={parentRef}
            className="h-[calc(100vh-22rem)] min-h-[360px] overflow-y-auto"
            role="region"
            tabIndex={0}
            aria-label={`Resources, ${total} results`}
          >
            <div style={{ height: virtualizer.getTotalSize() }} className="relative w-full">
              {items.map((item) => {
                const r = rows[item.index];
                if (!r) return null;
                return (
                  <div
                    key={r.id}
                    className="absolute left-0 top-0 w-full"
                    style={{ height: item.size, transform: `translateY(${item.start}px)` }}
                  >
                    <ResourceRow r={r} onOpen={openResource} />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-border px-4 py-2 text-xs text-muted">
        <span className="tabular">
          Showing {rows.length.toLocaleString()} of {total.toLocaleString()}
        </span>
        {isFetchingNextPage && <span>Loading more…</span>}
      </div>
    </Card>
  );
}

function Filters({
  filters,
  update,
}: {
  filters: InventoryFilters;
  update: (patch: Partial<InventoryFilters>) => void;
}) {
  const { data: facets } = useFacets();
  const [q, setQ] = React.useState(filters.q ?? '');
  const debounced = useDebounced(q);
  React.useEffect(() => {
    if ((filters.q ?? '') !== debounced) update({ q: debounced });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync only when the text settles
  }, [debounced]);
  const active = FILTER_KEYS.filter((k) => k !== 'sort').some(
    (k) => (filters as Record<string, string | undefined>)[k],
  );
  return (
    <div className="mb-4 flex flex-wrap gap-2 [&>*]:min-w-[11rem] [&>*]:flex-[1_1_11rem]">
      <div className="relative !flex-[2_1_18rem]">
        <Search
          className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle"
          aria-hidden
        />
        <Input
          className="pl-9"
          placeholder="Search name, type, group or ID"
          aria-label="Search resources"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <NativeSelect
        aria-label="Filter by type"
        value={filters.type ?? ''}
        onChange={(e) => update({ type: e.target.value })}
      >
        <option value="">All types</option>
        {facets?.types.map((f) => (
          <option key={f.value} value={f.value}>
            {typeInfo(f.value).label} ({f.count})
          </option>
        ))}
      </NativeSelect>
      <NativeSelect
        aria-label="Filter by subscription"
        value={filters.subscription_id ?? ''}
        onChange={(e) => update({ subscription_id: e.target.value })}
      >
        <option value="">All subscriptions</option>
        {facets?.subscriptions.map((f) => (
          <option key={f.value} value={f.value}>
            {f.label} ({f.count})
          </option>
        ))}
      </NativeSelect>
      <NativeSelect
        aria-label="Filter by resource group"
        value={filters.resource_group ?? ''}
        onChange={(e) => update({ resource_group: e.target.value })}
      >
        <option value="">All resource groups</option>
        {facets?.resource_groups.map((f) => (
          <option key={f.value} value={f.value}>
            {f.label} ({f.count})
          </option>
        ))}
      </NativeSelect>
      <NativeSelect
        aria-label="Filter by location"
        value={filters.location ?? ''}
        onChange={(e) => update({ location: e.target.value })}
      >
        <option value="">All locations</option>
        {facets?.locations.map((f) => (
          <option key={f.value} value={f.value}>
            {locationLabel(f.value)} ({f.count})
          </option>
        ))}
      </NativeSelect>
      <div className="flex gap-2">
        <Input
          list="tag-keys"
          placeholder="Tag (key=value)"
          aria-label="Filter by tag"
          defaultValue={filters.tag ?? ''}
          onKeyDown={(e) => {
            if (e.key === 'Enter') update({ tag: e.currentTarget.value.trim() });
          }}
          onBlur={(e) => {
            if (e.currentTarget.value.trim() !== (filters.tag ?? ''))
              update({ tag: e.currentTarget.value.trim() });
          }}
        />
        <datalist id="tag-keys">
          {facets?.tag_keys.map((f) => (
            <option key={f.value} value={f.value} />
          ))}
        </datalist>
        {active && (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Clear filters"
            onClick={() => {
              setQ('');
              update({
                q: '',
                type: '',
                resource_group: '',
                subscription_id: '',
                location: '',
                tag: '',
              });
            }}
          >
            <X />
          </Button>
        )}
      </div>
    </div>
  );
}

function OrphansPanel() {
  const { data, isPending } = useOrphans();
  const [category, setCategory] = React.useState<string>('');
  const [, openResource] = useResourceParam();
  if (isPending) return <Skeleton className="h-64" />;
  if (!data?.items.length)
    return (
      <EmptyState
        icon={<PackageX />}
        title="No orphaned resources"
        description="Nothing looks unused in this scan."
      />
    );
  const labels = new Map(data.items.map((o) => [o.category, o.category_label]));
  const items = category ? data.items.filter((o) => o.category === category) : data.items;
  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter by category">
        <Button
          size="sm"
          variant={category === '' ? 'subtle' : 'ghost'}
          aria-pressed={category === ''}
          onClick={() => setCategory('')}
        >
          All <span className="tabular text-muted">{data.items.length}</span>
        </Button>
        {Object.entries(data.by_category).map(([cat, n]) => (
          <Button
            key={cat}
            size="sm"
            variant={category === cat ? 'subtle' : 'ghost'}
            aria-pressed={category === cat}
            onClick={() => setCategory(cat)}
          >
            {labels.get(cat)} <span className="tabular text-muted">{n}</span>
          </Button>
        ))}
      </div>
      <Card className="overflow-hidden">
        <Table>
          <THead>
            <TR className="hover:bg-transparent">
              <TH>Resource</TH>
              <TH>Why it looks unused</TH>
              <TH>Resource group</TH>
              <TH>Subscription</TH>
            </TR>
          </THead>
          <TBody>
            {items.map((o) => {
              const info = typeInfo(o.type);
              const Icon = info.icon;
              const isGroup = o.category === 'empty_resource_group';
              return (
                <TR key={o.arm_id}>
                  <TD>
                    <div className="flex items-center gap-2.5">
                      <Icon className="size-4 shrink-0 text-muted" aria-hidden />
                      <div className="min-w-0">
                        {isGroup ? (
                          <span className="font-medium">{o.name}</span>
                        ) : (
                          <button
                            type="button"
                            className="font-medium text-brand-strong hover:underline"
                            onClick={() => openResource(o.arm_id)}
                          >
                            {o.name}
                          </button>
                        )}
                        <div className="text-xs text-muted">{info.label}</div>
                      </div>
                    </div>
                  </TD>
                  <TD className="text-sm">{o.reason}</TD>
                  <TD className="text-sm text-muted">{o.resource_group ?? '—'}</TD>
                  <TD className="text-sm text-muted">
                    {o.subscription_name ?? o.subscription_id ?? '—'}
                  </TD>
                </TR>
              );
            })}
          </TBody>
        </Table>
      </Card>
      <p className="mt-3 text-xs text-muted">
        Estimated savings for unused resources arrive with Cost &amp; FinOps.
      </p>
    </>
  );
}

export function InventoryPage() {
  const [filters, update] = useFilters();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'orphans' ? 'orphans' : 'resources';
  const { data: facets, isPending } = useFacets();
  const { data: orphans } = useOrphans();
  const scanId = useAsOf();
  const [exporting, setExporting] = React.useState(false);

  const exportAs = (format: 'csv' | 'xlsx') => {
    setExporting(true);
    downloadInventory(format, filters, scanId)
      .then(() => toast.success('Export ready'))
      .catch((e: unknown) => toast.error(errorMessage(e)))
      .finally(() => setExporting(false));
  };

  if (!isPending && facets && facets.scan_ids.length === 0) {
    return (
      <>
        <PageHeader title="Inventory" />
        <EmptyState
          icon={<Server />}
          title="No inventory yet"
          description="Connect Azure and run the first scan. Every resource appears here with its relationships and history."
          action={
            <Button asChild>
              <Link to="/app/settings/connections">Connect Azure</Link>
            </Button>
          }
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Inventory"
        description={
          facets
            ? `${facets.total.toLocaleString()} resources across ${facets.subscriptions.length} subscription(s) and ${facets.locations.length} location(s).`
            : 'All resources from your latest scans.'
        }
        actions={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" loading={exporting}>
                <Download /> Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => exportAs('csv')}>CSV (filtered)</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => exportAs('xlsx')}>
                Excel (filtered)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />
      <Tabs
        value={tab}
        onValueChange={(v) =>
          setParams(
            (prev) => {
              const next = new URLSearchParams(prev);
              if (v === 'orphans') next.set('tab', 'orphans');
              else next.delete('tab');
              return next;
            },
            { replace: true },
          )
        }
      >
        <TabsList>
          <TabsTrigger value="resources">All resources</TabsTrigger>
          <TabsTrigger value="orphans">
            Orphaned & unused
            {orphans ? <Badge tone="warning">{orphans.items.length}</Badge> : null}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="resources">
          <Filters filters={filters} update={update} />
          <ResourceTable filters={filters} onSort={(v) => update({ sort: v === 'name' ? undefined : v })} />
        </TabsContent>
        <TabsContent value="orphans">
          <OrphansPanel />
        </TabsContent>
      </Tabs>
      <ResourceDrawer />
    </>
  );
}
