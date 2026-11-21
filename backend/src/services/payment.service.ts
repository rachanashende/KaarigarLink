import { prisma } from '../utils/prisma';
import { ApiError } from '../utils/ApiError';

export async function createPayment(
  userId: string,
  orderId: string,
  amount: number,
  description?: string,
) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
  });

  if (!order) throw ApiError.notFound('Order not found');

  if (order.buyerId !== userId) {
    throw ApiError.forbidden('Only the buyer can initiate payment');
  }

  if (order.status === 'CANCELLED') {
    throw ApiError.badRequest('Cannot pay for a cancelled order');
  }

  if (amount <= 0 || amount > Number(order.agreedPrice)) {
    throw ApiError.badRequest('Invalid payment amount');
  }

  return prisma.payment.create({
    data: {
      orderId,
      amount,
      currency: order.currency,
      description,
      status: 'PENDING',
    },
  });
}

export async function simulatePaymentResult(
  userId: string,
  paymentId: string,
  success: boolean,
) {
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { order: true },
  });

  if (!payment) throw ApiError.notFound('Payment not found');

  if (payment.order.buyerId !== userId) {
    throw ApiError.forbidden();
  }

  if (payment.status !== 'PENDING') {
    throw ApiError.badRequest('Only pending payments can be processed');
  }

  return prisma.payment.update({
    where: { id: paymentId },
    data: {
      status: success ? 'SUCCEEDED' : 'FAILED',
      transactionRef: `SIM-${payment.id}`,
      paidAt: success ? new Date() : null,
    },
  });
}

export async function listOrderPayments(userId: string, orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { workshop: { select: { userId: true } } },
  });

  if (!order) throw ApiError.notFound('Order not found');

  if (order.buyerId !== userId && order.workshop.userId !== userId) {
    throw ApiError.forbidden();
  }

  return prisma.payment.findMany({
    where: { orderId },
    orderBy: { createdAt: 'desc' },
  });
}