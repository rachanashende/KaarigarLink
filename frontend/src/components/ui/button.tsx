import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '../utils';

const variants = cva('kl-button inline-flex min-h-11 items-center justify-center gap-2 px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50', {
  variants: { variant: { default: 'kl-button-primary font-mono text-xs tracking-[.06em] text-primary-foreground', outline: 'border border-border bg-card text-foreground hover:bg-muted' } },
  defaultVariants: { variant: 'default' },
});

export function Button({ className, variant, asChild = false, type = 'button', ...props }: ComponentProps<'button'> & VariantProps<typeof variants> & { asChild?: boolean }) {
  const Component = asChild ? Slot : 'button';
  return <Component {...(!asChild ? { type } : {})} className={cn(variants({ variant }), className)} {...props} />;
}
