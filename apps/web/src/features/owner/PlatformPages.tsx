import { CalendarClock, Flag, Megaphone, Pencil, Plus, Trash2 } from 'lucide-react';
import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { EmptyState, PageHeader, Skeleton } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { errorMessage } from '@/lib/api/client';
import { formatDate, formatDateTime } from '@/lib/format';
import {
  previewTemplate,
  useAnnouncementsAdmin,
  useDeleteAnnouncement,
  useDeleteFlag,
  useDeleteRetirement,
  useEmailTemplates,
  useFlagsAdmin,
  useRetirementsAdmin,
  useSaveAnnouncement,
  useSaveFlag,
  useSaveRetirement,
  useSaveTemplate,
  type Announcement,
  type AnnouncementIn,
  type EmailTemplate,
  type FeatureFlag,
  type Retirement,
  type RetirementIn,
} from './platformApi';

const LEVEL_TONE = { info: 'brand', warning: 'warning', critical: 'danger' } as const;

function toLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocal(value: string): string | null {
  return value ? new Date(value).toISOString() : null;
}

// ---- announcements ------------------------------------------------------------------------------
function AnnouncementDialog({ row, open, onOpenChange }: { row: Announcement | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const save = useSaveAnnouncement();
  const [form, setForm] = React.useState<AnnouncementIn>(() => ({
    title: row?.title ?? '',
    body: row?.body ?? '',
    level: (row?.level ?? 'info') as AnnouncementIn['level'],
    link: row?.link ?? null,
    starts_at: row?.starts_at ?? null,
    ends_at: row?.ends_at ?? null,
    active: row?.active ?? true,
  }));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{row ? 'Edit announcement' : 'New announcement'}</DialogTitle>
          <DialogDescription>Shown as a banner to every signed-in customer while it is active.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate({ id: row?.id, body: { ...form, link: form.link || null } }, { onSuccess: () => onOpenChange(false) });
          }}
        >
          <Field label="Title" htmlFor="an-title">
            <Input id="an-title" required minLength={3} maxLength={160} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <Field label="Details (optional)" htmlFor="an-body">
            <Textarea id="an-body" maxLength={2000} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Level" htmlFor="an-level">
              <NativeSelect id="an-level" value={form.level} onChange={(e) => setForm({ ...form, level: e.target.value as AnnouncementIn['level'] })}>
                <option value="info">Information</option>
                <option value="warning">Warning</option>
                <option value="critical">Critical</option>
              </NativeSelect>
            </Field>
            <Field label="Link (optional)" htmlFor="an-link">
              <Input id="an-link" placeholder="https://… or /app/…" value={form.link ?? ''} onChange={(e) => setForm({ ...form, link: e.target.value })} />
            </Field>
            <Field label="Starts" htmlFor="an-start">
              <Input id="an-start" type="datetime-local" value={toLocal(form.starts_at)} onChange={(e) => setForm({ ...form, starts_at: fromLocal(e.target.value) })} />
            </Field>
            <Field label="Ends" htmlFor="an-end">
              <Input id="an-end" type="datetime-local" value={toLocal(form.ends_at)} onChange={(e) => setForm({ ...form, ends_at: fromLocal(e.target.value) })} />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-brand" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
            Active
          </label>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AnnouncementsPage() {
  const { data, isPending } = useAnnouncementsAdmin();
  const del = useDeleteAnnouncement();
  const [editing, setEditing] = React.useState<Announcement | null>(null);
  const [open, setOpen] = React.useState(false);
  const [session, setSession] = React.useState(0);
  const edit = (row: Announcement | null) => {
    setEditing(row);
    setSession((n) => n + 1);
    setOpen(true);
  };
  return (
    <>
      <PageHeader
        title="Announcements"
        description="Maintenance windows, new features or incidents, shown as a banner in the customer app."
        actions={
          <Button onClick={() => edit(null)}>
            <Plus /> New announcement
          </Button>
        }
      />
      {isPending ? (
        <Skeleton className="h-48" />
      ) : !data?.length ? (
        <EmptyState icon={<Megaphone />} title="No announcements" description="Create one to show a banner to all customers." />
      ) : (
        <Card className="overflow-x-auto">
          <Table>
            <THead>
              <TR>
                <TH>Announcement</TH>
                <TH>Level</TH>
                <TH>Window</TH>
                <TH>Status</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {data.map((a) => (
                <TR key={a.id}>
                  <TD className="max-w-md">
                    <div className="font-medium">{a.title}</div>
                    {a.body && <div className="truncate text-xs text-muted">{a.body}</div>}
                  </TD>
                  <TD>
                    <Badge tone={LEVEL_TONE[a.level as keyof typeof LEVEL_TONE]}>{a.level}</Badge>
                  </TD>
                  <TD className="whitespace-nowrap text-xs text-muted">
                    <CalendarClock className="mr-1 inline size-3.5" aria-hidden />
                    {a.starts_at ? formatDateTime(a.starts_at) : 'Now'} → {a.ends_at ? formatDateTime(a.ends_at) : 'until turned off'}
                  </TD>
                  <TD>{a.active ? <Badge tone="success">Active</Badge> : <Badge>Off</Badge>}</TD>
                  <TD className="whitespace-nowrap text-right">
                    <Button variant="ghost" size="icon-sm" aria-label={`Edit ${a.title}`} onClick={() => edit(a)}>
                      <Pencil />
                    </Button>
                    <Button variant="ghost" size="icon-sm" aria-label={`Delete ${a.title}`} onClick={() => del.mutate(a.id)}>
                      <Trash2 />
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
      <AnnouncementDialog key={session} row={editing} open={open} onOpenChange={setOpen} />
    </>
  );
}

// ---- feature flags ------------------------------------------------------------------------------
function FlagRow({ flag }: { flag: FeatureFlag }) {
  const save = useSaveFlag();
  const del = useDeleteFlag();
  const [orgs, setOrgs] = React.useState(flag.org_ids.join(', '));
  const commit = (enabled: boolean, orgText = orgs) =>
    save.mutate({
      key: flag.key,
      description: flag.description,
      enabled,
      org_ids: orgText
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    });
  return (
    <TR>
      <TD>
        <div className="font-mono text-sm">{flag.key}</div>
        <div className="text-xs text-muted">{flag.description}</div>
      </TD>
      <TD>
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4 accent-brand"
            checked={flag.enabled}
            aria-label={`${flag.enabled ? 'Disable' : 'Enable'} ${flag.key}`}
            onChange={(e) => commit(e.target.checked)}
          />
          {flag.enabled ? 'On' : 'Off'}
        </label>
      </TD>
      <TD className="min-w-64">
        <Input
          aria-label={`Organizations for ${flag.key}`}
          placeholder="All organizations"
          className="font-mono text-xs"
          value={orgs}
          onChange={(e) => setOrgs(e.target.value)}
          onBlur={() => orgs !== flag.org_ids.join(', ') && commit(flag.enabled)}
        />
      </TD>
      <TD className="text-right">
        <Button variant="ghost" size="icon-sm" aria-label={`Delete ${flag.key}`} onClick={() => del.mutate(flag.key)}>
          <Trash2 />
        </Button>
      </TD>
    </TR>
  );
}

export function FeatureFlagsPage() {
  const { data, isPending } = useFlagsAdmin();
  const save = useSaveFlag();
  const [key, setKey] = React.useState('');
  const [description, setDescription] = React.useState('');
  return (
    <>
      <PageHeader title="Feature flags" description="Turn features on or off for everyone, or only for listed organization IDs." />
      <Card className="mb-6">
        <CardContent className="pt-5">
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate(
                { key, description, enabled: false, org_ids: [] },
                {
                  onSuccess: () => {
                    setKey('');
                    setDescription('');
                  },
                },
              );
            }}
          >
            <Field label="Key" htmlFor="ff-key" className="sm:w-56">
              <Input id="ff-key" required pattern="[a-z][a-z0-9_]{1,59}" placeholder="new_feature" className="font-mono" value={key} onChange={(e) => setKey(e.target.value)} />
            </Field>
            <Field label="Description" htmlFor="ff-desc" className="flex-1">
              <Input id="ff-desc" maxLength={300} value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>
            <Button type="submit" loading={save.isPending}>
              <Plus /> Add flag
            </Button>
          </form>
        </CardContent>
      </Card>
      {isPending ? (
        <Skeleton className="h-40" />
      ) : !data?.length ? (
        <EmptyState icon={<Flag />} title="No feature flags" />
      ) : (
        <Card className="overflow-x-auto">
          <Table>
            <THead>
              <TR>
                <TH>Flag</TH>
                <TH>Enabled</TH>
                <TH>Only for organizations</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {data.map((f) => (
                <FlagRow key={`${f.key}-${f.updated_at}`} flag={f} />
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </>
  );
}

// ---- email templates ----------------------------------------------------------------------------
function TemplateEditor({ tpl }: { tpl: EmailTemplate }) {
  const save = useSaveTemplate();
  const [subject, setSubject] = React.useState(tpl.subject ?? '');
  const [intro, setIntro] = React.useState(tpl.intro ?? '');
  const [preview, setPreview] = React.useState<{ subject: string; html: string } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const body = { subject: subject || null, intro: intro || null };
  return (
    <div className="space-y-3">
      <Field label="Subject" htmlFor={`sub-${tpl.key}`}>
        <Input id={`sub-${tpl.key}`} maxLength={200} placeholder={tpl.default_subject.replace(/^\[KloudRecon\] /, '')} value={subject} onChange={(e) => setSubject(e.target.value)} />
      </Field>
      <Field label="Intro paragraph (plain text)" htmlFor={`intro-${tpl.key}`}>
        <Textarea id={`intro-${tpl.key}`} maxLength={1000} placeholder="Optional text shown above the standard content." value={intro} onChange={(e) => setIntro(e.target.value)} />
      </Field>
      <p className="text-xs text-muted">Placeholders: {tpl.placeholders.join(', ')}. HTML is not allowed; leave both empty to use the default.</p>
      {error && <p className="text-sm text-critical-strong">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" loading={save.isPending} onClick={() => save.mutate({ key: tpl.key, body })}>
          Save
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            setError(null);
            previewTemplate(tpl.key, body).then(setPreview, (e: unknown) => setError(errorMessage(e)));
          }}
        >
          Preview
        </Button>
      </div>
      {preview && (
        <div className="overflow-hidden rounded-md border border-border">
          <div className="border-b border-border bg-surface-2 px-3 py-2 text-xs">
            <span className="text-muted">Subject:</span> {preview.subject}
          </div>
          <iframe title={`Preview of ${tpl.label}`} sandbox="" srcDoc={preview.html} className="h-96 w-full bg-surface" />
        </div>
      )}
    </div>
  );
}

export function EmailTemplatesPage() {
  const { data, isPending } = useEmailTemplates();
  const [selected, setSelected] = React.useState<string | null>(null);
  const tpl = data?.find((t) => t.key === selected) ?? data?.[0];
  return (
    <>
      <PageHeader title="Email templates" description="Adjust the subject and add an intro to the built-in emails. Layout and data stay consistent." />
      {isPending || !data ? (
        <Skeleton className="h-96" />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <Card className="h-fit overflow-hidden">
            <nav aria-label="Email templates" className="divide-y divide-border">
              {data.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  aria-current={t.key === tpl?.key ? 'true' : undefined}
                  onClick={() => setSelected(t.key)}
                  className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm hover:bg-surface-2 aria-[current=true]:bg-brand-soft aria-[current=true]:text-brand-strong"
                >
                  {t.label}
                  {(t.subject || t.intro) && <Badge tone="brand">Edited</Badge>}
                </button>
              ))}
            </nav>
          </Card>
          {tpl && (
            <Card>
              <CardHeader>
                <CardTitle>{tpl.label}</CardTitle>
                <CardDescription>
                  Default subject: {tpl.default_subject}
                  {tpl.updated_at ? ` · edited ${formatDateTime(tpl.updated_at)}` : ''}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <TemplateEditor key={tpl.key} tpl={tpl} />
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </>
  );
}

// ---- retirement catalog -------------------------------------------------------------------------
const EMPTY_RETIREMENT: RetirementIn = {
  key: '',
  service: '',
  resource_type: '',
  match: {},
  retirement_date: new Date().toISOString().slice(0, 10),
  source_url: '',
  hint: '',
  verified: false,
};

function RetirementDialog({ row, open, onOpenChange }: { row: Retirement | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const save = useSaveRetirement();
  const [form, setForm] = React.useState<RetirementIn>(() => (row ? { ...row } : EMPTY_RETIREMENT));
  const [match, setMatch] = React.useState(() => JSON.stringify(row?.match ?? {}, null, 2));
  const [error, setError] = React.useState<string | null>(null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{row ? 'Edit retirement' : 'New retirement'}</DialogTitle>
          <DialogDescription>Matched against every customer inventory on the next scan.</DialogDescription>
        </DialogHeader>
        <form
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            let parsed: Record<string, unknown>;
            try {
              parsed = JSON.parse(match || '{}') as Record<string, unknown>;
            } catch {
              setError('Match must be a JSON object, e.g. {"sku": "Basic"}.');
              return;
            }
            save.mutate({ id: row?.id, body: { ...form, match: parsed } }, { onSuccess: () => onOpenChange(false) });
          }}
        >
          <Field label="Key" htmlFor="rt-key">
            <Input id="rt-key" required pattern="[a-z0-9][a-z0-9-]{1,78}" className="font-mono" value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} />
          </Field>
          <Field label="Retirement date" htmlFor="rt-date">
            <Input id="rt-date" type="date" required value={form.retirement_date} onChange={(e) => setForm({ ...form, retirement_date: e.target.value })} />
          </Field>
          <Field label="Service" htmlFor="rt-service">
            <Input id="rt-service" required value={form.service} onChange={(e) => setForm({ ...form, service: e.target.value })} />
          </Field>
          <Field label="Resource type" htmlFor="rt-type">
            <Input id="rt-type" required className="font-mono text-xs" placeholder="microsoft.network/publicipaddresses" value={form.resource_type} onChange={(e) => setForm({ ...form, resource_type: e.target.value })} />
          </Field>
          <Field label="Match (JSON)" htmlFor="rt-match" className="sm:col-span-2">
            <Textarea id="rt-match" className="font-mono text-xs" value={match} onChange={(e) => setMatch(e.target.value)} />
          </Field>
          <Field label="Source URL" htmlFor="rt-src" className="sm:col-span-2">
            <Input id="rt-src" type="url" value={form.source_url} onChange={(e) => setForm({ ...form, source_url: e.target.value })} />
          </Field>
          <Field label="Migration hint" htmlFor="rt-hint" className="sm:col-span-2">
            <Textarea id="rt-hint" value={form.hint} onChange={(e) => setForm({ ...form, hint: e.target.value })} />
          </Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" className="size-4 accent-brand" checked={form.verified} onChange={(e) => setForm({ ...form, verified: e.target.checked })} />
            Date verified against the official announcement
          </label>
          {error && <p className="text-sm text-critical-strong sm:col-span-2">{error}</p>}
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RetirementsPage() {
  const { data, isPending } = useRetirementsAdmin();
  const del = useDeleteRetirement();
  const [editing, setEditing] = React.useState<Retirement | null>(null);
  const [open, setOpen] = React.useState(false);
  const [session, setSession] = React.useState(0);
  const edit = (row: Retirement | null) => {
    setEditing(row);
    setSession((n) => n + 1);
    setOpen(true);
  };
  return (
    <>
      <PageHeader
        title="Retirement catalog"
        description="Service and SKU retirements matched against customer inventories. Unverified dates show a “verify” label."
        actions={
          <Button onClick={() => edit(null)}>
            <Plus /> New entry
          </Button>
        }
      />
      {isPending ? (
        <Skeleton className="h-64" />
      ) : (
        <Card className="overflow-x-auto">
          <Table>
            <THead>
              <TR>
                <TH>Service</TH>
                <TH>Resource type</TH>
                <TH>Retires</TH>
                <TH>Status</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {(data ?? []).map((r) => (
                <TR key={r.id}>
                  <TD className="max-w-sm">
                    <div className="font-medium">{r.service}</div>
                    <div className="truncate text-xs text-muted">{r.hint}</div>
                  </TD>
                  <TD className="font-mono text-xs">{r.resource_type}</TD>
                  <TD className="whitespace-nowrap tabular">{formatDate(r.retirement_date)}</TD>
                  <TD>{r.verified ? <Badge tone="success">Verified</Badge> : <Badge tone="warning">Verify</Badge>}</TD>
                  <TD className="whitespace-nowrap text-right">
                    <Button variant="ghost" size="icon-sm" aria-label={`Edit ${r.key}`} onClick={() => edit(r)}>
                      <Pencil />
                    </Button>
                    <Button variant="ghost" size="icon-sm" aria-label={`Delete ${r.key}`} onClick={() => del.mutate(r.id)}>
                      <Trash2 />
                    </Button>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
      <RetirementDialog key={session} row={editing} open={open} onOpenChange={setOpen} />
    </>
  );
}
