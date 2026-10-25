import { Check, Clock, Inbox, X } from 'lucide-react';
import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { EmptyState, PageHeader, Skeleton } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatDateTime, formatDuration, formatMoney } from '@/lib/format';
import { useNow } from '@/lib/hooks';
import {
  useApprove,
  useBulkDecision,
  usePlans,
  useRegistrations,
  useReject,
  type Registration,
} from './api';

const QUICK_REASONS = [
  'We could not verify the company.',
  'The use case is outside what KloudRecon supports.',
  'Duplicate registration.',
];

type Target = { ids: string[]; label: string };

function ApproveDialog({ target, onClose }: { target: Target | null; onClose: () => void }) {
  const plans = usePlans();
  const approve = useApprove();
  const bulk = useBulkDecision();
  const active = React.useMemo(() => plans.data?.filter((p) => p.active) ?? [], [plans.data]);
  const [planCode, setPlanCode] = React.useState('trial');
  const [trialDays, setTrialDays] = React.useState(14);

  const submit = async () => {
    if (!target) return;
    const days = Number.isFinite(trialDays) ? Math.min(Math.max(trialDays, 0), 365) : 0;
    if (target.ids.length === 1 && target.ids[0]) {
      await approve.mutateAsync({ orgId: target.ids[0], plan_code: planCode, trial_days: days });
    } else {
      await bulk.mutateAsync({
        kind: 'approve',
        org_ids: target.ids,
        plan_code: planCode,
        trial_days: days,
      });
    }
    onClose();
  };

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Approve {target?.label}</DialogTitle>
          <DialogDescription>
            The account becomes active and the customer gets a welcome email.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Plan" htmlFor="plan">
            <NativeSelect id="plan" value={planCode} onChange={(e) => setPlanCode(e.target.value)}>
              {active.map((p) => (
                <option key={p.id} value={p.code}>
                  {p.name} — {formatMoney(p.price_monthly, p.currency)}
                  {p.price_monthly !== null ? '/mo' : ''}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Trial days" htmlFor="trial" hint="0 = no trial end date">
            <Input
              id="trial"
              type="number"
              min={0}
              max={365}
              value={trialDays}
              onChange={(e) => setTrialDays(Number(e.target.value))}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={approve.isPending || bulk.isPending}>
            <Check /> Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RejectDialog({ target, onClose }: { target: Target | null; onClose: () => void }) {
  const reject = useReject();
  const bulk = useBulkDecision();
  const [reason, setReason] = React.useState('');
  const valid = reason.trim().length >= 3;

  const submit = async () => {
    if (!target || !valid) return;
    if (target.ids.length === 1 && target.ids[0]) {
      await reject.mutateAsync({ orgId: target.ids[0], reason: reason.trim() });
    } else {
      await bulk.mutateAsync({ kind: 'reject', org_ids: target.ids, reason: reason.trim() });
    }
    onClose();
  };

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject {target?.label}</DialogTitle>
          <DialogDescription>The customer receives an email with this reason.</DialogDescription>
        </DialogHeader>
        <Field label="Reason" htmlFor="reason">
          <Textarea
            id="reason"
            value={reason}
            maxLength={1000}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Explain briefly why the account is not approved."
          />
        </Field>
        <div className="flex flex-wrap gap-2">
          {QUICK_REASONS.map((r) => (
            <button
              key={r}
              type="button"
              className="rounded-full border border-border px-2.5 py-1 text-xs text-muted hover:border-border-strong hover:text-text"
              onClick={() => setReason(r)}
            >
              {r}
            </button>
          ))}
        </div>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={!valid}
            onClick={() => void submit()}
            loading={reject.isPending || bulk.isPending}
          >
            <X /> Reject
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({
  r,
  sinceFetch,
  selected,
  onSelect,
  onApprove,
  onReject,
  pending,
}: {
  r: Registration;
  /** Seconds elapsed since the list was fetched, so wait timers keep ticking. */
  sinceFetch: number;
  selected: boolean;
  onSelect: (checked: boolean) => void;
  onApprove: () => void;
  onReject: () => void;
  pending: boolean;
}) {
  const seconds = r.waiting_seconds + sinceFetch;
  return (
    <TR>
      {pending && (
        <TD className="w-10">
          <input
            type="checkbox"
            className="size-4 accent-brand"
            checked={selected}
            aria-label={`Select ${r.org.name}`}
            onChange={(e) => onSelect(e.target.checked)}
          />
        </TD>
      )}
      <TD>
        <div className="font-medium">{r.org.name}</div>
        <div className="text-xs text-muted">
          {[r.org.size && `${r.org.size} employees`, r.org.industry, r.org.country]
            .filter(Boolean)
            .join(' · ')}
        </div>
      </TD>
      <TD>
        <div className="text-sm">{r.owner?.name}</div>
        <div className="text-xs text-muted">
          {r.owner?.email}
          {r.owner?.job_title ? ` · ${r.owner.job_title}` : ''}
        </div>
      </TD>
      <TD className="max-w-sm">
        <p className="line-clamp-2 text-sm text-muted" title={r.use_case ?? ''}>
          {r.use_case ?? '—'}
        </p>
      </TD>
      <TD className="whitespace-nowrap">
        {pending ? (
          <Badge
            tone={seconds > 86_400 ? 'high' : 'warning'}
            title={formatDateTime(r.org.created_at)}
          >
            <Clock aria-hidden />
            {formatDuration(seconds)}
          </Badge>
        ) : (
          <span className="text-xs text-muted">{formatDateTime(r.org.created_at)}</span>
        )}
      </TD>
      {pending && (
        <TD className="whitespace-nowrap text-right">
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="secondary" onClick={onReject}>
              Reject
            </Button>
            <Button size="sm" onClick={onApprove}>
              Approve
            </Button>
          </div>
        </TD>
      )}
    </TR>
  );
}

export function ApprovalsPage() {
  const [tab, setTab] = React.useState<'pending_approval' | 'rejected'>('pending_approval');
  const { data, isPending, dataUpdatedAt } = useRegistrations(tab);
  const now = useNow();
  const sinceFetch = Math.max(0, (now - dataUpdatedAt) / 1000);
  const [picked, setSelected] = React.useState<Set<string>>(new Set());
  const [approveTarget, setApproveTarget] = React.useState<Target | null>(null);
  const [rejectTarget, setRejectTarget] = React.useState<Target | null>(null);
  const pending = tab === 'pending_approval';

  const all = React.useMemo(() => data ?? [], [data]);
  // Only rows still in the list count as selected (decided rows drop out automatically).
  const selected = React.useMemo(() => {
    const visible = new Set(all.map((r) => r.org.id));
    return new Set([...picked].filter((id) => visible.has(id)));
  }, [picked, all]);
  const toggle = (id: string, checked: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  const bulkTarget = (): Target => ({
    ids: [...selected],
    label: `${selected.size} registration${selected.size === 1 ? '' : 's'}`,
  });

  return (
    <>
      <PageHeader
        title="Approvals"
        description="Every new customer is reviewed before they can use KloudRecon."
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          value={tab}
          onValueChange={(v) => {
            setTab(v as typeof tab);
            setSelected(new Set());
          }}
        >
          <TabsList>
            {/* one shared panel below (the list is filtered, not swapped) */}
            <TabsTrigger value="pending_approval" aria-controls="registrations-panel">
              Pending
            </TabsTrigger>
            <TabsTrigger value="rejected" aria-controls="registrations-panel">
              Rejected
            </TabsTrigger>
          </TabsList>
        </Tabs>
        {pending && selected.size > 0 && (
          <div className="flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 shadow-sm">
            <span className="text-sm text-muted">{selected.size} selected</span>
            <Button size="sm" variant="secondary" onClick={() => setRejectTarget(bulkTarget())}>
              Reject
            </Button>
            <Button size="sm" onClick={() => setApproveTarget(bulkTarget())}>
              Approve
            </Button>
          </div>
        )}
      </div>

      <div id="registrations-panel" role="tabpanel" aria-label={pending ? 'Pending registrations' : 'Rejected registrations'}>
      {isPending ? (
        <Card className="space-y-2 p-5">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </Card>
      ) : all.length === 0 ? (
        <EmptyState
          icon={<Inbox />}
          title={pending ? 'No registrations waiting' : 'No rejected registrations'}
          description={
            pending
              ? 'New sign-ups appear here instantly, and you get an email for each one.'
              : 'Rejected registrations are kept here for reference.'
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                {pending && (
                  <TH className="w-10">
                    <input
                      type="checkbox"
                      className="size-4 accent-brand"
                      aria-label="Select all"
                      checked={selected.size === all.length}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked ? new Set(all.map((r) => r.org.id)) : new Set(),
                        )
                      }
                    />
                  </TH>
                )}
                <TH>Organization</TH>
                <TH>Applicant</TH>
                <TH>Use case</TH>
                <TH>{pending ? 'Waiting' : 'Registered'}</TH>
                {pending && <TH className="text-right">Decision</TH>}
              </TR>
            </THead>
            <TBody>
              {all.map((r) => (
                <Row
                  key={r.org.id}
                  r={r}
                  sinceFetch={sinceFetch}
                  pending={pending}
                  selected={selected.has(r.org.id)}
                  onSelect={(checked) => toggle(r.org.id, checked)}
                  onApprove={() => setApproveTarget({ ids: [r.org.id], label: r.org.name })}
                  onReject={() => setRejectTarget({ ids: [r.org.id], label: r.org.name })}
                />
              ))}
            </TBody>
          </Table>
        </Card>
      )}
      </div>
      {/* key: a fresh form for every target, instead of resetting state in an effect */}
      <ApproveDialog
        key={`approve-${approveTarget?.ids.join(',') ?? ''}`}
        target={approveTarget}
        onClose={() => setApproveTarget(null)}
      />
      <RejectDialog
        key={`reject-${rejectTarget?.ids.join(',') ?? ''}`}
        target={rejectTarget}
        onClose={() => setRejectTarget(null)}
      />
    </>
  );
}
