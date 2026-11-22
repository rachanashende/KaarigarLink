/**
 * Order payments (I5, B3) - SIMULATED. There is no payment gateway: the buyer
 * creates a PENDING payment and then reports a simulated outcome, which only
 * changes database state (transactionRef "SIM-<paymentId>"). No money moves.
 *
 * - Only the order's buyer creates payments and simulates results; the buyer
 *   and the awarded workshop can list them. Everyone else gets 404.
 * - New payments only on CONFIRMED / IN_PROGRESS orders.
 * - Cumulative limit: PENDING (reserved) + SUCCEEDED + new amount <= agreedPrice,
 *   computed in exact decimal arithmetic under the order lock, so concurrent
 *   creations cannot together exceed the price. FAILED and REFUNDED reserve nothing.
 * - A PENDING payment can become SUCCEEDED or FAILED once; repeating the same
 *   outcome returns 200 changed:false.
 *
 * Cancellation / refund policy (B3):
 * - Cancelling an order is always allowed. In the cancellation transaction every
 *   PENDING payment becomes FAILED (its reservation is released).
 * - SUCCEEDED payments are NOT changed by cancellation: the money is still owed
 *   back. Summaries show it as `refundDue` (= SUCCEEDED total on a CANCELLED order).
 * - A refund is an explicit, simulated operation (POST /payments/:id/refund) by
 *   ADMIN or the awarded WORKSHOP: SUCCEEDED -> REFUNDED on a CANCELLED order,
 *   recording refundedAt and refundedById. Nothing else ever sets REFUNDED.
 * - Payment records are never deleted.
 *
 * Writes lock job FOR SHARE -> order FOR UPDATE -> payment, the backend-wide order.
 */
import { Prisma, type OrderStatus, type PaymentStatus } from '@prisma/client';
import type { AuthUser } from '../types/express';
import { prisma } from '../utils/prisma';
import { ApiError } from '../utils/ApiError';
import { getMyWorkshopId } from './workshop.service';
import { findParticipantOrder, lockOrder, money, type Tx } from './orderAccess';
import { orderEvent } from './events';

const orderWorkshop = async (tx: Tx, orderId: string) => (await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: { workshopId: true } })).workshopId;
import type { CreatePaymentInput, SimulatePaymentInput } from '../validators/payment.validator';

const paymentNotFound = () => ApiError.notFound('Payment not found');

const paymentInclude = { refundedBy: { select: { id: true, name: true, role: true } } } satisfies Prisma.PaymentInclude;
type PaymentRow = Prisma.PaymentGetPayload<{ include: typeof paymentInclude }>;
const paymentView = ({ amount, ...rest }: PaymentRow) => ({ ...rest, amount: money(amount) });

const ZERO = new Prisma.Decimal(0);

interface Totals {
  pending: Prisma.Decimal;
  succeeded: Prisma.Decimal;
  refunded: Prisma.Decimal;
}

async function totals(db: Tx | typeof prisma, orderId: string): Promise<Totals> {
  const sums = await db.payment.groupBy({
    by: ['status'],
    where: { orderId, status: { in: ['PENDING', 'SUCCEEDED', 'REFUNDED'] } },
    _sum: { amount: true },
  });
  const sum = (s: PaymentStatus) => sums.find((r) => r.status === s)?._sum.amount ?? ZERO;
  return { pending: sum('PENDING'), succeeded: sum('SUCCEEDED'), refunded: sum('REFUNDED') };
}

function summaryView(agreedPrice: Prisma.Decimal, orderStatus: OrderStatus, t: Totals) {
  return {
    agreedPrice: money(agreedPrice),
    /** SUCCEEDED and not refunded. */
    paid: money(t.succeeded),
    pending: money(t.pending),
    /** What can still be requested: agreedPrice - paid - pending. */
    remaining: money(agreedPrice.minus(t.succeeded).minus(t.pending)),
    refunded: money(t.refunded),
    /** Money still owed back to the buyer: SUCCEEDED payments of a CANCELLED order. */
    refundDue: money(orderStatus === 'CANCELLED' ? t.succeeded : ZERO),
    simulated: true,
  };
}

