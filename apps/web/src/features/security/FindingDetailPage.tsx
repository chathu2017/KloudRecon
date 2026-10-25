import { ArrowLeft, BookOpen, ExternalLink, FileCode2, Route, Send, ShieldCheck, TerminalSquare } from 'lucide-react';
import * as React from 'react';
import { Link, useParams } from 'react-router-dom';
import { CodeBlock } from '@/components/CopyButton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, EmptyState, Skeleton } from '@/components/ui/misc';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { hasRole } from '@/components/layout/nav';
import { RemediationPanel } from '@/features/ai/panels';
import { ResourceDrawer } from '@/features/inventory/ResourceDrawer';
import { useResourceParam } from '@/features/inventory/useResourceParam';
import { typeInfo } from '@/features/inventory/types';
import { useMembers } from '@/features/team/api';
import { useMe } from '@/lib/auth/context';
import { formatDate, formatDateTime, formatMoney, str, timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  useAddComment,
  useDecideException,
  useFinding,
  useRequestException,
  useRevokeException,
  useUpdateFinding,
  type FindingDetail,
} from './api';
import { FindingStatusBadge, RiskScore, SeverityBadge } from './severity';
import { PILLAR_LABEL, SOURCE_LABEL } from './severity-meta';

const FACTOR_LABEL: Record<string, string> = {
  base: 'Base severity',
  internet_exposure: 'Reachable from the internet',
  attack_path: 'On an attack path',
  privileged_identity: 'Privileged identity involved',
  sensitive_data: 'Sensitive data',
  critical_cve: 'Critical CVE on the resource',
  production: 'Production',
  compensating_control: 'Private endpoint (compensating control)',
};

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 text-right">{children ?? '—'}</dd>
    </div>
  );
}

