import { beforeEach, expect, it, vi } from 'vitest';
import { createMockStore } from './mock/store';
import { createMockService } from './adapters/mock';
import { fixtures } from './mock/fixtures';
import { DEMO_DATA_KEY } from './mock/persistence';
import type { InspectionFindings } from '@/types';

beforeEach(() => sessionStorage.clear());
function setup() { const store = createMockStore(); return { store, service: createMockService(store) }; }
function findings(): InspectionFindings {
  const checklist = fixtures.inspections.find(item => item.id === 'inspection-qc')!.checklist!;
  return { summary: 'Human inspection confirmed the drawing requirements.', items: checklist.map(check => ({ id: check.id, result: 'PASS', notes: '', evidence: check.evidenceRequired ? [{ id: 'f', name: 'private-qc.pdf', mediaType: 'application/pdf', sizeBytes: 1024 }] : [] })) };
}
function rework() {
  const data = findings(); data.items.find(item => item.id === 'finish')!.result = 'FAIL'; data.items.find(item => item.id === 'finish')!.notes = 'Bore finish exceeds the drawing requirement.';
  return { decision: 'REWORK' as const, findings: data, reason: 'Surface finish requires correction.', correctiveAction: 'Refinish the bore and present a fresh measurement report.', reworkDeadline: '2099-01-01' };
}
it('joins only assigned records and reports valid pending, accepted and overdue rework snapshots', async () => {
  const { service } = setup(); const rows = await service.inspector.listInspections('inspector-1');
  expect(rows).toHaveLength(5);
  expect(rows.find(item => item.inspection.id === 'inspection-qc')?.canDecide).toBe(true);
  for (const item of rows) {
    expect(item.inspector.id).toBe('inspector-1'); expect(item.order.id).toBe(item.inspection.orderId);
    expect(item.buyer.id).toBe(item.order.buyerId); expect(item.job.buyerId).toBe(item.buyer.id);
  }
});
it('enforces assignment and roles on every read/write, including private IDs', async () => {
  const { store, service } = setup();
  store.commit(state => {
    state.users.push({ id: 'inspector-2', role: 'inspector', name: 'Other inspector', email: 'other-inspector@kaarigarlink.example' });
    state.inspections.find(item => item.id === 'inspection-qc')!.inspectorId = 'inspector-2';
  });
  expect(await service.inspector.listInspections('inspector-1')).toHaveLength(4);
  for (const id of ['inspection-qc', 'missing']) {
    await expect(service.inspector.getInspection('inspector-1', id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(service.inspector.saveDraft('inspector-1', id, findings())).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(service.inspector.submitDecision('inspector-1', id, { decision: 'ACCEPTED', findings: findings() })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  }
  await expect(service.inspector.listInspections('buyer-1')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  await expect(service.inspector.listInspections('unknown')).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  await expect(service.inspector.submitDecision('admin-1', 'inspection-qc', { decision: 'ACCEPTED', findings: findings() })).rejects.toMatchObject({ code: 'FORBIDDEN' });
});
it('preserves partial draft findings, isolates buyers from drafts and does not record a decision', async () => {
  const { service, store } = setup(); const draft = findings(); draft.items[0]!.result = 'UNRECORDED'; draft.summary = '';
  const before = store.snapshot();
  await service.inspector.saveDraft('inspector-1', 'inspection-qc', draft);
  expect((await service.inspector.getInspection('inspector-1', 'inspection-qc')).inspection.draft).toEqual(draft);
  expect((await service.buyer.getOrder('buyer-1', 'order-qc')).inspections[0]).not.toHaveProperty('draft');
  expect(store.snapshot().orders).toEqual(before.orders);
  expect(store.snapshot().inspections.find(item => item.id === 'inspection-qc')?.history).toEqual([]);
  draft.items.length = 0;
  expect((await service.inspector.getInspection('inspector-1', 'inspection-qc')).inspection.draft?.items).toHaveLength(4);
});
it('accepts exactly once, records identity/time and publishes QC without production/payment/closure mutations', async () => {
  const { service, store } = setup(); const before = store.snapshot();
  const results = await Promise.allSettled([service.inspector.submitDecision('inspector-1', 'inspection-qc', { decision: 'ACCEPTED', findings: findings() }), service.inspector.submitDecision('inspector-1', 'inspection-qc', { decision: 'ACCEPTED', findings: findings() })]);
  expect(results.map(result => result.status)).toEqual(['fulfilled', 'rejected']);
  const after = await service.inspector.getInspection('inspector-1', 'inspection-qc');
  expect(after.inspection.history).toHaveLength(1);
  expect(after.inspection.history![0]).toMatchObject({ inspectorId: 'inspector-1', decision: 'ACCEPTED' });
  expect(Number.isNaN(Date.parse(after.inspection.history![0]!.submittedAt))).toBe(false);
  expect(after.canDecide).toBe(false);
  const buyer = await service.buyer.getOrder('buyer-1', 'order-qc');
  expect(buyer.order.status).toBe('QC_PENDING'); expect(buyer.order.qcStatus).toBe('ACCEPTED');
  expect(buyer.inspections[0]?.decision).toBe('ACCEPTED');
  expect(store.snapshot().jobs).toEqual(before.jobs); expect(store.snapshot().quotes).toEqual(before.quotes);
  expect(store.snapshot().milestones).toEqual(before.milestones); expect(store.snapshot().payments).toEqual(before.payments);
  expect(store.snapshot().auditEvents).toHaveLength(before.auditEvents.length + 1);
  await expect(service.inspector.saveDraft('inspector-1', 'inspection-qc', findings())).rejects.toMatchObject({ code: 'CONFLICT' });
});
it('records rework with findings, corrective action, deadline and immutable previous decisions', async () => {
  const { service, store } = setup(); const before = store.snapshot().inspections.find(item => item.id === 'inspection-rework')!;
  await service.inspector.submitDecision('inspector-1', 'inspection-qc', rework());
  const buyer = await service.buyer.getOrder('buyer-1', 'order-qc');
  expect(buyer.order).toMatchObject({ status: 'QC_PENDING', qcStatus: 'REWORK' });
  expect(buyer.inspections[0]).toMatchObject({ decision: 'REWORK', reworkDeadline: '2099-01-01' });
  expect(buyer.inspections[0]?.notes).toContain('Refinish the bore');
  expect(store.snapshot().inspections.find(item => item.id === 'inspection-rework')).toEqual(before);
});
it.each(['inspection-rework', 'inspection-closed', 'inspection-paid'])('rejects duplicate or terminal assignment %s', async id => {
  const { service } = setup();
  await expect(service.inspector.submitDecision('inspector-1', id, { decision: 'ACCEPTED', findings: findings() })).rejects.toMatchObject({ code: 'CONFLICT' });
});
it('rejects invalid order stage and missing checklist without changing the store', async () => {
  const { service, store } = setup();
  store.commit(state => { state.orders.find(order => order.id === 'order-qc')!.status = 'IN_PRODUCTION'; });
  await expect(service.inspector.submitDecision('inspector-1', 'inspection-qc', { decision: 'ACCEPTED', findings: findings() })).rejects.toMatchObject({ code: 'CONFLICT' });
  store.commit(state => { state.orders.find(order => order.id === 'order-qc')!.status = 'QC_PENDING'; state.orders.find(order => order.id === 'order-qc')!.qcStatus = 'ACCEPTED'; });
  await expect(service.inspector.submitDecision('inspector-1', 'inspection-qc', rework())).rejects.toMatchObject({ code: 'CONFLICT' });
  store.commit(state => { state.orders.find(order => order.id === 'order-qc')!.qcStatus = 'PENDING'; state.inspections.find(item => item.id === 'inspection-qc')!.checklist = []; });
  await expect(service.inspector.submitDecision('inspector-1', 'inspection-qc', rework())).rejects.toMatchObject({ code: 'CONFLICT' });
});
it.each(['required', 'summary', 'failed-accept', 'evidence', 'unknown', 'duplicate', 'na-notes', 'file-size'])('validates checklist rule %s atomically', async rule => {
  const { service, store } = setup(); const data = findings();
  if (rule === 'required') data.items[0]!.result = 'UNRECORDED';
  if (rule === 'summary') data.summary = '';
  if (rule === 'failed-accept') { data.items[0]!.result = 'FAIL'; data.items[0]!.notes = 'Out of drawing tolerance.'; }
  if (rule === 'evidence') data.items[0]!.evidence = [];
  if (rule === 'unknown') data.items[0]!.id = 'not-a-check';
  if (rule === 'duplicate') data.items[1]!.id = data.items[0]!.id;
  if (rule === 'na-notes') data.items[0]!.result = 'NOT_APPLICABLE';
  if (rule === 'file-size') data.items[0]!.evidence[0]!.sizeBytes = 11 * 1024 * 1024;
  const before = store.snapshot();
  await expect(service.inspector.submitDecision('inspector-1', 'inspection-qc', { decision: 'ACCEPTED', findings: data })).rejects.toMatchObject({ code: 'VALIDATION' });
  expect(store.snapshot()).toEqual(before);
});
it.each(['reason', 'correctiveAction', 'deadline', 'invalid-date', 'failure', 'failure-notes', 'identity'])('validates rework rule %s atomically', async rule => {
  const { service, store } = setup(); const input = rework();
  if (rule === 'reason') input.reason = ' ';
  if (rule === 'correctiveAction') input.correctiveAction = '';
  if (rule === 'deadline') input.reworkDeadline = '2020-01-01';
  if (rule === 'invalid-date') input.reworkDeadline = '2099-02-30';
  if (rule === 'failure') input.findings.items.find(item => item.id === 'finish')!.result = 'PASS';
  if (rule === 'failure-notes') input.findings.items.find(item => item.id === 'finish')!.notes = '';
  const payload = rule === 'identity' ? { ...input, inspectorId: 'inspector-2' } : input;
  const before = store.snapshot();
  await expect(service.inspector.submitDecision('inspector-1', 'inspection-qc', payload)).rejects.toMatchObject({ code: 'VALIDATION' });
  expect(store.snapshot()).toEqual(before);
});
it('migrates the Phase 4 envelope, persists drafts/decisions through the same key and resets QC', async () => {
  const original = createMockService(createMockStore(fixtures, sessionStorage));
  await original.buyer.submitReview('buyer-1', 'order-closed', { rating: 5, comment: 'Synthetic review preserved through migration.' });
  const v1 = JSON.parse(sessionStorage.getItem(DEMO_DATA_KEY)!); delete v1.inspectionUpdates; v1.version = 1;
  sessionStorage.setItem(DEMO_DATA_KEY, JSON.stringify(v1));
  let service = createMockService(createMockStore(fixtures, sessionStorage));
  expect((await service.buyer.getOrder('buyer-1', 'order-closed')).review?.rating).toBe(5);
  await service.inspector.saveDraft('inspector-1', 'inspection-qc', findings());
  expect(sessionStorage.getItem(DEMO_DATA_KEY)).not.toContain('private-qc.pdf');
  service = createMockService(createMockStore(fixtures, sessionStorage));
  expect(service.demo?.warning).toBeNull();
  expect((await service.inspector.getInspection('inspector-1', 'inspection-qc')).inspection.draft?.items[0]?.evidence).toEqual([]);
  await service.inspector.submitDecision('inspector-1', 'inspection-qc', rework());
  service = createMockService(createMockStore(fixtures, sessionStorage));
  expect(service.demo?.warning).toBeNull();
  expect((await service.buyer.getOrder('buyer-1', 'order-qc')).order).toMatchObject({ status: 'QC_PENDING', qcStatus: 'REWORK' });
  expect((await service.inspector.getInspection('inspector-1', 'inspection-qc')).inspection.history).toHaveLength(1);
  await service.demo!.reset();
  expect((await service.inspector.getInspection('inspector-1', 'inspection-qc')).inspection.decision).toBe('PENDING');
  expect(sessionStorage.getItem(DEMO_DATA_KEY)).toBeNull();
});
it('rolls back a decision and history when persistence fails', async () => {
  const store = createMockStore(fixtures, sessionStorage); const service = createMockService(store); const before = store.snapshot();
  vi.spyOn(Object.getPrototypeOf(sessionStorage) as Storage, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  await expect(service.inspector.submitDecision('inspector-1', 'inspection-qc', rework())).rejects.toMatchObject({ code: 'SERVER' });
  expect(store.snapshot()).toEqual(before);
});
it('rejects corrupted QC history rather than silently trusting reassignment', async () => {
  const service = createMockService(createMockStore(fixtures, sessionStorage));
  await service.inspector.submitDecision('inspector-1', 'inspection-qc', rework());
  const raw = JSON.parse(sessionStorage.getItem(DEMO_DATA_KEY)!);
  raw.inspectionUpdates.find((item: { inspectionId: string }) => item.inspectionId === 'inspection-qc').history[0].inspectorId = 'admin-1';
  sessionStorage.setItem(DEMO_DATA_KEY, JSON.stringify(raw));
  expect(createMockService(createMockStore(fixtures, sessionStorage)).demo?.warning).toContain('could not be restored');
});
