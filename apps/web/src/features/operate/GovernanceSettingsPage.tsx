import { Plus, Trash2 } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader, Skeleton } from '@/components/ui/misc';
import { hasRole } from '@/components/layout/nav';
import { useComplianceSettings, useFrameworks, useSaveComplianceSettings } from '@/features/compliance/api';
import { useMe } from '@/lib/auth/context';
import { useGovernanceSettings, useSaveGovernanceSettings, useSaveSecuritySettings, useSecuritySettings, type GovernanceSettings } from './api';

const list = (v: string) =>
  v
    .split(/[,\n]/)
    .map((x) => x.trim())
    .filter(Boolean);

function GovernanceForm({ initial, disabled }: { initial: GovernanceSettings; disabled: boolean }) {
  const save = useSaveGovernanceSettings();
  const [tags, setTags] = React.useState((initial.required_tags ?? []).join(', '));
  const [regions, setRegions] = React.useState((initial.allowed_regions ?? []).join(', '));
  const [skus, setSkus] = React.useState((initial.allowed_vm_skus ?? []).join(', '));
  const [naming, setNaming] = React.useState((initial.naming ?? []).map((n) => ({ resource_type: n.resource_type ?? '', pattern: n.pattern ?? '' })));
  const prod = (initial.production ?? {}) as { name_pattern?: string; tag_values?: string[] };
  const [prodPattern, setProdPattern] = React.useState(prod.name_pattern ?? '');
  const [prodValues, setProdValues] = React.useState((prod.tag_values ?? []).join(', '));
  return (
    <Card>
      <CardHeader>
        <CardTitle>Governance rules</CardTitle>
        <CardDescription>Used by the governance checks and by production detection. Changes apply from the next scan.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="g-tags">Required tags</Label>
            <Input id="g-tags" value={tags} onChange={(e) => setTags(e.target.value)} disabled={disabled} placeholder="env, owner, costCenter" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="g-regions">Allowed regions (empty = any)</Label>
            <Input id="g-regions" value={regions} onChange={(e) => setRegions(e.target.value)} disabled={disabled} placeholder="eastus, westeurope" />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="g-skus">Allowed VM sizes (empty = any)</Label>
            <Input id="g-skus" value={skus} onChange={(e) => setSkus(e.target.value)} disabled={disabled} placeholder="Standard_D2s_v5, Standard_D4s_v5" />
          </div>
        </div>
        <div>
          <Label>Naming conventions (regular expressions)</Label>
          <div className="mt-1.5 space-y-2">
            {naming.map((n, i) => (
              <div key={i} className="flex gap-2">
                <Input aria-label="Resource type" value={n.resource_type} disabled={disabled} placeholder="microsoft.storage/storageaccounts" onChange={(e) => setNaming(naming.map((x, j) => (j === i ? { ...x, resource_type: e.target.value } : x)))} />
                <Input aria-label="Pattern" className="font-mono" value={n.pattern} disabled={disabled} placeholder="^st[a-z0-9]+$" onChange={(e) => setNaming(naming.map((x, j) => (j === i ? { ...x, pattern: e.target.value } : x)))} />
                <Button variant="ghost" size="icon" aria-label="Remove rule" disabled={disabled} onClick={() => setNaming(naming.filter((_, j) => j !== i))}>
                  <Trash2 />
                </Button>
              </div>
            ))}
            <Button variant="secondary" size="sm" disabled={disabled} onClick={() => setNaming([...naming, { resource_type: '', pattern: '' }])}>
              <Plus /> Add naming rule
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="g-prodvals">Production tag values (env / environment)</Label>
            <Input id="g-prodvals" value={prodValues} onChange={(e) => setProdValues(e.target.value)} disabled={disabled} placeholder="prod, production" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="g-prodpat">Production resource group pattern</Label>
            <Input id="g-prodpat" className="font-mono" value={prodPattern} onChange={(e) => setProdPattern(e.target.value)} disabled={disabled} />
          </div>
        </div>
      </CardContent>
      <CardFooter className="justify-end">
        <Button
          loading={save.isPending}
          disabled={disabled}
          onClick={() =>
            save.mutate({
              required_tags: list(tags),
              allowed_regions: list(regions),
              allowed_vm_skus: list(skus),
              naming: naming.filter((n) => n.resource_type && n.pattern),
              production: { ...(initial.production ?? {}), name_pattern: prodPattern, tag_values: list(prodValues) },
            })
          }
        >
          Save governance rules
        </Button>
      </CardFooter>
    </Card>
  );
}