function EvidenceTable({ evidence }: { evidence: Record<string, unknown> }) {
  const entries = Object.entries(evidence);
  if (!entries.length) return <p className="text-sm text-muted">No evidence values.</p>;
  return (
    <dl className="divide-y divide-border rounded-md border border-border">
      {entries.map(([k, v]) => (
        <div key={k} className="grid grid-cols-1 gap-1 px-3 py-2 text-sm md:grid-cols-[minmax(12rem,auto)_1fr] md:gap-4">
          <dt className="break-words font-mono text-xs text-muted">{k}</dt>
          <dd className="min-w-0">
            {v === null || v === undefined ? (
              <span className="text-subtle">not set</span>
            ) : typeof v === 'object' ? (
              <pre className="max-h-64 overflow-auto rounded bg-surface-2 p-2 font-mono text-xs">{JSON.stringify(v, null, 2)}</pre>
            ) : (
              <span className="break-all font-mono text-xs">{str(v)}</span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Remediation({ finding }: { finding: FindingDetail }) {
  const rem = finding.remediation;
  if (!rem) {
    return (finding.steps ?? []).length ? (
      <Card>
        <CardHeader>
          <CardTitle>How to fix</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            {(finding.steps ?? []).map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </CardContent>
      </Card>
    ) : (
      <EmptyState title="No remediation steps" description="Open the source recommendation for guidance." />
    );
  }
  const formats = [
    { key: 'cli', label: 'Azure CLI', code: rem.cli },
    { key: 'powershell', label: 'PowerShell', code: rem.powershell },
    { key: 'bicep', label: 'Bicep', code: rem.bicep },
    { key: 'terraform', label: 'Terraform', code: rem.terraform },
  ].filter((f): f is { key: string; label: string; code: string } => !!f.code);
  const policy = rem.policy as { name?: string; effect?: string; note?: string | null; definition?: unknown; cli?: string | null };
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Fix in the Azure portal</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            {rem.portal.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TerminalSquare className="size-4 text-muted" aria-hidden /> Fix as code
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue={formats[0]?.key ?? 'cli'}>
            <TabsList>
              {formats.map((f) => (
                <TabsTrigger key={f.key} value={f.key}>
                  {f.label}
                </TabsTrigger>
              ))}
            </TabsList>
            {formats.map((f) => (
              <TabsContent key={f.key} value={f.key}>
                <CodeBlock code={f.code} />
              </TabsContent>
            ))}
          </Tabs>
          <p className="mt-2 text-xs text-muted">Review the commands before running them. KloudRecon only reads your environment and never changes it.</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileCode2 className="size-4 text-muted" aria-hidden /> Prevent it with Azure Policy
          </CardTitle>
          <p className="text-sm text-muted">
            {policy.name} · suggested effect <Badge tone="neutral">{policy.effect}</Badge>
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {policy.note && <p className="text-sm text-muted">{policy.note}</p>}
          {policy.definition ? (
            <>
              <CodeBlock code={JSON.stringify(policy.definition, null, 2)} maxHeight="max-h-96" />
              {policy.cli && <CodeBlock code={policy.cli} />}
            </>
          ) : (
            <p className="text-sm text-muted">This control is enforced outside Azure Policy (see the note above).</p>
          )}
        </CardContent>
      </Card>
      {rem.references.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="size-4 text-muted" aria-hidden /> Microsoft documentation
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm">
              {rem.references.map((r) => (
                <li key={r}>
                  <a href={r} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-strong hover:underline">
                    {r.replace('https://learn.microsoft.com/', '')} <ExternalLink className="size-3" />
                  </a>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Workflow({ finding, canEdit, isAdmin }: { finding: FindingDetail; canEdit: boolean; isAdmin: boolean }) {
  const update = useUpdateFinding(finding.id);
  const members = useMembers();
  const [dialog, setDialog] = React.useState(false);
  const accepted = finding.status === 'accepted_risk';
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Workflow</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="wf-status">Status</Label>
          <NativeSelect
            id="wf-status"
            value={accepted ? 'accepted_risk' : finding.status}
            disabled={!canEdit || accepted || update.isPending}
            onChange={(e) => update.mutate({ status: e.target.value as 'open' | 'in_progress' | 'resolved', clear_assignee: false })}
          >
            <option value="open">Open</option>
            <option value="in_progress">In progress</option>
            <option value="resolved">Resolved (confirmed by next scan)</option>
            {accepted && <option value="accepted_risk">Accepted risk</option>}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wf-assignee">Assignee</Label>
          <NativeSelect
            id="wf-assignee"
            value={finding.assignee_id ?? ''}
            disabled={!canEdit || update.isPending}
            onChange={(e) =>
              e.target.value
                ? update.mutate({ assignee_id: e.target.value, clear_assignee: false })
                : update.mutate({ clear_assignee: true })
            }
          >
            <option value="">Unassigned</option>
            {(members.data ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name || m.email}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wf-due">Due date</Label>
          <Input
            id="wf-due"
            type="date"
            disabled={!canEdit || update.isPending}
            value={finding.due_at ? finding.due_at.slice(0, 10) : ''}
            onChange={(e) => e.target.value && update.mutate({ due_at: new Date(`${e.target.value}T12:00:00Z`).toISOString(), clear_assignee: false })}
          />
          <p className={cn('text-xs', finding.overdue ? 'text-critical-strong' : 'text-muted')}>
            {finding.overdue ? 'Overdue. ' : ''}
            {finding.sla_days ? `SLA for ${finding.severity}: ${finding.sla_days} days.` : 'No SLA for this severity.'}
          </p>
        </div>
        {canEdit && !accepted && finding.status !== 'resolved' && (
          <Button variant="secondary" className="w-full" onClick={() => setDialog(true)}>
            <ShieldCheck /> {isAdmin ? 'Accept risk (exception)' : 'Request exception'}
          </Button>
        )}
      </CardContent>
      <ExceptionDialog open={dialog} onOpenChange={setDialog} findingId={finding.id} isAdmin={isAdmin} />
    </Card>
  );
}

function ExceptionDialog({ open, onOpenChange, findingId, isAdmin }: { open: boolean; onOpenChange: (v: boolean) => void; findingId: string; isAdmin: boolean }) {
  const request = useRequestException(findingId);
  const [reason, setReason] = React.useState('');
  const [days, setDays] = React.useState('90');
  const [scope, setScope] = React.useState<'resource' | 'rule'>('resource');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isAdmin ? 'Accept this risk' : 'Request an exception'}</DialogTitle>
          <DialogDescription>
            {isAdmin
              ? 'As an administrator your exception is approved immediately and recorded in the audit log.'
              : 'An administrator approves or rejects the request. Until then the finding stays open.'}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const expires = new Date(Date.now() + Number(days) * 86400000).toISOString();
            request.mutate(
              { reason, expires_at: expires, scope },
              {
                onSuccess: () => {
                  onOpenChange(false);
                  setReason('');
                },
              },
            );
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="exc-reason">Reason (required)</Label>
            <Textarea id="exc-reason" value={reason} onChange={(e) => setReason(e.target.value)} minLength={10} required placeholder="Why is this acceptable, and what compensates for it?" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="exc-days">Expires in</Label>
              <NativeSelect id="exc-days" value={days} onChange={(e) => setDays(e.target.value)}>
                <option value="30">30 days</option>
                <option value="90">90 days</option>
                <option value="180">180 days</option>
                <option value="365">1 year</option>
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exc-scope">Applies to</Label>
              <NativeSelect id="exc-scope" value={scope} onChange={(e) => setScope(e.target.value as 'resource' | 'rule')}>
                <option value="resource">This resource</option>
                <option value="rule">All resources of this rule</option>
              </NativeSelect>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={request.isPending} disabled={reason.trim().length < 10}>
              {isAdmin ? 'Accept risk' : 'Send request'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Exceptions({ finding, isAdmin }: { finding: FindingDetail; isAdmin: boolean }) {
  const decide = useDecideException();
  const revoke = useRevokeException();
  if (!finding.exceptions.length) return null;
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Exceptions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {finding.exceptions.map((e) => (
          <div key={e.id} className="rounded-md border border-border p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <FindingStatusBadge status={e.status} />
              <span className="text-xs text-muted">until {formatDate(e.expires_at)}</span>
            </div>
            <p className="mt-2">{e.reason}</p>
            <p className="mt-1 text-xs text-muted">
              {e.arm_id ? 'This resource' : 'All resources of this rule'} · requested by {e.requested_by_name ?? 'someone'}
              {e.approved_by_name ? ` · decided by ${e.approved_by_name}` : ''}
            </p>
            {isAdmin && e.status === 'pending' && (
              <div className="mt-2 flex gap-2">
                <Button size="sm" loading={decide.isPending} onClick={() => decide.mutate({ id: e.id, decision: 'approve' })}>
                  Approve
                </Button>
                <Button size="sm" variant="secondary" loading={decide.isPending} onClick={() => decide.mutate({ id: e.id, decision: 'reject' })}>
                  Reject
                </Button>
              </div>
            )}
            {isAdmin && e.status === 'approved' && (
              <Button size="sm" variant="ghost" className="mt-1 px-0" loading={revoke.isPending} onClick={() => revoke.mutate(e.id)}>
                Revoke exception
              </Button>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function Activity({ finding, canEdit }: { finding: FindingDetail; canEdit: boolean }) {
  const add = useAddComment(finding.id);
  const [body, setBody] = React.useState('');
  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {canEdit && (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (body.trim()) add.mutate(body.trim(), { onSuccess: () => setBody('') });
            }}
          >
            <Input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a comment…" aria-label="Comment" maxLength={4000} />
            <Button type="submit" loading={add.isPending} disabled={!body.trim()}>
              <Send /> Post
            </Button>
          </form>
        )}
        {finding.comments.length === 0 ? (
          <p className="text-sm text-muted">No activity yet.</p>
        ) : (
          <ol className="space-y-3">
            {[...finding.comments].reverse().map((c) => (
              <li key={c.id} className="flex gap-3">
                <Avatar name={c.user_name ?? 'KloudRecon'} className="size-7" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-muted">
                    <span className="font-medium text-text">{c.user_name ?? 'KloudRecon'}</span> · {timeAgo(c.created_at)}
                  </div>
                  <p className={cn('text-sm', c.kind !== 'comment' && 'text-muted')}>{c.body}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

export function FindingDetailPage() {
  const { findingId } = useParams();
  const { data: f, isPending, isError } = useFinding(findingId);
  const { data: me } = useMe();
  const [, openResource] = useResourceParam();
  const canEdit = hasRole(me?.user?.org_role, 'member');
  const isAdmin = hasRole(me?.user?.org_role, 'admin');
  if (isPending) return <Skeleton className="h-[32rem]" />;
  if (isError) {
    return <EmptyState tone="error" title="Finding not found" description="It may belong to another organization or was removed." action={<Button asChild variant="secondary"><Link to="/app/security/findings">Back to findings</Link></Button>} />;
  }
  const info = typeInfo(f.resource_type ?? '');
  const Icon = info.icon;
  const factors = Object.entries(f.risk_factors).filter(([, v]) => typeof v === 'number') as [string, number][];
  return (
    <>
      <Link to="/app/security/findings" className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-text">
        <ArrowLeft className="size-4" /> Findings
      </Link>
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={f.severity} />
            <FindingStatusBadge status={f.status} />
            <Badge tone="neutral">{SOURCE_LABEL[f.source] ?? f.source}</Badge>
            <Badge tone="neutral">{PILLAR_LABEL[f.pillar] ?? f.pillar}</Badge>
          </div>
          <h1 className="mt-2 text-2xl font-semibold">{f.title}</h1>
          <button type="button" onClick={() => f.arm_id.startsWith('/subscriptions/') && openResource(f.arm_id)} className="mt-1 inline-flex items-center gap-2 text-sm text-muted hover:text-brand-strong">
            <Icon className="size-4" aria-hidden /> {f.resource_name}
            <span className="text-subtle">· {f.resource_group ?? info.label}</span>
          </button>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-xs text-muted">Risk score</div>
            <RiskScore score={f.risk_score} />
          </div>
          {f.portal_url && (
            <Button asChild variant="secondary" size="sm">
              <a href={f.portal_url} target="_blank" rel="noreferrer">
                Azure portal <ExternalLink />
              </a>
            </Button>
          )}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_20rem]">
        <div className="min-w-0">
          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="remediation">Remediation</TabsTrigger>
              <TabsTrigger value="activity">Activity ({f.comments.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="overview" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>What we found</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <p>{f.rule?.description ?? f.title}</p>
                  {f.rule?.impact && (
                    <p>
                      <span className="font-medium">Impact: </span>
                      {f.rule.impact}
                    </p>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Evidence</CardTitle>
                  <p className="text-sm text-muted">Configuration values observed in the latest scan.</p>
                </CardHeader>
                <CardContent>
                  <EvidenceTable evidence={f.evidence} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Why this risk score</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="divide-y divide-border text-sm">
                    {factors.map(([k, v]) => (
                      <li key={k} className="flex justify-between py-1.5">
                        <span>{FACTOR_LABEL[k] ?? k}</span>
                        <span className={cn('tabular font-medium', v < 0 ? 'text-success-strong' : k === 'base' ? '' : 'text-high-strong')}>
                          {k === 'base' ? v : v > 0 ? `+${v}` : v}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
              {f.attack_paths.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Route className="size-4 text-critical-strong" aria-hidden /> On attack paths
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-1 text-sm">
                      {f.attack_paths.map((p) => (
                        <li key={String(p.id)}>
                          <Link to={`/app/security/attack-paths?path=${String(p.id)}`} className="text-brand-strong hover:underline">
                            {String(p.title)}
                          </Link>{' '}
                          <span className="text-muted">· score {String(p.score)}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}
              {f.rule && f.rule.frameworks.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Mapped to frameworks</CardTitle>
                    <p className="text-sm text-muted">Control IDs this check is mapped to. Mapping helps you prepare; it is not a certification.</p>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {f.rule.frameworks.map((fw) => (
                      <div key={fw.framework} className="flex flex-wrap items-center gap-1.5 text-sm">
                        <span className="w-44 shrink-0 text-muted">{fw.name}</span>
                        {fw.controls.map((c) => (
                          <Link key={c.id} to={fw.framework === 'waf' ? '/app/reliability' : `/app/security/compliance/${fw.framework}?control=${encodeURIComponent(c.id ?? '')}`} title={c.title}>
                            <Badge tone="neutral" className="font-mono hover:border-brand">
                              {c.id}
                            </Badge>
                          </Link>
                        ))}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </TabsContent>
            <TabsContent value="remediation">
              <div className="space-y-4">
                <Remediation finding={f} />
                <RemediationPanel findingId={f.id} />
              </div>
            </TabsContent>
            <TabsContent value="activity">
              <Activity finding={f} canEdit={canEdit} />
            </TabsContent>
          </Tabs>
        </div>
        <div className="space-y-4">
          <Workflow finding={f} canEdit={canEdit} isAdmin={isAdmin} />
          <Exceptions finding={f} isAdmin={isAdmin} />
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="divide-y divide-border">
                <Fact label="First seen">{formatDateTime(f.first_seen)}</Fact>
                <Fact label="Last seen">{formatDateTime(f.last_seen)}</Fact>
                {f.resolved_at && <Fact label="Resolved">{formatDateTime(f.resolved_at)}</Fact>}
                <Fact label="Rule">
                  <span className="font-mono text-xs">{f.rule_id}</span>
                </Fact>
                <Fact label="Category">{f.category}</Fact>
                {f.est_monthly_savings && <Fact label="Est. savings">${Number(f.est_monthly_savings).toLocaleString()}/month</Fact>}
                {f.resource_monthly_cost ? (
                  <Fact label="Cost at risk">
                    {formatMoney(f.resource_monthly_cost)}/month
                    <span className="block text-xs text-muted">The affected resource's last 30 days (amortized).</span>
                  </Fact>
                ) : null}
                {f.effort && <Fact label="Effort">{f.effort}</Fact>}
                {f.reopened_count > 0 && <Fact label="Reopened">{f.reopened_count}×</Fact>}
              </dl>
            </CardContent>
          </Card>
          {f.history.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle>Scan history</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="space-y-1 text-sm">
                  {f.history.slice(0, 8).map((h) => (
                    <li key={h.scan_id} className="flex items-center justify-between">
                      <span className="text-muted">
                        Scan #{h.sequence} · {formatDate(h.started_at)}
                      </span>
                      <span className="tabular">{h.risk_score}</span>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
      <ResourceDrawer />
    </>
  );
}
