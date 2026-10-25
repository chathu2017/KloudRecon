import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, errorMessage, unwrap, type Schemas } from '@/lib/api/client';
import { useLiveEvent } from '@/lib/sse';

export type Registration = Schemas['RegistrationOut'];
export type OwnerOrg = Schemas['OwnerOrgOut'];
export type OwnerOrgDetail = Schemas['OwnerOrgDetail'];
export type OwnerUser = Schemas['OwnerUserOut'];
export type Plan = Schemas['PlanOut'];
export type PlanInput = Schemas['PlanIn'];
export type AuditLog = Schemas['AuditLogOut'];
export type OrgStatus = 'pending_approval' | 'active' | 'rejected' | 'suspended';

const keys = {
  all: ['owner'] as const,
  overview: ['owner', 'overview'] as const,
  registrations: (status: string) => ['owner', 'registrations', status] as const,
  orgs: (status?: string, q?: string) => ['owner', 'orgs', status ?? '', q ?? ''] as const,
  org: (id: string) => ['owner', 'org', id] as const,
  users: (q?: string, status?: string) => ['owner', 'users', q ?? '', status ?? ''] as const,
  plans: ['owner', 'plans'] as const,
  audit: (action?: string, orgId?: string) =>
    ['owner', 'audit', action ?? '', orgId ?? ''] as const,
};

function useInvalidateOwner() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: keys.all });
}

export function useOwnerOverview() {
  return useQuery({
    queryKey: keys.overview,
    queryFn: () => unwrap(api.GET('/api/v1/owner/overview')),
    refetchInterval: 30_000,
  });
}

export function useRegistrations(status: 'pending_approval' | 'rejected' = 'pending_approval') {
  const invalidate = useInvalidateOwner();
  // A new sign-up raises a notification for the owner: refresh the queue live.
  useLiveEvent('notification.created', (event) => {
    if (event.payload.type === 'registration.pending') void invalidate();
  });
  return useQuery({
    queryKey: keys.registrations(status),
    queryFn: () =>
      unwrap(api.GET('/api/v1/owner/registrations', { params: { query: { status } } })),
  });
}

export function usePendingCount(): number {
  const { data } = useQuery({
    queryKey: keys.registrations('pending_approval'),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/owner/registrations', {
          params: { query: { status: 'pending_approval' } },
        }),
      ),
    refetchInterval: 60_000,
  });
  return data?.length ?? 0;
}

