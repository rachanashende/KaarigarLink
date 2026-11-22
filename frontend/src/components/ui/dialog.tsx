import { useEffect, useId, useRef, type ReactNode } from 'react';
import { cn } from '../utils';

export function Dialog({ open, onOpenChange, title, description, children, className, busy = false }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: string; description?: string;
  children: ReactNode; className?: string; busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog?.open) dialog?.showModal();
    if (!open && dialog?.open) dialog.close();
  }, [open]);
  return <dialog ref={ref} tabIndex={-1} aria-labelledby={id} aria-describedby={description ? id + '-description' : undefined}
    aria-busy={busy} onCancel={event => { event.preventDefault(); if (!busy) onOpenChange(false); }}
    onClose={() => { if (open && !busy) onOpenChange(false); }}
    onKeyDown={event => {
      if (event.key !== 'Tab') return;
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')).filter(element => element.getClientRects().length > 0);
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!first) { event.preventDefault(); event.currentTarget.focus(); return; }
      // Native modal inertness still allows browser chrome focus at the tab boundaries.
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}
    className={cn('kl-dialog m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-lg border bg-card p-6 text-foreground shadow-[0_20px_60px_rgba(13,15,20,0.12)]', className)}>
    <h2 id={id} className="text-lg font-semibold">{title}</h2>
    {description && <p id={id + '-description'} className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>}
    {children}
  </dialog>;
}
