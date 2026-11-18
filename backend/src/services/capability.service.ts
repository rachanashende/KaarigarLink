import type { Prisma } from '@prisma/client';
import type { AuthUser } from '../types/express';
import { prisma } from '../utils/prisma';
import { ApiError } from '../utils/ApiError';
import { normalizeMaterials } from '../utils/normalize';
import { assertCanManageWorkshop } from './workshopAccess';
import type { CreateCapabilityInput, UpdateCapabilityInput } from '../validators/workshop.validator';

async function findCapabilityOrThrow(workshopId: string, capabilityId: string) {
  const cap = await prisma.capability.findFirst({ where: { id: capabilityId, workshopId } });
  if (!cap) throw ApiError.notFound('Capability not found for this workshop');
  return cap;
}

export async function listCapabilities(workshopId: string) {
  const exists = await prisma.workshop.count({ where: { id: workshopId } });
  if (!exists) throw ApiError.notFound('Workshop not found');
  return prisma.capability.findMany({ where: { workshopId }, orderBy: { manufacturingProcess: 'asc' } });
}

export async function createCapability(user: AuthUser, workshopId: string, input: CreateCapabilityInput) {
  await assertCanManageWorkshop(user, workshopId);

  const duplicate = await prisma.capability.findUnique({
    where: { workshopId_manufacturingProcess: { workshopId, manufacturingProcess: input.manufacturingProcess } },
    select: { id: true },
  });
  if (duplicate) {
    throw ApiError.conflict(
      `Workshop already has a ${input.manufacturingProcess} capability - update it instead (id: ${duplicate.id})`,
    );
  }

  return prisma.capability.create({
    data: {
      workshopId,
      manufacturingProcess: input.manufacturingProcess,
      supportedMaterials: normalizeMaterials(input.supportedMaterials),
      specifications: input.specifications as Prisma.InputJsonValue | undefined,
      leadTimeDays: input.leadTimeDays,
    },
  });
}

export async function updateCapability(
  user: AuthUser,
  workshopId: string,
  capabilityId: string,
  input: UpdateCapabilityInput,
) {
  await assertCanManageWorkshop(user, workshopId);
  await findCapabilityOrThrow(workshopId, capabilityId);

  return prisma.capability.update({
    where: { id: capabilityId },
    data: {
      ...(input.supportedMaterials && { supportedMaterials: normalizeMaterials(input.supportedMaterials) }),
      ...(input.leadTimeDays !== undefined && { leadTimeDays: input.leadTimeDays }),
      ...(input.specifications !== undefined && {
        specifications: (input.specifications ?? undefined) as Prisma.InputJsonValue | undefined,
      }),
    },
  });
}

export async function deleteCapability(user: AuthUser, workshopId: string, capabilityId: string) {
  await assertCanManageWorkshop(user, workshopId);
  await findCapabilityOrThrow(workshopId, capabilityId);
  await prisma.capability.delete({ where: { id: capabilityId } });
}
