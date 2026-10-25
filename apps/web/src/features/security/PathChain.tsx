import { ChevronRight, Globe2, KeyRound, Network, ShieldAlert, Target } from 'lucide-react';
import { typeInfo } from '@/features/inventory/types';
import { cn } from '@/lib/utils';

interface PathNode {
  id: string;
  kind: string;
  label?: string | null;
  type?: string | null;
  detail?: string | null;
}

const KIND_STYLE: Record<string, string> = {
  internet: 'border-critical/40 bg-critical-soft text-critical-strong',
  resource: 'border-high/40 bg-high-soft',
  identity: 'border-brand/40 bg-brand-soft',
  role: 'border-medium/40 bg-medium-soft',
  network: 'border-low/40 bg-low-soft',
  target: 'border-critical/50 bg-critical-soft',
};
const KIND_LABEL: Record<string, string> = {
  internet: 'Entry',
  resource: 'Exposed resource',
  identity: 'Runs as',
  role: 'Holds role',
  network: 'Moves inside',
  target: 'Reaches',
};

/** The steps of a path (Internet → resource → identity → role → target, or a shorter route) as a highlighted chain. */
export function PathChain({ nodes, onOpen, compact = false }: { nodes: PathNode[]; onOpen?: (armId: string) => void; compact?: boolean }) {
  return (
    <ol className="flex flex-wrap items-stretch gap-1.5" aria-label="Attack path">
      {nodes.map((n, i) => {
        const Icon =
          n.kind === 'internet'
            ? Globe2
            : n.kind === 'identity'
              ? KeyRound
              : n.kind === 'role'
                ? ShieldAlert
                : n.kind === 'network'
                  ? Network
                : n.kind === 'target'
                  ? Target
                  : typeInfo(n.type ?? '').icon;
        const clickable = onOpen && n.id.startsWith('/subscriptions/') && (n.kind === 'resource' || n.kind === 'target');
        const body = (
          <>
            <span className="text-[10px] font-medium text-muted">{KIND_LABEL[n.kind] ?? n.kind}</span>
            <span className="flex items-center gap-1.5 font-medium">
              <Icon className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{n.label}</span>
            </span>
            {!compact && n.detail && <span className="truncate text-xs text-muted">{n.detail}</span>}
          </>
        );
        return (
          <li key={`${n.id}-${i}`} className="flex min-w-0 items-center gap-1.5">
            {clickable ? (
              <button
                type="button"
                onClick={() => onOpen(n.id)}
                className={cn('flex min-w-0 max-w-56 flex-col rounded-md border px-2.5 py-1.5 text-left text-sm transition-colors hover:border-border-strong', KIND_STYLE[n.kind])}
              >
                {body}
              </button>
            ) : (
              <div className={cn('flex min-w-0 max-w-56 flex-col rounded-md border px-2.5 py-1.5 text-sm', KIND_STYLE[n.kind])}>{body}</div>
            )}
            {i < nodes.length - 1 && <ChevronRight className="size-4 shrink-0 text-critical-strong" aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}