function SlaForm({ disabled }: { disabled: boolean }) {
  const { data } = useSecuritySettings();
  const save = useSaveSecuritySettings();
  const [edited, setSla] = React.useState<Record<string, string> | null>(null);
  const sla = edited ?? (data ? Object.fromEntries(Object.entries(data.sla_days).map(([k, v]) => [k, v === null ? '' : String(v)])) : {});
  return (
    <Card>
      <CardHeader>
        <CardTitle>Remediation SLA</CardTitle>
        <CardDescription>Days to fix a finding by severity. Sets the due date of new and reopened findings.</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {['critical', 'high', 'medium', 'low', 'info'].map((s) => (
          <div key={s} className="space-y-1.5">
            <Label htmlFor={`sla-${s}`} className="capitalize">
              {s}
            </Label>
            <Input id={`sla-${s}`} type="number" min={1} max={730} value={sla[s] ?? ''} placeholder="none" disabled={disabled} onChange={(e) => setSla({ ...sla, [s]: e.target.value })} />
          </div>
        ))}
      </CardContent>
      <CardFooter className="justify-end">
        <Button loading={save.isPending} disabled={disabled} onClick={() => save.mutate(Object.fromEntries(Object.entries(sla).map(([k, v]) => [k, v ? Number(v) : null])))}>
          Save SLA
        </Button>
      </CardFooter>
    </Card>
  );
}

function FrameworksForm({ disabled }: { disabled: boolean }) {
  const { data: settings } = useComplianceSettings();
  const { data: frameworks } = useFrameworks();
  const save = useSaveComplianceSettings();
  const [edited, setChosen] = React.useState<string[] | null>(null);
  const chosen = edited ?? settings?.frameworks ?? [];
  const limit = settings?.limit ?? null;
  return (
    <Card id="compliance">
      <CardHeader>
        <CardTitle>Compliance frameworks</CardTitle>
        <CardDescription>{limit === null ? 'Your plan includes every framework.' : `Your plan includes ${limit} framework(s).`}</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {(frameworks ?? []).map((f) => {
          const on = chosen.includes(f.key);
          const blocked = !on && limit !== null && chosen.length >= limit;
          return (
            <label key={f.key} className="flex items-center gap-3 rounded-md border border-border px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={on}
                disabled={disabled || blocked}
                onChange={(e) => setChosen(e.target.checked ? [...chosen, f.key] : chosen.filter((x) => x !== f.key))}
              />
              <span className="min-w-0 flex-1">
                <span className="font-medium">{f.short}</span> <span className="text-muted">· {f.name}</span>
              </span>
            </label>
          );
        })}
      </CardContent>
      <CardFooter className="justify-end">
        <Button loading={save.isPending} disabled={disabled || chosen.length === 0} onClick={() => save.mutate(chosen)}>
          Save frameworks
        </Button>
      </CardFooter>
    </Card>
  );
}

export function GovernanceSettingsPage() {
  const { data, isPending } = useGovernanceSettings();
  const { data: me } = useMe();
  const disabled = !hasRole(me?.user?.org_role, 'admin');
  return (
    <>
      <PageHeader title="Governance & security settings" description={disabled ? 'Only administrators can change these settings.' : 'Rules your scans check against, SLAs and frameworks.'} />
      {isPending || !data ? (
        <Skeleton className="h-96" />
      ) : (
        <div className="max-w-4xl space-y-4">
          <GovernanceForm initial={data} disabled={disabled} />
          <SlaForm disabled={disabled} />
          <FrameworksForm disabled={disabled} />
        </div>
      )}
    </>
  );
}
