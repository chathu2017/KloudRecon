import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAsOf } from '@/features/inventory/api';
import { api, errorMessage, unwrap, type Schemas } from '@/lib/api/client';

export type Recommendation = Schemas['RecommendationOut'];
export type RecStatus = Recommendation['status'];
export type RecUpdate = Schemas['RecommendationUpdate'];
export type RecBulk = Schemas['RecommendationBulk'];

export interface RecFilters {
  q?: string;
  source?: string[];
  pillar?: string[];
  band?: string[];
  status?: string[];
  kind?: 'risk' | 'savings';
  assignee?: string;
}

const KEY = ['recommendations'] as const;

export function useRecommendations(filters: RecFilters) {
  const scanId = useAsOf();
  return useQuery({
    queryKey: [...KEY, 'list', scanId ?? '', filters],
    queryFn: () =>
      unwrap(
        api.GET('/api/v1/recommendations', {
          params: { query: { ...filters, ...(scanId ? { scan_id: scanId } : {}) } },
        }),
      ),
    placeholderData: (prev) => prev,
  });
}

export function useRecComments(ref: string | null) {
  return useQuery({
    queryKey: [...KEY, 'comments', ref],
    queryFn: () =>
      unwrap(api.GET('/api/v1/recommendations/{ref}/comments', { params: { path: { ref: ref ?? '' } } })),
    enabled: !!ref,
  });
}

export function useUpdateRec() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ref, body }: { ref: string; body: RecUpdate }) =>
      unwrap(api.PATCH('/api/v1/recommendations/{ref}', { params: { path: { ref } }, body })),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY });
      void qc.invalidateQueries({ queryKey: ['security'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useBulkRec() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RecBulk) => unwrap(api.POST('/api/v1/recommendations/bulk', { body })),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: KEY });
      toast.success(
        `${res.updated} recommendation${res.updated === 1 ? '' : 's'} updated` +
          (res.skipped.length ? ` · ${res.skipped.length} skipped (findings need an exception to be dismissed)` : ''),
      );
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useAddRecComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ref, body }: { ref: string; body: string }) =>
      unwrap(api.POST('/api/v1/recommendations/{ref}/comments', { params: { path: { ref } }, body: { body } })),
    onSuccess: (_c, v) => void qc.invalidateQueries({ queryKey: [...KEY, 'comments', v.ref] }),
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export async function fetchTicket(ref: string, format: 'jira' | 'ado') {
  return unwrap(
    api.GET('/api/v1/recommendations/{ref}/ticket', { params: { path: { ref }, query: { format } } }),
  );
}
