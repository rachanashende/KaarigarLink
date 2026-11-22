import type { Collections } from '@/types';

export const additionalUsers: Collections['users'] = [
  { id: 'workshop-user-2', role: 'workshop', name: 'Kiran Deshmukh', email: 'pragati@kaarigarlink.example' },
  { id: 'workshop-user-3', role: 'workshop', name: 'Sana Kulkarni', email: 'deccan@kaarigarlink.example' },
  { id: 'workshop-user-4', role: 'workshop', name: 'Amit Jadhav', email: 'vishwakarma@kaarigarlink.example' },
];
export const additionalWorkshops: Collections['workshops'] = [
  { id: 'workshop-2', ownerId: 'workshop-user-2', name: 'Pragati CNC Components', location: { city: 'Nashik', state: 'Maharashtra' }, capabilities: ['CNC machining'], machines: [{ id: 'machine-2', name: '3-axis machining centre', process: 'Milling' }, { id: 'machine-2b', name: 'CNC drill', process: 'Drilling' }], capacitySlots: [{ id: 'capacity-2', startsOn: '2026-11-22', endsOn: '2026-12-14', availableQuantity: 300, unit: 'pieces' }], rating: 4.5 },
  { id: 'workshop-3', ownerId: 'workshop-user-3', name: 'Deccan Toolcraft', location: { city: 'Pune', state: 'Maharashtra' }, capabilities: ['CNC machining', 'Tool making'], machines: [{ id: 'machine-3', name: 'Vertical machining centre', process: 'Milling and drilling' }], capacitySlots: [{ id: 'capacity-3', startsOn: '2026-11-21', endsOn: '2026-12-15', availableQuantity: 400, unit: 'pieces' }] },
  { id: 'workshop-4', ownerId: 'workshop-user-4', name: 'Vishwakarma Sheet Metal', location: { city: 'Pune', state: 'Maharashtra' }, capabilities: ['Sheet metal fabrication'], machines: [{ id: 'machine-4', name: 'Laser cutter', process: 'Laser cutting' }, { id: 'machine-4b', name: 'Press brake', process: 'Bending' }], capacitySlots: [{ id: 'capacity-4', startsOn: '2026-11-20', endsOn: '2026-12-05', availableQuantity: 120, unit: 'pieces' }], rating: 4.2 },
];
// Fixed demo recommendations, not an implementation of Member 1's matching engine.
export const matches: Collections['matches'] = [
  { jobId: 'job-1', workshopId: 'workshop-1', score: 92, explanations: ['CNC machining capability is listed.', 'A CNC mill supports the requested milling work.', 'Published capacity is 500 pieces during the requested delivery window.'], eligibility: { eligible: true, reasons: [] } },
  { jobId: 'job-1', workshopId: 'workshop-2', score: 88, explanations: ['Milling and drilling machines are listed.', 'Published capacity is 300 pieces.', 'Capacity window ends before the requested deadline.'], eligibility: { eligible: true, reasons: [] } },
  { jobId: 'job-1', workshopId: 'workshop-3', score: 81, explanations: ['CNC machining and tool-making capabilities are listed.', 'A vertical machining centre is available.', 'Published capacity is 400 pieces in the delivery window.'], eligibility: { eligible: true, reasons: [] } },
  { jobId: 'job-1', workshopId: 'workshop-4', score: 58, explanations: ['Workshop is based in Maharashtra.', 'Its profile focuses on sheet metal fabrication.'], eligibility: { eligible: false, reasons: ['CNC machining capability is not listed for this workshop.'] } },
  { jobId: 'job-2', workshopId: 'workshop-4', score: 91, explanations: ['Sheet metal fabrication capability is listed.', 'Laser cutting and press brake machines are listed.', 'Published capacity covers the requested 80 enclosures.'], eligibility: { eligible: true, reasons: [] } },
];
export const invitations: Collections['invitations'] = [
  { id: 'seed-invitation-1', jobId: 'job-1', workshopId: 'workshop-1', status: 'ACCEPTED' },
  { id: 'seed-invitation-2', jobId: 'job-1', workshopId: 'workshop-2', status: 'ACCEPTED' },
  { id: 'seed-invitation-4', jobId: 'job-1', workshopId: 'workshop-4', status: 'DECLINED' },
  { id: 'seed-invitation-5', jobId: 'job-2', workshopId: 'workshop-4', status: 'ACCEPTED' },
];
export const quotes: Collections['quotes'] = [
  { id: 'quote-1', jobId: 'job-1', workshopId: 'workshop-1', amount: 58000, estimatedDelivery: '2026-12-12', notes: 'Includes machining and deburring. Material grade as specified in the brief. Delivery to Mumbai included.', status: 'SUBMITTED' },
  { id: 'quote-2', jobId: 'job-1', workshopId: 'workshop-2', amount: 54000, estimatedDelivery: '2026-12-14', notes: 'Includes material and machining. Drawing revision A to be confirmed before any future order.', status: 'SUBMITTED' },
  { id: 'quote-3', jobId: 'job-1', workshopId: 'workshop-4', amount: 50000, estimatedDelivery: '2026-12-10', notes: 'Rejected: this workshop does not offer the required CNC process.', status: 'REJECTED' },
  { id: 'quote-4', jobId: 'job-2', workshopId: 'workshop-4', amount: 118000, estimatedDelivery: '2026-12-04', notes: 'Includes powder coating in RAL 7035. Mounting holes kept free of coating.', status: 'SUBMITTED' },
];
