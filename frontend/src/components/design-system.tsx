import { useId, type ComponentProps, type ReactNode } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { NavLink } from 'react-router';
import { cn } from './utils';
import { Button } from './ui/button';
import { controlClass } from './FormField';

export function SectionLabel({ children }: { children: ReactNode }) { return <span className="kl-label">{children}</span>; }
export function EditorialHeading({ as: Tag = 'h1', children }: { as?: 'h1' | 'h2'; children: ReactNode }) { return <Tag className="kl-editorial break-words">{children}</Tag>; }
export function Card({ className, ...props }: ComponentProps<'div'>) { return <div className={cn('kl-card', className)} {...props} />; }
export function SearchField({ label, id, className, ...props }: ComponentProps<'input'> & { label: string }) {
  const generatedId = useId(); const fieldId = id ?? generatedId;
  return <div className="min-w-0"><label htmlFor={fieldId} className="mb-2 block text-sm font-medium">{label}</label><div className="relative"><Search aria-hidden="true" className="pointer-events-none absolute top-3.5 left-3 size-4 text-muted-foreground" /><input {...props} id={fieldId} type="search" className={cn(controlClass, 'pl-10', className)} /></div></div>;
}
export function FilterPanel({ title, children, ...props }: ComponentProps<'details'> & { title: string }) {
  return <details {...props} className={cn('kl-filter border-b', props.className)}><summary>{title}<ChevronDown aria-hidden="true" className="size-4 shrink-0" /></summary><div className="space-y-3 pb-5">{children}</div></details>;
}
export function NavigationTabs({ label, items }: { label: string; items: { label: string; to: string }[] }) {
  return <nav aria-label={label} className="kl-tabs">{items.map(item => <NavLink key={item.to} end to={item.to}>{item.label}</NavLink>)}</nav>;
}
export function Notice({ tone = 'info', children }: { tone?: 'info' | 'success' | 'warning'; children: ReactNode }) {
  return <div role="status" className={cn('border-l-2 bg-muted px-4 py-3 text-sm', { 'border-primary text-foreground': tone === 'info', 'border-success text-success': tone === 'success', 'border-warning text-warning': tone === 'warning' })}>{children}</div>;
}
export function Pagination({ page, pageCount, onPageChange }: { page: number; pageCount: number; onPageChange: (page: number) => void }) {
  if (pageCount < 2) return null;
  return <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3 border-t pt-5">
    <Button variant="outline" disabled={page <= 1} onClick={() => onPageChange(page - 1)}><ChevronLeft aria-hidden="true" className="size-4" />Previous</Button>
    <span aria-live="polite" className="font-mono text-xs text-muted-foreground">Page {page} of {pageCount}</span>
    <Button variant="outline" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>Next<ChevronRight aria-hidden="true" className="size-4" /></Button>
  </nav>;
}
