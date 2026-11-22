import { Link } from 'react-router';
import { StatusBadge } from '@/components/StatusBadge';
import type { OperationalAlert } from './model';

export function OperationalAlerts({ alerts }: { alerts: OperationalAlert[] }) {
  return <section aria-labelledby="operational-alerts" className="role-surface rounded-lg border bg-card p-5 sm:p-6">
    <h2 id="operational-alerts" className="text-lg font-semibold">Demo operational alerts</h2>
    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">Derived from current demo records and India dates when this view renders. No live monitoring or notification delivery.</p>
    {alerts.length ? <ul className="mt-4 divide-y">{alerts.map(alert => <li key={alert.id} className="flex flex-wrap items-start justify-between gap-3 py-4"><div className="min-w-0 max-w-2xl"><Link className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline" to={alert.href}>{alert.title}</Link><p className="break-words text-xs leading-relaxed text-muted-foreground">{alert.description}</p></div><StatusBadge tone={alert.severity}>{alert.severity === 'danger' ? 'High' : 'Warning'}</StatusBadge></li>)}</ul> : <p className="mt-5 text-sm text-muted-foreground">No operational alerts match the current demo rules.</p>}
  </section>;
}
