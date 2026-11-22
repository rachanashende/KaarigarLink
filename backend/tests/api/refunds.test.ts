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
  api,
  awardedOrder,
  completedOrder,
  owner,
  startedOrder,
  type TokenFor,
} from '../helpers/orderFlow';

/** B3: cancellation with payments, and the explicit simulated refund. */
let tokenFor: TokenFor;
const WS = owner(PRECISION);

beforeEach(async () => {
  tokenFor = await seededSession();
});

afterAll(async () => {
  await prisma.$disconnect();
});

const pay = async (orderId: string, amount: string) => {
  const res = await api(tokenFor, ASHA, 'post', `/orders/${orderId}/payments`, { amount });
  expect(res.status).toBe(201);
  return res.body.data.payment.id as string;
};
const simulate = (id: string, outcome: 'SUCCEEDED' | 'FAILED') => api(tokenFor, ASHA, 'post', `/payments/${id}/simulate`, { outcome });
const paid = async (orderId: string, amount: string) => {
  const id = await pay(orderId, amount);
  expect((await simulate(id, 'SUCCEEDED')).status).toBe(200);
  return id;
};
const cancel = (orderId: string) => api(tokenFor, ASHA, 'post', `/orders/${orderId}/cancel`, { reason: 'Buyer changed plans' });
const refund = (id: string, as = ADMIN, body?: object) => api(tokenFor, as, 'post', `/payments/${id}/refund`, body);
const row = (id: string) => prisma.payment.findUniqueOrThrow({ where: { id } });

describe('cancellation with payments', () => {
  it('no payments: cancels normally; the summary is all zero', async () => {
    const orderId = await awardedOrder(tokenFor);
    const res = await cancel(orderId);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      changed: true,
      order: { status: 'CANCELLED' },
      payments: { paid: '0.00', pending: '0.00', refunded: '0.00', refundDue: '0.00', simulated: true },
    });
  });

  it('pending payments become FAILED (reservation released) and are kept', async () => {
    const orderId = await startedOrder(tokenFor);
    const a = await pay(orderId, '100');
    const b = await pay(orderId, '200.50');
    const res = await cancel(orderId);
    expect(res.body.data.payments).toMatchObject({ pending: '0.00', paid: '0.00', refundDue: '0.00' });
    expect((await row(a)).status).toBe('FAILED');
    expect((await row(b)).status).toBe('FAILED');
    expect(await prisma.payment.count({ where: { orderId } })).toBe(2);
  });

  it('succeeded payments are NOT refunded by cancellation; they are reported as refundDue', async () => {
    const orderId = await startedOrder(tokenFor);
    const ok = await paid(orderId, '5000');
    const pending = await pay(orderId, '1000');
    const failed = await pay(orderId, '50');
    await simulate(failed, 'FAILED');

    const res = await cancel(orderId);
    expect(res.status).toBe(200);
    expect(res.body.data.payments).toEqual({
      agreedPrice: '12500.50',
      paid: '5000.00',
      pending: '0.00',
      remaining: '7500.50',
      refunded: '0.00',
      refundDue: '5000.00',
      simulated: true,
    });
    expect(await row(ok)).toMatchObject({ status: 'SUCCEEDED', refundedAt: null, refundedById: null });
    expect((await row(pending)).status).toBe('FAILED');
    expect((await row(failed)).status).toBe('FAILED');

    // The same picture in the payment history, for buyer and workshop; a repeat cancel shows it too.
    for (const as of [ASHA, WS]) {
      expect((await api(tokenFor, as, 'get', `/orders/${orderId}/payments`)).body.data.summary.refundDue).toBe('5000.00');
    }
    const again = await cancel(orderId);
    expect(again.body.data).toMatchObject({ changed: false, payments: { refundDue: '5000.00' } });
  });

  it('if failing the pending payments breaks, the whole cancellation rolls back', async () => {
    const orderId = await startedOrder(tokenFor);
    const p = await pay(orderId, '100');
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION b3_fail_payment() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'injected failure'; END; $$ LANGUAGE plpgsql;`);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER b3_fail_payment BEFORE UPDATE ON "Payment"
      FOR EACH ROW WHEN (NEW."status" = 'FAILED') EXECUTE FUNCTION b3_fail_payment()`);
    try {
      expect((await cancel(orderId)).status).toBe(500);
    } finally {
      await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS b3_fail_payment ON "Payment"');
      await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS b3_fail_payment()');
    }
    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe('IN_PROGRESS');
    expect((await prisma.job.findUniqueOrThrow({ where: { id: 'seed-job-alu-brackets' } })).status).toBe('IN_PROGRESS');
    expect((await row(p)).status).toBe('PENDING');
    expect((await cancel(orderId)).status).toBe(200);
  });
});

