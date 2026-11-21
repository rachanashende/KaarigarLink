import { useState } from 'react';
import { Card, FilterPanel, Notice, Pagination, SearchField, SectionLabel } from '@/components/design-system';
import { DataTable } from '@/components/DataTable';
import { StatusBadge } from '@/components/StatusBadge';
import { Button } from '@/components/ui/button';
import { ConfirmationDialog } from '@/components/ConfirmationDialog';

export function DesignSystemPreview() {
  const [showColors, setShowColors] = useState(true);
  const [page, setPage] = useState(1); const [query, setQuery] = useState(''); const [open, setOpen] = useState(false);
  const specimens = [
    { id: '01', name: 'Cobalt', value: '#2F37D9', purpose: 'Actions and focus' },
    { id: '02', name: 'Ink', value: '#0D0F14', purpose: 'Headlines and interface text' },
    { id: '03', name: 'Slate', value: '#51556A', purpose: 'Supporting descriptions' },
    { id: '04', name: 'White', value: '#FFFFFF', purpose: 'Canvas and surfaces' },
  ];
  const filtered = specimens.filter(item => (item.name + item.purpose).toLowerCase().includes(query.toLowerCase()));
  return <section aria-labelledby="design-system-heading" className="mt-16 space-y-8 border-t pt-12">
    <SectionLabel>Phase 9A / Shared system</SectionLabel>
    <div><h2 id="design-system-heading" className="text-3xl font-bold tracking-tight">Precision, shared.</h2><p className="mt-4 max-w-xl text-sm text-muted-foreground">Verified typography and color, with reusable controls for every manufacturing workspace.</p></div>
    <div className="grid gap-6 md:grid-cols-[220px_minmax(0,1fr)]">
      <Card className="self-start">
        <h3 className="font-semibold">Control specimens</h3>
        <FilterPanel title="Display options" open><label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={showColors} onChange={event => setShowColors(event.target.checked)} />Show reference colors</label></FilterPanel>
        <p className="mt-4 text-xs leading-relaxed text-muted-foreground">These controls demonstrate the shared system. They do not change marketplace data.</p>
      </Card>
      <div className="min-w-0 space-y-5">
        <SearchField label="Search design tokens" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} />
        <DataTable caption="Design token specimens" columns={[
          { key: 'name', header: 'Token', cell: row => <span className="flex items-center gap-3">{showColors && <span aria-hidden="true" className="size-4 shrink-0 border" style={{ backgroundColor: row.value }} />}{row.name}</span> },
          { key: 'value', header: 'Value', cell: row => <code className="font-mono text-xs">{row.value}</code> },
          { key: 'purpose', header: 'Use', cell: row => row.purpose },
        ]} rows={filtered.slice((page - 1) * 2, page * 2)} rowKey={row => row.id} emptyTitle="No matching tokens" emptyDescription="Try Cobalt, Ink, Slate or White." />
        <Pagination page={page} pageCount={Math.ceil(filtered.length / 2)} onPageChange={setPage} />
      </div>
    </div>
    <div className="kl-stagger grid gap-4 sm:grid-cols-3">
      <Card><h3 className="mb-4 font-medium">Primary action</h3><Button onClick={() => setOpen(true)}>Preview confirmation</Button></Card>
      <Card><h3 className="mb-4 font-medium">Secondary action</h3><Button variant="outline" disabled>Unavailable action</Button></Card>
      <Card><h3 className="mb-4 font-medium">Text status</h3><StatusBadge tone="info">Local mock</StatusBadge></Card>
    </div>
    <Notice>Design preview only. Business permissions and existing blocked actions are unchanged.</Notice>
    <ConfirmationDialog open={open} onOpenChange={setOpen} title="Shared confirmation preview" description="This specimen uses the existing accessible dialog. Closing it does not perform a business action." confirmLabel="Close preview" onConfirm={() => setOpen(false)} />
  </section>;
}
