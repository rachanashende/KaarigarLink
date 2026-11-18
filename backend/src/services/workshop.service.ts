import { Prisma } from '@prisma/client';
import type { AuthUser } from '../types/express';
import { prisma } from '../utils/prisma';
import { ApiError } from '../utils/ApiError';
import { normalizeCertifications } from '../utils/normalize';
import { assertCanManageWorkshop } from './workshopAccess';
import type { CreateWorkshopInput, ListWorkshopsQuery, UpdateWorkshopInput } from '../validators/workshop.validator';

/** Full workshop view: profile + machines + capabilities + capacity windows. */
export const workshopDetailInclude = {
  user: { select: { id: true, name: true } },
  machines: { orderBy: { createdAt: 'asc' } },
  capabilities: { orderBy: { manufacturingProcess: 'asc' } },
  capacities: { orderBy: { startDate: 'asc' } },
} satisfies Prisma.WorkshopInclude;

export async function createWorkshop(user: AuthUser, input: CreateWorkshopInput) {
  const existing = await prisma.workshop.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (existing) throw ApiError.conflict('This user already has a workshop profile');

  return prisma.workshop.create({
    data: {
      userId: user.id,
      businessName: input.businessName,
      description: input.description,
      address: input.address,
      city: input.city,
      latitude: input.latitude,
      longitude: input.longitude,
      certifications: normalizeCertifications(input.certifications ?? []),
    },
    include: workshopDetailInclude,
  });
}

export async function getWorkshopById(id: string) {
  const workshop = await prisma.workshop.findUnique({ where: { id }, include: workshopDetailInclude });
  if (!workshop) throw ApiError.notFound('Workshop not found');
  return workshop;
}

export async function getMyWorkshop(user: AuthUser) {
  const workshop = await prisma.workshop.findUnique({ where: { userId: user.id }, include: workshopDetailInclude });
  if (!workshop) throw ApiError.notFound('No workshop profile found for this user. Create one with POST /api/workshops');
  return workshop;
}

/** Returns the caller's workshop id (WORKSHOP role) or throws 404. */
export async function getMyWorkshopId(user: AuthUser): Promise<string> {
  const ws = await prisma.workshop.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!ws) throw ApiError.notFound('No workshop profile found for this user');
  return ws.id;
}

export async function updateWorkshop(user: AuthUser, id: string, input: UpdateWorkshopInput) {
  await assertCanManageWorkshop(user, id);

  if (input.verificationStatus !== undefined && user.role !== 'ADMIN') {
    throw ApiError.forbidden('Only an admin can change verification status');
  }

  const { certifications, ...rest } = input;
  return prisma.workshop.update({
    where: { id },
    data: {
      ...rest,
      ...(certifications && { certifications: normalizeCertifications(certifications) }),
    },
    include: workshopDetailInclude,
  });
}

export async function listWorkshops(query: ListWorkshopsQuery) {
  const where: Prisma.WorkshopWhereInput = {
    ...(query.city && { city: { equals: query.city, mode: 'insensitive' } }),
    ...(query.verificationStatus && { verificationStatus: query.verificationStatus }),
    ...(query.process && { capabilities: { some: { manufacturingProcess: query.process } } }),
  };

  const [total, items] = await prisma.$transaction([
    prisma.workshop.count({ where }),
    prisma.workshop.findMany({
      where,
      orderBy: [{ rating: 'desc' }, { businessName: 'asc' }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      include: {
        capabilities: { select: { manufacturingProcess: true, supportedMaterials: true } },
        _count: { select: { machines: true } },
      },
    }),
  ]);

  return {
    items,
    pagination: { page: query.page, limit: query.limit, total, totalPages: Math.ceil(total / query.limit) },
  };
}
