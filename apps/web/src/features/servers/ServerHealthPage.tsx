import { HeartPulse, Plus, Server as ServerIcon, Trash2 } from 'lucide-react';
import * as React from 'react';
import { Link } from 'react-router-dom';
import { Meter } from '@/components/charts/charts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, NativeSelect } from '@/components/ui/input';
import { EmptyState, PageHeader, Skeleton } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { hasRole } from '@/components/layout/nav';
import { useMe } from '@/lib/auth/context';
import { timeAgo } from '@/lib/format';
import { useCreateServer, useDeleteServer, useOsOptions, useServers, type Platform, type Server } from './api';
import { STATUS_LABEL, STATUS_TONE } from './health';

const PLATFORM_LABEL: Record<Platform, string> = { windows: 'Windows servers', linux: 'Linux servers' };
const NAME_RULE = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,62}$/;

function AddServerDialog({ platform, onClose }: { platform: Platform; onClose: () => void }) {
  const create = useCreateServer();
  const { data: options } = useOsOptions();
  const families = options?.[platform] ?? [];
  const [name, setName] = React.useState('');
  const [family, setFamily] = React.useState('');
  const [version, setVersion] = React.useState('');
  const fam = families.find((f) => f.key === family) ?? families[0];
  const ver = fam?.versions.find((v) => v.key === version) ?? fam?.versions[0];
  const trimmed = name.trim();
  const valid = NAME_RULE.test(trimmed);
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a {platform === 'windows' ? 'Windows' : 'Linux'} server</DialogTitle>
          <DialogDescription>Give the server a name you will recognise. KloudRecon never connects to it: you run a read-only script on the server and paste the result here.</DialogDescription>
        </DialogHeader>
        <label className="text-sm font-medium">
          Server name
          <Input className="mt-1" autoFocus maxLength={63} placeholder={platform === 'windows' ? 'srv-app01' : 'web01'} value={name} onChange={(e) => setName(e.target.value)} aria-invalid={trimmed !== '' && !valid} />
          <span className="mt-1 block text-xs font-normal text-muted">Letters, numbers, spaces, dots, dashes and underscores.</span>
        </label>
        {platform === 'linux' && (
          <label className="text-sm font-medium">
            Distribution
            <NativeSelect
              className="mt-1"
              value={fam?.key ?? ''}
              onChange={(e) => {
                setFamily(e.target.value);
                setVersion('');
              }}
            >
              {families.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </NativeSelect>
          </label>
        )}
        <label className="text-sm font-medium">
          Version
          <NativeSelect className="mt-1" value={ver?.key ?? ''} onChange={(e) => setVersion(e.target.value)}>
            {(fam?.versions ?? []).map((v) => (
              <option key={v.key} value={v.key}>
                {v.label}
              </option>
            ))}
          </NativeSelect>
        </label>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={create.isPending}
            disabled={!valid || !fam || !ver}
            onClick={() => fam && ver && create.mutate({ name: trimmed, platform, os_family: fam.key, os_version: ver.key, notes: '' }, { onSuccess: onClose })}
          >
            Add server
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ServerTable({ servers, canEdit }: { servers: Server[]; canEdit: boolean }) {
  const del = useDeleteServer();
  const [confirm, setConfirm] = React.useState<Server | null>(null);
  return (
    <Card>
      <Table>
        <THead>
          <TR>
            <TH>Server</TH>
            <TH>Operating system</TH>
            <TH>Health</TH>
            <TH>Findings</TH>
            <TH>Last check</TH>
            <TH className="text-right">Actions</TH>
          </TR>
        </THead>
        <TBody>
          {servers.map((s) => (
            <TR key={s.id}>
              <TD>
                <Link to={`/app/server-health/${s.id}`} className="font-medium text-brand-strong hover:underline">
                  {s.name}
                </Link>
              </TD>
              <TD className="text-muted">{s.os_label}</TD>
              <TD className="w-52">
                {s.latest ? (
                  <div className="flex items-center gap-3">
                    <Badge tone={STATUS_TONE[s.latest.status]}>{STATUS_LABEL[s.latest.status]}</Badge>
                    <span className="w-8 text-right text-sm font-semibold tabular">{s.latest.score}</span>
                    <Meter value={s.latest.score} className="w-16" />
                  </div>
                ) : (
                  <Badge tone="neutral">Not checked yet</Badge>
                )}
              </TD>
              <TD className="text-sm tabular">
                {s.latest ? (
                  <>
                    {(s.latest.counts.critical ?? 0) > 0 && <span className="text-critical-strong">{s.latest.counts.critical} critical </span>}
                    {(s.latest.counts.high ?? 0) > 0 && <span className="text-high-strong">{s.latest.counts.high} high </span>}
                    <span className="text-muted">
                      {(s.latest.counts.medium ?? 0) + (s.latest.counts.low ?? 0)} other
                    </span>
                  </>
                ) : (
                  <span className="text-subtle">—</span>
                )}
              </TD>
              <TD className="text-sm text-muted">{s.latest ? timeAgo(s.latest.collected_at ?? s.latest.created_at) : 'Run the script to start'}</TD>
              <TD>
                <div className="flex justify-end gap-1">
                  <Button asChild size="sm" variant="secondary">
                    <Link to={`/app/server-health/${s.id}`}>{s.latest ? 'Open report' : 'Run check'}</Link>
                  </Button>
                  {canEdit && (
                    <Button size="icon-sm" variant="ghost" aria-label={`Remove ${s.name}`} onClick={() => setConfirm(s)}>
                      <Trash2 />
                    </Button>
                  )}
                </div>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
      {confirm && (
        <Dialog open onOpenChange={(v) => !v && setConfirm(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Remove {confirm.name}?</DialogTitle>
              <DialogDescription>The server and all its health checks are deleted from KloudRecon. Nothing changes on the server itself.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setConfirm(null)}>
                Cancel
              </Button>
              <Button variant="danger" loading={del.isPending} onClick={() => del.mutate(confirm.id, { onSuccess: () => setConfirm(null) })}>
                Remove server
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}

export function ServerHealthPage() {
  const { data: me } = useMe();
  const canEdit = hasRole(me?.user?.org_role, 'member');
  const { data, isPending } = useServers();
  const [tab, setTab] = React.useState<Platform>('windows');
  const [adding, setAdding] = React.useState<Platform | null>(null);
  const count = (p: Platform) => data?.filter((s) => s.platform === p).length ?? 0;
  return (
    <>
      <PageHeader
        title="Server health"
        description="Check the inside of a server: disks, memory, kernel, patches, vulnerabilities, errors and security settings. You run a read-only script on the server and paste its output here."
        actions={
          canEdit && (
            <Button onClick={() => setAdding(tab)}>
              <Plus aria-hidden /> Add {tab === 'windows' ? 'Windows' : 'Linux'} server
            </Button>
          )
        }
      />
      <Tabs value={tab} onValueChange={(v) => setTab(v as Platform)}>
        <TabsList>
          {(['windows', 'linux'] as const).map((p) => (
            <TabsTrigger key={p} value={p}>
              {PLATFORM_LABEL[p]}
              <span className="ml-1 text-xs font-medium tabular text-muted">{count(p)}</span>
            </TabsTrigger>
          ))}
        </TabsList>
        {(['windows', 'linux'] as const).map((p) => {
          const servers = data?.filter((s) => s.platform === p) ?? [];
          return (
            <TabsContent key={p} value={p}>
              {isPending ? (
                <Skeleton className="h-48" />
              ) : servers.length === 0 ? (
                <EmptyState
                  icon={p === 'windows' ? <ServerIcon /> : <HeartPulse />}
                  title={`No ${p === 'windows' ? 'Windows' : 'Linux'} servers yet`}
                  description={`Add a server by name, run the ${p === 'windows' ? 'PowerShell' : 'Bash'} script KloudRecon gives you on it, and paste the output to get its health report.`}
                  action={
                    canEdit && (
                      <Button onClick={() => setAdding(p)}>
                        <Plus aria-hidden /> Add {p === 'windows' ? 'Windows' : 'Linux'} server
                      </Button>
                    )
                  }
                />
              ) : (
                <ServerTable servers={servers} canEdit={canEdit} />
              )}
            </TabsContent>
          );
        })}
      </Tabs>
      {adding && <AddServerDialog platform={adding} onClose={() => setAdding(null)} />}
    </>
  );
}
