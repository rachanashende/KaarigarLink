import type { ReactNode } from 'react';
import { cn } from './utils';
export function StatusBadge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'info' | 'warning' | 'danger' }) {
  return <span className={cn('inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 text-xs font-medium',
    { 'border-border bg-muted text-muted-foreground': tone === 'neutral', 'border-primary/20 bg-secondary text-primary': tone === 'info', 'border-warning/30 bg-warning/5 text-warning': tone === 'warning', 'border-destructive/30 bg-destructive/5 text-destructive': tone === 'danger' })}>{children}</span>;
}
