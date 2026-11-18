import type { Prisma } from '@prisma/client';
import type { AuthUser } from '../types/express';
import { prisma } from '../utils/prisma';
import { ApiError } from '../utils/ApiError';
import { assertCanManageWorkshop } from './workshopAccess';
import type { CreateMachineInput, UpdateMachineInput } from '../validators/workshop.validator';

async function findMachineOrThrow(workshopId: string, machineId: string) {
  const machine = await prisma.machine.findFirst({ where: { id: machineId, workshopId } });
  if (!machine) throw ApiError.notFound('Machine not found for this workshop');
  return machine;
}

export async function listMachines(workshopId: string) {
  const exists = await prisma.workshop.count({ where: { id: workshopId } });
  if (!exists) throw ApiError.notFound('Workshop not found');
  return prisma.machine.findMany({ where: { workshopId }, orderBy: { createdAt: 'asc' } });
}

export async function createMachine(user: AuthUser, workshopId: string, input: CreateMachineInput) {
  await assertCanManageWorkshop(user, workshopId);
  return prisma.machine.create({
    data: {
      workshopId,
      machineName: input.machineName,
      machineType: input.machineType,
      specifications: input.specifications as Prisma.InputJsonValue | undefined,
      quantity: input.quantity,
      operationalStatus: input.operationalStatus,
    },
  });
}

export async function updateMachine(user: AuthUser, workshopId: string, machineId: string, input: UpdateMachineInput) {
  await assertCanManageWorkshop(user, workshopId);
  await findMachineOrThrow(workshopId, machineId);

  const { specifications, ...rest } = input;
  return prisma.machine.update({
    where: { id: machineId },
    data: {
      ...rest,
      ...(specifications !== undefined && {
        specifications: (specifications ?? undefined) as Prisma.InputJsonValue | undefined,
      }),
    },
  });
}

export async function deleteMachine(user: AuthUser, workshopId: string, machineId: string) {
  await assertCanManageWorkshop(user, workshopId);
  await findMachineOrThrow(workshopId, machineId);
  await prisma.machine.delete({ where: { id: machineId } });
}
