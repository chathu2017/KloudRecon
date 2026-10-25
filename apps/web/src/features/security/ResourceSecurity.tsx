import { Globe2, KeyRound, Route, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/misc';
import { typeInfo } from '@/features/inventory/types';
import { useBlastRadius } from './api';
import { RiskScore, SeverityBadge } from './severity';

/** Security tab of the resource drawer: findings, attack paths and blast radius. */
export function ResourceSecurity({ armId, onOpen }: { armId: string; onOpen: (armId: string) => void }) {
  const { data, isPending, isError } = useBlastRadius(armId);
  if (isPending) return <Skeleton className="h-64" />;
  if (isError) return <p className="text-sm text-muted">Security data is available after the next scan.</p>;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {data.exposed ? (
          <Badge tone="danger">
            <Globe2 aria-hidden /> Reachable from the internet
          </Badge>
        ) : (
          <Badge tone="success">
            <ShieldCheck aria-hidden /> Not internet-exposed
          </Badge>
        )}
        <Badge tone="neutral">{data.findings.length} open finding(s)</Badge>
        {data.attack_paths.length > 0 && (
          <Badge tone="danger">
            <Route aria-hidden /> {data.attack_paths.length} attack path(s)
          </Badge>
        )}
      </div>
      {data.attack_paths.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold">Attack paths</h3>
          <ul className="space-y-1.5">
            {data.attack_paths.map((p) => (
              <li key={p.id}>
                <Link to={`/app/security/attack-paths?path=${p.id}`} className="flex items-center justify-between gap-2 rounded-md border border-critical/30 bg-critical-soft/40 px-3 py-2 text-sm hover:border-critical">
                  <span className="truncate">{p.title}</span>
                  <SeverityBadge severity={p.severity} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section>
        <h3 className="mb-2 text-sm font-semibold">Findings</h3>
        {data.findings.length === 0 ? (
          <p className="text-sm text-muted">No open findings on this resource.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {data.findings.map((f) => (
              <li key={f.id}>
                <Link to={`/app/security/findings/${f.id}`} className="flex items-center gap-3 px-3 py-2 hover:bg-surface-2">
                  <SeverityBadge severity={f.severity} />
                  <span className="min-w-0 flex-1 truncate text-sm">{f.title}</span>
                  <RiskScore score={f.risk_score} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h3 className="mb-1 text-sm font-semibold">Blast radius</h3>
        <p className="mb-2 text-xs text-muted">What an attacker could reach through this resource&apos;s identities if it were compromised.</p>
        {data.identities.length === 0 ? (
          <p className="text-sm text-muted">This resource runs without a managed identity.</p>
        ) : (
          <div className="space-y-3">
            {data.identities.map((i) => (
              <div key={String(i.principal_id)} className="rounded-md border border-border p-3 text-sm">
                <div className="flex items-center gap-2 font-medium">
                  <KeyRound className="size-4 text-brand-strong" aria-hidden /> {String(i.name)}
                </div>
                <ul className="mt-1 text-xs text-muted">
                  {(i.roles as { role: string; scope: string }[]).map((r) => (
                    <li key={`${r.role}-${r.scope}`}>
                      {r.role} on {r.scope}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {data.reachable.length > 0 && (
              <ul className="grid gap-1.5">
                {data.reachable.slice(0, 20).map((r) => {
                  const Icon = typeInfo(String(r.type)).icon;
                  return (
                    <li key={String(r.id)}>
                      <button type="button" onClick={() => onOpen(String(r.id))} className="flex w-full items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-left text-sm hover:bg-surface-2">
                        <Icon className="size-4 text-muted" aria-hidden />
                        <span className="min-w-0 flex-1 truncate">{String(r.name)}</span>
                        <span className="text-xs text-muted">{(r.via as string[])[0]}</span>
                      </button>
                    </li>
                  );
                })}
                {data.reachable.length > 20 && <li className="text-xs text-muted">+{data.reachable.length - 20} more</li>}
              </ul>
            )}
            {data.subscription_control.length > 0 && (
              <p className="rounded-md border border-critical/30 bg-critical-soft p-2 text-sm text-critical-strong">
                Full control of {data.subscription_control.length} subscription scope(s).
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