describe('explicit refund', () => {
  it('ADMIN refunds a SUCCEEDED payment of a CANCELLED order; a repeat is changed:false', async () => {
    const orderId = await startedOrder(tokenFor);
    const id = await paid(orderId, '5000');
    await cancel(orderId);

    const res = await refund(id);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      message: 'Payment marked REFUNDED (simulated)',
      data: {
        changed: true,
        payment: { id, status: 'REFUNDED', amount: '5000.00', refundedById: ADMIN, refundedBy: { id: ADMIN, role: 'ADMIN' } },
        summary: { paid: '0.00', refunded: '5000.00', refundDue: '0.00' },
      },
    });
    expect(res.body.data.payment.refundedAt).not.toBeNull();
    const before = await row(id);
    const again = await refund(id);
    expect(again.body).toMatchObject({ message: 'Payment already REFUNDED', data: { changed: false } });
    expect(await row(id)).toEqual(before);
    expect(before.transactionRef).toBe(`SIM-${id}`); // history of the original payment is kept
  });

  it('the awarded WORKSHOP can refund; another workshop gets 404', async () => {
    const orderId = await startedOrder(tokenFor);
    const id = await paid(orderId, '100');
    await cancel(orderId);
    const other = await refund(id, owner(MUMBAI));
    expect(other.status).toBe(404);
    expect(other.body.message).toBe('Payment not found');
    const res = await refund(id, WS);
    expect(res.status).toBe(200);
    expect(res.body.data.payment).toMatchObject({ status: 'REFUNDED', refundedBy: { role: 'WORKSHOP' } });
  });

  it('buyer and inspector 403; unknown payment 404; any body 400; no token 401 - nothing changes', async () => {
    const orderId = await startedOrder(tokenFor);
    const id = await paid(orderId, '100');
    await cancel(orderId);
    expect((await refund(id, ASHA)).status).toBe(403);
    expect((await refund(id, INSPECTOR)).status).toBe(403);
    expect((await refund('no-such-payment')).status).toBe(404);
    expect((await refund(id, ADMIN, { amount: '50' })).status).toBe(400);
    expect((await request(app).post(`/api/payments/${id}/refund`)).status).toBe(401);
    expect((await row(id)).status).toBe('SUCCEEDED');
  });

  it.each(['CONFIRMED', 'IN_PROGRESS', 'COMPLETED'] as const)('no refund while the order is %s (409)', async (status) => {
    const orderId = status === 'CONFIRMED' ? await awardedOrder(tokenFor) : await startedOrder(tokenFor);
    const id = await paid(orderId, '100');
    if (status === 'COMPLETED') {
      await api(tokenFor, INSPECTOR, 'post', `/orders/${orderId}/inspections`, { status: 'PASSED' });
      expect((await api(tokenFor, ASHA, 'post', `/orders/${orderId}/complete`)).status).toBe(200);
    }
    const res = await refund(id);
    expect(res.status).toBe(409);
    expect(res.body.message).toBe(`Refunds are only for CANCELLED orders (this order is ${status})`);
    expect((await row(id)).status).toBe('SUCCEEDED');
  });

  it('only SUCCEEDED payments can be refunded; a REFUNDED payment cannot be re-simulated', async () => {
    const orderId = await startedOrder(tokenFor);
    const pending = await pay(orderId, '100');
    const ok = await paid(orderId, '200');
    await cancel(orderId); // pending -> FAILED
    const res = await refund(pending);
    expect(res.status).toBe(409);
    expect(res.body.message).toBe('Only SUCCEEDED payments can be refunded (this payment is FAILED)');
    await refund(ok);
    expect((await simulate(ok, 'SUCCEEDED')).status).toBe(409);
    expect((await simulate(ok, 'FAILED')).status).toBe(409);
    expect((await row(ok)).status).toBe('REFUNDED');
  });

  it('the database refuses REFUNDED without refund details, and refund details without REFUNDED', async () => {
    const orderId = await completedOrder(tokenFor);
    const p = await prisma.payment.create({ data: { orderId, amount: '10', status: 'SUCCEEDED' } });
    await expect(prisma.payment.update({ where: { id: p.id }, data: { status: 'REFUNDED' } })).rejects.toThrow(/Payment_refund_state_check/);
    await expect(
      prisma.payment.update({ where: { id: p.id }, data: { refundedAt: new Date(), refundedById: ADMIN } }),
    ).rejects.toThrow(/Payment_refund_state_check/);
  });
});

describe('concurrency', () => {
  it('parallel refunds of one payment (admin and workshop): exactly one changes it', async () => {
    const orderId = await startedOrder(tokenFor);
    const id = await paid(orderId, '100');
    await cancel(orderId);
    const results = await Promise.all([refund(id, ADMIN), refund(id, WS), refund(id, ADMIN)]);
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(results.filter((r) => r.body.data.changed)).toHaveLength(1);
  });

  it('payment creation racing cancellation (3 rounds): never a PENDING payment on a cancelled order', async () => {
    for (let round = 0; round < 3; round += 1) {
      tokenFor = await seededSession();
      const orderId = await startedOrder(tokenFor);
      const [rp, rc] = await Promise.all([api(tokenFor, ASHA, 'post', `/orders/${orderId}/payments`, { amount: '100' }), cancel(orderId)]);
      expect(rc.status).toBe(200);
      if (rp.status === 201) expect((await row(rp.body.data.payment.id)).status).toBe('FAILED');
      else expect(rp.body.message).toBe('Cannot add a payment to an order that is CANCELLED');
      expect(await prisma.payment.count({ where: { orderId, status: 'PENDING' } })).toBe(0);
    }
  });

  it('a success simulation racing cancellation (3 rounds): SUCCEEDED shows as refundDue, otherwise FAILED', async () => {
    for (let round = 0; round < 3; round += 1) {
      tokenFor = await seededSession();
      const orderId = await startedOrder(tokenFor);
      const id = await pay(orderId, '300');
      const [rs, rc] = await Promise.all([simulate(id, 'SUCCEEDED'), cancel(orderId)]);
      expect(rc.status).toBe(200);
      const status = (await row(id)).status;
      const summary = (await api(tokenFor, ASHA, 'get', `/orders/${orderId}/payments`)).body.data.summary;
      if (rs.status === 200) {
        expect(status).toBe('SUCCEEDED');
        expect(summary.refundDue).toBe('300.00');
      } else {
        expect(rs.status).toBe(409);
        expect(status).toBe('FAILED');
        expect(summary.refundDue).toBe('0.00');
      }
    }
  });
});
