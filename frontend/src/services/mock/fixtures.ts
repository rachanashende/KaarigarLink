import { enrichInspections } from './inspectionFixtures';
import { orderJobs, orderQuotes, orders, orderInspections, orderActivity } from './orderFixtures';
import { additionalUsers, additionalWorkshops, matches, invitations, quotes } from './marketplaceFixtures';
import type { Collections } from '@/types';

export const fixtures: Collections = {
  users: [
    { id: 'buyer-1', role: 'buyer', name: 'Ananya Shah', email: 'buyer@kaarigarlink.example' },
    { id: 'workshop-user-1', role: 'workshop', name: 'Ravi Patil', email: 'workshop@kaarigarlink.example' },
    { id: 'inspector-1', role: 'inspector', name: 'Meera Rao', email: 'inspector@kaarigarlink.example' },
    { id: 'admin-1', role: 'admin', name: 'Platform Admin', email: 'admin@kaarigarlink.example' },
    ...additionalUsers,
  ],
  workshops: [{
    id: 'workshop-1', ownerId: 'workshop-user-1', name: 'Sahyadri Precision Works',
    rating: 4.7, location: { city: 'Pune', state: 'Maharashtra' }, capabilities: ['CNC machining'],
    machines: [{ id: 'machine-1', name: 'CNC turning centre', process: 'Turning' }, { id: 'machine-1b', name: '3-axis CNC mill', process: 'Milling' }],
    capacitySlots: [{ id: 'capacity-1', startsOn: '2026-11-20', endsOn: '2026-12-15', availableQuantity: 500, unit: 'pieces' }],
  }, ...additionalWorkshops],
  jobs: [{
    id: 'job-1', buyerId: 'buyer-1', title: 'Machine aluminium mounting brackets',
    description: 'Produce mounting brackets for a small assembly run.', capability: 'CNC machining',
    material: 'Aluminium 6061', specification: 'Follow drawing revision A; deburr all edges.',
    createdAt: '2026-11-14T05:00:00.000Z', quantity: 200, unit: 'pieces', processes: ['Milling', 'Drilling'], deadline: '2026-12-15',
    location: { city: 'Mumbai', state: 'Maharashtra' }, budget: 60000, designFiles: [], status: 'POSTED',
  },
  {
    id: 'job-2', buyerId: 'buyer-1', title: 'Fabricate powder-coated control enclosures',
    description: 'Fold and fabricate electrical control enclosures for an industrial automation assembly.',
    capability: 'Sheet metal fabrication', material: 'CRCA steel, 1.6 mm',
    specification: 'Powder coat RAL 7035. Keep mounting holes free of coating.',
    quantity: 80, unit: 'pieces', processes: ['Laser cutting', 'Press brake bending', 'Powder coating'],
    deadline: '2026-12-05', createdAt: '2026-11-17T04:30:00.000Z',
    location: { city: 'Pune', state: 'Maharashtra' }, budget: 120000, designFiles: [], status: 'QUOTING',
  },
  {
    id: 'job-3', buyerId: 'buyer-1', title: 'Turn brass bushings for pump assemblies',
    description: 'Machine a small batch of brass bushings for agricultural pump maintenance kits.',
    capability: 'CNC turning', material: 'Brass IS 319',
    specification: 'Maintain bore tolerance as specified in the purchase drawing.',
    quantity: 500, unit: 'pieces', processes: ['CNC lathe', 'Bore finishing'],
    deadline: '2026-12-10', createdAt: '2026-11-16T07:00:00.000Z',
    location: { city: 'Ahmedabad', state: 'Gujarat' }, budget: 85000, designFiles: [], status: 'POSTED',
  },
  {
    id: 'job-4', buyerId: 'buyer-1', title: 'Grind stainless steel drive shafts',
    description: 'Finish grind stainless steel shafts for a conveyor drive subassembly.',
    capability: 'Precision grinding', material: 'Stainless steel 304', specification: '',
    quantity: 60, unit: 'pieces', processes: ['Cylindrical grinding', 'Surface finishing'],
    deadline: '2026-11-30', createdAt: '2026-11-15T06:00:00.000Z',
    location: { city: 'Coimbatore', state: 'Tamil Nadu' }, designFiles: [], status: 'POSTED',
  }, ...orderJobs],
  matches, invitations, quotes: [...quotes, ...orderQuotes], orders, milestones: orders.flatMap(order => order.milestones),
  inspections: enrichInspections(orderInspections), payments: [], reviews: [], auditEvents: [...orderActivity,
    { id: 'seed-event-1', actorId: 'buyer-1', entityId: 'job-1', entityType: 'Job', action: 'JOB_POSTED', occurredAt: '2026-11-14T05:00:00.000Z' },
    { id: 'seed-event-2', actorId: 'buyer-1', entityId: 'job-2', entityType: 'Job', action: 'JOB_POSTED', occurredAt: '2026-11-17T04:30:00.000Z' },
    { id: 'seed-event-3', actorId: 'buyer-1', entityId: 'job-3', entityType: 'Job', action: 'JOB_POSTED', occurredAt: '2026-11-16T07:00:00.000Z' },
    { id: 'seed-event-4', actorId: 'buyer-1', entityId: 'job-4', entityType: 'Job', action: 'JOB_POSTED', occurredAt: '2026-11-15T06:00:00.000Z' }
  ],
};
