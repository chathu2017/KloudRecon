import { BellRing, Copy, Lock, Pencil, Plug, Plus, Send, Trash2 } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, NativeSelect } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmptyState, PageHeader, Skeleton } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { hasRole } from '@/components/layout/nav';
import { useMe } from '@/lib/auth/context';
import { formatDateTime } from '@/lib/format';
import {
  useAlertEvents,
  useAlertRules,
  useCreateIntegration,
  useDeleteIntegration,
  useDeleteRule,
  useDeliveries,
  useIntegrations,
  useSaveRule,
  useTestIntegration,
  useToggleIntegration,
  type AlertEventType,
  type AlertRule,
  type AlertRuleIn,
  type Integration,
  type IntegrationIn,
} from './api';

const KIND_LABEL: Record<string, string> = { teams: 'Microsoft Teams', slack: 'Slack', webhook: 'Signed webhook' };
const KIND_HELP: Record<string, string> = {
  teams: 'A Teams incoming webhook or a Workflows "When a Teams webhook request is received" URL.',
  slack: 'A Slack incoming webhook URL (https://hooks.slack.com/services/…).',
  webhook: 'Any HTTPS endpoint. Each request carries an HMAC-SHA256 signature in X-KloudRecon-Signature.',
};
const STATUS_TONE: Record<string, 'success' | 'danger' | 'warning' | 'neutral'> = {
  sent: 'success',
  failed: 'danger',
  retrying: 'warning',
  queued: 'neutral',
};
const SEVERITIES = ['critical', 'high', 'medium', 'low'] as const;

interface Channels {
  in_app: boolean;
  email: boolean;
  integrations: string[];
}

function channelsOf(rule: AlertRule): Channels {
  const c = rule.channels as Partial<Channels>;
  return { in_app: Boolean(c.in_app), email: Boolean(c.email), integrations: (c.integrations ?? []).map(String) };
}

