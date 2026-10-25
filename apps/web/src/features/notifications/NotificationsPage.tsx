import { BellOff, CheckCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, PageHeader, Skeleton } from '@/components/ui/misc';
import { useMarkAllRead, useMarkRead, useNotifications, type NotificationItem } from './api';
import { NotificationRow } from './NotificationBell';

export function NotificationsPage() {
  const { data, isPending } = useNotifications(100);
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();
  const navigate = useNavigate();

  const open = (item: NotificationItem) => {
    if (!item.read_at) markRead.mutate(item.id);
    if (item.link) void navigate(item.link);
  };

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Approvals, team changes and alerts. New ones arrive live."
        actions={
          <Button
            variant="secondary"
            disabled={!data?.unread_count || markAll.isPending}
            onClick={() => markAll.mutate()}
          >
            <CheckCheck /> Mark all read
          </Button>
        }
      />
      {isPending ? (
        <Card className="space-y-3 p-5">
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-5 w-2/5" />
        </Card>
      ) : data?.items.length ? (
        <Card className="divide-y divide-border overflow-hidden">
          {data.items.map((item) => (
            <NotificationRow key={item.id} item={item} onOpen={open} />
          ))}
        </Card>
      ) : (
        <EmptyState
          icon={<BellOff />}
          title="No notifications yet"
          description="We will let you know about approvals, team changes and important findings here."
        />
      )}
    </>
  );
}
