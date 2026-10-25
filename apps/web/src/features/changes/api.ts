import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { api, unwrap, type Schemas } from '@/lib/api/client';

export type ChangeType = 'created' | 'deleted' | 'modified' | 'action' | 'activity';
export type ChangeSummary = Schemas['ChangeSummary'];
export type CompareResult = Schemas['CompareOut'];

export interface ChangeFilters {
  change_type?: ChangeType | undefined;
  risky?: boolean | undefined;
  q?: string | undefined;
  days: number;
}

export function useChanges(filters: ChangeFilters) {
  return useInfiniteQuery({
    queryKey: ['changes', 'list', filters],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET('/api/v1/changes', {
          params: {
            query: {
              days: filters.days,
              limit: 100,
              ...(filters.change_type ? { change_type: filters.change_type } : {}),
              ...(filters.risky ? { risky: true } : {}),
              ...(filters.q ? { q: filters.q } : {}),
              ...(pageParam ? { cursor: pageParam } : {}),
            },
          },
        }),
      ),
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    placeholderData: keepPreviousData,
  });
}

export function useChangeSummary(days: number) {
  return useQuery({
    queryKey: ['changes', 'summary', days],
    queryFn: () => unwrap(api.GET('/api/v1/changes/summary', { params: { query: { days } } })),
  });
}

export function useCompare(from: string | undefined, to: string | undefined) {
  return useQuery({
    queryKey: ['compare', from ?? '', to ?? ''],
    queryFn: () =>
      unwrap(api.GET('/api/v1/compare', { params: { query: { from: from ?? '', to: to ?? '' } } })),
    enabled: !!from && !!to && from !== to,
    retry: false,
  });
}