export function useApprove() {
  const invalidate = useInvalidateOwner();
  return useMutation({
    mutationFn: (v: { orgId: string; plan_code: string; trial_days: number }) =>
      unwrap(
        api.POST('/api/v1/owner/registrations/{org_id}/approve', {
          params: { path: { org_id: v.orgId } },
          body: { plan_code: v.plan_code, trial_days: v.trial_days },
        }),
      ),
    onSuccess: (org) => {
      toast.success(`${org.name} approved`, { description: 'A welcome email is on its way.' });
      void invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useReject() {
  const invalidate = useInvalidateOwner();
  return useMutation({
    mutationFn: (v: { orgId: string; reason: string }) =>
      unwrap(
        api.POST('/api/v1/owner/registrations/{org_id}/reject', {
          params: { path: { org_id: v.orgId } },
          body: { reason: v.reason },
        }),
      ),
    onSuccess: (org) => {
      toast.success(`${org.name} rejected`);
      void invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useBulkDecision() {
  const invalidate = useInvalidateOwner();
  return useMutation({
    mutationFn: async (
      v:
        | { kind: 'approve'; org_ids: string[]; plan_code: string; trial_days: number }
        | { kind: 'reject'; org_ids: string[]; reason: string },
    ) =>
      v.kind === 'approve'
        ? unwrap(
            api.POST('/api/v1/owner/registrations/bulk-approve', {
              body: { org_ids: v.org_ids, plan_code: v.plan_code, trial_days: v.trial_days },
            }),
          )
        : unwrap(
            api.POST('/api/v1/owner/registrations/bulk-reject', {
              body: { org_ids: v.org_ids, reason: v.reason },
            }),
          ),
    onSuccess: (result) => {
      const failed = Object.keys(result.failed).length;
      toast.success(`${result.succeeded.length} updated${failed ? `, ${failed} skipped` : ''}`);
      void invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useOrgs(status?: OrgStatus, q?: string) {
  return useQuery({
    queryKey: keys.orgs(status, q),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/owner/orgs', {
          params: { query: { ...(status ? { status } : {}), ...(q ? { q } : {}) } },
        }),
      ),
  });
}

export function useOrg(id: string) {
  return useQuery({
    queryKey: keys.org(id),
    queryFn: () =>
      unwrap(api.GET('/api/v1/owner/orgs/{org_id}', { params: { path: { org_id: id } } })),
  });
}

export function useUpdateOrg(id: string) {
  const invalidate = useInvalidateOwner();
  return useMutation({
    mutationFn: (body: Schemas['OwnerOrgUpdateIn']) =>
      unwrap(api.PATCH('/api/v1/owner/orgs/{org_id}', { params: { path: { org_id: id } }, body })),
    onSuccess: () => {
      toast.success('Organization updated');
      void invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useSuspendOrg(id: string) {
  const invalidate = useInvalidateOwner();
  return useMutation({
    mutationFn: (suspend: boolean) =>
      suspend
        ? unwrap(
            api.POST('/api/v1/owner/orgs/{org_id}/suspend', { params: { path: { org_id: id } } }),
          )
        : unwrap(
            api.POST('/api/v1/owner/orgs/{org_id}/reactivate', {
              params: { path: { org_id: id } },
            }),
          ),
    onSuccess: (org) => {
      toast.success(
        org.status === 'suspended' ? 'Organization suspended' : 'Organization reactivated',
      );
      void invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useUsers(q?: string, status?: OrgStatus) {
  return useQuery({
    queryKey: keys.users(q, status),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/owner/users', {
          params: { query: { ...(q ? { q } : {}), ...(status ? { status } : {}) } },
        }),
      ),
  });
}

export function useSuspendUser() {
  const invalidate = useInvalidateOwner();
  return useMutation({
    mutationFn: (v: { id: string; suspend: boolean }) =>
      v.suspend
        ? unwrap(
            api.POST('/api/v1/owner/users/{user_id}/suspend', {
              params: { path: { user_id: v.id } },
            }),
          )
        : unwrap(
            api.POST('/api/v1/owner/users/{user_id}/reactivate', {
              params: { path: { user_id: v.id } },
            }),
          ),
    onSuccess: (user) => {
      toast.success(
        user.status === 'suspended' ? `${user.email} suspended` : `${user.email} reactivated`,
      );
      void invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function usePlans() {
  return useQuery({
    queryKey: keys.plans,
    queryFn: () => unwrap(api.GET('/api/v1/owner/plans')),
    staleTime: 60_000,
  });
}

export function useSavePlan() {
  const invalidate = useInvalidateOwner();
  return useMutation({
    mutationFn: (v: { id?: string; body: PlanInput }) =>
      v.id
        ? unwrap(
            api.PUT('/api/v1/owner/plans/{plan_id}', {
              params: { path: { plan_id: v.id } },
              body: v.body,
            }),
          )
        : unwrap(api.POST('/api/v1/owner/plans', { body: v.body })),
    onSuccess: (plan) => {
      toast.success(`Plan ${plan.name} saved`);
      void invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useAuditLogs(action?: string, orgId?: string) {
  return useQuery({
    queryKey: keys.audit(action, orgId),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/owner/audit-logs', {
          params: {
            query: {
              limit: 300,
              ...(action ? { action } : {}),
              ...(orgId ? { org_id: orgId } : {}),
            },
          },
        }),
      ),
  });
}

export type OwnerMetrics = Schemas['OwnerMetrics'];

export function useOwnerMetrics() {
  return useQuery({
    queryKey: [...keys.all, 'metrics'],
    queryFn: () => unwrap(api.GET('/api/v1/owner/metrics')),
    staleTime: 60_000,
  });
}
