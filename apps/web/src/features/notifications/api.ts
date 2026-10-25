import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap, type Schemas } from '@/lib/api/client';
import { useMe } from '@/lib/auth/context';

export type NotificationItem = Schemas['NotificationOut'];

export const notificationsKey = ['notifications'] as const;

export function useNotifications(limit = 30) {
  const { data: me } = useMe();
  return useQuery({
    queryKey: [...notificationsKey, limit],
    queryFn: () => unwrap(api.GET('/api/v1/notifications', { params: { query: { limit } } })),
    enabled: !!me?.user,
    refetchInterval: 120_000,
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(
        api.POST('/api/v1/notifications/{notification_id}/read', {
          params: { path: { notification_id: id } },
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: notificationsKey }),
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => unwrap(api.POST('/api/v1/notifications/read-all')),
    onSuccess: () => qc.invalidateQueries({ queryKey: notificationsKey }),
  });
}
