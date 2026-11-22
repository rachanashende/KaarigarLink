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
    select: { id: true, email: true, role: true, tokenVersion: true },
  });
  if (!user) throw ApiError.unauthorized('User no longer exists');
  // M13: a password change increments tokenVersion, so every earlier token is rejected
  // immediately (tokens from before M13 carry no version and count as 0).
  if ((payload.tv ?? 0) !== user.tokenVersion) {
    throw ApiError.unauthorized('Session expired after a password change');
  }

  req.user = { id: user.id, email: user.email, role: user.role };
  next();
};
