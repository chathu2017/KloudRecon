import { cn } from '@/lib/utils';

/**
 * The KloudRecon mark: a ring (the estate) with one swept quadrant (the scan). Two shapes, so it
 * reads at 16px; the ring uses the text color and only the sweep uses the brand color (decisions 0041, 0042).
 * `public/favicon.svg` is the same drawing with fixed colors.
 */
export function LogoGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={cn('size-5', className)} aria-hidden focusable="false">
      <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.75" />
      <path d="M8 8V3.5A4.5 4.5 0 0 1 12.5 8Z" fill="var(--brand)" />
    </svg>
  );
}

export function Logo({
  className,
  suffix = true,
  compact = false,
  size = 'md',
}: {
  className?: string;
  suffix?: boolean;
  compact?: boolean;
  /** `lg` in the marketing header, `xl` in the footer. */
  size?: 'md' | 'lg' | 'xl';
}) {
  return (
    <span className={cn('inline-flex items-center text-text', size === 'xl' ? 'gap-3' : 'gap-2', className)}>
      <LogoGlyph className={size === 'xl' ? 'size-9' : size === 'lg' ? 'size-6' : undefined} />
      {!compact && (
        <span className="flex items-baseline gap-1.5">
          <span className={cn('font-display font-bold leading-none tracking-[-0.03em]', size === 'xl' ? 'text-[30px] sm:text-[34px]' : size === 'lg' ? 'text-[21px]' : 'text-[18px]')}>KloudRecon</span>
          {suffix && <span className={cn('logo-suffix font-medium text-muted', size === 'xl' ? 'text-sm' : 'text-xs')}>for Azure</span>}
        </span>
      )}
      <span className="sr-only">KloudRecon for Azure</span>
    </span>
  );
}