/** Summary inside a transaction that already holds the order lock (used by order cancellation). */
export async function paymentSummary(tx: Tx, orderId: string, agreedPrice: Prisma.Decimal, orderStatus: OrderStatus) {
  return summaryView(agreedPrice, orderStatus, await totals(tx, orderId));
}

/**
 * Called by order cancellation, inside its transaction (job and order already locked):
 * PENDING payments -> FAILED, releasing their reservations. SUCCEEDED ones are kept.
 */
export async function failPendingPayments(tx: Tx, orderId: string) {
  const { count } = await tx.payment.updateMany({ where: { orderId, status: 'PENDING' }, data: { status: 'FAILED' } });
  return count;
}

export async function createPayment(user: AuthUser, orderId: string, input: CreatePaymentInput) {
  if (user.role !== 'BUYER') throw ApiError.forbidden();
  const ref = await findParticipantOrder(user, orderId);
  const amount = new Prisma.Decimal(input.amount);

  return prisma.$transaction(async (tx) => {
    const order = await lockOrder(tx, ref);
    if (order.status !== 'CONFIRMED' && order.status !== 'IN_PROGRESS') {
      throw ApiError.conflict(`Cannot add a payment to an order that is ${order.status}`);
    }
    const t = await totals(tx, ref.id);
    const remaining = order.agreedPrice.minus(t.succeeded).minus(t.pending);
    if (amount.gt(remaining)) {
      throw ApiError.conflict(
        `Payment of ${money(amount)} exceeds the remaining payable amount of ${money(remaining)} ` +
          `(agreed ${money(order.agreedPrice)}, paid ${money(t.succeeded)}, pending ${money(t.pending)})`,
      );
    }
    const payment = await tx.payment.create({
      data: { orderId: ref.id, amount, currency: order.currency, description: input.description, status: 'PENDING' },
      include: paymentInclude,
    });
    await orderEvent(tx, user, ref, 'PAYMENT_CREATED', { title: 'Payment initiated', body: 'A payment of ' + money(amount) + ' was created (simulated).' }, {
      entityType: 'Payment', entityId: payment.id, metadata: { amount: money(amount) }, to: ['workshop'],
    });
    return { payment: paymentView(payment), summary: summaryView(order.agreedPrice, order.status, { ...t, pending: t.pending.plus(amount) }) };
  });
}

/** Locks the payment row (after the order lock) and returns its status. */
async function lockPayment(tx: Tx, paymentId: string) {
  const rows = await tx.$queryRaw<{ status: PaymentStatus }[]>`
    SELECT "status" FROM "Payment" WHERE "id" = ${paymentId} FOR UPDATE`;
  if (!rows[0]) throw paymentNotFound();
  return rows[0].status;
}

async function result(tx: Tx, paymentId: string, orderId: string, order: { agreedPrice: Prisma.Decimal; status: OrderStatus }, changed: boolean) {
  const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId }, include: paymentInclude });
  return { changed, payment: paymentView(payment), summary: summaryView(order.agreedPrice, order.status, await totals(tx, orderId)) };
}

