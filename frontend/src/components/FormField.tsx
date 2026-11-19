import type { ReactNode } from 'react';
type ControlProps = { id: string; 'aria-invalid': boolean; 'aria-describedby': string | undefined };
export const controlClass = 'min-h-11 w-full rounded-md border border-input bg-card px-3 py-2 text-base text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:text-sm disabled:opacity-60';
export function FormField({ id, label, error, hint, optional = false, children }: {
  id: string; label: string; error?: string | undefined; hint?: string; optional?: boolean; children: (props: ControlProps) => ReactNode;
}) {
  return <div className="min-w-0">
    <label htmlFor={id} className="mb-2 block text-sm font-medium">{label}{optional && <span className="ml-2 font-normal text-muted-foreground">(optional)</span>}</label>
    {children({ id, 'aria-invalid': !!error, 'aria-describedby': [hint ? id + '-hint' : '', error ? id + '-error' : ''].filter(Boolean).join(' ') || undefined })}
    {hint && <p id={id + '-hint'} className="mt-2 text-xs leading-relaxed text-muted-foreground">{hint}</p>}
    {error && <p id={id + '-error'} role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
  </div>;
}
