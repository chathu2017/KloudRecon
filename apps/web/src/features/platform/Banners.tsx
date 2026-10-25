import { useQueryClient } from '@tanstack/react-query';
import { Eye, Info, Megaphone, PlayCircle, TriangleAlert, X } from 'lucide-react';
import * as React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { isDemoSession } from '@/lib/auth/adapters';
import { useAuth } from '@/lib/auth/context';
import { cn } from '@/lib/utils';
import { getViewAs, stopViewAs } from '@/lib/view-as';
import { useAnnouncements, type Announcement } from './api';

const DISMISSED = 'kr.dismissedAnnouncements';

function readDismissed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(DISMISSED) ?? '[]') as string[];
  } catch {
    return [];
  }
}

const TONE: Record<string, string> = {
  info: 'bg-brand-soft text-brand-strong',
  warning: 'bg-medium-soft text-medium-strong',
  critical: 'bg-critical-soft text-critical-strong',
};

/** Platform announcements (maintenance, incidents, news). Dismissible per browser. */
export function AnnouncementBanner() {
  const { data } = useAnnouncements();
  const [dismissed, setDismissed] = React.useState<string[]>(readDismissed);
  const visible = (data ?? []).filter((a) => !dismissed.includes(`${a.id}:${a.created_at}`));
  const dismiss = (a: Announcement) => {
    const next = [...dismissed, `${a.id}:${a.created_at}`].slice(-50);
    setDismissed(next);
    try {
      localStorage.setItem(DISMISSED, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
  };
  return (
    <>
      {visible.map((a) => {
        const Icon = a.level === 'critical' || a.level === 'warning' ? TriangleAlert : a.level === 'info' ? Megaphone : Info;
        const external = a.link?.startsWith('https://');
        return (
          <div
            key={a.id}
            role={a.level === 'info' ? 'status' : 'alert'}
            className={cn('flex items-center gap-2 border-b border-border px-4 py-1.5 text-xs', TONE[a.level] ?? TONE.info)}
          >
            <Icon className="size-3.5 shrink-0" aria-hidden />
            <p className="min-w-0 flex-1 text-center">
              <span className="font-semibold">{a.title}</span>
              {a.body && <span className="hidden sm:inline"> · {a.body}</span>}
              {a.link &&
                (external ? (
                  <a href={a.link} target="_blank" rel="noreferrer noopener" className="ml-2 font-semibold underline-offset-2 hover:underline">
                    Details
                  </a>
                ) : (
                  <Link to={a.link} className="ml-2 font-semibold underline-offset-2 hover:underline">
                    Details
                  </Link>
                ))}
            </p>
            <button type="button" aria-label={`Dismiss: ${a.title}`} className="rounded p-0.5 hover:bg-surface/60" onClick={() => dismiss(a)}>
              <X className="size-3.5" aria-hidden />
            </button>
          </div>
        );
      })}
    </>
  );
}

/** Shown while the platform owner looks at a customer organization (read-only, audited). */
export function ViewAsBanner() {
  const view = getViewAs();
  const navigate = useNavigate();
  const qc = useQueryClient();
  if (!view) return null;
  return (
    <div role="status" className="flex flex-wrap items-center justify-center gap-2 border-b border-border bg-text px-4 py-1.5 text-xs text-bg">
      <Eye className="size-3.5" aria-hidden />
      <span>
        Read-only view of <strong>{view.orgName}</strong> as platform owner. Changes are disabled; this visit is in the audit log.
      </span>
      <Button
        size="sm"
        variant="secondary"
        className="h-6 px-2 text-xs"
        onClick={() => {
          stopViewAs();
          qc.clear();
          void navigate(`/owner/orgs/${view.orgId}`);
        }}
      >
        Exit view
      </Button>
    </div>
  );
}

/** Public live demo (read-only session into Contoso Demo). */
export function DemoBanner() {
  const { signOut } = useAuth();
  if (!isDemoSession()) return null;
  return (
    <div role="status" className="flex flex-wrap items-center justify-center gap-2 border-b border-border bg-brand-soft px-4 py-1.5 text-xs text-brand-strong">
      <PlayCircle className="size-3.5" aria-hidden />
      <span>
        You are exploring the <strong>live demo</strong> with synthetic data. It is read-only.
      </span>
      <Link to="/signup" onClick={() => void signOut()} className="font-semibold underline-offset-2 hover:underline">
        Start your free trial
      </Link>
    </div>
  );
}