function RuleDialog({
  rule,
  events,
  integrations,
  open,
  onOpenChange,
}: {
  rule: AlertRule | null;
  events: AlertEventType[];
  integrations: Integration[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const save = useSaveRule();
  const cfg = (rule?.config ?? {}) as { min_severity?: (typeof SEVERITIES)[number]; min_amount?: number };
  const [form, setForm] = React.useState<AlertRuleIn>(() => ({
    name: rule?.name ?? '',
    event_type: (rule?.event_type ?? 'new_critical_risk') as AlertRuleIn['event_type'],
    enabled: rule?.enabled ?? true,
    config: { min_severity: cfg.min_severity ?? null, min_amount: cfg.min_amount ?? null },
    channels: rule ? channelsOf(rule) : { in_app: true, email: true, integrations: [] },
  }));
  const channels = form.channels ?? { in_app: false, email: false, integrations: [] };
  const selected = new Set((channels.integrations ?? []).map(String));
  const event = events.find((e) => e.key === form.event_type);
  const money = form.event_type === 'cost_anomaly' || form.event_type === 'budget_forecast_exceeded';
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{rule ? 'Edit alert rule' : 'New alert rule'}</DialogTitle>
          <DialogDescription>Choose an event and where to send it. Rules run after every scan.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate({ id: rule?.id, body: form }, { onSuccess: () => onOpenChange(false) });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="ar-name">Name</Label>
            <Input id="ar-name" required maxLength={120} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ar-event">Event</Label>
            <NativeSelect
              id="ar-event"
              value={form.event_type}
              onChange={(e) => setForm({ ...form, event_type: e.target.value as AlertRuleIn['event_type'] })}
            >
              {events.map((ev) => (
                <option key={ev.key} value={ev.key}>
                  {ev.title}
                </option>
              ))}
            </NativeSelect>
            {event && <p className="text-xs text-muted">{event.description}</p>}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ar-sev">Minimum severity</Label>
              <NativeSelect
                id="ar-sev"
                value={form.config?.min_severity ?? ''}
                onChange={(e) =>
                  setForm({
                    ...form,
                    config: { ...form.config, min_severity: (e.target.value || null) as (typeof SEVERITIES)[number] | null },
                  })
                }
              >
                <option value="">Any</option>
                {SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </NativeSelect>
            </div>
            {money && (
              <div className="space-y-1.5">
                <Label htmlFor="ar-amount">Minimum amount</Label>
                <Input
                  id="ar-amount"
                  type="number"
                  min={0}
                  step="any"
                  value={form.config?.min_amount ?? ''}
                  onChange={(e) =>
                    setForm({ ...form, config: { ...form.config, min_amount: e.target.value === '' ? null : Number(e.target.value) } })
                  }
                />
              </div>
            )}
          </div>
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium">Channels</legend>
            {event?.builtin_notice && (
              <p className="rounded-md bg-surface-2 p-2 text-xs text-muted">
                A standard in-app and email notice is already sent for this event. Use this rule to reach Teams, Slack or a webhook.
              </p>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4 accent-brand" checked={channels.in_app} onChange={(e) => setForm({ ...form, channels: { ...channels, in_app: e.target.checked } })} />
              In-app notification (owners and admins)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4 accent-brand" checked={channels.email} onChange={(e) => setForm({ ...form, channels: { ...channels, email: e.target.checked } })} />
              Email (owners and admins)
            </label>
            {integrations.map((i) => (
              <label key={i.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-brand"
                  checked={selected.has(i.id)}
                  onChange={(e) => {
                    const next = new Set(selected);
                    if (e.target.checked) next.add(i.id);
                    else next.delete(i.id);
                    setForm({ ...form, channels: { ...channels, integrations: [...next] } });
                  }}
                />
                {i.name} <span className="text-xs text-muted">({KIND_LABEL[i.kind] ?? i.kind})</span>
              </label>
            ))}
          </fieldset>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-brand" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
            Enabled
          </label>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              Save rule
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function IntegrationDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const create = useCreateIntegration();
  const [form, setForm] = React.useState<IntegrationIn>({ kind: 'teams', name: '', url: '' });
  const [secret, setSecret] = React.useState<string | null>(null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{secret ? 'Save the signing secret' : 'Add a channel'}</DialogTitle>
          <DialogDescription>
            {secret
              ? 'This secret is shown once. Use it to verify the X-KloudRecon-Signature header (t=timestamp,v1=HMAC-SHA256 of "timestamp.body").'
              : 'The URL is stored in Key Vault and is never shown again; only its host is displayed.'}
          </DialogDescription>
        </DialogHeader>
        {secret ? (
          <>
            <div className="flex items-center gap-2">
              <Input readOnly value={secret} className="font-mono text-xs" aria-label="Signing secret" />
              <Button
                type="button"
                variant="secondary"
                size="icon"
                aria-label="Copy signing secret"
                onClick={() => {
                  void navigator.clipboard.writeText(secret);
                  toast.success('Copied.');
                }}
              >
                <Copy />
              </Button>
            </div>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate(form, {
                onSuccess: (res) => {
                  toast.success('Channel added. Send a test message to check it.');
                  if (res.signing_secret) setSecret(res.signing_secret);
                  else onOpenChange(false);
                },
              });
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="in-kind">Type</Label>
              <NativeSelect id="in-kind" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as IntegrationIn['kind'] })}>
                {Object.entries(KIND_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </NativeSelect>
              <p className="text-xs text-muted">{KIND_HELP[form.kind]}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="in-name">Name</Label>
              <Input id="in-name" required maxLength={100} placeholder="#cloud-alerts" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="in-url">Webhook URL</Label>
              <Input id="in-url" required type="url" autoComplete="off" spellCheck={false} value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={create.isPending}>
                Add channel
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RulesTab({ isAdmin, integrations }: { isAdmin: boolean; integrations: Integration[] }) {
  const { data: rules, isPending } = useAlertRules();
  const { data: events = [] } = useAlertEvents();
  const del = useDeleteRule();
  const save = useSaveRule();
  const [editing, setEditing] = React.useState<AlertRule | null>(null);
  const [open, setOpen] = React.useState(false);
  const [session, setSession] = React.useState(0);
  const title = (key: string) => events.find((e) => e.key === key)?.title ?? key;
  const names = new Map(integrations.map((i) => [i.id, i.name]));
  const edit = (r: AlertRule | null) => {
    setEditing(r);
    setSession((n) => n + 1);
    setOpen(true);
  };
  return (
    <>
      {isAdmin && (
        <div className="mb-3 flex justify-end">
          <Button size="sm" onClick={() => edit(null)}>
            <Plus /> New rule
          </Button>
        </div>
      )}
      {isPending ? (
        <Skeleton className="h-48" />
      ) : (
        <Card className="overflow-x-auto">
          <Table>
            <THead>
              <TR>
                <TH>Rule</TH>
                <TH>Event</TH>
                <TH>Channels</TH>
                <TH>Status</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {(rules ?? []).map((r) => {
                const c = channelsOf(r);
                const labels = [c.in_app && 'In-app', c.email && 'Email', ...c.integrations.map((id) => names.get(id) ?? 'Channel')].filter(Boolean) as string[];
                return (
                  <TR key={r.id}>
                    <TD className="font-medium">{r.name}</TD>
                    <TD className="text-muted">{title(r.event_type)}</TD>
                    <TD>
                      {labels.length ? (
                        <div className="flex flex-wrap gap-1">
                          {labels.map((l, i) => (
                            <Badge key={i}>{l}</Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-muted">No channels</span>
                      )}
                    </TD>
                    <TD>
                      {isAdmin ? (
                        <label className="inline-flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="size-4 accent-brand"
                            checked={r.enabled}
                            aria-label={`${r.enabled ? 'Disable' : 'Enable'} ${r.name}`}
                            onChange={(e) =>
                              save.mutate({
                                id: r.id,
                                body: {
                                  name: r.name,
                                  event_type: r.event_type as AlertRuleIn['event_type'],
                                  config: r.config,
                                  channels: c,
                                  enabled: e.target.checked,
                                },
                              })
                            }
                          />
                          {r.enabled ? 'On' : 'Off'}
                        </label>
                      ) : r.enabled ? (
                        <Badge tone="success">On</Badge>
                      ) : (
                        <Badge>Off</Badge>
                      )}
                    </TD>
                    <TD className="whitespace-nowrap text-right">
                      {isAdmin && (
                        <>
                          <Button variant="ghost" size="icon-sm" aria-label={`Edit ${r.name}`} onClick={() => edit(r)}>
                            <Pencil />
                          </Button>
                          <Button variant="ghost" size="icon-sm" aria-label={`Delete ${r.name}`} onClick={() => del.mutate(r.id)}>
                            <Trash2 />
                          </Button>
                        </>
                      )}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </Card>
      )}
      <RuleDialog key={session} rule={editing} events={events} integrations={integrations} open={open} onOpenChange={setOpen} />
    </>
  );
}

function ChannelsTab({ isAdmin, integrations, loading, locked }: { isAdmin: boolean; integrations: Integration[]; loading: boolean; locked: boolean }) {
  const toggle = useToggleIntegration();
  const del = useDeleteIntegration();
  const test = useTestIntegration();
  const [open, setOpen] = React.useState(false);
  const [session, setSession] = React.useState(0);
  if (locked)
    return (
      <EmptyState
        icon={<Lock />}
        title="Available on Pro and Enterprise"
        description="Send alerts to Microsoft Teams, Slack or your own signed webhook. In-app and email alerts work on every plan."
      />
    );
  return (
    <>
      {isAdmin && (
        <div className="mb-3 flex justify-end">
          <Button
            size="sm"
            onClick={() => {
              setSession((n) => n + 1);
              setOpen(true);
            }}
          >
            <Plus /> Add channel
          </Button>
        </div>
      )}
      {loading ? (
        <Skeleton className="h-32" />
      ) : !integrations.length ? (
        <EmptyState icon={<Plug />} title="No channels yet" description="Add a Teams, Slack or webhook channel, then pick it in an alert rule." />
      ) : (
        <Card className="overflow-x-auto">
          <Table>
            <THead>
              <TR>
                <TH>Channel</TH>
                <TH>Type</TH>
                <TH>Last delivery</TH>
                <TH>Enabled</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {integrations.map((i) => (
                <TR key={i.id}>
                  <TD>
                    <div className="font-medium">{i.name}</div>
                    <div className="font-mono text-xs text-muted">{i.url_hint}</div>
                  </TD>
                  <TD className="text-muted">{KIND_LABEL[i.kind] ?? i.kind}</TD>
                  <TD>
                    {i.last_status ? (
                      <Badge tone={i.last_status === 'ok' ? 'success' : 'danger'} title={i.last_error ?? undefined}>
                        {i.last_status === 'ok' ? 'Delivered' : 'Failed'}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted">Never</span>
                    )}
                    {i.last_delivery_at && <div className="text-xs text-muted">{formatDateTime(i.last_delivery_at)}</div>}
                  </TD>
                  <TD>
                    <input
                      type="checkbox"
                      className="size-4 accent-brand"
                      checked={i.enabled}
                      disabled={!isAdmin}
                      aria-label={`${i.enabled ? 'Disable' : 'Enable'} ${i.name}`}
                      onChange={(e) => toggle.mutate({ id: i.id, enabled: e.target.checked })}
                    />
                  </TD>
                  <TD className="whitespace-nowrap text-right">
                    {isAdmin && (
                      <>
                        <Button variant="ghost" size="sm" loading={test.isPending && test.variables === i.id} onClick={() => test.mutate(i.id)}>
                          <Send /> Test
                        </Button>
                        <Button variant="ghost" size="icon-sm" aria-label={`Delete ${i.name}`} onClick={() => del.mutate(i.id)}>
                          <Trash2 />
                        </Button>
                      </>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
      <IntegrationDialog key={session} open={open} onOpenChange={setOpen} />
    </>
  );
}

function DeliveriesTab() {
  const { data, isPending } = useDeliveries();
  if (isPending) return <Skeleton className="h-48" />;
  if (!data?.length)
    return <EmptyState icon={<BellRing />} title="No alerts sent yet" description="Deliveries appear here after the next scan triggers a rule, or when you send a test." />;
  return (
    <Card className="overflow-x-auto">
      <Table>
        <THead>
          <TR>
            <TH>When</TH>
            <TH>Alert</TH>
            <TH>Channel</TH>
            <TH>Status</TH>
          </TR>
        </THead>
        <TBody>
          {data.map((d) => (
            <TR key={d.id}>
              <TD className="whitespace-nowrap text-muted tabular">{formatDateTime(d.created_at)}</TD>
              <TD className="max-w-md truncate">{d.title}</TD>
              <TD className="text-muted">{KIND_LABEL[d.channel] ?? (d.channel === 'in_app' ? 'In-app' : d.channel === 'email' ? 'Email' : d.channel)}</TD>
              <TD>
                <Badge tone={STATUS_TONE[d.status] ?? 'neutral'} title={d.error ?? undefined}>
                  {d.status}
                  {d.response_code ? ` · ${d.response_code}` : ''}
                </Badge>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </Card>
  );
}

export function AlertsPage() {
  const { data: me } = useMe();
  const isAdmin = hasRole(me?.user?.org_role, 'admin');
  const { data: integrations, isPending } = useIntegrations();
  // Teams/Slack/webhooks are a plan feature (Pro+); orgs without a plan are on the Trial.
  const locked = me !== undefined && me.plan?.features.webhooks !== true;
  return (
    <>
      <PageHeader
        title="Alerts"
        description="Get told when something important changes: new critical risks and attack paths, risky changes, cost anomalies, budgets, failed scans and expiring secrets."
      />
      <Tabs defaultValue="rules">
        <TabsList>
          <TabsTrigger value="rules">Rules</TabsTrigger>
          <TabsTrigger value="channels">Channels</TabsTrigger>
          <TabsTrigger value="log">Delivery log</TabsTrigger>
        </TabsList>
        <TabsContent value="rules" className="mt-4">
          <RulesTab isAdmin={isAdmin} integrations={integrations ?? []} />
        </TabsContent>
        <TabsContent value="channels" className="mt-4">
          <ChannelsTab isAdmin={isAdmin} integrations={integrations ?? []} loading={isPending} locked={locked} />
        </TabsContent>
        <TabsContent value="log" className="mt-4">
          <DeliveriesTab />
        </TabsContent>
      </Tabs>
    </>
  );
}
