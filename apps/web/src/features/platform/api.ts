import { useQuery } from '@tanstack/react-query';
import { api, unwrap, type Schemas } from '@/lib/api/client';

export type Announcement = Schemas['AnnouncementOut'];

export function useAnnouncements() {
  return useQuery({
    queryKey: ['announcements'],
    queryFn: () => unwrap(api.GET('/api/v1/announcements')),
    staleTime: 5 * 60_000,
  });
}

/** Feature flags for the caller's organization. Unknown flags are off; while loading, `fallback`. */
export function useFeature(key: string, fallback = true): boolean {
  const { data } = useQuery({
    queryKey: ['features'],
    queryFn: () => unwrap(api.GET('/api/v1/features')),
    staleTime: 5 * 60_000,
  });
  if (!data) return fallback;
  return data[key] === true;
}
