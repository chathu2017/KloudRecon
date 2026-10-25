import { Radar, Route, ShieldCheck } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { ScoreRing } from '@/components/charts/charts';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, PageHeader, Skeleton } from '@/components/ui/misc';
import { SecurityAnalystPanel } from '@/features/ai/panels';
import { ResourceDrawer } from '@/features/inventory/ResourceDrawer';
import { useResourceParam } from '@/features/inventory/useResourceParam';
import { typeInfo } from '@/features/inventory/types';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useAttackPaths, useExposure, type AttackPath } from './api';
import { PathChain } from './PathChain';
import { SeverityBadge } from './severity';

const FACTORS: { key: string; label: string; help: string }[] = [
  { key: 'exposure', label: 'Exposure', help: 'How reachable the entry point is from the internet' },
  { key: 'exploitability', label: 'Exploitability', help: 'CVEs, weak configuration, missing Defender' },
  { key: 'privilege', label: 'Privilege', help: 'Power of the role the identity holds' },
  { key: 'sensitivity', label: 'Sensitivity', help: 'Value of the data or control at the end' },
];

type PathNodes = Parameters<typeof PathChain>[0]['nodes'];
type PathKind = 'identity' | 'remote' | 'data';

const KIND_LABEL: Record<PathKind, string> = {
  identity: 'Identity route',
  remote: 'Remote access',
  data: 'Exposed data',
};
// what to do about each kind of path, most effective step first
const BREAK_IT: Record<PathKind, string[]> = {
  identity: [
    'Remove or restrict the internet exposure of the entry point (close the port, private endpoint, authorized IP ranges or a WAF).',
    "Reduce the identity's role to the smallest scope and a data-plane role that fits the job.",
    'Patch exploitable vulnerabilities and turn on the missing Defender plan.',
  ],
  remote: [
    'Close SSH, RDP and WinRM to the internet: use Azure Bastion or just-in-time access, or allow only your own IP addresses.',
    'Turn off password sign-in (SSH keys or Entra ID sign-in) and patch the machine.',
    'Limit what the machine can reach on the private network with NSG rules, and turn on Defender for Servers.',
  ],
  data: [
    'Turn off public network access and use a private endpoint, or allow only the IP addresses that need it.',
    'Turn off anonymous access and "allow Azure services" firewall rules.',
    'Require Microsoft Entra sign-in instead of passwords or account keys, and turn on auditing.',
  ],
};

function kindOf(p: AttackPath): PathKind {
  const k = (p.factors as Record<string, unknown>).kind;
  return k === 'remote' || k === 'data' ? k : 'identity';
}

function PathCard({ p, active, onSelect }: { p: AttackPath; active: boolean; onSelect: () => void }) {
  const nodes = (p.path.nodes ?? []) as PathNodes;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'w-full rounded-lg border bg-surface p-4 text-left shadow-sm transition-colors',
        active ? 'border-critical ring-1 ring-critical/40' : 'border-border hover:border-border-strong',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <SeverityBadge severity={p.severity} />
            <Badge tone="neutral">{KIND_LABEL[kindOf(p)]}</Badge>
            <span className="text-xs text-muted">score {p.score}</span>
          </div>
          <div className="mt-1.5 truncate font-medium">{p.title}</div>
        </div>
      </div>
      <div className="mt-3">
        <PathChain nodes={nodes} compact />
      </div>
    </button>
  );
}

