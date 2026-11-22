import type { Workshop } from '@/types';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { dateLabel } from './model';
import { placeLabel } from '@/components/utils';

export function WorkshopFacts({ workshop, compact = false }: { workshop: Workshop; compact?: boolean }) {
  return <dl className={compact ? "grid grid-cols-2 gap-4 text-sm" : "space-y-4 text-sm"}>
    {!compact && <div><dt className="text-xs text-muted-foreground">Location</dt><dd className="mt-1">{placeLabel(workshop.location)}</dd></div>}
    <div><dt className="text-xs text-muted-foreground">Manufacturing capabilities</dt><dd className="mt-1">{workshop.capabilities.join(', ') || 'Not listed'}</dd></div>
    <div><dt className="text-xs text-muted-foreground">Machines</dt><dd className="mt-2">{workshop.machines.length ? <ul className="space-y-2">{workshop.machines.map(machine => <li key={machine.id}>{machine.name}<span className="block text-xs text-muted-foreground">{machine.process}</span></li>)}</ul> : 'No machines listed'}</dd></div>
    <div><dt className="text-xs text-muted-foreground">Published available capacity</dt><dd className="mt-2">{workshop.capacitySlots.length ? <ul className="space-y-2">{workshop.capacitySlots.map(slot => <li key={slot.id}><span className="font-medium">{new Intl.NumberFormat('en-IN').format(slot.availableQuantity)} {slot.unit}</span><span className="block text-xs text-muted-foreground">{dateLabel(slot.startsOn)} – {dateLabel(slot.endsOn)}</span></li>)}</ul> : 'No capacity published'}</dd></div>
    <div><dt className="text-xs text-muted-foreground">Rating</dt><dd className="mt-1">{workshop.rating === undefined ? 'Not yet rated' : workshop.rating}</dd></div>
  </dl>;
}
export function WorkshopDetails({ workshop, onClose }: { workshop: Workshop | null; onClose: () => void }) {
  return <Dialog open={workshop !== null} onOpenChange={open => { if (!open) onClose(); }} title={workshop?.name ?? 'Workshop details'}>
    {workshop && <div className="mt-5"><WorkshopFacts workshop={workshop} /></div>}
    <Button autoFocus variant="outline" onClick={onClose} className="mt-6">Close details</Button>
  </Dialog>;
}
