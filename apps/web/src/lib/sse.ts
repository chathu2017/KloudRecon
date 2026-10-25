import { fetchEventSource } from '@microsoft/fetch-event-source';
import { useQueryClient } from '@tanstack/react-query';
import * as React from 'react';
import { toast } from 'sonner';
import { getAccessToken } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/context';
import { env } from '@/lib/env';
import { viewAsHeaders } from '@/lib/view-as';

export interface LiveEvent {
  id: number;
  type: string;
  org_id: string | null;
  user_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

class RetriableError extends Error {}

type Listener = (event: LiveEvent) => void;
const listeners = new Set<Listener>();

/** Subscribe to live events anywhere in the tree (the connection is owned by useLiveEvents). */
export function useLiveEvent(type: string, handler: (event: LiveEvent) => void): void {
  const ref = React.useRef(handler);
  React.useEffect(() => {
    ref.current = handler;
  });
  React.useEffect(() => {
    const listener: Listener = (event) => {
      if (event.type === type) ref.current(event);
    };
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, [type]);
}

export function parseEvent(data: string): LiveEvent | null {
  try {
    const parsed = JSON.parse(data) as Partial<LiveEvent>;
    return typeof parsed.type === 'string' ? (parsed as LiveEvent) : null;
  } catch {
    return null;
  }
}

/**
 * Keeps one SSE connection to /api/v1/events/stream with a bearer token (fetch-event-source).
 * Reconnects with backoff and a fresh token. Invalidates queries and shows toasts.
 */
export function useLiveEvents(enabled: boolean): void {
  const { signedIn } = useAuth();
  const queryClient = useQueryClient();

  React.useEffect(() => {
    if (!enabled || !signedIn) return;
    const controller = new AbortController();
    const aborted = () => controller.signal.aborted;
    let delay = 1000;

    const handle = (event: LiveEvent) => {
      if (event.type === 'notification.created') {
        void queryClient.invalidateQueries({ queryKey: ['notifications'] });
        const title =
          typeof event.payload.title === 'string' ? event.payload.title : 'Notification';
        const body = typeof event.payload.body === 'string' ? event.payload.body : undefined;
        toast(title, body ? { description: body } : undefined);
      } else if (event.type === 'account.status') {
        void queryClient.invalidateQueries({ queryKey: ['me'] });
      }
      listeners.forEach((listener) => listener(event));
    };

    const run = async () => {
      while (!aborted()) {
        const token = await getAccessToken();
        if (!token) return;
        try {
          await fetchEventSource(`${env.apiBaseUrl}/api/v1/events/stream`, {
            headers: { Authorization: `Bearer ${token}`, ...viewAsHeaders() },
            signal: controller.signal,
            openWhenHidden: true,
            onopen(response) {
              if (response.ok) {
                delay = 1000;
                return Promise.resolve();
              }
              throw new RetriableError(`stream ${response.status}`);
            },
            onmessage(message) {
              if (!message.data || message.event === 'ready') return;
              const event = parseEvent(message.data);
              if (event) handle(event);
            },
            onclose() {
              throw new RetriableError('closed');
            },
            onerror(err: unknown) {
              throw err instanceof Error ? err : new RetriableError('error');
            },
          });
        } catch {
          if (aborted()) return;
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay = Math.min(delay * 2, 30_000);
      }
    };
    void run();
    return () => {
      controller.abort();
    };
  }, [enabled, signedIn, queryClient]);
}
