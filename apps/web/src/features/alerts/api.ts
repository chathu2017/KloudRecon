import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, errorMessage, unwrap, type Schemas } from '@/lib/api/client';

export type AlertRule = Schemas['AlertRuleOut'];
export type AlertRuleIn = Schemas['AlertRuleIn'];
export type AlertEventType = Schemas['AlertEventType'];
export type Integration = Schemas['IntegrationOut'];
export type IntegrationIn = Schemas['IntegrationIn'];
export type Delivery = Schemas['DeliveryOut'];

const KEY = ['alerts'] as const;

export function useAlertEvents() {
  return useQuery({
    queryKey: [...KEY, 'events'],
    queryFn: () => unwrap(api.GET('/api/v1/alerts/events')),
    staleTime: Infinity,
  });
}

export function useAlertRules() {
  return useQuery({ queryKey: [...KEY, 'rules'], queryFn: () => unwrap(api.GET('/api/v1/alerts/rules')) });
}

export function useSaveRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: AlertRuleIn }) =>
      id
        ? unwrap(api.PUT('/api/v1/alerts/rules/{rule_id}', { params: { path: { rule_id: id } }, body }))
        : unwrap(api.POST('/api/v1/alerts/rules', { body })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [...KEY, 'rules'] });
      toast.success('Alert rule saved.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useDeleteRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(api.DELETE('/api/v1/alerts/rules/{rule_id}', { params: { path: { rule_id: id } } })),
    onSuccess: () => void qc.invalidateQueries({ queryKey: [...KEY, 'rules'] }),
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useIntegrations() {
  return useQuery({ queryKey: [...KEY, 'integrations'], queryFn: () => unwrap(api.GET('/api/v1/integrations')) });
}

export function useCreateIntegration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: IntegrationIn) => unwrap(api.POST('/api/v1/integrations', { body })),
    onSuccess: () => void qc.invalidateQueries({ queryKey: [...KEY, 'integrations'] }),
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useToggleIntegration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      unwrap(
        api.PATCH('/api/v1/integrations/{integration_id}', {
          params: { path: { integration_id: id } },
          body: { enabled },
        }),
      ),
    onSuccess: () => void qc.invalidateQueries({ queryKey: [...KEY, 'integrations'] }),
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useDeleteIntegration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(api.DELETE('/api/v1/integrations/{integration_id}', { params: { path: { integration_id: id } } })),
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEY }),
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useTestIntegration() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(api.POST('/api/v1/integrations/{integration_id}/test', { params: { path: { integration_id: id } } })),
    onSuccess: (d) => {
      void qc.invalidateQueries({ queryKey: KEY });
      if (d.status === 'sent') toast.success('Test message delivered.');
      else toast.error(`Test failed${d.error ? `: ${d.error}` : '.'}`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useDeliveries() {
  return useQuery({
    queryKey: [...KEY, 'deliveries'],
    queryFn: () => unwrap(api.GET('/api/v1/alerts/deliveries')),
    refetchInterval: (q) => (q.state.data?.some((d) => d.status === 'queued' || d.status === 'retrying') ? 5000 : false),
  });
}
