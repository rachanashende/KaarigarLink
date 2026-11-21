
import { prisma } from '../utils/prisma';
import { ApiError } from '../utils/ApiError';

export async function createInspection(
  inspectorId: string,
  orderId: string,
  input: {
    status: 'PASSED' | 'FAILED' | 'REWORK_REQUIRED';
    findings?: string;
  },
) {
  const inspector = await prisma.user.findUnique({
    where: { id: inspectorId },
    select: { id: true, role: true },
  });

  if (!inspector || inspector.role !== 'INSPECTOR') {
    throw ApiError.forbidden('Only authorized inspectors can inspect orders');
  }

  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: orderId },
    });

    if (!order) throw ApiError.notFound('Order not found');

    if (!['CONFIRMED', 'IN_PROGRESS'].includes(order.status)) {
      throw ApiError.badRequest('This order is not available for inspection');
    }

    const inspection = await tx.inspection.create({
      data: {
        orderId,
        inspectorId,
        status: input.status,
        findings: input.findings,
      },
    });

    if (input.status === 'REWORK_REQUIRED') {
      const milestone = await tx.milestone.findFirst({
        where: {
          orderId,
          status: { in: ['IN_PROGRESS', 'COMPLETED'] },
        },
        orderBy: { sequence: 'desc' },
      });

      if (!milestone) {
        throw ApiError.badRequest(
          'No active or completed milestone is available for rework',
        );
      }

      await tx.milestone.update({
        where: { id: milestone.id },
        data: {
          status: 'REWORK_REQUIRED',
          completedAt: null,
          notes: input.findings ?? 'Rework requested after inspection',
        },
      });
    }

    return inspection;
  });
}

export async function getOrderInspections(
  userId: string,
  orderId: string,
) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      workshop: {
        select: { userId: true },
      },
    },
  });

  if (!order) throw ApiError.notFound('Order not found');

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });

  const isAuthorized =
    order.buyerId === userId ||
    order.workshop.userId === userId ||
    user?.role === 'INSPECTOR' ||
    user?.role === 'ADMIN';

  if (!isAuthorized) throw ApiError.forbidden();

  return prisma.inspection.findMany({
    where: { orderId },
    include: {
      inspector: {
        select: { id: true, name: true },
      },
    },
    orderBy: { inspectedAt: 'desc' },
  });
}
