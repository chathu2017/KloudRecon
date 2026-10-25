import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, errorMessage, unwrap, type Schemas } from '@/lib/api/client';
import { useLiveEvent } from '@/lib/sse';

export type Connection = Schemas['ConnectionOut'];
export type ConnectionDetail = Schemas['ConnectionDetail'];
export type ConnectionCreate = Schemas['ConnectionCreateIn'];
export type ConnectionUpdate = Schemas['ConnectionUpdateIn'];
export type ValidationReport = Schemas['ValidationReportOut'];
export type ValidationCheck = Schemas['ValidationCheckOut'];
export type Subscription = Schemas['SubscriptionOut'];

export const connectionKeys = {
  all: ['connections'] as const,
  list: ['connections', 'list'] as const,
  detail: (id: string) => ['connections', 'detail', id] as const,
  subscriptions: ['connections', 'subscriptions'] as const,
};

function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: connectionKeys.all });
}

export function useConnections() {
  const invalidate = useInvalidate();
  useLiveEvent('connection.validated', () => void invalidate());
  return useQuery({
    queryKey: connectionKeys.list,
    queryFn: () => unwrap(api.GET('/api/v1/connections')),
  });
}

export function useConnection(id: string) {
  return useQuery({
    queryKey: connectionKeys.detail(id),
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/connections/{connection_id}', { params: { path: { connection_id: id } } }),
      ),
  });
}

export function useSubscriptions() {
  return useQuery({
    queryKey: connectionKeys.subscriptions,
    queryFn: () => unwrap(api.GET('/api/v1/subscriptions')),
  });
}

/** Save & Validate. Errors are shown by the caller (form field errors). */
export function useCreateConnection() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: ConnectionCreate) => unwrap(api.POST('/api/v1/connections', { body })),
    onSuccess: () => void invalidate(),
  });
}

export function useUpdateConnection(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: ConnectionUpdate) =>
      unwrap(
        api.PATCH('/api/v1/connections/{connection_id}', {
          params: { path: { connection_id: id } },
          body,
        }),
      ),
    onSuccess: () => {
      toast.success('Connection updated');
      void invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useReplaceSecret(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (body: Schemas['SecretReplaceIn']) =>
      unwrap(
        api.PUT('/api/v1/connections/{connection_id}/secret', {
          params: { path: { connection_id: id } },
          body,
        }),
      ),
    onSuccess: () => void invalidate(),
  });
}

export function useValidateConnection(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: () =>
      unwrap(
        api.POST('/api/v1/connections/{connection_id}/validate', {
          params: { path: { connection_id: id } },
        }),
      ),
    onSuccess: (report) => {
      if (report.status === 'invalid') toast.error('Validation failed. See the checklist.');
      else toast.success(report.status === 'valid' ? 'Connection is valid' : 'Valid with warnings');
      void invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useDeleteConnection() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (id: string) => {
      const { response } = await api.DELETE('/api/v1/connections/{connection_id}', {
        params: { path: { connection_id: id } },
      });
      if (!response.ok) throw new Error('Could not delete the connection.');
    },
    onSuccess: () => {
      toast.success('Connection deleted', { description: 'Its secret and data were removed.' });
      void invalidate();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useUpdateSubscription() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (v: { id: string; body: Schemas['SubscriptionUpdateIn'] }) =>
      unwrap(
        api.PATCH('/api/v1/subscriptions/{subscription_row_id}', {
          params: { path: { subscription_row_id: v.id } },
          body: v.body,
        }),
      ),
    onSuccess: () => void invalidate(),
    onError: (e) => toast.error(errorMessage(e)),
  });
}
