import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { prisma } from '../helpers/db';
import { seededSession } from '../helpers/seedSession';
import {
  ADMIN,
  ASHA,
  INSPECTOR,
  MUMBAI,
  PRECISION,
  VIKRAM,
  api,
  awardedOrder,
  completedOrder,
  owner,
  startedOrder,
  type TokenFor,
} from '../helpers/orderFlow';

let tokenFor: TokenFor;
const WS = owner(PRECISION);

beforeEach(async () => {
  tokenFor = await seededSession();
});

afterAll(async () => {
  await prisma.$disconnect();
});

// Agreed price of every test order: 12500.50
const pay = (orderId: string, amount: unknown, as = ASHA, extra: Record<string, unknown> = {}) =>
  api(tokenFor, as, 'post', `/orders/${orderId}/payments`, { amount, ...extra });
const simulate = (paymentId: string, outcome: unknown, as = ASHA) =>
  api(tokenFor, as, 'post', `/payments/${paymentId}/simulate`, { outcome });
const list = (orderId: string, as = ASHA) => api(tokenFor, as, 'get', `/orders/${orderId}/payments`);

describe('create', () => {
  it('the buyer creates a PENDING payment; money is a 2-decimal string; the summary reserves it', async () => {
    const orderId = await awardedOrder(tokenFor);
    const res = await pay(orderId, '5000', ASHA, { description: 'Advance' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      success: true,
      message: 'Payment created (PENDING, simulated)',
      data: {
        payment: { orderId, amount: '5000.00', status: 'PENDING', currency: 'INR', description: 'Advance', transactionRef: null, paidAt: null },
        summary: { agreedPrice: '12500.50', paid: '0.00', pending: '5000.00', remaining: '7500.50', simulated: true },
      },
    });
  });

  it('cumulative limit: PENDING + SUCCEEDED + new amount may equal but never exceed agreedPrice', async () => {
    const orderId = await startedOrder(tokenFor);
    const a = await pay(orderId, 10000);
    await simulate(a.body.data.payment.id, 'SUCCEEDED');
    expect((await pay(orderId, '2000.25')).status).toBe(201); // pending reservation
    const over = await pay(orderId, '500.26');
    expect(over.status).toBe(409);
    expect(over.body).toEqual({
      success: false,
      message:
        'Payment of 500.26 exceeds the remaining payable amount of 500.25 (agreed 12500.50, paid 10000.00, pending 2000.25)',
    });
    const exact = await pay(orderId, '500.25');
    expect(exact.status).toBe(201);
    expect(exact.body.data.summary.remaining).toBe('0.00');
    expect((await pay(orderId, '0.01')).status).toBe(409);
  });

  it('a FAILED payment releases its reservation', async () => {
    const orderId = await awardedOrder(tokenFor);
    const full = await pay(orderId, '12500.50');
    expect((await pay(orderId, 1)).status).toBe(409);
    await simulate(full.body.data.payment.id, 'FAILED');
    expect((await pay(orderId, '12500.50')).status).toBe(201);
  });

  it.each(['COMPLETED', 'CANCELLED'] as const)('no new payments on a %s order (409)', async (status) => {
    const orderId = status === 'COMPLETED' ? await completedOrder(tokenFor) : await awardedOrder(tokenFor);
    if (status === 'CANCELLED') await api(tokenFor, ASHA, 'post', `/orders/${orderId}/cancel`, { reason: 'Not needed' });
    const res = await pay(orderId, 100);
    expect(res.status).toBe(409);
    expect(res.body.message).toBe(`Cannot add a payment to an order that is ${status}`);
    expect(await prisma.payment.count({ where: { orderId } })).toBe(0);
  });

  it.each([
    ['zero', 0],
    ['negative', -5],
    ['3 decimals', '10.001'],
    ['11 integer digits', '12345678901'],
    ['not a number', 'ten'],
    ['boolean', true],
  ])('validation: amount %s -> 400', async (_name, amount) => {
    const orderId = await awardedOrder(tokenFor);
    expect((await pay(orderId, amount)).status).toBe(400);
  });

  it('validation: missing amount, unknown field (status) and long description -> 400', async () => {
    const orderId = await awardedOrder(tokenFor);
    expect((await api(tokenFor, ASHA, 'post', `/orders/${orderId}/payments`, {})).status).toBe(400);
    expect((await pay(orderId, 10, ASHA, { status: 'SUCCEEDED' })).status).toBe(400);
    expect((await pay(orderId, 10, ASHA, { description: 'x'.repeat(501) })).status).toBe(400);
  });

  it('permissions: workshop/inspector/admin 403; another buyer 404; no token 401', async () => {
    const orderId = await awardedOrder(tokenFor);
    for (const as of [WS, INSPECTOR, ADMIN]) expect((await pay(orderId, 10, as)).status).toBe(403);
    const other = await pay(orderId, 10, VIKRAM);
    expect(other.status).toBe(404);
    expect(other.body.message).toBe('Order not found');
    expect((await request(app).post(`/api/orders/${orderId}/payments`).send({ amount: 10 })).status).toBe(401);
    expect(await prisma.payment.count()).toBe(0);
  });
});

