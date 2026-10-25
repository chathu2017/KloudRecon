import { Globe2, Radar } from 'lucide-react';
import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NativeSelect } from '@/components/ui/input';
import { EmptyState, PageHeader, Skeleton } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { ResourceDrawer } from '@/features/inventory/ResourceDrawer';
import { useResourceParam } from '@/features/inventory/useResourceParam';
import { typeInfo } from '@/features/inventory/types';
import { cn } from '@/lib/utils';
import { useExposure } from './api';
import { SeverityBadge } from './severity';

const KIND_LABEL: Record<string, string> = {
  vm: 'Virtual machine',
  nic: 'Network interface',
  lb: 'Load balancer',
  gateway: 'Application Gateway',
  firewall: 'Firewall (DNAT)',
  app: 'Web / function app',
  'container-app': 'Container app',
  'aks-api': 'Kubernetes API',
  'paas-data': 'Data service',
  paas: 'Platform service',
};
const RISKY_PORTS = new Set([22, 23, 3389, 5985, 5986, 1433, 3306, 5432, 6379, 27017, 445]);

interface Port {
  port: number | string;
  service?: string;
  protocol?: string;
  rule?: string | null;
  sources?: string;
}

export function ExposurePage() {
  const { data, isPending } = useExposure();
  const [, open] = useResourceParam();
  const [kind, setKind] = React.useState('');
  const items = (data?.items ?? []).filter((i) => !kind || i.kind === kind);
  return (
    <>
      <PageHeader
        title="Internet exposure"
        description="What is reachable from the internet right now, following public IPs, NSG rules in priority order, load balancers, gateways and PaaS network settings."
      />
      {isPending ? (
        <Skeleton className="h-96" />
      ) : !data?.items.length ? (
        <EmptyState icon={<Radar />} title="Nothing reachable from the internet" description="No public IP, listener or public endpoint accepts traffic from the internet." />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle>By resource kind</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setKind('')} className={cn('rounded-md border px-3 py-2 text-left text-sm', !kind ? 'border-brand bg-brand-soft' : 'border-border hover:bg-surface-2')}>
                  <div className="font-mono text-xl font-medium tabular">{data.items.length}</div>
                  <div className="text-xs text-muted">All exposed</div>
                </button>
                {Object.entries(data.by_kind).map(([k, n]) => (
                  <button key={k} type="button" onClick={() => setKind(k === kind ? '' : k)} className={cn('rounded-md border px-3 py-2 text-left text-sm', kind === k ? 'border-brand bg-brand-soft' : 'border-border hover:bg-surface-2')}>
                    <div className="font-mono text-xl font-medium tabular">{n}</div>
                    <div className="text-xs text-muted">{KIND_LABEL[k] ?? k}</div>
                  </button>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle>Open ports</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-1.5">
                {data.by_port.slice(0, 16).map((p) => (
                  <Badge key={String(p.port)} tone={RISKY_PORTS.has(Number(p.port)) || p.port === '*' ? 'danger' : 'neutral'} className="font-mono">
                    {String(p.port) === '*' ? 'all ports' : String(p.port)} · {String(p.count)}
                  </Badge>
                ))}
              </CardContent>
            </Card>
          </div>
          <Card>
            <div className="flex items-center justify-between px-5 py-3">
              <span className="text-sm text-muted">{items.length} exposed resource(s)</span>
              <NativeSelect className="w-52" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Kind">
                <option value="">All kinds</option>
                {Object.keys(data.by_kind).map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABEL[k] ?? k}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <Table>
              <THead>
                <TR>
                  <TH>Severity</TH>
                  <TH>Resource</TH>
                  <TH>Public address</TH>
                  <TH>Open to the internet</TH>
                  <TH>Allowed by</TH>
                </TR>
              </THead>
              <TBody>
                {items.map((e) => {
                  const Icon = typeInfo(e.resource_type ?? '').icon;
                  const ports = e.ports as Port[];
                  return (
                    <TR key={e.id} className="cursor-pointer align-top" onClick={() => open(e.arm_id)}>
                      <TD>
                        <SeverityBadge severity={e.severity} />
                      </TD>
                      <TD className="max-w-64">
                        <span className="flex items-center gap-2">
                          <Icon className="size-4 shrink-0 text-muted" aria-hidden />
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{e.resource_name}</span>
                            <span className="block truncate text-xs text-muted">{KIND_LABEL[e.kind] ?? e.kind} · {e.resource_group}</span>
                          </span>
                        </span>
                      </TD>
                      <TD className="max-w-56 font-mono text-xs">
                        {e.public_ip ?? <span className="break-all">{e.endpoint ?? '—'}</span>}
                      </TD>
                      <TD>
                        <div className="flex flex-wrap gap-1">
                          {ports.map((p) => (
                            <Badge key={`${String(p.port)}-${p.protocol ?? ''}`} tone={RISKY_PORTS.has(Number(p.port)) || p.port === '*' ? 'danger' : 'neutral'} title={p.sources ? `from ${p.sources}` : undefined}>
                              <Globe2 aria-hidden />
                              {p.port === '*' ? 'all ports' : `${p.service ?? p.port}`}
                            </Badge>
                          ))}
                        </div>
                      </TD>
                      <TD className="max-w-72 text-xs text-muted">
                        {[...new Set(ports.map((p) => p.rule).filter(Boolean))].slice(0, 2).join('; ') || 'public endpoint'}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </Card>
        </div>
      )}
      <ResourceDrawer />
    </>
  );
}
