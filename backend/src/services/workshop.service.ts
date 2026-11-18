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

type WorkshopRow = Awaited<ReturnType<typeof assertCanManageWorkshop>>;

/** Fields an admin checks when verifying a workshop. `description` is not one of them. */
const VERIFIED_FIELDS = ['businessName', 'address', 'city', 'latitude', 'longitude'] as const;

/**
 * True if the update actually changes a verified field. Values equal to the
 * current ones (e.g. a form re-submitting unchanged data) do not count.
 */
function changesVerifiedDetails(
  current: WorkshopRow,
  input: UpdateWorkshopInput,
  normalizedCertifications: string[] | undefined,
): boolean {
  const fieldChanged = VERIFIED_FIELDS.some(
    (field) => input[field] !== undefined && input[field] !== current[field],
  );
  const certificationsChanged =
    normalizedCertifications !== undefined &&
    [...normalizedCertifications].sort().join('|') !== [...current.certifications].sort().join('|');
  return fieldChanged || certificationsChanged;
}

export async function updateWorkshop(user: AuthUser, id: string, input: UpdateWorkshopInput) {
  const current = await assertCanManageWorkshop(user, id);

  if (input.verificationStatus !== undefined && user.role !== 'ADMIN') {
    throw ApiError.forbidden('Only an admin can change verification status');
  }

  const { certifications, ...rest } = input;
  const normalizedCertifications = certifications ? normalizeCertifications(certifications) : undefined;

  // A non-admin edit to verified details sends a VERIFIED workshop back to PENDING
  // for admin re-review. REJECTED stays REJECTED (an edit must not self-un-reject),
  // and admin edits keep the current status unless the admin sets it explicitly.
  const resetVerification =
    user.role !== 'ADMIN' &&
    current.verificationStatus === 'VERIFIED' &&
    changesVerifiedDetails(current, input, normalizedCertifications);

  return prisma.workshop.update({
    where: { id },
    data: {
      ...rest,
      ...(normalizedCertifications && { certifications: normalizedCertifications }),
      ...(resetVerification && { verificationStatus: 'PENDING' }),
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
