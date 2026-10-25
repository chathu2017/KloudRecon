import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ArrowDownLeft, ArrowUpRight, ExternalLink, Info, X } from 'lucide-react';
import * as React from 'react';
import { CopyButton } from '@/components/CopyButton';
import { JsonViewer } from '@/components/JsonViewer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState, Skeleton } from '@/components/ui/misc';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChangeRow } from '@/features/changes/ChangeRow';
import { ResourceSecurity } from '@/features/security/ResourceSecurity';
import { formatDateTime } from '@/lib/format';
import { useResourceDetail } from './api';
import { useResourceParam } from './useResourceParam';
import { EDGE_LABELS, locationLabel, typeInfo } from './types';

const ResourceCostPanel = React.lazy(() => import('@/features/cost/ResourceCostPanel'));

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-3 py-1.5 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-words">{children ?? '—'}</dd>
    </div>
  );
}

export function ResourceDrawer() {
  const [armId, setArmId] = useResourceParam();
  const { data, isPending, isError } = useResourceDetail(armId);
  const info = typeInfo(data?.type);
  const Icon = info.icon;
  const tags = Object.entries(data?.tags ?? {});

  return (
    <DialogPrimitive.Root open={!!armId} onOpenChange={(v) => !v && setArmId(null)}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-overlay" />
        <DialogPrimitive.Content className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col border-l border-border bg-surface shadow-lg focus:outline-none data-[state=open]:animate-[kr-slide-in-right_250ms_var(--ease-out)]">
          <div className="flex items-start gap-3 border-b border-border px-5 py-4">
            <span className="flex shrink-0 items-center text-muted [&_svg]:size-5 [&_svg]:stroke-[1.5]">
              <Icon className="size-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <DialogPrimitive.Title className="truncate font-display text-lg font-semibold">
                {data?.name ?? 'Resource'}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="text-sm text-muted">
                {data ? `${info.label} · ${data.resource_group ?? ''}` : 'Loading…'}
              </DialogPrimitive.Description>
            </div>
            {data && (
              <Button asChild variant="secondary" size="sm">
                <a href={data.portal_url} target="_blank" rel="noreferrer">
                  Azure portal <ExternalLink />
                </a>
              </Button>
            )}
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Close">
                <X />
              </Button>
            </DialogPrimitive.Close>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {isPending ? (
              <Skeleton className="h-96" />
            ) : isError ? (
              <EmptyState
                title="Resource not in this scan"
                description="It may have been deleted, or you are viewing an older scan."
              />
            ) : (
              <Tabs defaultValue="overview">
                <TabsList>
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="security">Security</TabsTrigger>
                  <TabsTrigger value="cost">Cost</TabsTrigger>
                  <TabsTrigger value="properties">Properties</TabsTrigger>
                  <TabsTrigger value="related">Related ({data.related.length})</TabsTrigger>
                  <TabsTrigger value="changes">Changes ({data.changes.length})</TabsTrigger>
                </TabsList>
                <TabsContent value="overview" className="space-y-5">
                  {data.orphan_reason && (
                    <div className="flex items-start gap-2 rounded-md border border-medium/30 bg-medium-soft p-3 text-sm">
                      <Info className="mt-0.5 size-4 shrink-0 text-medium-strong" aria-hidden />
                      <span>
                        <strong className="font-medium">Possibly unused.</strong>{' '}
                        {data.orphan_reason}
                      </span>
                    </div>
                  )}
                  <dl className="divide-y divide-border">
                    <Fact label="Type">
                      <span className="font-mono text-xs">{data.type}</span>
                    </Fact>
                    <Fact label="Subscription">
                      {data.subscription_name ?? data.subscription_id}
                    </Fact>
                    <Fact label="Resource group">{data.resource_group}</Fact>
                    <Fact label="Location">{locationLabel(data.location)}</Fact>
                    <Fact label="SKU / size">{data.sku}</Fact>
                    {data.kind && <Fact label="Kind">{data.kind}</Fact>}
                    {data.zones?.length ? <Fact label="Zones">{data.zones.join(', ')}</Fact> : null}
                    {data.identity && (
                      <Fact label="Identity">
                        {typeof data.identity.type === 'string' ? data.identity.type : 'Yes'}
                      </Fact>
                    )}
                    <Fact label="Resource ID">
                      <span className="flex items-start gap-1">
                        <span className="break-all font-mono text-xs">{data.arm_id}</span>
                        <CopyButton value={data.arm_id} label="Copy" />
                      </span>
                    </Fact>
                    <Fact label="As of scan">{formatDateTime(data.scan_started_at)}</Fact>
                  </dl>
                  <div>
                    <h3 className="mb-2 text-sm font-semibold">Tags</h3>
                    {tags.length ? (
                      <div className="flex flex-wrap gap-1.5">
                        {tags.map(([k, v]) => (
                          <Badge key={k} tone="neutral" className="font-normal">
                            <span className="text-muted">{k}:</span> {String(v)}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted">No tags.</p>
                    )}
                  </div>
                </TabsContent>
                <TabsContent value="security">
                  <ResourceSecurity armId={data.arm_id} onOpen={setArmId} />
                </TabsContent>
                <TabsContent value="cost">
                  <React.Suspense fallback={<Skeleton className="h-64" />}>
                    <ResourceCostPanel armId={data.arm_id} />
                  </React.Suspense>
                </TabsContent>
                <TabsContent value="properties">
                  <JsonViewer
                    value={{
                      sku: data.raw_sku,
                      identity: data.identity,
                      managedBy: data.managed_by,
                      properties: data.properties,
                    }}
                  />
                </TabsContent>
                <TabsContent value="related">
                  {data.related.length === 0 ? (
                    <p className="text-sm text-muted">No relationships found.</p>
                  ) : (
                    <ul className="divide-y divide-border rounded-lg border border-border">
                      {data.related.map((r) => {
                        const RIcon = typeInfo(r.type).icon;
                        const subnet = typeof r.attrs.subnet === 'string' ? r.attrs.subnet : null;
                        return (
                          <li
                            key={`${r.edge_type}-${r.direction}-${r.arm_id}-${subnet ?? ''}`}
                            className="flex items-center gap-3 px-3 py-2"
                          >
                            {r.direction === 'out' ? (
                              <ArrowUpRight className="size-3.5 text-subtle" aria-label="to" />
                            ) : (
                              <ArrowDownLeft className="size-3.5 text-subtle" aria-label="from" />
                            )}
                            <RIcon className="size-4 text-muted" aria-hidden />
                            <div className="min-w-0 flex-1">
                              {r.in_inventory ? (
                                <button
                                  type="button"
                                  className="truncate text-sm font-medium text-brand-strong hover:underline"
                                  onClick={() => setArmId(r.arm_id)}
                                >
                                  {r.name}
                                </button>
                              ) : (
                                <span className="truncate text-sm">{r.name}</span>
                              )}
                              <div className="text-xs text-muted">
                                {EDGE_LABELS[r.edge_type] ?? r.edge_type}
                                {subnet ? ` · subnet ${subnet}` : ''}
                                {!r.in_inventory ? ' · outside this scan' : ''}
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </TabsContent>
                <TabsContent value="changes">
                  {data.changes.length === 0 ? (
                    <p className="text-sm text-muted">No changes recorded for this resource.</p>
                  ) : (
                    <ol className="divide-y divide-border rounded-lg border border-border">
                      {data.changes.map((c) => (
                        <ChangeRow key={c.id} change={c} showResource={false} showDate />
                      ))}
                    </ol>
                  )}
                </TabsContent>
              </Tabs>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
