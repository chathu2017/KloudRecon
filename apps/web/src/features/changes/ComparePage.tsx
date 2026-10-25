import { ArrowLeft, ArrowRight, GitCompareArrows, Minus, Pencil, Plus } from 'lucide-react';
import * as React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NativeSelect } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { EmptyState, PageHeader, Skeleton } from '@/components/ui/misc';
import { ResourceDrawer } from '@/features/inventory/ResourceDrawer';
import { useResourceParam } from '@/features/inventory/useResourceParam';
import { typeInfo } from '@/features/inventory/types';
import { completedScans, useScans, type Scan } from '@/features/scans/api';
import { errorMessage } from '@/lib/api/client';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { FieldDiff } from './FieldDiff';
import { useCompare, type CompareResult } from './api';

type Item = CompareResult['added'][number];

function Section({
  title,
  icon: Icon,
  tone,
  items,
  total,
  onOpen,
  openable,
}: {
  title: string;
  icon: typeof Plus;
  tone: string;
  items: Item[];
  total: number;
  onOpen: (armId: string) => void;
  openable: boolean;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const shown = expanded ? items : items.slice(0, 25);
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-center gap-2 pb-3">
        <span className={cn('flex size-6 items-center justify-center rounded-full', tone)}>
          <Icon className="size-3.5" aria-hidden />
        </span>
        <CardTitle>
          {title} <span className="tabular text-muted">{total}</span>
        </CardTitle>
      </CardHeader>
      {items.length === 0 ? (
        <CardContent>
          <p className="text-sm text-muted">None.</p>
        </CardContent>
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {shown.map((item) => {
            const info = typeInfo(item.type);
            const TIcon = info.icon;
            const fields = item.fields ?? [];
            return (
              <li key={item.arm_id} className="px-4 py-2.5">
                <div className="flex items-center gap-2.5">
                  <TIcon className="size-4 shrink-0 text-muted" aria-hidden />
                  {openable ? (
                    <button
                      type="button"
                      className="truncate text-sm font-medium text-brand-strong hover:underline"
                      onClick={() => onOpen(item.arm_id)}
                    >
                      {item.name}
                    </button>
                  ) : (
                    <span className="truncate text-sm font-medium">{item.name}</span>
                  )}
                  <span className="truncate text-xs text-muted">
                    {info.label} · {item.resource_group}
                  </span>
                </div>
                {fields.length > 0 && (
                  <ul className="mt-1 space-y-0.5 pl-6 font-mono text-xs text-muted">
                    {fields.slice(0, 5).map((f) => (
                      <FieldDiff
                        key={String(f.path)}
                        path={String(f.path)}
                        before={f.before}
                        after={f.after}
                      />
                    ))}
                    {fields.length > 5 && <li>+{fields.length - 5} more</li>}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {items.length > 25 && (
        <div className="border-t border-border px-4 py-2">
          <Button variant="link" size="sm" onClick={() => setExpanded(!expanded)}>
            {expanded ? 'Show less' : `Show all ${items.length}`}
          </Button>
        </div>
      )}
    </Card>
  );
}

function scanLabel(s: Scan): string {
  return `#${s.sequence} · ${formatDateTime(s.started_at)}${s.connection_name ? ` · ${s.connection_name}` : ''}`;
}

export function ComparePage() {
  const { data: scans, isPending } = useScans(undefined, 60);
  const done = completedScans(scans);
  const [params, setParams] = useSearchParams();
  const [, openResource] = useResourceParam();
  const to = params.get('to') ?? done[0]?.id;
  const toScan = done.find((s) => s.id === to);
  const sameConn = done.filter((s) => s.connection_id === toScan?.connection_id);
  const from = params.get('from') ?? sameConn.find((s) => s.id !== to)?.id;
  const { data, isFetching, error } = useCompare(from, to);
  const set = (key: 'from' | 'to', value: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set(key, value);
        return next;
      },
      { replace: true },
    );

  if (isPending) return <Skeleton className="h-96" />;
  if (done.length < 2)
    return (
      <>
        <PageHeader title="Compare scans" />
        <EmptyState
          icon={<GitCompareArrows />}
          title="Two scans are needed"
          description="Compare becomes available after the second scan of a connection."
        />
      </>
    );

  return (
    <>
      <PageHeader
        title="Compare scans"
        description="What was added, removed or changed between two scans of the same connection."
        actions={
          <Button asChild variant="ghost">
            <Link to="/app/changes">
              <ArrowLeft /> Changes
            </Link>
          </Button>
        }
      />
      <Card className="mb-4">
        <CardContent className="grid items-end gap-4 pt-5 md:grid-cols-[1fr_auto_1fr]">
          <Field label="From (older)" htmlFor="compare-from">
            <NativeSelect
              id="compare-from"
              value={from ?? ''}
              onChange={(e) => set('from', e.target.value)}
            >
              {sameConn.map((s) => (
                <option key={s.id} value={s.id}>
                  {scanLabel(s)}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <ArrowRight className="mb-2.5 hidden size-4 text-subtle md:block" aria-hidden />
          <Field label="To (newer)" htmlFor="compare-to">
            <NativeSelect
              id="compare-to"
              value={to ?? ''}
              onChange={(e) => set('to', e.target.value)}
            >
              {done.map((s) => (
                <option key={s.id} value={s.id}>
                  {scanLabel(s)}
                </option>
              ))}
            </NativeSelect>
          </Field>
        </CardContent>
      </Card>
      {error ? (
        <EmptyState title="Cannot compare these scans" description={errorMessage(error)} />
      ) : !data || isFetching ? (
        <Skeleton className="h-96" />
      ) : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-4">
            {(
              [
                ['Resources', `${data.counts.from_total ?? 0} → ${data.counts.to_total ?? 0}`],
                ['Added', String(data.counts.added ?? 0)],
                ['Removed', String(data.counts.removed ?? 0)],
                ['Changed', String(data.counts.changed ?? 0)],
              ] as const
            ).map(([label, value]) => (
              <Card key={label}>
                <CardContent className="pt-4">
                  <div className="text-xs text-muted">{label}</div>
                  <div className="text-2xl font-semibold tabular">{value}</div>
                </CardContent>
              </Card>
            ))}
          </div>
          {data.by_type.length > 0 && (
            <p className="mb-4 text-sm text-muted">
              By type:{' '}
              {data.by_type
                .slice(0, 8)
                .map((t) => `${typeInfo(String(t.type)).label} ${String(t.from)} → ${String(t.to)}`)
                .join(' · ')}
            </p>
          )}
          {data.truncated && (
            <p className="mb-4 text-sm text-medium-strong">
              Large difference: lists are limited to the first 500 items.
            </p>
          )}
          <div className="grid gap-4 xl:grid-cols-3">
            <Section
              title="Added"
              icon={Plus}
              tone="bg-success-soft text-success-strong"
              items={data.added}
              total={data.counts.added ?? 0}
              onOpen={openResource}
              openable
            />
            <Section
              title="Removed"
              icon={Minus}
              tone="bg-critical-soft text-critical-strong"
              items={data.removed}
              total={data.counts.removed ?? 0}
              onOpen={openResource}
              openable={false}
            />
            <Section
              title="Changed"
              icon={Pencil}
              tone="bg-brand-soft text-brand-strong"
              items={data.changed}
              total={data.counts.changed ?? 0}
              onOpen={openResource}
              openable
            />
          </div>
        </>
      )}
      <ResourceDrawer />
    </>
  );
}
