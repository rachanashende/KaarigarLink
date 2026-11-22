/**
 * Order payments (I5) - SIMULATED. There is no payment gateway: the buyer
 * creates a PENDING payment and then reports a simulated outcome, which only
 * changes database state (transactionRef "SIM-<paymentId>"). No money moves.
 *
 * - Only the order's buyer creates payments and simulates results; the buyer
 *   and the awarded workshop can list them. Everyone else gets 404.
 * - New payments only on CONFIRMED / IN_PROGRESS orders.
 * - Cumulative limit: PENDING (reserved) + SUCCEEDED + new amount <= agreedPrice,
 *   computed in exact decimal arithmetic under the order lock, so concurrent
 *   creations cannot together exceed the price.
 * - A PENDING payment can become SUCCEEDED or FAILED once; repeating the same
 *   outcome returns 200 changed:false. It cannot succeed once the order is
 *   CANCELLED (it can still be marked FAILED, which releases the reservation).
 *
 * Writes lock job FOR SHARE -> order FOR UPDATE -> payment, the backend-wide order.
 */
import { Prisma, type PaymentStatus } from '@prisma/client';
import type { AuthUser } from '../types/express';
import { prisma } from '../utils/prisma';
import { ApiError } from '../utils/ApiError';
import { findParticipantOrder, lockOrder, money, type Tx } from './orderAccess';
import type { CreatePaymentInput, SimulatePaymentInput } from '../validators/payment.validator';

const paymentNotFound = () => ApiError.notFound('Payment not found');

type PaymentRow = Prisma.PaymentGetPayload<object>;
const paymentView = ({ amount, ...rest }: PaymentRow) => ({ ...rest, amount: money(amount) });

const ZERO = new Prisma.Decimal(0);

async function totals(db: Tx | typeof prisma, orderId: string) {
  const sums = await db.payment.groupBy({
    by: ['status'],
    where: { orderId, status: { in: ['PENDING', 'SUCCEEDED'] } },
    _sum: { amount: true },
  });
  const sum = (s: PaymentStatus) => sums.find((r) => r.status === s)?._sum.amount ?? ZERO;
  return { pending: sum('PENDING'), succeeded: sum('SUCCEEDED') };
}

function summaryView(agreedPrice: Prisma.Decimal, t: { pending: Prisma.Decimal; succeeded: Prisma.Decimal }) {
  return {
    agreedPrice: money(agreedPrice),
    paid: money(t.succeeded),
    pending: money(t.pending),
    /** What can still be requested: agreedPrice - paid - pending. */
    remaining: money(agreedPrice.minus(t.succeeded).minus(t.pending)),
    simulated: true,
  };
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
    });
    const after = { pending: t.pending.plus(amount), succeeded: t.succeeded };
    return { payment: paymentView(payment), summary: summaryView(order.agreedPrice, after) };
  });
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
    const rows = await tx.$queryRaw<{ status: PaymentStatus }[]>`
      SELECT "status" FROM "Payment" WHERE "id" = ${paymentId} FOR UPDATE`;
    const current = rows[0];
    if (!current) throw paymentNotFound();

    if (current.status === input.outcome) {
      const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
      return { changed: false, payment: paymentView(payment), summary: summaryView(order.agreedPrice, await totals(tx, found.order.id)) };
    }
    if (current.status !== 'PENDING') {
      throw ApiError.conflict(`Only PENDING payments can be processed (this payment is ${current.status})`);
    }
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
    const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
    return { changed: true, payment: paymentView(payment), summary: summaryView(order.agreedPrice, await totals(tx, found.order.id)) };
  });
}

export async function listOrderPayments(user: AuthUser, orderId: string) {
  const ref = await findParticipantOrder(user, orderId);
  const order = await prisma.order.findUniqueOrThrow({ where: { id: ref.id }, select: { agreedPrice: true } });
  const payments = await prisma.payment.findMany({
    where: { orderId: ref.id },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
  });
  return { payments: payments.map(paymentView), summary: summaryView(order.agreedPrice, await totals(prisma, ref.id)) };
}
