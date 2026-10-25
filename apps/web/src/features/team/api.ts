import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, errorMessage, unwrap, type Schemas } from '@/lib/api/client';

export type Member = Schemas['UserOut'];
export type Invitation = Schemas['InvitationOut'];
export type InviteRole = Schemas['InvitationIn']['role'];
export type OrgRole = Schemas['MemberRoleIn']['role'];

const keys = {
  members: ['team', 'members'] as const,
  invitations: ['team', 'invitations'] as const,
};

export function useMembers() {
  return useQuery({
    queryKey: keys.members,
    queryFn: () => unwrap(api.GET('/api/v1/team/members')),
  });
}

export function useInvitations(enabled: boolean) {
  return useQuery({
    queryKey: keys.invitations,
    queryFn: () => unwrap(api.GET('/api/v1/team/invitations')),
    enabled,
  });
}

export function useInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; role: InviteRole }) =>
      unwrap(api.POST('/api/v1/team/invitations', { body })),
    onSuccess: (inv) => {
      toast.success(`Invitation sent to ${inv.email}`);
      void qc.invalidateQueries({ queryKey: keys.invitations });
    },
  });
}

export function useRevokeInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(
        api.DELETE('/api/v1/team/invitations/{invitation_id}', {
          params: { path: { invitation_id: id } },
        }),
      ),
    onSuccess: () => {
      toast.success('Invitation revoked');
      void qc.invalidateQueries({ queryKey: keys.invitations });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useChangeRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; role: OrgRole }) =>
      unwrap(
        api.PATCH('/api/v1/team/members/{member_id}', {
          params: { path: { member_id: v.id } },
          body: { role: v.role },
        }),
      ),
    onSuccess: (m) => {
      toast.success(`${m.name || m.email} is now ${m.org_role ?? ''}`);
      void qc.invalidateQueries({ queryKey: keys.members });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useRemoveMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(
        api.DELETE('/api/v1/team/members/{member_id}', { params: { path: { member_id: id } } }),
      ),
    onSuccess: () => {
      toast.success('Member removed');
      void qc.invalidateQueries({ queryKey: keys.members });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}
