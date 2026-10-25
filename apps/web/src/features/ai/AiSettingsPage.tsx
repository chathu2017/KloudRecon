import { Sparkles } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader, Skeleton } from '@/components/ui/misc';
import { hasRole } from '@/components/layout/nav';
import { useMe } from '@/lib/auth/context';
import { formatNumber } from '@/lib/format';
import { useAiSettings, useAiUsage, useSaveAiSettings, type AiSettings } from './api';
import { AiPanel, PointList, type PointLike } from './components';

const OPTIONS: { key: keyof AiSettings; label: string; help: string }[] = [
  {
    key: 'redact_names',
    label: 'Redact resource names',
    help: 'Replace resource, group and subscription names with pseudonyms before anything is sent to Azure OpenAI. Answers are mapped back for display.',
  },
  {
    key: 'redact_ips',
    label: 'Redact IP addresses',
    help: 'Replace IP addresses and address ranges with pseudonyms.',
  },
  {
    key: 'auto_summary',
    label: 'Summarize every scan',
    help: 'Write the executive summary and the security analysis automatically after each scan. Does not use your AI message quota.',
  },
  {
    key: 'digest_enabled',
    label: 'Weekly AI digest email',
    help: 'Every Monday, members receive a short digest of score, findings and cost changes. Members can opt out in their profile.',
  },
];

/** Plan usage: used / limit with a bar that turns amber at 80% and red at 100%. */
export function UsageBar({ used, limit, unit = 'messages' }: { used: number; limit: number | null; unit?: string }) {
  const pct = limit ? Math.min(100, (100 * used) / limit) : 0;
  const tone = pct >= 100 ? 'bg-critical' : pct >= 80 ? 'bg-medium' : 'bg-brand';
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="font-medium tabular">
          {formatNumber(used)} of {limit === null ? 'unlimited' : formatNumber(limit)} {unit}
        </span>
        {limit !== null && <span className="tabular text-muted">{Math.round(pct)}%</span>}
      </div>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
        role="meter"
        aria-label={`${unit} used`}
        aria-valuemin={0}
        aria-valuemax={limit ?? used}
        aria-valuenow={used}
      >
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${limit === null ? 0 : pct}%` }} />
      </div>
    </div>
  );
}

export function AiSettingsPage() {
  const { data: settings, isPending } = useAiSettings();
  const { data: usage } = useAiUsage();
  const save = useSaveAiSettings();
  const { data: me } = useMe();
  const canEdit = hasRole(me?.user?.org_role, 'admin');
  return (
    <>
      <PageHeader
        title="AI"
        description="KloudRecon AI uses Azure OpenAI with your scan data only. It is read-only, cites its sources and never invents numbers."
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card>
          <CardHeader>
            <CardTitle>Privacy and automation</CardTitle>
            <CardDescription>Customer text such as names and tags is always treated as untrusted data.</CardDescription>
          </CardHeader>
          <CardContent className="divide-y divide-border">
            {isPending || !settings ? (
              <Skeleton className="h-40" />
            ) : (
              OPTIONS.map((o) => (
                <label key={o.key} className="flex items-start gap-3 py-3 first:pt-0">
                  <input
                    type="checkbox"
                    className="mt-1 size-4 accent-brand"
                    checked={settings[o.key]}
                    disabled={!canEdit || save.isPending}
                    onChange={(e) => save.mutate({ [o.key]: e.target.checked })}
                  />
                  <span>
                    <span className="block text-sm font-medium">{o.label}</span>
                    <span className="block text-xs text-muted">{o.help}</span>
                  </span>
                </label>
              ))
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="size-4 text-brand-strong" aria-hidden /> Usage this month
            </CardTitle>
            <CardDescription>Chat questions and on-demand generations count as messages.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {usage ? (
              <>
                <UsageBar used={usage.messages_used} limit={usage.messages_limit} />
                <dl className="grid grid-cols-2 gap-2 text-xs">
                  <dt className="text-muted">Model calls</dt>
                  <dd className="text-right tabular">{formatNumber(usage.calls)}</dd>
                  <dt className="text-muted">Tokens in / out</dt>
                  <dd className="text-right tabular">
                    {formatNumber(usage.tokens_in)} / {formatNumber(usage.tokens_out)}
                  </dd>
                  <dt className="text-muted">Mode</dt>
                  <dd className="text-right">{usage.mode === 'mock' ? 'Mock (local)' : 'Azure OpenAI'}</dd>
                </dl>
              </>
            ) : (
              <Skeleton className="h-20" />
            )}
          </CardContent>
        </Card>
      </div>
      <div className="mt-6">
        <AiPanel kind="digest" title="Weekly digest preview" description="This week's digest as members receive it.">
          {(gen) => {
            const c = gen.content ?? {};
            const pts = (k: string) => (Array.isArray(c[k]) ? (c[k] as PointLike[]) : []);
            return (
              <div className="space-y-4">
                <p className="font-medium">{typeof c.headline === 'string' ? c.headline : ''}</p>
                <PointList items={pts('highlights')} refs={gen.refs} />
                <h4 className="text-xs font-semibold text-muted">Top priorities</h4>
                <PointList items={pts('next_steps')} refs={gen.refs} ordered />
              </div>
            );
          }}
        </AiPanel>
      </div>
    </>
  );
}
