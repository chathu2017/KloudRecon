import { Activity, ShieldAlert, Siren } from 'lucide-react';
import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { NativeSelect } from '@/components/ui/input';
import { EmptyState, PageHeader, Skeleton } from '@/components/ui/misc';
import { ResourceDrawer } from '@/features/inventory/ResourceDrawer';
import { useResourceParam } from '@/features/inventory/useResourceParam';
import { formatDateTime } from '@/lib/format';
import { useThreats } from './api';
import { SeverityBadge } from './severity';

export function ThreatsPage() {
  const [days, setDays] = React.useState(30);
  const [source, setSource] = React.useState('');
  const { data, isPending } = useThreats(days);
  const [, open] = useResourceParam();
  const items = (data ?? []).filter((t) => !source || t.source === source);
  return (
    <>
      <PageHeader
        title="Threat signals"
        description="Microsoft Defender for Cloud alerts and risky changes detected in the Activity Log (ports opened to the internet, new owners, logging removed…)."
        actions={
          <>
            <NativeSelect className="w-44" value={source} onChange={(e) => setSource(e.target.value)} aria-label="Source">
              <option value="">All signals</option>
              <option value="defender">Defender alerts</option>
              <option value="activity_log">Activity Log detections</option>
            </NativeSelect>
            <NativeSelect className="w-36" value={String(days)} onChange={(e) => setDays(Number(e.target.value))} aria-label="Period">
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
            </NativeSelect>
          </>
        }
      />
      {isPending ? (
        <Skeleton className="h-96" />
      ) : items.length === 0 ? (
        <EmptyState icon={<ShieldAlert />} title="No threat signals" description="No Defender alerts or risky changes in this period." />
      ) : (
        <Card>
          <ol className="divide-y divide-border">
            {items.map((t) => (
              <li key={`${t.source}-${t.id}`} className="flex gap-4 px-5 py-4">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-2">
                  {t.source === 'defender' ? <Siren className="size-4 text-critical-strong" aria-hidden /> : <Activity className="size-4 text-high-strong" aria-hidden />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <SeverityBadge severity={t.severity} />
                    <Badge tone="neutral">{t.source === 'defender' ? 'Defender alert' : 'Activity Log'}</Badge>
                    {t.status && <Badge tone="neutral">{t.status}</Badge>}
                  </div>
                  <div className="mt-1 font-medium">{t.title}</div>
                  <p className="text-sm text-muted">{t.description}</p>
                  <div className="mt-1 text-xs text-muted">
                    {formatDateTime(t.detected_at)}
                    {t.caller ? ` · by ${t.caller}` : ''}
                    {t.arm_id && (
                      <>
                        {' · '}
                        <button type="button" className="text-brand-strong hover:underline" onClick={() => t.arm_id && open(t.arm_id)}>
                          {t.resource_name}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      )}
      <ResourceDrawer />
    </>
  );
}
