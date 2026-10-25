import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, errorMessage, unwrap, type Schemas } from '@/lib/api/client';

export type Server = Schemas['ServerOut'];
export type ServerDetail = Schemas['ServerDetail'];
export type ServerIn = Schemas['ServerIn'];
export type OsOptions = Schemas['OsOptions'];
export type Platform = Server['platform'];
export type CheckSummary = Schemas['CheckSummary'];

const KEY = ['servers'] as const;

export function useServers() {
  return useQuery({ queryKey: [...KEY, 'list'], queryFn: () => unwrap(api.GET('/api/v1/servers')) });
}

export function useOsOptions() {
  return useQuery({ queryKey: [...KEY, 'options'], queryFn: () => unwrap(api.GET('/api/v1/servers/options')), staleTime: Infinity });
}

export function useServer(id: string | undefined, checkId?: string) {
  return useQuery({
    enabled: !!id,
    queryKey: [...KEY, 'detail', id ?? '', checkId ?? ''],
    queryFn: () =>
      unwrap(api.GET('/api/v1/servers/{server_id}', { params: { path: { server_id: id ?? '' }, query: checkId ? { check_id: checkId } : {} } })),
  });
}

export function useScript(id: string | undefined) {
  return useQuery({
    enabled: !!id,
    queryKey: [...KEY, 'script', id ?? ''],
    queryFn: () => unwrap(api.GET('/api/v1/servers/{server_id}/script', { params: { path: { server_id: id ?? '' } } })),
    staleTime: 60_000,
  });
}

export function useCreateServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ServerIn) => unwrap(api.POST('/api/v1/servers', { body })),
    onSuccess: () => void qc.invalidateQueries({ queryKey: KEY }),
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useDeleteServer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => unwrap(api.DELETE('/api/v1/servers/{server_id}', { params: { path: { server_id: id } } })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY });
      toast.success('Server removed.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useSaveCheck(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (output: string) => unwrap(api.POST('/api/v1/servers/{server_id}/checks', { params: { path: { server_id: id } }, body: { output } })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY });
      toast.success('Health report created.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}