export async function simulatePaymentResult(user: AuthUser, paymentId: string, input: SimulatePaymentInput) {
  if (user.role !== 'BUYER') throw ApiError.forbidden();
  const found = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: { id: true, order: { select: { id: true, jobId: true, buyerId: true } } },
  });
  if (!found || found.order.buyerId !== user.id) throw paymentNotFound();

  return prisma.$transaction(async (tx) => {
    const order = await lockOrder(tx, found.order);
    const current = await lockPayment(tx, paymentId);

    if (current === input.outcome) return result(tx, paymentId, found.order.id, order, false);
    if (current !== 'PENDING') {
      throw ApiError.conflict(`Only PENDING payments can be processed (this payment is ${current})`);
    }
    // Unreachable through the API since B3 (cancellation fails PENDING payments), kept as a guard.
    if (input.outcome === 'SUCCEEDED' && order.status === 'CANCELLED') {
      throw ApiError.conflict('The order is CANCELLED; this payment can only be marked FAILED');
    }

    const { count } = await tx.payment.updateMany({
      where: { id: paymentId, status: 'PENDING' },
      data: {
        status: input.outcome,
        transactionRef: `SIM-${paymentId}`,
        paidAt: input.outcome === 'SUCCEEDED' ? new Date() : null,
      },
    });
    if (count !== 1) throw ApiError.conflict('Payment was modified, please retry');
    await orderEvent(tx, user, { ...found.order, workshopId: await orderWorkshop(tx, found.order.id) }, 'PAYMENT_' + input.outcome, {
      title: input.outcome === 'SUCCEEDED' ? 'Payment received (simulated)' : 'Payment failed (simulated)', body: 'A payment on your order was marked ' + input.outcome.toLowerCase() + '.',
    }, { entityType: 'Payment', entityId: paymentId, metadata: { outcome: input.outcome }, to: ['workshop'] });
    return result(tx, paymentId, found.order.id, order, true);
  });
}

/**
 * B3: explicit simulated refund. ADMIN, or the awarded WORKSHOP, confirms that a
 * SUCCEEDED payment of a CANCELLED order was returned to the buyer.
 */
export async function refundPayment(user: AuthUser, paymentId: string) {
  if (user.role !== 'ADMIN' && user.role !== 'WORKSHOP') throw ApiError.forbidden();
  const found = await prisma.payment.findUnique({
    where: { id: paymentId },
    select: { id: true, order: { select: { id: true, jobId: true, workshopId: true } } },
  });
  if (!found) throw paymentNotFound();
  if (user.role === 'WORKSHOP' && found.order.workshopId !== (await getMyWorkshopId(user))) throw paymentNotFound();

  return prisma.$transaction(async (tx) => {
    const order = await lockOrder(tx, found.order);
    const current = await lockPayment(tx, paymentId);

    if (current === 'REFUNDED') return result(tx, paymentId, found.order.id, order, false);
    if (current !== 'SUCCEEDED') {
      throw ApiError.conflict(`Only SUCCEEDED payments can be refunded (this payment is ${current})`);
    }
    if (order.status !== 'CANCELLED') {
      throw ApiError.conflict(`Refunds are only for CANCELLED orders (this order is ${order.status})`);
    }

    const { count } = await tx.payment.updateMany({
      where: { id: paymentId, status: 'SUCCEEDED' },
      data: { status: 'REFUNDED', refundedAt: new Date(), refundedById: user.id },
    });
    if (count !== 1) throw ApiError.conflict('Payment was modified, please retry');
    const buyerId = (await tx.order.findUniqueOrThrow({ where: { id: found.order.id }, select: { buyerId: true } })).buyerId;
    await orderEvent(tx, user, { ...found.order, buyerId }, 'PAYMENT_REFUNDED', { title: 'Refund recorded (simulated)', body: 'A payment on your cancelled order was marked refunded.' }, {
      entityType: 'Payment', entityId: paymentId, to: ['buyer', 'workshop'],
    });
    return result(tx, paymentId, found.order.id, order, true);
  });
}

export async function listOrderPayments(user: AuthUser, orderId: string) {
  const ref = await findParticipantOrder(user, orderId);
  const order = await prisma.order.findUniqueOrThrow({ where: { id: ref.id }, select: { agreedPrice: true, status: true } });
  const payments = await prisma.payment.findMany({
    where: { orderId: ref.id },
    include: paymentInclude,
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
  });
  return {
    payments: payments.map(paymentView),
    summary: summaryView(order.agreedPrice, order.status, await totals(prisma, ref.id)),
  };
}
