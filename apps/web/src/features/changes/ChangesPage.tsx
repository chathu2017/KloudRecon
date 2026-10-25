import { AlertTriangle, GitCompareArrows, History, Search } from 'lucide-react';
import * as React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, NativeSelect } from '@/components/ui/input';
import { EmptyState, PageHeader, Skeleton, Tooltip } from '@/components/ui/misc';
import { ResourceDrawer } from '@/features/inventory/ResourceDrawer';
import { useResourceParam } from '@/features/inventory/useResourceParam';
import type { Change } from '@/features/inventory/api';
import { formatDate } from '@/lib/format';
import { useDebounced } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { useChanges, useChangeSummary, type ChangeSummary, type ChangeType } from './api';
import { ChangeRow } from './ChangeRow';

const TYPES: { value: ChangeType | ''; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'created', label: 'Created' },
  { value: 'modified', label: 'Modified' },
  { value: 'deleted', label: 'Deleted' },
  { value: 'activity', label: 'Activity Log' },
];

/** Daily bars: created / modified / deleted / other activity, risky marked below. */
export function ChangeChart({ summary }: { summary: ChangeSummary }) {
  const max = Math.max(
    1,
    ...summary.days.map((d) => d.created + d.modified + d.deleted + d.activity),
  );
  return (
    <div>
      <div className="flex h-28 items-end gap-[3px]" role="img" aria-label="Changes per day">
        {summary.days.map((d) => {
          const total = d.created + d.modified + d.deleted + d.activity;
          const pct = (n: number) => `${(n / max) * 100}%`;
          return (
            <Tooltip
              key={d.day}
              content={`${formatDate(d.day)}: ${d.created} created, ${d.modified} modified, ${d.deleted} deleted, ${d.activity} other · ${d.risky} risky`}
            >
              <div className="flex h-full min-w-0 flex-1 flex-col justify-end">
                <div
                  className="flex flex-col-reverse overflow-hidden rounded-sm"
                  style={{ height: pct(total) }}
                >
                  <div className="bg-success" style={{ flexGrow: d.created }} />
                  <div className="bg-brand" style={{ flexGrow: d.modified }} />
                  <div className="bg-critical" style={{ flexGrow: d.deleted }} />
                  <div className="bg-border-strong" style={{ flexGrow: d.activity }} />
                </div>
                {total === 0 && <div className="h-px bg-border" />}
                <div
                  className={cn('mt-1 h-1 rounded-full', d.risky ? 'bg-high' : 'bg-transparent')}
                />
              </div>
            </Tooltip>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted">
        {(
          [
            ['bg-success', 'Created', summary.totals.created],
            ['bg-brand', 'Modified', summary.totals.modified],
            ['bg-critical', 'Deleted', summary.totals.deleted],
            ['bg-border-strong', 'Other Activity Log events', summary.totals.activity],
            ['bg-high', 'Risky', summary.totals.risky],
          ] as const
        ).map(([color, label, n]) => (
          <span key={label} className="flex items-center gap-1.5">
            <span className={cn('size-2.5 rounded-sm', color)} aria-hidden />
            {label} <span className="tabular text-text">{n ?? 0}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function groupByDay(items: Change[]): [string, Change[]][] {
  const groups = new Map<string, Change[]>();
  for (const c of items) {
    const day = new Date(c.occurred_at).toDateString();
    const list = groups.get(day) ?? [];
    list.push(c);
    groups.set(day, list);
  }
  return [...groups.entries()];
}

export function ChangesPage() {
  const [params, setParams] = useSearchParams();
  const changeType = (params.get('type') ?? '') as ChangeType | '';
  const risky = params.get('risky') === '1';
  const days = Number(params.get('days') ?? '30') || 30;
  const [q, setQ] = React.useState(params.get('q') ?? '');
  const query = useDebounced(q);
  const set = (key: string, value: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  const { data, isPending, fetchNextPage, hasNextPage, isFetchingNextPage } = useChanges({
    change_type: changeType || undefined,
    risky: risky || undefined,
    q: query || undefined,
    days,
  });
  const { data: summary } = useChangeSummary(days);
  const [, openResource] = useResourceParam();
  const items = data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <>
      <PageHeader
        title="Changes"
        description="Added, deleted and modified resources, and who did it (from the Activity Log)."
        actions={
          <Button asChild variant="secondary">
            <Link to="/app/changes/compare">
              <GitCompareArrows /> Compare scans
            </Link>
          </Button>
        }
      />
      {summary && (
        <Card className="mb-4">
          <CardHeader className="pb-2">
            <CardTitle>Last {days} days</CardTitle>
          </CardHeader>
          <CardContent>
            <ChangeChart summary={summary} />
          </CardContent>
        </Card>
      )}
      <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Change type">
          {TYPES.map((t) => (
            <Button
              key={t.value}
              size="sm"
              variant={changeType === t.value ? 'subtle' : 'ghost'}
              aria-pressed={changeType === t.value}
              onClick={() => set('type', t.value)}
            >
              {t.label}
            </Button>
          ))}
          <Button
            size="sm"
            variant={risky ? 'danger' : 'ghost'}
            aria-pressed={risky}
            onClick={() => set('risky', risky ? '' : '1')}
          >
            <AlertTriangle /> Risky only
          </Button>
        </div>
        <div className="flex flex-1 gap-2 lg:justify-end">
          <div className="relative flex-1 lg:max-w-xs">
            <Search
              className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle"
              aria-hidden
            />
            <Input
              className="pl-9"
              placeholder="Resource, caller or operation"
              aria-label="Search changes"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <NativeSelect
            className="w-36"
            aria-label="Time range"
            value={String(days)}
            onChange={(e) => set('days', e.target.value === '30' ? '' : e.target.value)}
          >
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
          </NativeSelect>
        </div>
      </div>
      {isPending ? (
        <Skeleton className="h-96" />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<History />}
          title="No changes in this period"
          description="Changes appear after the second scan, and the Activity Log shows who changed what."
        />
      ) : (
        <div className="space-y-4">
          {groupByDay(items).map(([day, list]) => (
            <Card key={day} className="overflow-hidden">
              <div className="border-b border-border bg-surface-2 px-4 py-2 text-xs font-medium text-muted">
                {formatDate(list[0]?.occurred_at)} · {list.length} change
                {list.length === 1 ? '' : 's'}
              </div>
              <ol className="divide-y divide-border">
                {list.map((c) => (
                  <ChangeRow key={c.id} change={c} onOpenResource={openResource} />
                ))}
              </ol>
            </Card>
          ))}
          {hasNextPage && (
            <div className="flex justify-center">
              <Button
                variant="secondary"
                loading={isFetchingNextPage}
                onClick={() => void fetchNextPage()}
              >
                Load older changes
              </Button>
            </div>
          )}
        </div>
      )}
      <ResourceDrawer />
    </>
  );
}
