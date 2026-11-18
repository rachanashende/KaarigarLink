import type { QuantityUnit } from '@prisma/client';
import type { AuthUser } from '../types/express';
import { prisma } from '../utils/prisma';
import { ApiError } from '../utils/ApiError';
import { assertCanManageWorkshop } from './workshopAccess';
import type { CreateCapacityInput, UpdateCapacityInput } from '../validators/workshop.validator';

async function findCapacityOrThrow(workshopId: string, capacityId: string) {
  const cap = await prisma.workshopCapacity.findFirst({ where: { id: capacityId, workshopId } });
  if (!cap) throw ApiError.notFound('Capacity window not found for this workshop');
  return cap;
}

/**
 * Capacity windows of the same unit must not overlap; otherwise the matching
 * engine would count the same free capacity twice.
 */
async function assertNoOverlap(
  workshopId: string,
  unit: QuantityUnit,
  startDate: Date,
  endDate: Date,
  excludeId?: string,
) {
  const clash = await prisma.workshopCapacity.findFirst({
    where: {
      workshopId,
      capacityUnit: unit,
      startDate: { lte: endDate },
      endDate: { gte: startDate },
      ...(excludeId && { id: { not: excludeId } }),
    },
  });
  if (clash) {
    throw ApiError.conflict(
      `Capacity window overlaps an existing window (${clash.startDate.toISOString()} - ${clash.endDate.toISOString()}). ` +
        'Update that window instead.',
    );
  }
}

export async function listCapacity(workshopId: string) {
  const exists = await prisma.workshop.count({ where: { id: workshopId } });
  if (!exists) throw ApiError.notFound('Workshop not found');
  return prisma.workshopCapacity.findMany({ where: { workshopId }, orderBy: { startDate: 'asc' } });
}

export async function createCapacity(user: AuthUser, workshopId: string, input: CreateCapacityInput) {
  await assertCanManageWorkshop(user, workshopId);
  await assertNoOverlap(workshopId, input.capacityUnit, input.startDate, input.endDate);
  return prisma.workshopCapacity.create({ data: { workshopId, ...input } });
}

export async function updateCapacity(
  user: AuthUser,
  workshopId: string,
  capacityId: string,
  input: UpdateCapacityInput,
) {
  await assertCanManageWorkshop(user, workshopId);
  const current = await findCapacityOrThrow(workshopId, capacityId);

  const startDate = input.startDate ?? current.startDate;
  const endDate = input.endDate ?? current.endDate;
  const unit = input.capacityUnit ?? current.capacityUnit;
  if (endDate < startDate) throw ApiError.badRequest('endDate must be on or after startDate');

  if (input.startDate || input.endDate || input.capacityUnit) {
    await assertNoOverlap(workshopId, unit, startDate, endDate, capacityId);
  }

  return prisma.workshopCapacity.update({ where: { id: capacityId }, data: input });
}

export async function deleteCapacity(user: AuthUser, workshopId: string, capacityId: string) {
  await assertCanManageWorkshop(user, workshopId);
  await findCapacityOrThrow(workshopId, capacityId);
  await prisma.workshopCapacity.delete({ where: { id: capacityId } });
}
