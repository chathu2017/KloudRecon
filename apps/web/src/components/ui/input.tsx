import * as React from 'react';
import { cn } from '@/lib/utils';

const base =
  'flex w-full rounded-md border border-border-strong bg-surface px-3 text-sm text-text shadow-[var(--well)] transition-[border-color,box-shadow] duration-150 placeholder:text-subtle hover:border-brand/50 pointer-coarse:min-h-11 focus-visible:border-brand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-critical';

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type = 'text', ...props }, ref) => (
  <input ref={ref} type={type} className={cn(base, 'h-9', className)} {...props} />
));
Input.displayName = 'Input';

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(base, 'min-h-24 py-2', className)} {...props} />
));
Textarea.displayName = 'Textarea';

export const NativeSelect = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select ref={ref} className={cn(base, 'select-chevron h-9 appearance-none pr-9', className)} {...props}>
    {children}
  </select>
));
NativeSelect.displayName = 'NativeSelect';
