import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useServices } from '@/app/services';
import { useAuth } from '@/features/auth/context';
import { Button } from '@/components/ui/button';
import { FormField, controlClass } from '@/components/FormField';
import { StatusBadge } from '@/components/StatusBadge';
import { DataTable } from '@/components/DataTable';
import { ErrorState, LoadingState } from '@/components/feedback';
import { dateLabel } from '@/features/buyer/model';
import {
  MACHINE_STATUSES, MACHINE_TYPES, PROCESSES, QUANTITY_UNITS, capabilityInputSchema, capacityInputSchema, machineInputSchema,
  workshopProfileSchema, type WorkshopProfileRecord,
} from '@/services/workshop';

/**
 * Live-mode workshop profile management (PUT /workshops/:id and the machines,
 * capabilities and capacity sub-resources). Rendered only when the data service
 * implements the profile commands; the backend enforces ownership and resets
 * VERIFIED status when verified details change.
 */
const label = (value: string) => value.replaceAll('_', ' ').toLowerCase().replace(/^./, c => c.toUpperCase());
const numberOrNull = (value: string) => value.trim() === '' ? null : Number(value);

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return <section className="space-y-4 rounded-lg border bg-card p-5 sm:p-6"><h2 className="text-lg font-semibold">{title}</h2>{children}</section>;
}

export function WorkshopProfileEditor() {
  const { workshop } = useServices(); const { user } = useAuth(); const cache = useQueryClient();
  const enabled = !!workshop.getProfileRecord;
  const query = useQuery({ queryKey: ['workshop', user?.id, 'profile-record'], queryFn: () => workshop.getProfileRecord!(user!.id), enabled: enabled && !!user });
  const command = useMutation({
    mutationFn: async (run: () => Promise<void>) => run(),
    onSettled: () => cache.invalidateQueries({ queryKey: ['workshop', user?.id] }),
  });
  // Kept here, not in ProfileForms: the forms remount with fresh data after every save,
  // which would otherwise discard the success message (M13).
  const [notice, setNotice] = useState('');
  if (!enabled) return null;
  if (query.isPending) return <LoadingState label="Loading editable profile…" />;
  if (query.isError) return <ErrorState message={query.error.message} onRetry={() => { void query.refetch(); }} />;
  return <ProfileForms key={query.data.id + query.dataUpdatedAt} record={query.data} run={async action => { await command.mutateAsync(action); }} busy={command.isPending} error={command.error?.message ?? ''} notice={notice} setNotice={setNotice} />;
}

