import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '@/lib/utils';

export const badgeVariants = cva(
  'inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-px text-xs font-semibold [&_svg]:size-3',
  {
    variants: {
      tone: {
        neutral: 'border-border bg-surface-2 text-muted',
        brand: 'border-transparent bg-brand-soft text-brand-strong',
        success: 'border-transparent bg-success-soft text-success-strong',
        warning: 'border-transparent bg-medium-soft text-medium-strong',
        danger: 'border-transparent bg-critical-soft text-critical-strong',
        high: 'border-transparent bg-high-soft text-high-strong',
        info: 'border-transparent bg-info-soft text-info-strong',
        low: 'border-transparent bg-low-soft text-low-strong',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