function PathDetail({ p }: { p: AttackPath }) {
  const [, open] = useResourceParam();
  const nodes = (p.path.nodes ?? []) as PathNodes;
  const f = p.factors as Record<string, unknown>;
  const reasons = (f.exploitability_reasons as string[] | undefined) ?? [];
  const kind = kindOf(p);
  const privilegeDetail = typeof f.privilege_detail === 'string' ? f.privilege_detail : '';
  const reachable = p.reachable as { id: string; name: string; type: string; sensitivity: number }[];
  return (
    <Card className="border-critical/30">
      <CardHeader>
        <div className="flex items-start gap-4">
          <ScoreRing score={p.score} label="path score" size={96} stroke={8} />
          <div className="min-w-0">
            <CardTitle className="text-xl">{p.title}</CardTitle>
            <p className="mt-1 text-sm text-muted">{p.summary}</p>
            {p.first_seen && <p className="mt-1 text-xs text-subtle">First seen {formatDate(p.first_seen)}</p>}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <h3 className="mb-2 text-sm font-semibold">The path</h3>
          <div className="rounded-lg border border-dashed border-critical/40 bg-critical-soft/30 p-3">
            <PathChain nodes={nodes} onOpen={open} />
          </div>
          <p className="mt-2 text-xs text-muted">Select a resource to open it. The architecture diagram highlight follows in the Diagrams module.</p>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold">Why it scores {p.score}</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            {FACTORS.map((x) => {
              const v = Number(f[x.key] ?? 0);
              return (
                <div key={x.key} className="rounded-md border border-border p-3" title={x.help}>
                  <div className="text-xs text-muted">{x.label}</div>
                  <div className="font-mono text-xl font-medium tabular">{Math.round(v * 100)}%</div>
                  <div className="mt-1 h-1 rounded-full bg-surface-2">
                    <div className="h-full rounded-full bg-critical" style={{ width: `${v * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
          {(reasons.length > 0 || privilegeDetail) && (
            <ul className="mt-3 list-disc space-y-0.5 pl-5 text-sm text-muted">
              {reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
              {privilegeDetail && <li>Privilege: {privilegeDetail}</li>}
            </ul>
          )}
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold">How to break it</h3>
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            {BREAK_IT[kind].map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <Link to={`/app/security/findings?arm_id=${encodeURIComponent(p.entry_arm_id)}`} className="mt-2 inline-block text-sm font-medium text-brand-strong hover:underline">
            See findings on the entry point →
          </Link>
        </div>
        {reachable.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-semibold">
              {kind === 'remote' ? 'Also reachable on the private network' : 'Also reachable'} ({reachable.length})
            </h3>
            <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {reachable.map((r) => {
                const Icon = typeInfo(r.type).icon;
                return (
                  <li key={r.id}>
                    <button type="button" onClick={() => open(r.id)} className="flex w-full items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-left text-sm hover:bg-surface-2">
                      <Icon className="size-4 text-muted" aria-hidden />
                      <span className="min-w-0 flex-1 truncate">{r.name}</span>
                      <Badge tone="neutral">{Math.round(r.sensitivity * 100)}</Badge>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function AttackPathsPage() {
  const { data, isPending } = useAttackPaths();
  const exposure = useExposure();
  const exposed = exposure.data?.items.length ?? 0;
  const [params, setParams] = useSearchParams();
  const selectedId = params.get('path');
  const selected = data?.find((p) => p.id === selectedId) ?? data?.[0];
  return (
    <>
      <PageHeader
        title="Attack paths"
        description="Routes from the internet to sensitive data or control: through a workload's identity and roles, through remote access to a machine, or straight to a weakly protected data service."
      />
      {isPending ? (
        <Skeleton className="h-96" />
      ) : !data?.length ? (
        exposed > 0 ? (
          <EmptyState
            icon={<Radar />}
            title="No attack paths, but resources are exposed"
            description={`${exposed} resource${exposed === 1 ? ' is' : 's are'} reachable from the internet. None of them forms a route to sensitive data or control that scores high enough to list here.`}
            action={
              <Link to="/app/security/exposure" className="text-sm font-semibold text-brand-strong hover:underline">
                Review internet exposure
              </Link>
            }
          />
        ) : (
          <EmptyState icon={<ShieldCheck />} title="No attack paths" description="Nothing is reachable from the internet, so there is no route to sensitive data or control." />
        )
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(22rem,28rem)_1fr]">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted">
              <Route className="size-4 text-critical-strong" aria-hidden /> {data.length} path{data.length === 1 ? '' : 's'} found
            </div>
            {data.map((p) => (
              <PathCard key={p.id} p={p} active={p.id === selected?.id} onSelect={() => setParams({ path: p.id }, { replace: true })} />
            ))}
          </div>
          {selected && <PathDetail p={selected} />}
        </div>
      )}
      {!!data?.length && (
        <div className="mt-6">
          <SecurityAnalystPanel />
        </div>
      )}
      <ResourceDrawer />
    </>
  );
}
