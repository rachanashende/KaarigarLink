import type { AuthUser } from '../types/express';
import { prisma } from '../utils/prisma';
import { ApiError } from '../utils/ApiError';

/**
 * Ensures the workshop exists and the caller may modify it
 * (its owner, or an ADMIN). Returns the workshop row.
 */
export async function assertCanManageWorkshop(user: AuthUser, workshopId: string) {
  const workshop = await prisma.workshop.findUnique({ where: { id: workshopId } });
  if (!workshop) throw ApiError.notFound('Workshop not found');
  if (user.role !== 'ADMIN' && workshop.userId !== user.id) {
    throw ApiError.forbidden('Only the workshop owner or an admin can modify this workshop');
  }
  return workshop;
}
