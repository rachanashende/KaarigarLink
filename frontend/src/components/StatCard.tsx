import type { ReactNode } from 'react';
export function StatCard({ label, value, detail, icon }: { label: string; value: ReactNode; detail?: string; icon?: ReactNode }) {
  return <div role="group" aria-label={label} className="rounded-lg border bg-card p-5">
    <div className="flex items-center justify-between gap-3"><h2 className="text-sm text-muted-foreground">{label}</h2>{icon && <span aria-hidden="true" className="text-primary">{icon}</span>}</div>
    <p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p>
    {detail && <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{detail}</p>}
  </div>;
}
