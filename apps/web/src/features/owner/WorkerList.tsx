import { ChevronDown } from 'lucide-react';
import * as React from 'react';
import { timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';

export interface WorkerRow {
  worker_id: string;
  hostname?: string | null;
  last_seen_at: string;
  stats: Record<string, unknown>;
}

const STALE_AFTER_SECONDS = 180;

function num(value: unknown): string {
  return typeof value === 'number' ? `${value}%` : '—';
}

/** Small status dot + text (color is never the only signal). */
export function StatusDot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span aria-hidden className={cn('size-1.5 rounded-full', ok ? 'bg-success' : 'bg-critical')} />
      <span className={ok ? 'text-success-strong' : 'text-critical-strong'}>{label}</span>
    </span>
  );
}

function Row({ w, now }: { w: WorkerRow; now: number }) {
  const healthy = (now - new Date(w.last_seen_at).getTime()) / 1000 < STALE_AFTER_SECONDS;
  return (
    <li className="px-4 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate font-mono text-xs text-text" title={w.worker_id}>
          {w.worker_id}
        </span>
        <StatusDot ok={healthy} label={`${healthy ? 'Healthy' : 'Stale'} · ${timeAgo(w.last_seen_at, now)}`} />
      </div>
      <div className="mt-0.5 font-mono text-xs text-muted tabular">
        CPU {num(w.stats.cpu_percent)} · Mem {num(w.stats.mem_used_percent)} · Disk free {num(w.stats.disk_free_percent)}
      </div>
    </li>
  );
}

/** Healthy workers first; stale heartbeats (old processes) are collapsed by default. */
export function WorkerList({ workers, now }: { workers: WorkerRow[]; now: number }) {
  const [showStale, setShowStale] = React.useState(false);
  const fresh = workers.filter((w) => (now - new Date(w.last_seen_at).getTime()) / 1000 < STALE_AFTER_SECONDS);
  const stale = workers.filter((w) => !fresh.includes(w));
  if (!workers.length) {
    return <p className="px-4 py-3 text-sm text-critical-strong">No worker heartbeat. Start the worker: python -m kloudrecon.worker.main</p>;
  }
  return (
    <div>
      <ul className="divide-y divide-border">
        {fresh.map((w) => (
          <Row key={w.worker_id} w={w} now={now} />
        ))}
        {!fresh.length && <li className="px-4 py-2.5 text-sm text-critical-strong">No healthy worker. The newest heartbeat is stale.</li>}
        {showStale && stale.map((w) => <Row key={w.worker_id} w={w} now={now} />)}
      </ul>
      {stale.length > 0 && (
        <button
          type="button"
          onClick={() => setShowStale((v) => !v)}
          aria-expanded={showStale}
          className="flex w-full items-center gap-1.5 border-t border-border px-4 py-2 text-left text-xs text-muted hover:text-text"
        >
          <ChevronDown className={cn('size-3.5 transition-transform', showStale && 'rotate-180')} aria-hidden />
          {showStale ? 'Hide' : 'Show'} {stale.length} stale worker{stale.length === 1 ? '' : 's'}
        </button>
      )}
    </div>
  );
}
