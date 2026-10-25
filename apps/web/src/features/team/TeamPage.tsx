import { zodResolver } from '@hookform/resolvers/zod';
import { Check, Copy, Mail, Trash2, UserPlus } from 'lucide-react';
import * as React from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';
import { StatusBadge } from '@/components/StatusBadge';
import { hasRole } from '@/components/layout/nav';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, NativeSelect } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { Avatar, PageHeader, Skeleton } from '@/components/ui/misc';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { errorMessage, fieldErrors } from '@/lib/api/client';
import { useMe } from '@/lib/auth/context';
import { formatDate, formatDateTime, titleCase } from '@/lib/format';
import { useNow } from '@/lib/hooks';
import {
  useChangeRole,
  useInvitations,
  useInvite,
  useMembers,
  useRemoveMember,
  useRevokeInvitation,
  type Member,
  type OrgRole,
} from './api';

const ROLE_HELP: Record<OrgRole, string> = {
  owner: 'Everything, including billing and deleting the organization.',
  admin: 'Connections, settings and team.',
  member: 'View everything, run scans, manage findings.',
  viewer: 'Read-only access.',
};

const inviteSchema = z.object({
  email: z.email('Enter a valid email address.'),
  role: z.enum(['admin', 'member', 'viewer']),
});
type InviteValues = z.infer<typeof inviteSchema>;

function InviteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const invite = useInvite();
  const [link, setLink] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const form = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: '', role: 'member' },
  });

  const submit = form.handleSubmit(async (values) => {
    try {
      const created = await invite.mutateAsync(values);
      setLink(created.invite_url);
    } catch (e) {
      const fields = fieldErrors(e);
      if (fields.email) form.setError('email', { message: fields.email });
    }
  });

  const role = useWatch({ control: form.control, name: 'role' });
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a teammate</DialogTitle>
          <DialogDescription>
            They join your organization directly after signing in. Links expire in 7 days.
          </DialogDescription>
        </DialogHeader>
        {link ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-md bg-success-soft px-3 py-2 text-sm text-success-strong">
              <Mail className="size-4" aria-hidden /> Invitation email sent.
            </div>
            <Field
              label="Invitation link"
              htmlFor="invite-link"
              hint="You can also share this link directly."
            >
              <div className="flex gap-2">
                <Input id="invite-link" readOnly value={link} className="font-mono text-xs" />
                <Button
                  variant="secondary"
                  size="icon"
                  aria-label="Copy link"
                  onClick={() => {
                    void navigator.clipboard.writeText(link).then(() => setCopied(true));
                  }}
                >
                  {copied ? <Check /> : <Copy />}
                </Button>
              </div>
            </Field>
            <DialogFooter>
              <Button onClick={onClose}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <form noValidate className="space-y-4" onSubmit={(e) => void submit(e)}>
            <Field
              label="Email"
              htmlFor="invite-email"
              error={form.formState.errors.email?.message}
            >
              <Input
                id="invite-email"
                type="email"
                placeholder="teammate@company.com"
                aria-invalid={!!form.formState.errors.email}
                {...form.register('email')}
              />
            </Field>
            <Field label="Role" htmlFor="invite-role" hint={ROLE_HELP[role]}>
              <NativeSelect id="invite-role" {...form.register('role')}>
                <option value="admin">Admin</option>
                <option value="member">Member</option>
                <option value="viewer">Viewer</option>
              </NativeSelect>
            </Field>
            {invite.isError && Object.keys(fieldErrors(invite.error)).length === 0 && (
              <p role="alert" className="text-sm text-critical-strong">
                {errorMessage(invite.error)}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" loading={invite.isPending}>
                Send invitation
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RoleCell({
  member,
  me,
  canManage,
}: {
  member: Member;
  me: Member | null | undefined;
  canManage: boolean;
}) {
  const change = useChangeRole();
  const isOwnerActor = me?.org_role === 'owner';
  const locked =
    !canManage || member.id === me?.id || (member.org_role === 'owner' && !isOwnerActor);
  if (locked) return <span>{titleCase(member.org_role ?? '—')}</span>;
  return (
    <NativeSelect
      aria-label={`Role for ${member.email}`}
      className="h-8 w-32"
      value={member.org_role ?? 'viewer'}
      disabled={change.isPending}
      onChange={(e) => change.mutate({ id: member.id, role: e.target.value as OrgRole })}
    >
      {isOwnerActor && <option value="owner">Owner</option>}
      <option value="admin">Admin</option>
      <option value="member">Member</option>
      <option value="viewer">Viewer</option>
    </NativeSelect>
  );
}

export function TeamPage() {
  const { data: me } = useMe();
  const canManage = hasRole(me?.user?.org_role, 'admin');
  const members = useMembers();
  const invitations = useInvitations(canManage);
  const revoke = useRevokeInvitation();
  const remove = useRemoveMember();
  const [inviteOpen, setInviteOpen] = React.useState(false);
  const [confirm, setConfirm] = React.useState<Member | null>(null);
  const [inviteKey, setInviteKey] = React.useState(0);
  const now = useNow();

  return (
    <>
      <PageHeader
        title="Team"
        description="People in your organization and what they can do."
        actions={
          canManage && (
            <Button
              onClick={() => {
                setInviteKey((k) => k + 1);
                setInviteOpen(true);
              }}
            >
              <UserPlus /> Invite teammate
            </Button>
          )
        }
      />
      <Card className="overflow-hidden">
        {members.isPending ? (
          <div className="space-y-2 p-5">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : (
          <Table>
            <THead>
              <TR className="hover:bg-transparent">
                <TH>Member</TH>
                <TH>Role</TH>
                <TH>Status</TH>
                <TH>Last sign-in</TH>
                {canManage && <TH className="text-right">Actions</TH>}
              </TR>
            </THead>
            <TBody>
              {members.data?.map((m) => (
                <TR key={m.id}>
                  <TD>
                    <div className="flex items-center gap-3">
                      <Avatar name={m.name || m.email} />
                      <div className="min-w-0">
                        <div className="truncate font-medium">
                          {m.name || m.email}
                          {m.id === me?.user?.id && <Badge className="ml-2">You</Badge>}
                        </div>
                        <div className="truncate text-xs text-muted">{m.email}</div>
                      </div>
                    </div>
                  </TD>
                  <TD>
                    <RoleCell member={m} me={me?.user} canManage={canManage} />
                  </TD>
                  <TD>
                    <StatusBadge status={m.status} />
                  </TD>
                  <TD className="whitespace-nowrap text-muted">
                    {formatDateTime(m.last_login_at)}
                  </TD>
                  {canManage && (
                    <TD className="text-right">
                      {m.id !== me?.user?.id &&
                        (m.org_role !== 'owner' || me?.user?.org_role === 'owner') && (
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`Remove ${m.email}`}
                            onClick={() => setConfirm(m)}
                          >
                            <Trash2 />
                          </Button>
                        )}
                    </TD>
                  )}
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      {canManage && (
        <Card className="mt-6 overflow-hidden">
          <CardHeader>
            <CardTitle>Pending invitations</CardTitle>
            <CardDescription>Invitations that have not been accepted yet.</CardDescription>
          </CardHeader>
          {invitations.data?.length ? (
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Email</TH>
                  <TH>Role</TH>
                  <TH>Sent</TH>
                  <TH>Expires</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {invitations.data.map((inv) => {
                  const expired = new Date(inv.expires_at).getTime() < now;
                  return (
                    <TR key={inv.id}>
                      <TD className="font-medium">{inv.email}</TD>
                      <TD>{titleCase(inv.role)}</TD>
                      <TD className="text-muted">{formatDate(inv.created_at)}</TD>
                      <TD>
                        {expired ? (
                          <Badge tone="danger">Expired</Badge>
                        ) : (
                          formatDate(inv.expires_at)
                        )}
                      </TD>
                      <TD className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => revoke.mutate(inv.id)}>
                          Revoke
                        </Button>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          ) : (
            <p className="px-5 pb-5 text-sm text-muted">No pending invitations.</p>
          )}
        </Card>
      )}

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {(Object.keys(ROLE_HELP) as OrgRole[]).map((role) => (
          <div key={role} className="rounded-xl border border-border bg-surface p-4">
            <div className="text-sm font-semibold">{titleCase(role)}</div>
            <p className="mt-1 text-xs text-muted">{ROLE_HELP[role]}</p>
          </div>
        ))}
      </div>

      <InviteDialog key={inviteKey} open={inviteOpen} onClose={() => setInviteOpen(false)} />
      <Dialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {confirm?.name || confirm?.email}?</DialogTitle>
            <DialogDescription>
              They lose access immediately. You can invite them again later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={remove.isPending}
              onClick={() => {
                if (confirm) remove.mutate(confirm.id, { onSettled: () => setConfirm(null) });
              }}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
