import type { RequestHandler } from 'express';
import { prisma } from '../utils/prisma';
import { ApiError } from '../utils/ApiError';
import { verifyToken } from '../utils/jwt';

/**
 * Requires a valid `Authorization: Bearer <token>` header. Also confirms the
 * user still exists, so tokens of deleted users stop working immediately.
 */
export const authenticate: RequestHandler = async (req, _res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw ApiError.unauthorized('Authentication token missing');
  }

  const payload = verifyToken(header.slice('Bearer '.length).trim());

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, email: true, role: true },
  });
  if (!user) throw ApiError.unauthorized('User no longer exists');

  req.user = user;
  next();
};
