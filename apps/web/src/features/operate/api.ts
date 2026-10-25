import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAsOf } from '@/features/inventory/api';
import { api, errorMessage, unwrap, type Schemas } from '@/lib/api/client';

export type GovernanceSettings = Schemas['GovernanceSettings'];
export type CustomRule = Schemas['CustomRuleOut'];
export type CustomRuleIn = Schemas['CustomRuleIn'];

const scanQuery = (scanId?: string) => (scanId ? { scan_id: scanId } : {});

export function useReliability() {
  const scanId = useAsOf();
  return useQuery({
    queryKey: ['operate', 'reliability', scanId ?? ''],
    queryFn: () => unwrap(api.GET('/api/v1/reliability', { params: { query: scanQuery(scanId) } })),
  });
}

export function useRetirements() {
  const scanId = useAsOf();
  return useQuery({
    queryKey: ['operate', 'retirements', scanId ?? ''],
    queryFn: () => unwrap(api.GET('/api/v1/reliability/retirements', { params: { query: scanQuery(scanId) } })),
  });
}

export function useQuotas() {
  const scanId = useAsOf();
  return useQuery({
    queryKey: ['operate', 'quotas', scanId ?? ''],
    queryFn: () => unwrap(api.GET('/api/v1/reliability/quotas', { params: { query: scanQuery(scanId) } })),
  });
}

export function useGovernance() {
  const scanId = useAsOf();
  return useQuery({
    queryKey: ['operate', 'governance', scanId ?? ''],
    queryFn: () => unwrap(api.GET('/api/v1/governance', { params: { query: scanQuery(scanId) } })),
  });
}

export function useScoreHistory() {
  return useQuery({
    queryKey: ['operate', 'scores'],
    queryFn: () => unwrap(api.GET('/api/v1/scores/history', { params: { query: { limit: 30 } } })),
  });
}

export function useGovernanceSettings() {
  return useQuery({
    queryKey: ['operate', 'governance-settings'],
    queryFn: () => unwrap(api.GET('/api/v1/settings/governance')),
  });
}

export function useSaveGovernanceSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: GovernanceSettings) => unwrap(api.PUT('/api/v1/settings/governance', { body })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['operate'] });
      toast.success('Governance settings saved. They apply from the next scan.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useSecuritySettings() {
  return useQuery({
    queryKey: ['operate', 'security-settings'],
    queryFn: () => unwrap(api.GET('/api/v1/settings/security')),
  });
}

export function useSaveSecuritySettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sla: Record<string, number | null>) => unwrap(api.PUT('/api/v1/settings/security', { body: { sla_days: sla } })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['operate', 'security-settings'] });
      toast.success('SLA saved. New and reopened findings use it.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useCustomRules() {
  return useQuery({
    queryKey: ['operate', 'custom-rules'],
    queryFn: () => unwrap(api.GET('/api/v1/custom-rules')),
  });
}

export function useSaveCustomRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: CustomRuleIn }) =>
      id
        ? unwrap(api.PUT('/api/v1/custom-rules/{rule_id}', { params: { path: { rule_id: id } }, body }))
        : unwrap(api.POST('/api/v1/custom-rules', { body })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['operate', 'custom-rules'] });
      toast.success('Custom rule saved. It runs on the next scan.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useDeleteCustomRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unwrap(api.DELETE('/api/v1/custom-rules/{rule_id}', { params: { path: { rule_id: id } } })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['operate', 'custom-rules'] });
      toast.success('Custom rule deleted');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useValidateKql() {
  return useMutation({
    mutationFn: (kql: string) => unwrap(api.POST('/api/v1/custom-rules/validate', { body: { kql } })),
    onError: (e) => toast.error(errorMessage(e)),
  });
}