describe('simulate result (mock gateway)', () => {
  it('SUCCEEDED sets transactionRef SIM-<id> and paidAt; a repeat is 200 changed:false', async () => {
    const orderId = await awardedOrder(tokenFor);
    const id = (await pay(orderId, 100)).body.data.payment.id;
    const res = await simulate(id, 'SUCCEEDED');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      message: 'Simulated payment result recorded: SUCCEEDED',
      data: { changed: true, payment: { status: 'SUCCEEDED', transactionRef: `SIM-${id}`, amount: '100.00' }, summary: { paid: '100.00', pending: '0.00' } },
    });
    expect(res.body.data.payment.paidAt).not.toBeNull();
    const before = await prisma.payment.findUniqueOrThrow({ where: { id } });
    const again = await simulate(id, 'SUCCEEDED');
    expect(again.body).toMatchObject({ message: 'Payment already SUCCEEDED', data: { changed: false } });
    expect(await prisma.payment.findUniqueOrThrow({ where: { id } })).toEqual(before);
  });

  it('FAILED leaves paidAt null; a processed payment cannot change outcome (409)', async () => {
    const orderId = await awardedOrder(tokenFor);
    const id = (await pay(orderId, 100)).body.data.payment.id;
    const res = await simulate(id, 'FAILED');
    expect(res.body.data.payment).toMatchObject({ status: 'FAILED', paidAt: null, transactionRef: `SIM-${id}` });
    const flip = await simulate(id, 'SUCCEEDED');
    expect(flip.status).toBe(409);
    expect(flip.body.message).toBe('Only PENDING payments can be processed (this payment is FAILED)');
  });

  it('B3: cancellation fails a pending payment; it can no longer succeed', async () => {
    const orderId = await awardedOrder(tokenFor);
    const id = (await pay(orderId, 100)).body.data.payment.id;
    await api(tokenFor, ASHA, 'post', `/orders/${orderId}/cancel`, { reason: 'Not needed' });
    const res = await simulate(id, 'SUCCEEDED');
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Only PENDING payments can be processed (this payment is FAILED)');
    const again = await simulate(id, 'FAILED');
    expect(again.status).toBe(200);
    expect(again.body.data.changed).toBe(false);
  });

  it('validation and access: bad outcome 400; workshop 403; another buyer and unknown payment 404', async () => {
    const orderId = await awardedOrder(tokenFor);
    const id = (await pay(orderId, 100)).body.data.payment.id;
    expect((await simulate(id, 'REFUNDED')).status).toBe(400);
    expect((await api(tokenFor, ASHA, 'post', `/payments/${id}/simulate`, {})).status).toBe(400);
    expect((await simulate(id, 'SUCCEEDED', WS)).status).toBe(403);
    const other = await simulate(id, 'SUCCEEDED', VIKRAM);
    expect(other.status).toBe(404);
    expect(other.body.message).toBe('Payment not found');
    expect((await simulate('no-such-payment', 'SUCCEEDED')).status).toBe(404);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id } })).status).toBe('PENDING');
  });
});

describe('list', () => {
  it('buyer and awarded workshop see payments newest first with the summary; others 404 / 403', async () => {
    const orderId = await awardedOrder(tokenFor);
    const first = (await pay(orderId, 100)).body.data.payment.id;
    await simulate(first, 'SUCCEEDED');
    await pay(orderId, '50.50');
    for (const as of [ASHA, WS]) {
      const res = await list(orderId, as);
      expect(res.status).toBe(200);
      expect(res.body.data.payments.map((p: { amount: string }) => p.amount)).toEqual(['50.50', '100.00']);
      expect(res.body.data.summary).toEqual({
        agreedPrice: '12500.50',
        paid: '100.00',
        pending: '50.50',
        remaining: '12350.00',
        refunded: '0.00',
        refundDue: '0.00',
        simulated: true,
      });
    }
    expect((await list(orderId, VIKRAM)).status).toBe(404);
    expect((await list(orderId, owner(MUMBAI))).status).toBe(404);
    expect((await list(orderId, INSPECTOR)).status).toBe(403);
  });
});
