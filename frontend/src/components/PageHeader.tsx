import type { ReactNode } from 'react';
export function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <div className="kl-page-header mb-8 flex flex-wrap items-start justify-between gap-5 border-b pb-8">
    <div className="min-w-0 max-w-full"><h1 className="kl-page-title break-words">{title}</h1>{description && <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>}</div>
    {action}
  </div>;
}