function ProfileForms({ record, run, busy, error, notice, setNotice }: { record: WorkshopProfileRecord; run: (action: () => Promise<void>) => Promise<void>; busy: boolean; error: string; notice: string; setNotice: (value: string) => void }) {
  const { workshop } = useServices(); const { user } = useAuth(); const actor = user!.id;
  const [formError, setFormError] = useState('');
  const [profile, setProfile] = useState({
    businessName: record.businessName, description: record.description, address: record.address, city: record.city,
    latitude: record.latitude === null ? '' : String(record.latitude), longitude: record.longitude === null ? '' : String(record.longitude),
    certifications: record.certifications.join(', '),
  });
  const emptyMachine = { id: '', machineName: '', machineType: 'CNC_MILL', quantity: '1', operationalStatus: 'OPERATIONAL' };
  const [machine, setMachine] = useState(emptyMachine);
  const emptyCapability = { id: '', manufacturingProcess: 'CNC_MACHINING', supportedMaterials: '', leadTimeDays: '0' };
  const [capability, setCapability] = useState(emptyCapability);
  const emptyCapacity = { id: '', availableCapacity: '', capacityUnit: 'UNITS', startDate: '', endDate: '' };
  const [capacity, setCapacity] = useState(emptyCapacity);

  async function act(action: () => Promise<void>, done: string, reset?: () => void) {
    setNotice(''); setFormError('');
    try { await run(action); setNotice(done); reset?.(); } catch { /* the service error is shown below */ }
  }
  function invalid(message: string | undefined) { setNotice(''); setFormError(message ?? 'Check the form.'); }

  function saveProfile() {
    const parsed = workshopProfileSchema.safeParse({
      businessName: profile.businessName, description: profile.description, address: profile.address, city: profile.city,
      latitude: numberOrNull(profile.latitude), longitude: numberOrNull(profile.longitude),
      certifications: profile.certifications.split(',').map(item => item.trim()).filter(Boolean),
    });
    if (!parsed.success) return invalid(parsed.error.issues[0]?.message);
    void act(() => workshop.updateProfile!(actor, parsed.data), record.verificationStatus === 'VERIFIED' ? 'Profile saved. Changing verified details returns the workshop to pending verification.' : 'Profile saved.');
  }
  function saveMachine() {
    const parsed = machineInputSchema.safeParse({ machineName: machine.machineName, machineType: machine.machineType, quantity: Number(machine.quantity), operationalStatus: machine.operationalStatus });
    if (!parsed.success) return invalid(parsed.error.issues[0]?.message);
    void act(() => workshop.saveMachine!(actor, parsed.data, machine.id || undefined), machine.id ? 'Machine updated.' : 'Machine added.', () => setMachine(emptyMachine));
  }
  function saveCapability() {
    const parsed = capabilityInputSchema.safeParse({
      manufacturingProcess: capability.manufacturingProcess, leadTimeDays: Number(capability.leadTimeDays),
      supportedMaterials: capability.supportedMaterials.split(',').map(item => item.trim()).filter(Boolean),
    });
    if (!parsed.success) return invalid(parsed.error.issues[0]?.message);
    void act(() => workshop.saveCapability!(actor, parsed.data, capability.id || undefined), capability.id ? 'Capability updated.' : 'Capability added.', () => setCapability(emptyCapability));
  }
  function saveCapacity() {
    const parsed = capacityInputSchema.safeParse({ availableCapacity: Number(capacity.availableCapacity), capacityUnit: capacity.capacityUnit, startDate: capacity.startDate, endDate: capacity.endDate });
    if (!parsed.success) return invalid(parsed.error.issues[0]?.message);
    void act(() => workshop.saveCapacity!(actor, parsed.data, capacity.id || undefined), capacity.id ? 'Capacity window updated.' : 'Capacity window added.', () => setCapacity(emptyCapacity));
  }

  const completeness: [string, boolean][] = [
    ['Address and city', !!record.address && !!record.city], ['Map location (latitude and longitude)', record.latitude !== null && record.longitude !== null],
    ['At least one machine', record.machines.length > 0], ['At least one capability', record.capabilities.length > 0],
    ['At least one capacity window', record.capacities.length > 0],
  ];
  const text = (key: keyof typeof profile, title: string, max: number, extra: { optional?: boolean; hint?: string } = {}) =>
    <FormField id={'profile-' + key} label={title} {...(extra.optional ? { optional: true } : {})} {...(extra.hint ? { hint: extra.hint } : {})}>{props => <input {...props} maxLength={max} className={controlClass} value={profile[key]} onChange={event => setProfile(previous => ({ ...previous, [key]: event.target.value }))} />}</FormField>;

  return <div className="space-y-6">
    {notice && <p role="status" className="rounded-md border bg-secondary p-3 text-sm">{notice}</p>}
    {(formError || error) && <p role="alert" className="rounded-md border border-destructive/30 p-3 text-sm text-destructive">{formError || error}</p>}
    <Panel title="Verification and completeness">
      <div className="flex flex-wrap items-center gap-3"><StatusBadge tone={record.verificationStatus === 'VERIFIED' ? 'info' : record.verificationStatus === 'REJECTED' ? 'danger' : 'warning'}>{label(record.verificationStatus)}</StatusBadge>
        <span className="text-sm text-muted-foreground">Rating {record.ratingCount ? record.rating.toFixed(1) + ' from ' + record.ratingCount + ' ratings' : 'not yet rated'} · {record.totalCompletedJobs} completed jobs</span></div>
      <p className="text-xs text-muted-foreground">Only verified workshops appear in buyer matching. An admin reviews your profile; changing verified details (name, address, city, location, certifications) returns it to pending.</p>
      <ul className="space-y-2 text-sm">{completeness.map(([item, done]) => <li key={item}>{done ? '✓' : '○'} {item}</li>)}</ul>
    </Panel>
    <Panel title="Edit workshop profile">
      <form noValidate className="grid gap-4 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); saveProfile(); }}>
        {text('businessName', 'Business name', 120)}
        {text('city', 'City', 100, { optional: true })}
        {text('address', 'Address', 300, { optional: true })}
        {text('certifications', 'Certifications', 1100, { optional: true, hint: 'Comma-separated, for example ISO 9001, IATF 16949.' })}
        {text('latitude', 'Latitude', 20, { optional: true, hint: 'Decimal degrees. Enter with longitude, or leave both empty.' })}
        {text('longitude', 'Longitude', 20, { optional: true })}
        <div className="sm:col-span-2"><FormField id="profile-description" label="Description" optional>{props => <textarea {...props} rows={3} maxLength={2000} className={controlClass} value={profile.description} onChange={event => setProfile(previous => ({ ...previous, description: event.target.value }))} />}</FormField></div>
        <div className="sm:col-span-2"><Button type="submit" disabled={busy}>Save profile</Button></div>
      </form>
    </Panel>
    <Panel title="Machinery">
      <DataTable caption="Workshop machinery" rows={record.machines} rowKey={row => row.id} emptyTitle="No machines yet" emptyDescription="Add the machines you operate; matching uses them." columns={[
        { key: 'name', header: 'Machine', cell: row => row.machineName },
        { key: 'type', header: 'Type / quantity', cell: row => label(row.machineType) + ' · ' + row.quantity },
        { key: 'status', header: 'Status', cell: row => label(row.operationalStatus) },
        { key: 'actions', header: 'Actions', cell: row => <div className="flex min-w-44 flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={() => setMachine({ id: row.id, machineName: row.machineName, machineType: row.machineType, quantity: String(row.quantity), operationalStatus: row.operationalStatus })}>Edit</Button><Button variant="outline" disabled={busy} onClick={() => { void act(() => workshop.deleteMachine!(actor, row.id), 'Machine removed.'); }}>Remove</Button></div> },
      ]} />
      <form noValidate className="grid gap-4 border-t pt-4 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); saveMachine(); }}>
        <FormField id="machine-name" label="Machine name">{props => <input {...props} maxLength={120} className={controlClass} value={machine.machineName} onChange={event => setMachine({ ...machine, machineName: event.target.value })} />}</FormField>
        <FormField id="machine-type" label="Machine type">{props => <select {...props} className={controlClass} value={machine.machineType} onChange={event => setMachine({ ...machine, machineType: event.target.value })}>{MACHINE_TYPES.map(value => <option key={value} value={value}>{label(value)}</option>)}</select>}</FormField>
        <FormField id="machine-quantity" label="Quantity">{props => <input {...props} type="number" min="1" max="10000" step="1" className={controlClass} value={machine.quantity} onChange={event => setMachine({ ...machine, quantity: event.target.value })} />}</FormField>
        <FormField id="machine-status" label="Operational status">{props => <select {...props} className={controlClass} value={machine.operationalStatus} onChange={event => setMachine({ ...machine, operationalStatus: event.target.value })}>{MACHINE_STATUSES.map(value => <option key={value} value={value}>{label(value)}</option>)}</select>}</FormField>
        <div className="flex flex-wrap gap-3 sm:col-span-2"><Button type="submit" disabled={busy}>{machine.id ? 'Save machine' : 'Add machine'}</Button>{machine.id && <Button variant="outline" onClick={() => setMachine(emptyMachine)}>Cancel edit</Button>}</div>
      </form>
    </Panel>
    <Panel title="Manufacturing capabilities">
      <DataTable caption="Workshop capabilities" rows={record.capabilities} rowKey={row => row.id} emptyTitle="No capabilities yet" emptyDescription="Add the processes you offer and the materials you work with." columns={[
        { key: 'process', header: 'Process', cell: row => label(row.manufacturingProcess) },
        { key: 'materials', header: 'Materials', cell: row => <p className="min-w-44">{row.supportedMaterials.join(', ')}</p> },
        { key: 'lead', header: 'Lead time', cell: row => row.leadTimeDays + ' days' },
        { key: 'actions', header: 'Actions', cell: row => <div className="flex min-w-44 flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={() => setCapability({ id: row.id, manufacturingProcess: row.manufacturingProcess, supportedMaterials: row.supportedMaterials.join(', '), leadTimeDays: String(row.leadTimeDays) })}>Edit</Button><Button variant="outline" disabled={busy} onClick={() => { void act(() => workshop.deleteCapability!(actor, row.id), 'Capability removed.'); }}>Remove</Button></div> },
      ]} />
      <form noValidate className="grid gap-4 border-t pt-4 sm:grid-cols-3" onSubmit={event => { event.preventDefault(); saveCapability(); }}>
        <FormField id="capability-process" label="Process" {...(capability.id ? { hint: 'The process of an existing capability cannot change.' } : {})}>{props => <select {...props} disabled={!!capability.id} className={controlClass} value={capability.manufacturingProcess} onChange={event => setCapability({ ...capability, manufacturingProcess: event.target.value })}>{PROCESSES.map(value => <option key={value} value={value}>{label(value)}</option>)}</select>}</FormField>
        <FormField id="capability-materials" label="Supported materials" hint="Comma-separated.">{props => <input {...props} className={controlClass} value={capability.supportedMaterials} onChange={event => setCapability({ ...capability, supportedMaterials: event.target.value })} />}</FormField>
        <FormField id="capability-lead" label="Lead time (days)">{props => <input {...props} type="number" min="0" max="365" step="1" className={controlClass} value={capability.leadTimeDays} onChange={event => setCapability({ ...capability, leadTimeDays: event.target.value })} />}</FormField>
        <div className="flex flex-wrap gap-3 sm:col-span-3"><Button type="submit" disabled={busy}>{capability.id ? 'Save capability' : 'Add capability'}</Button>{capability.id && <Button variant="outline" onClick={() => setCapability(emptyCapability)}>Cancel edit</Button>}</div>
      </form>
    </Panel>
    <Panel title="Published capacity">
      <DataTable caption="Capacity windows" rows={record.capacities} rowKey={row => row.id} emptyTitle="No capacity windows yet" emptyDescription="Publish how much you can produce in a date range; matching checks it against job deadlines." columns={[
        { key: 'quantity', header: 'Available', cell: row => row.availableCapacity.toLocaleString('en-IN') + ' ' + label(row.capacityUnit) },
        { key: 'window', header: 'Window', cell: row => dateLabel(row.startDate) + ' – ' + dateLabel(row.endDate) },
        { key: 'actions', header: 'Actions', cell: row => <div className="flex min-w-44 flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={() => setCapacity({ id: row.id, availableCapacity: String(row.availableCapacity), capacityUnit: row.capacityUnit, startDate: row.startDate, endDate: row.endDate })}>Edit</Button><Button variant="outline" disabled={busy} onClick={() => { void act(() => workshop.deleteCapacity!(actor, row.id), 'Capacity window removed.'); }}>Remove</Button></div> },
      ]} />
      <form noValidate className="grid gap-4 border-t pt-4 sm:grid-cols-2" onSubmit={event => { event.preventDefault(); saveCapacity(); }}>
        <FormField id="capacity-amount" label="Available capacity" hint="0 means fully booked for this window (updates only).">{props => <input {...props} type="number" min="0" step="1" className={controlClass} value={capacity.availableCapacity} onChange={event => setCapacity({ ...capacity, availableCapacity: event.target.value })} />}</FormField>
        <FormField id="capacity-unit" label="Unit">{props => <select {...props} className={controlClass} value={capacity.capacityUnit} onChange={event => setCapacity({ ...capacity, capacityUnit: event.target.value })}>{QUANTITY_UNITS.map(value => <option key={value} value={value}>{label(value)}</option>)}</select>}</FormField>
        <FormField id="capacity-start" label="Start date">{props => <input {...props} type="date" className={controlClass} value={capacity.startDate} onChange={event => setCapacity({ ...capacity, startDate: event.target.value })} />}</FormField>
        <FormField id="capacity-end" label="End date">{props => <input {...props} type="date" className={controlClass} value={capacity.endDate} onChange={event => setCapacity({ ...capacity, endDate: event.target.value })} />}</FormField>
        <div className="flex flex-wrap gap-3 sm:col-span-2"><Button type="submit" disabled={busy}>{capacity.id ? 'Save capacity window' : 'Add capacity window'}</Button>{capacity.id && <Button variant="outline" onClick={() => setCapacity(emptyCapacity)}>Cancel edit</Button>}</div>
      </form>
    </Panel>
  </div>;
}
