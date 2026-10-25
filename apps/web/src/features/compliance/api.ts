import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAsOf } from '@/features/inventory/api';
import { api, errorMessage, unwrap, type Schemas } from '@/lib/api/client';

export type Framework = Schemas['FrameworkOut'];
export type FrameworkDetail = Schemas['FrameworkDetail'];
export type Control = Schemas['ControlOut'];

const scanQuery = (scanId?: string) => (scanId ? { scan_id: scanId } : {});

export function useFrameworks() {
  const scanId = useAsOf();
  return useQuery({
    queryKey: ['compliance', 'frameworks', scanId ?? ''],
    queryFn: () => unwrap(api.GET('/api/v1/compliance/frameworks', { params: { query: scanQuery(scanId) } })),
  });
}

export function useFramework(key: string | undefined) {
  const scanId = useAsOf();
  return useQuery({
    queryKey: ['compliance', 'framework', key ?? '', scanId ?? ''],
    queryFn: () =>
      unwrap(api.GET('/api/v1/compliance/frameworks/{framework}', { params: { path: { framework: key ?? '' }, query: scanQuery(scanId) } })),
    enabled: !!key,
    retry: false,
  });
}

export function useControl(framework: string | undefined, control: string | null) {
  const scanId = useAsOf();
  return useQuery({
    queryKey: ['compliance', 'control', framework ?? '', control ?? '', scanId ?? ''],
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/compliance/frameworks/{framework}/controls/{control_id}', {
          params: { path: { framework: framework ?? '', control_id: control ?? '' }, query: scanQuery(scanId) },
        }),
      ),
    enabled: !!framework && !!control,
  });
}

export function useComplianceSettings() {
  return useQuery({
    queryKey: ['compliance', 'settings'],
    queryFn: () => unwrap(api.GET('/api/v1/compliance/settings')),
  });
}

export function useSaveComplianceSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (frameworks: string[]) => unwrap(api.PUT('/api/v1/compliance/settings', { body: { frameworks } })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['compliance'] });
      toast.success('Frameworks saved');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}
