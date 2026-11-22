import type { ReactNode } from 'react';
import { CircleAlert, Inbox, LoaderCircle, ShieldAlert } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from './ui/button';

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="rounded-lg border border-dashed bg-card px-6 py-12 text-center">
    <Inbox aria-hidden="true" className="mx-auto mb-4 size-7 text-muted-foreground" />
    <h2 className="text-lg font-semibold">{title}</h2><p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">{description}</p>{action && <div className="mt-5">{action}</div>}
  </div>;
}
export function LoadingState({ label = 'Loading your workspace…' }: { label?: string }) {
  return <div role="status" className="flex min-h-48 items-center justify-center gap-3 p-6 text-sm text-muted-foreground"><LoaderCircle aria-hidden="true" className="size-5 motion-safe:animate-spin" />{label}</div>;
}
export function ErrorState({ title = 'Unable to load this page', message, onRetry }: { title?: string; message: string; onRetry?: () => void }) {
  return <div role="alert" className="rounded-lg border border-destructive/30 bg-card p-6">
    <CircleAlert aria-hidden="true" className="mb-3 size-6 text-destructive" /><h2 className="font-semibold">{title}</h2>
    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{message}</p>{onRetry && <Button variant="outline" onClick={onRetry} className="mt-4">Try again</Button>}
  </div>;
}
export function UnauthorizedState({ home }: { home: string }) {
  return <div className="rounded-lg border bg-card p-8">
    <ShieldAlert aria-hidden="true" className="mb-4 size-8 text-primary" /><h1 className="text-2xl font-semibold">Access restricted</h1>
    <p className="mt-3 text-sm leading-relaxed text-muted-foreground">This page belongs to another role. Return to the workspace available to your account.</p>
    <Button asChild className="mt-6"><Link to={home}>Return to my workspace</Link></Button>
  </div>;
}
