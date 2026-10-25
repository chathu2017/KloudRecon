import * as PopoverPrimitive from '@radix-ui/react-popover';
import { Bell, BellOff, CheckCheck } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/misc';
import { timeAgo } from '@/lib/format';
import { useMe } from '@/lib/auth/context';
import { cn } from '@/lib/utils';
import { useMarkAllRead, useMarkRead, useNotifications, type NotificationItem } from './api';

export function NotificationRow({
  item,
  onOpen,
}: {
  item: NotificationItem;
  onOpen: (item: NotificationItem) => void;
}) {
  const unread = !item.read_at;
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className={cn(
        'flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2',
        unread && 'bg-brand-soft/35',
      )}
    >
      <span
        className={cn(
          'mt-1.5 size-2 shrink-0 rounded-full',
          unread ? 'bg-brand' : 'bg-transparent',
        )}
        aria-hidden
      />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-text">{item.title}</span>
        {item.body && <span className="mt-0.5 block text-sm text-muted">{item.body}</span>}
        <span className="mt-1 block text-xs text-subtle">{timeAgo(item.created_at)}</span>
      </span>
      {unread && <span className="sr-only">Unread</span>}
    </button>
  );
}

/** Top-bar bell with unread count; updated live over SSE (`notification.created`). */
export function NotificationBell() {
  const { data, isPending } = useNotifications(10);
  const { data: me } = useMe();
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();
  const navigate = useNavigate();
  const unread = data?.unread_count ?? 0;
  const allPath = me?.is_platform_owner ? '/owner/notifications' : '/app/notifications';

  const open = (item: NotificationItem) => {
    if (!item.read_at) markRead.mutate(item.id);
    if (item.link) void navigate(item.link);
  };

  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="relative"
          aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        >
          <Bell />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-critical px-1 text-[10px] font-semibold text-on-critical tabular">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </Button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="end"
          sideOffset={8}
          className="z-50 w-[22rem] overflow-hidden rounded-xl border border-border bg-surface shadow-lg"
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <span className="text-sm font-semibold">Notifications</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              disabled={unread === 0 || markAll.isPending}
              onClick={() => markAll.mutate()}
            >
              <CheckCheck /> Mark all read
            </Button>
          </div>
          <div className="max-h-96 divide-y divide-border overflow-y-auto">
            {isPending &&
              [0, 1, 2].map((i) => (
                <div key={i} className="space-y-2 px-4 py-3">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              ))}
            {data?.items.length === 0 && (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-muted">
                <BellOff className="size-5 text-subtle" aria-hidden />
                You are all caught up.
              </div>
            )}
            {data?.items.map((item) => (
              <PopoverPrimitive.Close asChild key={item.id}>
                <div>
                  <NotificationRow item={item} onOpen={open} />
                </div>
              </PopoverPrimitive.Close>
            ))}
          </div>
          <div className="border-t border-border px-4 py-2 text-center">
            <PopoverPrimitive.Close asChild>
              <Link to={allPath} className="text-xs font-medium text-brand-strong hover:underline">
                View all notifications
              </Link>
            </PopoverPrimitive.Close>
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
