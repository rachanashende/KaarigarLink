import request from 'supertest';
import { expect } from 'vitest';
import { app } from '../../src/app';

/** Seed ids used by the I5 order sub-resource tests. */
export const ASHA = 'seed-user-buyer-asha'; // owns BRACKETS and SHAFTS
export const VIKRAM = 'seed-user-buyer-vikram';
export const INSPECTOR = 'seed-user-inspector';
export const ADMIN = 'seed-user-admin';
export const BRACKETS = 'seed-job-alu-brackets'; // eligible: precision, mumbai, talegaon
export const SHAFTS = 'seed-job-stainless-shafts'; // eligible: precision only
export const PRECISION = 'seed-ws-precision-works';
export const MUMBAI = 'seed-ws-mumbai-metalcraft';
export const owner = (workshopId: string) => `seed-user-ws-${workshopId.replace('seed-ws-', '')}`;

export type TokenFor = (userId: string) => Promise<string>;
export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Calls the API as a seed user. `body` undefined sends no body. */
export async function api(tokenFor: TokenFor, as: string, method: 'get' | 'post' | 'patch' | 'put' | 'delete', path: string, body?: unknown) {
  const req = request(app)[method](`/api${path}`).set(auth(await tokenFor(as)));
  return body === undefined ? req : req.send(body as object);
}

/** ADMIN assigns `inspectorId` (default: the seed inspector) to the order. */
export async function assignInspector(tokenFor: TokenFor, orderId: string, inspectorId = INSPECTOR) {
  return api(tokenFor, ADMIN, 'put', `/orders/${orderId}/inspector`, { inspectorId });
}

/**
 * invite -> accept -> quote -> award, then (unless `assign` is false) the seed
 * inspector is assigned. Returns the new order id (agreed price 12500.50).
 */
export async function awardedOrder(tokenFor: TokenFor, jobId = BRACKETS, workshopId = PRECISION, totalPrice = '12500.50', assign = true) {
  const inv = await api(tokenFor, ASHA, 'post', `/jobs/${jobId}/invitations`, { workshopId });
  expect(inv.status).toBe(201);
  const invitationId: string = inv.body.data.invitation.id;
  const ws = owner(workshopId);
  expect((await api(tokenFor, ws, 'post', `/invitations/${invitationId}/respond`, { response: 'ACCEPTED' })).status).toBe(200);
  const q = await api(tokenFor, ws, 'post', `/quotes/invitations/${invitationId}`, { totalPrice, estimatedDays: 14 });
  expect(q.status).toBe(201);
  const res = await api(tokenFor, ASHA, 'post', `/orders/award/${q.body.data.quote.id}`);
  expect(res.status).toBe(201);
  const orderId = res.body.data.order.id as string;
  if (assign) expect((await assignInspector(tokenFor, orderId)).status).toBe(201);
  return orderId;
}

export async function startedOrder(tokenFor: TokenFor, jobId = BRACKETS, workshopId = PRECISION) {
  const orderId = await awardedOrder(tokenFor, jobId, workshopId);
  expect((await api(tokenFor, owner(workshopId), 'post', `/orders/${orderId}/start`)).status).toBe(200);
  return orderId;
}

export async function inspect(tokenFor: TokenFor, orderId: string, status: 'PASSED' | 'FAILED' | 'REWORK_REQUIRED', findings?: string) {
  return api(tokenFor, INSPECTOR, 'post', `/orders/${orderId}/inspections`, { status, ...(findings && { findings }) });
}

/** Started, PASSED and completed by the buyer. */
export async function completedOrder(tokenFor: TokenFor, jobId = BRACKETS, workshopId = PRECISION) {
  const orderId = await startedOrder(tokenFor, jobId, workshopId);
  expect((await inspect(tokenFor, orderId, 'PASSED')).status).toBe(201);
  expect((await api(tokenFor, ASHA, 'post', `/orders/${orderId}/complete`)).status).toBe(200);
  return orderId;
}
