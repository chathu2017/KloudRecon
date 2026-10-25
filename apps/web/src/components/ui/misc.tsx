import * as AvatarPrimitive from '@radix-ui/react-avatar';
import * as SeparatorPrimitive from '@radix-ui/react-separator';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import * as React from 'react';
import { cn } from '@/lib/utils';

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('skeleton rounded-md', className)} />;
}

export const Separator = React.forwardRef<
  React.ElementRef<typeof SeparatorPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root>
>(({ className, orientation = 'horizontal', decorative = true, ...props }, ref) => (
  <SeparatorPrimitive.Root
    ref={ref}
    decorative={decorative}
    orientation={orientation}
    className={cn(
      'shrink-0 bg-border',
      orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
      className,
    )}
    {...props}
  />
));
Separator.displayName = 'Separator';

export const TooltipProvider = TooltipPrimitive.Provider;

export function Tooltip({
  content,
  children,
  side = 'top',
}: {
  content: React.ReactNode;
  children: React.ReactElement;
  side?: 'top' | 'right' | 'bottom' | 'left';
}) {
  return (
    <TooltipPrimitive.Root delayDuration={250}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className="z-50 max-w-xs rounded-md bg-text px-2 py-1 text-xs font-medium text-bg shadow-md data-[state=delayed-open]:animate-[kr-fade_150ms_var(--ease-out)]"
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

export function initials(nameOrEmail: string): string {
  const base = nameOrEmail.split('@')[0] ?? nameOrEmail;
  const parts = base.split(/[\s._-]+/).filter(Boolean);
  const letters =
    parts.length > 1 ? `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}` : base.slice(0, 2);
  return letters.toUpperCase();
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <AvatarPrimitive.Root
      className={cn(
        'inline-flex size-8 shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-brand-soft text-xs font-semibold text-brand-strong',
        className,
      )}
    >
      <AvatarPrimitive.Fallback delayMs={0}>{initials(name)}</AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] border border-b-2 border-border-strong bg-surface px-1 font-mono text-[11px] text-muted',
        className,
      )}
    >
      {children}
    </kbd>
  );
}

/**
 * Short and compact: one line of text (+ optional detail) and at most one action. `tone="error"`
 * for failures: says what happened and what to do, never apologizes.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  tone = 'default',
}: {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  tone?: 'default' | 'error';
}) {
  const error = tone === 'error';
  return (
    <div
      role={error ? 'alert' : undefined}
      className={cn(
        'card-3d glow-card rise-in relative flex flex-col gap-3 overflow-hidden rounded-xl px-5 py-5 sm:flex-row sm:items-center sm:px-6',
        error ? 'border-critical/40' : 'border-border',
        className,
      )}
    >
      {icon && (
        <span
          className={cn(
            'hidden size-11 shrink-0 items-center justify-center rounded-xl shadow-[var(--raise-sm)] sm:flex [&_svg]:size-[22px] [&_svg]:stroke-[1.6]',
            error ? 'bg-critical-soft text-critical-strong' : 'bg-brand-soft text-brand-strong',
          )}
        >
          {icon}
        </span>
      )}
      <div className="relative min-w-0 flex-1 text-sm">
        <h3 className="font-semibold text-text">{title}</h3>
        {description && <p className="mt-0.5 text-muted">{description}</p>}
      </div>
      {action && <div className="relative shrink-0">{action}</div>}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="rise-in mb-7 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-3xl font-bold tracking-[-0.03em]">{title}</h1>
        {description && <p className="mt-1.5 max-w-3xl text-md text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
