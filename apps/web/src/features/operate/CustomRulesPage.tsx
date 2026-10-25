import { CheckCircle2, Code2, Lock, Pencil, Play, Plus, Trash2, XCircle } from 'lucide-react';
import * as React from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmptyState, PageHeader, Skeleton } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { hasRole } from '@/components/layout/nav';
import { SeverityBadge } from '@/features/security/severity';
import { ApiError } from '@/lib/api/client';
import { useMe } from '@/lib/auth/context';
import { formatDateTime } from '@/lib/format';
import { useCustomRules, useDeleteCustomRule, useSaveCustomRule, useValidateKql, type CustomRule, type CustomRuleIn } from './api';

const EXAMPLE = `resources
| where type =~ 'microsoft.storage/storageaccounts'
| where tags['env'] =~ 'dev' and tobool(properties.allowBlobPublicAccess)
| project id, name`;

function RuleDialog({ rule, open, onOpenChange }: { rule: CustomRule | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const save = useSaveCustomRule();
  const validate = useValidateKql();
  const [form, setForm] = React.useState<CustomRuleIn>(() =>
    rule
      ? { name: rule.name, description: rule.description, kql: rule.kql, severity: rule.severity as CustomRuleIn['severity'], pillar: rule.pillar as CustomRuleIn['pillar'], category: rule.category, frameworks: rule.frameworks as Record<string, string[]>, remediation: rule.remediation, enabled: rule.enabled }
      : { name: '', description: '', kql: EXAMPLE, severity: 'medium', pillar: 'security', category: 'Custom', frameworks: {}, remediation: '', enabled: true },
  );
  const result = validate.data;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{rule ? 'Edit custom rule' : 'New custom rule'}</DialogTitle>
          <DialogDescription>An Azure Resource Graph query that returns the id of every failing resource.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate({ id: rule?.id, body: form }, { onSuccess: () => onOpenChange(false) });
          }}
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_9rem_10rem]">
            <div className="space-y-1.5">
              <Label htmlFor="cr-name">Name</Label>
              <Input id="cr-name" required minLength={3} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cr-sev">Severity</Label>
              <NativeSelect id="cr-sev" value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value as CustomRuleIn['severity'] })}>
                {['critical', 'high', 'medium', 'low', 'info'].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cr-pillar">Pillar</Label>
              <NativeSelect id="cr-pillar" value={form.pillar} onChange={(e) => setForm({ ...form, pillar: e.target.value as CustomRuleIn['pillar'] })}>
                {['security', 'reliability', 'cost', 'operations', 'performance', 'governance'].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cr-kql">KQL query</Label>
            <Textarea id="cr-kql" className="min-h-36 font-mono text-xs" spellCheck={false} value={form.kql} onChange={(e) => setForm({ ...form, kql: e.target.value })} />
            <p className="text-xs text-muted">Supported: where (and/or/not, ==, =~, !=, contains, has, startswith, in~ …), project, limit and functions such as tobool, tostring, isnull, isnotempty.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" size="sm" loading={validate.isPending} onClick={() => validate.mutate(form.kql)}>
              <Play /> Validate and preview
            </Button>
            {result &&
              (result.valid ? (
                <span className="inline-flex items-center gap-1 text-sm text-success-strong">
                  <CheckCircle2 className="size-4" /> {result.count} matching resource(s) ({result.ran_on === 'azure' ? 'Azure Resource Graph' : 'latest scan'})
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-sm text-critical-strong">
                  <XCircle className="size-4" /> {result.error}
                </span>
              ))}
          </div>
          {result?.valid && result.sample.length > 0 && (
            <ul className="max-h-32 overflow-auto rounded-md border border-border p-2 font-mono text-xs text-muted">
              {result.sample.map((r, i) => (
                <li key={i} className="truncate">
                  {String(r.name ?? r.id)}
                </li>
              ))}
            </ul>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="cr-rem">How to fix (shown on findings)</Label>
            <Textarea id="cr-rem" value={form.remediation} onChange={(e) => setForm({ ...form, remediation: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} /> Run on every scan
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

export function CustomRulesPage() {
  const { data, isPending, error } = useCustomRules();
  const { data: me } = useMe();
  const isAdmin = hasRole(me?.user?.org_role, 'admin');
  const del = useDeleteCustomRule();
  const [editing, setEditing] = React.useState<CustomRule | null>(null);
  const [open, setOpen] = React.useState(false);
  // Each opening mounts a fresh dialog so the form starts from the chosen rule.
  const [session, setSession] = React.useState(0);
  const lacksPlan = error instanceof ApiError && error.code === 'plan_feature';
  return (
    <>
      <PageHeader
        title="Custom rules"
        description="Your own checks as Azure Resource Graph KQL. They run on every scan and create findings like built-in rules."
        actions={
          isAdmin && (
            <Button
              onClick={() => {
                setEditing(null);
                setSession((n) => n + 1);
                setOpen(true);
              }}
            >
              <Plus /> New rule
            </Button>
          )
        }
      />
      {isPending ? (
        <Skeleton className="h-64" />
      ) : lacksPlan ? (
        <EmptyState icon={<Lock />} title="Available on Pro and Enterprise" description="Upgrade your plan to write your own KQL checks." />
      ) : !data?.length ? (
        <EmptyState icon={<Code2 />} title="No custom rules yet" description="Write a Resource Graph query that returns failing resources, validate it, and it runs on the next scan." />
      ) : (
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>Rule</TH>
                <TH>Severity</TH>
                <TH>Last run</TH>
                <TH>Status</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {data.map((r) => (
                <TR key={r.id}>
                  <TD className="max-w-md">
                    <Link to={`/app/security/findings?rule=custom:${r.id}&status=all`} className="font-medium hover:text-brand-strong">
                      {r.name}
                    </Link>
                    <div className="truncate font-mono text-xs text-muted">{r.kql.replace(/\s+/g, ' ')}</div>
                  </TD>
                  <TD>
                    <SeverityBadge severity={r.severity} />
                  </TD>
                  <TD className="text-muted">
                    {r.last_result_count !== null ? `${r.last_result_count} finding(s)` : 'Not run yet'}
                    <div className="text-xs">{r.last_validated_at ? formatDateTime(r.last_validated_at) : ''}</div>
                  </TD>
                  <TD>
                    {r.last_error ? (
                      <Badge tone="danger" title={r.last_error}>
                        Error
                      </Badge>
                    ) : r.enabled ? (
                      <Badge tone="success">Enabled</Badge>
                    ) : (
                      <Badge tone="neutral">Disabled</Badge>
                    )}
                  </TD>
                  <TD className="whitespace-nowrap text-right">
                    {isAdmin && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Edit ${r.name}`}
                          onClick={() => {
                            setEditing(r);
                            setSession((n) => n + 1);
                            setOpen(true);
                          }}
                        >
                          <Pencil />
                        </Button>
                        <Button variant="ghost" size="icon-sm" aria-label={`Delete ${r.name}`} onClick={() => del.mutate(r.id)}>
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
      <RuleDialog key={session} rule={editing} open={open} onOpenChange={setOpen} />
    </>
  );
}
