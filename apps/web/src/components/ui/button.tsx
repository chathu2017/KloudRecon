import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold transition-[background-color,border-color,color,box-shadow,transform,filter] duration-200 ease-out active:scale-[0.98] [&_svg]:stroke-[1.75] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 pointer-coarse:min-h-11',
  {
    variants: {
      variant: {
        primary: 'btn-brand text-brand-fg',
        secondary: 'btn-key border border-border-strong bg-surface text-text hover:border-brand/60 hover:bg-surface-2 hover:shadow-[var(--glow-sm)]',
        outline: 'border border-brand/70 bg-transparent text-brand-strong hover:border-brand hover:bg-brand-soft hover:shadow-[var(--glow-sm)]',
        ink: 'bg-ink text-ink-fg hover:bg-ink-hover hover:shadow-[var(--glow-sm)]',
        // on the petrol bands (CTA box): light outline, light text
        inverse: 'border border-map-border bg-transparent text-map-text hover:border-map-muted hover:bg-map-surface',
        ghost: 'text-muted hover:bg-surface-2 hover:text-text',
        subtle: 'btn-key border border-border bg-surface-2 text-text hover:bg-surface-3',
        danger: 'bg-critical text-on-critical hover:opacity-90',
        link: 'h-auto px-0 text-brand-strong underline-offset-4 hover:underline pointer-coarse:min-h-0',
      },
      size: {
        sm: 'h-8 px-3',
        md: 'h-9 px-4',
        lg: 'h-11 px-5 text-md',
        icon: 'size-9 pointer-coarse:min-w-11',
        'icon-sm': 'size-8 pointer-coarse:min-w-11',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, asChild = false, loading = false, children, disabled, ...props },
    ref,
  ) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled ?? loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {asChild ? (
          children
        ) : (
          <>
            {loading && <Loader2 className="animate-spin" aria-hidden />}
            {children}
          </>
        )}
      </Comp>
    );
  },
);
Button.displayName = 'Button';
