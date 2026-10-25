import { CalendarClock, Download, Eye, FileText, Loader2, Plus, Trash2 } from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, NativeSelect } from '@/components/ui/input';
import { EmptyState, PageHeader, Skeleton } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { hasRole } from '@/components/layout/nav';
import { useFrameworks } from '@/features/compliance/api';
import { errorMessage } from '@/lib/api/client';
import { useMe } from '@/lib/auth/context';
import { formatBytes, formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  reportLink,
  useCreateReport,
  useDeleteReport,
  useDeleteSchedule,
  useReports,
  useSaveSchedule,
  useSchedules,
  type Report,
  type ScheduleIn,
} from './api';
import { REPORT_TYPES, typeTitle, type ReportType } from './meta';

const STATUS_TONE: Record<string, 'neutral' | 'brand' | 'success' | 'danger'> = {
  queued: 'neutral',
  rendering: 'brand',
  ready: 'success',
  failed: 'danger',
};
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function ReportsPage() {
  const { data: me } = useMe();
  const canCreate = hasRole(me?.user?.org_role, 'member');
  const canSchedule = hasRole(me?.user?.org_role, 'admin');
  const [creating, setCreating] = React.useState<ReportType | null>(null);
  return (
    <>
      <PageHeader
        title="Reports"
        description="Audit-ready reports built from the latest scan, as PDF or as an editable Word document, with your branding on Pro plans."
      />
      <Tabs defaultValue="reports">
        <TabsList>
          <TabsTrigger value="reports">Reports</TabsTrigger>
          <TabsTrigger value="schedules">Schedules</TabsTrigger>
        </TabsList>
        <TabsContent value="reports" className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {REPORT_TYPES.map((t) => (
              <button
                key={t.key}
                type="button"
                disabled={!canCreate}
                onClick={() => setCreating(t.key)}
                className="group flex flex-col items-start gap-2 rounded-xl border border-border bg-surface p-4 text-left shadow-sm transition-colors hover:border-brand focus-visible:outline-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="flex shrink-0 items-center text-muted [&_svg]:size-4 [&_svg]:stroke-[1.5]">
                  <t.icon className="size-4" aria-hidden />
                </span>
                <span className="flex items-center gap-2 font-medium">
                  {t.title}
                  {t.format && <Badge tone="brand">{t.format}</Badge>}
                </span>
                <span className="text-xs text-muted">{t.description}</span>
                <span className="mt-auto text-[11px] text-subtle">For {t.audience}</span>
              </button>
            ))}
          </div>
          <ReportList />
        </TabsContent>
        <TabsContent value="schedules">
          <Schedules canEdit={canSchedule} />
        </TabsContent>
      </Tabs>
      {creating && <CreateDialog type={creating} onClose={() => setCreating(null)} />}
    </>
  );
}

