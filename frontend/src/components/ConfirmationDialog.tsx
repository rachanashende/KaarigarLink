import { Dialog } from './ui/dialog';
import { Button } from './ui/button';
export function ConfirmationDialog({ open, onOpenChange, title, description, confirmLabel, onConfirm, busy = false, error }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: string; description: string;
  confirmLabel: string; onConfirm: () => void; busy?: boolean; error?: string | null;
}) {
  return <Dialog open={open} onOpenChange={onOpenChange} title={title} description={description} busy={busy}>
    {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
    <div className="mt-6 flex flex-wrap justify-end gap-3">
      <Button autoFocus variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>Cancel</Button>
      <Button disabled={busy} onClick={onConfirm}>{busy ? 'Please wait…' : confirmLabel}</Button>
    </div>
  </Dialog>;
}
