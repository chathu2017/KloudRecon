import { Check, Copy } from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Copies `value` to the clipboard and confirms inline. */
export function CopyButton({
  value,
  label = 'Copy',
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = React.useState(false);
  React.useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(id);
  }, [copied]);
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn('h-7 px-2 text-xs', className)}
      aria-label={copied ? 'Copied' : label}
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => setCopied(true));
      }}
    >
      {copied ? <Check className="text-success-strong" /> : <Copy />}
      {copied ? 'Copied' : label}
    </Button>
  );
}

/** A monospace code block with a copy button (CLI commands, IDs). */
export function CodeBlock({
  code,
  className,
  maxHeight,
}: {
  code: string;
  className?: string;
  /** Tailwind max-height class; long blocks scroll inside it. */
  maxHeight?: string;
}) {
  return (
    <div className={cn('relative rounded-md border border-border bg-surface-2', className)}>
      <div className="absolute right-1.5 top-1.5 z-10 rounded-md bg-surface-2">
        <CopyButton value={code} />
      </div>
      <pre className={cn('overflow-auto p-3 pr-24 font-mono text-xs leading-5 text-text', maxHeight)}>
        <code>{code}</code>
      </pre>
    </div>
  );
}
