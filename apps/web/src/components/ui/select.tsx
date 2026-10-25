import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Styled select (Radix): a glass popover with a raised edge instead of the browser's native list.
 * Keyboard, type-ahead and screen reader behavior come from Radix; the trigger takes the `id` a
 * `<Field>` label points to.
 */
export const Select = SelectPrimitive.Root;
export const SelectValue = SelectPrimitive.Value;

export const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      'group flex h-9 w-full items-center justify-between gap-2 rounded-md border border-border-strong bg-surface px-3 text-left text-sm text-text transition-[border-color,box-shadow] duration-150 hover:border-brand/50 pointer-coarse:min-h-11 focus-visible:border-brand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-critical data-[placeholder]:text-subtle data-[state=open]:border-brand data-[state=open]:ring-[3px] data-[state=open]:ring-ring [&>span]:truncate',
      className,
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown
        aria-hidden
        className="size-4 shrink-0 text-muted transition-transform duration-200 group-data-[state=open]:rotate-180 group-data-[state=open]:text-brand-strong"
      />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = 'SelectTrigger';

export const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = 'popper', sideOffset = 8, ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      position={position}
      sideOffset={sideOffset}
      className={cn(
        'select-pop glass z-50 max-h-(--radix-select-content-available-height) min-w-[max(var(--radix-select-trigger-width),17rem)] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl text-sm',
        className,
      )}
      {...props}
    >
      <SelectPrimitive.Viewport className="p-1.5">{children}</SelectPrimitive.Viewport>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));
SelectContent.displayName = 'SelectContent';

export const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item> & { hint?: string }
>(({ className, children, hint, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      'select-item relative flex cursor-default select-none items-center gap-3 whitespace-nowrap rounded-lg py-2 pl-3 pr-9 text-text outline-none pointer-coarse:min-h-11 data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[state=checked]:font-semibold',
      className,
    )}
    {...props}
  >
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    {hint && <span className="ml-auto pl-4 text-xs font-normal text-muted">{hint}</span>}
    <SelectPrimitive.ItemIndicator className="absolute right-2.5 flex size-5 items-center justify-center rounded-full bg-brand text-brand-fg">
      <Check className="size-3" strokeWidth={3} aria-hidden />
    </SelectPrimitive.ItemIndicator>
  </SelectPrimitive.Item>
));
SelectItem.displayName = 'SelectItem';
