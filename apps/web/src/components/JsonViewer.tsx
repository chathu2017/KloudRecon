import { ChevronRight } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

function isObject(value: unknown): value is Record<string, Json> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function Scalar({ value }: { value: Json }) {
  if (value === null) return <span className="text-subtle">null</span>;
  if (typeof value === 'string') return <span className="break-all text-success-strong">"{value}"</span>;
  if (typeof value === 'number') return <span className="text-brand-strong">{value}</span>;
  if (typeof value === 'boolean') return <span className="text-high-strong">{String(value)}</span>;
  return null;
}

function Node({ name, value, depth }: { name: string | null; value: Json; depth: number }) {
  const [open, setOpen] = React.useState(depth < 1);
  const composite = isObject(value) || Array.isArray(value);
  const label = name !== null && <span className="text-text">{name}: </span>;
  if (!composite) {
    return (
      <div className="py-0.5 pl-4">
        {label}
        <Scalar value={value} />
      </div>
    );
  }
  const entries: [string, Json][] = Array.isArray(value)
    ? value.map((v, i) => [String(i), v])
    : Object.entries(value);
  const summary = Array.isArray(value) ? `[${entries.length}]` : `{${entries.length}}`;
  return (
    <div>
      <button
        type="button"
        className="flex items-center gap-0.5 rounded py-0.5 text-left hover:bg-surface-2"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <ChevronRight
          className={cn('size-3.5 shrink-0 text-subtle transition-transform', open && 'rotate-90')}
          aria-hidden
        />
        {label}
        <span className="text-subtle">{summary}</span>
      </button>
      {open && (
        <div className="ml-1.5 border-l border-border pl-1.5">
          {entries.length === 0 ? (
            <div className="py-0.5 pl-4 text-subtle">empty</div>
          ) : (
            entries.map(([k, v]) => <Node key={k} name={k} value={v} depth={depth + 1} />)
          )}
        </div>
      )}
    </div>
  );
}

/** Collapsible JSON tree for resource properties (mono, tokens only). */
export function JsonViewer({ value, className }: { value: unknown; className?: string }) {
  return (
    <div
      className={cn(
        'overflow-x-auto rounded-md border border-border bg-surface-2 p-3 font-mono text-xs leading-5',
        className,
      )}
    >
      <Node name={null} value={value as Json} depth={0} />
    </div>
  );
}