function CreateDialog({ type, onClose }: { type: ReportType; onClose: () => void }) {
  const create = useCreateReport();
  const { data: frameworks } = useFrameworks();
  const active = frameworks?.filter((f) => !f.locked) ?? [];
  const [framework, setFramework] = React.useState('');
  const [days, setDays] = React.useState<7 | 14 | 30 | 90>(30);
  const [names, setNames] = React.useState({ prepared_by: '', reviewed_by: '', approved_by: '' });
  const audit = type === 'audit';
  const word = audit || type === 'server_health';
  const [includeServers, setIncludeServers] = React.useState(false);
  const fw = framework || active.find((f) => f.active)?.key || active[0]?.key || '';
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{typeTitle(type)}</DialogTitle>
          <DialogDescription>{REPORT_TYPES.find((t) => t.key === type)?.description}</DialogDescription>
        </DialogHeader>
        {type === 'compliance' && (
          <label className="text-sm font-medium">
            Framework
            <NativeSelect className="mt-1" value={fw} onChange={(e) => setFramework(e.target.value)}>
              {active.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.name}
                </option>
              ))}
            </NativeSelect>
          </label>
        )}
        {type === 'changes' && (
          <label className="text-sm font-medium">
            Period
            <NativeSelect className="mt-1" value={days} onChange={(e) => setDays(Number(e.target.value) as 7 | 14 | 30 | 90)}>
              {[7, 14, 30, 90].map((d) => (
                <option key={d} value={d}>
                  Last {d} days
                </option>
              ))}
            </NativeSelect>
          </label>
        )}
        {word && (
          <div className="grid gap-3">
            <p className="text-sm text-muted">
              Page 2 of the document is the approval page. Fill in the names you know; anything left empty prints as a blank line to complete and sign by hand.
            </p>
            {(
              [
                ['prepared_by', 'Prepared by'],
                ['reviewed_by', 'Reviewed by'],
                ['approved_by', 'Report approved by'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="text-sm font-medium">
                {label}
                <Input
                  className="mt-1"
                  maxLength={120}
                  placeholder="Name (optional)"
                  value={names[key]}
                  onChange={(e) => setNames((n) => ({ ...n, [key]: e.target.value }))}
                />
              </label>
            ))}
            {audit && (
              <label className="flex items-start gap-2.5 text-sm">
                <input type="checkbox" className="mt-0.5" checked={includeServers} onChange={(e) => setIncludeServers(e.target.checked)} />
                <span>
                  <span className="font-medium">Include server health checks</span>
                  <span className="block text-muted">Adds a section with the servers you checked under Server health.</span>
                </span>
              </label>
            )}
            {type === 'server_health' && <p className="text-sm text-muted">The report covers every server that has a health check. To report on one server only, open it under Server health and choose Word report.</p>}
          </div>
        )}
        <p className="text-xs text-muted">
          The {word ? 'Word document' : 'PDF'} is generated in the background from {type === 'server_health' ? 'the latest health check of each server.' : 'the latest scan (or the scan selected in “as of”).'}
          {word && ' Word may ask to update fields when you open it: choose Yes to fill in the page numbers of the contents.'}
        </p>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={create.isPending}
            onClick={() =>
              create.mutate(
                {
                  type,
                  ...(type === 'compliance' ? { framework: fw } : {}),
                  ...(type === 'changes' ? { days } : {}),
                  ...(audit && includeServers ? { include_servers: true } : {}),
                  ...(word
                    ? Object.fromEntries(Object.entries(names).filter(([, v]) => v.trim()).map(([k, v]) => [k, v.trim()]))
                    : {}),
                },
                { onSuccess: onClose },
              )
            }
          >
            Generate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

async function openLink(id: string, kind: 'url' | 'print_url') {
  try {
    const link = await reportLink(id);
    if (kind === 'url') window.location.assign(link.url);
    else window.open(link.print_url, '_blank', 'noopener');
  } catch (e) {
    toast.error(errorMessage(e));
  }
}

function ReportList() {
  const { data, isPending } = useReports();
  const del = useDeleteReport();
  if (isPending) return <Skeleton className="h-48" />;
  if (!data?.length)
    return (
      <EmptyState
        icon={<FileText />}
        title="No reports yet"
        description="Pick a report type above. It is ready in about a minute."
      />
    );
  return (
    <Card>
      <Table>
        <THead>
          <TR>
            <TH>Report</TH>
            <TH>Status</TH>
            <TH>Created</TH>
            <TH className="text-right">Size</TH>
            <TH className="text-right">Actions</TH>
          </TR>
        </THead>
        <TBody>
          {data.map((r: Report) => (
            <TR key={r.id}>
              <TD>
                <div className="font-medium">{r.title}</div>
                <div className="text-xs text-muted">
                  {typeTitle(r.type)}
                  {r.schedule_id ? ' · scheduled' : ''}
                </div>
              </TD>
              <TD>
                <Badge tone={STATUS_TONE[r.status] ?? 'neutral'}>
                  {(r.status === 'queued' || r.status === 'rendering') && <Loader2 className="animate-spin" aria-hidden />}
                  {r.status === 'rendering' ? 'Generating' : r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                </Badge>
                {r.error && <div className="mt-1 text-xs text-critical-strong">{r.error}</div>}
              </TD>
              <TD className="text-xs text-muted">{formatDateTime(r.created_at)}</TD>
              <TD className="text-right text-xs tabular text-muted">
                {r.size_bytes ? formatBytes(r.size_bytes) + (r.pages ? ` · ${r.pages} p.` : '') : '—'}
              </TD>
              <TD>
                <div className="flex justify-end gap-1">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={r.status !== 'ready'}
                    onClick={() => void openLink(r.id, 'url')}
                    aria-label={`Download ${r.title}`}
                  >
                    <Download />
                    {r.format === 'docx' ? 'Word' : 'PDF'}
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    disabled={r.status !== 'ready'}
                    onClick={() => void openLink(r.id, 'print_url')}
                    aria-label={`Preview ${r.title}`}
                  >
                    <Eye />
                  </Button>
                  <Button size="icon-sm" variant="ghost" onClick={() => del.mutate(r.id)} aria-label={`Delete ${r.title}`}>
                    <Trash2 />
                  </Button>
                </div>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
      <p className="border-t border-border px-4 py-2 text-[11px] text-subtle">
        Download links are valid for 15 minutes; every download is recorded in the audit log.
      </p>
    </Card>
  );
}

const EMPTY: ScheduleIn = {
  type: 'executive',
  frequency: 'weekly',
  weekday: 0,
  day_of_month: 1,
  hour_utc: 6,
  recipients: [],
  enabled: true,
};

function Schedules({ canEdit }: { canEdit: boolean }) {
  const { data, isPending } = useSchedules();
  const save = useSaveSchedule();
  const del = useDeleteSchedule();
  const { data: me } = useMe();
  const [draft, setDraft] = React.useState<ScheduleIn>({ ...EMPTY, recipients: me?.email ? [me.email] : [] });
  const [recipients, setRecipients] = React.useState(me?.email ?? '');
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <Card>
        <CardHeader>
          <CardTitle>Scheduled reports</CardTitle>
          <CardDescription>Delivered by email as a PDF attachment. Available on Pro and Enterprise.</CardDescription>
        </CardHeader>
        <CardContent>
          {isPending ? (
            <Skeleton className="h-24" />
          ) : !data?.length ? (
            <p className="text-sm text-muted">No schedules yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {data.map((s) => (
                <li key={s.id} className="flex items-center gap-3 py-3 text-sm">
                  <CalendarClock className="size-4 text-muted" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{typeTitle(s.type)}</div>
                    <div className="text-xs text-muted">
                      {s.frequency === 'weekly' ? `Every ${WEEKDAYS[s.weekday]}` : `Monthly on day ${s.day_of_month}`} at{' '}
                      {String(s.hour_utc).padStart(2, '0')}:00 UTC · next {formatDateTime(s.next_run_at)} ·{' '}
                      {s.recipients.join(', ')}
                    </div>
                  </div>
                  {canEdit && (
                    <Button size="icon-sm" variant="ghost" aria-label="Delete schedule" onClick={() => del.mutate(s.id)}>
                      <Trash2 />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      {canEdit && (
        <Card>
          <CardHeader>
            <CardTitle>New schedule</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                const list = recipients.split(/[,\s]+/).filter(Boolean);
                save.mutate({ body: { ...draft, recipients: list } });
              }}
            >
              <label className="block text-xs font-medium text-muted">
                Report
                <NativeSelect className="mt-1" value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as ReportType })}>
                  {REPORT_TYPES.filter((t) => t.key !== 'compliance').map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.title}
                    </option>
                  ))}
                </NativeSelect>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs font-medium text-muted">
                  Frequency
                  <NativeSelect
                    className="mt-1"
                    value={draft.frequency}
                    onChange={(e) => setDraft({ ...draft, frequency: e.target.value as 'weekly' | 'monthly' })}
                  >
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </NativeSelect>
                </label>
                {draft.frequency === 'weekly' ? (
                  <label className="block text-xs font-medium text-muted">
                    Day
                    <NativeSelect className="mt-1" value={draft.weekday} onChange={(e) => setDraft({ ...draft, weekday: Number(e.target.value) })}>
                      {WEEKDAYS.map((d, i) => (
                        <option key={d} value={i}>
                          {d}
                        </option>
                      ))}
                    </NativeSelect>
                  </label>
                ) : (
                  <label className="block text-xs font-medium text-muted">
                    Day of month
                    <Input
                      type="number"
                      min={1}
                      max={28}
                      className="mt-1"
                      value={draft.day_of_month}
                      onChange={(e) => setDraft({ ...draft, day_of_month: Number(e.target.value) })}
                    />
                  </label>
                )}
              </div>
              <label className="block text-xs font-medium text-muted">
                Recipients (members of your organization)
                <Input className="mt-1" value={recipients} onChange={(e) => setRecipients(e.target.value)} />
              </label>
              <Button type="submit" loading={save.isPending} className={cn('w-full')}>
                <Plus />
                Add schedule
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
