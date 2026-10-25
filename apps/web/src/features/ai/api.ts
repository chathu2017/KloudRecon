import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAsOf } from '@/features/inventory/api';
import { api, errorMessage, unwrap, type Schemas } from '@/lib/api/client';
import { useLiveEvent } from '@/lib/sse';

export type Generation = Schemas['GenerationOut'];
export type GenRef = Schemas['RefOut'];
export type AiSettings = Schemas['AISettings'];
export type AiKind = 'summary' | 'analyst' | 'architecture-review' | 'remediation' | 'digest';

export interface GenParams {
  view?: string;
  findingId?: string;
}

const KEY = ['ai'] as const;

function fetchGeneration(kind: AiKind, scanId: string | undefined, p: GenParams): Promise<Generation> {
  const scan = scanId ? { scan_id: scanId } : {};
  switch (kind) {
    case 'summary':
      return unwrap(api.GET('/api/v1/ai/summary', { params: { query: scan } }));
    case 'analyst':
      return unwrap(api.GET('/api/v1/ai/analyst', { params: { query: scan } }));
    case 'architecture-review':
      return unwrap(
        api.GET('/api/v1/ai/architecture-review', { params: { query: { ...scan, view: p.view ?? 'network' } } }),
      );
    case 'remediation':
      return unwrap(
        api.GET('/api/v1/ai/remediation/{finding_id}', { params: { path: { finding_id: p.findingId ?? '' } } }),
      );
    case 'digest':
      return unwrap(api.GET('/api/v1/ai/digest'));
  }
}

function postGeneration(kind: AiKind, scanId: string | undefined, p: GenParams, regenerate: boolean): Promise<Generation> {
  const scan = scanId ? { scan_id: scanId } : {};
  const body = { regenerate };
  switch (kind) {
    case 'summary':
      return unwrap(api.POST('/api/v1/ai/summary', { params: { query: scan }, body }));
    case 'analyst':
      return unwrap(api.POST('/api/v1/ai/analyst', { params: { query: scan }, body }));
    case 'architecture-review':
      return unwrap(
        api.POST('/api/v1/ai/architecture-review', { params: { query: { ...scan, view: p.view ?? 'network' } }, body }),
      );
    case 'remediation':
      return unwrap(
        api.POST('/api/v1/ai/remediation/{finding_id}', { params: { path: { finding_id: p.findingId ?? '' } }, body }),
      );
    case 'digest':
      return unwrap(api.POST('/api/v1/ai/digest', { body }));
  }
}

/** A stored AI generation. Polls while the worker is generating; live events refresh it too. */
export function useGeneration(kind: AiKind, params: GenParams = {}, enabled = true) {
  const scanId = useAsOf();
  const qc = useQueryClient();
  useLiveEvent('ai.generation', () => void qc.invalidateQueries({ queryKey: KEY }));
  return useQuery({
    queryKey: [...KEY, kind, scanId ?? '', params.view ?? '', params.findingId ?? ''],
    queryFn: () => fetchGeneration(kind, scanId, params),
    enabled,
    refetchInterval: (q) => (q.state.data?.status === 'pending' ? 3000 : false),
  });
}

export function useGenerate(kind: AiKind, params: GenParams = {}) {
  const scanId = useAsOf();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (regenerate: boolean) => postGeneration(kind, scanId, params, regenerate),
    onSuccess: (data) => {
      qc.setQueryData([...KEY, kind, scanId ?? '', params.view ?? '', params.findingId ?? ''], data);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useAiUsage() {
  return useQuery({ queryKey: [...KEY, 'usage'], queryFn: () => unwrap(api.GET('/api/v1/ai/usage')) });
}

export function useAiSettings() {
  return useQuery({ queryKey: [...KEY, 'settings'], queryFn: () => unwrap(api.GET('/api/v1/settings/ai')) });
}

export function useSaveAiSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<AiSettings>) => unwrap(api.PUT('/api/v1/settings/ai', { body })),
    onSuccess: (data) => {
      qc.setQueryData([...KEY, 'settings'], data);
      toast.success('AI settings saved.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}
