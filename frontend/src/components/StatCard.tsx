import type { ReactNode } from 'react';
export function StatCard({ label, value, detail, icon }: { label: string; value: ReactNode; detail?: string; icon?: ReactNode }) {
  return <div role="group" aria-label={label} className="rounded-lg border bg-card p-5 sm:p-6">
    <div className="flex min-h-15 items-start justify-between gap-3 sm:min-h-10"><h2 className="text-sm font-medium text-muted-foreground">{label}</h2>{icon && <span aria-hidden="true" className="text-primary">{icon}</span>}</div>
    <p className="kl-stat-value mt-5">{value}</p>
    {detail && <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{detail}</p>}
  </div>;
}
