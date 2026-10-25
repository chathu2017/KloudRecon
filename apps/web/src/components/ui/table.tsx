import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Tables scroll sideways inside their card on narrow screens. When (and only when) they do, the
 * scroller joins the tab order so keyboard users can scroll it too (WCAG 2.1.1).
 */
export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [scrolls, setScrolls] = React.useState(false);
  React.useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const update = () => setScrolls(el.scrollWidth > el.clientWidth + 1);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className="relative w-full overflow-x-auto focus-visible:outline-offset-[-2px]"
      {...(scrolls ? { tabIndex: 0, role: 'region', 'aria-label': 'Table, scrolls sideways' } : {})}
    >
      <table className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  );
}

export function THead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn(
        'sticky top-0 z-10 bg-surface-2 [&_tr]:border-b [&_tr]:border-border-strong [&_tr:hover]:bg-transparent',
        className,
      )}
      {...props}
    />
  );
}

export function TBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn('[&_tr:last-child]:border-0', className)} {...props} />;
}

export function TR({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn('border-b border-border transition-colors duration-100 hover:bg-surface-2', className)}
      {...props}
    />
  );
}

export function TH({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        'h-10 whitespace-nowrap px-4 text-left align-middle text-xs font-semibold text-muted',
        className,
      )}
      {...props}
    />
  );
}

export function TD({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('h-12 px-4 py-2 align-middle', className)} {...props} />;
}
